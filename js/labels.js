// The paper: box labels, door signs for the new place, and a test sheet for lining up label sheets.
// Everything inside a label is sized in em, and the label's font size comes from its own size, so one
// label works at 3⅓ × 4 in, 8½ × 5½ in or on a phone screen. On paper --u is 1in; on screen it's
// whatever makes the label fit (see .lab-frame in the CSS).
import { room } from './model.js';
import { styleOf, shapeSVG } from './rooms.js';
import { esc, flagIcon, upMark } from './ui.js';
import { qrSVG } from './qr.js';
import { boxLink, readBoxFragment, base } from './payload.js';
import { slots, pages } from './sheets.js';

// A room as a label draws it: its name, colour and shape.
function face(name, r) {
  const st = styleOf(r);
  return { name, hex: st.hex, ink: st.ink, shape: st.shape, colour: st.colour, colourName: st.name };
}

// What a label shows, from a box in the list...
export function fromBox(box, list) {
  const to = room(list, box.to), from = room(list, box.from);
  return {
    n: box.n, kind: box.kind, items: box.items, more: 0,
    to: to ? face(to.name, to) : null,
    from: from?.name || '',
    fragile: box.fragile, heavy: box.heavy, first: box.first, car: box.car,
    link: boxLink(box, list),
  };
}

// ...or from a label's own link, on a phone that doesn't have the list.
export function fromLink(p, link = '') {
  return {
    n: p.n, kind: p.kind, items: p.items, more: p.more,
    to: p.to ? face(p.to, { color: p.color, shape: p.shape }) : null,
    from: p.from,
    fragile: p.fragile, heavy: p.heavy, first: p.first, car: p.car,
    link,
  };
}

const inches = (v, unit) => (unit === 'mm' ? v / 25.4 : v);

// How wide a line of bold, condensed capitals is, in ems, measured with the real font in the page.
// Falls back to a generous guess where there's no page (or the font hasn't arrived).
const widths = new Map();
export function capsWidth(text, { weight = 860, stretch = '66%' } = {}) {
  const key = `${weight}|${stretch}|${text}`;
  if (widths.has(key)) return widths.get(key);
  let w = String(text).length * 0.5;
  if (typeof document !== 'undefined' && document.body) {
    const el = document.createElement('span');
    el.textContent = text;
    el.style.cssText = `position:absolute;left:-9999px;top:0;white-space:nowrap;font-family:Archivo,sans-serif;font-size:100px;font-weight:${weight};font-stretch:${stretch};text-transform:uppercase;letter-spacing:.005em`;
    document.body.append(el);
    w = el.getBoundingClientRect().width / 100;
    el.remove();
    if (document.fonts && document.fonts.status === 'loaded') widths.set(key, w);
  }
  return w;
}

// How wide a piece of a label is, in ems of its own font size, measured with the page's own fonts and styles.
// Where there's no page (the tests) it's the same measurement, made once by hand.
const own = new Map();
function ownWidth(key, html, fallback) {
  if (own.has(key)) return own.get(key);
  if (typeof document === 'undefined' || !document.body) return fallback;
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;white-space:nowrap;font-size:100px';
  host.innerHTML = html;
  document.body.append(host);
  const el = host.firstElementChild;
  const w = el.offsetWidth / parseFloat(getComputedStyle(el).fontSize);
  host.remove();
  if (!(w > 0)) return fallback;
  if (document.fonts && document.fonts.status === 'loaded') own.set(key, w);
  return w;
}

// The room's name as big as the band takes: up to 4.1em on one line, or two lines for a long name.
function fitBand(name, space) {
  const one = space / capsWidth(name);
  if (one >= 3 || !name.includes(' ')) return { size: Math.max(2.2, Math.min(4.1, one)), lines: [name] };
  const words = name.split(/\s+/);
  let best = null;
  for (let k = 1; k < words.length; k++) {
    const lines = [words.slice(0, k).join(' '), words.slice(k).join(' ')];
    const widest = Math.max(...lines.map(l => capsWidth(l)));
    if (!best || widest < best.widest) best = { lines, widest };
  }
  const two = Math.min(2.9, space / best.widest);
  return two > one ? { size: two, lines: best.lines } : { size: Math.max(2.2, one), lines: [name] };
}

// ---------- Fitting it all on ----------
// Everything on a label is sized in ems of the label's own font size, and the label's height is fixed, so what
// fits is arithmetic: the room band, the number, the flags and the code each take a known height, and the list of
// what's inside gets the lines that are left. Nothing runs into the code, so it always scans. The flags shrink to
// stay on one row where they can. These numbers are the label's CSS (css/app.css, "The label"): change both.
const ROOM_H = 6.2;
const QR = 15, QR_GAP = 0.9;
const FLAG_H = 2.19;                 // a flag's height in its own ems (the FRAGILE stamp is the tallest)
const FLAGS_GAP = 0.9, ROW_GAP = 0.5, FLAG_GAP = 0.6;
const FROM_FONT = 1.45, FROM_H = FROM_FONT * 1.15;
const ITEM_FONT = 1.62, LINE = ITEM_FONT * 1.22, LIST_GAP = ITEM_FONT * 0.7;
const XITEM_FONT = 1.75, XLINE = XITEM_FONT * 1.32, XLIST_GAP = XITEM_FONT * 1.1;
// The number's size (1, 2, 3 or 4 digits), and a piece of furniture's, which leaves room for its name.
const NUM_FONT = { tall: [17.5, 17.5, 14, 10.5], wide: [15, 15, 13.2, 10], xwide: [18.5, 15, 11.5, 9] };
const PIECE_FONT = { tall: [10, 10, 10, 10], wide: [7, 7, 6.2, 4.9], xwide: [10, 10, 10, 10] };
const PIECE_NAME = 3;
const DIGIT = 0.49, KIND_W = 2.65;   // a stencilled digit's width in its own ems; the "BOX" beside the number
const XNUM_MAX = 17, XQR = 15, XGAPS = 3.2, XLIST_PAD = 2.6; // a half sheet's columns

const FLAG_ORDER = ['fragile', 'first', 'heavy', 'car'];
const FLAG_TEXT = { fragile: 'Fragile', first: 'Open first', heavy: 'Heavy', car: 'Goes in the car', carShort: 'In the car' };
const FLAG_WIDTH = { fragile: 6.93, first: 8.2, heavy: 5.9, car: 10.57, carShort: 7.88 }; // in their own ems
const flagHTML = (f, short) => `<span class="lab-flag lab-${f}">${flagIcon(f)}${FLAG_TEXT[f === 'car' && short ? 'carShort' : f]}</span>`;
const flagWidth = (f, short) => {
  const k = f === 'car' && short ? 'carShort' : f;
  return ownWidth('flag|' + k, flagHTML(f, short), FLAG_WIDTH[k]);
};
const fromWidth = text => ownWidth('from|' + text, `<span class="lab-from">from ${esc(text)}</span>`, (text.length + 5) * 0.56);
// What goes after the flags when there's no line for the list (inner HTML of .lab-snip), in the list's ems.
const snipWidth = html => ownWidth('snip|' + html, `<span class="lab-snip">${html}</span>`, html.replace(/<[^>]*>|&nbsp;/g, ' ').replace(/&\w+;/g, '&').length * 0.55);
const countWidth = text => snipWidth(`<em>${esc(text)}</em>`);

// Flags into rows `room` ems wide: as big as they can be while they still fit on one row, with "In the car" for
// "Goes in the car" if that's what it takes. Rows of the biggest size when even the smallest won't fit on one.
function flagRows(fl, room, sizes, oneRow = false) {
  const rowsAt = (ff, short) => {
    const rows = [];
    let x = 0;
    for (const f of fl) {
      const wd = flagWidth(f, short) * ff;
      if (rows.length && x + FLAG_GAP + wd <= room * 0.98) { rows[rows.length - 1].push(f); x += FLAG_GAP + wd; } else { rows.push([f]); x = wd; }
    }
    return { ff, short, rows: rows.length, last: x };
  };
  for (const ff of sizes) {
    for (const short of fl.includes('car') ? [false, true] : [false]) {
      const r = rowsAt(ff, short);
      if (r.rows <= 1 && r.last <= room * 0.98) return r;
    }
  }
  return oneRow ? { ...rowsAt(sizes[sizes.length - 1], true), rows: 1 } : rowsAt(sizes[0], true);
}

// A few things for the label, in order, until there's no room: it shows what fits and says how many more.
// A few characters a line go to words that wrap onto the next one.
function shortList(items, more, lines, perLine) {
  if (lines < 1) return { shown: [], left: 0 };
  const cap = lines * (perLine - 4);
  const all = items.reduce((a, t) => a + t.length + 3, -3);
  if (!more && all <= cap) return { shown: items, left: 0 };
  // Not everything fits, so keep room to say how many more (a first thing too long for the room is cut short).
  const out = [];
  let used = 0;
  for (const it of items) {
    const room = cap - used - 11;
    if (out.length && it.length > room) break;
    out.push(out.length ? it : cut(it, Math.max(8, room)));
    used += out[out.length - 1].length + 3;
  }
  return { shown: out, left: items.length - out.length + more };
}

// A half sheet's list, a thing a line (or two, for a long one), and the last line saying how many more.
function listFit(items, more, lines, perLine) {
  const cost = t => Math.min(2, Math.max(1, Math.ceil(t.length / perLine)));
  if (lines < 1) return { shown: [], left: 0 };
  if (!more && items.reduce((a, t) => a + cost(t), 0) <= lines) return { shown: items, left: 0 };
  const out = [];
  let used = 0;
  for (const it of items) {
    if (used + cost(it) > lines - 1) break;
    out.push(it);
    used += cost(it);
  }
  return { shown: out, left: items.length - out.length + more };
}

// Words up to `n` characters, cut at a space where there's one, and an ellipsis.
function cut(text, n) {
  if (text.length <= n) return text;
  const s = text.slice(0, n - 1);
  const at = s.lastIndexOf(' ');
  return (at > n / 2 ? s.slice(0, at) : s).replace(/[\s,;:·-]+$/, '') + '…';
}

// Where everything goes on a label `w` by `h` inches, and how much of the list fits.
export function layout(d, { w = 4, h = 10 / 3, edge = false } = {}) {
  const tall = h > w * 1.05;
  const kind = tall ? 'tall' : w >= h * 1.4 ? 'xwide' : 'wide'; // a half sheet: the list gets a column of its own
  const em = tall ? Math.min(w / 35, h / 50) : h / 33.3;      // inches to the em (the CSS says the same)
  const W = w / em, H = h / em, pad = edge ? 0.25 / em : 1.15;
  const cw = W - 2 * pad, ch = H - 2 * pad;
  const piece = d.kind === 'piece';
  const digits = String(d.n).length;
  const size = (piece ? PIECE_FONT : NUM_FONT)[kind][Math.min(4, digits) - 1];
  // The number, and under a piece of furniture, its name on one line or two.
  const name = piece ? d.items[0] || 'Furniture' : '';
  const nameLines = piece ? (capsWidth(name) * PIECE_NAME > cw - 0.5 ? 2 : 1) : 0;
  const numH = 1 + size * 0.82 + (piece ? 0.2 * PIECE_NAME + nameLines * PIECE_NAME * 0.95 : 0);

  const fl = FLAG_ORDER.filter(f => d[f]);
  const from = d.from && (!d.to || d.from.trim().toLowerCase() !== d.to.name.trim().toLowerCase()) ? d.from : '';
  const sizes = fl.length <= 2 ? [1.85, 1.65, 1.5] : [1.5, 1.35, 1.25];
  const f = fl.length ? flagRows(fl, cw, kind === 'xwide' ? [...sizes, 1.1] : sizes, kind === 'xwide') : { ff: 1.85, short: false, rows: 0, last: 0 };
  // Where it's coming from: beside the code on a tall label; on the others, at the end of the flags if it fits,
  // or a row of its own (a line of the list, on a half sheet).
  let fromAt = '';
  if (from) {
    const fw = fromWidth(from) * FROM_FONT;
    if (tall) fromAt = 'foot';
    else if (!fl.length || f.last + FLAG_GAP + fw <= cw * 0.98) fromAt = 'flags';
    else fromAt = kind === 'xwide' ? 'list' : 'row';
  }
  const rowsH = f.rows ? f.rows * FLAG_H * f.ff + (f.rows - 1) * ROW_GAP : 0;
  let flagsH = fromAt === 'flags' ? Math.max(rowsH, FROM_H) : rowsH;
  if (fromAt === 'row') flagsH += ROW_GAP + FROM_H;
  const block = flagsH ? flagsH + (kind === 'xwide' ? 1 : FLAGS_GAP) : 0;

  let lines, perLine;
  if (kind === 'xwide') {
    lines = Math.max(0, Math.floor((ch - ROOM_H - block - XLIST_GAP + 0.3) / XLINE));
    // The list's column is what the number (or the furniture's name) and the code leave.
    const numW = Math.min(XNUM_MAX, Math.max(KIND_W + DIGIT * digits * size, piece ? capsWidth(name) * PIECE_NAME : 0));
    perLine = Math.max(6, Math.floor((cw - XQR - XGAPS - numW - XLIST_PAD) / (XITEM_FONT * 0.56)));
  } else {
    const free = kind === 'tall' ? ch - ROOM_H - numH - block - QR - QR_GAP + 0.4 : ch - ROOM_H - QR - block + 0.5;
    lines = Math.max(0, Math.floor((free - LIST_GAP) / LINE));
    perLine = Math.floor(cw / (ITEM_FONT * 0.56));
  }
  // No line left for what's inside (four flags on a small label): the first things go after the flags, in the
  // room left on their row, or at least how many there are.
  let snip = 0;
  const things = piece ? 0 : d.items.length + (d.more || 0);
  if (kind !== 'xwide' && !lines && things && fl.length && fromAt !== 'flags') {
    const room = cw * 0.98 - f.last - FLAG_GAP;
    if (room >= countWidth(`${things} things`) * ITEM_FONT) snip = room;
  }
  return { kind, em, W, H, cw, ch, numH, nameLines, fl, ff: f.ff, short: f.short, rows: f.rows, from, fromAt, flagsH: block, lines, perLine, snip };
}

// One label. `w` and `h` are its size in inches.
export function label(d, { w = 4, h = 10 / 3, qr = true, edge = false } = {}) {
  const L = layout(d, { w, h, edge });
  const tall = L.kind === 'tall', xwide = L.kind === 'xwide';
  const digits = String(d.n).length;
  const band = d.to ? fitBand(d.to.name, (tall ? L.W - 13.7 : 33.3 * w / h - 11.4 - (edge ? 2 : 0)) - 0.3) : null;
  const roomStyle = d.to ? `--rc:${d.to.hex};--ri:${d.to.ink};--rn:${band.size.toFixed(2)}em;` : '';
  const piece = d.kind === 'piece';
  const name = piece ? d.items[0] || 'Furniture' : '';
  const rest = piece ? d.items.slice(1) : d.items;
  const flags = L.fl.map(f => flagHTML(f, L.short));
  const from = L.from ? `<span class="lab-from${L.fromAt === 'row' ? ' own' : ''}">from ${esc(L.from)}</span>` : '';
  // A half sheet lists them a line each, the last saying how many more if they don't all fit.
  const room = L.lines - (L.fromAt === 'list' ? Math.min(2, Math.ceil((L.from.length + 5) / L.perLine)) : 0);
  const { shown, left } = xwide ? listFit(rest, d.more, room, L.perLine) : shortList(rest, d.more, L.lines, L.perLine);
  // After the flags, when there's no line for the list: as many whole things as fit, or how many there are.
  let snip = '';
  if (L.snip) {
    const n = rest.length + (d.more || 0);
    const part = k => `<span>${rest.slice(0, k).map(esc).join('<i>&nbsp;· </i>')}</span>${n - k ? `<em>+ ${n - k} more</em>` : ''}`;
    let k = 0;
    while (k < rest.length && snipWidth(part(k + 1)) * ITEM_FONT <= L.snip) k++;
    snip = `<span class="lab-snip">${k ? part(k) : `<em>${n} ${n === 1 ? 'thing' : 'things'}</em>`}</span>`;
  }
  const list = xwide
    ? `<ul class="lab-items">${shown.map(t => `<li>${esc(t)}</li>`).join('')}${left && room > 0 ? `<li><em>+ ${left} more</em></li>` : ''}${L.fromAt === 'list' ? `<li class="lab-from-li">from ${esc(L.from)}</li>` : ''}</ul>`
    : L.lines ? `<p class="lab-items">${shown.map(esc).join('<i>&nbsp;· </i>')}${left ? (shown.length ? ` <em>+ ${left} more</em>` : `<em>${left} ${left === 1 ? 'thing' : 'things'}</em>`) : ''}</p>` : '';
  return `
    <article class="lab ${tall ? 'tall' : xwide ? 'wide xwide' : 'wide'}${d.to ? '' : ' no-room'}${piece ? ' piece' : ''}${edge ? ' edge' : ''}" style="--lw:${w};--lh:${h};--ff:${L.ff}em;--lines:${L.lines};${roomStyle}" data-digits="${digits}" data-flags="${flags.length}">
      <header class="lab-room">
        ${d.to ? `<span class="lab-shape">${shapeSVG(d.to.shape)}</span>` : ''}
        <span class="lab-room-name${band?.lines.length > 1 ? ' two' : ''}">${d.to ? band.lines.map(esc).join('<br>') : 'Room not picked'}</span>
        ${upMark('lab-up')}
      </header>
      <div class="lab-numwrap">
        <p class="lab-numrow"><span class="lab-kind">${piece ? 'No.' : 'Box'}</span><span class="lab-num">${d.n}</span></p>
        ${piece ? `<p class="lab-piece">${esc(name)}</p>` : ''}
      </div>
      <p class="lab-foot"><span class="lab-mark">${upMark('lab-up2')}This side up</span>${L.fromAt === 'foot' ? from : ''}</p>
      ${qr && d.link ? qrSVG(d.link, { label: `QR code for ${piece ? name : 'box ' + d.n}`, cls: 'lab-qr' }) : '<span class="lab-qr"></span>'}
      ${flags.length || L.fromAt === 'flags' || L.fromAt === 'row' ? `<div class="lab-flags" data-rows="${L.rows + (L.fromAt === 'row' ? 1 : 0)}">${flags.join('')}${snip}${L.fromAt === 'flags' || L.fromAt === 'row' ? from : ''}</div>` : ''}
      ${list}
    </article>`;
}

// The label on the welcome screen: the kettle's box. Its code works too, and shows what a mover's phone would.
export function sampleLabel() {
  const frag = 'b/demo/12/fo/00/Kitchen//1/Kettle~Mugs~Coffee~French+press~Tea+towels';
  return onScreen(fromLink(readBoxFragment(frag), base() + '#' + frag));
}

// A label on the screen, scaled to fit its frame, stuck on a bit of cardboard.
export const onScreen = (d, size = [4, 10 / 3]) => `
  <div class="lab-frame" style="--lw:${size[0]}"><div class="lab-stuck">${label(d, { w: size[0], h: size[1] })}</div></div>`;

// Pages of labels for a sheet, with labels before `start` left blank. Each item of `ds` is a fromBox().
export function labelPages(ds, s, { start = 0, nudge = { x: 0, y: 0 }, outline = false, limit = Infinity } = {}) {
  const u = s.unit;
  const [pw, ph] = s.page.map(v => inches(v, u));
  return pages(s, ds.length, start).slice(0, limit).map(page => `
    <section class="page${s.cut ? ' cut' : ''}" style="--pw:${pw};--ph:${ph}">
      ${page.map(({ slot, i }) => {
        const x = inches(slot.x + (nudge.x || 0), u), y = inches(slot.y + (nudge.y || 0), u);
        const w = inches(slot.w, u), h = inches(slot.h, u);
        const pos = `--x:${x};--y:${y};--w:${w};--h:${h};--r:${inches(s.round, u)}`;
        if (i === null) return outline ? `<div class="slot empty" style="${pos}"></div>` : '';
        return `<div class="slot" style="${pos}">${label(ds[i], { w, h, edge: !!s.edge })}</div>`;
      }).join('')}
      ${s.cut ? cutLines(s) : ''}
    </section>`).join('');
}

// Dashed lines to cut along on plain paper, running off the page edges.
function cutLines(s) {
  const u = s.unit;
  const xs = new Set(), ys = new Set();
  for (const p of slots(s)) { xs.add(p.x); xs.add(p.x + p.w); ys.add(p.y); ys.add(p.y + p.h); }
  const [pw, ph] = s.page.map(v => inches(v, u));
  return `<svg class="cuts" viewBox="0 0 ${pw} ${ph}" preserveAspectRatio="none" aria-hidden="true">
    ${[...xs].map(x => `<line x1="${inches(x, u)}" y1="0" x2="${inches(x, u)}" y2="${ph}"/>`).join('')}
    ${[...ys].map(y => `<line x1="0" y1="${inches(y, u)}" x2="${pw}" y2="${inches(y, u)}"/>`).join('')}
  </svg>`;
}

// The test sheet: every label's outline, numbered, and rulers to check the printer kept it true to size.
export function testPage(s, { nudge = { x: 0, y: 0 } } = {}) {
  const u = s.unit;
  const [pw, ph] = s.page.map(v => inches(v, u));
  const r = inches(s.round, u);
  return `
    <section class="page test" style="--pw:${pw};--ph:${ph}">
      ${slots(s).map((p, k) => {
        const x = inches(p.x + (nudge.x || 0), u), y = inches(p.y + (nudge.y || 0), u);
        return `<div class="slot outline" style="--x:${x};--y:${y};--w:${inches(p.w, u)};--h:${inches(p.h, u)};--r:${r}"><b>${k + 1}</b><span>${esc(s.name)}</span></div>`;
      }).join('')}
      ${(() => {
        const p = slots(s)[0];
        const x = inches(p.x + (nudge.x || 0), u) + inches(p.w, u) / 2, y = inches(p.y + (nudge.y || 0), u) + inches(p.h, u) / 2;
        return `<div class="ruler in" style="--x:${x - 1.5};--y:${y - 0.35}"><i></i><span>This line should be 3 inches long</span></div>
          <div class="ruler cm" style="--x:${x - 7 / 2.54 / 2};--y:${y + 0.25}"><i></i><span>and this one 7 cm</span></div>`;
      })()}
    </section>`;
}

// One sign per room at the new place, to tape on its door.
export function signPage(r, count, { paper = 'letter' } = {}) {
  const st = styleOf(r);
  const [pw, ph] = paper === 'a4' ? [297 / 25.4, 210 / 25.4] : [11, 8.5];
  // The name as big as it goes: its longest word has to fit across the right-hand side, in at most three lines.
  const across = (pw - 1) * 0.6 - 0.45;
  const words = r.name.split(/\s+/).filter(Boolean);
  const longest = Math.max(...words.map(w => capsWidth(w, { weight: 900, stretch: '64%' })), 1);
  const whole = capsWidth(r.name, { weight: 900, stretch: '64%' });
  let fs = Math.min(1.9, across / longest);
  while (fs > 0.6 && Math.ceil(whole * fs / across) * fs * 0.9 > ph - 2.4) fs -= 0.05;
  return `
    <section class="page sign" style="--pw:${pw};--ph:${ph};--rc:${st.hex};--ri:${st.ink};--fs:${fs.toFixed(2)}">
      <div class="sign-colour"><span class="sign-disc">${shapeSVG(st.shape, { cls: 'sign-shape' })}</span></div>
      <div class="sign-words">
        <p class="sign-kicker">${upMark('sign-up')} Boxes marked like this go in here</p>
        <h2 class="sign-name">${esc(r.name)}</h2>
        <p class="sign-count">${count ? `${count} ${count === 1 ? 'box' : 'boxes'}` : ''}</p>
      </div>
    </section>`;
}
