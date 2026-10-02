// Keeps a logo visible on whatever it sits on (admin light/dark, or the store's own palette).
//
// A logo is judged by how it actually looks: its average luminance over the opaque pixels. If that has enough
// contrast against the surface behind it, it is left exactly as uploaded (colours intact). Only when it would
// all but disappear — a black logo on a dark surface, a white one on a light surface — is it drawn as a flat
// white or black silhouette. Logos with a solid background (a JPG, an opaque PNG) are never touched: flattening
// them would turn them into a solid block.
import { getOptimizedUrl } from './cloudinary.js';

const cache = new Map();

const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const relLum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** { hasAlpha, lum } for a logo URL, or null if it can't be read (cross-origin without CORS, broken URL). */
export function analyzeLogo(url) {
  if (!url) return Promise.resolve(null);
  if (cache.has(url)) return cache.get(url);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const w = 64, h = Math.max(1, Math.round(64 * (img.naturalHeight / (img.naturalWidth || 1))));
        const c = document.createElement('canvas');
        c.width = w; c.height = Math.min(h, 128);
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, c.width, c.height);
        const { data } = ctx.getImageData(0, 0, c.width, c.height);
        let clear = 0, weight = 0, sum = 0;
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3];
          if (a < 40) { clear++; continue; }
          weight += a;
          sum += relLum(data[i], data[i + 1], data[i + 2]) * a;
        }
        const total = data.length / 4;
        resolve(weight ? { hasAlpha: clear / total > 0.05, lum: sum / weight } : null);
      } catch { resolve(null); } // tainted canvas
    };
    img.onerror = () => resolve(null);
    img.src = getOptimizedUrl(url, 160);
  });
  cache.set(url, p);
  return p;
}

/** Relative luminance of a CSS colour variable on an element, e.g. '--background' as "40 20% 97%". */
export function surfaceLuminance(el, varName) {
  const raw = getComputedStyle(el).getPropertyValue(varName).trim();
  const m = raw.match(/([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/);
  if (!m) return null;
  const h = Number(m[1]) / 360, s = Number(m[2]) / 100, l = Number(m[3]) / 100;
  const f = (n) => { const k = (n + h * 12) % 12; return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return relLum(f(0) * 255, f(8) * 255, f(4) * 255);
}

/** The CSS `filter` that keeps the logo visible on that surface ('' = leave it alone). */
export function toneFilter(info, el, surfaceVar = '--background') {
  if (!info || !info.hasAlpha) return '';
  const surface = surfaceLuminance(el, surfaceVar);
  if (surface === null) return '';
  if (ratio(info.lum, surface) >= 3) return '';
  return surface < 0.4 ? 'brightness(0) invert(1)' : 'brightness(0)';
}
