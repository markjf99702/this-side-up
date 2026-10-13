// What travels in a link, after the # (which browsers never send to a server):
//
//   #b/<move>/<n>/<flags>/<style>/<to>/<from>/<more>/<things>
//        one box, as its label's QR code carries it, so any phone camera can show what's inside
//        without the list. A phone that has this move's list opens the box in it instead.
//   #box/<n>     just a number (Tag Along writes these onto NFC stickers): opens that box in the list.
//   #l/<data>    the whole list, for a second phone, squeezed with deflate like While You Were Out's links.
//
// A label's QR code has to scan at about 1½ inches, so its link is kept to QR_BYTES: the number, the rooms,
// the flags and as much of what's inside as fits (roughly the first 120 characters).
import { room, cleanList } from './model.js';

export const SITE = 'https://junkdrawer.works/this-side-up/';
export const QR_BYTES = 213; // the most a version 10 QR code holds at error correction level M

// Where links should point: this page when it's the real site or a local copy, the real site otherwise
// (for example the single-file copy, which lives somewhere a link can't reach).
export function base(loc = globalThis.location) {
  if (!loc || !/^https?:$/.test(loc.protocol)) return SITE;
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(loc.hostname);
  if (local || loc.hostname.endsWith('junkdrawer.works')) return loc.origin + loc.pathname;
  return SITE;
}

// Text inside a field: like encodeURIComponent, except a space is + (one character instead of three)
// and ~ (which goes between the things in the box) is escaped. Curly quotes become straight ones,
// which take one character instead of nine.
const plain = s => String(s || '').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...').replace(/[–—]/g, '-')
  .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD'); // half an emoji can't be encoded
export const enc = s => encodeURIComponent(plain(s)).replace(/%20/g, '+').replace(/~/g, '%7E');
export const dec = s => {
  try { return decodeURIComponent(String(s).replace(/\+/g, '%20')); } catch { return ''; }
};

const FLAG_LETTERS = { fragile: 'f', heavy: 'h', first: 'o', car: 'c' };

// The part after the #, for a box's QR code. `budget` is how many characters it may use.
export function boxFragment(box, list, budget = QR_BYTES - SITE.length) {
  const to = room(list, box.to), from = room(list, box.from);
  const flags = (box.kind === 'piece' ? 'p' : '') + Object.entries(FLAG_LETTERS).filter(([f]) => box[f]).map(([, l]) => l).join('');
  const style = to && to.side === 'to' ? `${to.color}${to.shape}` : '';
  const head = ['b', list.id, box.n, flags, style, encName(to?.name), encName(from?.name)].join('/');
  const things = box.items.map(plain).filter(Boolean);
  const build = (shown, more) => `${head}/${more || ''}/${shown.map(enc).join('~')}`;
  // As many whole things as fit...
  let k = 0;
  while (k < things.length && build(things.slice(0, k + 1), things.length - k - 1).length <= budget) k++;
  let out = build(things.slice(0, k), things.length - k);
  // ...then as many words of the next one as there's room for.
  if (k < things.length) {
    const words = things[k].split(' ');
    for (let w = words.length - 1; w >= 1; w--) {
      const f = build([...things.slice(0, k), words.slice(0, w).join(' ') + '...'], things.length - k - 1);
      if (f.length <= budget) { out = f; break; }
    }
  }
  return out;
}

// A room's name, short enough that a name in another alphabet can't crowd out what's in the box. A name that's
// too long is cut after a word, with "..." to say so (not "Kids' playroom & craft c").
function encName(name) {
  const full = Array.from(plain(name));
  const fits = (chars, most) => chars.length <= most && enc(chars.join('')).length <= 36;
  if (fits(full, 24)) return enc(full.join(''));
  const cut = head => Array.from(head.replace(/[\s&+,;:/-]+$/, '') + '...');
  for (let i = full.length - 1; i > 0; i--) {
    if (full[i] !== ' ') continue;
    const chars = cut(full.slice(0, i).join(''));
    if (chars.length > 3 && fits(chars, 26)) return enc(chars.join(''));
  }
  // One long word (or a script that takes many characters to send): as much of it as fits.
  let head = full.slice(0, 23);
  while (head.length > 1 && !fits(cut(head.join('')), 26)) head = head.slice(0, -1);
  return enc(cut(head.join('')).join(''));
}

export const boxLink = (box, list, at = base()) => at + '#' + boxFragment(box, list, QR_BYTES - at.length - 1);

// What the label says. If it's changed since the label was printed, the label needs printing again.
export const labelSig = (box, list) => boxFragment(box, list, QR_BYTES - SITE.length - 1);
export const needsLabel = (box, list) => !box.printed || box.printedSig !== labelSig(box, list);

// Reads a box back out of a label's link. Null if it isn't one.
export function readBoxFragment(fragment) {
  const m = String(fragment || '').replace(/^#/, '').match(/^b\/([a-z0-9]{1,24})\/(\d{1,4})\/([phfoc]*)\/(\d{2})?\/([^/]*)\/([^/]*)\/(\d*)\/(.*)$/i);
  if (!m) return null;
  const [, move, n, flags, style, to, from, more, things] = m;
  return {
    move,
    n: Number(n),
    kind: flags.includes('p') ? 'piece' : 'box',
    fragile: flags.includes('f'), heavy: flags.includes('h'), first: flags.includes('o'), car: flags.includes('c'),
    to: dec(to), from: dec(from),
    color: style ? Number(style[0]) : null, shape: style ? Number(style[1]) : null,
    items: things ? things.split('~').map(dec).filter(Boolean) : [],
    more: Number(more) || 0,
  };
}

// "#box/012", as Tag Along writes with its link set to this page's address followed by #box/.
export function readNumber(fragment) {
  const m = String(fragment || '').replace(/^#/, '').match(/^box\/0*(\d{1,4})$/i);
  return m ? Number(m[1]) : null;
}
export const numberPrefix = (at = base()) => at + '#box/';

// ---------- The whole list ----------

const b64 = bytes => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64 = text => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0));

async function through(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

export async function pack(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream === 'function') {
    try { return 'z' + b64(await through(bytes, new CompressionStream('deflate-raw'))); } catch { /* fall back to plain */ }
  }
  return 'j' + b64(bytes);
}

export async function unpack(text) {
  const kind = text[0], body = text.slice(1);
  let bytes;
  if (kind === 'z') {
    if (typeof DecompressionStream !== 'function') throw new Error('This browser can’t open squeezed links. Try an up-to-date Chrome, Safari or Firefox.');
    bytes = await through(unb64(body), new DecompressionStream('deflate-raw'));
  } else if (kind === 'j') {
    bytes = unb64(body);
  } else {
    throw new Error('That isn’t a This Side Up link.');
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

// Only what a second phone needs: no example flag. Photos stay behind (their ids come along, so a
// backup file can bring the pictures later).
export function forLink(list) {
  const { example, ...rest } = list;
  return rest;
}

export const listLink = async (list, at = base()) => `${at}#l/${await pack(forLink(list))}`;

export async function readList(data) {
  const list = cleanList(await unpack(data));
  if (!list) throw new Error('That link doesn’t have a list in it.');
  return list;
}
