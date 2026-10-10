'use strict';
// The favicon and app icons for the store and for the admin. The store and the admin are installable as SEPARATE web apps,
// so each has its own manifest, name, scope, start URL, shortcuts and home-screen icon.
//
// WHERE THE ARTWORK COMES FROM
//  • By default, the brand's own vector logo: public/brand/others-logo.svg is rendered into a ready-made icon set
//    (public/brand/, built by `npm run icons`, see scripts/build-brand-icons.js). Exact artwork at every size, crisp
//    16/32/48 tab icons, an SVG favicon that is black on light tabs and white on dark ones, solid-tile Apple and
//    192/512 icons, maskable icons with the logo inside the safe zone, and a separate dark "ADMIN" set for the admin app.
//  • If an explicit Favicon is uploaded in Settings, that image wins and everything below the "custom favicon" marks
//    derives from it, as before. (The logo field no longer drives icons: it is for the page, not for the tab.)
//
// THE REST OF THIS NOTE DESCRIBES THE CUSTOM-FAVICON PATH
//
//  • Sharp at every size: real 16/32/48 renditions packed into /favicon.ico (not one downscaled 64px image), an SVG
//    favicon for browsers that take it, a solid-background Apple touch icon (iOS turns transparency black), and
//    192/512 + maskable icons for Android / installed web apps (maskable ones keep the logo inside the safe zone).
//  • Adapts to the browser theme: the SVG favicon carries a light and a dark rendition and switches with
//    prefers-color-scheme (Chrome, Firefox, Edge). A logo that would vanish on a tab becomes a flat white or black
//    silhouette for that theme; one that already contrasts, or that has a solid background, is left alone. Same rule as
//    src/emailLogo.js.
//  • App icons are always legible: the tile colour is CHOSEN to contrast with the logo (a white logo gets a dark tile, a
//    dark logo a light one) instead of hoping the logo's colour suits the store's background — a white logo on a cream
//    tile came out as a blank square on iOS. If the logo can't be analysed, the tile is a neutral mid-grey that shows
//    both black and white logos.
// Resizing needs the logo on Cloudinary; a logo hosted elsewhere is used as it is.
const fs = require('node:fs');
const path = require('node:path');
const { analyze, toneFor, isCloudinary, withTransform } = require('./emailLogo');

// ── the built-in brand icon set ──────────────────────────────────────────────
const BRAND_DIR = path.join(__dirname, '..', 'public', 'brand');
const brandFile = (name) => { try { return fs.readFileSync(path.join(BRAND_DIR, name)); } catch { return null; } };
let brandVersion = '';
try { brandVersion = fs.readFileSync(path.join(BRAND_DIR, 'version.txt'), 'utf8').trim(); } catch { /* not built yet */ }
const brandUrl = (name) => `/brand/${name}${brandVersion ? `?v=${brandVersion}` : ''}`;
const hasBrandIcons = () => Boolean(brandFile('favicon.svg'));

// Relative luminance of a browser tab in light and in dark mode (light-grey strip / dark-grey tab).
const TAB = { light: 0.85, dark: 0.035 };
const UNKNOWN_TILE = '71717a';            // zinc-500: ≥ 4:1 against both pure white and pure black

const isHex = (c) => /^#[0-9a-f]{3,8}$/i.test(c || '');
function hex6(c, fallback) {
  const bare = String(c || '').replace(/^#/, '');          // accepts "#f8f5f2" and "f8f5f2"
  const v = /^[0-9a-f]{3,8}$/i.test(bare) ? bare : fallback;
  return (v.length === 3 ? v.split('').map(x => x + x).join('') : v.slice(0, 6)).toLowerCase();
}
function hexLum(c, fallback = 'ffffff') {
  const h = hex6(c, fallback);
  const lin = (i) => { const v = parseInt(h.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(0) + 0.7152 * lin(2) + 0.0722 * lin(4);
}
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** The custom favicon, if one was uploaded in Settings. Empty means "use the built-in brand icons". */
const source = (info) => info?.favicon || '';
const colorize = (tone) => (tone === 'asis' ? '' : `e_colorize:100,co_rgb:${tone === 'white' ? 'ffffff' : '000000'}/`);

/** Square, transparent-background PNG for a browser tab. */
const tabUrl = (src, tone, size) => (isCloudinary(src) ? withTransform(src, `${colorize(tone)}c_pad,w_${size},h_${size},f_png,q_auto`) : src);

/**
 * Square PNG on a solid colour with the logo at `scale` of the width (Apple touch / app icons; maskable uses a smaller
 * scale). `badge` writes a small label along the bottom edge (the admin app's "ADMIN"), so the two apps are told apart
 * on a home screen even when their logos match.
 */
const solidUrl = (src, tone, size, scale, bg, badge = '') => {
  if (!isCloudinary(src)) return src;
  const inner = Math.round(size * scale);
  let t = `${colorize(tone)}c_fit,w_${inner},h_${inner}/c_pad,w_${size},h_${size},b_rgb:${bg},f_png,q_auto`;
  if (badge) {
    const text = hexLum(bg) < 0.4 ? 'fafafa' : '18181b';
    t += `/l_text:Arial_${Math.max(10, Math.round(size * 0.085))}_bold_letter_spacing_2:${badge},co_rgb:${text},b_rgb:${bg}/fl_layer_apply,g_south,y_${Math.round(size * 0.05)}`;
  }
  return withTransform(src, t);
};

/** How the logo should be drawn for browser tabs, or null when there's nothing to analyse (no logo / not on Cloudinary). */
async function tonesFor(info) {
  const src = source(info);
  if (!isCloudinary(src)) return null;
  const a = await analyze(src);
  return { tabLight: toneFor(a, TAB.light), tabDark: toneFor(a, TAB.dark) };
}

/**
 * The tile for an app / home-screen icon: the first candidate colour the logo contrasts with (≥ 3:1), logo untouched.
 * Only if none does is the logo flattened to white/black. Store tiles prefer the store's colours; the admin's prefer the
 * dark zinc tile that marks it as the admin app.
 */
function chooseTile(a, candidates) {
  if (!a) return { bg: UNKNOWN_TILE, tone: 'asis' };                      // couldn't read the logo: a tile that suits both
  if (!a.hasAlpha) return { bg: candidates[0], tone: 'asis' };           // the logo brings its own background
  for (const c of candidates) if (ratio(a.lum, hexLum(c)) >= 3) return { bg: c, tone: 'asis' };
  return { bg: candidates[0], tone: hexLum(candidates[0]) < 0.4 ? 'white' : 'black' };   // mid-tone logo: flatten it
}
async function appTile(info, { admin = false, bg, fg } = {}) {
  const src = source(info);
  const candidates = admin ? ['18181b', 'fafafa'] : [hex6(bg, 'ffffff'), hex6(fg, '18181b'), 'ffffff', '18181b'];
  if (!isCloudinary(src)) return { bg: candidates[0], tone: 'asis' };
  return chooseTile(await analyze(src), candidates);
}

// ── fetching renditions (for the ICO and the SVG, which must embed their images) ─────────────────────────────
async function grab(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
  } catch { return null; }
}
const memo = new Map();
async function cached(key, make, ttl = 60 * 60 * 1000) {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = await make();
  if (value) memo.set(key, { at: Date.now(), value }); // a failed fetch is not remembered, so the next request retries
  return value;
}

/** An .ico holding PNG images (every current browser reads PNG-in-ICO). */
function buildIco(images) {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, e); head.writeUInt8(size >= 256 ? 0 : size, e + 1);
    head.writeUInt8(0, e + 2); head.writeUInt8(0, e + 3);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(data.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...images.map(i => i.data)]);
}

/** /favicon.ico — 16, 32 and 48px, or null if it can't be built (the route then redirects). */
async function faviconIco(info) {
  const src = source(info);
  if (!src && hasBrandIcons()) return brandFile('favicon.ico');
  if (!isCloudinary(src)) return null;
  return cached(`ico:${src}`, async () => {
    const t = await tonesFor(info);
    const sizes = [16, 32, 48];
    const bufs = await Promise.all(sizes.map(s => grab(tabUrl(src, t.tabLight, s))));
    if (bufs.some(b => !b)) return null;
    return buildIco(sizes.map((size, i) => ({ size, data: bufs[i] })));
  });
}

const esc = (s) => String(s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));

/** /favicon.svg — adapts to light/dark tabs; falls back to a monogram when there's no readable logo. */
async function faviconSvg(info) {
  const src = source(info);
  if (!src && hasBrandIcons()) return brandFile('favicon.svg').toString('utf8');
  if (isCloudinary(src)) {
    const svg = await cached(`svg:${src}`, async () => {
      const t = await tonesFor(info);
      const lightUrl = tabUrl(src, t.tabLight, 128), darkUrl = tabUrl(src, t.tabDark, 128);
      const [l, d] = await Promise.all([grab(lightUrl), lightUrl === darkUrl ? null : grab(darkUrl)]);
      if (!l) return null;
      const img = (cls, buf) => `<image class="${cls}" width="128" height="128" href="data:image/png;base64,${buf.toString('base64')}"/>`;
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">`
        + (d ? `<style>.d{display:none}@media (prefers-color-scheme:dark){.l{display:none}.d{display:inline}}</style>${img('l', l)}${img('d', d)}` : img('l', l))
        + `</svg>`;
    });
    if (svg) return svg;
  }
  // Monogram: the store's colours, flipped for dark tabs so the tile never blends into the tab.
  const letter = esc((info?.name || 'O').trim().charAt(0).toUpperCase() || 'O');
  const fg = `#${hex6(info?.fg, '211c1a')}`, bgc = `#${hex6(info?.bg, 'f8f5f2')}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><style>.t{fill:${fg}}.m{fill:${bgc}}@media (prefers-color-scheme:dark){.t{fill:${bgc}}.m{fill:${fg}}}</style>`
    + `<rect class="t" width="64" height="64" rx="14"/><text class="m" x="32" y="45" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-weight="700" font-size="38">${letter}</text></svg>`;
}

/** URL of the 180px Apple touch icon (solid tile), or '' if there is no logo. */
async function appleTouchUrl(info, bg = '#ffffff', { admin = false, fg } = {}) {
  const src = source(info);
  if (!src) return hasBrandIcons() ? brandUrl(admin ? 'admin-apple-touch-icon.png' : 'apple-touch-icon.png') : '';
  if (!isCloudinary(src)) return src;
  const tile = await appTile(info, { admin, bg, fg });
  return solidUrl(src, tile.tone, 180, 0.8, tile.bg, admin ? 'ADMIN' : '');
}

/** <link>/<meta> tags for the tab, home screen, install prompt and browser chrome — for the store, or for the admin app. */
async function headTags(info, { admin = false, bg = '#ffffff', fg } = {}) {
  const src = source(info);
  const bgHex = hex6(bg, 'ffffff');
  const apple = await appleTouchUrl(info, bg, { admin, fg });
  const name = String(info?.name || 'Others.');
  const themeMetas = admin
    // The admin has a light and a dark theme (and a manual switch); the page keeps these in step at runtime too.
    ? ['<meta name="theme-color" content="#fafafa" media="(prefers-color-scheme: light)">', '<meta name="theme-color" content="#09090b" media="(prefers-color-scheme: dark)">', '<meta name="color-scheme" content="light dark">']
    // The storefront has the palette the owner chose, so the browser bar matches the page, and form controls / scrollbars follow its brightness.
    : [`<meta name="theme-color" content="#${bgHex}">`, `<meta name="color-scheme" content="${hexLum(bg) < 0.35 ? 'dark' : 'light'}">`];
  return [
    (src ? isCloudinary(src) : hasBrandIcons()) ? `<link rel="icon" href="/favicon.ico${src ? '' : `?v=${brandVersion}`}" sizes="48x48">` : '',
    !src && hasBrandIcons() ? `<link rel="icon" type="image/png" sizes="32x32" href="${brandUrl('favicon-32.png')}">` : '',
    `<link rel="icon" href="/favicon.svg${!src && brandVersion ? `?v=${brandVersion}` : ''}" type="image/svg+xml" sizes="any">`,
    apple ? `<link rel="apple-touch-icon" href="${esc(apple)}">` : '',
    `<link rel="manifest" href="${admin ? '/admin.webmanifest' : '/manifest.webmanifest'}">`,
    ...themeMetas,
    '<meta name="mobile-web-app-capable" content="yes">',
    `<meta name="apple-mobile-web-app-title" content="${esc((admin ? `${name} Admin` : name).slice(0, 24))}">`,
  ].filter(Boolean).join('\n  ');
}

/** The icon list shared by both manifests: normal + maskable at 192 and 512 on the tile chosen for the logo. */
async function appIcons(info, opts) {
  const src = source(info);
  if (!src && hasBrandIcons()) {
    const pre = opts.admin ? 'admin-' : '';
    return [
      { src: brandUrl(`${pre}icon-192.png`), sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: brandUrl(`${pre}icon-512.png`), sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: brandUrl(`${pre}icon-maskable-192.png`), sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: brandUrl(`${pre}icon-maskable-512.png`), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ];
  }
  if (isCloudinary(src)) {
    const tile = await appTile(info, opts);
    const badge = opts.admin ? 'ADMIN' : '';
    return [
      { src: solidUrl(src, tile.tone, 192, 0.8, tile.bg, badge), sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: solidUrl(src, tile.tone, 512, 0.8, tile.bg, badge), sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Maskable icons get cropped to a circle/squircle by the OS: keep the logo (and the label) inside the central safe zone.
      { src: solidUrl(src, tile.tone, 192, 0.55, tile.bg, ''), sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: solidUrl(src, tile.tone, 512, 0.55, tile.bg, ''), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ];
  }
  if (src) return [{ src, sizes: 'any', type: /\.svg(\?|$)/i.test(src) ? 'image/svg+xml' : 'image/png', purpose: 'any' }];
  return [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }];
}

const infoOf = (site) => ({ name: site?.name, logo: site?.logo, favicon: site?.favicon, bg: site?.colors?.background, fg: site?.colors?.foreground });
const shortName = (s) => (s.length > 12 ? s.slice(0, 12).trim() : s);

/** The STORE's web app manifest. `site` is the stored Settings document. */
async function manifest(site) {
  const info = infoOf(site);
  const name = site?.name || 'Others.';
  const bg = isHex(site?.colors?.background) ? site.colors.background : '#ffffff';
  return {
    id: '/',
    name,
    short_name: shortName(name),
    description: site?.tagline || site?.description || `Shop ${name}`,
    lang: 'en-ZA',
    dir: 'ltr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    categories: ['shopping'],
    background_color: bg,
    theme_color: bg,                     // matches the page (the navbar is the page colour), not the dark primary
    icons: await appIcons(info, { admin: false, bg, fg: site?.colors?.foreground }),
    shortcuts: [
      { name: 'Shop', url: '/shop' },
      { name: 'Cart', url: '/cart' },
    ],
  };
}

/** The ADMIN's web app manifest: its own identity, so it installs (and updates) as a different app from the store. */
async function adminManifest(site) {
  const info = infoOf(site);
  const name = site?.name || 'Others.';
  return {
    id: '/admin/',
    name: `${name} Admin`,
    short_name: name.length > 6 ? 'Admin' : `${name} Admin`.slice(0, 12),
    description: `Manage products, orders and settings for ${name}.`,
    lang: 'en-ZA',
    dir: 'ltr',
    start_url: '/admin/',
    scope: '/admin/',
    display: 'standalone',
    categories: ['business', 'productivity'],
    background_color: '#fafafa',
    theme_color: '#fafafa',
    icons: await appIcons(info, { admin: true }),
    shortcuts: [
      { name: 'Orders', url: '/admin/orders' },
      { name: 'Products', url: '/admin/products' },
      { name: 'Site status', url: '/admin/status' },
    ],
  };
}

module.exports = { brandUrl, hasBrandIcons, appleTouchUrl, appTile, chooseTile, faviconIco, faviconSvg, headTags, manifest, adminManifest, buildIco, hexLum, hex6, tabUrl, solidUrl, TAB, UNKNOWN_TILE };
