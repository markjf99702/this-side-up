// The first night at the new place: the boxes to open first, and a check that the things people want that
// night (sheets, the kettle, the dog's bowl) are really in one of them.
import { store } from './store.js';
import { app, esc, on, go, toast, icon, flagIcon, plural } from './ui.js';
import * as M from './model.js';
import { dot, tile } from './common.js';

export function firstNight() {
  if (!store.list) return go('/', true);
  const list = store.list;
  const boxes = M.live(list).filter(b => b.first);
  const byRoom = new Map();
  for (const b of boxes) {
    const key = M.room(list, b.to) ? b.to : '';
    if (!byRoom.has(key)) byRoom.set(key, []);
    byRoom.get(key).push(b);
  }
  const hidden = new Set(store.prefs.hideFirst || []);
  const checks = M.ESSENTIALS.filter(([k]) => !hidden.has(k)).map(([k, label, words, not]) => {
    const found = M.findThing(list, words, not);
    const first = found.filter(b => b.first);
    return { k, label, found, first };
  });
  const ready = checks.filter(c => c.first.length).length;

  app.innerHTML = `
    <div class="narrow first-night">
      <div class="screen-head"><div><a class="crumb" href="#/">${icon('back', 'icon xs')} Every box</a><h1>The first night</h1><p>Open these first at the new place.</p></div></div>
      ${boxes.length ? [...byRoom.entries()].map(([rid, group]) => {
        const r = M.room(list, rid);
        return `<h2 class="group-head">${r ? dot(r) : ''}${esc(r?.name || 'No room yet')}</h2>
          <ul class="first-boxes">${group.map(b => `
            <li class="card first-box${b.unpacked ? ' done' : ''}">
              <a href="#/box/${b.uid}">${tile(b, list)}</a>
              <div>
                <p class="fb-head"><a href="#/box/${b.uid}">${b.kind === 'piece' ? esc(b.items[0] || 'No. ' + b.n) : `Box ${b.n}`}</a>${b.unpacked ? '<span class="status off">Unpacked</span>' : b.arrived ? '<span class="status on">Arrived</span>' : ''}</p>
                <p class="fb-things">${esc((b.kind === 'piece' ? b.items.slice(1) : b.items).join(' · ')) || '<span class="hint">Nothing listed</span>'}</p>
              </div>
            </li>`).join('')}</ul>`;
      }).join('') : `<div class="card"><p>No boxes are marked <b>Open first</b> yet. Tick it when you pack the kettle, the sheets and the dog’s bowl.</p></div>`}
      <section class="card essentials">
        <h2>Packed for the first night? <small>${ready} of ${checks.length}</small></h2>
        <ul>${checks.map(c => `
          <li class="${c.first.length ? 'yes' : c.found.length ? 'maybe' : 'no'}">
            <span class="ess-mark" title="${c.first.length ? 'In a box to open first' : c.found.length ? 'Packed, but not to open first' : 'Not packed yet'}">${c.first.length ? icon('check') : c.found.length ? '!' : '–'}</span>
            <span class="ess-what"><b>${esc(c.label)}</b>
              <small>${c.first.length ? `In ${c.first.map(b => `<a href="#/box/${b.uid}">Box ${b.n}</a>`).join(', ')}`
                : c.found.length ? `In ${c.found.slice(0, 3).map(b => `<a href="#/box/${b.uid}">Box ${b.n}</a>`).join(', ')}, which ${c.found.length === 1 ? 'isn’t' : 'aren’t'} marked Open first`
                : 'Not in any box yet'}</small>
            </span>
            ${!c.first.length && c.found.length === 1 ? `<button class="btn small" data-first="${c.found[0].uid}">${flagIcon('first')} Open it first</button>` : ''}
            <button class="icon-btn" data-hide="${c.k}" aria-label="Not needed: ${esc(c.label)}" title="Not needed">${icon('x')}</button>
          </li>`).join('')}</ul>
        ${hidden.size ? `<button class="linkish" data-act="unhide">Show the ${plural(hidden.size, 'one')} I took off</button>` : ''}
      </section>
    </div>`;

  on({
    click(e) {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.first) {
        const b = M.byUid(list, t.dataset.first);
        b.first = true;
        M.putBox(list, b);
        store.save();
        toast(`Box ${b.n} is open first now. Its label needs printing again.`);
        firstNight();
      }
      if (t.dataset.hide) {
        store.prefs.hideFirst = [...new Set([...(store.prefs.hideFirst || []), t.dataset.hide])];
        store.savePrefs();
        firstNight();
      }
      if (t.dataset.act === 'unhide') { store.prefs.hideFirst = []; store.savePrefs(); firstNight(); }
    },
  });
}
