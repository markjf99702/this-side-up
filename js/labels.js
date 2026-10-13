// The paper: box labels, door signs for the new place, and a test sheet for lining up label sheets.
// Everything inside a label is sized in em, and the label's font size comes from its own size, so one
// label works at 3⅓ × 4 in, 8½ × 5½ in or on a phone screen. On paper --u is 1in; on screen it's
// whatever makes the label fit (see .lab-frame in the CSS).
import { room } from './model.js';
import { styleOf, shapeSVG } from './rooms.js';
import { esc, flagIcon, upMark } from './ui.js';
import { qrSVG } from './qr.js';
import { boxLink } from './payload.js';
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

// A few words for the label, in order, until there's no room: the label shows what fits and says how many more.
function shortList(items, more, budget) {
  const out = [];
  let used = 0;
  for (const it of items) {
    if (out.length && used + it.length > budget) break;
    out.push(it);
    used += it.length + 3;
  }
  const left = items.length - out.length + more;
  return { shown: out, left };
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

// One label. `w` and `h` are its size in inches.
export function label(d, { w = 4, h = 10 / 3, qr = true } = {}) {
  const tall = h > w * 1.05;
  const digits = String(d.n).length;
  // The room's name as big as the band takes: 4.1em, smaller for a long name.
  const room = d.to ? Math.max(2.2, Math.min(4.1, ((tall ? 21.3 : 33.3 * w / h - 11.4) - 0.3) / capsWidth(d.to.name))) : 0;
  const roomStyle = d.to ? `--rc:${d.to.hex};--ri:${d.to.ink};--rn:${room.toFixed(2)}em;` : '';
  const piece = d.kind === 'piece';
  const name = piece ? d.items[0] || 'Furniture' : '';
  const rest = piece ? d.items.slice(1) : d.items;
  const flags = [
    d.fragile && `<span class="lab-flag lab-fragile">${flagIcon('fragile')}Fragile</span>`,
    d.first && `<span class="lab-flag lab-first">${flagIcon('first')}Open first</span>`,
    d.heavy && `<span class="lab-flag lab-heavy">${flagIcon('heavy')}Heavy</span>`,
    d.car && `<span class="lab-flag lab-car">${flagIcon('car')}${tall || w > 5 ? 'Goes in the car' : 'In the car'}</span>`,
  ].filter(Boolean);
  // Where it's coming from, when that isn't a room of the same name.
  const from = d.from && (!d.to || d.from.trim().toLowerCase() !== d.to.name.trim().toLowerCase()) ? `<span class="lab-from">from ${esc(d.from)}</span>` : '';
  // Roughly how many characters of contents fit: two lines across the label, three without flags.
  const perLine = Math.round((tall ? w : w) * 15);
  const lines = (tall ? 3 : 2) + (flags.length || from ? 0 : 1);
  const { shown, left } = shortList(rest, d.more, perLine * lines);
  return `
    <article class="lab ${tall ? 'tall' : 'wide'}${d.to ? '' : ' no-room'}${piece ? ' piece' : ''}" style="--lw:${w};--lh:${h};${roomStyle}" data-digits="${digits}" data-flags="${flags.length}">
      <header class="lab-room">
        ${d.to ? `<span class="lab-shape">${shapeSVG(d.to.shape)}</span>` : ''}
        <span class="lab-room-name">${d.to ? esc(d.to.name) : 'Room not picked'}</span>
        ${upMark('lab-up')}
      </header>
      <div class="lab-numwrap">
        <p class="lab-numrow"><span class="lab-kind">${piece ? 'No.' : 'Box'}</span><span class="lab-num">${d.n}</span></p>
        ${piece ? `<p class="lab-piece">${esc(name)}</p>` : ''}
      </div>
      <p class="lab-foot"><span class="lab-mark">${upMark('lab-up2')}This side up</span>${tall && from ? from : ''}</p>
      ${qr && d.link ? qrSVG(d.link, { label: `QR code for ${piece ? name : 'box ' + d.n}`, cls: 'lab-qr' }) : '<span class="lab-qr"></span>'}
      ${flags.length || (from && !tall) ? `<div class="lab-flags">${flags.join('')}${tall ? '' : from}</div>` : ''}
      <p class="lab-items">${shown.map(esc).join('<i> · </i>')}${left ? `<em>${shown.length ? ` + ${left} more` : `${left} things`}</em>` : ''}</p>
    </article>`;
}

// A label on the screen, scaled to fit its frame, stuck on a bit of cardboard.
export const onScreen = (d, size = [4, 10 / 3]) => `
  <div class="lab-frame" style="--lw:${size[0]}"><div class="lab-stuck">${label(d, { w: size[0], h: size[1] })}</div></div>`;

// Pages of labels for a sheet, with labels before `start` left blank. Each item of `ds` is a fromBox().
export function labelPages(ds, s, { start = 0, nudge = { x: 0, y: 0 }, outline = false } = {}) {
  const u = s.unit;
  const [pw, ph] = s.page.map(v => inches(v, u));
  return pages(s, ds.length, start).map(page => `
    <section class="page${s.cut ? ' cut' : ''}" style="--pw:${pw};--ph:${ph}">
      ${page.map(({ slot, i }) => {
        const x = inches(slot.x + (nudge.x || 0), u), y = inches(slot.y + (nudge.y || 0), u);
        const w = inches(slot.w, u), h = inches(slot.h, u);
        const pos = `--x:${x};--y:${y};--w:${w};--h:${h};--r:${inches(s.round, u)}`;
        if (i === null) return outline ? `<div class="slot empty" style="${pos}"></div>` : '';
        return `<div class="slot" style="${pos}">${label(ds[i], { w, h })}</div>`;
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
        <p class="sign-kicker">${upMark('sign-up')} Boxes with this colour go in here</p>
        <h2 class="sign-name">${esc(r.name)}</h2>
        <p class="sign-count">${count ? `${count} ${count === 1 ? 'box' : 'boxes'}` : ''}</p>
      </div>
    </section>`;
}
