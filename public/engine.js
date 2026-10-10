// Browser inference for the fitted TF-IDF / latent semantic movie model.
export function ascii(value) {
  return String(value).normalize('NFKD').replace(/[^\x00-\x7F]/g, '').toLowerCase();
}

function normalized(vector) {
  const norm = Math.hypot(...vector);
  if (norm > 0) for (let k = 0; k < vector.length; k++) vector[k] /= norm;
  return vector;
}

export class MovieEngine {
  constructor(catalog, vocabulary, spec, embeddings, projection, features) {
    this.catalog = catalog;
    this.spec = spec;
    this.dimensions = spec.dimensions;
    this.embeddings = embeddings;
    this.projection = projection;
    this.features = features;
    this.vocabulary = vocabulary;
    this.terms = new Map(vocabulary.terms.map((term, i) => [term, i]));
    this.byId = new Map(catalog.map(movie => [movie.id, movie]));
    this.norms = new Float32Array(catalog.length);
    this.featureNorms = new Float32Array(catalog.length);
    if (embeddings.length !== catalog.length * this.dimensions || projection.length !== vocabulary.terms.length * this.dimensions) {
      throw new Error('Model files do not match the catalog. Please reload.');
    }
    if (!features || features.offsets.length !== catalog.length + 1 || features.indices.length !== features.values.length || features.offsets.at(-1) !== features.values.length) throw new Error('Movie features do not match the catalog. Please reload.');
    this.documents = catalog.map(movie => ascii([movie.title, movie.overview, ...movie.genres, ...movie.keywords, ...movie.cast, ...movie.directors].join(' ')));
    this.searchTitles = catalog.map(movie => ascii(`${movie.title} ${movie.originalTitle || ''}`));
    catalog.forEach((movie, i) => {
      let squared = 0;
      for (let k = 0; k < this.dimensions; k++) squared += embeddings[i * this.dimensions + k] ** 2;
      this.norms[i] = Math.sqrt(squared) || 1;
      let featureSquared = 0;
      for (let j = features.offsets[i]; j < features.offsets[i + 1]; j++) featureSquared += features.values[j] ** 2;
      this.featureNorms[i] = Math.sqrt(featureSquared) || 1;
    });
  }

  search(query, limit = 8) {
    const text = ascii(query).trim();
    if (text.length < 2) return [];
    const matches = [];
    this.catalog.forEach((movie, i) => {
      const title = this.searchTitles[i];
      if (title.includes(text)) {
        const exact = ascii(movie.title) === text ? 10 : title.startsWith(text) ? 4 : 1;
        matches.push({movie, score: exact + Math.log10((movie.votes || 0) + 1) * 0.1});
      }
    });
    return matches.sort((a, b) => b.score - a.score).slice(0, limit).map(x => x.movie);
  }

  project(text) {
    const frequencies = new Map();
    for (const token of ascii(text).match(/[a-z0-9]{2,}/g) || []) {
      const index = this.terms.get(token);
      if (index !== undefined) frequencies.set(index, (frequencies.get(index) || 0) + 1);
    }
    const vector = new Float32Array(this.dimensions);
    const weighted = [...frequencies].map(([index, frequency]) => [index, (1 + Math.log(frequency)) * this.vocabulary.idf[index]]);
    const tfidfNorm = Math.sqrt(weighted.reduce((sum, [, weight]) => sum + weight ** 2, 0)) || 1;
    for (const [index, weight] of weighted) {
      for (let k = 0; k < this.dimensions; k++) vector[k] += (weight / tfidfNorm) * this.projection[index * this.dimensions + k];
    }
    return {vector: normalized(vector), tokens: weighted.map(([index]) => this.vocabulary.terms[index]), features: weighted.map(([index, weight]) => [index, weight / tfidfNorm])};
  }

  similarity(index, vector) {
    let score = 0;
    for (let k = 0; k < this.dimensions; k++) score += this.embeddings[index * this.dimensions + k] * vector[k];
    return score / this.norms[index];
  }

  pairSimilarity(a, b) {
    let score = 0;
    for (let k = 0; k < this.dimensions; k++) score += this.embeddings[a * this.dimensions + k] * this.embeddings[b * this.dimensions + k];
    return score / (this.norms[a] * this.norms[b]);
  }

  recommend({prompt = '', favorites = [], disliked = [], genres = [], minYear = 1870, maxYear = 2100, maxRuntime = 360, minRating = 0, language = '', collection = '', limit = 12, exclude = []} = {}) {
    const seeds = favorites.map(id => this.byId.get(id)).filter(Boolean);
    const negative = disliked.map(id => this.byId.get(id)).filter(Boolean);
    const projected = this.project(`${prompt} ${genres.join(' ')} ${genres.join(' ')}`);
    const promptTokens = this.project(prompt).tokens;
    const vector = new Float32Array(this.dimensions);
    const hasText = projected.tokens.length > 0;
    if (hasText) for (let k = 0; k < this.dimensions; k++) vector[k] += projected.vector[k] * (seeds.length ? 0.55 : 1);
    for (const seed of seeds) {
      for (let k = 0; k < this.dimensions; k++) vector[k] += this.embeddings[seed.index * this.dimensions + k] / this.norms[seed.index] / seeds.length;
    }
    for (const seed of negative) {
      for (let k = 0; k < this.dimensions; k++) vector[k] -= 0.3 * this.embeddings[seed.index * this.dimensions + k] / this.norms[seed.index] / negative.length;
    }
    normalized(vector);
    const featureProfile = new Float32Array(this.vocabulary.terms.length);
    for (const [index, value] of projected.features) featureProfile[index] += value * (seeds.length ? 0.55 : 1);
    for (const [items, sign] of [[seeds, 1], [negative, -0.3]]) {
      for (const seed of items) {
        for (let j = this.features.offsets[seed.index]; j < this.features.offsets[seed.index + 1]; j++) {
          featureProfile[this.features.indices[j]] += sign * this.features.values[j] / this.featureNorms[seed.index] / items.length;
        }
      }
    }
    let featureLength = 0;
    for (const value of featureProfile) featureLength += value * value;
    featureLength = Math.sqrt(featureLength) || 1;
    for (let j = 0; j < featureProfile.length; j++) featureProfile[j] /= featureLength;
    const personalized = hasText || seeds.length > 0;
    const unknownPrompt = Boolean(prompt.trim()) && !hasText && !seeds.length;
    if (unknownPrompt) return {results: [], personalized: false, unknownPrompt: true, candidateCount: 0};
    const omitted = new Set([...favorites, ...disliked, ...exclude]);
    const candidates = [];
    this.catalog.forEach((movie, i) => {
      if (omitted.has(movie.id) || movie.year < Number(minYear) || movie.year > Number(maxYear) || movie.runtime > Number(maxRuntime)) return;
      if (!movie.runtime && Number(maxRuntime) < 360) return;
      if (collection === 'recent' && movie.year < 2024) return;
      if (collection === 'academy' && !movie.awards?.length) return;
      if (collection === 'best-picture' && !movie.awards?.some(award => award.category.toLowerCase() === 'best picture')) return;
      const provider = {hbo: 'HBO Max', netflix: 'Netflix', prime: 'Prime Video', disney: 'Disney+', hulu: 'Hulu'}[collection];
      if (provider && !movie.historicalPlatforms.includes(provider)) return;
      if ((movie.rating || 0) < Number(minRating) || (language && movie.language !== language)) return;
      if (genres.length && !genres.some(genre => movie.genres.includes(genre))) return;
      const semantic = personalized ? this.similarity(i, vector) : 0;
      let precise = 0;
      if (personalized) {
        for (let j = this.features.offsets[i]; j < this.features.offsets[i + 1]; j++) precise += featureProfile[this.features.indices[j]] * this.features.values[j];
        precise /= this.featureNorms[i];
      }
      const matchingTokens = promptTokens.filter(token => this.documents[i].includes(token));
      const lexical = promptTokens.length ? matchingTokens.length / promptTokens.length : 0;
      const votes = movie.votes || 0;
      const quality = (votes / (votes + 250) * (movie.rating || 6.5) + 250 / (votes + 250) * 6.5) / 10;
      const sharedDirector = seeds.some(seed => seed.directors.some(name => movie.directors.includes(name))) ? 0.055 : 0;
      const sharedActor = seeds.some(seed => seed.cast.some(name => movie.cast.includes(name))) ? 0.015 : 0;
      const score = personalized ? 0.48 * semantic + 0.28 * precise + 0.06 * lexical + 0.18 * quality + sharedDirector + sharedActor : quality + 0.015 * Math.log10(votes + 1);
      candidates.push({movie, score, semantic, matchingTokens});
    });
    candidates.sort((a, b) => b.score - a.score || a.movie.id.localeCompare(b.movie.id));
    const pool = candidates.slice(0, 100);
    const chosen = [];
    // A light MMR pass avoids filling the list with nearly identical stories.
    while (chosen.length < limit && pool.length) {
      let best = 0, bestScore = -Infinity;
      pool.forEach((item, i) => {
        const redundancy = chosen.length ? Math.max(...chosen.map(x => this.pairSimilarity(item.movie.index, x.movie.index))) : 0;
        const reranked = item.score - (personalized ? 0.055 : 0.01) * Math.max(0, redundancy);
        if (reranked > bestScore) { bestScore = reranked; best = i; }
      });
      chosen.push(pool.splice(best, 1)[0]);
    }
    return {
      results: chosen.map(item => ({...item, reasons: this.explain(item, seeds, genres)})),
      personalized, unknownPrompt: false, candidateCount: candidates.length,
    };
  }

  explain(item, seeds, genres) {
    const movie = item.movie;
    const reasons = [];
    for (const seed of seeds) {
      const director = movie.directors.find(name => seed.directors.includes(name));
      if (director) reasons.push(`Also directed by ${director}`);
      const actor = movie.cast.find(name => seed.cast.includes(name));
      if (actor) reasons.push(`Features ${actor}`);
    }
    const shared = movie.genres.filter(genre => genres.includes(genre) || seeds.some(seed => seed.genres.includes(genre)));
    if (shared.length) reasons.push(`${shared.slice(0, 2).join(' + ')} you enjoy`);
    if (item.matchingTokens.length) reasons.push(`Matches “${item.matchingTokens.slice(0, 3).join(', ')}”`);
    if (movie.awards?.length && reasons.length < 2) reasons.push('Academy Award winner');
    if (seeds.length && item.semantic > 0.25 && !reasons.length) reasons.push(`Related themes to ${seeds[0].title}`);
    if (!reasons.length) reasons.push(movie.rating ? `Highly rated by ${movie.ratingSource || 'source'} viewers` : 'A new story to explore');
    return [...new Set(reasons)].slice(0, 2);
  }
}

export async function gunzipResponse(response) {
  if (!response.ok) throw new Error(`Unable to load movie model (${response.status}). Please try again.`);
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  // Some hosting layers transparently decompress; avoid a second decompression.
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return buffer;
  if (!globalThis.DecompressionStream) throw new Error('This browser needs an update to load the model. Use a recent Chrome, Safari, Firefox or Edge.');
  return new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}
