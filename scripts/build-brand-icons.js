'use strict';
// Builds the favicon and web-app icon set from the brand's own vector logo (public/brand/others-logo.svg), straight from
// the artwork, with nothing recoloured or redrawn after the fact. Run it after changing the logo:
//
//   npm run icons
//
// It writes into public/brand/ (committed, so the server and the deploy need nothing extra):
//   favicon.svg                      the logo as vector, black on light tabs and white on dark ones (prefers-color-scheme)
//   favicon.ico, favicon-16/32/48    the logo on a light rounded tile: readable on both light and dark browser tabs
//   apple-touch-icon.png             180px, the logo on a solid tile (iOS turns transparency black, so it must be solid)
//   icon-192/512, icon-maskable-*    Android / installed web app; maskable ones keep the logo inside the safe zone
//   admin-*                          the same set for the admin app: dark tile, white logo, "ADMIN" label, so the two
//                                    installed apps can be told apart on a home screen
//   others-logo-white.svg            the white version of the logo
//   version.txt                      a short hash of everything above, appended to icon URLs so they refresh when it changes
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Resvg } = require('@resvg/resvg-js');

const DIR = path.join(__dirname, '..', 'public', 'brand');
const SOURCE = fs.readFileSync(path.join(DIR, 'others-logo.svg'), 'utf8');
const inner = SOURCE.slice(SOURCE.indexOf('</defs>') + '</defs>'.length, SOURCE.lastIndexOf('</svg>')).replace(/\s+class="[^"]*"/g, '');

const STORE = { tile: '#f8f5f2', ink: '#18181b' };       // light tile, black logo
const ADMIN = { tile: '#18181b', ink: '#ffffff' };       // dark tile, white logo

// The logo's real extent (the artboard is 1080×1080 but the artwork is not), measured from the pixels.
function measure() {
  const r = new Resvg(SOURCE, { fitTo: { mode: 'width', value: 1080 } }).render();
  const { width, height, pixels } = r;
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (pixels[(y * width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, cx: (x0 + x1 + 1) / 2, cy: (y0 + y1 + 1) / 2 };
}
const BOX = measure();

// "ADMIN" as strokes (no font needed, so it looks the same everywhere). Each letter is drawn in a 0.7 × 1 box.
const GLYPHS = {
  A: 'M0,1 L.35,0 L.7,1 M.12,.68 L.58,.68',
  D: 'M0,0 L0,1 L.28,1 Q.7,1 .7,.5 Q.7,0 .28,0 Z',
  M: 'M0,1 L0,0 L.35,.62 L.7,0 L.7,1',
  I: 'M.35,0 L.35,1',
  N: 'M0,1 L0,0 L.7,1 L.7,0',
};
function badge(word, cx, baseline, height, color) {
  const w = 0.7 * height, gap = 0.42 * height, total = word.length * w + (word.length - 1) * gap;
  let x = cx - total / 2, out = '';
  for (const ch of word) {
    out += `<path transform="translate(${x.toFixed(2)} ${(baseline - height).toFixed(2)}) scale(${height})" d="${GLYPHS[ch]}"/>`;
    x += w + gap;
  }
  return `<g fill="none" stroke="${color}" stroke-width="0.16" stroke-linecap="round" stroke-linejoin="round">${out}</g>`;
}

/** An SVG of `size`×`size`: the logo on a tile, `scale` = the logo's height as a fraction of the tile. */
function tileSvg(size, { tile, ink }, { scale = 0.7, label = '', radius = 0 } = {}) {
  const s = (size * scale) / BOX.h;
  const lift = label ? size * 0.045 : 0;                              // room for the label under the logo
  const tx = size / 2 - BOX.cx * s, ty = size / 2 - lift - BOX.cy * s;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`
    + `<rect width="${size}" height="${size}" rx="${radius}" fill="${tile}"/>`
    + `<g transform="translate(${tx.toFixed(3)} ${ty.toFixed(3)}) scale(${s.toFixed(5)})" fill="${ink}" fill-rule="evenodd">${inner}</g>`
    + (label ? badge(label, size / 2, size * 0.915, size * 0.07, ink) : '')
    + `</svg>`;
}
const png = (svg, size) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();

function buildIco(images) {                                           // PNG images inside an .ico
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(1, 2); head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, e); head.writeUInt8(size >= 256 ? 0 : size, e + 1);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(data.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...images.map(i => i.data)]);
}

const files = {};

// ── Browser tab ─────────────────────────────────────────────────────────────
{
  const side = BOX.h * 1.14;                                           // a little air around the tall logo
  const vb = `${(BOX.cx - side / 2).toFixed(1)} ${(BOX.cy - side / 2).toFixed(1)} ${side.toFixed(1)} ${side.toFixed(1)}`;
  files['favicon.svg'] = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"><title>Others.</title>`
    + `<style>g{fill:#18181b;fill-rule:evenodd}@media (prefers-color-scheme:dark){g{fill:#fafafa}}</style><g>${inner}</g></svg>\n`;
  const tab = (n) => png(tileSvg(n, STORE, { scale: 0.76, radius: Math.round(n * 0.2) }), n);
  const sizes = [16, 32, 48];
  const pngs = sizes.map(n => ({ size: n, data: tab(n) }));
  files['favicon.ico'] = buildIco(pngs);
  files['favicon-32.png'] = pngs[1].data;
  files['favicon-48.png'] = pngs[2].data;
}

// ── Home screen / installed app ─────────────────────────────────────────────
for (const [prefix, theme, label] of [['', STORE, ''], ['admin-', ADMIN, 'ADMIN']]) {
  files[`${prefix}apple-touch-icon.png`] = png(tileSvg(180, theme, { scale: label ? 0.58 : 0.7, label }), 180);
  for (const n of [192, 512]) {
    files[`${prefix}icon-${n}.png`] = png(tileSvg(n, theme, { scale: label ? 0.58 : 0.7, label }), n);
    files[`${prefix}icon-maskable-${n}.png`] = png(tileSvg(n, theme, { scale: 0.5 }), n);   // the OS crops to a circle or squircle
  }
}

files['others-logo-white.svg'] = SOURCE.replace('fill-rule: evenodd;', 'fill: #fff;\n        fill-rule: evenodd;');

const hash = crypto.createHash('sha1');
for (const name of Object.keys(files).sort()) {
  fs.writeFileSync(path.join(DIR, name), files[name]);
  hash.update(name).update(files[name]);
}
for (const name of ['loader.webp', 'loader-still.png']) {            // the loading animation shares the version, so a new one is fetched
  try { hash.update(name).update(fs.readFileSync(path.join(DIR, name))); } catch { /* not built yet */ }
}
fs.writeFileSync(path.join(DIR, 'version.txt'), hash.digest('hex').slice(0, 8) + '\n');
console.log(`brand icons: ${Object.keys(files).length} files written to public/brand/ (logo ${BOX.w}×${BOX.h}px on a 1080 artboard)`);
