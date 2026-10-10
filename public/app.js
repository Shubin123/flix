import {MovieEngine, gunzipResponse} from './engine.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const imageUrl = (path, size = 'w342') => /^\/[a-zA-Z0-9_.-]+$/.test(path || '') ? `https://image.tmdb.org/t/p/${size}${path}` : '';
const ALL_GENRES = ['Science Fiction','Drama','Comedy','Thriller','Adventure','Romance','Animation','Mystery','Action','Crime','Documentary','Family','Fantasy','History','Horror','Music','War','Western'];
const MOODS = {
  mind: 'A mind-bending psychological mystery about dreams, reality and identity.',
  comfort: 'A warm comedy about friendship, family and everyday life.',
  edge: 'A tense crime thriller with suspense, secrets and a dangerous investigation.',
  wonder: 'An imaginative fantasy adventure with magic, wonder and beautiful animation.',
};
let engine, sources = [], mode = 'discover', lastRecommendation, suggestions = [], activeSuggestion = -1, toastTimer;
let resultLimit = 12, searchTimer;
let preferences = {favorites: [], genres: [], prompt: '', minYear: '1870', maxYear: '2100', maxRuntime: '360', minRating: '0', language: '', collection: ''};
let watchlist = new Set(), disliked = new Set();

function readStorage(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
const stored = readStorage('flix.preferences.v1', {});
for (const key of Object.keys(preferences)) {
  if (['favorites', 'genres'].includes(key) && Array.isArray(stored[key])) preferences[key] = stored[key].filter(value => typeof value === 'string').slice(0, key === 'favorites' ? 5 : 18);
  else if (typeof stored[key] === 'string') preferences[key] = stored[key].slice(0, 600);
}
for (const id of readStorage('flix.watchlist.v1', []) instanceof Array ? readStorage('flix.watchlist.v1', []) : []) if (typeof id === 'string') watchlist.add(id);
for (const id of readStorage('flix.disliked.v1', []) instanceof Array ? readStorage('flix.disliked.v1', []) : []) if (typeof id === 'string') disliked.add(id);

function persist() {
  try {
    localStorage.setItem('flix.preferences.v1', JSON.stringify(preferences));
    localStorage.setItem('flix.watchlist.v1', JSON.stringify([...watchlist]));
    localStorage.setItem('flix.disliked.v1', JSON.stringify([...disliked]));
  } catch {
    // Private browsing or full local storage still allows recommendations for this visit.
  }
}

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3200);
}

function renderGenres() {
  $('#genre-chips').innerHTML = ALL_GENRES.map((genre, i) => `<button class="genre-chip${i >= 8 ? ' extra' : ''}" type="button" data-genre="${escape(genre)}" aria-pressed="${preferences.genres.includes(genre)}">${escape(genre)}</button>`).join('');
  if (preferences.genres.some(genre => ALL_GENRES.indexOf(genre) >= 8)) $('#genre-chips').classList.add('expanded');
}

function renderFavorites() {
  if (!engine) return;
  preferences.favorites = preferences.favorites.filter(id => engine.byId.has(id));
  $('#selected-favorites').innerHTML = preferences.favorites.length ? preferences.favorites.map(id => `<span class="favorite-chip">${escape(engine.byId.get(id).title)}<button type="button" data-remove-favorite="${escape(id)}" aria-label="Remove ${escape(engine.byId.get(id).title)} from favorites">×</button></span>`).join('') : '<p class="favorite-hint">Loved <button type="button" class="inline-seed" data-seed="27205">Inception</button> or <button type="button" class="inline-seed" data-seed="244786">Whiplash</button>? Start there.</p>';
  $('#favorite-search').disabled = preferences.favorites.length >= 5;
  $('#favorite-search').placeholder = preferences.favorites.length >= 5 ? 'Five favorites added. You’re ready.' : 'Search for a favorite film…';
}

function addFavorite(id) {
  if (!engine?.byId.has(id)) return;
  if (preferences.favorites.includes(id)) { toast('That film is already in your favorites.'); return; }
  if (preferences.favorites.length >= 5) { toast('Remove a favorite to add another.'); return; }
  preferences.favorites.push(id);
  disliked.delete(id);
  $('#favorite-search').value = '';
  closeSuggestions();
  renderFavorites();
  persist();
  if ($('#movie-dialog').open) { $('#movie-dialog').close(); toast('Added to your favorites. Find your movies to update your picks.'); }
}

function closeSuggestions() {
  $('#favorite-options').hidden = true;
  $('#favorite-search').setAttribute('aria-expanded', 'false');
  $('#favorite-search').removeAttribute('aria-activedescendant');
  activeSuggestion = -1;
}

function showSuggestions() {
  if (!engine) return;
  const query = $('#favorite-search').value.trim();
  if (query.length < 2) { closeSuggestions(); return; }
  suggestions = engine.search(query).filter(movie => !preferences.favorites.includes(movie.id));
  $('#favorite-options').innerHTML = suggestions.length ? suggestions.map((movie, i) => {
    const poster = imageUrl(movie.poster, 'w92');
    return `<button type="button" class="search-option" role="option" id="favorite-option-${i}" aria-selected="false" data-add-favorite="${escape(movie.id)}">${poster ? `<img src="${poster}" alt="" loading="lazy">` : '<span class="tiny-poster"></span>'}<span><strong>${escape(movie.title)}</strong><small>${movie.year} · ${escape(movie.genres.slice(0, 2).join(', '))}</small></span><span aria-hidden="true">+</span></button>`;
  }).join('') : '<div class="no-search">No matching film in this catalog. Try a shorter title or its original title.</div>';
  $('#favorite-options').hidden = false;
  $('#favorite-search').setAttribute('aria-expanded', 'true');
  activeSuggestion = -1;
}

function updateActiveSuggestion() {
  [...$('#favorite-options').querySelectorAll('.search-option')].forEach((option, i) => {
    option.classList.toggle('selected', i === activeSuggestion);
    option.setAttribute('aria-selected', String(i === activeSuggestion));
    if (i === activeSuggestion) option.scrollIntoView({block: 'nearest'});
  });
  if (activeSuggestion >= 0) $('#favorite-search').setAttribute('aria-activedescendant', `favorite-option-${activeSuggestion}`);
  else $('#favorite-search').removeAttribute('aria-activedescendant');
}

function collectPreferences() {
  preferences.prompt = $('#prompt').value;
  preferences.minYear = $('#min-year').value;
  preferences.maxYear = $('#max-year').value;
  preferences.maxRuntime = $('#runtime').value;
  preferences.minRating = $('#rating').value;
  preferences.language = $('#language').value;
  updateFilterCount();
  persist();
}

function updateFilterCount() {
  const count = [preferences.minYear !== '1870', preferences.maxYear !== '2100', preferences.maxRuntime !== '360', preferences.minRating !== '0', Boolean(preferences.language)].filter(Boolean).length;
  $('#filter-count').textContent = count ? `(${count})` : '';
}

function card(movie, reasons = []) {
  const poster = imageUrl(movie.poster);
  const hue = (movie.year * 37 + movie.title.length * 13) % 360;
  const posterMarkup = poster ? `<img class="movie-poster" src="${poster}" alt="${escape(movie.title)} poster" loading="lazy" decoding="async">` : `<div class="poster-fallback" style="--hue:${hue}"><span>${escape(movie.title)}</span><small>${movie.year} / ${escape(movie.genres[0])}</small></div>`;
  return `<article class="movie-card" data-movie-id="${escape(movie.id)}"><div class="poster-wrap"><button type="button" class="poster-open" data-open-movie="${escape(movie.id)}" aria-label="View details for ${escape(movie.title)}">${posterMarkup}</button><button type="button" class="save-button${watchlist.has(movie.id) ? ' saved' : ''}" data-save-movie="${escape(movie.id)}" aria-label="${watchlist.has(movie.id) ? 'Remove' : 'Save'} ${escape(movie.title)} ${watchlist.has(movie.id) ? 'from' : 'to'} watchlist" aria-pressed="${watchlist.has(movie.id)}">${watchlist.has(movie.id) ? '✓' : '+'}</button>${movie.awards?.length ? '<span class="award-tag">Academy winner</span>' : ''}${movie.rating ? `<span class="rating-tag" title="${escape(movie.ratingSource)} audience rating, out of 10"><span class="star" aria-hidden="true">★</span> ${movie.rating.toFixed(1)}</span>` : ''}</div><h3 class="movie-title"><button type="button" data-open-movie="${escape(movie.id)}">${escape(movie.title)}</button></h3><p class="movie-info">${movie.year} · ${escape(movie.genres.slice(0, 2).join(' / '))}</p><p class="movie-info">${movie.runtime ? `${movie.runtime} min` : 'Runtime unavailable'}${movie.rating ? ` · ${escape(movie.ratingSource)}` : ''}</p>${reasons.length ? `<p class="movie-reason">${escape(reasons[0])}</p>` : ''}</article>`;
}

function emptyState(title, body, reset = false) {
  $('#results-grid').innerHTML = `<div class="empty-state"><strong>${escape(title)}</strong><p>${escape(body)}</p>${reset ? '<button type="button" class="secondary-button" data-reset-filters="true">Clear filters</button>' : ''}</div>`;
}

function renderResults(scroll = false) {
  if (!engine) return;
  $('#results-grid').setAttribute('aria-busy', 'false');
  $('#watchlist-count').textContent = String(watchlist.size);
  $('#discover-nav').classList.toggle('active', mode === 'discover');
  $('#watchlist-nav').classList.toggle('active', mode === 'watchlist');
  $('#collections').hidden = mode === 'watchlist';
  $('#collection-note').hidden = mode === 'watchlist';
  for (const button of $('#collections').querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.collection === preferences.collection));
  $('#collection-note').textContent = ['hbo', 'netflix', 'prime', 'disney', 'hulu'].includes(preferences.collection) ? 'Provider collections come from 2021–2022 catalog snapshots and do not establish availability today.' : `Films through ${engine.spec.yearRange[1]} · Academy wins through the ${engine.spec.academyCeremonyThrough} ceremony · Provider collections are historical catalogs.`;
  if (mode === 'watchlist') {
    const films = [...watchlist].map(id => engine.byId.get(id)).filter(Boolean);
    $('#results-eyebrow').textContent = '02 / YOUR PERSONAL MATINEE';
    $('#results-title').textContent = 'Good stories, saved for later.';
    $('#results-description').textContent = `${films.length} ${films.length === 1 ? 'film' : 'films'} in your watchlist. Stored only in this browser.`;
    $('#results-meta').textContent = 'Your next movie night, lined up.';
    $('#more-results').hidden = true;
    if (films.length) $('#results-grid').innerHTML = films.map(movie => card(movie)).join('');
    else emptyState('Your watchlist starts with a little curiosity.', 'Tap the + on a film to keep it for another night.');
    $('#results-note').textContent = 'Your watchlist is saved on this device. Clearing browser data removes it.';
  } else {
    lastRecommendation = engine.recommend({...preferences, disliked: [...disliked], limit: resultLimit});
    const personalized = lastRecommendation.personalized;
    $('#results-eyebrow').textContent = personalized ? '02 / YOUR NEXT GREAT WATCH' : '02 / THE OPENING CREDITS';
    $('#results-title').textContent = personalized ? 'A little more your kind of cinema.' : 'Great films. A good place to start.';
    $('#results-description').textContent = personalized ? `Stories and styles that connect with ${preferences.favorites.length ? 'your favorites' : 'your mood'}${preferences.genres.length ? ' and genres' : ''}.` : 'Audience favorites from the catalog. Add your taste to make them personal.';
    $('#results-meta').innerHTML = `${lastRecommendation.candidateCount.toLocaleString()} films considered <span aria-hidden="true">✳</span>`;
    if (lastRecommendation.results.length) $('#results-grid').innerHTML = lastRecommendation.results.map(item => card(item.movie, personalized ? item.reasons : [])).join('');
    else if (lastRecommendation.unknownPrompt) emptyState('Let’s give your mood a little more detail.', 'Those words did not match the model vocabulary. Try a genre, story theme or a favorite film.');
    else emptyState('No films fit this combination yet.', 'Try a wider year range, a longer runtime or a lower minimum rating.', true);
    $('#more-results').hidden = lastRecommendation.results.length < resultLimit || resultLimit >= 48;
    $('#results-note').textContent = personalized ? 'Story and style matches, not predicted ratings. Open a film to see why it fits.' : 'Audience ratings are from the credited sources and are shown out of 10.';
  }
  if (scroll) $('#results-section').scrollIntoView({behavior: 'smooth', block: 'start'});
}

function saveMovie(id) {
  if (!engine?.byId.has(id)) return;
  if (watchlist.has(id)) { watchlist.delete(id); toast('Removed from your watchlist.'); }
  else { watchlist.add(id); toast('Saved for your next movie night.'); }
  persist();
  renderResults();
  if ($('#movie-dialog').open) openMovie(id, false);
}

function openMovie(id, show = true) {
  const movie = engine?.byId.get(id);
  if (!movie) return;
  const item = lastRecommendation?.results.find(result => result.movie.id === id);
  const backdrop = imageUrl(movie.backdrop, 'w780');
  const poster = imageUrl(movie.poster);
  const credits = movie.sources.map(sourceId => {
    const source = sources.find(x => x.id === sourceId);
    return source ? `<a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.title)} — ${escape(source.author)}</a>` : '';
  }).filter(Boolean).join('<br>');
  $('#movie-details').innerHTML = `${backdrop ? `<div class="detail-backdrop" style="background-image:url('${backdrop}')"></div>` : ''}<div class="detail-content${backdrop ? ' with-backdrop' : ''}"><div>${poster ? `<img class="detail-poster" src="${poster}" alt="${escape(movie.title)} poster">` : ''}</div><div class="detail-copy"><h2 id="movie-dialog-title">${escape(movie.title)}</h2><p class="detail-meta">${movie.year} · ${movie.runtime ? `${movie.runtime} min` : 'Runtime unavailable'}${movie.rating ? ` · ★ ${movie.rating.toFixed(1)} / 10 (${escape(movie.ratingSource)})` : ''}${movie.language ? ` · ${escape(languageName(movie.language))}` : ''}</p><div class="detail-genres">${movie.genres.map(genre => `<span>${escape(genre)}</span>`).join('')}</div><p class="detail-overview">${escape(movie.overview)}</p><div class="detail-people">${movie.directors.length ? `<strong>Director</strong><span>${escape(movie.directors.join(', '))}</span>` : ''}${movie.cast.length ? `<strong>Starring</strong><span>${escape(movie.cast.join(', '))}</span>` : ''}${item?.reasons.length ? `<strong>Why this film</strong><span>${escape(item.reasons.join(' · '))}</span>` : ''}</div><div class="detail-actions"><button type="button" class="primary-button" data-save-movie="${escape(id)}">${watchlist.has(id) ? '✓ In your watchlist' : '+ Save to watchlist'}</button><button type="button" class="secondary-button" data-add-favorite="${escape(id)}">More like this</button><button type="button" class="text-button" data-dislike-movie="${escape(id)}">Not my taste</button>${movie.tmdb ? `<a class="text-button" href="https://www.themoviedb.org/movie/${encodeURIComponent(movie.tmdb)}" target="_blank" rel="noopener noreferrer">On TMDB ↗</a>` : ''}</div><div class="detail-sources"><strong>Data & credits</strong><br>${credits}${movie.poster ? '<p>Poster and imagery: <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer">The Movie Database</a>; original artwork belongs to its respective rights holders.</p>' : ''}${movie.historicalPlatforms.length ? `<p>Listed in historical catalogs: ${escape(movie.historicalPlatforms.join(', '))}. These 2021–2022 snapshots do not confirm current streaming availability.</p>` : ''}</div></div></div>`;
  if (movie.awards?.length) {
    const awards = document.createElement('section');
    awards.className = 'detail-awards';
    awards.innerHTML = `<h3>Academy Award wins · human honorees</h3>${movie.awards.map(award => `<p><a href="${escape(award.source)}" target="_blank" rel="noopener noreferrer">${award.ceremonyYear} ceremony · ${escape(award.category)} ↗</a><span>${escape(award.honorees)}</span></p>`).join('')}`;
    $('.detail-actions').before(awards);
  }
  if (show && !$('#movie-dialog').open) $('#movie-dialog').showModal();
}

function languageName(code) {
  try { return new Intl.DisplayNames(['en'], {type: 'language'}).of(code) || code; } catch { return code; }
}

function showSources() {
  if (!$('#sources-dialog').open) $('#sources-dialog').showModal();
}

function renderSources(spec) {
  $('#model-facts').innerHTML = `<div><strong>${spec.movieCount.toLocaleString()}</strong><span>films in the trained model</span></div><div><strong>${spec.totalInputRows.toLocaleString()}</strong><span>source rows processed</span></div><div><strong>${spec.sourceCount}</strong><span>credited Kaggle datasets</span></div>`;
  $('#source-list').innerHTML = sources.map(source => `<article class="source-row"><a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.title)} ↗</a><p class="source-author">${escape(source.author)}${source.additionalCredits ? ` · ${escape(source.additionalCredits)}` : ''}${source.id === 'tmdb-5000' ? ' · The Movie Database (TMDB)' : ''}</p><p class="source-use">${escape(source.use)}</p><p class="source-license">Kaggle label: <a href="${escape(source.terms)}" target="_blank" rel="noopener noreferrer">${escape(source.license)}</a> · Version ${source.version} · Updated ${escape(source.datasetUpdatedAt.slice(0, 10))}</p><p>${source.statistics.moviesInModel.toLocaleString()} films contributed to this model${source.upstream ? ` · Original provider: <a href="${escape(source.upstream)}" target="_blank" rel="noopener noreferrer">${escape(new URL(source.upstream).hostname.replace('www.', ''))}</a>` : ''}</p></article>`).join('');
}

function restoreForm(spec) {
  preferences.genres = preferences.genres.filter(genre => ALL_GENRES.includes(genre));
  $('#prompt').value = preferences.prompt;
  for (const year of [...new Set([spec.yearRange[0], ...Array.from({length: Math.floor((spec.yearRange[1] - 1900) / 10) + 1}, (_, i) => 1900 + i * 10), spec.yearRange[1], 2024, 2025, 2026])].sort((a, b) => a - b)) {
    for (const name of ['min-year', 'max-year']) $( `#${name}`).add(new Option(String(year), String(year)));
  }
  for (const [code, count] of Object.entries(spec.languages)) {
    if (code !== 'unknown' && count >= 10) $('#language').add(new Option(`${languageName(code)} (${count.toLocaleString()})`, code));
  }
  for (const [key, selector] of [['minYear','#min-year'],['maxYear','#max-year'],['maxRuntime','#runtime'],['minRating','#rating'],['language','#language']]) {
    const select = $(selector);
    if ([...select.options].some(option => option.value === preferences[key])) select.value = preferences[key];
    else preferences[key] = select.value;
  }
  renderGenres();
  renderFavorites();
  updateFilterCount();
}

function clearFilters() {
  $('#min-year').value = '1870'; $('#max-year').value = '2100'; $('#runtime').value = '360'; $('#rating').value = '0'; $('#language').value = '';
  $('#max-year').setCustomValidity('');
  collectPreferences();
}

$('#taste-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!engine) return;
  collectPreferences();
  if (Number(preferences.minYear) > Number(preferences.maxYear)) {
    $('#max-year').setCustomValidity('Choose an ending year that is at or after the starting year.');
    $('#filters').open = true;
    $('#max-year').reportValidity();
    return;
  }
  $('#max-year').setCustomValidity('');
  closeSuggestions(); resultLimit = 12; mode = 'discover'; renderResults(true);
});
$('#favorite-search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(showSuggestions, 120); });
$('#favorite-search').addEventListener('focus', showSuggestions);
$('#favorite-search').addEventListener('keydown', event => {
  if (event.key === 'Escape') { closeSuggestions(); return; }
  if ($('#favorite-options').hidden || !suggestions.length) return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    activeSuggestion = (activeSuggestion + (event.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length;
    updateActiveSuggestion();
  }
  if (event.key === 'Enter') { event.preventDefault(); addFavorite(suggestions[Math.max(0, activeSuggestion)].id); }
});
$('#genre-chips').addEventListener('click', event => {
  const button = event.target.closest('[data-genre]');
  if (!button) return;
  const genre = button.dataset.genre;
  preferences.genres = preferences.genres.includes(genre) ? preferences.genres.filter(x => x !== genre) : [...preferences.genres, genre];
  button.setAttribute('aria-pressed', String(preferences.genres.includes(genre)));
  persist();
});
$('#all-genres').addEventListener('click', () => {
  const expanded = $('#genre-chips').classList.toggle('expanded');
  $('#all-genres').setAttribute('aria-expanded', String(expanded));
  $('#all-genres').innerHTML = `${expanded ? 'Fewer genres' : 'All genres'} <span aria-hidden="true">${expanded ? '−' : '+'}</span>`;
});
for (const selector of ['#min-year','#max-year','#runtime','#rating','#language']) $(selector).addEventListener('change', () => { $('#max-year').setCustomValidity(''); collectPreferences(); });
$('#prompt').addEventListener('input', collectPreferences);
$('#reset').addEventListener('click', () => {
  preferences.favorites = []; preferences.genres = []; preferences.prompt = ''; preferences.collection = ''; disliked.clear(); $('#prompt').value = ''; $('#favorite-search').value = '';
  clearFilters(); renderGenres(); renderFavorites(); closeSuggestions(); mode = 'discover'; resultLimit = 12; renderResults(); toast('Taste profile reset. Your watchlist is still saved.');
});
$('#more-results').addEventListener('click', () => { resultLimit += 12; renderResults(); });
$('#collections').addEventListener('click', event => {
  const button = event.target.closest('[data-collection]');
  if (!button) return;
  preferences.collection = button.dataset.collection;
  resultLimit = 12; mode = 'discover'; persist(); renderResults();
});
$('#discover-nav').addEventListener('click', () => { mode = 'discover'; renderResults(true); });
$('#watchlist-nav').addEventListener('click', () => { mode = 'watchlist'; renderResults(true); });
for (const selector of ['#sources-nav','#how-sources','#footer-sources']) $(selector).addEventListener('click', showSources);
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
}
document.addEventListener('click', event => {
  const favorite = event.target.closest('[data-add-favorite]');
  if (favorite) addFavorite(favorite.dataset.addFavorite);
  const seed = event.target.closest('[data-seed]');
  if (seed) addFavorite(`tmdb-${seed.dataset.seed}`);
  const remove = event.target.closest('[data-remove-favorite]');
  if (remove) { preferences.favorites = preferences.favorites.filter(id => id !== remove.dataset.removeFavorite); renderFavorites(); persist(); }
  const save = event.target.closest('[data-save-movie]');
  if (save) saveMovie(save.dataset.saveMovie);
  const open = event.target.closest('[data-open-movie]');
  if (open) openMovie(open.dataset.openMovie);
  const mood = event.target.closest('[data-mood]');
  if (mood) { $('#prompt').value = MOODS[mood.dataset.mood]; collectPreferences(); $('#prompt').focus(); }
  const dislike = event.target.closest('[data-dislike-movie]');
  if (dislike) { disliked.add(dislike.dataset.dislikeMovie); preferences.favorites = preferences.favorites.filter(id => id !== dislike.dataset.dislikeMovie); renderFavorites(); persist(); $('#movie-dialog').close(); renderResults(); toast('We’ll move away from that film’s themes.'); }
  if (event.target.closest('[data-reset-filters]')) { clearFilters(); renderResults(); }
  if (!event.target.closest('.search-wrap')) closeSuggestions();
});
document.addEventListener('error', event => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement)) return;
  if (image.classList.contains('movie-poster')) {
    const id = image.closest('[data-movie-id]')?.dataset.movieId;
    const movie = engine?.byId.get(id);
    const fallback = document.createElement('div'); fallback.className = 'poster-fallback';
    const title = document.createElement('span'); title.textContent = movie?.title || 'A story awaits';
    const year = document.createElement('small'); year.textContent = movie?.year || '';
    fallback.append(title, year); image.replaceWith(fallback);
  } else image.style.visibility = 'hidden';
}, true);

renderGenres();
$('#results-grid').innerHTML = Array.from({length: 6}, () => '<div class="movie-card skeleton" aria-hidden="true"><div class="poster-wrap"></div><div class="skeleton-text"></div><div class="skeleton-text short"></div></div>').join('');
$('#source-list').innerHTML = '<p class="subtle">Loading dataset credits…</p>';

async function loadModel() {
  $('#load-status').classList.remove('error');
  $('#load-status').innerHTML = '<span class="spinner"></span> Loading your movie universe (about 25 MB, first visit)…';
  try {
    const json = async name => { const response = await fetch(`./data/${name}`); if (!response.ok) throw new Error(`Could not load ${name}. Please try again.`); return response.json(); };
    const compressed = async name => gunzipResponse(await fetch(`./data/${name}`));
    const [spec, sourceData, catalogData, vocabularyData, embeddings, projection, indices, values, offsets] = await Promise.all([
      json('model.json'), json('sources.json'), compressed('catalog.json.gz'), compressed('vocabulary.json.gz'), compressed('embeddings.i8.gz'), compressed('projection.f32.gz'),
      compressed('features.indices.u16.gz'), compressed('features.values.u8.gz'), compressed('features.offsets.u32.gz'),
    ]);
    const decode = data => JSON.parse(new TextDecoder().decode(data));
    sources = sourceData;
    engine = new MovieEngine(decode(catalogData), decode(vocabularyData), spec, new Int8Array(embeddings), new Float32Array(projection), {indices: new Uint16Array(indices), values: new Uint8Array(values), offsets: new Uint32Array(offsets)});
    watchlist = new Set([...watchlist].filter(id => engine.byId.has(id)));
    disliked = new Set([...disliked].filter(id => engine.byId.has(id)));
    restoreForm(spec);
    renderSources(spec);
    $('#movie-stat').textContent = spec.movieCount.toLocaleString();
    $('#source-stat').textContent = String(spec.sourceCount);
    for (const element of document.querySelectorAll('[data-hero]')) {
      const movie = engine.byId.get(`tmdb-${element.dataset.hero}`);
      if (!movie?.poster) continue;
      const url = imageUrl(movie.poster);
      const probe = new Image(); probe.onload = () => { element.style.backgroundImage = `url('${url}')`; element.classList.add('has-image'); }; probe.src = url;
    }
    $('#load-status').hidden = true;
    $('#recommend-button').disabled = false;
    $('#favorite-search').disabled = preferences.favorites.length >= 5;
    renderResults();
    persist();
    // A read-only diagnostic for artifact validation and browser QA.
    globalThis.flix = {engine, get state() { return {preferences: {...preferences}, watchlist: [...watchlist], disliked: [...disliked], mode}; }};
  } catch (error) {
    $('#load-status').classList.add('error');
    $('#load-status').innerHTML = `${escape(error.message)} <button type="button" id="retry-load">Try again</button>`;
    $('#retry-load').addEventListener('click', loadModel);
    $('#results-grid').setAttribute('aria-busy', 'false');
    emptyState('The movie universe is taking a moment.', 'Check your connection, then try loading the catalog again.');
    $('#source-list').innerHTML = '<p>Credits and training details are also available in the <a href="https://github.com/Shubin123/flix/blob/main/docs/SOURCES.md" target="_blank" rel="noopener noreferrer">public repository</a>.</p>';
    console.error('Flix model load failed:', error);
  }
}

loadModel();
