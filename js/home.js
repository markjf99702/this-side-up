// The first screen: a welcome before there's a list; after that, every box, with a search that finds the kettle.
import { store } from './store.js';
import { app, esc, on, go, toast, icon, flagIcon, plural, $, sheet } from './ui.js';
import * as M from './model.js';
import { boxRow, tile, needsLabel, dot, marked } from './common.js';
import { example } from './example.js';
import { sampleLabel } from './labels.js';
import { sheet as sheetOf, perSheet } from './sheets.js';

let filter = 'all';
let query = '';

const FILTERS = [
  ['all', 'All'],
  ['first', 'Open first'],
  ['fragile', 'Fragile'],
  ['heavy', 'Heavy'],
  ['car', 'Car'],
  ['piece', 'Furniture'],
  ['print', 'To print'],
  ['packed', 'Still packed'],
];

export function startList() {
  store.list = M.newList();
  store.save();
}

export function home() {
  const list = store.list;
  if (!list) return welcome();
  const t = M.tally(list);
  const toPrint = M.live(list).filter(b => needsLabel(b, list)).length;
  const per = perSheet(sheetOf(store.prefs.sheet));
  const clashes = M.clashes(list);
  const showPacked = t.arrived > 0;
  if (!showPacked && filter === 'packed') filter = 'all';

  app.innerHTML = `
    ${list.example ? `<div class="banner"><p><b>This is an example move.</b> Look around, tick things, print a label. When you’re ready, start your own list.</p><button class="btn small primary" data-act="own">Start my own list</button></div>` : ''}
    ${clashes.map(c => `<div class="banner warn"><p><b>Two boxes are both number ${c[0].n}.</b> That happens when two phones pack at once. Give one of them a new number and print it a new label.</p><a class="btn small" href="#/box/${c[c.length - 1].uid}">Renumber one</a></div>`).join('')}
    <div class="find">
      ${icon('search')}
      <input id="q" type="search" placeholder="Where’s the kettle?" value="${esc(query)}" autocomplete="off" enterkeyhint="search" aria-label="Search every box">
      <button class="clear" type="button" data-act="clear" aria-label="Clear the search"${query ? '' : ' hidden'}>${icon('x')}</button>
    </div>
    <div id="results"></div>
  `;
  draw();

  on({
    input(e) {
      if (e.target.id !== 'q') return;
      query = e.target.value;
      app.querySelector('.clear').hidden = !query;
      draw();
    },
    keydown(e) {
      if (e.target.id === 'q' && e.key === 'Enter') e.target.blur();
    },
    click(e) {
      const act = e.target.closest('[data-act]')?.dataset.act;
      const f = e.target.closest('[data-filter]')?.dataset.filter;
      const g = e.target.closest('[data-group]')?.dataset.group;
      if (f) { filter = f; draw(); return; }
      if (g) { store.prefs.group = g; store.savePrefs(); draw(); return; }
      if (act === 'clear') { query = ''; const q = $('#q'); q.value = ''; q.focus(); app.querySelector('.clear').hidden = true; draw(); }
      if (act === 'own') ownList();
    },
  });

  function draw() {
    const out = $('#results');
    const q = query.trim();
    if (q) { out.innerHTML = results(list, q); return; }
    const all = M.live(list);
    const shown = all.filter(b => {
      switch (filter) {
        case 'first': case 'fragile': case 'heavy': case 'car': return b[filter];
        case 'piece': return b.kind === 'piece';
        case 'print': return needsLabel(b, list);
        case 'packed': return !b.unpacked;
        default: return true;
      }
    });
    const firstBoxes = all.filter(b => b.first);
    out.innerHTML = `
      ${all.length ? `
        <div class="tally" aria-label="Totals">
          <span><b>${t.boxes}</b> ${t.boxes === 1 ? 'box' : 'boxes'}</span>
          ${t.pieces ? `<span><b>${t.pieces}</b> furniture</span>` : ''}
          ${t.first ? `<span>${flagIcon('first')}<b>${t.first}</b> open first</span>` : ''}
          ${t.fragile ? `<span>${flagIcon('fragile')}<b>${t.fragile}</b> fragile</span>` : ''}
          ${t.car ? `<span>${flagIcon('car')}<b>${t.car}</b> for the car</span>` : ''}
          ${t.loaded && !t.arrived ? `<span>${icon('truck', 'icon xs')}<b>${t.loaded}</b> on the truck</span>` : ''}
          ${t.arrived ? `<span>${icon('check', 'icon xs')}<b>${t.unpacked}</b> of ${t.all} unpacked</span>` : ''}
        </div>
        ${toPrint || firstBoxes.length ? '<div class="nudges">' : ''}
        ${toPrint ? `<a class="nudge" href="#/print">${icon('print')}<span><b>${plural(toPrint, 'label')} to print</b>${toPrint >= per ? ` · that’s a sheet of ${per}` : ''}</span>${icon('arrow', 'icon go')}</a>` : ''}
        ${firstBoxes.length ? `<a class="nudge first" href="#/first">${flagIcon('first')}<span><b>The first night</b> · ${plural(firstBoxes.length, 'box', 'boxes')} to open first</span>${icon('arrow', 'icon go')}</a>` : ''}
        ${toPrint || firstBoxes.length ? '</div>' : ''}
        <div class="filters" role="group" aria-label="Show">
          ${FILTERS.filter(([k]) => k !== 'packed' || showPacked).map(([k, label]) => `<button class="chip" data-filter="${k}" aria-pressed="${filter === k}">${label}</button>`).join('')}
        </div>
        <div class="list-head">
          <h2>${filter === 'all' ? 'Every box' : FILTERS.find(([k]) => k === filter)[1]} <small>${shown.length}</small></h2>
          <div class="seg" role="group" aria-label="Order">
            <button data-group="number" aria-pressed="${store.prefs.group !== 'room'}">By number</button>
            <button data-group="room" aria-pressed="${store.prefs.group === 'room'}">By room</button>
          </div>
        </div>
        ${shown.length ? listed(list, shown, store.prefs.group) : `<p class="empty-note">Nothing here.</p>`}
      ` : `
        <div class="empty-note">
          <p><b>No boxes yet.</b> Pack the first one: its number is 1.</p>
          <a class="btn primary" href="#/new">${icon('pack')} Pack a box</a>
        </div>`}
    `;
  }
}

function listed(list, boxes, group) {
  if (group !== 'room') return `<ul class="boxes">${boxes.map(b => boxRow(b, list)).join('')}</ul>`;
  const groups = new Map();
  for (const r of M.rooms(list, 'to')) groups.set(r.id, []);
  groups.set('', []);
  for (const b of boxes) (groups.get(M.room(list, b.to) ? b.to : '') || groups.get('')).push(b);
  return [...groups.entries()].filter(([, v]) => v.length).map(([rid, v]) => {
    const r = M.room(list, rid);
    return `<h3 class="group-head">${r ? dot(r) : ''}${r ? esc(r.name) : 'No room yet'} <small>${v.length}</small></h3><ul class="boxes">${v.map(b => boxRow(b, list)).join('')}</ul>`;
  }).join('');
}

// "kettle" → Box 12, Kitchen, open first.
function results(list, q) {
  const found = M.search(list, q);
  if (!found.length) return `<div class="answer none"><p>Nothing called “${esc(q)}” in any box.</p><p class="hint">Try part of the word, or a room.</p></div>`;
  const top = found[0];
  const one = found.length === 1 || found[0].why === 'number';
  const r = M.room(list, top.box.to);
  return `
    ${one ? `
      <a class="answer" href="#/box/${top.box.uid}">
        ${tile(top.box, list, 'big')}
        <span>
          <span class="answer-q">“${esc(q)}” is in</span>
          <span class="answer-a">${top.box.kind === 'piece' ? esc(top.box.items[0] || 'Furniture') + ' · ' : ''}${top.box.kind === 'piece' ? 'No.' : 'Box'} ${top.box.n}${r ? `, ${esc(r.name)}` : ''}${top.box.first ? ', open first' : ''}</span>
          <span class="answer-things">${(top.box.kind === 'piece' ? top.box.items.slice(1) : top.box.items).map(t => marked(t, q)).join(' · ')}</span>
          ${top.box.unpacked ? '<span class="status off">Unpacked</span>' : top.box.arrived ? '<span class="status on">Arrived</span>' : top.box.loaded ? '<span class="status on">On the truck</span>' : ''}
        </span>
      </a>` : `<p class="list-head"><span>${plural(found.length, 'box', 'boxes')} with “${esc(q)}”</span></p>`}
    <ul class="boxes">${(one ? found.slice(1) : found).map(h => boxRow(h.box, list, { hit: h, query: q })).join('')}</ul>`;
}

function ownList() {
  sheet(`
    <h2>Start your own list</h2>
    <p>This clears the example. Your own boxes start at number 1.</p>
    <div class="row"><button class="btn" data-close>Not yet</button><button class="btn primary" id="sheetGo">Clear the example</button></div>
  `, (body, close) => {
    body.querySelector('#sheetGo').onclick = () => {
      close();
      startList();
      toast('Ready. Pack the first box.');
      go('/new');
    };
  });
}

function welcome() {
  app.innerHTML = `
    <div class="welcome">
      <section class="hero">
        <p class="kicker">For moving house</p>
        <h1>Number every box</h1>
        <p>Say what’s in each one, which room it’s going to, and whether to open it first. Print labels with a QR code any phone can read, tick the boxes onto the truck and off again, and find the kettle on the first night.</p>
        <div class="row">
          <button class="btn primary" data-act="start">${icon('pack')} Pack the first box</button>
          <button class="btn" data-act="example">Look around an example move</button>
        </div>
      </section>
      <figure class="sample">
        <div class="boxside">${sampleLabel()}</div>
        <figcaption>Point a phone at the code: it shows what’s in Box 12 and where it goes.</figcaption>
      </figure>
      <ol class="how">
        <li><span class="tile small" data-digits="1"><b>1</b></span><span><b>Pack.</b> Each box gets the next number. Pick the room it’s leaving and the one it’s going to, list what’s in it, and tick Fragile, Heavy, Open first or Goes in the car. The sofa gets a number too.</span></li>
        <li><span class="tile small" data-digits="1"><b>2</b></span><span><b>Label.</b> Print on Avery 5164, 5168 or 5126 label sheets, or plain paper with cut lines. Point any phone at the code and it shows what’s inside. Colour signs for the doors at the new place.</span></li>
        <li><span class="tile small" data-digits="1"><b>3</b></span><span><b>Moving day.</b> Key in each box’s number as it goes on the truck, and again as it comes off, room by room, with a list of anything missing.</span></li>
        <li><span class="tile small" data-digits="1"><b>4</b></span><span><b>Unpack.</b> Tick boxes off as you empty them. Search finds anything: “kettle” → Box 12, Kitchen, open first.</span></li>
      </ol>
      <p class="hint center">No account and nothing to install. The list stays on this phone, works with no Wi-Fi, and goes to a second phone as a link or a file.</p>
    </div>`;
  on({
    click(e) {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'start') { startList(); go('/new'); }
      if (act === 'example') { store.list = example(); store.save(); go('/'); }
    },
  });
}
