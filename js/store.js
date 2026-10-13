// Saving in this browser: the list in localStorage, box photos in IndexedDB, and a few settings.
// Nothing leaves the phone unless you send a link or save a backup file.
import { cleanList } from './model.js';

const KEY = 'this-side-up.v1';
const PREFS = 'this-side-up.prefs';
const DRAFT = 'this-side-up.draft';
const DB = 'this-side-up';

// What's saved, as it's saved (what this tab last read or wrote, so it can tell when another tab has saved).
const readRaw = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
let lastRaw = readRaw();

// A saved list that can't be read is put aside (this-side-up.v1.unreadable) rather than written over.
function readList(raw = readRaw()) {
  if (!raw) return null;
  let list = null;
  try { list = cleanList(JSON.parse(raw)); } catch { list = null; }
  if (!list) {
    try { localStorage.setItem(KEY + '.unreadable', raw); } catch { /* nowhere to put it */ }
  }
  return list;
}

// Makes `into` hold what `from` holds, keeping the same object for each box and room that's in both (and the same
// arrays), so a screen that's holding a box, a room or the list still has the live one after another tab saves.
export function adopt(into, from) {
  const same = (old, fresh, key) => {
    const had = new Map(old.map(x => [x[key], x]));
    const now = fresh.map(x => {
      const o = had.get(x[key]);
      if (!o) return x;
      for (const k of Object.keys(o)) if (!(k in x)) delete o[k];
      return Object.assign(o, x);
    });
    old.splice(0, old.length, ...now);
    return old;
  };
  const boxes = same(into.boxes, from.boxes, 'uid');
  const rooms = same(into.rooms, from.rooms, 'id');
  for (const k of Object.keys(into)) if (!(k in from)) delete into[k];
  Object.assign(into, from, { boxes, rooms });
  return into;
}

const DEFAULT_PREFS = {
  sheet: '5164',            // which label sheet
  nudge: {},                // sheet id -> { x, y } in the sheet's unit
  paper: '',                // door signs: 'letter' or 'a4' ('' = by language)
  group: 'number',          // the box list: 'number' or 'room'
  stage: 'load',            // the truck: 'load' or 'unload'
  lastFrom: '', lastTo: '', // the rooms the last box was packed in, for the next one
  hideFirst: [],            // first-night things ticked off as not needed
};

function readPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS));
    if (p && typeof p === 'object') return { ...DEFAULT_PREFS, ...p };
  } catch { /* start fresh */ }
  return { ...DEFAULT_PREFS };
}

export const store = {
  key: KEY,
  list: readList(lastRaw),
  prefs: readPrefs(),

  save() {
    const raw = store.list ? JSON.stringify(store.list) : null;
    try {
      if (raw) localStorage.setItem(KEY, raw); else localStorage.removeItem(KEY);
      lastRaw = raw;
    } catch { /* full or blocked: it still works for this visit */ }
    // Anything that shows a count of the list (the red number on Print) brings itself up to date.
    globalThis.dispatchEvent?.(new Event('listsaved'));
  },
  savePrefs() {
    try { localStorage.setItem(PREFS, JSON.stringify(store.prefs)); } catch { /* not saved, still works */ }
  },
  // Another tab saved (the installed app and a tab a label opened share one list), or this one was asleep while it
  // did: take what's saved now. The same list comes into the objects this tab already has, so whatever a screen
  // does next goes into the live list. Says 'same' (nothing new), 'changed' or 'replaced' (another list, or none).
  sync() {
    const raw = readRaw();
    if (raw === lastRaw) return 'same';
    lastRaw = raw;
    const fresh = readList(raw);
    if (store.list && fresh && fresh.id === store.list.id) { adopt(store.list, fresh); return 'changed'; }
    store.list = fresh;
    return 'replaced';
  },
};

// ---------- Drafts ----------
// The box being packed, and boxes being changed, kept as they're typed: a reload, a tap on another tab or a phone
// that locks mid-box doesn't lose them. Saving the box clears its draft.
//   { tabs: { tab: { box, autoTo, autoNum, at } }, edits: { uid: { box, autoTo, at } } }
// Each tab packs its own new box, so two tabs (the installed app and a tab a label opened) don't share one. A tab
// keeps its id through a reload, and holds a lock named after it while it's open: a box left in a tab that's gone
// (closed, or the phone shut the app) is picked up by the next tab that packs, rather than lost.
const TAB_KEY = 'this-side-up.tab';
const LOCK = 'this-side-up.tab.';
const tab = (() => {
  let id = '';
  try { id = sessionStorage.getItem(TAB_KEY) || ''; } catch { /* no session storage: an id for this page */ }
  if (!id) {
    id = Math.random().toString(36).slice(2, 10);
    try { sessionStorage.setItem(TAB_KEY, id); } catch { /* it lasts as long as the page, then */ }
  }
  return id;
})();
// Held until the tab closes. On a reload the page before may still hold it for a moment: this waits its turn.
function holdTab() {
  try {
    navigator.locks?.request(LOCK + tab, () => new Promise(() => {})).catch(() => { /* no locks: drafts are shared, as before */ });
  } catch { /* no locks here */ }
}

// The tabs open now, by id, or null where the browser can't say.
async function openTabs() {
  try {
    const { held = [] } = await navigator.locks.query();
    return new Set(held.map(l => l.name).filter(n => n.startsWith(LOCK)).map(n => n.slice(LOCK.length)));
  } catch { return null; }
}

function readDrafts() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT));
    if (d && typeof d === 'object') {
      const tabs = d.tabs && typeof d.tabs === 'object' ? d.tabs : {};
      if (d.new?.box) tabs.before = d.new; // kept before tabs had their own
      return { tabs, edits: d.edits && typeof d.edits === 'object' ? d.edits : {} };
    }
  } catch { /* nothing kept */ }
  return { tabs: {}, edits: {} };
}

function writeDrafts(d) {
  try {
    if (Object.keys(d.tabs).length || Object.keys(d.edits).length) localStorage.setItem(DRAFT, JSON.stringify({ tabs: d.tabs, edits: d.edits }));
    else localStorage.removeItem(DRAFT);
  } catch { /* full or blocked: it still works for this visit */ }
}

// A few at most: the oldest goes first.
const newest = (o, n) => Object.fromEntries(Object.entries(o).sort((a, b) => (b[1]?.at || 0) - (a[1]?.at || 0)).slice(0, n));

export const drafts = {
  // A box being changed (uid), or the new box this tab is packing (no uid).
  get: uid => { const d = readDrafts(); return (uid ? d.edits[uid] : d.tabs[tab]) || null; },
  // Are there new boxes being packed in other tabs (open or not)?
  left: () => Object.keys(readDrafts().tabs).some(id => id !== tab),
  // The new box this tab is packing; if it has none, the newest one left by a tab that isn't open any more.
  async claim() {
    const d = readDrafts();
    if (d.tabs[tab]) return d.tabs[tab];
    const open = await openTabs();
    const left = Object.entries(d.tabs).filter(([id]) => id !== tab && !open?.has(id)).sort((a, b) => (b[1]?.at || 0) - (a[1]?.at || 0))[0];
    if (!left) return null;
    const now = readDrafts();
    if (!now.tabs[left[0]]) return null;
    now.tabs[tab] = now.tabs[left[0]];
    delete now.tabs[left[0]];
    writeDrafts(now);
    return now.tabs[tab];
  },
  set(uid, value) {
    const d = readDrafts();
    if (uid) {
      if (value) d.edits[uid] = { ...value, at: Date.now() }; else delete d.edits[uid];
      d.edits = newest(d.edits, 6);
    } else {
      if (value) d.tabs[tab] = { ...value, at: Date.now() }; else delete d.tabs[tab];
      d.tabs = newest(d.tabs, 6);
    }
    writeDrafts(d);
  },
  clear() { try { localStorage.removeItem(DRAFT); } catch { /* nothing to clear */ } },
  // Photos taken for a box that isn't saved yet.
  photos() {
    const d = readDrafts();
    return [...Object.values(d.tabs), ...Object.values(d.edits)].flatMap(x => (Array.isArray(x?.box?.photos) ? x.box.photos : []));
  },
};
if (typeof window !== 'undefined') holdTab();

// ---------- Photos ----------

let dbp = null;
function db() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      if (!('indexedDB' in globalThis)) { reject(new Error('no IndexedDB')); return; }
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('photos');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbp.catch(() => { dbp = null; });
  }
  return dbp;
}

async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction('photos', mode);
    const s = t.objectStore('photos');
    const out = fn(s);
    // A request's answer can be undefined (a photo that isn't on this phone): that's the answer, not the request.
    t.oncomplete = () => resolve(typeof IDBRequest !== 'undefined' && out instanceof IDBRequest ? out.result : out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

// Photo ids start with when they were taken, so a sweep can tell an old orphan from a photo in a box
// that's still being packed (in this tab or another).
export const photoId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const takenAt = id => parseInt(String(id).slice(1, -4), 36) || 0;

export const photos = {
  put: (id, blob) => tx('readwrite', s => { s.put(blob, id); }),
  get: id => tx('readonly', s => s.get(id)).then(b => (b instanceof Blob ? b : null)).catch(() => null),
  remove: id => tx('readwrite', s => { s.delete(id); }).catch(() => {}),
  keys: () => tx('readonly', s => s.getAllKeys()).catch(() => []),
  // Photos no box mentions any more (taken for a box that was never saved), a day or more old. A box still being
  // packed keeps its photos, however long it's been.
  async sweep(list) {
    if (!list) return 0;
    const used = new Set([...list.boxes.flatMap(b => b.photos), ...drafts.photos()]);
    let n = 0;
    for (const id of await photos.keys()) {
      const at = takenAt(id);
      if (used.has(id) || !at || Date.now() - at < 86400000) continue;
      await photos.remove(id);
      n++;
    }
    return n;
  },
};

// Shrinks a photo from the camera to at most 1280 px on its long side, as a JPEG.
export async function shrink(file, max = 1280) {
  let bitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { bitmap = null; }
  if (!bitmap) {
    const url = URL.createObjectURL(file);
    try {
      bitmap = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
      });
    } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
  const w = bitmap.width, h = bitmap.height, k = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext('2d').drawImage(bitmap, 0, 0, c.width, c.height);
  return new Promise(resolve => c.toBlob(b => resolve(b || file), 'image/jpeg', 0.78));
}

export const blobToDataURL = blob => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

// Built by hand rather than with fetch(), which would count as a request.
export function dataURLToBlob(url) {
  const [head, body = ''] = String(url).split(',');
  const type = head.match(/^data:([^;,]+)/)?.[1] || 'image/jpeg';
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}
