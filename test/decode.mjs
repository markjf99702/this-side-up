// Reading QR codes back in the tests, with zxing-cpp (the zxing-wasm build): the same family of reader
// as the scanners on Android phones. Pictures come in as RGBA pixels or as PNG files.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';

const require = createRequire(import.meta.url);
const UPNG = require('upng-js');

prepareZXingModule({
  overrides: { wasmBinary: readFileSync(require.resolve('zxing-wasm/reader/zxing_reader.wasm')) },
  fireImmediately: true,
});

// Every QR code in the picture, as text.
export async function readQR(rgba, width, height) {
  const found = await readBarcodes({ data: new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength), width, height, colorSpace: 'srgb' }, { formats: ['QRCode'], maxNumberOfSymbols: 12 });
  return found.filter(r => r.isValid).map(r => ({ text: r.text, at: r.position }));
}

export function png(buffer) {
  const img = UPNG.decode(buffer);
  return { rgba: new Uint8Array(UPNG.toRGBA8(img)[0]), width: img.width, height: img.height };
}

// A part of a picture (for one label on a printed page).
export function crop({ rgba, width }, x, y, w, h) {
  x = Math.max(0, Math.round(x)); y = Math.max(0, Math.round(y)); w = Math.round(w); h = Math.round(h);
  const out = new Uint8Array(w * h * 4);
  for (let r = 0; r < h; r++) out.set(rgba.subarray(((y + r) * width + x) * 4, ((y + r) * width + x + w) * 4), r * w * 4);
  return { rgba: out, width: w, height: h };
}
