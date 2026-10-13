// Uses the app in Chromium through the real page:  node test/e2e.mjs  (needs Playwright)
// Mark packs four boxes and the sofa, finds the kettle, prints labels (and reads their QR codes back, from the
// screen and from the printed PDF at their true size), a mover's phone reads a label, the truck is counted on
// and off, a second phone gets the list and sends changes back, and a backup brings the photos along.
import { createRequire } from 'node:module';
import { execSync, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { readQR, png, crop } from './decode.mjs';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let body;
  try { body = await readFile(join(root, path === '/' ? 'index.html' : path)); } catch { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'text/html' });
  res.end(body);
}).listen(0);
const base = `http://localhost:${server.address().port}/`;
const tmp = await mkdtemp(join(tmpdir(), 'this-side-up-'));
const has = cmd => { try { execFileSync('which', [cmd], { stdio: 'ignore' }); return true; } catch { return false; } };

const browser = await pw.chromium.launch();
const problems = [];
const step = name => console.log('·', name);

async function device(name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, acceptDownloads: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await ctx.newPage();
  page.on('pageerror', e => problems.push(`${name}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') problems.push(`${name}: ${m.text()}`); });
  page.on('requestfailed', r => problems.push(`${name} failed: ${r.url()}`));
  page.on('request', r => { const u = r.url(); if (!u.startsWith(base) && !u.startsWith('data:') && !u.startsWith('blob:')) problems.push(`${name} left the site: ${u}`); });
  // Printing opens no dialog here: count the calls instead.
  await page.addInitScript(() => {
    window.print = () => { window.__printed = (window.__printed || 0) + 1; setTimeout(() => window.dispatchEvent(new Event('afterprint')), 0); };
  });
  return { ctx, page };
}

const fits = async (page, where) => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= 390), true, `${where} scrolls sideways on a phone`);
const text = page => page.locator('main').innerText();
// Waits for the toast to say this (an earlier one may still be showing).
const toastSays = (page, re) => page.locator('#toast:not([hidden])', { hasText: re }).waitFor({ timeout: 8000 });
const hash = page => page.evaluate(() => location.hash);

async function packBox(page, { from, to, things, flags = [], piece = false, name }) {
  if (!(await hash(page)).startsWith('#/new')) await page.goto(base + '#/new');
  await page.locator('#packForm').waitFor();
  if (piece) await page.click('[data-kind="piece"]');
  if (from) await page.click(`[data-side="from"] .chip:text-is("${from}")`);
  if (to) {
    const chip = page.locator(`[data-side="to"] .chip`, { hasText: to }).first();
    if ((await chip.getAttribute('aria-pressed')) !== 'true') await chip.click();
  }
  if (piece) await page.fill('#pieceName', name);
  if (things) await page.fill('#things', things.join('\n'));
  for (const f of flags) await page.click(`[data-flag="${f}"]`);
  const n = Number(await page.inputValue('#num'));
  await page.click('#save');
  await toastSays(page, new RegExp(`${piece ? name : `Box ${n}`} saved`));
  return n;
}

// QR codes in an element, read from a screenshot of it.
async function qrIn(locator) {
  const shot = await locator.screenshot();
  const img = png(shot);
  return readQR(img.rgba, img.width, img.height);
}

// ---------- Mark's phone: the first box ----------
step('packing');
const mark = await device('mark');
let page = mark.page;
await page.goto(base);
await page.evaluate(() => document.fonts.ready);
assert.match(await text(page), /Number every box/i);
await fits(page, 'the welcome');
await page.click('[data-act="start"]');
await page.waitForURL(/#\/new$/);
assert.equal(await page.inputValue('#num'), '1', 'the first box is number 1');

// Leaving the kitchen picks the kitchen at the other end too.
await page.click('[data-side="from"] .chip:text-is("Kitchen")');
assert.equal(await page.getAttribute('[data-side="to"] .chip:has-text("Kitchen")', 'aria-pressed'), 'true', 'Kitchen to Kitchen');
await page.fill('#things', 'Kettle\nMugs\nCoffee\nFrench press');
await page.click('[data-flag="fragile"]');
await page.click('[data-flag="first"]');
await page.locator('#preview .lab-room-name:text-is("Kitchen")').waitFor();
await page.locator('#preview .lab-fragile').waitFor({ timeout: 3000 }); // the label shows FRAGILE as you tick it
assert.equal(await page.locator('#preview .lab-num').innerText(), '1');
await fits(page, 'the packing form');
await page.click('#save');
await toastSays(page, /Box 1 saved/);
assert.equal(await page.inputValue('#num'), '2', 'the next box is ready');
assert.equal(await page.getAttribute('[data-side="from"] .chip:text-is("Kitchen")', 'aria-pressed'), 'true', 'in the same rooms');
assert.equal(await page.inputValue('#things'), '', 'with nothing in it yet');

await packBox(page, { from: 'Bedroom', things: ['Sheets', 'Pillows', 'Bath towels'], flags: ['first'] });
await packBox(page, { from: 'Living room', things: ['Books: A to M', 'Board games'], flags: ['heavy'] });
await packBox(page, { from: 'Living room', piece: true, name: 'Sofa', things: ['Feet in Box 3'] });
await packBox(page, { from: 'Office', things: ['Passports', 'Laptop chargers'], flags: ['car'] });

// A number that's taken can't be saved, and the next free one is offered.
await page.fill('#num', '2');
assert.match(await page.locator('#numNote').innerText(), /Box 2 \(Bedroom\) already has that number/);
assert.equal(await page.isDisabled('#save'), true);
await page.click('[data-act="nextfree"]');
assert.equal(await page.inputValue('#num'), '6');
assert.equal(await page.isDisabled('#save'), false);

// ---------- Finding the kettle ----------
step('search');
await page.click('.tabs a[data-tab="boxes"]');
await page.locator('#q').waitFor();
assert.equal(await page.locator('.boxrow').count(), 5);
await page.fill('#q', 'kettle');
const answer = page.locator('.answer');
await answer.waitFor();
assert.match(await answer.innerText(), /Box 1, Kitchen, open first/);
await page.fill('#q', 'pillow');
assert.match(await page.locator('.answer').innerText(), /Box 2, Bedroom/);
await page.fill('#q', 'sofa');
assert.match(await page.locator('.answer').innerText(), /Sofa/);
await page.fill('#q', 'piano');
assert.match(await page.locator('.answer.none').innerText(), /Nothing called “piano”/);
await page.click('[data-act="clear"]');
await page.click('[data-filter="first"]');
assert.equal(await page.locator('.boxrow').count(), 2, 'two boxes to open first');
await page.click('[data-filter="all"]');
await page.click('[data-group="room"]');
assert.ok((await page.locator('.group-head').allInnerTexts()).some(t => /Living room/i.test(t)), 'grouped by room');
await fits(page, 'the box list');

// ---------- A box, its label and its QR code ----------
step('label and QR');
await page.click('.boxrow:has-text("Kettle")');
await page.waitForURL(/#\/box\//);
const box1 = (await hash(page)).split('/')[2];
await page.locator('.boxside .lab-qr').waitFor();
await fits(page, 'a box');
const read = await qrIn(page.locator('.boxside .lab-qr'));
assert.equal(read.length, 1, 'the label’s code reads from the screen');
const labelLink = read[0].text;
assert.ok(labelLink.startsWith(base + '#b/'), `the code is a link to this page: ${labelLink}`);
assert.match(labelLink, /\/1\/fo\/\d\d\/Kitchen\/Kitchen\/\/Kettle~Mugs~Coffee~French\+press$/);

// A photo of what's inside, kept in IndexedDB.
const pic = await page.evaluate(async () => {
  const c = Object.assign(document.createElement('canvas'), { width: 60, height: 40 });
  const g = c.getContext('2d'); g.fillStyle = '#c39a6b'; g.fillRect(0, 0, 60, 40); g.fillStyle = '#222'; g.fillRect(10, 10, 20, 20);
  return c.toDataURL('image/png').split(',')[1];
});
await page.setInputFiles('#photoIn', { name: 'inside.png', mimeType: 'image/png', buffer: Buffer.from(pic, 'base64') });
await toastSays(page, /Photo added/);
await page.locator('.ph img').waitFor();
await page.reload();
await page.locator('.ph img').waitFor({ timeout: 8000 });

// ---------- A mover's phone reads the label ----------
step('a mover reads a label');
const mover = await device('mover');
await mover.page.goto(labelLink);
await mover.page.locator('.scanned').waitFor();
const seen = await text(mover.page);
assert.match(seen, /Goes to the\s+Kitchen/i);
assert.match(seen, /Kettle/);
assert.match(seen, /French press/);
assert.equal(await mover.page.locator('.scanned .lab-fragile').count(), 1);
assert.equal(await mover.page.locator('.scanned .lab-first').count(), 1);
assert.equal(await mover.page.evaluate(() => document.body.classList.contains('bare')), true, 'no app tabs for someone just reading a label');
await fits(mover.page, 'a label read by a mover');
// A Tag Along sticker on a phone without the list.
await mover.page.goto(base + '#box/003');
assert.match(await text(mover.page), /This phone doesn’t have the list/);

// Mark's phone opens the same link as the box in his list; so does a sticker.
await page.goto(labelLink);
await page.waitForURL(new RegExp(`#/box/${box1}$`));
await page.goto(base + '#box/003');
await page.waitForURL(/#\/box\//);
assert.match(await page.locator('h1').innerText(), /Box 3/i);

// ---------- Printing labels ----------
step('printing labels');
await page.goto(base + '#/print');
await page.locator('#preview .page').waitFor();
assert.match(await page.locator('[data-which="new"]').innerText(), /5/, 'five labels not printed yet');
await page.selectOption('#sheetPick', '5164');
await page.click('[data-start="2"]'); // two labels already gone from this sheet
assert.equal(await page.locator('#preview .page').first().locator('.slot.empty').count(), 2);
assert.equal(await page.locator('#preview .page').first().locator('.slot .lab').count(), 4, 'four on the first sheet');
assert.equal(await page.locator('#preview .page').count(), 2, 'and the fifth on a second');
await fits(page, 'the print screen');
// The printed copy, at its real size: Chromium's PDF of it.
await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
assert.match(await page.locator('#page-size').textContent(), /size: 8\.5in 11in; margin: 0/);
const pdfPath = join(tmp, 'labels.pdf');
await page.pdf({ path: pdfPath, preferCSSPageSize: true, printBackground: true });
await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
if (has('pdfinfo')) {
  const info = execFileSync('pdfinfo', [pdfPath]).toString();
  assert.match(info, /Pages:\s+2/, 'two sheets');
  assert.match(info, /Page size:\s+612 x 792 pts/, 'Letter, not scaled');
}
if (has('pdftoppm')) {
  // Read every code where the Avery 5164 template says its label is. A label that printed shifted or shrunk
  // would put its code somewhere else.
  const DPI = 150;
  execFileSync('pdftoppm', ['-r', String(DPI), '-png', '-f', '1', '-l', '1', '-singlefile', pdfPath, join(tmp, 'sheet1')]);
  const sheet1 = png(await readFile(join(tmp, 'sheet1.png')));
  assert.equal(sheet1.width, Math.round(8.5 * DPI));
  const slots = [[0.15625, 0.5], [4.34375, 0.5], [0.15625, 0.5 + 10 / 3], [4.34375, 0.5 + 10 / 3], [0.15625, 0.5 + 20 / 3], [4.34375, 0.5 + 20 / 3]];
  const numbers = [];
  for (const [k, [x, y]] of slots.entries()) {
    const found = await readQR(...Object.values(crop(sheet1, x * DPI, y * DPI, 4 * DPI, (10 / 3) * DPI)));
    if (k < 2) { assert.equal(found.length, 0, `label ${k + 1} was already used`); continue; }
    assert.equal(found.length, 1, `a code in label ${k + 1}`);
    // The code's centre: 0.115 in in from the label's right edge, under the room band.
    const p = found[0].at;
    const cx = x + (p.topLeft.x + p.topRight.x + p.bottomLeft.x + p.bottomRight.x) / 4 / DPI;
    const cy = y + (p.topLeft.y + p.topRight.y + p.bottomLeft.y + p.bottomRight.y) / 4 / DPI;
    assert.ok(Math.abs(cx - (x + 4 - 0.115 - 0.75)) < 0.05, `label ${k + 1}'s code is where it should be across (${cx.toFixed(3)} in)`);
    assert.ok(Math.abs(cy - (y + 0.115 + 0.62 + 0.09 + 0.75)) < 0.05, `and down (${cy.toFixed(3)} in)`);
    numbers.push(Number(found[0].text.split('/')[5]));
  }
  assert.deepEqual(numbers, [1, 2, 3, 4], 'boxes 1 to 4, in order');
} else {
  console.log('  (pdftoppm not found: skipped reading the printed codes)');
}
await page.click('[data-act="print"]');
await toastSays(page, /5 labels marked as printed/);
assert.equal(await page.evaluate(() => window.__printed), 1);
assert.equal(await page.isHidden('#printBadge'), true, 'nothing left to print');
assert.match(await page.locator('#controls').innerText(), /Every label is printed/);
assert.equal(await page.getAttribute('[data-start="1"]', 'aria-pressed'), 'true', 'the next run starts after the last label used');
// Changing a box puts its label back on the list.
await page.goto(base + `#/box/${box1}/edit`);
await page.fill('#things', 'Kettle\nMugs\nCoffee\nFrench press\nTea');
await page.click('#save');
await page.waitForURL(new RegExp(`#/box/${box1}$`));
assert.match(await page.locator('.label-acts').innerText(), /Changed since its label was printed/);
assert.equal(await page.locator('#printBadge').innerText(), '1');

// Door signs and the test sheet.
step('door signs and test sheet');
await page.goto(base + '#/print/signs');
await page.locator('#preview .page.sign').first().waitFor();
assert.equal(await page.locator('#preview .page.sign').count(), 4, 'a sign for each room with boxes going to it');
assert.match(await page.locator('#preview .sign-name').first().innerText(), /Kitchen/i);
await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
assert.match(await page.locator('#page-size').textContent(), /size: (11in 8\.5in|297mm 210mm)/, 'sideways');
await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
await page.goto(base + '#/print/test');
await page.locator('#preview .slot.outline').first().waitFor();
assert.equal(await page.locator('#preview .slot.outline').count(), 6);
await page.click('[data-nudge="right"]');
await page.click('[data-nudge="right"]');
assert.match(await page.locator('.nudge-pad').innerText(), /1\/16 in right/);
await page.click('[data-nudge="reset"]');
assert.match(await page.locator('.nudge-pad').innerText(), /0 in right/);

// ---------- Moving day ----------
step('the truck');
await page.goto(base + '#/truck/load');
await page.locator('.keys').waitFor();
await fits(page, 'the truck');
const key = async k => page.click(`[data-key="${k}"]`);
const keyIn = async n => { for (const d of String(n)) await key(d); };
await keyIn(2);
assert.match(await page.locator('#readout').innerText(), /Bedroom/i, 'the box shows before you tick it');
await key('tick');
assert.match(await page.locator('#last').innerText(), /Box 2 on the truck/);
await keyIn(9);
await key('tick');
assert.match(await page.locator('#readout').innerText(), /There’s no box 9/);
for (let i = 0; i < 1; i++) await key('back');
await keyIn(2);
await key('tick');
assert.match(await page.locator('#readout').innerText(), /already on the truck/);
await page.click('[data-act="undo"]');
await toastSays(page, /Box 2 unticked/);
for (const n of [1, 2, 3, 4]) { await keyIn(n); await key('tick'); }
assert.match(await page.locator('.truck-count').innerText(), /4 of 4 on the truck/);
await keyIn(5);
assert.match(await page.locator('#readout').innerText(), /Goes in the car, not the truck/i);
await key('tick');
await page.locator('.truck-card.finished').waitFor();
assert.match(await page.locator('.truck-count').innerText(), /Everything’s loaded/);

await page.click('.truck-head a:has-text("Unloading")');
await page.waitForURL(/unload$/);
await keyIn(1);
assert.match(await page.locator('#readout').innerText(), /Goes to the\s+Kitchen/i);
await key('tick');
assert.match(await page.locator('#readout').innerText(), /Take it to the\s+Kitchen/i);
for (const n of [2, 3]) { await keyIn(n); await key('tick'); }
await page.click('#missingBtn');
const missing = page.locator('.sheet .missing');
await missing.waitFor();
assert.match(await missing.innerText(), /Sofa/);
assert.match(await missing.innerText(), /Passports/);
await page.click('.sheet [data-tick]');
await page.click('.sheet [data-tick]');
await page.click('.sheet [data-close]');
await page.locator('.truck-card.finished').waitFor();
assert.match(await page.locator('.truck-count').innerText(), /All 5 made it/);

// Unpacking, after.
await page.goto(base + `#/box/${box1}`);
await page.click('[data-stage="unpack"]');
await page.locator('[data-stage="unpack"][aria-pressed="true"]').waitFor();
await page.goto(base + '#/');
await page.click('[data-filter="packed"]');
assert.equal(await page.locator('.boxrow').count(), 4, 'four still packed');
await page.click('[data-filter="all"]');

// ---------- The first night ----------
step('the first night');
await page.goto(base + '#/first');
await page.locator('.essentials').waitFor();
const night = await page.locator('main').innerText();
assert.match(night, /Box 1/);
assert.match(night, /Box 2/);
const essential = name => page.locator('.essentials li', { hasText: name });
assert.equal(await essential('Sheets and pillows').getAttribute('class'), 'yes');
assert.equal(await essential('Coffee or tea').getAttribute('class'), 'yes');
assert.equal(await essential('Phone chargers').getAttribute('class'), 'maybe', 'the chargers are in a box that isn’t open first');
assert.equal(await essential('Toilet paper').getAttribute('class'), 'no');
await essential('Phone chargers').locator('[data-first]').click();
assert.equal(await essential('Phone chargers').getAttribute('class'), 'yes');
await essential('A shower curtain').locator('[data-hide]').click();
assert.equal(await essential('A shower curtain').count(), 0, 'not needed');
await fits(page, 'the first night');

// ---------- A second phone ----------
step('a second phone');
await page.goto(base + '#/more');
await page.fill('#moveName', 'Boston to Oakland');
await page.press('#moveName', 'Tab');
await page.click('[data-act="send"]');
const listLink = await page.locator('#sheetLink').inputValue();
assert.ok(listLink.startsWith(base + '#l/'), 'the list goes in a link');
await page.click('#sheetCopy');
assert.equal(await page.evaluate(() => navigator.clipboard.readText()), listLink);
await page.click('.sheet [data-close]');

const sam = await device('sam');
await sam.page.goto(listLink);
await sam.page.locator('[data-act="take"]').waitFor();
assert.match(await text(sam.page), /Boston to Oakland.*5 boxes/s);
await sam.page.click('[data-act="take"]');
await sam.page.waitForURL(/#\/$/);
assert.equal(await sam.page.locator('.boxrow').count(), 5);
// The same label opens in Sam's list too: it's the same move.
await sam.page.goto(labelLink);
await sam.page.waitForURL(/#\/box\//);
// Both pack a box 6 at the same time.
await packBox(sam.page, { from: 'Garage', things: ['Drill', 'Hex keys'] });
await packBox(page, { from: 'Kitchen', things: ['Pans'] });
await sam.page.goto(base + '#/more');
await sam.page.click('[data-act="send"]');
const back = await sam.page.locator('#sheetLink').inputValue();
await page.goto(back);
await page.locator('[data-act="merge"]').waitFor();
const offer = await text(page);
assert.match(offer, /1\s+new box/);
assert.match(offer, /Two boxes will both be number 6/);
await page.click('[data-act="merge"]');
await page.waitForURL(/#\/$/);
await toastSays(page, /Merged: 1 new/);
assert.equal(await page.locator('.boxrow').count(), 7);
assert.match(await page.locator('.banner.warn').innerText(), /Two boxes are both number 6/);
await page.click('.banner.warn a');
await page.click('[data-act="renumber"]');
await toastSays(page, /Now Box 7/);
await page.goto(base + '#/');
assert.equal(await page.locator('.banner.warn').count(), 0, 'no clash any more');
// The ticks from the truck came through both ways.
await sam.page.goto(base + '#/truck/unload');
assert.match(await sam.page.locator('.truck-count').innerText(), /5 of 6 off the truck/);

// ---------- Backups ----------
step('backups');
await page.goto(base + '#/more');
const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="backup"]')]);
const saved = JSON.parse(await readFile(await download.path(), 'utf8'));
assert.equal(saved.app, 'this-side-up');
assert.equal(saved.list.boxes.filter(b => !b.gone).length, 7);
assert.equal(Object.keys(saved.photos).length, 1, 'the photo comes along');
assert.match(Object.values(saved.photos)[0], /^data:image\/jpeg;base64,/);
const [sheetCsv] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="csv"]')]);
const csvText = await readFile(await sheetCsv.path(), 'utf8');
assert.match(csvText, /^﻿"Number","Kind","Going to"/);
assert.match(csvText, /"1","Box","Kitchen","Kitchen","yes","","yes","","Kettle; Mugs; Coffee; French press; Tea"/);

const third = await device('third');
await third.page.goto(base + '#/more');
await third.page.setInputFiles('#fileIn', { name: 'move.this-side-up.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)) });
await toastSays(third.page, /Loaded 7 boxes and 1 photo/);
await third.page.goto(base + `#/box/${box1}`);
await third.page.locator('.ph img').waitFor({ timeout: 8000 });

// ---------- Rooms ----------
step('rooms');
await page.goto(base + '#/rooms');
const garage = page.locator('.room-list li', { has: page.locator('input[value="Garage"]') }).first();
await garage.locator('.room-name').fill('Workshop');
await garage.locator('.room-name').press('Tab');
await toastSays(page, /Renamed/);
await page.click('[data-add="to"]');
await page.click('.sheet [data-name="Nursery"]');
assert.ok(await page.locator('input[value="Nursery"]').count(), 'a room from the usual ones');
const nursery = page.locator('.room-list li', { has: page.locator('input[value="Nursery"]') });
await nursery.locator('[data-style]').click();
await page.click('.sheet .swatch[data-c="3"]');
await page.click('.sheet .swatch[data-s="7"]');
await page.click('#sheetGo');
await nursery.locator('[data-remove]').click();
assert.equal(await page.locator('input[value="Nursery"]').count(), 0, 'and gone again');
await fits(page, 'the rooms');

// ---------- The example ----------
step('the example');
const fresh = await device('fresh');
await fresh.page.goto(base);
await fresh.page.click('[data-act="example"]');
await fresh.page.locator('.banner').waitFor();
assert.ok(await fresh.page.locator('.boxrow').count() > 20, 'an example move to look around');
await fresh.page.click('[data-act="own"]');
await fresh.page.click('#sheetGo');
await fresh.page.waitForURL(/#\/new$/);
assert.equal(await fresh.page.inputValue('#num'), '1', 'their own list starts at 1');

// ---------- Every project's checks ----------
step('offline');
for (const where of ['#/', '#/truck', '#/print', '#/more']) {
  await page.goto(base + where);
  await page.waitForTimeout(150);
  await fits(page, where);
}
await page.goto(base);
await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 15000 }).catch(() => {});
await mark.ctx.setOffline(true);
await page.reload();
assert.ok(await page.title(), 'the page did not load offline');
await page.locator('.boxrow').first().waitFor();
await page.goto(base + '#/truck');
await page.locator('.keys').waitFor();
await mark.ctx.setOffline(false);

assert.deepEqual(problems.filter(p => !/failed: /.test(p)), [], 'problems while using it');
await browser.close();
server.close();
await rm(tmp, { recursive: true, force: true });
console.log('all good');
