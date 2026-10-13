// Moving day: key in each box's number as it goes onto the truck, and again as it comes off at the other end.
// Big keys for a thumb with a box in the other arm; the box you're keying shows before you tick it.
import { store } from './store.js';
import { app, esc, on, go, toast, icon, flagIcon, plural, $, sheet, buzz } from './ui.js';
import * as M from './model.js';
import { styleOf, shapeSVG } from './rooms.js';
import { dot, tile } from './common.js';

let typed = '';
let last = null; // { uid, stage, before: [value, at] } for Undo
let celebrated = { load: false, unload: false };

const WORDS = {
  load: { verb: 'On', done: 'on the truck', missing: 'Still to load', side: 'from', place: 'Leaving' },
  unload: { verb: 'Off', done: 'off the truck', missing: 'Still to come off', side: 'to', place: 'Going to' },
};

export function truck(stage) {
  if (!store.list) return go('/', true);
  if (stage) { store.prefs.stage = stage; store.savePrefs(); }
  stage = store.prefs.stage === 'unload' ? 'unload' : 'load';
  const list = store.list;
  typed = '';

  app.innerHTML = `
    <div class="truck-screen" data-stage="${stage}">
      <div class="truck-head">
        <h1>Moving day</h1>
        <nav class="seg" aria-label="Which end">
          <a href="#/truck/load" aria-current="${stage === 'load' ? 'page' : 'false'}">Loading</a>
          <a href="#/truck/unload" aria-current="${stage === 'unload' ? 'page' : 'false'}">Unloading</a>
        </nav>
      </div>
      <section class="truck-card" id="truckCard"></section>
      <section class="pad-card">
        <div class="readout" id="readout" aria-live="polite"></div>
        <div class="keys" role="group" aria-label="Number pad">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button class="key" data-key="${n}">${n}</button>`).join('')}
          <button class="key soft" data-key="back" aria-label="Delete a digit">${icon('back')}</button>
          <button class="key" data-key="0">0</button>
          <button class="key tick" data-key="tick" aria-label="Tick it ${WORDS[stage].done}">${icon('check')}<span>${WORDS[stage].verb}</span></button>
        </div>
        <div class="last" id="last" role="status" aria-live="polite"></div>
      </section>
      <div class="row center-row">
        <button class="btn small" data-act="missing" id="missingBtn"></button>
        <button class="btn small ghost" data-act="reset">Start the count again</button>
      </div>
      <section class="card rooms-card" id="roomsCard"></section>
    </div>`;
  drawTruck(false);
  readout();
  showLast();

  const press = key => {
    if (key === 'back') typed = typed.slice(0, -1);
    else if (key === 'tick') return tick();
    else if (/^\d$/.test(key) && typed.length < 4) typed = (typed + key).replace(/^0+(?=\d)/, '');
    readout();
  };

  function tick(force = false) {
    const n = Number(typed);
    if (!typed) { flash('bad', 'Key in a box number first'); return; }
    const found = M.findNumber(list, n);
    if (!found.length) { flash('bad', `There’s no box ${n}`); buzz([90, 40, 90]); return; }
    if (found.length > 1 && !force) { pickOne(found); return; }
    const box = found[0];
    if (M.done(box, stage)) {
      flash('warn', `${name(box)} is already ${WORDS[stage].done}`);
      buzz([20, 40, 20]);
      typed = '';
      readout(true);
      return;
    }
    const s = M.STAGES[stage];
    last = { uid: box.uid, stage, before: [box[s.field], box[s.at]] };
    M.setStage(box, stage, true);
    // Off the truck means it came, even if nobody ticked it on.
    store.save();
    buzz(35);
    typed = '';
    readout(true, box);
    showLast();
    drawTruck(true);
  }

  function pickOne(found) {
    sheet(`
      <h2>Which box ${found[0].n}?</h2>
      <p>Two boxes have this number. Tick the one in your arms, and renumber the other one later.</p>
      <ul class="boxes">${found.map(b => `<li><button class="boxrow pickrow" data-uid="${b.uid}">${tile(b, list)}<span class="what"><span class="where">${esc(M.room(list, b.to)?.name || 'No room')}</span><span class="things">${esc(b.items.join(' · '))}</span></span><span></span></button></li>`).join('')}</ul>
      <div class="row"><button class="btn" data-close>Cancel</button></div>`, (body, close) => {
      body.querySelectorAll('[data-uid]').forEach(b => b.addEventListener('click', () => {
        close();
        const box = M.byUid(list, b.dataset.uid);
        const s = M.STAGES[stage];
        last = { uid: box.uid, stage, before: [box[s.field], box[s.at]] };
        M.setStage(box, stage, true);
        store.save();
        typed = '';
        readout(true, box);
        showLast();
        drawTruck(true);
      }));
    });
  }

  // What the number you've keyed in is: before you tick it, and just after.
  function readout(justTicked = false, tickedBox = null) {
    const el = $('#readout');
    if (justTicked && tickedBox) {
      el.className = 'readout ok';
      el.innerHTML = boxCard(tickedBox, list, stage, true);
      return;
    }
    if (justTicked) return;
    const n = Number(typed);
    const found = typed ? M.findNumber(list, n) : [];
    el.className = 'readout' + (typed && !found.length ? ' nobox' : '');
    el.innerHTML = typed
      ? (found.length ? boxCard(found[0], list, stage, false, typed) : `<div class="rd-num"><b>${typed}</b><span>No box ${n} yet${typed.length < 4 ? ': keep typing' : ''}</span></div>`)
      : `<div class="rd-num empty"><b>${'&nbsp;'}</b><span>Key in the number on the box</span></div>`;
  }

  function flash(kind, msg) {
    const el = $('#readout');
    el.className = `readout ${kind}`;
    el.innerHTML = `<div class="rd-num"><b>${typed || '–'}</b><span>${esc(msg)}</span></div>`;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  }

  function showLast() {
    const el = $('#last');
    const box = last && last.stage === stage ? M.byUid(list, last.uid) : null;
    el.innerHTML = box ? `<span>${icon('check', 'icon xs')} ${esc(name(box))} ${WORDS[stage].done}</span><button class="linkish" data-act="undo">Undo</button>` : '';
  }

  // The truck, how many are ticked, and room by room.
  function drawTruck(animate) {
    const all = M.live(list);
    const doneN = all.filter(b => M.done(b, stage)).length;
    const car = all.filter(b => b.car);
    const truckBoxes = all.filter(b => !b.car);
    const finished = all.length > 0 && doneN === all.length;
    const prog = M.progress(list, stage);
    const card = $('#truckCard');
    const word = stage === 'load'
      ? `<b>${truckBoxes.filter(b => b.loaded).length}</b> of ${truckBoxes.length} on the truck${car.length ? `<small>${car.filter(b => b.loaded).length} of ${car.length} in the car</small>` : ''}`
      : `<b>${doneN}</b> of ${all.length} off the truck${car.length ? `<small>counting the ${car.length} in the car</small>` : ''}`;
    card.className = `truck-card${finished ? ' finished' : ''}`;
    card.innerHTML = `
      <div class="truck-art">${truckSVG(stage, stage === 'load' ? truckBoxes.filter(b => b.loaded).length : all.length - doneN, stage === 'load' ? truckBoxes.length : all.length, animate)}</div>
      <p class="truck-count">${finished ? finishedLine(list, stage, all) : word}</p>`;
    // Room by room: the rooms being emptied while loading, the rooms being filled at the other end.
    $('#roomsCard').innerHTML = prog.length ? `
      <h2>${stage === 'load' ? 'Room by room, at the old place' : 'Room by room, at the new place'}</h2>
      <ul class="rooms-prog">${prog.map(p => `<li class="${p.done === p.total ? 'full' : ''}">${p.room ? dot(p.room) : ''}<span>${esc(p.room?.name || 'No room')}</span><b>${p.done}/${p.total}</b><i style="--p:${p.total ? p.done / p.total : 0}"></i></li>`).join('')}</ul>` : '';
    $('#roomsCard').hidden = !prog.length;
    if (finished && animate && !celebrated[stage]) {
      celebrated[stage] = true;
      card.classList.add('celebrate');
      buzz([40, 60, 40, 60, 120]);
      // The truck is up top; whoever ticked the last box is looking at the keys.
      card.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    }
    const left = all.length - doneN;
    $('#missingBtn').innerHTML = left ? `${WORDS[stage].missing} <b>${left}</b>` : 'Nothing missing';
    $('#missingBtn').disabled = !left;
  }

  on({
    click(e) {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.key) { press(t.dataset.key); return; }
      if (t.dataset.act === 'undo' && last) {
        const box = M.byUid(list, last.uid);
        const s = M.STAGES[last.stage];
        if (box) { box[s.field] = last.before[0]; box[s.at] = Date.now(); store.save(); }
        toast(`${box ? name(box) : 'That box'} unticked`);
        last = null;
        celebrated[stage] = false;
        showLast();
        drawTruck(false);
        readout();
      }
      if (t.dataset.act === 'missing') missingSheet(list, stage, () => { drawTruck(true); showLast(); });
      if (t.dataset.act === 'reset') resetSheet(list, stage, () => { celebrated[stage] = false; last = null; truck(stage); });
    },
    keydown(e) {
      if (e.target.closest('input, textarea, select')) return;
    },
  });
  // A keyboard works too, on a laptop at the truck door.
  document.onkeydown = e => {
    if (!document.querySelector('.truck-screen') || document.getElementById('sheet').open) return;
    if (/^\d$/.test(e.key)) { press(e.key); e.preventDefault(); }
    else if (e.key === 'Backspace') { press('back'); e.preventDefault(); }
    else if (e.key === 'Enter') { press('tick'); e.preventDefault(); }
  };
}

const name = box => (box.kind === 'piece' ? box.items[0] || `No. ${box.n}` : `Box ${box.n}`);

function boxCard(box, list, stage, ticked, typed = '') {
  const to = M.room(list, box.to), from = M.room(list, box.from);
  const st = to ? styleOf(to) : null;
  const where = stage === 'unload' ? to : from;
  const flags = M.FLAGS.filter(f => box[f]);
  return `
    <div class="rd-box${ticked ? ' ticked' : ''}" style="${st ? `--rc:${st.hex};--ri:${st.ink}` : ''}">
      <span class="rd-n">${box.n}</span>
      <span class="rd-what">
        ${stage === 'unload'
          ? `<span class="rd-to">${st ? `<span class="rd-shape">${shapeSVG(st.shape)}</span>` : ''}<span><small>${ticked ? 'Take it to the' : 'Goes to the'}</small><b>${esc(to?.name || 'No room')}</b></span></span>`
          : `<span class="rd-to plain"><span><small>${box.car ? 'Goes in the car, not the truck' : where ? 'From the' : ''}</small><b>${esc(box.kind === 'piece' ? box.items[0] || 'Furniture' : where?.name || 'Box ' + box.n)}</b></span></span>`}
        <span class="rd-things">${esc((box.kind === 'piece' ? box.items.slice(1) : box.items).slice(0, 4).join(' · '))}</span>
        ${flags.length ? `<span class="rd-flags">${flags.map(f => `<span class="rd-flag f-${f}">${flagIcon(f)}${M.flagWords[f]}</span>`).join('')}</span>` : ''}
      </span>
      ${ticked ? `<span class="rd-tick">${icon('check')}</span>` : M.done(box, stage) ? `<span class="rd-already">Already ${stage === 'load' ? 'on' : 'off'}</span>` : ''}
    </div>`;
}

function finishedLine(list, stage, all) {
  const pieces = all.filter(b => b.kind === 'piece').length, boxes = all.length - pieces;
  if (stage === 'load') {
    const car = all.filter(b => b.car).length;
    return `<b>Everything’s loaded.</b><small>${plural(all.length - car, 'thing')} on the truck${car ? `, ${car} in the car` : ''}. Close the doors.</small>`;
  }
  return pieces
    ? `<b>All ${all.length} made it.</b><small>${plural(boxes, 'box', 'boxes')} and ${plural(pieces, 'piece')} of furniture.</small>`
    : `<b>All ${boxes} boxes made it.</b>`;
}

function missingSheet(list, stage, after) {
  const groups = M.missing(list, stage);
  const total = groups.reduce((a, g) => a + g.boxes.length, 0);
  sheet(`
    <h2>${WORDS[stage].missing}: ${total}</h2>
    <p>${stage === 'load' ? 'By the room it’s leaving, so you know where to look.' : 'By the room it’s going to.'} Tick one here if it turned up some other way.</p>
    <div class="missing">
      ${groups.map(g => `
        <h3>${g.room ? dot(g.room) : ''}${esc(g.room?.name || 'No room')} <small>${g.boxes.length}</small></h3>
        <ul>${g.boxes.map(b => `<li>${tile(b, list, 'small')}<span><b>${esc(name(b))}</b><small>${esc((b.kind === 'piece' ? b.items.slice(1) : b.items).slice(0, 4).join(' · '))}</small></span><button class="btn small" data-tick="${b.uid}">${icon('check')} ${WORDS[stage].verb}</button></li>`).join('')}</ul>`).join('')}
    </div>
    <div class="row"><button class="btn primary" data-close>Done</button></div>`, (body, close) => {
    body.addEventListener('click', e => {
      const b = e.target.closest('[data-tick]');
      if (!b) return;
      const box = M.byUid(list, b.dataset.tick);
      M.setStage(box, stage, true);
      store.save();
      b.closest('li').classList.add('gone');
      b.replaceWith(Object.assign(document.createElement('span'), { className: 'status on', textContent: 'Ticked' }));
      after();
    });
  });
}

function resetSheet(list, stage, after) {
  const n = M.live(list).filter(b => M.done(b, stage)).length;
  if (!n) { toast('Nothing’s ticked yet.'); return; }
  sheet(`
    <h2>Start the count again?</h2>
    <p>This unticks all ${n} ${stage === 'load' ? 'loaded' : 'unloaded'} boxes, for a fresh count. The boxes and everything else stay as they are.</p>
    <div class="row"><button class="btn" data-close>Keep the count</button><button class="btn primary" id="sheetGo">Untick ${n}</button></div>`, (body, close) => {
    body.querySelector('#sheetGo').onclick = () => {
      const now = Date.now();
      for (const b of M.live(list)) if (M.done(b, stage)) M.setStage(b, stage, false, now);
      store.save();
      close();
      after();
    };
  });
}

// A removal truck from the side, its back cut away to show the boxes. Loading stacks them from the cab back;
// unloading takes them off again. When the count is done it shuts (loading) or drives away (unloading).
function truckSVG(stage, inside, total, animate) {
  const cols = 9, rows = 4, slots = cols * rows;
  const filled = total ? (inside === 0 ? 0 : inside >= total ? slots : Math.max(1, Math.min(slots - 1, Math.round(inside / total * slots)))) : 0;
  const boxes = [];
  for (let k = 0; k < filled; k++) {
    const c = cols - 1 - Math.floor(k / rows), r = rows - 1 - (k % rows);
    const x = 14 + c * 21.5, y = 16 + r * 22;
    const fresh = animate && k === filled - 1 && stage === 'load';
    boxes.push(`<g class="tb${fresh ? ' pop' : ''}" style="transform-origin:${x + 10}px ${y + 21}px"><rect x="${x}" y="${y}" width="20" height="20.5" rx="1.5"/><path d="M${x + 7.5} ${y}v20.5"/></g>`);
  }
  return `
    <svg class="truck" viewBox="0 0 330 150" role="img" aria-label="A removal truck, ${inside} of ${total} boxes inside">
      <g class="truck-body">
        <rect class="tr-cargo" x="8" y="9" width="208" height="102" rx="5"/>
        <g class="tr-boxes">${boxes.join('')}</g>
        <rect class="tr-shutter" x="8" y="9" width="208" height="102" rx="5"/>
        <g class="tr-brand"><path d="M86 47 80 55h4v12h4V55h4zm16 0-6 8h4v12h4V55h4z"/><rect x="79" y="70" width="27" height="3"/><text x="113" y="68">THIS SIDE UP</text></g>
        <path class="tr-cab" d="M219 40h50c6 0 9 2 12 7l20 30c2 3 3 5 3 9v25h-85z"/>
        <path class="tr-glass" d="M268 48h-28v24h44z"/>
        <rect class="tr-bumper" x="300" y="100" width="12" height="8" rx="2"/>
        <rect class="tr-chassis" x="6" y="108" width="300" height="8" rx="3"/>
        <g class="tr-wheel" style="transform-origin:60px 120px"><circle cx="60" cy="120" r="15"/><circle cx="60" cy="120" r="5"/></g>
        <g class="tr-wheel" style="transform-origin:170px 120px"><circle cx="170" cy="120" r="15"/><circle cx="170" cy="120" r="5"/></g>
        <g class="tr-wheel" style="transform-origin:268px 120px"><circle cx="268" cy="120" r="15"/><circle cx="268" cy="120" r="5"/></g>
        <g class="tr-puff"><circle cx="0" cy="112" r="6"/><circle cx="-12" cy="106" r="8"/><circle cx="-26" cy="100" r="10"/></g>
      </g>
      <path class="tr-road" d="M0 137h330"/>
    </svg>`;
}
