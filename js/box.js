// One box: its label, everything in it, its photos and what's happened to it. And the view a phone shows
// when its camera reads a label and it doesn't have the list: what's inside and where it goes.
import { store, photos, shrink } from './store.js';
import { app, esc, on, go, toast, icon, flagIcon, sheet, plural, when, $, upMark } from './ui.js';
import * as M from './model.js';
import { shapeSVG } from './rooms.js';
import { dot, tile, needsLabel, stageNote, shapeName } from './common.js';
import { onScreen, fromBox, fromLink } from './labels.js';

// ---------- Photos ----------

const urls = new Map();
async function photoURL(id) {
  if (urls.has(id)) return urls.get(id);
  const blob = await photos.get(id);
  const url = blob ? URL.createObjectURL(blob) : '';
  urls.set(id, url);
  return url;
}

export function photoStrip(box, removable = false) {
  if (!box.photos.length) return '';
  queueMicrotask(fillPhotos);
  return `<ul class="photos">${box.photos.map(id => `
    <li><button type="button" class="ph" data-photo="${id}" aria-label="Look at this photo"><span class="ph-missing">${icon('photo')}<small>On another phone</small></span></button>
    ${removable ? `<button type="button" class="ph-x" data-unphoto="${id}" aria-label="Remove this photo">${icon('x')}</button>` : ''}</li>`).join('')}</ul>`;
}

async function fillPhotos() {
  for (const el of document.querySelectorAll('.ph[data-photo]:not([data-done])')) {
    el.dataset.done = '1';
    const url = await photoURL(el.dataset.photo);
    if (url) el.innerHTML = `<img src="${url}" alt="">`;
  }
}

export async function addPhoto(box, file) {
  try {
    const blob = await shrink(file);
    const id = M.uid('p');
    await photos.put(id, blob);
    box.photos = [...box.photos, id].slice(0, 12);
    return id;
  } catch {
    toast('That photo couldn’t be saved on this phone.');
    return null;
  }
}

function showPhoto(id) {
  photoURL(id).then(url => {
    if (!url) { toast('That photo was taken on another phone. A backup file from that phone brings it here.'); return; }
    sheet(`<img class="ph-big" src="${url}" alt="Photo of what’s in the box"><div class="row"><button class="btn" data-close>Close</button></div>`);
  });
}

// ---------- The box ----------

export function boxScreen(uid) {
  const list = store.list;
  const box = list && M.byUid(list, uid);
  if (!box) { toast('That box isn’t in this list.'); return go('/', true); }
  if (box.gone) return gone(box);
  const to = M.room(list, box.to), from = M.room(list, box.from);
  const piece = box.kind === 'piece';
  const name = piece ? box.items[0] || `No. ${box.n}` : `Box ${box.n}`;
  const stale = box.printed && needsLabel(box, list);
  const clash = M.findNumber(list, box.n).length > 1;
  document.title = `${name} · This Side Up`;

  app.innerHTML = `
    <div class="boxview">
      <div class="screen-head">
        <div>
          <a class="crumb" href="#/">${icon('back', 'icon xs')} Every box</a>
          <h1>${esc(name)}</h1>
        </div>
        <a class="btn small" href="#/box/${box.uid}/edit">${icon('edit')} Change</a>
      </div>
      ${clash ? `<div class="banner warn"><p><b>Another box is number ${box.n} too.</b> Give this one the next free number, then print it a new label.</p><button class="btn small" data-act="renumber">Make it ${M.nextNumber(list)}</button></div>` : ''}
      <div class="box-grid">
        <div class="box-label">
          <div class="boxside">${onScreen(fromBox(box, list))}</div>
          <div class="row label-acts">
            <a class="btn small" href="#/print/box/${box.uid}">${icon('print')} Print this label</a>
            <span class="hint">${box.printed ? (stale ? '<b class="warn-text">Changed since its label was printed</b>' : `Label printed ${when(box.printed)}`) : 'Label not printed yet'}</span>
          </div>
        </div>
        <div class="box-info">
          <section class="card">
            <p class="where-big">
              ${to ? `${dot(to, 'big')}<span><small>Going to</small><b>${esc(to.name)}</b></span>` : '<span><small>Going to</small><b class="hint">No room picked</b></span>'}
              ${from ? `<span class="from"><small>Leaving</small><b>${esc(from.name)}</b></span>` : ''}
            </p>
            ${M.FLAGS.some(f => box[f]) ? `<p class="flag-line">${M.FLAGS.filter(f => box[f]).map(f => `<span class="flagtag f-${f}">${flagIcon(f)}${M.flagWords[f]}</span>`).join('')}</p>` : ''}
          </section>
          <section class="card">
            <h2>${piece ? 'Notes' : 'What’s in it'}</h2>
            ${(piece ? box.items.slice(1) : box.items).length
              ? `<ul class="things-list">${(piece ? box.items.slice(1) : box.items).map(t => `<li>${esc(t)}</li>`).join('')}</ul>`
              : `<p class="hint">${piece ? 'No notes.' : 'Nothing listed yet.'} <a href="#/box/${box.uid}/edit">Add some</a></p>`}
            <div id="photoStrip">${photoStrip(box, true)}</div>
            <label class="btn small">${icon('camera')} Add a photo<input type="file" accept="image/*" capture="environment" id="photoIn" class="sr"></label>
          </section>
          <section class="card stages">
            <h2>Moving day</h2>
            ${stageButton(box, 'load', 'On the truck', 'truck')}
            ${stageButton(box, 'unload', 'Arrived', 'door')}
            ${stageButton(box, 'unpack', 'Unpacked', 'check')}
          </section>
          <p class="center"><button class="btn small danger" data-act="delete">${icon('trash')} Remove this ${piece ? 'piece' : 'box'}</button></p>
        </div>
      </div>
    </div>`;

  on({
    async change(e) {
      if (e.target.id !== 'photoIn' || !e.target.files?.length) return;
      const file = e.target.files[0];
      e.target.value = '';
      if (await addPhoto(box, file)) {
        M.putBox(list, box);
        store.save();
        $('#photoStrip').innerHTML = photoStrip(box, true);
        toast('Photo added');
      }
    },
    click(e) {
      const t = e.target.closest('button, a');
      if (!t) return;
      if (t.dataset.photo) { showPhoto(t.dataset.photo); return; }
      if (t.dataset.unphoto) {
        const id = t.dataset.unphoto;
        box.photos = box.photos.filter(x => x !== id);
        M.putBox(list, box);
        store.save();
        $('#photoStrip').innerHTML = photoStrip(box, true);
        toast('Photo removed', { label: 'Undo', run: () => { box.photos.push(id); M.putBox(list, box); store.save(); boxScreen(uid); } });
        return;
      }
      if (t.dataset.stage) {
        const s = t.dataset.stage;
        M.setStage(box, s, !M.done(box, s));
        store.save();
        boxScreen(uid);
        return;
      }
      const act = t.dataset.act;
      if (act === 'renumber') {
        box.n = M.nextNumber(list);
        M.putBox(list, box);
        store.save();
        toast(`Now ${piece ? 'No.' : 'Box'} ${box.n}. Print it a new label.`);
        boxScreen(uid);
        return;
      }
      if (act === 'delete') {
        sheet(`
          <h2>Remove ${esc(name)}?</h2>
          <p>It comes off the list and the counts. If its label is already on a box, that label will still show what was in it.</p>
          <div class="row"><button class="btn" data-close>Keep it</button><button class="btn primary" id="sheetGo">Remove it</button></div>`,
        (body, close) => {
          body.querySelector('#sheetGo').onclick = () => {
            close();
            M.removeBox(list, box.uid);
            store.save();
            go('/');
            toast(`${name} removed`, { label: 'Undo', run: () => { box.gone = 0; M.putBox(list, box); store.save(); go(`/box/${box.uid}`); } });
          };
        });
      }
    },
  });
}

function stageButton(box, stage, label, ic) {
  const on = M.done(box, stage);
  const at = box[M.STAGES[stage].field];
  return `<button class="stage${on ? ' on' : ''}" data-stage="${stage}" aria-pressed="${on}">
    <span class="stage-box">${on ? icon('check') : ''}</span>
    <span><b>${label}</b><small>${on ? when(at) : 'Not yet'}</small></span>
    ${icon(ic, 'icon stage-ic')}
  </button>`;
}

function gone(box) {
  app.innerHTML = `
    <div class="narrow"><div class="card">
      <h2>${box.kind === 'piece' ? esc(box.items[0] || 'This piece') : `Box ${box.n}`} was removed from the list</h2>
      <p>It was ${box.items.length ? `holding ${esc(box.items.slice(0, 4).join(', '))}${box.items.length > 4 ? '…' : ''}` : 'empty'}.</p>
      <div class="row"><button class="btn primary" data-act="back">Put it back</button><a class="btn" href="#/">Every box</a></div>
    </div></div>`;
  on({
    click(e) {
      if (e.target.closest('[data-act="back"]')) {
        box.gone = 0;
        M.putBox(store.list, box);
        store.save();
        go(`/box/${box.uid}`, true);
      }
    },
  });
}

// ---------- A label read by a phone camera ----------

// p: what the label's link carries (or null). mine: boxes in this phone's list with that number (more than
// one means two boxes share it). n: the number from an NFC sticker, when that's all there is.
export function labelView(p, link, mine = [], n = null) {
  const list = store.list;
  if (mine.length > 1) {
    app.innerHTML = `
      <div class="narrow">
        <div class="card"><h2>${mine.length} boxes are number ${mine[0].n}</h2><p>Which one is this?</p></div>
        <ul class="boxes">${mine.map(b => `<li><a class="boxrow" href="#/box/${b.uid}">${tile(b, list)}<span class="what"><span class="where">${esc(M.room(list, b.to)?.name || 'No room')}</span><span class="things">${esc(b.items.join(' · '))}</span></span><span></span></a></li>`).join('')}</ul>
      </div>`;
    on({});
    return;
  }
  if (!p) {
    app.innerHTML = `
      <div class="narrow">
        <section class="scanned plain">
          <p class="kicker">This Side Up</p>
          <h1 class="scan-num">${n !== null ? `Box ${n}` : 'A box label'}</h1>
          <p>${n !== null ? (list ? `Box ${n} isn’t in this phone’s list.` : 'This phone doesn’t have the list for this move. Open the sticker’s link on the phone that does.') : 'This link is damaged: the end of it is missing. Try reading the label again.'}</p>
          ${list ? '<a class="btn" href="#/">Every box</a>' : ''}
        </section>
        ${tagline()}
      </div>`;
    on({});
    return;
  }
  const d = fromLink(p, link);
  const st = d.to;
  const ours = list && M.sameMove(list, p.move);
  const piece = d.kind === 'piece';
  document.title = `${piece ? d.items[0] || 'No. ' + d.n : 'Box ' + d.n}${st ? ' → ' + st.name : ''} · This Side Up`;
  const things = piece ? d.items.slice(1) : d.items;
  app.innerHTML = `
    <div class="narrow scan-wrap">
      ${ours ? `<div class="banner warn"><p><b>Box ${d.n} isn’t in your list any more.</b> This is what its label says.</p>${list.boxes.some(b => b.n === d.n && b.gone) ? '<button class="btn small" data-act="restore">Put it back</button>' : ''}</div>` : ''}
      <section class="scanned" style="${st ? `--rc:${st.hex};--ri:${st.ink}` : ''}">
        <header class="scan-room${st ? '' : ' none'}">
          ${st ? `<span class="scan-shape">${shapeSVG(st.shape)}</span>` : ''}
          <span><small>${st ? 'Goes to the' : 'Going to'}</small><b>${st ? esc(st.name) : 'No room on the label'}</b></span>
          ${upMark('scan-up')}
        </header>
        <div class="scan-body">
          <div class="scan-top">
            <p class="scan-num"><small>${piece ? 'No.' : 'Box'}</small>${d.n}</p>
            <div class="scan-flags">
              ${d.fragile ? `<span class="lab-flag lab-fragile">${flagIcon('fragile')}Fragile</span>` : ''}
              ${d.first ? `<span class="lab-flag lab-first">${flagIcon('first')}Open first</span>` : ''}
              ${d.heavy ? `<span class="lab-flag lab-heavy">${flagIcon('heavy')}Heavy</span>` : ''}
              ${d.car ? `<span class="lab-flag lab-car">${flagIcon('car')}Goes in the car</span>` : ''}
            </div>
          </div>
          ${piece ? `<p class="scan-piece">${esc(d.items[0] || 'Furniture')}</p>` : ''}
          ${things.length || d.more ? `
            <h2>${piece ? 'Notes' : 'What’s in it'}</h2>
            <ul class="things-list">${things.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
            ${d.more ? `<p class="hint">and ${plural(d.more, 'more thing')} that didn’t fit on the label’s code</p>` : ''}` : `<p class="hint">The label doesn’t list anything in it.</p>`}
          ${d.from && (!st || d.from.toLowerCase() !== st.name.toLowerCase()) ? `<p class="scan-from"><small>Leaving</small> ${esc(d.from)}</p>` : ''}
          ${st ? `<p class="scan-match">${shapeSVG(st.shape, { cls: 'shape xs' })}<span>It goes through the door with the ${esc(st.name)} sign: ${esc(st.colourName.toLowerCase())}, with a ${shapeName(st.shape)}.</span></p>` : ''}
        </div>
      </section>
      ${tagline()}
    </div>`;
  on({
    click(e) {
      if (!e.target.closest('[data-act="restore"]')) return;
      const box = list.boxes.find(b => b.n === d.n && b.gone);
      if (box) { box.gone = 0; M.putBox(list, box); store.save(); go(`/box/${box.uid}`, true); }
    },
  });
}

const tagline = () => `
  <p class="tagline">${upMark('up')}Read from a label printed by <b>This Side Up</b>, which numbers the boxes in a move. <a href="./">Number your own boxes</a></p>`;
