'use strict';
// The store's icons: browser tab, home-screen / app icon and web app manifest, all derived from the logo (or favicon)
// uploaded in Settings. Nothing is bundled with the project.
//
//  • Sharp at every size: real 16/32/48 renditions packed into /favicon.ico (not one downscaled 64px image), an SVG
//    favicon for browsers that take it, a solid-background Apple touch icon (iOS turns transparency black), and
//    192/512 + maskable icons for Android / installed web apps (maskable ones keep the logo inside the safe zone).
//  • Adapts to the browser theme: the SVG favicon carries a light and a dark rendition and switches with
//    prefers-color-scheme (Chrome, Firefox, Edge). A logo that would vanish on a tab becomes a flat white or black
//    silhouette for that theme; one that already contrasts, or that has a solid background, is left alone. Same rule as
//    src/emailLogo.js. Transforms need Cloudinary; a logo hosted elsewhere is used as it is.
const { analyze, toneFor, isCloudinary, withTransform } = require('./emailLogo');

// Relative luminance of a browser tab in light and in dark mode (light-grey strip / dark-grey tab).
const TAB = { light: 0.85, dark: 0.035 };

const isHex = (c) => /^#[0-9a-f]{3,8}$/i.test(c || '');
function hex6(c, fallback) {
  const v = isHex(c) ? c.slice(1) : fallback;
  return (v.length === 3 ? v.split('').map(x => x + x).join('') : v.slice(0, 6)).toLowerCase();
}
function hexLum(c, fallback = 'ffffff') {
  const h = hex6(c, fallback);
  const lin = (i) => { const v = parseInt(h.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(0) + 0.7152 * lin(2) + 0.0722 * lin(4);
}

const source = (info) => info?.favicon || info?.logo || '';
const colorize = (tone) => (tone === 'asis' ? '' : `e_colorize:100,co_rgb:${tone === 'white' ? 'ffffff' : '000000'}/`);

/** Square, transparent-background PNG for a browser tab. */
const tabUrl = (src, tone, size) => (isCloudinary(src) ? withTransform(src, `${colorize(tone)}c_pad,w_${size},h_${size},f_png,q_auto`) : src);
/** Square PNG on a solid colour with the logo at `scale` of the width (Apple touch / app icons; maskable uses a smaller scale). */
const solidUrl = (src, tone, size, scale, bg) => {
  if (!isCloudinary(src)) return src;
  const inner = Math.round(size * scale);
  return withTransform(src, `${colorize(tone)}c_fit,w_${inner},h_${inner}/c_pad,w_${size},h_${size},b_rgb:${bg},f_png,q_auto`);
};

/** How the logo should be drawn for each surface, or null when there's nothing to analyse (no logo / not on Cloudinary). */
async function tonesFor(info, bg) {
  const src = source(info);
  if (!isCloudinary(src)) return null;
  const a = await analyze(src);
  return { tabLight: toneFor(a, TAB.light), tabDark: toneFor(a, TAB.dark), solid: toneFor(a, hexLum(bg)) };
}

// ── fetching renditions (for the ICO and the SVG, which must embed their images) ─────────────────────────────
async function grab(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
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
  if (!isCloudinary(src)) return null;
  return cached(`ico:${src}`, async () => {
    const t = await tonesFor(info, '#ffffff');
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
  if (isCloudinary(src)) {
    const svg = await cached(`svg:${src}`, async () => {
      const t = await tonesFor(info, '#ffffff');
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

/** <link>/<meta> tags for the tab, home screen, install prompt and browser chrome. */
async function headTags(info, { admin = false, bg = '#ffffff' } = {}) {
  const src = source(info);
  const bgHex = hex6(bg, 'ffffff');
  const t = await tonesFor(info, bg);
  const apple = src ? (isCloudinary(src) ? solidUrl(src, t.solid, 180, 0.8, bgHex) : src) : '';
  const themeMetas = admin
    // The admin has a light and a dark theme (and a manual switch); the page keeps these in step at runtime too.
    ? ['<meta name="theme-color" content="#fafafa" media="(prefers-color-scheme: light)">', '<meta name="theme-color" content="#09090b" media="(prefers-color-scheme: dark)">', '<meta name="color-scheme" content="light dark">']
    // The storefront has the palette the owner chose, so the browser bar matches the page, and form controls / scrollbars follow its brightness.
    : [`<meta name="theme-color" content="#${bgHex}">`, `<meta name="color-scheme" content="${hexLum(bg) < 0.35 ? 'dark' : 'light'}">`];
  return [
    src && isCloudinary(src) ? '<link rel="icon" href="/favicon.ico" sizes="48x48">' : '',
    '<link rel="icon" href="/favicon.svg" type="image/svg+xml" sizes="any">',
    apple ? `<link rel="apple-touch-icon" href="${esc(apple)}">` : '',
    '<link rel="manifest" href="/manifest.webmanifest">',
    ...themeMetas,
    '<meta name="mobile-web-app-capable" content="yes">',
    `<meta name="apple-mobile-web-app-title" content="${esc((info?.name || 'Others.').slice(0, 20))}">`,
  ].filter(Boolean).join('\n  ');
}

/** The web app manifest. `site` is the stored Settings document. */
async function manifest(site) {
  const info = { name: site?.name, logo: site?.logo, favicon: site?.favicon, bg: site?.colors?.background, fg: site?.colors?.foreground };
  const name = site?.name || 'Others.';
  const bg = isHex(site?.colors?.background) ? site.colors.background : '#ffffff';
  const bgHex = hex6(bg, 'ffffff');
  const src = source(info);
  let icons;
  if (isCloudinary(src)) {
    const t = await tonesFor(info, bg);
    icons = [
      { src: solidUrl(src, t.solid, 192, 0.8, bgHex), sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: solidUrl(src, t.solid, 512, 0.8, bgHex), sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Maskable icons get cropped to a circle/squircle by the OS: keep the logo inside the central safe zone.
      { src: solidUrl(src, t.solid, 192, 0.6, bgHex), sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: solidUrl(src, t.solid, 512, 0.6, bgHex), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ];
  } else if (src) {
    icons = [{ src, sizes: 'any', type: /\.svg(\?|$)/i.test(src) ? 'image/svg+xml' : 'image/png', purpose: 'any' }];
  } else {
    icons = [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }];
  }
  return {
    id: '/',
    name,
    short_name: name.length > 12 ? name.slice(0, 12).trim() : name,
    description: site?.tagline || site?.description || `Shop ${name}`,
    lang: 'en-ZA',
    dir: 'ltr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    categories: ['shopping'],
    background_color: bg,
    theme_color: bg,                     // matches the page (the navbar is the page colour), not the dark primary
    icons,
    shortcuts: [
      { name: 'Shop', url: '/shop' },
      { name: 'Cart', url: '/cart' },
    ],
  };
}

/** URL of the 180px Apple touch icon (solid background), or '' if there is no logo. */
async function appleTouchUrl(info, bg = '#ffffff') {
  const src = source(info);
  if (!src) return '';
  if (!isCloudinary(src)) return src;
  const t = await tonesFor(info, bg);
  return solidUrl(src, t.solid, 180, 0.8, hex6(bg, 'ffffff'));
}

module.exports = { appleTouchUrl, faviconIco, faviconSvg, headTags, manifest, buildIco, hexLum, hex6, tabUrl, solidUrl, TAB };
