import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';

const base = process.env.FLIX_BASE_URL || 'http://127.0.0.1:4173/';
const chrome = process.env.FLIX_CHROME_BINARY || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync);
const browser = await chromium.launch(chrome ? {executablePath: chrome, headless: true} : {channel: 'chrome', headless: true});
const context = await browser.newContext({viewport: {width: 1440, height: 1080}});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await mkdir('docs/screenshots', {recursive: true});

try {
  const start = performance.now();
  const response = await page.goto(base);
  assert.equal(response.status(), 200);
  await page.waitForFunction(() => Boolean(globalThis.flix), null, {timeout: 120000});
  console.log(`Loaded ${base} in ${Math.round(performance.now() - start)} ms`);
  assert.equal(await page.locator('.movie-card').count(), 12);

  await page.locator('#favorite-search').fill('Interstellar');
  await page.locator('.search-option').first().waitFor();
  await page.locator('#favorite-search').press('ArrowDown');
  await page.locator('#favorite-search').press('Enter');
  assert.equal(await page.locator('.favorite-chip').count(), 1);
  await page.locator('#prompt').fill('A thoughtful space exploration story with astronauts');
  await page.locator('[data-genre="Science Fiction"]').click();
  await page.locator('#filters summary').click();
  await page.locator('#min-year').selectOption('1980');
  await page.locator('#max-year').selectOption('2020');
  await page.locator('#runtime').selectOption('120');
  await page.locator('#rating').selectOption('6');
  await page.locator('#language').selectOption('en');
  await page.locator('#recommend-button').click();
  const chosen = await page.locator('.movie-card').evaluateAll(cards => cards.map(card => globalThis.flix.engine.byId.get(card.dataset.movieId)));
  assert.ok(chosen.length > 0);
  assert.ok(chosen.every(movie => movie.genres.includes('Science Fiction') && movie.year >= 1980 && movie.year <= 2020 && movie.runtime <= 120 && movie.rating >= 6 && movie.language === 'en' && movie.id !== 'tmdb-157336'));
  console.log('Filtered recommendations:', chosen.slice(0, 6).map(movie => movie.title).join(', '));

  const savedId = chosen[0].id;
  await page.locator('.save-button').first().click();
  await page.locator('#watchlist-nav').click();
  assert.equal(await page.locator('.movie-card').count(), 1);
  assert.equal(await page.locator('.movie-card').first().getAttribute('data-movie-id'), savedId);
  await page.reload();
  await page.waitForFunction(() => Boolean(globalThis.flix));
  assert.equal(await page.locator('#watchlist-count').textContent(), '1');
  assert.equal(await page.locator('.favorite-chip').count(), 1);
  await page.locator('#watchlist-nav').click();
  assert.equal(await page.locator('.movie-card').count(), 1);

  await page.locator('.poster-open').first().click();
  await page.locator('#movie-dialog').waitFor({state: 'visible'});
  assert.ok((await page.locator('.detail-sources a').count()) >= 1);
  await page.locator('[data-dislike-movie]').click();
  await page.locator('#discover-nav').click();
  assert.ok(!await page.locator(`[data-movie-id="${savedId}"]`).count());

  await page.locator('[data-collection="academy"]').click();
  assert.ok(await page.locator('.award-tag').count() >= 1);
  await page.locator('[data-collection=""]').click();

  await page.locator('#sources-nav').click();
  assert.equal(await page.locator('.source-row').count(), 14);
  const credits = await page.locator('#source-list').textContent();
  for (const person of ['asaniczka','Rounak Banik','Sohier Dane','Harshit Shankhdhar','Shivam Bansal','Victor Soeiro','Ruchi Bhatia','DHRITI SISODIA','David Lu']) assert.ok(credits.includes(person), person);
  assert.ok(await page.locator('.tmdb-credit img').evaluate(image => image.complete && image.naturalWidth > 0));
  await page.keyboard.press('Escape');

  await page.locator('#reset').click();
  assert.equal(await page.locator('.favorite-chip').count(), 0);
  assert.equal(await page.locator('#watchlist-count').textContent(), '1');
  await page.locator('#filters summary').click();
  await page.locator('#prompt').fill('zzzzzzqqqqq');
  await page.locator('#recommend-button').click();
  assert.ok((await page.locator('.empty-state').textContent()).includes('more detail'));
  await page.locator('#reset').click();

  await page.locator('.poster-open').first().scrollIntoViewIfNeeded();
  await page.waitForFunction(() => [...document.querySelectorAll('.movie-poster')].every(image => image.complete), null, {timeout: 20000}).catch(() => {});
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({path: 'docs/screenshots/desktop.png', fullPage: true});
  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({width, height: 900});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Horizontal overflow at ${width}px`);
  }
  await page.setViewportSize({width: 390, height: 844});
  await page.screenshot({path: 'docs/screenshots/mobile.png', fullPage: true});
  await page.locator('#sources-nav').click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.keyboard.press('Escape');
  assert.deepEqual(errors, []);
  console.log('Passed: browser inference, keyboard search, all filters, watchlist persistence, negative feedback, fourteen human source credits, collections, model error state and five responsive widths.');
} finally {
  await browser.close();
}
