import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {MovieEngine} from '../public/engine.js';

const json = async name => JSON.parse(await readFile(new URL(`../public/data/${name}`, import.meta.url), 'utf8'));
const zipped = async name => gunzipSync(await readFile(new URL(`../public/data/${name}`, import.meta.url)));
const typed = async (name, Type) => { const b = await zipped(name); return new Type(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const [catalogBuffer, vocabularyBuffer, spec, sources, embeddings, projection, indices, values, offsets] = await Promise.all([
  zipped('catalog.json.gz'), zipped('vocabulary.json.gz'), json('model.json'), json('sources.json'),
  typed('embeddings.i8.gz', Int8Array), typed('projection.f32.gz', Float32Array), typed('features.indices.u16.gz', Uint16Array), typed('features.values.u8.gz', Uint8Array), typed('features.offsets.u32.gz', Uint32Array),
]);
const catalog = JSON.parse(catalogBuffer.toString()), vocabulary = JSON.parse(vocabularyBuffer.toString());
const engine = new MovieEngine(catalog, vocabulary, spec, embeddings, projection, {indices, values, offsets});

test('published artifacts match their SHA-256 manifest', async () => {
  const manifest = await json('artifacts.json');
  for (const [name, expected] of Object.entries(manifest)) {
    const data = await readFile(new URL(`../public/data/${name}`, import.meta.url));
    assert.equal(data.length, expected.bytes, name);
    assert.equal(createHash('sha256').update(data).digest('hex'), expected.sha256, name);
  }
});

test('all fourteen real datasets contribute and retain creator/version attribution', () => {
  assert.equal(sources.length, 14);
  for (const source of sources) {
    assert.ok(source.statistics.moviesInModel > 0, source.id);
    assert.ok(source.author && source.license && source.archiveSha256 && source.version);
    assert.match(source.url, /^https:\/\/www\.kaggle\.com\/datasets\//);
    assert.ok(!source.files.some(file => /^(ratings|links)/.test(file.name)));
  }
});

test('catalog has unique IDs and title/year records with valid model indices', () => {
  assert.equal(catalog.length, 35000);
  assert.equal(new Set(catalog.map(movie => movie.id)).size, catalog.length);
  assert.equal(new Set(catalog.map(movie => `${movie.title}:${movie.year}`)).size, catalog.length);
  catalog.forEach((movie, i) => { assert.equal(movie.index, i); assert.ok(movie.genres.length); assert.ok(movie.runtime >= 40 || (!movie.runtime && movie.sources.includes('tmdb-2026'))); });
});

test('movie title search handles accents, exact matches and partial titles', () => {
  assert.equal(engine.search('Inception')[0].title, 'Inception');
  assert.ok(engine.search('amelie').some(movie => /Am.lie/.test(movie.title)));
  assert.ok(engine.search('interstell').some(movie => movie.id === 'tmdb-157336'));
});

test('favorite-driven recommendations are related and exclude input films', () => {
  const seed = 'tmdb-157336';
  const {results, personalized} = engine.recommend({favorites: [seed]});
  assert.equal(personalized, true);
  assert.equal(results.length, 12);
  assert.ok(results.every(result => result.movie.id !== seed));
  assert.ok(results.filter(result => result.movie.genres.includes('Science Fiction')).length >= 9);
  assert.ok(results.every(result => result.reasons.length > 0 && Number.isFinite(result.score)));
});

test('written input changes the ranking and selects related themes', () => {
  const space = engine.recommend({prompt: 'space exploration astronauts science fiction'}).results;
  const comedy = engine.recommend({prompt: 'warm romantic comedy friendship love'}).results;
  assert.notDeepEqual(space.map(x => x.movie.id), comedy.map(x => x.movie.id));
  assert.ok(space.filter(x => x.movie.genres.includes('Science Fiction')).length >= 9);
  assert.ok(comedy.filter(x => x.movie.genres.includes('Comedy') || x.movie.genres.includes('Romance')).length >= 9);
});

test('combined genre, year, runtime, rating and language filters apply to every result', () => {
  const {results} = engine.recommend({prompt: 'space adventure', genres: ['Science Fiction'], minYear: 1980, maxYear: 2020, maxRuntime: 120, minRating: 6, language: 'en'});
  assert.ok(results.length > 0);
  for (const {movie} of results) {
    assert.ok(movie.genres.includes('Science Fiction'));
    assert.ok(movie.year >= 1980 && movie.year <= 2020);
    assert.ok(movie.runtime <= 120 && movie.rating >= 6);
    assert.equal(movie.language, 'en');
  }
});

test('multiple genres use the documented any-selected-genre rule', () => {
  const {results} = engine.recommend({genres: ['Animation', 'Western']});
  assert.ok(results.length);
  assert.ok(results.every(x => x.movie.genres.includes('Animation') || x.movie.genres.includes('Western')));
});

test('disliked and explicitly excluded titles never appear', () => {
  const baseline = engine.recommend({prompt: 'crime mystery'}).results;
  const banned = baseline.slice(0, 3).map(x => x.movie.id);
  const next = engine.recommend({prompt: 'crime mystery', disliked: banned.slice(0, 2), exclude: banned.slice(2)}).results;
  assert.ok(next.every(x => !banned.includes(x.movie.id)));
});

test('catalog reaches 2026 and Academy winners through the 2026 ceremony are labeled', () => {
  assert.equal(spec.yearRange[1], 2026);
  assert.equal(spec.academyCeremonyThrough, 2026);
  const sinners = catalog.find(movie => movie.title === 'Sinners' && movie.year === 2025);
  assert.ok(sinners?.awards.some(award => award.ceremonyYear === 2026));
  const bestPicture = engine.recommend({collection: 'best-picture', limit: 24}).results;
  assert.ok(bestPicture.length >= 12 && bestPicture.every(x => x.movie.awards.some(a => a.category === 'Best Picture')));
  const recent = engine.recommend({collection: 'recent'}).results;
  assert.ok(recent.length === 12 && recent.every(x => x.movie.year >= 2024));
  const hbo = engine.recommend({collection: 'hbo', prompt: 'crime drama'}).results;
  assert.ok(hbo.length && hbo.every(x => x.movie.historicalPlatforms.includes('HBO Max')));
});

test('unknown text and impossible filters return a clear empty outcome', () => {
  assert.equal(engine.recommend({prompt: 'zzzzzzqqqqq'}).unknownPrompt, true);
  assert.equal(engine.recommend({prompt: 'zzzzzzqqqqq'}).results.length, 0);
  assert.equal(engine.recommend({minYear: 2050}).results.length, 0);
  assert.equal(engine.recommend({minRating: 11}).results.length, 0);
});

test('ranking is deterministic, finite and unique for larger result lists', () => {
  const options = {favorites: ['tmdb-27205'], prompt: 'mystery dream', limit: 36};
  const first = engine.recommend(options).results;
  assert.deepEqual(first.map(x => x.movie.id), engine.recommend(options).results.map(x => x.movie.id));
  assert.equal(new Set(first.map(x => x.movie.id)).size, first.length);
  assert.ok(first.every(x => Number.isFinite(x.score)));
});
