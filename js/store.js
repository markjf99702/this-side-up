// Saving in this browser: the list in localStorage, box photos in IndexedDB, and a few settings.
// Nothing leaves the phone unless you send a link or save a backup file.
import { cleanList } from './model.js';

const KEY = 'this-side-up.v1';
const PREFS = 'this-side-up.prefs';
const DRAFT = 'this-side-up.draft';
const DB = 'this-side-up';

// A saved list that can't be read is put aside (this-side-up.v1.unreadable) rather than written over.
function readList() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { return null; }
  if (!raw) return null;
  let list = null;
  try { list = cleanList(JSON.parse(raw)); } catch { list = null; }
  if (!list) {
    try { localStorage.setItem(KEY + '.unreadable', raw); } catch { /* nowhere to put it */ }
  }
  return list;
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

let saving = false;

export const store = {
  key: KEY,
  list: readList(),
  prefs: readPrefs(),

  save() {
    saving = true;
    try {
      if (store.list) localStorage.setItem(KEY, JSON.stringify(store.list)); else localStorage.removeItem(KEY);
    } catch { /* full or blocked: it still works for this visit */ }
    saving = false;
    // Anything that shows a count of the list (the red number on Print) brings itself up to date.
    globalThis.dispatchEvent?.(new Event('listsaved'));
  },
  savePrefs() {
    try { localStorage.setItem(PREFS, JSON.stringify(store.prefs)); } catch { /* not saved, still works */ }
  },
  // Another tab saved: pick up its copy.
  reload() { if (!saving) store.list = readList(); },
};

// ---------- Drafts ----------
// The box being packed, and boxes being changed, kept as they're typed: a reload, a tap on another tab or a phone
// that locks mid-box doesn't lose them. { new: { box, autoTo, autoNum }, edits: { uid: { box, autoTo } } }.
// Saving the box clears its draft.
function readDrafts() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT));
    if (d && typeof d === 'object') return { new: d.new || null, edits: d.edits && typeof d.edits === 'object' ? d.edits : {} };
  } catch { /* nothing kept */ }
  return { new: null, edits: {} };
}

export const drafts = {
  get: uid => { const d = readDrafts(); return (uid ? d.edits[uid] : d.new) || null; },
  set(uid, value) {
    const d = readDrafts();
    if (uid) {
      if (value) d.edits[uid] = { ...value, at: Date.now() }; else delete d.edits[uid];
      // A few boxes' changes at most: the oldest goes first.
      const keep = Object.entries(d.edits).sort((a, b) => (b[1].at || 0) - (a[1].at || 0)).slice(0, 6);
      d.edits = Object.fromEntries(keep);
    } else {
      d.new = value ? { ...value, at: Date.now() } : null;
    }
    try {
      if (d.new || Object.keys(d.edits).length) localStorage.setItem(DRAFT, JSON.stringify(d)); else localStorage.removeItem(DRAFT);
    } catch { /* full or blocked: it still works for this visit */ }
  },
  clear() { try { localStorage.removeItem(DRAFT); } catch { /* nothing to clear */ } },
  // Photos taken for a box that isn't saved yet.
  photos() {
    const d = readDrafts();
    return [d.new, ...Object.values(d.edits)].flatMap(x => (Array.isArray(x?.box?.photos) ? x.box.photos : []));
  },
};

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
