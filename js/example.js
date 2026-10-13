// An example move to look around: a two-bedroom flat going across the country, packed but not moved yet.
import * as M from './model.js';
import { labelSig } from './payload.js';

const BOXES = [
  // [from, to, things, flags]
  ['Kitchen', 'Kitchen', ['Kettle', 'Mugs', 'Coffee', 'French press', 'Tea', 'Dish soap', 'Sponges'], 'fo'],
  ['Kitchen', 'Kitchen', ['Plates', 'Bowls', 'Side plates'], 'fh'],
  ['Kitchen', 'Kitchen', ['Pots and pans', 'Lids', 'Colander', 'Baking trays'], 'h'],
  ['Kitchen', 'Kitchen', ['Wine glasses', 'Tumblers', 'Pint glasses'], 'f'],
  ['Kitchen', 'Kitchen', ['Knives', 'Cutting boards', 'Wooden spoons', 'Can opener', 'Cutlery tray'], ''],
  ['Kitchen', 'Kitchen', ['Spices', 'Olive oil', 'Vinegar', 'Hot sauce collection'], ''],
  ['Kitchen', 'Kitchen', ['Toaster', 'Blender', 'Rice cooker'], ''],
  ['Bedroom', 'Bedroom', ['Sheets', 'Pillows', 'Duvet', 'Bath towels'], 'o'],
  ['Bedroom', 'Bedroom', ['Winter coats', 'Sweaters', 'Scarves and hats'], ''],
  ['Bedroom', 'Bedroom', ['Shoes', 'Boots', 'Belts'], ''],
  ['Bedroom', 'Bedroom', ['Bedside lamps', 'Alarm clock', 'Jewellery box'], 'f'],
  ['Living room', 'Living room', ['Books: cookbooks', 'Books: A to M'], 'h'],
  ['Living room', 'Living room', ['Books: N to Z', 'Atlases'], 'h'],
  ['Living room', 'Living room', ['Board games', 'Jigsaw puzzles', 'Playing cards'], ''],
  ['Living room', 'Living room', ['Records', 'Turntable', 'Speaker cables'], 'f'],
  ['Living room', 'Living room', ['Picture frames', 'Mirror', 'Candles'], 'f'],
  ['Living room', 'Office', ['LEGO sets: Bonsai Tree, Tree House', 'Instruction books'], 'f'],
  ['Office', 'Office', ['Passports', 'Birth certificates', 'Lease and moving papers', 'Laptop chargers'], 'c'],
  ['Office', 'Office', ['Monitor', 'Keyboard', 'Mouse', 'Cables'], 'f'],
  ['Office', 'Guest room', ['Printer', 'Paper', 'Envelopes'], ''],
  ['Bathroom', 'Bathroom', ['Toilet paper', 'Soap', 'Toothbrushes', 'Shower curtain', 'Hand towels'], 'o'],
  ['Bathroom', 'Bathroom', ['Medicines', 'First aid kit', 'Glasses and contacts'], 'c'],
  ['Garage', 'Garage', ['Drill', 'Screwdrivers', 'Hex keys', 'Tape measure', 'Box cutter'], 'oh'],
  ['Garage', 'Garage', ['Tent', 'Sleeping bags', 'Camping stove'], ''],
  ['Garage', 'Garage', ['Holiday decorations', 'String lights'], 'f'],
  ['Kitchen', 'Kitchen', ['Dog bowls', 'Dog food', 'Lead', 'Poo bags', 'Dog bed'], 'oc'],
];

const PIECES = [
  ['Living room', 'Living room', ['Sofa', 'Feet in Box 23, with the tools']],
  ['Living room', 'Living room', ['Coffee table']],
  ['Living room', 'Office', ['Bookcase (Billy)', 'Shelf pins in Box 23']],
  ['Bedroom', 'Bedroom', ['Bed frame', 'Bolts taped under the slats'], 'h'],
  ['Garage', 'Garage', ['Bike']],
];

export function example(now = Date.now()) {
  const list = M.newList(now);
  list.name = 'Boston to Oakland';
  list.example = true;
  // The new place has a guest room the old one didn't.
  M.addRoom(list, 'to', 'Guest room', now);
  const id = (side, name) => M.rooms(list, side).find(r => r.name === name)?.id || '';
  const day = 86400000;
  let t = now - 12 * day;
  const add = (kind, [from, to, items, flags = '']) => {
    t += 3 * 3600000;
    const box = M.newBox(list, {
      kind, items, from: id('from', from), to: id('to', to),
      fragile: flags.includes('f'), heavy: flags.includes('h'), first: flags.includes('o'), car: flags.includes('c'),
    }, t);
    M.putBox(list, box, t);
  };
  BOXES.forEach(b => add('box', b));
  PIECES.forEach(p => add('piece', p));
  // The first sheets of labels are printed already.
  for (const box of M.live(list).filter(b => b.n <= 18)) {
    box.printed = now - 2 * day;
    box.printedSig = labelSig(box, list);
  }
  return list;
}
