// Bundles the app into one self-contained HTML file, dist/this-side-up.html, for sharing as a single page.
// Also writes dist/artifact.html, the same page without the document wrapper, for hosts that supply their own
// <html>/<head>/<body> (the playable copy in Claude's Artifact viewer). The repo itself runs without this step.
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const read = p => readFile(new URL(p, root), 'utf8');

// Each change below must find what it changes: if index.html or the CSS moves on, the build stops and says so
// rather than writing a copy that quietly half works.
function swap(text, from, to, where) {
  const found = typeof from === 'string' ? text.includes(from) : from.test(text);
  if (!found) throw new Error(`${where}: ${from} not found`);
  return text.replace(from, to);
}

const result = await build({
  entryPoints: [new URL('js/app.js', root).pathname],
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'es2020',
  write: false,
});
// data-single tells the page it's the one-file copy, which has no service worker to register. Shown inside
// another page, it also hides the buttons that start a download, print or open the share sheet (framed() in js/ui.js).
const js = `document.documentElement.dataset.single = '';\n${result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}`;

// A single file can't point at other files, so the fonts and the icon go in as data: URIs,
// and the links that only make sense for the hosted site (manifest, home-screen icon, preloads) come out.
const dataUri = async (path, type) => `data:${type};base64,${(await readFile(new URL(path, root))).toString('base64')}`;
let css = await read('css/app.css');
// A host with its own light/dark switch puts data-theme on <html>. This Side Up has one palette, the cardboard's,
// and keeps it whatever the host says (color-scheme: light keeps the form controls light too). If a dark palette is
// ever added, it follows the system setting unless the host says light, and goes dark when it says dark.
const dark = css.match(/@media \(prefers-color-scheme: dark\) \{\n  :root \{([^}]*)\}\n\}/);
if (dark) css = css.replace(dark[0], `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {${dark[1]}}\n}\n:root[data-theme="dark"] {${dark[1]}}`);
else if (/prefers-color-scheme/.test(css)) throw new Error('css/app.css: a light/dark rule the build doesn’t know how to guard for data-theme');
for (const [, file] of css.matchAll(/url\(\.\.\/(fonts\/[^)]+\.woff2)\)/g)) css = css.replace(`url(../${file})`, `url(${await dataUri(file, 'font/woff2')})`);
if (/url\(\s*["']?(\.\.?\/|[\w-]+\/)/.test(css)) throw new Error('css/app.css: a file the one-file copy can’t reach');

const icon = await dataUri('icon.svg', 'image/svg+xml');
let html = await read('index.html');
// carry.js brings saves over from the old address at the real one; the one-file copy has no old address to ask.
html = html.replace(/ *<script src="carry\.js"><\/script>\n/, '');
html = swap(html, /\n *<link rel="manifest"[^>]*>/, '', 'index.html');
html = html.replace(/\n *<link rel="(apple-touch-icon|preload)"[^>]*>/g, '');
html = swap(html, '"icon.svg"', () => `"${icon}"`, 'index.html');
html = swap(html, '<link rel="stylesheet" href="css/app.css">', () => `<style>\n${css}</style>`, 'index.html');
html = swap(html, /\n *<script type="module" src="js\/app.js"><\/script>/, '', 'index.html');
// No files sit beside the one-file copy: whatever the page still points at must be a link elsewhere, data: or a #.
const stray = html.match(/\s(?:src|href)="(?![a-z][a-z\d+.-]*:|#)[^"]*"/i);
if (stray) throw new Error(`index.html: ${stray[0].trim()}, a file the one-file copy can’t reach`);
html = swap(html, '</body>', () => `<script>\n${js}</script>\n</body>`, 'index.html');

const fragment = html
  .replace(/<!doctype html>\s*/i, '')
  .replace(/<\/?html[^>]*>\s*/gi, '')
  .replace(/<\/?head>\s*/gi, '')
  .replace(/<\/?body[^>]*>\s*/gi, '')
  .replace(/<meta charset[^>]*>\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '');

// That host pads the page clear of a phone's notch itself, so the sticky bar sits below the padding instead of
// adding its own. (The tabs along the bottom already add the home indicator's inset to their own padding.)
let embedded = swap(fragment, 'position: sticky; top: 0; z-index: 20;', 'position: sticky; top: env(safe-area-inset-top, 0px); z-index: 20;', 'css/app.css .top');
embedded = swap(embedded, 'padding: calc(10px + env(safe-area-inset-top)) 16px 10px;', 'padding: 10px 16px;', 'css/app.css .top');

await mkdir(new URL('dist/', root), { recursive: true });
await writeFile(new URL('dist/this-side-up.html', root), html);
await writeFile(new URL('dist/artifact.html', root), embedded);
console.log(`dist/this-side-up.html  ${(html.length / 1024).toFixed(1)} KB`);
console.log(`dist/artifact.html      ${(embedded.length / 1024).toFixed(1)} KB`);
