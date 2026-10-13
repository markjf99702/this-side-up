// Printing: box labels on a label sheet or plain paper, colour signs for the doors at the new place, and a test
// sheet for lining labels up. Pages are drawn true to size in inches; the preview is the same pages, shrunk.
import { store } from './store.js';
import { app, esc, on, toast, icon, plural, $, framed } from './ui.js';
import * as M from './model.js';
import { SHEETS, sheet as sheetOf, perSheet, pages, nudgeStep, fmt } from './sheets.js';
import { labelPages, testPage, signPage, fromBox } from './labels.js';
import { needsLabel, labelSig, dot, tile } from './common.js';
import { badge } from './app.js';

let only = null;       // uids, when a box's own "Print this label" brought us here
let picked = null;     // uids ticked by hand, in "Pick" mode
let which = 'new';     // 'new' (not printed or changed), 'all' or 'pick'
let signRooms = null;  // room ids ticked for door signs
let kind = 'labels';   // what Print will print: 'labels', 'signs' or 'test'

const defaultPaper = () => (/^(en-us|en-ca|es-mx|en-ph|fil)/i.test(navigator.language || '') ? 'letter' : 'a4');
const paper = () => store.prefs.paper || defaultPaper();
const nudgeFor = s => ({ x: 0, y: 0, ...(store.prefs.nudge?.[s.id] || {}) });
const startFor = s => Math.min(store.prefs.start?.[s.id] || 0, perSheet(s) - 1);

function chosen(list) {
  const all = M.live(list);
  if (only) return all.filter(b => only.includes(b.uid));
  if (which === 'all') return all;
  if (which === 'pick') return all.filter(b => picked?.has(b.uid));
  return all.filter(b => needsLabel(b, list));
}

// what: 'labels', 'signs' or 'test'. uid: just that box's label (from its own Print button).
export function printScreen(what = 'labels', uid = null) {
  if (!store.list) { store.list = M.newList(); store.save(); }
  kind = what === 'signs' ? 'signs' : what === 'test' ? 'test' : 'labels';
  only = uid && M.byUid(store.list, uid) ? [uid] : null;
  app.innerHTML = `
    <div class="printing-screen">
      <div class="screen-head"><div><p class="kicker kraft">Print</p><h1>${kind === 'signs' ? 'Door signs' : kind === 'test' ? 'Test sheet' : 'Box labels'}</h1></div></div>
      <nav class="seg print-tabs" aria-label="What to print">
        <a href="#/print" aria-current="${kind === 'labels' ? 'page' : 'false'}">Box labels</a>
        <a href="#/print/signs" aria-current="${kind === 'signs' ? 'page' : 'false'}">Door signs</a>
        <a href="#/print/test" aria-current="${kind === 'test' ? 'page' : 'false'}">Test sheet</a>
      </nav>
      <div class="print-grid">
        <div class="print-controls" id="controls"></div>
        <div class="print-preview"><p class="kicker kraft">What comes out</p><div class="preview" id="preview"></div></div>
      </div>
    </div>`;
  if (kind === 'signs') signs(); else if (kind === 'test') test(); else labels();
}

// ---------- Box labels ----------

function labels() {
  const list = store.list;
  const s = sheetOf(store.prefs.sheet);
  const per = perSheet(s);
  const start = startFor(s);
  const boxes = chosen(list);
  const all = M.live(list);
  const fresh = all.filter(b => needsLabel(b, list));
  const changed = fresh.filter(b => b.printed).length;
  const pageCount = boxes.length ? pages(s, boxes.length, start).length : 0;
  const nudge = nudgeFor(s);

  $('#controls').innerHTML = `
    ${only ? `
      <section class="card">
        <h2>Printing</h2>
        <p class="only">${boxes.map(b => tile(b, list, 'small')).join('')}<span>${boxes.length === 1 ? (boxes[0].kind === 'piece' ? esc(boxes[0].items[0] || 'No. ' + boxes[0].n) : `Just Box ${boxes[0].n}`) : plural(boxes.length, 'label')}</span></p>
        <button class="linkish" data-act="everything">Choose from every box instead</button>
      </section>` : `
      <section class="card">
        <h2>Which boxes</h2>
        <div class="chips" role="group" aria-label="Which boxes">
          <button class="chip" data-which="new" aria-pressed="${which === 'new'}">Not printed yet <small>${fresh.length}</small></button>
          <button class="chip" data-which="all" aria-pressed="${which === 'all'}">All <small>${all.length}</small></button>
          <button class="chip" data-which="pick" aria-pressed="${which === 'pick'}">Pick</button>
        </div>
        ${which === 'new' && changed ? `<p class="hint">Includes ${plural(changed, 'box')} changed since ${changed === 1 ? 'its label was' : 'their labels were'} printed.</p>` : ''}
        ${which === 'pick' ? `<ul class="picklist">${all.map(b => `<li><label><input type="checkbox" data-pick="${b.uid}"${picked?.has(b.uid) ? ' checked' : ''}>${tile(b, list, 'small')}<span>${esc(M.room(list, b.to)?.name || 'No room')}<small>${esc(b.items.slice(0, 3).join(', '))}</small></span></label></li>`).join('')}</ul>` : ''}
      </section>`}
    <section class="card">
      <h2>Labels</h2>
      <select class="input" id="sheetPick" aria-label="Label sheet">
        ${SHEETS.map(x => `<option value="${x.id}"${x.id === s.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}
      </select>
      <p class="hint">${esc(s.about)}.${s.also ? ` Also fits ${esc(s.also)}.` : ''}</p>
      ${per > 1 ? `
        <p class="field-label">Start at label ${start + 1}</p>
        <div class="start-row">
          <div class="mini-sheet" style="--cols:${s.cols};--ratio:${s.page[0]} / ${s.page[1]}">
            ${Array.from({ length: per }, (_, k) => `<button class="mini${k < start ? ' used' : ''}" data-start="${k}" aria-label="Start at label ${k + 1}" aria-pressed="${k === start}">${k < start ? '' : k + 1}</button>`).join('')}
          </div>
          <p class="hint">Using up a sheet? Tap the first label that’s still on it.</p>
        </div>` : ''}
    </section>
    <section class="card print-go">
      ${boxes.length
        ? `<button class="btn primary wide" data-act="print"${framed() ? ' disabled' : ''}>${icon('print')} Print ${plural(boxes.length, 'label')}<small>${plural(pageCount, 'sheet')}</small></button>`
        : `<p class="hint">${which === 'new' && !only ? 'Every label is printed and up to date.' : 'Pick the boxes to print.'}</p>`}
      ${framed() ? '<p class="hint">Open it on junkdrawer.works to print.</p>' : ''}
      ${howToPrint()}
      ${nudger(s, nudge)}
    </section>`;
  // The preview shows the first few sheets; the printer gets them all.
  const SHOW = 3;
  $('#preview').innerHTML = labelPages(boxes.map(b => fromBox(b, list)), s, { start, nudge, outline: true, limit: SHOW })
    + (pageCount > SHOW ? `<p class="more-sheets">and ${plural(pageCount - SHOW, 'more sheet')} like ${pageCount - SHOW === 1 ? 'it' : 'these'}</p>` : '');
  fitPreview();

  on({
    change(e) {
      if (e.target.id === 'sheetPick') { store.prefs.sheet = e.target.value; store.savePrefs(); labels(); }
      if (e.target.dataset.pick) {
        picked ||= new Set();
        if (e.target.checked) picked.add(e.target.dataset.pick); else picked.delete(e.target.dataset.pick);
        labels();
      }
    },
    click(e) {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.which) { which = t.dataset.which; if (which === 'pick' && !picked) picked = new Set(fresh.map(b => b.uid)); labels(); return; }
      if (t.dataset.start) { store.prefs.start = { ...store.prefs.start, [s.id]: Number(t.dataset.start) }; store.savePrefs(); labels(); return; }
      if (t.dataset.nudge) { nudgeBy(s, t.dataset.nudge); labels(); return; }
      if (t.dataset.act === 'everything') { only = null; labels(); return; }
      if (t.dataset.act === 'print') printLabels(boxes, s, start);
    },
  });
}

function printLabels(boxes, s, start) {
  const list = store.list;
  preparePrint();
  window.print();
  // Mark them printed, with a way back if the printer jammed.
  const before = boxes.map(b => [b, b.printed, b.printedSig]);
  const now = Date.now();
  for (const b of boxes) { b.printed = now; b.printedSig = labelSig(b, list); }
  // The next run starts on the label after the last one used.
  const next = (start + boxes.length) % perSheet(s);
  store.prefs.start = { ...store.prefs.start, [s.id]: next };
  store.savePrefs();
  store.save();
  only = null;
  badge();
  labels();
  toast(`${plural(boxes.length, 'label')} marked as printed`, {
    label: 'Undo',
    run: () => {
      for (const [b, p, sig] of before) { b.printed = p; b.printedSig = sig; }
      store.prefs.start = { ...store.prefs.start, [s.id]: start };
      store.savePrefs();
      store.save();
      badge();
      if (location.hash === '#/print') labels();
    },
  });
}

function howToPrint() {
  return `
    <details class="how-print">
      <summary>Getting them to line up</summary>
      <p>Print at <b>100%</b> (“Actual size”), with margins set to <b>None</b> and background graphics on. In Chrome those are under More settings; in Safari, tick Print backgrounds.</p>
      <p>The first time, print the <a href="#/print/test">test sheet</a> on plain paper, hold it behind a sheet of labels against a window, and nudge until the outlines sit on the labels.</p>
    </details>`;
}

function nudger(s, nudge) {
  const moved = nudge.x || nudge.y;
  return `
    <div class="nudger">
      <p class="field-label">Nudge <span class="hint">if they print a little off</span></p>
      <div class="nudge-pad">
        <button class="icon-btn" data-nudge="left" aria-label="Move left">${arrow(180)}</button>
        <span>${fmt(Math.abs(nudge.x), s.unit)} ${nudge.x < 0 ? 'left' : 'right'}</span>
        <button class="icon-btn" data-nudge="right" aria-label="Move right">${arrow(0)}</button>
        <button class="icon-btn" data-nudge="up" aria-label="Move up">${arrow(-90)}</button>
        <span>${fmt(Math.abs(nudge.y), s.unit)} ${nudge.y < 0 ? 'up' : 'down'}</span>
        <button class="icon-btn" data-nudge="down" aria-label="Move down">${arrow(90)}</button>
      </div>
      ${moved ? '<button class="linkish" data-nudge="reset">Put them back where they were</button>' : ''}
    </div>`;
}

const arrow = deg => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" style="transform:rotate(${deg}deg)"><path d="M5 12h13M13 6.5l5.5 5.5-5.5 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function nudgeBy(s, dir) {
  const n = nudgeFor(s), step = nudgeStep(s);
  if (dir === 'reset') { n.x = 0; n.y = 0; }
  if (dir === 'left') n.x -= step;
  if (dir === 'right') n.x += step;
  if (dir === 'up') n.y -= step;
  if (dir === 'down') n.y += step;
  const lim = s.unit === 'mm' ? 10 : 0.4;
  n.x = Math.max(-lim, Math.min(lim, Math.round(n.x * 1000) / 1000));
  n.y = Math.max(-lim, Math.min(lim, Math.round(n.y * 1000) / 1000));
  store.prefs.nudge = { ...store.prefs.nudge, [s.id]: n };
  store.savePrefs();
}

// ---------- Door signs ----------

function signs() {
  const list = store.list;
  const rooms = M.rooms(list, 'to');
  const counts = new Map(rooms.map(r => [r.id, M.live(list).filter(b => b.to === r.id).length]));
  if (!signRooms) {
    signRooms = new Set(rooms.filter(r => counts.get(r.id)).map(r => r.id));
    if (!signRooms.size) rooms.forEach(r => signRooms.add(r.id));
  }
  const chosenRooms = rooms.filter(r => signRooms.has(r.id));
  $('#controls').innerHTML = `
    <section class="card">
      <h2>Rooms at the new place</h2>
      <p class="hint">One sign for each door, in the room’s colour and shape, so whoever’s carrying a box can match it without asking.</p>
      <ul class="picklist rooms">${rooms.map(r => `<li><label><input type="checkbox" data-room="${r.id}"${signRooms.has(r.id) ? ' checked' : ''}>${dot(r, 'big')}<span>${esc(r.name)}<small>${plural(counts.get(r.id), 'box', 'boxes')}</small></span></label></li>`).join('')}</ul>
      <p class="hint"><a href="#/rooms">Change the rooms, their colours or their shapes</a></p>
    </section>
    <section class="card">
      <h2>Paper</h2>
      <div class="seg" role="group" aria-label="Paper">
        <button data-paper="letter" aria-pressed="${paper() === 'letter'}">Letter</button>
        <button data-paper="a4" aria-pressed="${paper() === 'a4'}">A4</button>
      </div>
    </section>
    <section class="card print-go">
      ${chosenRooms.length ? `<button class="btn primary wide" data-act="print"${framed() ? ' disabled' : ''}>${icon('print')} Print ${plural(chosenRooms.length, 'sign')}</button>` : '<p class="hint">Tick the rooms to print signs for.</p>'}
      <p class="hint">Sideways, one to a page. Turn background graphics on.</p>
    </section>`;
  $('#preview').innerHTML = chosenRooms.map(r => signPage(r, counts.get(r.id), { paper: paper() })).join('');
  fitPreview();
  on({
    change(e) {
      const id = e.target.dataset.room;
      if (!id) return;
      if (e.target.checked) signRooms.add(id); else signRooms.delete(id);
      signs();
    },
    click(e) {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.paper) { store.prefs.paper = t.dataset.paper; store.savePrefs(); signs(); }
      if (t.dataset.act === 'print') { preparePrint(); window.print(); }
    },
  });
}

// ---------- Test sheet ----------

function test() {
  let s = sheetOf(store.prefs.sheet);
  if (s.cut) s = SHEETS[0]; // plain paper needs no lining up
  const nudge = nudgeFor(s);
  $('#controls').innerHTML = `
    <section class="card">
      <h2>Line up your labels</h2>
      <p>Print this on plain paper. Hold it behind a sheet of labels, up against a window, and check the outlines sit on the labels. If they don’t, nudge them and print it again.</p>
      <p>Then measure the two lines in label 1. If they aren’t 3 inches and 7 cm, the printer is shrinking the page: set the scale to 100% (“Actual size”).</p>
      <select class="input" id="sheetPick" aria-label="Label sheet">
        ${SHEETS.filter(x => !x.cut).map(x => `<option value="${x.id}"${x.id === s.id ? ' selected' : ''}>${esc(x.name)}, ${esc(x.about)}</option>`).join('')}
      </select>
    </section>
    <section class="card print-go">
      <button class="btn primary wide" data-act="print"${framed() ? ' disabled' : ''}>${icon('print')} Print the test sheet</button>
      ${nudger(s, nudge)}
    </section>`;
  $('#preview').innerHTML = testPage(s, { nudge });
  fitPreview();
  on({
    change(e) { if (e.target.id === 'sheetPick') { store.prefs.sheet = e.target.value; store.savePrefs(); test(); } },
    click(e) {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.nudge) { nudgeBy(s, t.dataset.nudge); test(); }
      if (t.dataset.act === 'print') { preparePrint(); window.print(); }
    },
  });
}

// ---------- The pages themselves ----------

function fitPreview() {
  const p = $('#preview');
  if (p && !p.querySelector('.page')) p.innerHTML = '<p class="hint center kraft">Nothing to print yet.</p>';
}

// Fills the print-only copy of the pages and sets the paper size. Runs before every print, including the
// browser's own Print menu; on any other screen it leaves the page to print as it looks.
export function preparePrint() {
  const root = document.getElementById('print-root');
  const style = document.getElementById('page-size');
  const onPrint = /^#\/print/.test(location.hash) && !!store.list;
  document.body.classList.toggle('printing', onPrint);
  if (!onPrint) { root.innerHTML = ''; style.textContent = ''; return; }
  const list = store.list;
  if (kind === 'signs') {
    const rooms = M.rooms(list, 'to').filter(r => signRooms?.has(r.id));
    const counts = r => M.live(list).filter(b => b.to === r.id).length;
    root.innerHTML = rooms.map(r => signPage(r, counts(r), { paper: paper() })).join('');
    style.textContent = `@page { size: ${paper() === 'a4' ? '297mm 210mm' : '11in 8.5in'}; margin: 0; }`;
    return;
  }
  let s = sheetOf(store.prefs.sheet);
  if (kind === 'test' && s.cut) s = SHEETS[0];
  const nudge = nudgeFor(s);
  root.innerHTML = kind === 'test'
    ? testPage(s, { nudge })
    : labelPages(chosen(list).map(b => fromBox(b, list)), s, { start: startFor(s), nudge });
  style.textContent = `@page { size: ${s.unit === 'mm' ? `${s.page[0]}mm ${s.page[1]}mm` : `${s.page[0]}in ${s.page[1]}in`}; margin: 0; }`;
}

window.addEventListener('afterprint', () => document.body.classList.remove('printing'));
