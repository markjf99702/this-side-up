// QR codes as inline SVG, drawn from the vendored generator (js/vendor/qrcode.js, MIT, Kazuhiko Arase),
// the same one While You Were Out uses. Level M: it still reads with a corner torn or a strip of tape across it.
import qrcode from './vendor/qrcode.js';

qrcode.stringToBytes = s => Array.from(new TextEncoder().encode(s));

export function qrMatrix(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  return { n, version: (n - 17) / 4, dark: (r, c) => qr.isDark(r, c) };
}

const attr = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

// Making a code takes a few milliseconds (it tries eight masks), and a move can have hundreds: keep the paths.
const paths = new Map();
function pathFor(text, quiet) {
  const key = quiet + '|' + text;
  if (paths.has(key)) return paths.get(key);
  const m = qrMatrix(text);
  let d = '';
  for (let r = 0; r < m.n; r++) {
    for (let c = 0; c < m.n; c++) {
      if (!m.dark(r, c)) continue;
      let run = 1;
      while (c + run < m.n && m.dark(r, c + run)) run++;
      d += `M${c + quiet} ${r + quiet}h${run}v1h-${run}z`;
      c += run - 1;
    }
  }
  const out = { d, n: m.n, version: m.version };
  if (paths.size > 2000) paths.clear();
  paths.set(key, out);
  return out;
}

// One path, with each run of dark squares in a row drawn as one rectangle (smaller, and no hairline seams).
export function qrSVG(text, { label = 'QR code', quiet = 4, cls = 'qr' } = {}) {
  const m = pathFor(text, quiet);
  const d = m.d;
  const size = m.n + quiet * 2;
  return `<svg class="${attr(cls)}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${attr(label)}" shape-rendering="crispEdges" data-version="${m.version}"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
