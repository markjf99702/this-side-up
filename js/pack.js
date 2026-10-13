// Packing a box (or the sofa): its number, the room it's leaving and the room it's going to, what's in it a
// line at a time, and the four flags. The label draws itself as you type, and what's typed is kept as a draft
// until it's saved, so a reload or a look at another box doesn't lose it.
import { store, photos, drafts } from './store.js';
import { app, esc, on, go, toast, icon, flagIcon, $, $$, plural } from './ui.js';
import * as M from './model.js';
import { dot } from './common.js';
import { onScreen, fromBox } from './labels.js';
import { addRoomSheet } from './places.js';
import { startList, ownList } from './home.js';
import { photoStrip, addPhoto } from './box.js';

const FLAG_INFO = {
  fragile: ['Fragile', 'Glass, china, screens'],
  heavy: ['Heavy', 'Books, tools: two people'],
  first: ['Open first', 'For the first night'],
  car: ['Goes in the car', 'Not on the truck'],
};

// What the form changes; everything else about a box (its ticks, when its label was printed) stays as it is.
const FORM = ['n', 'kind', 'from', 'to', 'items', 'photos', ...M.FLAGS];
const formOf = b => Object.fromEntries(FORM.map(k => [k, Array.isArray(b[k]) ? [...b[k]] : b[k]]));
const sameForm = (a, b) => FORM.every(k => JSON.stringify(a[k]) === JSON.stringify(b[k]));

let lastSaved = null; // the box saved a moment ago, for the note beside the next one's number

// editUid: change that box. number: a new box with this number (a sticker read before its box was packed).
export function pack(editUid, number) {
  if (!store.list) startList();
  const list = store.list;
  const editing = editUid ? M.byUid(list, editUid) : null;
  if (editUid && !editing) return go('/', true);
  const p = store.prefs;
  const justSaved = editing ? null : lastSaved;
  lastSaved = null;
  const here = id => (M.room(list, id) && !M.room(list, id).gone ? id : '');
  const blank = M.newBox(list, { from: here(p.lastFrom), to: here(p.lastTo) });
  // A copy to change; the list only changes on Save. A draft from before comes back as it was left.
  const kept = drafts.get(editing ? editing.uid : null);
  let box, restored = false;
  let autoNum = !editing; // the next number, until one is typed
  if (editing) {
    box = JSON.parse(JSON.stringify(editing));
    if (kept?.box) { Object.assign(box, formOf(M.cleanBox({ ...kept.box, uid: editing.uid }))); restored = !sameForm(box, editing); }
  } else if (kept?.box && !M.byUid(list, kept.box.uid)) {
    box = M.cleanBox(kept.box);
    box.from = here(box.from);
    box.to = here(box.to);
    autoNum = kept.autoNum !== false;
    // Its number went to another box meanwhile (another tab, another phone): it takes the next one.
    if (autoNum && (!box.n || M.findNumber(list, box.n).length)) box.n = M.nextNumber(list);
    restored = true;
  } else {
    box = JSON.parse(JSON.stringify(blank));
  }
  if (number && !editing) { box.n = number; autoNum = false; }
  // "Going to" follows "Leaving" (Kitchen to Kitchen) until it's picked by hand: for a new box, and for a box
  // whose two rooms already share a name.
  const sameNames = () => box.from && box.to && M.norm(M.room(list, box.from)?.name) === M.norm(M.room(list, box.to)?.name);
  let autoTo = restored && typeof kept.autoTo === 'boolean' ? kept.autoTo : !editing || !box.to || sameNames();
  let timer;

  draw();
  if (justSaved) $('#things')?.focus({ preventScroll: true });

  function draw() {
    const fromRooms = M.rooms(list, 'from'), toRooms = M.rooms(list, 'to');
    const piece = box.kind === 'piece';
    app.innerHTML = `
      <div class="pack">
        ${list.example ? `<div class="banner"><p><b>This is the example move.</b> A box packed here goes when you start your own list, unless you keep it then.</p><button type="button" class="btn small primary" data-act="own">Start my own list</button></div>` : ''}
        <div class="screen-head">
          <div>
            <p class="kicker kraft">${editing ? 'Change' : 'Pack'}</p>
            <h1>${piece ? 'No.' : 'Box'} <span id="numTitle">${box.n}</span></h1>
          </div>
          ${editing ? `<a class="btn small" href="#/box/${box.uid}">${icon('back')} Back</a>`
            : justSaved ? `<p class="saved-note" role="status"><span>${icon('check', 'icon xs')} ${esc(justSaved.name)} saved</span><a href="#/box/${justSaved.uid}">Open it</a></p>`
            : `<span class="hint kraft">${plural(M.live(list).length, 'box', 'boxes')} so far</span>`}
        </div>
        <form class="pack-grid" id="packForm" novalidate>
          <div class="card pack-form">
            ${restored ? `<p class="draft-note">${editing ? 'Your changes from before, not saved yet.' : 'Picked up where you left off.'} <button type="button" class="linkish" data-act="fresh">${editing ? 'Throw them away' : 'Start this box again'}</button></p>` : ''}
            <div class="pack-top">
              <label class="field num-field"><span>Number</span>
                <input class="input num" id="num" type="text" inputmode="numeric" pattern="[0-9]*" value="${box.n}" maxlength="4" autocomplete="off" aria-describedby="numNote">
              </label>
              <div class="seg kind" role="group" aria-label="What is it">
                <button type="button" data-kind="box" aria-pressed="${!piece}">Box</button>
                <button type="button" data-kind="piece" aria-pressed="${piece}">Furniture</button>
              </div>
            </div>
            <p class="num-note" id="numNote"></p>

            <fieldset class="rooms-pick">
              <legend>Leaving <span class="hint">the room it’s in now</span></legend>
              <div class="chips" data-side="from">
                ${fromRooms.map(r => `<button type="button" class="chip" data-room="${r.id}" aria-pressed="${box.from === r.id}">${esc(r.name)}</button>`).join('')}
                <button type="button" class="chip add" data-add="from">${icon('plus', 'icon xs')} Room</button>
              </div>
            </fieldset>
            <fieldset class="rooms-pick">
              <legend>Going to <span class="hint">at the new place</span></legend>
              <div class="chips" data-side="to">
                ${toRooms.map(r => `<button type="button" class="chip" data-room="${r.id}" aria-pressed="${box.to === r.id}">${dot(r)}${esc(r.name)}</button>`).join('')}
                <button type="button" class="chip add" data-add="to">${icon('plus', 'icon xs')} Room</button>
              </div>
            </fieldset>

            ${piece ? `
              <label class="field"><span>What is it?</span>
                <input class="input" id="pieceName" type="text" maxlength="${M.MAX_LINE}" placeholder="Sofa, desk, bike, rug…" value="${esc(box.items[0] || '')}" autocomplete="off">
              </label>
              <label class="field"><span>Notes <span class="hint">one a line, if any</span></span>
                <textarea class="input" id="things" rows="3" placeholder="Legs in Box 23&#10;Bolts taped underneath">${esc(box.items.slice(1).join('\n'))}</textarea>
              </label>` : `
              <label class="field"><span>What’s in it <span class="hint">one thing a line</span></span>
                <textarea class="input" id="things" rows="6" placeholder="Kettle&#10;Mugs&#10;Coffee">${esc(box.items.join('\n'))}</textarea>
              </label>`}

            <div class="flags-pick" role="group" aria-label="Flags">
              ${Object.entries(FLAG_INFO).map(([f, [name, note]]) => `
                <button type="button" class="flagbtn f-${f}" data-flag="${f}" aria-pressed="${box[f]}">
                  ${flagIcon(f)}<span><b>${name}</b><small>${note}</small></span>
                </button>`).join('')}
            </div>

            <div class="photos-pick">
              <div id="photoStrip">${photoStrip(box, true)}</div>
              <label class="btn small">${icon('camera')} Add a photo<input type="file" accept="image/*" capture="environment" id="photoIn" class="sr"></label>
              <span class="hint">Of what’s inside, before you tape it shut. Photos stay on this phone.</span>
            </div>
          </div>

          <div class="pack-side">
            <p class="kicker kraft">The label</p>
            <div class="boxside" id="preview"></div>
            <p class="hint kraft under">A phone that reads the code sees the room, the flags and the first things on the list.</p>
            <div class="save-bar">
              <button type="submit" class="btn primary wide" id="save">${icon('check')}<span>${editing ? 'Save changes' : `Save ${piece ? 'No.' : 'Box'} <span id="saveNum">${box.n}</span>`}</span></button>
              ${editing ? '' : `<p class="hint center">Then the next box is ready, in the same rooms.</p>`}
            </div>
          </div>
        </form>
      </div>`;
    preview();
    checkNumber();
  }

  // Furniture keeps its name first; without one it's just "Furniture", so a note never becomes its name.
  function readForm() {
    const things = $('#things')?.value.split('\n') || [];
    if (box.kind !== 'piece') { box.items = M.cleanItems(things); return; }
    const name = M.cleanItems([$('#pieceName')?.value || ''])[0];
    const notes = M.cleanItems(things);
    box.items = name || notes.length ? [name || 'Furniture', ...notes].slice(0, M.MAX_ITEMS) : [];
  }

  function preview() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const el = $('#preview');
      if (el) el.innerHTML = onScreen(fromBox(box, list));
      keep();
    }, 60);
  }

  // The draft: kept while it's different from where it started, dropped when it's back to that (or saved).
  function keep() {
    if (editing) drafts.set(editing.uid, sameForm(box, editing) ? null : { box: formOf(box), autoTo });
    else drafts.set(null, sameForm({ ...box, n: autoNum ? blank.n : box.n }, blank) ? null : { box, autoTo, autoNum });
  }

  // The number has to be free (unless it's this box's own).
  function checkNumber() {
    const note = $('#numNote');
    const others = M.findNumber(list, box.n).filter(b => b.uid !== box.uid);
    const ok = Number.isInteger(box.n) && box.n > 0;
    $('#save').toggleAttribute('disabled', !ok || others.length > 0);
    if (!ok) { note.innerHTML = 'Give it a number.'; note.className = 'num-note bad'; return; }
    if (others.length) {
      const o = others[0], r = M.room(list, o.to);
      note.innerHTML = `${o.kind === 'piece' ? esc(o.items[0] || 'No. ' + o.n) : 'Box ' + o.n}${r ? ` (${esc(r.name)})` : ''} already has that number. <button type="button" class="linkish" data-act="nextfree">Use ${M.nextNumber(list)}</button>`;
      note.className = 'num-note bad';
      return;
    }
    note.innerHTML = !editing && box.n !== M.nextNumber(list) ? `Not the next number (${M.nextNumber(list)}), but it’s free. Handy for matching a box you’ve already numbered.` : '';
    note.className = 'num-note';
  }

  function save() {
    readForm();
    if ($('#save').disabled) return;
    const now = Date.now();
    if (editing) Object.assign(editing, box);
    M.putBox(list, editing || box, now);
    store.prefs.lastFrom = box.from;
    store.prefs.lastTo = box.to;
    store.savePrefs();
    store.save();
    clearTimeout(timer);
    drafts.set(editing ? editing.uid : null, null);
    const name = box.kind === 'piece' ? (box.items[0] || `No. ${box.n}`) : `Box ${box.n}`;
    if (editing) { toast(`${name} saved`); go(`/box/${box.uid}`); return; }
    // The next box is ready, with a note by its number (not over the Save button) and a way to open this one.
    lastSaved = { uid: box.uid, name };
    if (location.hash === '#/new') { pack(); window.scrollTo(0, 0); } else go('/new', true);
  }

  on({
    submit(e) { e.preventDefault(); save(); },
    input(e) {
      if (e.target.id === 'num') {
        const v = e.target.value.replace(/\D/g, '').slice(0, 4);
        if (v !== e.target.value) e.target.value = v;
        box.n = v ? Number(v) : 0;
        autoNum = false;
        $('#numTitle').textContent = v || '?';
        const sn = $('#saveNum'); if (sn) sn.textContent = v || '?';
        checkNumber();
      }
      readForm();
      preview();
    },
    async change(e) {
      if (e.target.id !== 'photoIn' || !e.target.files?.length) return;
      const file = e.target.files[0];
      e.target.value = '';
      readForm();
      await addPhoto(box, file);
      $('#photoStrip').innerHTML = photoStrip(box, true);
      keep();
    },
    click(e) {
      const t = e.target.closest('button, a');
      if (!t) return;
      if (t.dataset.kind) {
        if (t.dataset.kind === box.kind) return;
        // A box's first line becomes the furniture's name, and back; an empty name stays empty.
        const named = box.kind === 'piece' && ($('#pieceName')?.value || '').trim();
        readForm();
        if (box.kind === 'piece' && !named) box.items = box.items.slice(1);
        box.kind = t.dataset.kind;
        draw();
        preview();
        return;
      }
      if (t.dataset.room) {
        readForm();
        const side = t.closest('[data-side]').dataset.side;
        box[side] = box[side] === t.dataset.room ? '' : t.dataset.room;
        if (side === 'to') autoTo = false;
        // Kitchen to Kitchen is the usual: pick the room with the same name at the other end, or none
        // if there isn't one (rather than keep the last box's).
        if (side === 'from' && autoTo) {
          const name = box.from ? M.room(list, box.from).name : '';
          const match = name && M.rooms(list, 'to').find(r => M.norm(r.name) === M.norm(name));
          box.to = match ? match.id : '';
        }
        for (const c of $$(`[data-side="${side}"] [data-room]`)) c.setAttribute('aria-pressed', String(c.dataset.room === box[side]));
        if (side === 'from') for (const c of $$('[data-side="to"] [data-room]')) c.setAttribute('aria-pressed', String(c.dataset.room === box.to));
        preview();
        return;
      }
      if (t.dataset.add) {
        readForm();
        const side = t.dataset.add;
        addRoomSheet(list, side, r => { box[side] = r.id; if (side === 'to') autoTo = false; store.save(); draw(); });
        return;
      }
      if (t.dataset.flag) {
        box[t.dataset.flag] = !box[t.dataset.flag];
        t.setAttribute('aria-pressed', String(box[t.dataset.flag]));
        readForm();
        preview();
        return;
      }
      if (t.dataset.act === 'own') { ownList(); return; }
      if (t.dataset.act === 'fresh') {
        drafts.set(editing ? editing.uid : null, null);
        pack(editUid);
        return;
      }
      if (t.dataset.act === 'nextfree') {
        box.n = M.nextNumber(list);
        autoNum = !editing;
        $('#num').value = box.n;
        $('#numTitle').textContent = box.n;
        const sn = $('#saveNum'); if (sn) sn.textContent = box.n;
        checkNumber();
        preview();
        return;
      }
      if (t.dataset.unphoto) {
        readForm();
        const id = t.dataset.unphoto;
        box.photos = box.photos.filter(x => x !== id);
        if (!editing || !editing.photos.includes(id)) photos.remove(id);
        $('#photoStrip').innerHTML = photoStrip(box, true);
        keep();
      }
    },
  });
}
