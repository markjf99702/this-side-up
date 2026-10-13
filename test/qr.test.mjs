// Label QR codes, read back again. Each label's link is drawn the way a phone camera sees a 1½ inch code from
// about 25 cm away (a 1080p frame: roughly 139 pixels to the inch), a little soft, a little noisy and turned,
// and read with zxing-cpp, the same family of reader as Android's scanners.
//   node --test test/qr.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/model.js';
import { boxLink, readBoxFragment, QR_BYTES, SITE } from '../js/payload.js';
import { qrMatrix, qrSVG } from '../js/qr.js';
import { readQR } from './decode.mjs';

const T0 = 1_760_000_000_000;
const INCHES = 1.5;

// The code at `ppi` pixels to the inch, `inches` across including its quiet zone, then softened (box blur),
// with sensor noise and turned by `turn` degrees on a brown-grey box.
function picture(text, { ppi = 139, inches = INCHES, blur = 1, noise = 8, turn = 0, seed = 1 } = {}) {
  const m = qrMatrix(text);
  const quiet = 4, modules = m.n + quiet * 2;
  const size = inches * ppi, px = size / modules;
  const W = Math.ceil(size * 1.4);
  let lum = new Float32Array(W * W);
  const cos = Math.cos(turn * Math.PI / 180), sin = Math.sin(turn * Math.PI / 180), mid = W / 2;
  const AA = 3; // each pixel averages 3 x 3 samples, as a sensor would
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      let sum = 0;
      for (let sy = 0; sy < AA; sy++) for (let sx = 0; sx < AA; sx++) {
        const X = x + (sx + 0.5) / AA - mid, Y = y + (sy + 0.5) / AA - mid;
        const u = cos * X + sin * Y + size / 2, v = -sin * X + cos * Y + size / 2;
        let val = 150; // cardboard
        if (u >= 0 && v >= 0 && u < size && v < size) {
          const c = Math.floor(u / px) - quiet, r = Math.floor(v / px) - quiet;
          val = r >= 0 && c >= 0 && r < m.n && c < m.n && m.dark(r, c) ? 30 : 235;
        }
        sum += val;
      }
      lum[y * W + x] = sum / (AA * AA);
    }
  }
  for (let k = 0; k < blur; k++) {
    const out = new Float32Array(W * W);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const yy = y + dy, xx = x + dx;
        if (yy >= 0 && xx >= 0 && yy < W && xx < W) { s += lum[yy * W + xx]; n++; }
      }
      out[y * W + x] = s / n;
    }
    lum = out;
  }
  let a = seed;
  const rnd = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
  const rgba = new Uint8Array(W * W * 4);
  for (let i = 0; i < W * W; i++) {
    const v = Math.max(0, Math.min(255, Math.round(lum[i] + (rnd() - 0.5) * 2 * noise)));
    rgba[i * 4] = v; rgba[i * 4 + 1] = v; rgba[i * 4 + 2] = v; rgba[i * 4 + 3] = 255;
  }
  return { rgba, W, px };
}

function boxes() {
  const list = M.newList(T0);
  list.id = 'q7w2';
  const to = M.rooms(list, 'to'), from = M.rooms(list, 'from');
  const out = [];
  const add = f => out.push(M.putBox(list, M.newBox(list, f, T0), T0));
  add({ to: to[0].id, from: from[0].id, items: ['Kettle'] });
  add({ to: to[0].id, from: from[0].id, items: ['Kettle', 'Mugs', 'Coffee', 'French press', 'Tea towels', 'The good knives'], fragile: true, first: true });
  add({ to: to[1].id, from: from[1].id, kind: 'piece', items: ['Sofa (grey, three seats)'], heavy: true });
  add({ to: to[2].id, items: Array.from({ length: 40 }, (_, i) => `Book ${i + 1}: a long title to fill up the label`) });
  add({ to: to[3].id, from: from[3].id, items: ['Crème brûlée dishes', 'Mark’s “good” glasses', 'Teapot 🫖', '50% of the spices ~ jars'], fragile: true, car: true });
  add({ items: [] });
  add({ n: 9999, to: to[4].id, from: from[4].id, items: ['Ζ'.repeat(80), 'Кухонные полотенца и прихватки'] });
  return { list, out };
}

test('every label link fits a version 10 code, so its squares are over half a millimetre at 1½ inches', () => {
  const { list, out } = boxes();
  for (const box of out) {
    const link = boxLink(box, list, SITE);
    assert.ok(new TextEncoder().encode(link).length <= QR_BYTES, `box ${box.n}: ${link.length}`);
    const { version } = qrMatrix(link);
    assert.ok(version <= 10, `box ${box.n} needs version ${version}`);
    const squareMM = INCHES * 25.4 / (17 + 4 * version + 8);
    assert.ok(squareMM >= 0.58, `box ${box.n}: ${squareMM.toFixed(2)} mm squares`);
  }
});

test('label codes read back as the same box from 25 cm, soft, noisy and turned', async () => {
  const { list, out } = boxes();
  const views = [
    { blur: 0, noise: 0 },
    { turn: 6, seed: 2 },
    { turn: -14, seed: 3 },
    { ppi: 110, blur: 0, noise: 6, turn: 3, seed: 4 }, // about 32 cm away
  ];
  for (const box of out) {
    const link = boxLink(box, list, SITE);
    for (const view of views) {
      const { rgba, W, px } = picture(link, view);
      const got = await readQR(rgba, W, W);
      assert.equal(got.length, 1, `box ${box.n} reads at ${JSON.stringify(view)} (${px.toFixed(1)} px a square)`);
      assert.equal(got[0].text, link, `box ${box.n} reads back exactly`);
    }
    const back = readBoxFragment(link.split('#')[1]);
    assert.equal(back.n, box.n);
    assert.equal(back.move, 'q7w2');
    for (const f of ['fragile', 'first', 'car', 'heavy', 'kind']) assert.equal(back[f], box[f], `box ${box.n}: ${f}`);
    assert.equal(back.items.length + back.more, box.items.length, `box ${box.n} counts everything in it`);
    const plain = s => s.replace(/[’]/g, "'").replace(/[“”]/g, '"');
    assert.ok(back.items.every((t, i) => plain(box.items[i]).startsWith(t.replace(/\.\.\.$/, ''))), `box ${box.n}: the first things, in order`);
  }
});

test('the SVG draws exactly the code the matrix holds', () => {
  const text = SITE + '#b/q7w2/12/fo/00/Kitchen/Kitchen//Kettle~Mugs';
  const svg = qrSVG(text);
  const m = qrMatrix(text);
  assert.match(svg, new RegExp(`viewBox="0 0 ${m.n + 8} ${m.n + 8}"`));
  const grid = Array.from({ length: m.n }, () => Array(m.n).fill(false));
  for (const [, x, y, w] of svg.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    for (let k = 0; k < Number(w); k++) grid[Number(y) - 4][Number(x) - 4 + k] = true;
  }
  for (let r = 0; r < m.n; r++) for (let c = 0; c < m.n; c++) assert.equal(grid[r][c], m.dark(r, c), `module ${r},${c}`);
});
