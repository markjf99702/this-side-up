// Renders the README screenshots (docs/*.png) and the link preview (og.png):  node tools/screenshots.mjs
// They use the example move, with Math.random seeded so its ids (and so its QR codes) come out the same every time.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
let UPNG = null;
try { UPNG = require('upng-js'); } catch { /* without it the PNGs are saved as Chromium makes them */ }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
// The page opens at its real address, answered from this folder, so the labels' codes point where a phone can open
// them (not at a local server), and come out the same every time.
const base = 'https://this-side-up.junkdrawer.works/';
async function serve(ctx) {
  await ctx.route(base + '**', async route => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname).slice(new URL(base).pathname.length) || 'index.html';
    try { await route.fulfill({ body: await readFile(join(root, path)), contentType: TYPES[extname(path)] || 'text/html' }); }
    catch { await route.fulfill({ status: 404, body: '' }); }
  });
}
const SEED = 7;
const browser = await pw.chromium.launch();
await mkdir(join(root, 'docs'), { recursive: true });

async function open(viewport, deviceScaleFactor, { example = true } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor, hasTouch: true, isMobile: deviceScaleFactor > 1, serviceWorkers: 'block' });
  await serve(ctx);
  // On a first visit to the real address carry.js would ask junkdrawer.works for saves; the example needs none.
  await ctx.addInitScript(() => { try { localStorage.setItem('junkdrawer.carried', 'screenshots'); } catch { /* fine */ } });
  const page = await ctx.newPage();
  await page.addInitScript(seed => {
    let a = seed; // mulberry32
    Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }, SEED);
  await page.goto(base);
  await page.evaluate(() => document.fonts.ready);
  if (example) {
    await page.click('[data-act="example"]');
    await page.locator('.boxrow').first().waitFor();
  }
  return page;
}

// Screenshots come out of Chromium as full-colour PNGs; a palette keeps them small (256 colours, or fewer for the
// link preview, which is fetched every time the link is shared).
async function save(page, file, { colours = 256, ...opts } = {}) {
  await page.mouse.move(0, 0); // no row lit up as if the pointer were on it
  const shot = await page.screenshot(opts);
  if (!UPNG) { await writeFile(join(root, file), shot); return; }
  const img = UPNG.decode(shot);
  const rgba = UPNG.toRGBA8(img)[0];
  await writeFile(join(root, file), Buffer.from(UPNG.encode([rgba], img.width, img.height, colours)));
}

// Phone screenshots for the README.
{
  const page = await open({ width: 390, height: 844 }, 2);
  // Packing: the next box in the kitchen, its label drawing itself above what's in it.
  await page.goto(base + '#/new');
  await page.locator('#packForm').waitFor();
  await page.click('[data-side="from"] .chip:text-is("Kitchen")');
  await page.fill('#things', 'Baking dishes\nMixing bowls\nCake tins\nRolling pin');
  await page.click('[data-flag="fragile"]');
  await page.waitForTimeout(300);
  await page.evaluate(() => { document.getElementById('labelSlot').scrollIntoView({ block: 'start' }); window.scrollBy(0, -112); });
  await page.waitForTimeout(200);
  await save(page, 'docs/phone-pack.png');
  await page.evaluate(() => localStorage.removeItem('this-side-up.draft'));

  // Every box: the totals, what's left to print, and the list.
  await page.goto(base + '#/');
  await page.locator('.boxrow').first().waitFor();
  await page.evaluate(() => window.scrollTo(0, document.querySelector('.find').getBoundingClientRect().top + scrollY - 62));
  await page.waitForTimeout(200);
  await save(page, 'docs/phone-boxes.png');

  // Moving day: most of the boxes on, the sofa ticked on a moment ago, and the drill box keyed in.
  await page.evaluate(async () => {
    const { store } = await import('./js/store.js');
    const M = await import('./js/model.js');
    for (const b of M.live(store.list)) if (b.n <= 22) M.setStage(b, 'load', true);
    store.save();
  });
  await page.goto(base + '#/truck/load');
  await page.locator('.truck-screen[data-stage="load"]').waitFor();
  for (const k of ['2', '7', 'tick']) await page.click(`[data-key="${k}"]`);
  await page.locator('#last button').waitFor();
  for (const k of ['2', '3']) await page.click(`[data-key="${k}"]`);
  await page.waitForTimeout(800); // until the box that just went on has popped into the truck
  await save(page, 'docs/phone-truck.png');
  await page.context().close();
}

// Link preview, 1200 x 630: the name and one line on the left, a real label (the kettle's, Box 1) on a bit of box.
{
  const page = await open({ width: 1200, height: 630 }, 1);
  await page.evaluate(async () => {
    const { store } = await import('./js/store.js');
    const M = await import('./js/model.js');
    const { onScreen, fromBox } = await import('./js/labels.js');
    const { upMark } = await import('./js/ui.js');
    const box = M.findNumber(store.list, 1)[0];
    document.body.innerHTML = `
      <style>
        /* The cardboard without its fibres: a smooth brown keeps the picture small. */
        body { padding: 0; min-height: 0; height: 630px; overflow: hidden; background-image: radial-gradient(ellipse at 20% 0%, rgba(255, 236, 205, .4), transparent 62%), linear-gradient(160deg, #c9a272, #b98e5d); }
        .og { display: grid; grid-template-columns: 1fr 520px; align-items: center; gap: 56px; height: 630px; padding: 0 70px 0 84px; box-sizing: border-box; }
        .og-kicker { display: flex; align-items: center; gap: 12px; margin: 0 0 22px; font: 700 26px/1 var(--sans); letter-spacing: .08em; text-transform: uppercase; color: var(--kraft-ink); opacity: .85; }
        .og-kicker .up { width: 34px; height: 34px; }
        .og h1 { margin: 0 0 26px; font: 900 128px/.86 var(--stencil); letter-spacing: .01em; text-transform: uppercase; color: #22170c; }
        .og p.line { margin: 0; max-width: 520px; font: 600 33px/1.3 var(--sans); color: #3a2816; }
        .og .boxside { padding: 30px 30px 34px; border-radius: 18px; transform: rotate(2deg); box-shadow: inset 0 0 0 1px rgba(90, 60, 25, .25), 0 30px 50px -24px rgba(50, 30, 10, .6); }
      </style>
      <div class="og">
        <div>
          <p class="og-kicker">${upMark('up')}junkdrawer.works</p>
          <h1>This Side Up</h1>
          <p class="line">Number every box, print labels any phone can read, and count them onto the truck and off again.</p>
        </div>
        <div class="boxside">${onScreen(fromBox(box, store.list))}</div>
      </div>`;
  });
  await page.waitForTimeout(300);
  await save(page, 'og.png', { colours: 128 });
  await page.context().close();
}

await browser.close();
console.log('screenshots written');
