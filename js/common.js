// Pieces several screens draw: a box's tile and row, a room's sticker, and whether a label needs printing.
import * as M from './model.js';
import { styleOf, SHAPES } from './rooms.js';
export { labelSig, needsLabel } from './payload.js';
import { esc, flagIcon, icon } from './ui.js';


// A room's sticker: its shape, filled with its colour.
export const dot = (room, cls = '') => {
  if (!room || room.side !== 'to') return '';
  const st = styleOf(room);
  return `<svg class="dot${cls ? ' ' + cls : ''}" viewBox="-1 -1 26 26" aria-hidden="true"><path d="${SHAPES[st.shape].d}" fill="${st.hex}" stroke="rgba(35, 22, 10, .6)" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
};
const SHAPE_NAMES = ['circle', 'triangle', 'square', 'diamond', 'star', 'hexagon', 'cross', 'heart'];
export const shapeName = i => SHAPE_NAMES[i] || '';

export function tile(box, list, cls = '') {
  return `<span class="tile${box.kind === 'piece' ? ' piece' : ''}${cls ? ' ' + cls : ''}" data-digits="${String(box.n).length}" aria-hidden="true"><b>${box.n}</b>${dot(M.room(list, box.to))}</span>`;
}

export const flagList = box => M.FLAGS.filter(f => box[f]);

// The words in a line that matched a search, marked.
function marked(text, query) {
  const words = M.norm(query).split(/\s+/).filter(w => w.length > 1);
  if (!words.length) return esc(text);
  const n = M.norm(text);
  const spans = [];
  for (const w of words) {
    for (const v of [w, w.replace(/e?s$/, '')]) {
      if (v.length < 2) continue;
      let at = n.indexOf(v);
      if (at >= 0) { spans.push([at, at + v.length]); break; }
    }
  }
  if (!spans.length) return esc(text);
  spans.sort((a, b) => a[0] - b[0]);
  let out = '', pos = 0;
  for (const [a, b] of spans) {
    if (a < pos) continue;
    out += esc(text.slice(pos, a)) + '<mark>' + esc(text.slice(a, b)) + '</mark>';
    pos = b;
  }
  return out + esc(text.slice(pos));
}

export function stageNote(box) {
  if (box.unpacked) return `<span class="status off">${icon('check', 'icon xs')}Unpacked</span>`;
  if (box.arrived) return `<span class="status on">${icon('check', 'icon xs')}Arrived</span>`;
  if (box.loaded) return `<span class="status on">${icon('check', 'icon xs')}On the truck</span>`;
  return '';
}

export function boxRow(box, list, { hit = null, query = '' } = {}) {
  const to = M.room(list, box.to), from = M.room(list, box.from);
  const lines = box.kind === 'piece' ? box.items.slice(1) : box.items;
  let things;
  if (hit && hit.lines.length) {
    things = hit.lines.map(i => marked(box.items[i], query)).join(' · ');
  } else {
    things = lines.map(esc).join(' · ') || '<span class="hint">Nothing listed yet</span>';
  }
  const headline = box.kind === 'piece' ? `<b class="piece-name">${esc(box.items[0] || 'Furniture')}</b>` : '';
  return `
    <li><a class="boxrow${box.unpacked ? ' done' : ''}" href="#/box/${box.uid}" data-uid="${box.uid}">
      ${tile(box, list)}
      <span class="what">
        <span class="where">${headline}${to ? esc(to.name) : '<span class="hint">No room yet</span>'}${from && (!to || M.norm(from.name) !== M.norm(to.name)) ? `<small>from ${esc(from.name)}</small>` : ''}</span>
        <span class="things">${things}</span>
        ${stageNote(box)}
      </span>
      <span class="flags">${flagList(box).map(f => flagIcon(f)).join('')}</span>
    </a></li>`;
}
