// The list: every box and piece of furniture in the move, the rooms at both ends, and what has happened to
// each one (on the truck, off at the other end, unpacked). No page code here, so the tests run it in Node.
import { DEFAULT_FROM, DEFAULT_TO, nextStyle, COLOURS, SHAPES } from './rooms.js';

export const MAX_NUMBER = 9999;
export const MAX_ITEMS = 80;
export const MAX_LINE = 90;
export const MAX_NAME = 40;
export const FLAGS = ['fragile', 'heavy', 'first', 'car'];

const rand = n => {
  let s = '';
  while (s.length < n) s += Math.random().toString(36).slice(2);
  return s.slice(0, n);
};
export const uid = (prefix = 'b') => prefix + rand(8);
export const moveId = () => rand(4);

// Cut by characters, not UTF-16 halves, so an emoji at the end isn't split in two.
const str = (v, max) => Array.from((typeof v === 'string' ? v : v == null ? '' : String(v)).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, max).join('').trim();
const id = v => (typeof v === 'string' && /^[a-z0-9_-]{1,24}$/i.test(v) ? v : '');
const time = v => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
const index = (v, n) => (Number.isInteger(v) && v >= 0 && v < n ? v : null);
export const tidyName = s => str(s, MAX_NAME);

// ---------- Making and tidying ----------

export function newList(now = Date.now()) {
  const list = { v: 1, id: moveId(), also: [], name: '', rooms: [], boxes: [], made: now };
  for (const name of DEFAULT_FROM) addRoom(list, 'from', name, now);
  for (const name of DEFAULT_TO) addRoom(list, 'to', name, now);
  return list;
}

export function addRoom(list, side, name, now = Date.now()) {
  const room = { id: uid('r'), side: side === 'from' ? 'from' : 'to', name: tidyName(name) || 'Room', edited: now, gone: 0 };
  if (room.side === 'to') Object.assign(room, nextStyle(list.rooms));
  list.rooms.push(room);
  return room;
}

export function cleanRoom(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const room = {
    id: id(raw.id) || uid('r'),
    side: raw.side === 'from' ? 'from' : 'to',
    name: tidyName(raw.name) || 'Room',
    edited: time(raw.edited),
    gone: time(raw.gone),
  };
  if (room.side === 'to') {
    room.color = index(raw.color, COLOURS.length) ?? 7;
    room.shape = index(raw.shape, SHAPES.length) ?? 0;
  }
  return room;
}

export function cleanItems(v) {
  const lines = Array.isArray(v) ? v : typeof v === 'string' ? v.split('\n') : [];
  return lines.map(l => str(l, MAX_LINE)).filter(Boolean).slice(0, MAX_ITEMS);
}

export function cleanBox(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const n = Math.floor(Number(raw.n));
  const box = {
    uid: id(raw.uid) || uid('b'),
    n: Number.isFinite(n) && n >= 0 && n <= MAX_NUMBER ? n : 0,
    kind: raw.kind === 'piece' ? 'piece' : 'box',
    from: id(raw.from),
    to: id(raw.to),
    items: cleanItems(raw.items),
    photos: Array.isArray(raw.photos) ? raw.photos.map(id).filter(Boolean).slice(0, 12) : [],
    made: time(raw.made),
    edited: time(raw.edited),
    printed: time(raw.printed),
    printedSig: typeof raw.printedSig === 'string' ? raw.printedSig.slice(0, 400) : '',
    loaded: time(raw.loaded), loadedAt: time(raw.loadedAt),
    arrived: time(raw.arrived), arrivedAt: time(raw.arrivedAt),
    unpacked: time(raw.unpacked), unpackedAt: time(raw.unpackedAt),
    gone: time(raw.gone),
  };
  for (const f of FLAGS) box[f] = raw[f] === true;
  return box;
}

export function cleanList(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.boxes)) return null;
  const list = {
    v: 1,
    id: id(raw.id) || moveId(),
    also: Array.isArray(raw.also) ? [...new Set(raw.also.map(id).filter(Boolean))].slice(0, 20) : [],
    name: str(raw.name, 60),
    rooms: (Array.isArray(raw.rooms) ? raw.rooms : []).slice(0, 200).map(cleanRoom).filter(Boolean),
    boxes: raw.boxes.slice(0, 5000).map(cleanBox).filter(Boolean),
    made: time(raw.made),
  };
  if (raw.example === true) list.example = true;
  // Two rooms or boxes with the same id would confuse everything after this: keep the first of each.
  const seen = new Set();
  list.rooms = list.rooms.filter(r => !seen.has(r.id) && seen.add(r.id));
  list.boxes = list.boxes.filter(b => !seen.has(b.uid) && seen.add(b.uid));
  return list;
}

// ---------- Reading ----------

export const live = list => list.boxes.filter(b => !b.gone).sort((a, b) => a.n - b.n || a.made - b.made);
export const rooms = (list, side) => list.rooms.filter(r => r.side === side && !r.gone);
export const room = (list, rid) => (rid ? list.rooms.find(r => r.id === rid) || null : null);
export const findNumber = (list, n) => live(list).filter(b => b.n === n);
export const byUid = (list, u) => list.boxes.find(b => b.uid === u) || null;

export function nextNumber(list) {
  const nums = live(list).map(b => b.n);
  return Math.min(MAX_NUMBER, (nums.length ? Math.max(...nums) : 0) + 1);
}

// What to call it in a sentence: "Box 12", or "Sofa (12)" for furniture.
export function title(box) {
  if (box.kind === 'piece') return box.items[0] ? `${box.items[0]}` : `Piece ${box.n}`;
  return `Box ${box.n}`;
}

export const flagWords = { fragile: 'Fragile', heavy: 'Heavy', first: 'Open first', car: 'Goes in the car' };

// Numbers that more than one box is wearing (two phones packing at once can do this).
export function clashes(list) {
  const by = new Map();
  for (const b of live(list)) by.set(b.n, [...(by.get(b.n) || []), b]);
  return [...by.values()].filter(v => v.length > 1);
}

// ---------- Changing ----------

export function newBox(list, fields = {}, now = Date.now()) {
  return cleanBox({ uid: uid('b'), n: nextNumber(list), kind: 'box', items: [], made: now, edited: now, ...fields });
}

export function putBox(list, box, now = Date.now()) {
  box.edited = now;
  const i = list.boxes.findIndex(b => b.uid === box.uid);
  if (i >= 0) list.boxes[i] = box; else list.boxes.push(box);
  return box;
}

export function removeBox(list, u, now = Date.now()) {
  const box = byUid(list, u);
  if (box) box.gone = now;
  return box;
}

// Moving day and after: on the truck, off at the other end, unpacked.
export const STAGES = {
  load: { field: 'loaded', at: 'loadedAt' },
  unload: { field: 'arrived', at: 'arrivedAt' },
  unpack: { field: 'unpacked', at: 'unpackedAt' },
};

export function setStage(box, stage, on, now = Date.now()) {
  const s = STAGES[stage];
  box[s.field] = on ? now : 0;
  box[s.at] = now;
  return box;
}

export const done = (box, stage) => !!box[STAGES[stage].field];

// The boxes still to tick, grouped by the room you'd look in: the room it's leaving while loading,
// the room it's going to after that.
export function missing(list, stage) {
  const side = stage === 'load' ? 'from' : 'to';
  const left = live(list).filter(b => !done(b, stage));
  const groups = new Map();
  for (const b of left) {
    const key = b[side] && room(list, b[side]) ? b[side] : '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(b);
  }
  const order = rooms(list, side).map(r => r.id);
  return [...groups.entries()]
    .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : order.indexOf(a) - order.indexOf(b)))
    .map(([rid, boxes]) => ({ room: room(list, rid), boxes }));
}

// For each room at one end: how many boxes are headed there or came from there, and how many are ticked.
export function progress(list, stage) {
  const side = stage === 'load' ? 'from' : 'to';
  const all = live(list);
  const out = rooms(list, side).map(r => {
    const mine = all.filter(b => b[side] === r.id);
    return { room: r, total: mine.length, done: mine.filter(b => done(b, stage)).length };
  }).filter(p => p.total);
  const loose = all.filter(b => !b[side] || !room(list, b[side]));
  if (loose.length) out.push({ room: null, total: loose.length, done: loose.filter(b => done(b, stage)).length });
  return out;
}

export function tally(list, sigOf = null) {
  const all = live(list);
  const count = f => all.filter(f).length;
  return {
    all: all.length,
    boxes: count(b => b.kind === 'box'),
    pieces: count(b => b.kind === 'piece'),
    fragile: count(b => b.fragile),
    heavy: count(b => b.heavy),
    first: count(b => b.first),
    car: count(b => b.car),
    loaded: count(b => b.loaded),
    arrived: count(b => b.arrived),
    unpacked: count(b => b.unpacked),
    toPrint: sigOf ? count(b => !b.printed || b.printedSig !== sigOf(b)) : 0,
  };
}

// ---------- Finding the kettle ----------

export const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, "'");

// Each word of the search has to be somewhere in the box: in a line of what's in it, a room, or a flag.
// "mugs" also finds "mug", and "12" or "box 12" goes straight to Box 12.
export function search(list, query) {
  const q = norm(query).trim();
  if (!q) return [];
  const numberOnly = q.match(/^(?:box|no\.?|#|number)?\s*(\d{1,4})$/);
  const terms = q.split(/\s+/).filter(t => t && !/^(box|the|a|an|my|in|of)$/.test(t));
  const variants = t => {
    const v = [t];
    if (t.length > 3 && t.endsWith('es')) v.push(t.slice(0, -2));
    if (t.length > 3 && t.endsWith('s')) v.push(t.slice(0, -1));
    return v;
  };
  const results = [];
  for (const box of live(list)) {
    if (numberOnly && box.n === Number(numberOnly[1])) { results.push({ box, score: 1000, lines: [], why: 'number' }); continue; }
    const to = room(list, box.to), from = room(list, box.from);
    const fields = [
      ...box.items.map((text, i) => ({ text: norm(text), line: i, weight: i === 0 ? 12 : 10 })),
      { text: norm(to?.name), weight: 6, room: 'to' },
      { text: norm(from?.name), weight: 4, room: 'from' },
      { text: [box.fragile && 'fragile glass', box.heavy && 'heavy', box.first && 'open first', box.car && 'car', box.kind === 'piece' && 'furniture piece'].filter(Boolean).join(' '), weight: 3 },
    ];
    let score = 0;
    const lines = new Set();
    let all = terms.length > 0;
    for (const t of terms) {
      let best = 0;
      for (const f of fields) {
        if (!f.text) continue;
        for (const v of variants(t)) {
          const at = f.text.indexOf(v);
          if (at < 0) continue;
          const wordStart = at === 0 || /[^a-z0-9]/.test(f.text[at - 1]);
          const s = f.weight + (wordStart ? 4 : 0) + (f.text === v ? 3 : 0);
          if (s > best) best = s;
          if (f.line !== undefined) lines.add(f.line);
          break;
        }
      }
      if (!best) { all = false; break; }
      score += best;
    }
    if (all) results.push({ box, score: score + (box.first ? 1 : 0), lines: [...lines].sort((a, b) => a - b), why: 'words' });
  }
  return results.sort((a, b) => b.score - a.score || a.box.n - b.box.n);
}

// ---------- Two phones, one list ----------

const INFO = ['n', 'kind', 'from', 'to', 'items', 'photos', ...FLAGS, 'made', 'edited'];
const sameName = (a, b) => norm(a).trim() === norm(b).trim();

// Folds another copy of the list into this one, box by box. The later change to a box's details wins,
// each tick (truck, arrived, unpacked) keeps its own latest change, and a box removed on either phone
// stays removed unless it was changed again after that.
export function merge(mine, theirs) {
  const out = JSON.parse(JSON.stringify(mine));
  const summary = { added: 0, updated: 0, removed: 0, rooms: 0 };
  const roomMap = new Map();
  for (const r of theirs.rooms) {
    const ours = out.rooms.find(x => x.id === r.id) || out.rooms.find(x => !x.gone && !r.gone && x.side === r.side && sameName(x.name, r.name));
    if (!ours) {
      if (!r.gone) summary.rooms++;
      out.rooms.push({ ...r });
      roomMap.set(r.id, r.id);
      continue;
    }
    roomMap.set(r.id, ours.id);
    if (ours.id === r.id && r.edited > ours.edited) Object.assign(ours, r);
  }
  for (const b of theirs.boxes) {
    const t = { ...b, from: roomMap.get(b.from) ?? b.from, to: roomMap.get(b.to) ?? b.to };
    const ours = out.boxes.find(x => x.uid === b.uid);
    if (!ours) {
      out.boxes.push(t);
      if (!t.gone) summary.added++;
      continue;
    }
    let changed = false;
    if (t.edited > ours.edited) {
      for (const k of INFO) ours[k] = Array.isArray(t[k]) ? [...t[k]] : t[k];
      changed = true;
    }
    for (const s of Object.values(STAGES)) {
      if (t[s.at] > ours[s.at]) { ours[s.field] = t[s.field]; ours[s.at] = t[s.at]; changed = true; }
    }
    if (t.printed > ours.printed) { ours.printed = t.printed; ours.printedSig = t.printedSig; }
    const goneBefore = !!ours.gone;
    const gone = Math.max(ours.gone, t.gone);
    ours.gone = gone && gone >= ours.edited ? gone : 0;
    if (!goneBefore && ours.gone) summary.removed++;
    else if (changed && !ours.gone) summary.updated++;
  }
  out.also = [...new Set([...mine.also, ...theirs.also, theirs.id].filter(x => x && x !== out.id))];
  if (!out.name && theirs.name) out.name = theirs.name;
  delete out.example;
  return { list: out, summary, clashes: clashes(out) };
}

// Is a box from this move? Labels carry the move's id, so another family's Box 12 doesn't open ours.
export const sameMove = (list, moveIdOnLabel) => !!list && (list.id === moveIdOnLabel || list.also.includes(moveIdOnLabel));
