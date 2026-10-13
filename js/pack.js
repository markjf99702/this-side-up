// Packing a box (or the sofa): its number, the room it's leaving and the room it's going to, what's in it a
// line at a time, and the four flags. The label draws itself underneath as you type.
import { store, photos, shrink } from './store.js';
import { app, esc, on, go, toast, icon, flagIcon, $, $$, plural } from './ui.js';
import * as M from './model.js';
import { dot } from './common.js';
import { onScreen, fromBox } from './labels.js';
import { addRoomSheet } from './places.js';
import { startList } from './home.js';
import { photoStrip, addPhoto } from './box.js';

const FLAG_INFO = {
  fragile: ['Fragile', 'Glass, china, screens'],
  heavy: ['Heavy', 'Books, tools: two people'],
  first: ['Open first', 'For the first night'],
  car: ['Goes in the car', 'Not on the truck'],
};

export function pack(editUid) {
  if (!store.list) startList();
  const list = store.list;
  const editing = editUid ? M.byUid(list, editUid) : null;
  if (editUid && !editing) return go('/', true);
  const p = store.prefs;
  // A copy to change; nothing is saved until Save.
  const box = editing ? JSON.parse(JSON.stringify(editing)) : M.newBox(list, {
    from: M.room(list, p.lastFrom) && !M.room(list, p.lastFrom).gone ? p.lastFrom : '',
    to: M.room(list, p.lastTo) && !M.room(list, p.lastTo).gone ? p.lastTo : '',
  });
  // "Going to" follows "Leaving" (Kitchen to Kitchen) until it's picked by hand: for a new box, and for a box
  // whose two rooms already share a name.
  const sameNames = () => box.from && box.to && M.norm(M.room(list, box.from)?.name) === M.norm(M.room(list, box.to)?.name);
  let autoTo = !editing || !box.to || sameNames();
  let timer;

  draw();

  function draw() {
    const fromRooms = M.rooms(list, 'from'), toRooms = M.rooms(list, 'to');
    const piece = box.kind === 'piece';
    app.innerHTML = `
      <div class="pack">
        <div class="screen-head">
          <div>
            <p class="kicker kraft">${editing ? 'Change' : 'Pack'}</p>
            <h1>${piece ? 'No.' : 'Box'} <span id="numTitle">${box.n}</span></h1>
          </div>
          ${editing ? `<a class="btn small" href="#/box/${box.uid}">${icon('back')} Back</a>` : `<span class="hint kraft">${plural(M.live(list).length, 'box', 'boxes')} so far</span>`}
        </div>
        <form class="pack-grid" id="packForm" novalidate>
          <div class="card pack-form">
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
              <button type="submit" class="btn primary wide" id="save">${icon('check')} ${editing ? 'Save changes' : `Save ${piece ? 'No.' : 'Box'} <span id="saveNum">${box.n}</span>`}</button>
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
    }, 60);
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
    const name = box.kind === 'piece' ? (box.items[0] || `No. ${box.n}`) : `Box ${box.n}`;
    if (editing) { toast(`${name} saved`); go(`/box/${box.uid}`); return; }
    const saved = box.uid;
    toast(`${name} saved`, { label: 'Open it', run: () => go(`/box/${saved}`) });
    pack();
    window.scrollTo(0, 0);
    $('#things')?.focus({ preventScroll: true });
  }

  on({
    submit(e) { e.preventDefault(); save(); },
    input(e) {
      if (e.target.id === 'num') {
        const v = e.target.value.replace(/\D/g, '').slice(0, 4);
        if (v !== e.target.value) e.target.value = v;
        box.n = v ? Number(v) : 0;
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
      if (t.dataset.act === 'nextfree') {
        box.n = M.nextNumber(list);
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
      }
    },
  });
}
