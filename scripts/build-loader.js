'use strict';
// Builds the site's loading animation from the spinning-logo GIF (public/brand/loader.gif):
//
//   public/brand/loader.webp        the same animation with a TRANSPARENT background, so it sits cleanly on any page colour
//   public/brand/loader-still.png   its first frame, shown instead to visitors who ask for reduced motion
//
//   npm run loader
//
// Why not use the GIF directly: it was exported on a near-white (#fefefe) background, not a transparent one (GIF can only
// do on/off transparency anyway), so on the store's cream background it showed as a faint pale square, and on a dark
// palette as a bright one. The logo is black, so each pixel's greyness is turned into opacity ("un-matting" from white):
// the result looks identical on white and is correct on any other colour. Needs ffmpeg (the ffmpeg-static optional
// dependency, or ffmpeg on the PATH).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PNG } = require('pngjs');

const DIR = path.join(__dirname, '..', 'public', 'brand');
const GIF = path.join(DIR, 'loader.gif');
const BACKGROUND = 254;                                  // the GIF's "white"

let ffmpeg = 'ffmpeg';
try { ffmpeg = require('ffmpeg-static') || ffmpeg; } catch { /* use the PATH */ }
const run = (args) => { const r = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' }); if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr || r.error}`); };

/** Delay of the first frame in 1/100 s, read from the GIF itself (the frame rate of the animation). */
function gifDelay(buf) {
  for (let i = 13; i < buf.length - 8; i++) if (buf[i] === 0x21 && buf[i + 1] === 0xf9 && buf[i + 2] === 4) return Math.max(2, buf.readUInt16LE(i + 4));
  return 10;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'loader-'));
try {
  const delay = gifDelay(fs.readFileSync(GIF));
  run(['-i', GIF, '-vf', 'format=rgba', path.join(tmp, 'in%03d.png')]);
  const names = fs.readdirSync(tmp).filter(f => /^in\d+\.png$/.test(f)).sort();
  for (const name of names) {
    const png = PNG.sync.read(fs.readFileSync(path.join(tmp, name)));
    const d = png.data;
    for (let i = 0; i < d.length; i += 4) {
      const lum = Math.max(d[i], d[i + 1], d[i + 2]);
      let a = lum >= 250 ? 0 : Math.round(255 * (1 - lum / BACKGROUND));   // paper stays clear, ink becomes opaque
      if (a < 6) a = 0;                                                     // no faint dust around the logo
      d[i] = d[i + 1] = d[i + 2] = 0;                                       // the logo is black; opacity carries the shading
      d[i + 3] = a;
    }
    fs.writeFileSync(path.join(tmp, name.replace('in', 'out')), PNG.sync.write(png));
  }
  run(['-framerate', String(100 / delay), '-i', path.join(tmp, 'out%03d.png'), '-c:v', 'libwebp_anim', '-lossless', '1', '-loop', '0', '-an', path.join(DIR, 'loader.webp')]);
  fs.copyFileSync(path.join(tmp, 'out001.png'), path.join(DIR, 'loader-still.png'));
  const kb = (f) => (fs.statSync(path.join(DIR, f)).size / 1024).toFixed(0);
  console.log(`loader: ${names.length} frames at ${(100 / delay).toFixed(0)} fps -> loader.webp ${kb('loader.webp')} KB (gif was ${kb('loader.gif')} KB), loader-still.png ${kb('loader-still.png')} KB`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
