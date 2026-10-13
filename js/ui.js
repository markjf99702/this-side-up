// Small pieces every screen uses: escaping, the toast, the sheet that slides up, copying, sharing and
// downloading, and one set of event handlers for whichever screen is showing.

export const app = document.getElementById('app');

export const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
export const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function go(path, replace = false) {
  const hash = '#' + path;
  if (location.hash === hash) { window.dispatchEvent(new HashChangeEvent('hashchange')); return; }
  if (replace) location.replace(hash); else location.hash = hash;
}

// One set of listeners on the page; each screen says what they do.
let handlers = {};
export function on(h) { handlers = h; }
for (const type of ['click', 'input', 'change', 'keydown', 'submit', 'focusout', 'pointerdown']) {
  app.addEventListener(type, e => handlers[type]?.(e));
}

let toastTimer;
export function toast(message, action) {
  const el = document.getElementById('toast');
  el.innerHTML = `<span>${esc(message)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
  el.hidden = false;
  if (action) el.querySelector('button').onclick = () => { el.hidden = true; action.run(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, action ? 6000 : 2800);
}

// The sheet that slides up. bind() wires up what's inside once it's drawn.
export function sheet(html, bind) {
  const dlg = document.getElementById('sheet');
  const body = dlg.querySelector('.sheet-body');
  body.innerHTML = html;
  if (!dlg.open) {
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  }
  const close = () => (dlg.close ? dlg.close() : dlg.removeAttribute('open'));
  body.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  bind?.(body, close);
  return close;
}
{
  const dlg = document.getElementById('sheet');
  // Tapping the dim area around the sheet closes it.
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
}

// The one-file copy shown inside another page can't start a download or print on its own.
export const framed = () => {
  if (!('single' in document.documentElement.dataset)) return false;
  try { return window.top !== window.self; } catch { return true; }
};

export async function copy(text, field, done = 'Copied') {
  try {
    await navigator.clipboard.writeText(text);
    toast(done);
  } catch {
    // Some browsers and embedded views refuse the clipboard: select the text so it can be copied by hand.
    field?.focus();
    field?.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* not allowed here either */ }
    toast(ok ? done : 'It’s selected. Copy it from there.');
  }
}

// The phone's own share sheet where there is one (Messages, WhatsApp, email), otherwise copy.
export async function share({ title, text, url }, field) {
  if (navigator.share && !framed()) {
    try { await navigator.share({ title, text, url }); return; } catch (e) { if (e?.name === 'AbortError') return; }
  }
  copy(url, field, 'Link copied');
}

export function download(name, blobOrText, type = 'application/json') {
  const blob = blobOrText instanceof Blob ? blobOrText : new Blob([blobOrText], { type });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export const buzz = pattern => { try { navigator.vibrate?.(pattern); } catch { /* not on this phone */ } };

export const day = t => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
export const when = t => {
  const d = new Date(t), now = new Date();
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return d.toDateString() === now.toDateString() ? time : `${day(t)}, ${time}`;
};

// Icons, drawn on a 24 x 24 grid with a 2px stroke.
const I = {
  boxes: '<path d="M3.5 13.5h8v7h-8zM12.5 13.5h8v7h-8zM8 6.5h8v7H8z"/><path d="M7.5 13.5v2.5M16.5 13.5v2.5M12 6.5V9"/>',
  pack: '<path d="M4 8.5 12 4l8 4.5v8L12 21l-8-4.5z"/><path d="M4 8.5 12 13l8-4.5M12 13v8"/>',
  truck: '<path d="M2.5 6.5h11v10h-11zM13.5 9.5h4l3.5 3.6v3.4h-7.5"/><circle cx="6.5" cy="17.5" r="1.9"/><circle cx="17" cy="17.5" r="1.9"/>',
  print: '<path d="M7 9V3.5h10V9M7 17.5H4.5v-7a1.5 1.5 0 0 1 1.5-1.5h12a1.5 1.5 0 0 1 1.5 1.5v7H17"/><path d="M7 14h10v6.5H7z"/>',
  more: '<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>',
  camera: '<path d="M4 8.5h3l1.6-2.5h6.8L17 8.5h3v10.5H4z"/><circle cx="12" cy="13.5" r="3.4"/>',
  edit: '<path d="M4.5 19.5 5.4 15 15.8 4.6l3.6 3.6L9 18.6z"/><path d="m13.6 6.8 3.6 3.6"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  back: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  share: '<path d="M12 3.5v11M7.5 8 12 3.5 16.5 8"/><path d="M5 11.5v8h14v-8"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  door: '<path d="M6 20.5V3.5h11v17M3.5 20.5h17"/><circle cx="14" cy="12" r="1"/>',
  file: '<path d="M6 3.5h8l4 4v13H6z"/><path d="M14 3.5v4h4"/>',
  tag: '<path d="M3.5 12.5V4h8.5l8.5 8.5-8.5 8.5z"/><circle cx="8" cy="8.5" r="1.4"/>',
  rooms: '<path d="M3.5 3.5h17v17h-17zM12 3.5V13M3.5 13H9M14.5 13h6"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.8L12 16.8l-5.3 2.8 1.1-5.8-4.3-4.1 5.9-.8z"/>',
  bed: '<path d="M3.5 18.5v-11M3.5 14.5h17v4M20.5 14.5v-2.5a2.5 2.5 0 0 0-2.5-2.5h-7v5"/><circle cx="7" cy="11.5" r="1.8"/>',
  photo: '<path d="M3.5 5.5h17v13h-17z"/><path d="m3.5 16 5-5 4 4 2.5-2.5 5.5 5.5"/><circle cx="15.5" cy="9" r="1.3"/>',
  arrow: '<path d="M5 12h13M13 6.5l5.5 5.5-5.5 5.5"/>',
};
export const icon = (name, cls = 'icon') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${I[name] || ''}</svg>`;

// Flags: a glass for fragile, a weight for heavy, a star for open first, a car for the car.
const F = {
  fragile: '<path d="M7.5 3h9l-.6 5.4a3.9 3.9 0 0 1-7.8 0z" fill="currentColor" stroke="none"/><path d="M12 12.2v6.3M8.5 21h7"/><path d="m11 3.4 1.5 2.6-1.3 1.9" stroke="#fff" stroke-width="1.3"/>',
  heavy: '<path d="M9 7.5a3 3 0 1 1 6 0"/><path d="M6.6 9.5h10.8l2 10H4.6z" fill="currentColor" stroke="none"/>',
  first: '<path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9z" fill="currentColor" stroke="none"/>',
  car: '<path d="M4 15.5v-3.2L6.2 8a2 2 0 0 1 1.8-1.1h8a2 2 0 0 1 1.8 1.1l2.2 4.3v3.2z" fill="currentColor" stroke="none"/><circle cx="7.6" cy="16.6" r="2" fill="currentColor" stroke="none"/><circle cx="16.4" cy="16.6" r="2" fill="currentColor" stroke="none"/>',
};
export const flagIcon = (name, cls = 'ficon') => `<svg class="${cls} f-${name}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${F[name] || ''}</svg>`;

// The "this way up" mark from the side of every moving box: two arrows on a line.
export const upMark = (cls = 'up') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3 2.6 9h2.9v8.5h3V9h2.9zM17 3l-4.4 6h2.9v8.5h3V9h2.9z" fill="currentColor"/><rect x="2" y="19.6" width="20" height="2.4" fill="currentColor"/></svg>`;
