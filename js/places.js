// The rooms at both ends of the move: the ones you're packing up, and the ones at the new place, each with
// the colour and shape its boxes and door sign wear.
import { store } from './store.js';
import { app, esc, on, go, toast, icon, sheet, plural, $ } from './ui.js';
import * as M from './model.js';
import { COLOURS, SHAPES, PRESETS, shapeSVG, styleOf } from './rooms.js';
import { dot } from './common.js';

const SIDES = {
  from: ['Leaving', 'The rooms you’re packing up.'],
  to: ['Going to', 'The rooms at the new place. Each has its own colour and shape for its boxes and its door sign.'],
};

// Adding a room from the packing form or the rooms screen: tap a usual one or type a name.
export function addRoomSheet(list, side, done) {
  const have = new Set(M.rooms(list, side).map(r => M.norm(r.name)));
  const ideas = PRESETS.filter(n => !have.has(M.norm(n)));
  sheet(`
    <h2>A room ${side === 'from' ? 'you’re leaving' : 'at the new place'}</h2>
    <div class="chips">${ideas.map(n => `<button type="button" class="chip" data-name="${esc(n)}">${esc(n)}</button>`).join('')}</div>
    <form class="row add-room" id="addRoom">
      <input class="input grow" id="roomName" maxlength="${M.MAX_NAME}" placeholder="Or type a name: Mudroom, Ana’s room…" autocomplete="off">
      <button class="btn primary" type="submit">Add</button>
    </form>
    <div class="row"><button class="btn" type="button" data-close>Cancel</button></div>
  `, (body, close) => {
    const add = name => {
      name = M.tidyName(name);
      if (!name) return;
      const same = M.rooms(list, side).find(r => M.norm(r.name) === M.norm(name));
      const room = same || M.addRoom(list, side, name);
      store.save();
      close();
      done?.(room);
    };
    body.querySelectorAll('[data-name]').forEach(b => b.addEventListener('click', () => add(b.dataset.name)));
    body.querySelector('#addRoom').addEventListener('submit', e => { e.preventDefault(); add(body.querySelector('#roomName').value); });
  });
}

export function roomsScreen() {
  if (!store.list) return go('/', true);
  const list = store.list;
  const count = (r, side) => M.live(list).filter(b => b[side] === r.id).length;
  app.innerHTML = `
    <div class="narrow">
      <div class="screen-head"><div><a class="crumb" href="#/more">${icon('back', 'icon xs')} More</a><h1>Rooms</h1></div></div>
      ${['to', 'from'].map(side => `
        <section class="card">
          <h2>${SIDES[side][0]}</h2>
          <p class="hint">${SIDES[side][1]}</p>
          <ul class="room-list">
            ${M.rooms(list, side).map(r => `
              <li>
                ${side === 'to' ? `<button class="dot" data-style="${r.id}" aria-label="Change ${esc(r.name)}’s colour and shape">${dot(r, 'big')}</button>` : ''}
                <input class="input room-name" data-rename="${r.id}" value="${esc(r.name)}" maxlength="${M.MAX_NAME}" aria-label="Room name">
                <span class="hint">${plural(count(r, side), 'box', 'boxes')}</span>
                <button class="icon-btn" data-remove="${r.id}" aria-label="Remove ${esc(r.name)}">${icon('trash')}</button>
              </li>`).join('')}
          </ul>
          <button class="btn small" data-add="${side}">${icon('plus')} Add a room</button>
        </section>`).join('')}
    </div>`;

  on({
    change(e) {
      const id = e.target.dataset.rename;
      if (!id) return;
      const r = M.room(list, id);
      const name = M.tidyName(e.target.value);
      if (!name) { e.target.value = r.name; return; }
      if (name === r.name) return;
      r.name = name;
      r.edited = Date.now();
      store.save();
      toast(`Renamed. Labels for its boxes need printing again.`);
    },
    click(e) {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.add) addRoomSheet(list, t.dataset.add, () => roomsScreen());
      if (t.dataset.style) styleSheet(list, M.room(list, t.dataset.style));
      if (t.dataset.remove) removeRoom(list, M.room(list, t.dataset.remove));
    },
  });
}

function styleSheet(list, r) {
  const taken = new Map(M.rooms(list, 'to').filter(x => x.id !== r.id).map(x => [`${x.color}/${x.shape}`, x.name]));
  let color = r.color, shape = r.shape;
  const draw = body => {
    body.querySelector('#styleBody').innerHTML = `
      <p class="style-now">${dot({ ...r, color, shape, side: 'to' }, 'big')} <b>${esc(r.name)}</b> ${taken.has(`${color}/${shape}`) ? `<span class="warn-text">${esc(taken.get(`${color}/${shape}`))} looks the same</span>` : ''}</p>
      <p class="kicker">Colour</p>
      <div class="swatches">${COLOURS.map((c, i) => `<button type="button" class="swatch" data-c="${i}" aria-pressed="${i === color}" style="--rc:${c.hex}" aria-label="${c.name}"></button>`).join('')}</div>
      <p class="kicker">Shape</p>
      <div class="swatches">${SHAPES.map((s, i) => `<button type="button" class="swatch shape-sw" data-s="${i}" aria-pressed="${i === shape}" aria-label="${s.name}">${shapeSVG(i)}</button>`).join('')}</div>`;
  };
  sheet(`
    <h2>Colour and shape</h2>
    <p>Boxes for this room and its door sign wear these. The shape is there for anyone who can’t tell two colours apart, and for black-and-white printers.</p>
    <div id="styleBody"></div>
    <div class="row"><button class="btn" data-close>Cancel</button><button class="btn primary" id="sheetGo">Use these</button></div>
  `, (body, close) => {
    draw(body);
    body.addEventListener('click', e => {
      const b = e.target.closest('.swatch');
      if (!b) return;
      if (b.dataset.c) color = Number(b.dataset.c);
      if (b.dataset.s) shape = Number(b.dataset.s);
      draw(body);
    });
    body.querySelector('#sheetGo').onclick = () => {
      r.color = color; r.shape = shape; r.edited = Date.now();
      store.save();
      close();
      roomsScreen();
    };
  });
}

function removeRoom(list, r) {
  const side = r.side;
  const boxes = M.live(list).filter(b => b[side] === r.id);
  const others = M.rooms(list, side).filter(x => x.id !== r.id);
  const finish = moveTo => {
    const now = Date.now();
    for (const b of boxes) { b[side] = moveTo; M.putBox(list, b, now); }
    r.gone = now; r.edited = now;
    store.save();
    roomsScreen();
    toast(`${r.name} removed`);
  };
  if (!boxes.length) {
    finish('');
    return;
  }
  sheet(`
    <h2>Remove ${esc(r.name)}?</h2>
    <p>${plural(boxes.length, 'box is', 'boxes are')} ${side === 'to' ? 'going to' : 'coming from'} ${esc(r.name)}. Move ${boxes.length === 1 ? 'it' : 'them'} to:</p>
    <div class="chips">${others.map(o => `<button type="button" class="chip" data-to="${o.id}">${side === 'to' ? dot(o) : ''}${esc(o.name)}</button>`).join('')}<button type="button" class="chip" data-to="">No room</button></div>
    <div class="row"><button class="btn" data-close>Keep ${esc(r.name)}</button></div>
  `, (body, close) => {
    body.querySelectorAll('[data-to]').forEach(b => b.addEventListener('click', () => { close(); finish(b.dataset.to); }));
  });
}
