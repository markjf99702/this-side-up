// Label sheets: where each label sits on the page, in the sheet's own unit (inches or millimetres).
// The Avery measurements match their templates (and gLabels' copies of them). Plain paper has cut lines
// and keeps everything a quarter inch in from the edge, where printers can't reach.
// No page code here, so the tests run it in Node.

export const SHEETS = [
  {
    id: '5164', name: 'Avery 5164 / 8164', about: '3⅓ × 4 in, 6 to a sheet', also: '5264, 5524, 6464, 8254, 8464',
    unit: 'in', page: [8.5, 11], label: [4, 10 / 3], cols: 2, rows: 3, x0: 0.15625, y0: 0.5, dx: 4.1875, dy: 10 / 3, round: 0.125,
  },
  {
    id: '5168', name: 'Avery 5168', about: '3½ × 5 in, 4 to a sheet', also: '',
    unit: 'in', page: [8.5, 11], label: [3.5, 5], cols: 2, rows: 2, x0: 0.5, y0: 0.5, dx: 4, dy: 5, round: 0.0625,
  },
  {
    id: '5126', name: 'Avery 5126', about: '5½ × 8½ in, 2 to a sheet', also: '5526, 8126, 15516, 18126',
    unit: 'in', page: [8.5, 11], label: [8.5, 5.5], cols: 1, rows: 2, x0: 0, y0: 0, dx: 8.5, dy: 5.5, round: 0, edge: true,
  },
  {
    id: 'letter', name: 'Plain paper, Letter', about: '4 to a page, with cut lines',
    unit: 'in', page: [8.5, 11], label: [4, 5.25], cols: 2, rows: 2, x0: 0.25, y0: 0.25, dx: 4, dy: 5.25, round: 0, cut: true,
  },
  {
    id: 'a4', name: 'Plain paper, A4', about: '4 to a page, with cut lines',
    unit: 'mm', page: [210, 297], label: [99, 142.5], cols: 2, rows: 2, x0: 6, y0: 6, dx: 99, dy: 142.5, round: 0, cut: true,
  },
];

export const sheet = id => SHEETS.find(s => s.id === id) || SHEETS[0];
export const perSheet = s => s.cols * s.rows;

// Every label's spot on a page, left to right, then down.
export function slots(s) {
  const out = [];
  for (let r = 0; r < s.rows; r++) {
    for (let c = 0; c < s.cols; c++) out.push({ x: s.x0 + c * s.dx, y: s.y0 + r * s.dy, w: s.label[0], h: s.label[1] });
  }
  return out;
}

// Pages for `count` labels, starting at spot `start` on the first page (the labels before it are
// already used). Each page is a list of { slot, i } where i is the label's place in the run, or null.
export function pages(s, count, start = 0) {
  const per = perSheet(s);
  start = Math.max(0, Math.min(per - 1, Math.floor(start) || 0));
  const out = [];
  let i = 0, at = start;
  while (i < count || out.length === 0) {
    const page = slots(s).map((slot, k) => ({ slot, i: null, k }));
    for (let k = out.length === 0 ? at : 0; k < per && i < count; k++) page[k].i = i++;
    out.push(page);
    if (count === 0) break;
  }
  return out;
}

// One step of the nudge: 1/32 inch, or half a millimetre.
export const nudgeStep = s => (s.unit === 'in' ? 1 / 32 : 0.5);

export function fmt(v, unit) {
  if (unit === 'mm') return `${Math.round(v * 10) / 10} mm`;
  const n = Math.round(v * 32);
  if (n === 0) return '0 in';
  const sign = n < 0 ? '−' : '';
  let a = Math.abs(n), whole = Math.floor(a / 32), part = a % 32, den = 32;
  while (part && part % 2 === 0) { part /= 2; den /= 2; }
  return `${sign}${whole ? whole : ''}${whole && part ? ' ' : ''}${part ? `${part}/${den}` : ''} in`;
}
