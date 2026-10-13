// The parts that don't need a page: the list, finding things, merging two phones, links and label sheets.
//   node --test test/unit.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/model.js';
import { nextStyle, COLOURS, SHAPES } from '../js/rooms.js';
import { boxFragment, boxLink, readBoxFragment, readNumber, enc, dec, QR_BYTES, SITE, pack, unpack, listLink, readList, base } from '../js/payload.js';
import { SHEETS, slots, pages, perSheet, fmt } from '../js/sheets.js';
import { layout, label } from '../js/labels.js';

const T0 = 1_760_000_000_000;

function sample() {
  const list = M.newList(T0);
  list.id = 'k3f9';
  const r = side => name => M.rooms(list, side).find(x => x.name === name).id;
  const from = r('from'), to = r('to');
  const add = (fields) => M.putBox(list, M.newBox(list, fields, T0), T0);
  add({ from: from('Kitchen'), to: to('Kitchen'), items: ['Kettle', 'Mugs', 'Coffee maker', 'French press'], first: true, fragile: true });
  add({ from: from('Living room'), to: to('Living room'), items: ['Books: cookbooks', 'Board games'], heavy: true });
  add({ from: from('Bedroom'), to: to('Bedroom'), items: ['Sheets', 'Pillows', 'Duvet'], first: true });
  add({ kind: 'piece', from: from('Living room'), to: to('Living room'), items: ['Sofa'] });
  add({ from: from('Office'), to: to('Office'), items: ['Passports', 'Laptop chargers'], car: true });
  return list;
}

test('a new list has rooms at both ends, and numbers go up from 1', () => {
  const list = M.newList(T0);
  assert.ok(M.rooms(list, 'from').length >= 5);
  assert.ok(M.rooms(list, 'to').length >= 5);
  assert.equal(M.nextNumber(list), 1);
  const b = M.putBox(list, M.newBox(list, {}, T0), T0);
  assert.equal(b.n, 1);
  assert.equal(M.nextNumber(list), 2);
  M.putBox(list, M.newBox(list, { n: 40 }, T0), T0);
  assert.equal(M.nextNumber(list), 41, 'the next number follows the highest');
});

test('rooms at the new place each get their own colour and shape for the first eight', () => {
  const list = { rooms: [] };
  const seen = [];
  for (let i = 0; i < 8; i++) {
    const s = nextStyle(list.rooms);
    list.rooms.push({ side: 'to', ...s });
    seen.push(s);
  }
  assert.equal(new Set(seen.map(s => s.color)).size, 8);
  assert.equal(new Set(seen.map(s => s.shape)).size, 8);
  for (let i = 0; i < 12; i++) list.rooms.push({ side: 'to', ...nextStyle(list.rooms) });
  const pairs = list.rooms.map(r => `${r.color}/${r.shape}`);
  assert.equal(new Set(pairs).size, pairs.length, 'no two rooms look alike, up to twenty');
  assert.ok(list.rooms.every(r => r.color < COLOURS.length && r.shape < SHAPES.length));
});

test('cleaning what arrives keeps good boxes and drops nonsense', () => {
  const list = M.cleanList({
    id: 'abcd', name: 'x'.repeat(200),
    rooms: [{ id: 'r1', side: 'to', name: 'Kitchen', color: 3, shape: 9 }, { id: 'r1', side: 'to', name: 'dupe' }, 'junk'],
    boxes: [
      { uid: 'b1', n: '12', items: 'kettle\n\n  mugs  \n', fragile: 'yes', first: true },
      { uid: 'b1', n: 13 },
      { uid: '<script>', n: -4, kind: 'sofa', items: [{}, 'ok'] },
      null,
    ],
  });
  assert.equal(list.name.length, 60);
  assert.equal(list.rooms.length, 1);
  assert.equal(list.rooms[0].shape, 0, 'an unknown shape falls back');
  assert.equal(list.boxes.length, 2, 'a repeated id is dropped');
  assert.deepEqual(list.boxes[0].items, ['kettle', 'mugs']);
  assert.equal(list.boxes[0].n, 12);
  assert.equal(list.boxes[0].fragile, false, 'only true is true');
  assert.equal(list.boxes[0].first, true);
  assert.notEqual(list.boxes[1].uid, '<script>');
  assert.equal(list.boxes[1].n, 0);
  assert.equal(list.boxes[1].kind, 'box');
  assert.equal(M.cleanList({ boxes: 'nope' }), null);
  assert.equal(M.cleanList(null), null);
});

test('an emoji at the end of a long line is not cut in half', () => {
  const box = M.cleanBox({ items: ['a'.repeat(M.MAX_LINE - 1) + '🫖🫖'] });
  assert.equal(Array.from(box.items[0]).length, M.MAX_LINE);
  assert.ok(!/[\uD800-\uDBFF]$/.test(box.items[0]));
});

test('search finds the kettle, plurals and numbers', () => {
  const list = sample();
  const hit = M.search(list, 'kettle');
  assert.equal(hit.length, 1);
  assert.equal(hit[0].box.n, 1);
  assert.deepEqual(hit[0].lines, [0]);
  assert.equal(M.search(list, 'KETTLE')[0].box.n, 1, 'any case');
  assert.equal(M.search(list, 'mug')[0].box.n, 1, 'part of a word');
  assert.equal(M.search(list, 'pillow')[0].box.n, 3);
  assert.equal(M.search(list, 'pillows')[0].box.n, 3);
  assert.equal(M.search(list, 'chargers laptop')[0].box.n, 5, 'words in any order');
  assert.equal(M.search(list, 'box 4')[0].box.kind, 'piece', 'box 4 goes to number 4');
  assert.equal(M.search(list, '#2')[0].box.n, 2);
  assert.equal(M.search(list, 'sofa')[0].box.n, 4);
  assert.deepEqual(M.search(list, 'kitchen').map(r => r.box.n), [1], 'a room finds what is going there');
  assert.deepEqual(M.search(list, 'fragile').map(r => r.box.n), [1]);
  // "glass" finds the glasses, not every box that's marked Fragile.
  M.putBox(list, M.newBox(list, { items: ['Wine glasses', 'Tumblers'], fragile: true }, T0), T0);
  assert.deepEqual(M.search(list, 'glass').map(r => r.box.n), [6]);
  assert.deepEqual(M.search(list, 'fragile').map(r => r.box.n).sort(), [1, 6]);
  assert.deepEqual(M.search(list, 'open first').map(r => r.box.n).sort(), [1, 3]);
  assert.deepEqual(M.search(list, 'piano'), []);
  assert.deepEqual(M.search(list, '   '), []);
});

test('missing boxes are grouped by the room to look in', () => {
  const list = sample();
  const [b1, b2] = M.live(list);
  M.setStage(b1, 'load', true, T0 + 1);
  const miss = M.missing(list, 'load');
  const names = miss.map(g => g.room?.name);
  assert.ok(!names.includes('Kitchen'), 'the kitchen box is on');
  assert.ok(names.includes('Living room'));
  assert.equal(miss.flatMap(g => g.boxes).length, 4);
  M.setStage(b2, 'unload', true, T0 + 2);
  const prog = M.progress(list, 'unload');
  assert.deepEqual(prog.find(p => p.room.name === 'Living room'), { room: prog.find(p => p.room.name === 'Living room').room, total: 2, done: 1 });
  M.setStage(b1, 'load', false, T0 + 3);
  assert.equal(b1.loaded, 0);
  assert.equal(b1.loadedAt, T0 + 3);
});

test('merging two phones: box by box, ticks separately, removals stick', () => {
  const a = sample();
  const b = M.cleanList(JSON.parse(JSON.stringify(a)));
  const [a1, a2, a3] = M.live(a);
  const [b1, b2, , b4] = M.live(b);
  // A changes box 1's contents later; B ticks box 1 onto the truck.
  a1.items = ['Kettle', 'Mugs', 'Tea'];
  M.putBox(a, a1, T0 + 10);
  M.setStage(b1, 'load', true, T0 + 20);
  // B changes box 2 later than A does.
  M.putBox(a, a2, T0 + 5);
  b2.items = ['Books'];
  M.putBox(b, b2, T0 + 30);
  // A removes box 3; B removes the sofa, then A changes the sofa after that.
  M.removeBox(a, a3.uid, T0 + 40);
  M.removeBox(b, b4.uid, T0 + 41);
  M.putBox(a, M.byUid(a, b4.uid), T0 + 50);
  // B adds a box.
  const extra = M.putBox(b, M.newBox(b, { items: ['Plants'] }, T0 + 60), T0 + 60);

  const { list, summary } = M.merge(a, b);
  const get = u => M.byUid(list, u);
  assert.deepEqual(get(a1.uid).items, ['Kettle', 'Mugs', 'Tea'], 'A’s later edit wins');
  assert.ok(get(a1.uid).loaded, 'B’s tick comes across too');
  assert.deepEqual(get(a2.uid).items, ['Books'], 'B’s later edit wins');
  assert.ok(get(a3.uid).gone, 'removed on A stays removed');
  assert.equal(get(b4.uid).gone, 0, 'changed after it was removed: it stays');
  assert.ok(get(extra.uid), 'the new box arrives');
  assert.equal(summary.added, 1);
  // And the other way round gives the same boxes.
  const back = M.merge(b, a).list;
  for (const box of list.boxes) {
    const other = M.byUid(back, box.uid);
    assert.deepEqual({ ...other }, { ...box }, `box ${box.n} merges the same both ways`);
  }
});

test('merging matches rooms by name and flags two boxes with one number', () => {
  const a = sample();
  const b = M.newList(T0);
  b.id = 'zz99';
  const kitchenB = M.rooms(b, 'to').find(r => r.name === 'Kitchen');
  M.putBox(b, M.newBox(b, { n: 2, to: kitchenB.id, items: ['Pans'] }, T0 + 5), T0 + 5);
  const { list, clashes } = M.merge(a, b);
  const pans = M.live(list).find(x => x.items[0] === 'Pans');
  assert.equal(M.room(list, pans.to).name, 'Kitchen');
  assert.equal(pans.to, M.rooms(a, 'to').find(r => r.name === 'Kitchen').id, 'their Kitchen is our Kitchen');
  assert.equal(M.rooms(list, 'to').filter(r => r.name === 'Kitchen').length, 1);
  assert.equal(clashes.length, 1);
  assert.equal(clashes[0][0].n, 2);
  assert.ok(list.also.includes('zz99'), 'labels from the other list open here too');
  assert.ok(M.sameMove(list, 'zz99') && M.sameMove(list, 'k3f9') && !M.sameMove(list, 'qqqq'));
});

test('a box link carries the box and reads back', () => {
  const list = sample();
  const box = M.live(list)[0];
  const frag = boxFragment(box, list);
  assert.match(frag, /^b\/k3f9\/1\/fo\/\d\d\/Kitchen\/Kitchen\/\/Kettle~Mugs~Coffee\+maker~French\+press$/);
  const back = readBoxFragment('#' + frag);
  assert.equal(back.n, 1);
  assert.equal(back.move, 'k3f9');
  assert.equal(back.to, 'Kitchen');
  assert.equal(back.fragile, true);
  assert.equal(back.first, true);
  assert.equal(back.heavy, false);
  assert.deepEqual(back.items, ['Kettle', 'Mugs', 'Coffee maker', 'French press']);
  assert.equal(back.more, 0);
  const to = M.room(list, box.to);
  assert.equal(back.color, to.color);
  assert.equal(back.shape, to.shape);
  const piece = readBoxFragment(boxFragment(M.live(list)[3], list));
  assert.equal(piece.kind, 'piece');
  assert.deepEqual(piece.items, ['Sofa']);
  assert.equal(readBoxFragment('#b/nope'), null);
  assert.equal(readBoxFragment('#/box/abc'), null);
});

test('awkward characters survive the trip', () => {
  const list = sample();
  const box = M.live(list)[1];
  box.items = ['50% off ~ sale', 'a/b/c', 'Tom & Jerry + friends', 'Crème brûlée dish', 'Mark’s “good” knives', 'Teapot 🫖', '#hash ?q=1'];
  const back = readBoxFragment(boxFragment(box, list, 400));
  assert.deepEqual(back.items, ['50% off ~ sale', 'a/b/c', 'Tom & Jerry + friends', 'Crème brûlée dish', 'Mark\'s "good" knives', 'Teapot 🫖', '#hash ?q=1']);
  assert.equal(dec(enc('a b+c~d/e')), 'a b+c~d/e');
  assert.equal(dec('%E0%A4%A'), '', 'broken escapes read as nothing');
});

test('a label’s link stays small enough to scan at 1½ inches', () => {
  const list = sample();
  const box = M.live(list)[0];
  box.items = Array.from({ length: 30 }, (_, i) => `Thing number ${i + 1} with a longish name`);
  const link = boxLink(box, list, SITE);
  assert.ok(link.length <= QR_BYTES, `${link.length} characters`);
  const back = readBoxFragment(link.split('#')[1]);
  assert.ok(back.items.length >= 2, 'it still carries the first few things');
  assert.ok(back.more > 0);
  assert.equal(back.items.length + back.more, 30, 'and says how many more there are');
  const text = back.items.join(', ');
  assert.ok(text.length >= 100, `about the first 120 characters (${text.length})`);
  // A long first line is cut at a word, with ...
  box.items = ['A very long description of the contents ' + 'and more words '.repeat(20)];
  const one = readBoxFragment(boxLink(box, list, SITE).split('#')[1]);
  assert.match(one.items[0], /^A very long description.*\.\.\.$/);
  assert.ok(boxLink(box, list, SITE).length <= QR_BYTES);
  // Rooms in another alphabet don't crowd the things out.
  M.room(list, box.to).name = 'Кухня и столовая и кладовая';
  box.items = ['Kettle', 'Mugs'];
  const ru = boxLink(box, list, SITE);
  assert.ok(ru.length <= QR_BYTES);
  assert.deepEqual(readBoxFragment(ru.split('#')[1]).items, ['Kettle', 'Mugs']);
});

test('Tag Along number links', () => {
  assert.equal(readNumber('#box/012'), 12);
  assert.equal(readNumber('box/7'), 7);
  assert.equal(readNumber('#box/'), null);
  assert.equal(readNumber('#box/12a'), null);
  assert.equal(readNumber('#b/k3f9/12'), null);
});

test('links point at this page locally and at the real site from anywhere else', () => {
  assert.equal(base({ protocol: 'http:', hostname: 'localhost', origin: 'http://localhost:9520', pathname: '/' }), 'http://localhost:9520/');
  assert.equal(base({ protocol: 'https:', hostname: 'junkdrawer.works', origin: 'https://junkdrawer.works', pathname: '/this-side-up/' }), SITE);
  assert.equal(base({ protocol: 'https:', hostname: 'claude.ai', origin: 'https://claude.ai', pathname: '/x' }), SITE);
  assert.equal(base({ protocol: 'file:', hostname: '', origin: 'null', pathname: '/x' }), SITE);
});

test('the whole list packs into a link and back', async () => {
  const list = sample();
  list.example = true;
  const data = await pack(list);
  assert.match(data, /^z/);
  assert.equal((await unpack(data)).boxes.length, 5);
  const link = await listLink(list, SITE);
  assert.ok(link.startsWith(SITE + '#l/z'));
  const back = await readList(link.split('#l/')[1]);
  assert.equal(back.boxes.length, 5);
  assert.equal(back.example, undefined, 'the example flag stays behind');
  await assert.rejects(readList('xnope'), /isn’t a This Side Up link/);
});

test('label sheets fit on their paper', () => {
  for (const s of SHEETS) {
    const all = slots(s);
    assert.equal(all.length, perSheet(s));
    for (const p of all) {
      assert.ok(p.x >= 0 && p.y >= 0, `${s.id} starts on the page`);
      assert.ok(p.x + p.w <= s.page[0] + 1e-9, `${s.id} fits across`);
      assert.ok(p.y + p.h <= s.page[1] + 1e-9, `${s.id} fits down`);
    }
    // Labels don't overlap.
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j];
      const apart = a.x + a.w <= b.x + 1e-9 || b.x + b.w <= a.x + 1e-9 || a.y + a.h <= b.y + 1e-9 || b.y + b.h <= a.y + 1e-9;
      assert.ok(apart, `${s.id} labels ${i} and ${j} overlap`);
    }
  }
  const s5164 = SHEETS.find(s => s.id === '5164');
  const last = slots(s5164)[5];
  assert.ok(Math.abs(last.x + last.w - (8.5 - 0.15625)) < 1e-9, '5164: the same margin on the right as the left');
  assert.ok(Math.abs(last.y + last.h - (11 - 0.5)) < 1e-9, '5164: half an inch at the bottom');
});

test('every label makes room: flags on one row where they fit, the list gets the lines that are left', () => {
  const kitchen = { name: 'Kitchen', hex: '#e69f00', ink: '#1f1500', shape: 0 };
  const six = ['Kettle', 'Mugs', 'Coffee', 'French press', 'Tea towels', 'The good knives'];
  const box = f => ({ n: 12, kind: 'box', items: six, more: 0, to: kitchen, from: 'Kitchen', fragile: false, heavy: false, first: false, car: false, ...f });
  for (const s of SHEETS) {
    const inch = v => (s.unit === 'mm' ? v / 25.4 : v);
    const size = { w: inch(s.label[0]), h: inch(s.label[1]), edge: !!s.edge };
    // Mark's Box 1: Fragile and Open first, six things.
    const one = layout(box({ fragile: true, first: true }), size);
    assert.equal(one.rows, 1, `${s.id}: two flags, one row`);
    assert.ok(one.lines >= 1, `${s.id}: and room to say what's inside (${one.lines} lines)`);
    // Three flags and the room it's leaving still keep to one row of flags.
    const three = layout(box({ fragile: true, first: true, car: true, from: 'Living room' }), size);
    assert.equal(three.rows, 1, `${s.id}: three flags, one row`);
    // Nothing listed past what fits: a label's list is never taller than its lines.
    const html = label(box({ fragile: true, first: true, car: true, heavy: true, from: 'Primary bedroom' }), size);
    assert.match(html, /--lines:\d+;/);
  }
  // A half sheet never puts a second row of flags where the number and the code need the room.
  const half = SHEETS.find(s => s.id === '5126');
  assert.equal(layout(box({ fragile: true, first: true, heavy: true, car: true, from: 'Primary bedroom' }), { w: half.label[0], h: half.label[1], edge: true }).rows, 1);
});

test('a long first thing is cut at a word, so the label can still say how many more', () => {
  const d = { n: 3, kind: 'box', items: ['LEGO sets: Bonsai Tree, Tree House, the big castle and the instructions for all of them', 'Mugs'], more: 0, to: null, from: '', first: true };
  const html = label(d, { w: 3.5, h: 5 });
  assert.match(html, /LEGO sets: Bonsai Tree, Tree House[^<]*…/);
  assert.match(html, /\+ 1 more/);
});

test('pages start at a label part-way down a used sheet', () => {
  const s = SHEETS.find(x => x.id === '5164');
  const p = pages(s, 7, 4);
  assert.equal(p.length, 2);
  assert.deepEqual(p[0].map(x => x.i), [null, null, null, null, 0, 1]);
  assert.deepEqual(p[1].map(x => x.i), [2, 3, 4, 5, 6, null]);
  assert.equal(pages(s, 0, 0).length, 1, 'an empty sheet still shows');
  assert.deepEqual(pages(s, 2, 99)[0].map(x => x.i), [null, null, null, null, null, 0], 'start is kept on the sheet');
});

test('nudges read as fractions of an inch', () => {
  assert.equal(fmt(0, 'in'), '0 in');
  assert.equal(fmt(1 / 32, 'in'), '1/32 in');
  assert.equal(fmt(-3 / 32, 'in'), '−3/32 in');
  assert.equal(fmt(0.25, 'in'), '1/4 in');
  assert.equal(fmt(1.5, 'in'), '1 1/2 in');
  assert.equal(fmt(1.5, 'mm'), '1.5 mm');
});

test('the offline copy has every file the page uses, and nothing that isn’t there', async () => {
  const { readFile, readdir, stat } = await import('node:fs/promises');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const sw = await readFile(join(root, 'sw.js'), 'utf8');
  const shell = JSON.parse(sw.match(/const SHELL = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']').replace(/\/\/.*$/gm, ''));
  const walk = async dir => (await Promise.all((await readdir(join(root, dir))).map(async f => {
    const p = dir ? `${dir}/${f}` : f;
    return (await stat(join(root, p))).isDirectory() ? walk(p) : [p];
  }))).flat();
  const files = [...await walk('js'), ...await walk('css'), ...await walk('fonts')];
  for (const f of files) assert.ok(shell.includes(f), `sw.js should cache ${f}`);
  for (const f of shell.filter(f => f !== './')) await stat(join(root, f)); // throws if it's missing
});
