// Which screen goes with which address, and opening links that arrive: a label's QR code (#b/…),
// a Tag Along sticker (#box/12) or a whole list from another phone (#l/…).
import { store, photos } from './store.js';
import { app, $, $$, go, refreshScreen } from './ui.js';
import * as M from './model.js';
import { readBoxFragment, readNumber } from './payload.js';
import { needsLabel } from './common.js';
import { home } from './home.js';
import { pack } from './pack.js';
import { boxScreen, labelView } from './box.js';
import { truck } from './truck.js';
import { printScreen, preparePrint } from './print.js';
import { roomsScreen } from './places.js';
import { firstNight } from './first.js';
import { listArrives } from './share.js';
import { more } from './more.js';

const routes = [
  [/^\/?$/, 'boxes', () => home()],
  [/^\/new$/, 'pack', () => pack()],
  [/^\/new\/(\d{1,4})$/, 'pack', n => pack(null, Number(n))],
  [/^\/box\/([\w-]+)\/edit$/, 'boxes', u => pack(u)],
  [/^\/box\/([\w-]+)$/, 'boxes', u => boxScreen(u)],
  [/^\/truck(?:\/(load|unload|unpack))?$/, 'truck', s => truck(s)],
  [/^\/print(?:\/(labels|signs|test))?$/, 'print', w => printScreen(w)],
  [/^\/print\/box\/([\w-]+)$/, 'print', u => printScreen('labels', u)],
  [/^\/rooms$/, 'more', () => roomsScreen()],
  [/^\/first$/, 'boxes', () => firstNight()],
  [/^\/more$/, 'more', () => more()],
];

// Draws the screen for the address. again: the same screen drawn afresh where it is (the list changed in another
// tab), keeping the scroll and any sheet that's open.
async function render(again = false) {
  // Label links keep their own escapes (a "/" or "~" inside a thing is escaped), so they're read as they are.
  const raw = location.hash.slice(1).trim();
  if (!again) {
    document.getElementById('sheet').close?.();
    window.scrollTo(0, 0);
  }
  document.title = 'This Side Up';

  // A label's QR code: on a phone with this move's list it opens the box there; anywhere else it shows the label.
  if (raw.startsWith('b/')) {
    const p = readBoxFragment(raw);
    const mine = p && store.list && M.sameMove(store.list, p.move) ? M.findNumber(store.list, p.n) : [];
    if (mine.length === 1) return go(`/box/${mine[0].uid}`, true);
    setTab(mine.length ? 'boxes' : '');
    return labelView(p, location.href, mine);
  }
  // A number from an NFC sticker.
  const n = readNumber(raw);
  if (n !== null) {
    const mine = store.list ? M.findNumber(store.list, n) : [];
    if (mine.length === 1) return go(`/box/${mine[0].uid}`, true);
    setTab('');
    return labelView(null, '', mine, n);
  }
  if (raw.startsWith('l/')) { setTab(''); return listArrives(raw.slice(2)); }

  let path = raw;
  try { path = decodeURIComponent(raw); } catch { /* use it as it is */ }
  if (!path.startsWith('/')) path = '/' + path;
  for (const [re, tab, show] of routes) {
    const m = path.match(re);
    if (!m) continue;
    setTab(tab);
    return show(...m.slice(1));
  }
  go('/', true);
}

function setTab(name) {
  document.body.dataset.tab = name;
  // Someone reading a label without the list doesn't need the app's tabs.
  document.body.classList.toggle('bare', !name && !store.list);
  for (const a of $$('.tabs a')) a.classList.toggle('on', a.dataset.tab === name);
  badge();
}

// The red number on Print: labels not printed yet, or changed since they were.
export function badge() {
  const el = $('#printBadge');
  const n = store.list ? M.live(store.list).filter(b => needsLabel(b, store.list)).length : 0;
  el.hidden = !n;
  el.textContent = n > 99 ? '99+' : String(n);
}

const drawn = again => render(again).catch(e => { console.error(e); app.innerHTML = '<p class="empty-note">Something went wrong drawing this screen.</p>'; });
window.addEventListener('hashchange', () => drawn(false));

// Another tab saved the list, or this one is back from the background and may have missed it: catch up. The same
// list comes into the objects every screen is holding, so nothing typed here is lost and what's saved next keeps
// the other tab's changes too.
function catchUp() {
  const what = store.sync();
  if (what === 'same') return;
  if (what === 'replaced') {
    // Another list altogether (cleared, the example, one from another phone): start again with it.
    document.getElementById('sheet').close?.();
    drawn(true);
    return;
  }
  badge();
  if (refreshScreen()) return;
  // Don't redraw under someone's fingers while they're typing.
  const typing = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  if (!typing) drawn(true);
}
window.addEventListener('storage', e => { if (e.key === store.key || e.key === null) catchUp(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') catchUp(); });
window.addEventListener('pageshow', e => { if (e.persisted) catchUp(); });
window.addEventListener('beforeprint', preparePrint);
// A room renamed, a box changed or a label marked printed changes what's left to print.
window.addEventListener('listsaved', () => badge());

render();
// Tidy away photos from boxes that were never saved, once things have settled.
setTimeout(() => photos.sweep(store.list).catch(() => {}), 4000);

if ('serviceWorker' in navigator && location.protocol !== 'file:' && !document.documentElement.dataset.single) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* fine: it just won't work offline */ });
}
