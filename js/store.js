// Saving in this browser: the list in localStorage, box photos in IndexedDB, and a few settings.
// Nothing leaves the phone unless you send a link or save a backup file.
import { cleanList } from './model.js';

const KEY = 'this-side-up.v1';
const PREFS = 'this-side-up.prefs';
const DB = 'this-side-up';

function readList() {
  try { return cleanList(JSON.parse(localStorage.getItem(KEY))); } catch { return null; }
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
  },
  savePrefs() {
    try { localStorage.setItem(PREFS, JSON.stringify(store.prefs)); } catch { /* not saved, still works */ }
  },
  // Another tab saved: pick up its copy.
  reload() { if (!saving) store.list = readList(); },
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

export const photos = {
  put: (id, blob) => tx('readwrite', s => { s.put(blob, id); }),
  get: id => tx('readonly', s => s.get(id)).then(b => (b instanceof Blob ? b : null)).catch(() => null),
  remove: id => tx('readwrite', s => { s.delete(id); }).catch(() => {}),
  keys: () => tx('readonly', s => s.getAllKeys()).catch(() => []),
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
