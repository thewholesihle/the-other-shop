'use strict';
// A logo that stays visible in both the light and the dark version of an email.
//
// Email can't run JavaScript, so the decision is made here, once per logo: sample the logo (a 64px PNG), judge
// how it looks (average luminance over its opaque pixels), and prepare two image URLs — one for a white card,
// one for the dark card. A logo that already contrasts with a surface is used as uploaded; one that would
// vanish becomes a flat black/white silhouette (a Cloudinary colorize transform) for that surface. Logos with a
// solid background, or that can't be read, are used as they are in both modes. The email swaps between the two
// with `prefers-color-scheme` (see emails/ui.jsx). Same rule as src/lib/logoTone.js in the browser.
const { PNG } = require('pngjs');

const TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map();

const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const relLum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

// Luminance of the two card colours in emails/ui.jsx: white, and zinc-900 (#18181b).
const SURFACE = { light: 1, dark: relLum(24, 24, 27) };

const isCloudinary = (u) => typeof u === 'string' && u.includes('res.cloudinary.com') && u.includes('/upload/');
const withTransform = (u, t) => { const i = u.indexOf('/upload/'); return `${u.slice(0, i + 8)}${t}/${u.slice(i + 8)}`; };

/** { hasAlpha, lum } from raw RGBA pixels (exported for tests). */
function measure(data) {
  let clear = 0, weight = 0, sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 40) { clear++; continue; }
    weight += a;
    sum += relLum(data[i], data[i + 1], data[i + 2]) * a;
  }
  const total = data.length / 4;
  return weight ? { hasAlpha: clear / total > 0.05, lum: sum / weight } : null;
}

/** 'asis' | 'black' | 'white' for a logo on a surface of the given luminance. */
function toneFor(info, surface) {
  if (!info || !info.hasAlpha) return 'asis';
  if (ratio(info.lum, surface) >= 3) return 'asis';
  return surface < 0.4 ? 'white' : 'black';
}

async function analyze(url) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  let value = null;
  try {
    // Ask Cloudinary for a small PNG (never AVIF/WebP, which can't be decoded here). Other hosts: only PNGs.
    const sample = isCloudinary(url) ? withTransform(url, 'c_limit,w_64,f_png') : (/\.png(\?|$)/i.test(url) ? url : '');
    if (sample) {
      const res = await fetch(sample, { signal: AbortSignal.timeout(4000) });
      if (res.ok) value = measure(PNG.sync.read(Buffer.from(await res.arrayBuffer())).data);
    }
  } catch { value = null; }
  cache.set(url, { at: Date.now(), value });
  return value;
}

/** { light, dark } image URLs for an absolute logo URL. */
async function emailLogoVariants(url) {
  const base = isCloudinary(url) ? withTransform(url, 'c_limit,w_360,f_png,q_auto') : url;
  const info = await analyze(url);
  const make = (tone) => {
    if (tone === 'asis' || !isCloudinary(url)) return base;
    return withTransform(url, `e_colorize:100,co_rgb:${tone === 'white' ? 'ffffff' : '000000'}/c_limit,w_360,f_png,q_auto`);
  };
  return { light: make(toneFor(info, SURFACE.light)), dark: make(toneFor(info, SURFACE.dark)) };
}

module.exports = { emailLogoVariants, toneFor, measure, SURFACE, analyze, isCloudinary, withTransform };
