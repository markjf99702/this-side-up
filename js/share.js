// The list on a second phone: as a link (the whole list after the #) or a backup file (with the photos),
// merged box by box. And a spreadsheet, for the movers' inventory or the insurance.
import { store, photos, blobToDataURL, dataURLToBlob } from './store.js';
import { app, esc, on, go, toast, icon, sheet, plural, share, copy, download, framed } from './ui.js';
import * as M from './model.js';
import { listLink, readList, base } from './payload.js';
import { badge } from './app.js';

// ---------- A list arriving in a link ----------

export async function listArrives(data) {
  let incoming;
  try {
    incoming = await readList(data);
  } catch (e) {
    app.innerHTML = `<div class="narrow"><div class="card"><h2>That link didn’t open</h2><p>${esc(e.message || 'It may have been cut short when it was sent. Ask for it again.')}</p><a class="btn" href="#/">Every box</a></div></div>`;
    on({});
    return;
  }
  offer(incoming, 'link');
}

// What to do with a list from somewhere else: take it as it is, or fold it into this one.
function offer(incoming, from) {
  const mine = store.list && !store.list.example && M.live(store.list).length ? store.list : null;
  const n = M.live(incoming).length;
  const named = incoming.name ? `“${esc(incoming.name)}”` : 'a move';
  if (!mine) {
    app.innerHTML = `
      <div class="narrow"><section class="card arrive">
        <p class="kicker">A list from another phone</p>
        <h2>${named}: ${plural(n, 'box', 'boxes')}</h2>
        <p>Keep it on this phone too. It stays here and works with no Wi-Fi. When either phone changes something, send it across again and the two are merged box by box.</p>
        <div class="row"><button class="btn primary" data-act="take">${icon('check')} Keep this list here</button><a class="btn" href="#/">Not now</a></div>
      </section></div>`;
    on({
      click(e) {
        if (!e.target.closest('[data-act="take"]')) return;
        const { example, ...clean } = incoming;
        store.list = clean;
        store.save();
        go('/', true);
        toast(`${plural(n, 'box', 'boxes')} on this phone now`);
      },
    });
    return;
  }
  const { list, summary, clashes } = M.merge(mine, incoming);
  const same = M.sameMove(mine, incoming.id) || incoming.also.includes(mine.id);
  const nothing = !summary.added && !summary.updated && !summary.removed && !summary.rooms;
  app.innerHTML = `
    <div class="narrow"><section class="card arrive">
      <p class="kicker">A list from another phone</p>
      <h2>${named}: ${plural(n, 'box', 'boxes')}</h2>
      ${same ? '' : `<p class="warn-text"><b>This looks like a different move from yours.</b> Merging puts its boxes in with yours.</p>`}
      ${nothing ? '<p>Nothing new: this phone has all of it already.</p>' : `
        <ul class="merge-sum">
          ${summary.added ? `<li><b>${summary.added}</b> new ${summary.added === 1 ? 'box' : 'boxes'}</li>` : ''}
          ${summary.updated ? `<li><b>${summary.updated}</b> changed</li>` : ''}
          ${summary.removed ? `<li><b>${summary.removed}</b> removed</li>` : ''}
          ${summary.rooms ? `<li><b>${summary.rooms}</b> new ${summary.rooms === 1 ? 'room' : 'rooms'}</li>` : ''}
        </ul>
        <p class="hint">Box by box: the newer change to each box wins, and ticks from the truck count are kept from both.</p>
        ${clashes.length ? `<p class="warn-text">${clashes.map(c => `Two boxes will both be number ${c[0].n}.`).join(' ')} You can renumber one afterwards.</p>` : ''}`}
      <div class="row">${nothing ? '<a class="btn primary" href="#/">Every box</a>' : `<button class="btn primary" data-act="merge">${icon('check')} Merge it in</button><a class="btn" href="#/">Not now</a>`}</div>
    </section></div>`;
  on({
    click(e) {
      if (!e.target.closest('[data-act="merge"]')) return;
      // Merged into the list as it is now (another tab may have changed it since this was drawn).
      const now = store.list ? M.merge(store.list, incoming) : { list, summary };
      store.list = now.list;
      store.save();
      badge();
      go('/', true);
      toast(mergedLine(now.summary));
    },
  });
}

const mergedLine = s => {
  const bits = [s.added && `${s.added} new`, s.updated && `${s.updated} changed`, s.removed && `${s.removed} removed`].filter(Boolean);
  return bits.length ? `Merged: ${bits.join(', ')}` : 'Merged';
};

// ---------- Sending, backing up, loading ----------

export async function sendSheet() {
  const list = store.list;
  const link = await listLink(list, base());
  const n = M.live(list).length;
  sheet(`
    <h2>Send the list</h2>
    <p>The whole list goes in the link, ${plural(n, 'box', 'boxes')} of it. Open it on the other phone and it’s saved there too. Photos stay on this phone: a backup file carries those.</p>
    ${link.length > 8000 ? `<p class="warn-text">It’s a long link (${Math.round(link.length / 1000)},000 characters). If it arrives cut short, send a backup file instead.</p>` : ''}
    <textarea class="input" id="sheetLink" rows="3" readonly>${esc(link)}</textarea>
    <div class="row">
      <button class="btn" data-close>Close</button>
      <button class="btn" id="sheetCopy">Copy link</button>
      ${navigator.share && !framed() ? `<button class="btn primary" id="sheetShare">${icon('share')} Send</button>` : ''}
    </div>`, body => {
    const field = body.querySelector('#sheetLink');
    body.querySelector('#sheetCopy').onclick = () => copy(link, field, 'Link copied');
    const sh = body.querySelector('#sheetShare');
    if (sh) sh.onclick = () => share({ title: 'This Side Up', text: list.name ? `The box list for ${list.name}` : 'The box list for the move', url: link }, field);
  });
}

const fileName = (list, ext) => `${(list.name || 'this-side-up').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'this-side-up'}-${new Date().toISOString().slice(0, 10)}.${ext}`;

export async function backup({ withPhotos = true } = {}) {
  const list = store.list;
  const out = { app: 'this-side-up', v: 1, saved: new Date().toISOString(), list, photos: {} };
  if (withPhotos) {
    const ids = new Set(list.boxes.filter(b => !b.gone).flatMap(b => b.photos));
    for (const id of ids) {
      const blob = await photos.get(id);
      if (blob) out.photos[id] = await blobToDataURL(blob);
    }
  }
  download(fileName(list, 'this-side-up.json'), JSON.stringify(out));
  toast(`Saved ${plural(M.live(list).length, 'box', 'boxes')}${Object.keys(out.photos).length ? ` and ${plural(Object.keys(out.photos).length, 'photo')}` : ''}`);
}

// A backup file (or a bare list) from this app: merged in, photos and all.
export async function loadFile(file) {
  let raw;
  try { raw = JSON.parse(await file.text()); } catch { toast('That file isn’t a This Side Up backup.'); return; }
  const incoming = M.cleanList(raw?.list || raw);
  if (!incoming || (raw?.app && raw.app !== 'this-side-up')) { toast('That file isn’t a This Side Up backup.'); return; }
  let added = 0;
  if (raw.photos && typeof raw.photos === 'object') {
    const have = new Set(await photos.keys());
    for (const [id, url] of Object.entries(raw.photos)) {
      if (have.has(id) || typeof url !== 'string' || !url.startsWith('data:image/') || !/^[\w-]{1,24}$/.test(id)) continue;
      try { await photos.put(id, dataURLToBlob(url)); added++; } catch { /* skip that one */ }
    }
  }
  const mine = store.list && !store.list.example && M.live(store.list).length ? store.list : null;
  if (!mine) {
    store.list = incoming;
    store.save();
    badge();
    go('/', true);
    toast(`Loaded ${plural(M.live(incoming).length, 'box', 'boxes')}${added ? ` and ${plural(added, 'photo')}` : ''}`);
    return;
  }
  const { list, summary } = M.merge(mine, incoming);
  store.list = list;
  store.save();
  badge();
  go('/', true);
  toast(mergedLine(summary) + (added ? `, ${plural(added, 'photo')}` : ''));
}

export function csv() {
  const list = store.list;
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const when = t => (t ? new Date(t).toISOString().slice(0, 16).replace('T', ' ') : '');
  const rows = [['Number', 'Kind', 'Going to', 'Leaving', 'Fragile', 'Heavy', 'Open first', 'Goes in the car', 'Contents', 'On the truck', 'Arrived', 'Unpacked']];
  for (const b of M.live(list)) {
    rows.push([b.n, b.kind === 'piece' ? 'Furniture' : 'Box', M.room(list, b.to)?.name, M.room(list, b.from)?.name,
      b.fragile ? 'yes' : '', b.heavy ? 'yes' : '', b.first ? 'yes' : '', b.car ? 'yes' : '', b.items.join('; '),
      when(b.loaded), when(b.arrived), when(b.unpacked)]);
  }
  download(fileName(list, 'csv'), '﻿' + rows.map(r => r.map(q).join(',')).join('\r\n'), 'text/csv');
}
