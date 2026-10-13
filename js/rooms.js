// Rooms at both ends of the move, and the colour and shape each room at the new place wears.
// No page code here, so the tests run it in Node.
//
// The colours are Okabe and Ito's set, picked so that people with colour-blindness can tell them apart.
// Each room also gets a shape, so a box still matches its door on a black-and-white printer, or for
// anyone who can't tell two of the colours apart.

export const COLOURS = [
  { name: 'Orange', hex: '#e69f00', ink: '#1f1500' },
  { name: 'Sky', hex: '#56b4e9', ink: '#031c29' },
  { name: 'Green', hex: '#009e73', ink: '#ffffff' },
  { name: 'Yellow', hex: '#f0e442', ink: '#262200' },
  { name: 'Blue', hex: '#0072b2', ink: '#ffffff' },
  { name: 'Vermilion', hex: '#d55e00', ink: '#ffffff' },
  { name: 'Pink', hex: '#cc79a7', ink: '#26091a' },
  { name: 'Grey', hex: '#8c8c8c', ink: '#111111' },
];

// Drawn in a 24 x 24 box, filled.
export const SHAPES = [
  { name: 'circle', d: 'M12 2.6a9.4 9.4 0 1 0 0 18.8a9.4 9.4 0 1 0 0-18.8z' },
  { name: 'triangle', d: 'M12 2.2L22.4 20.6H1.6z' },
  { name: 'square', d: 'M3.4 3.4h17.2v17.2H3.4z' },
  { name: 'diamond', d: 'M12 1.4L22.6 12L12 22.6L1.4 12z' },
  { name: 'star', d: 'M12 1.6l3.1 6.6l7.2.9l-5.3 5l1.4 7.1L12 17.7l-6.4 3.5L7 14.1l-5.3-5l7.2-.9z' },
  { name: 'hexagon', d: 'M12 1.8l9 5.1v10.2l-9 5.1l-9-5.1V6.9z' },
  { name: 'cross', d: 'M8.6 2.4h6.8v6.2h6.2v6.8h-6.2v6.2H8.6v-6.2H2.4V8.6h6.2z' },
  { name: 'heart', d: 'M12 21.4C5.4 16.4 1.8 12.9 1.8 8.4C1.8 5.3 4.2 3 7.1 3c2.1 0 3.8 1.1 4.9 2.8C13.1 4.1 14.8 3 16.9 3c2.9 0 5.3 2.3 5.3 5.4c0 4.5-3.6 8-10.2 13z' },
];

// Names to pick from, in roughly the order people pack.
export const PRESETS = [
  'Kitchen', 'Living room', 'Dining room', 'Bedroom', 'Primary bedroom', 'Kids’ room', 'Nursery', 'Guest room',
  'Office', 'Bathroom', 'Laundry', 'Hall closet', 'Garage', 'Workshop', 'Basement', 'Attic', 'Storage', 'Patio', 'Shed',
];

export const DEFAULT_FROM = ['Kitchen', 'Living room', 'Bedroom', 'Office', 'Bathroom', 'Garage'];
export const DEFAULT_TO = ['Kitchen', 'Living room', 'Bedroom', 'Office', 'Bathroom', 'Garage'];

export const shapeSVG = (shape, { cls = 'shape', fill = 'currentColor', title = '' } = {}) => {
  const s = SHAPES[shape] || SHAPES[0];
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="${title ? 'false' : 'true'}"${title ? ` role="img" aria-label="${title}"` : ''}><path d="${s.d}" fill="${fill}"/></svg>`;
};

const clampIndex = (v, n) => (Number.isInteger(v) && v >= 0 && v < n ? v : null);

// The colour and shape for a new room: the colour used least so far, and a shape that colour hasn't worn yet,
// so the first eight rooms each get their own colour and their own shape.
export function nextStyle(rooms) {
  const used = rooms.filter(r => r.side === 'to' && !r.gone);
  const count = (key, v) => used.filter(r => r[key] === v).length;
  const colourUse = COLOURS.map((_, c) => count('color', c));
  const color = colourUse.indexOf(Math.min(...colourUse));
  const taken = new Set(used.filter(r => r.color === color).map(r => r.shape));
  const free = SHAPES.map((_, s) => s).filter(s => !taken.has(s));
  if (!free.length) return { color, shape: 0 };
  // The first round pairs colour 0 with shape 0, 1 with 1 and so on; after that, the least-worn shape.
  const shape = free.includes(color) && count('shape', color) === 0 ? color
    : free.sort((a, b) => count('shape', a) - count('shape', b) || (a - color + 8) % 8 - (b - color + 8) % 8)[0];
  return { color, shape };
}

export function styleOf(room) {
  const c = COLOURS[clampIndex(room?.color, COLOURS.length) ?? 7];
  return { ...c, shape: clampIndex(room?.shape, SHAPES.length) ?? 0, colour: clampIndex(room?.color, COLOURS.length) ?? 7 };
}
