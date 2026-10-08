'use strict';
// Custom fonts for the storefront (Settings → Typography). Two slots, "heading" and "body", each one of:
//   default  the built-in typeface (Space Grotesk)
//   body     (heading only) the same font as the body text
//   google   any family from Google Fonts, checked against Google when saved
//   upload   a font file the admin uploaded (.woff2, .woff, .ttf, .otf)
// Everything that ends up in the page's <head> is rebuilt here from validated values, never copied from what the browser sent,
// so a family name or a file URL can't smuggle markup or CSS into every page.

const DEFAULT_FAMILY = 'Space Grotesk';
const FAMILY_RE = /^[A-Za-z0-9][A-Za-z0-9 ]{1,58}[A-Za-z0-9]$/;
const FILE_RE = /^(https:\/\/res\.cloudinary\.com\/[A-Za-z0-9_\-./%]+|\/dev-uploads\/[A-Za-z0-9_\-.]+)\.(woff2|woff|ttf|otf)$/i;
const FORMATS = { woff2: 'woff2', woff: 'woff', ttf: 'truetype', otf: 'opentype' };
const SOURCES = { heading: ['default', 'body', 'google', 'upload'], body: ['default', 'google', 'upload'] };

class FontError extends Error {}

// Weights to ask for, richest first: families that lack some of them make Google answer 400, so we step down until one works.
const WEIGHT_SETS = ['300;400;500;600;700', '400;500;600;700', '400;500;700', '400;700', null];
const googleUrl = (family, weights) => `https://fonts.googleapis.com/css2?family=${family.trim().replace(/\s+/g, '+')}${weights ? `:wght@${weights}` : ''}&display=swap`;

const cache = new Map();                        // family (lower-case) -> { at, value } | { at, error }
const TTL_OK = 24 * 3600 * 1000, TTL_BAD = 10 * 60 * 1000;

/**
 * Looks the family up on Google Fonts. Resolves { family, url, weights } (the stylesheet URL to link), or throws FontError.
 * `fetchImpl` is injectable for tests.
 */
async function resolveGoogleFont(rawFamily, fetchImpl = fetch) {
  const family = String(rawFamily || '').trim().replace(/\s+/g, ' ');
  if (!FAMILY_RE.test(family)) throw new FontError('Enter the font name exactly as it appears on fonts.google.com (letters, numbers and spaces).');
  const key = family;                              // exact spelling: the cache must not let a wrong-case miss hide the right-case hit
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < (hit.error ? TTL_BAD : TTL_OK)) { if (hit.error) throw new FontError(hit.error); return hit.value; }

  let unreachable = false;
  for (const weights of WEIGHT_SETS) {
    const url = googleUrl(family, weights);
    try {
      const res = await fetchImpl(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; fonts-check)' }, signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const value = { family, url, weights: weights ? weights.split(';').join(', ') : '400' };
        cache.set(key, { at: Date.now(), value });
        return value;
      }
      if (res.status !== 400 && res.status !== 404) unreachable = true;
    } catch { unreachable = true; }
  }
  if (unreachable) throw new FontError('Could not reach Google Fonts to check that font. Try again in a moment.');
  const error = `Google Fonts has no font called “${family}”. Check the spelling against fonts.google.com.`;
  cache.set(key, { at: Date.now(), error });
  throw new FontError(error);
}

/** A readable family name from an uploaded file's name ("Brand-Sans_Bold.woff2" → "Brand Sans Bold"). */
function familyFromFile(file) {
  const base = decodeURIComponent(String(file).split('/').pop() || '').replace(/\.[a-z0-9]+$/i, '').replace(/_[a-z0-9]{6,}$/i, '').replace(/[-_]+/g, ' ').replace(/[^A-Za-z0-9 ]/g, '').trim();
  return base.slice(0, 40) || 'Custom font';
}

/** Validates what the admin sent and returns the clean value to store. Throws FontError with a message fit to show. */
async function normalizeFonts(input, fetchImpl = fetch) {
  const out = {};
  for (const slot of ['heading', 'body']) {
    const raw = (input && input[slot]) || {};
    const source = SOURCES[slot].includes(raw.source) ? raw.source : 'default';
    const label = slot === 'heading' ? 'Heading font' : 'Body font';
    if (source === 'google') {
      try { const f = await resolveGoogleFont(raw.family, fetchImpl); out[slot] = { source, family: f.family, url: f.url, file: '', format: '' }; }
      catch (e) { throw e instanceof FontError ? new FontError(`${label}: ${e.message}`) : e; }
    } else if (source === 'upload') {
      const file = String(raw.file || '');
      if (!FILE_RE.test(file)) throw new FontError(`${label}: upload a .woff2, .woff, .ttf or .otf file.`);
      const ext = file.slice(file.lastIndexOf('.') + 1).toLowerCase();
      const wanted = String(raw.family || '').trim();
      out[slot] = { source, family: /^[A-Za-z0-9][A-Za-z0-9 _-]{0,39}$/.test(wanted) ? wanted : familyFromFile(file), url: '', file, format: ext };
    } else {
      out[slot] = { source, family: '', url: '', file: '', format: '' };
    }
  }
  return out;
}

/**
 * The <head> markup for the storefront. Returns '' when everything is default, so an untouched store is served exactly as before.
 * Replaces the built-in Space Grotesk stylesheet link, which stays only while a slot still uses it.
 */
function buildFontHead(fonts) {
  if (!fonts) return '';
  const heading = fonts.heading || { source: 'default' }, body = fonts.body || { source: 'default' };
  if ((heading.source || 'default') === 'default' && (body.source || 'default') === 'default') return '';

  const usesDefault = (s) => !s.source || s.source === 'default';
  const parts = [];
  const faces = [], preloads = [];
  const seen = new Set();
  const nameOf = {};
  for (const [slot, f] of [['heading', heading], ['body', body]]) {
    if (f.source === 'google' && FAMILY_RE.test(f.family || '') && String(f.url || '').startsWith('https://fonts.googleapis.com/css2?family=')) {
      nameOf[slot] = f.family;
      if (!seen.has(f.url)) { seen.add(f.url); parts.push(`<link rel="stylesheet" href="${f.url.replace(/&/g, '&amp;').replace(/"/g, '')}">`); }
    } else if (f.source === 'upload' && FILE_RE.test(f.file || '') && FORMATS[f.format]) {
      const family = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,39}$/.test(f.family || '') ? f.family : familyFromFile(f.file);
      nameOf[slot] = family;
      if (!seen.has(f.file)) {
        seen.add(f.file);
        faces.push(`@font-face{font-family:"${family}";src:url("${f.file}") format("${FORMATS[f.format]}");font-weight:100 900;font-style:normal;font-display:swap}`);
        preloads.push(`<link rel="preload" href="${f.file}" as="font" type="font/${f.format}" crossorigin>`);
      }
    }
  }
  if (usesDefault(heading) || usesDefault(body)) {
    parts.unshift(`<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&amp;display=swap">`);
  }
  const stack = (name) => `"${name}",ui-sans-serif,system-ui,sans-serif`;
  const vars = [];
  if (nameOf.body) vars.push(`--font-body:${stack(nameOf.body)}`);
  if (nameOf.heading) vars.push(`--font-heading:${stack(nameOf.heading)}`);
  else if (heading.source === 'body' && nameOf.body) vars.push('--font-heading:var(--font-body)');
  const css = `${faces.join('')}${vars.length ? `:root{${vars.join(';')}}` : ''}`;
  return [...preloads, ...parts, css ? `<style id="site-fonts">${css}</style>` : ''].filter(Boolean).join('\n  ');
}

/** True when a file starts like a real font of the claimed kind (so a renamed image or script isn't accepted). */
function looksLikeFont(buffer, ext) {
  if (!buffer || buffer.length < 12) return false;
  const tag = buffer.subarray(0, 4).toString('latin1');
  const e = String(ext).toLowerCase();
  if (e === 'woff2') return tag === 'wOF2';
  if (e === 'woff') return tag === 'wOFF';
  if (e === 'otf') return tag === 'OTTO' || buffer.readUInt32BE(0) === 0x00010000;
  if (e === 'ttf') return buffer.readUInt32BE(0) === 0x00010000 || tag === 'true' || tag === 'OTTO';
  return false;
}

module.exports = { FontError, resolveGoogleFont, normalizeFonts, buildFontHead, familyFromFile, looksLikeFont, FILE_RE, DEFAULT_FAMILY };
