'use strict';
// Unit tests for the pieces where a mistake costs money or trust. No database or network needed.
//   npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { yocoConfig, verifyYocoWebhook, createYocoCheckout, YocoError } = require('../src/services/yoco');
const { sanitizeEmailHtml } = require('../src/emails');
const { measure, toneFor, SURFACE } = require('../src/emailLogo');
const { mergeProductStock } = require('../src/stockMerge');
const icons = require('../src/brandIcon');

// ── Yoco webhook signatures ──────────────────────────────────────────────────
const secretBytes = Buffer.from('unit-test-webhook-secret-0123456789');
const SECRET = 'whsec_' + secretBytes.toString('base64');
function signed(body, { id = 'msg_1', ts = Math.floor(Date.now() / 1000), key = secretBytes } = {}) {
  const sig = crypto.createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');
  return { rawBody: Buffer.from(body), secret: SECRET, headers: { 'webhook-id': id, 'webhook-timestamp': String(ts), 'webhook-signature': `v1,${sig}` } };
}
const BODY = JSON.stringify({ id: 'evt', type: 'payment.succeeded', payload: { amount: 1000 } });

test('Yoco webhook: a correctly signed event is accepted', () => {
  const r = verifyYocoWebhook(signed(BODY));
  assert.equal(r.ok, true);
  assert.equal(r.event.type, 'payment.succeeded');
});
test('Yoco webhook: a wrong secret, tampered body, missing headers and no secret are all rejected', () => {
  assert.equal(verifyYocoWebhook(signed(BODY, { key: Buffer.from('attacker') })).reason, 'bad-signature');
  const t = signed(BODY); t.rawBody = Buffer.from(BODY.replace('1000', '1')); assert.equal(verifyYocoWebhook(t).reason, 'bad-signature');
  const m = signed(BODY); delete m.headers['webhook-signature']; assert.equal(verifyYocoWebhook(m).reason, 'missing-headers');
  assert.equal(verifyYocoWebhook({ ...signed(BODY), secret: '' }).reason, 'no-secret');
});
test('Yoco webhook: a replay outside the 3 minute window is rejected, one inside is accepted', () => {
  const now = Date.now();
  assert.equal(verifyYocoWebhook({ ...signed(BODY, { ts: Math.floor(now / 1000) - 600 }), now }).reason, 'stale');
  assert.equal(verifyYocoWebhook({ ...signed(BODY, { ts: Math.floor(now / 1000) - 60 }), now }).ok, true);
});
test('Yoco webhook: accepts when any one of several space-separated signatures matches', () => {
  const s = signed(BODY); s.headers['webhook-signature'] = `v1,AAAA ${s.headers['webhook-signature']} v2,BBBB`;
  assert.equal(verifyYocoWebhook(s).ok, true);
});
test('Yoco config refuses a key from the wrong mode and needs both key and webhook secret', () => {
  assert.equal(yocoConfig({ YOCO_SANDBOX: 'true', YOCO_SECRET_KEY_TEST: 'sk_live_x', YOCO_WEBHOOK_SECRET_TEST: SECRET }).configured, false);
  assert.equal(yocoConfig({ YOCO_SANDBOX: 'true', YOCO_SECRET_KEY_TEST: 'sk_test_x' }).configured, false);
  assert.equal(yocoConfig({ YOCO_SANDBOX: 'true', YOCO_SECRET_KEY_TEST: 'sk_test_x', YOCO_WEBHOOK_SECRET_TEST: SECRET }).configured, true);
});

// ── Yoco checkout creation ────────────────────────────────────────────────────
const cfg = { apiUrl: 'https://payments.example/api', secretKey: 'sk_test_x' };
const reply = (status, body) => async () => ({ ok: status < 400, status, json: async () => body });
test('Yoco checkout: success returns the checkout and sends the key + idempotency key', async () => {
  let seen;
  const out = await createYocoCheckout(cfg, { amount: 100, currency: 'ZAR' }, 'order-1', {
    fetchImpl: async (url, init) => { seen = { url, init }; return { ok: true, status: 200, json: async () => ({ id: 'ch_1', redirectUrl: 'https://pay.example/ch_1' }) }; },
  });
  assert.equal(out.id, 'ch_1');
  assert.equal(seen.url, 'https://payments.example/api/checkouts');
  assert.equal(seen.init.headers.Authorization, 'Bearer sk_test_x');
  assert.equal(seen.init.headers['Idempotency-Key'], 'order-1');
});
test('Yoco checkout: failures are typed (auth / request / network / bad response)', async () => {
  await assert.rejects(createYocoCheckout(cfg, {}, 'k', { fetchImpl: reply(403, { message: 'no' }) }), (e) => e instanceof YocoError && e.kind === 'auth');
  await assert.rejects(createYocoCheckout(cfg, {}, 'k', { fetchImpl: reply(422, { message: 'bad' }) }), (e) => e.kind === 'request');
  await assert.rejects(createYocoCheckout(cfg, {}, 'k', { fetchImpl: async () => { throw new Error('ECONNRESET'); } }), (e) => e.kind === 'network');
  await assert.rejects(createYocoCheckout(cfg, {}, 'k', { fetchImpl: reply(200, { id: 'x' }) }), (e) => e.kind === 'api'); // no redirect link
  await assert.rejects(createYocoCheckout(cfg, {}, 'k', { fetchImpl: reply(200, { id: 'x', redirectUrl: 'javascript:alert(1)' }) }), (e) => e.kind === 'api');
});

// ── Newsletter HTML sanitiser ─────────────────────────────────────────────────
test('sanitiser strips scripts, handlers, embeds and javascript: links, and absolutises relative links', () => {
  const dirty = '<p onclick="x()">Hi <a href="javascript:alert(1)">bad</a> <a href="/shop">shop</a></p><script>alert(1)</script><iframe src="https://evil"></iframe><img src="/a.png" onerror="y()"><style>p{}</style>';
  const clean = sanitizeEmailHtml(dirty, 'https://store.example/');
  assert.doesNotMatch(clean, /<script|<iframe|<style|onclick|onerror|javascript:/i);
  assert.match(clean, /href="https:\/\/store\.example\/shop"/);
  assert.match(clean, /src="https:\/\/store\.example\/a\.png"/);
});

// ── Logo tone decisions (email) ───────────────────────────────────────────────
const pixels = (rgb, opaque = 400, clear = 400) => { const b = Buffer.alloc((opaque + clear) * 4); for (let i = 0; i < opaque; i++) b.set([...rgb, 255], i * 4); return b; };
test('logo tone: black logo needs a white version on the dark card; white logo needs black on the white card', () => {
  const black = measure(pixels([17, 17, 17])), white = measure(pixels([255, 255, 255]));
  assert.equal(toneFor(black, SURFACE.light), 'asis');
  assert.equal(toneFor(black, SURFACE.dark), 'white');
  assert.equal(toneFor(white, SURFACE.light), 'black');
  assert.equal(toneFor(white, SURFACE.dark), 'asis');
});
test('logo tone: opaque logos and coloured logos that already contrast are left alone', () => {
  assert.equal(toneFor(measure(pixels([17, 17, 17], 400, 0)), SURFACE.dark), 'asis'); // solid background: never flatten
  assert.equal(toneFor(measure(pixels([255, 68, 0])), SURFACE.light), 'asis');
  assert.equal(toneFor(null, SURFACE.dark), 'asis');
});

// ── Admin stock edits merge with live sales ───────────────────────────────────
const V = (size, color, stock) => ({ size, color, stock });
test('stock merge: a restock applies to the LIVE number, keeping a sale made while the editor was open', () => {
  const base = { stock: 10, variants: [V('S', 'Black', 10)] };           // what the admin loaded
  const stored = { stock: 8, variants: [V('S', 'Black', 8)] };            // a customer bought 2 since
  const out = mergeProductStock(stored, { name: 'Tee', stock: 10, variants: [V('S', 'Black', 15)] }, base); // admin: restock to 15
  assert.equal(out.variants[0].stock, 13);                                // 8 live + 5 added, not 15
  assert.equal(out.stock, 13);
});
test('stock merge: editing something else never rolls stock back to the loaded value', () => {
  const base = { stock: 10, variants: [V('S', 'Black', 10)] };
  const stored = { stock: 8, variants: [V('S', 'Black', 8)] };
  const out = mergeProductStock(stored, { name: 'Renamed', stock: 10, variants: [V('S', 'Black', 10)] }, base);
  assert.equal(out.name, 'Renamed');
  assert.equal(out.variants[0].stock, 8);
});
test('stock merge: a deliberate reduction is applied as a difference too, and never goes below zero', () => {
  const base = { stock: 10, variants: [V('S', 'Black', 10)] };
  assert.equal(mergeProductStock({ stock: 8, variants: [V('S', 'Black', 8)] }, { stock: 0, variants: [V('S', 'Black', 6)] }, base).variants[0].stock, 4);
  assert.equal(mergeProductStock({ stock: 1, variants: [V('S', 'Black', 1)] }, { stock: 0, variants: [V('S', 'Black', 0)] }, base).variants[0].stock, 0);
});
test('stock merge: new variants take the typed value; variants added by someone else meanwhile are kept; totals add up', () => {
  const base = { stock: 5, variants: [V('S', 'Black', 5)] };
  const stored = { stock: 9, variants: [V('S', 'Black', 5), V('L', 'Black', 4)] }; // L was added elsewhere after the editor loaded
  const out = mergeProductStock(stored, { stock: 5, variants: [V('S', 'Black', 5), V('M', 'Black', 7)] }, base);
  const by = Object.fromEntries(out.variants.map(v => [v.size, v.stock]));
  assert.deepEqual(by, { S: 5, M: 7, L: 4 });
  assert.equal(out.stock, 16);
});
test('stock merge: products without variants, and old clients with no baseline', () => {
  assert.equal(mergeProductStock({ stock: 8 }, { stock: 15 }, { stock: 10 }).stock, 13);
  assert.equal(mergeProductStock({ stock: 8 }, { stock: 15 }, null).stock, 15);   // no baseline: the typed value wins
});

// ── Favicon / app icons / manifest ────────────────────────────────────────────
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
test('ico: a valid multi-size container with the PNGs at the offsets it declares', () => {
  const img = (n) => Buffer.concat([PNG_SIG, Buffer.alloc(n, 7)]);
  const ico = icons.buildIco([{ size: 16, data: img(10) }, { size: 32, data: img(20) }, { size: 48, data: img(30) }]);
  assert.equal(ico.readUInt16LE(2), 1);            // type: icon
  assert.equal(ico.readUInt16LE(4), 3);            // three images
  const sizes = [0, 1, 2].map(i => ico.readUInt8(6 + 16 * i));
  assert.deepEqual(sizes, [16, 32, 48]);
  for (let i = 0; i < 3; i++) {
    const len = ico.readUInt32LE(6 + 16 * i + 8), off = ico.readUInt32LE(6 + 16 * i + 12);
    assert.equal(ico.subarray(off, off + 8).equals(PNG_SIG), true);
    assert.equal(len, 8 + [10, 20, 30][i]);
  }
});
test('colours: hex normalising and luminance', () => {
  assert.equal(icons.hex6('#fff', '000000'), 'ffffff');
  assert.equal(icons.hex6('nope', 'abcdef'), 'abcdef');
  assert.ok(icons.hexLum('#ffffff') > 0.99 && icons.hexLum('#000000') < 0.001);
});
test('icon urls: transparent padded tab icons vs solid maskable-safe app icons (Cloudinary only)', () => {
  const src = 'https://res.cloudinary.com/demo/image/upload/v1/logo.png';
  assert.match(icons.tabUrl(src, 'asis', 32), /\/upload\/c_pad,w_32,h_32,f_png,q_auto\/v1/);
  assert.match(icons.tabUrl(src, 'white', 32), /e_colorize:100,co_rgb:ffffff\/c_pad,w_32/);
  assert.match(icons.solidUrl(src, 'asis', 512, 0.6, 'f8f5f2'), /c_fit,w_307,h_307\/c_pad,w_512,h_512,b_rgb:f8f5f2/);
  assert.equal(icons.tabUrl('/uploads/logo.png', 'white', 32), '/uploads/logo.png');   // not on Cloudinary: used as it is
});
test('manifest: page-coloured theme, usable name, shortcuts, and a fallback icon with no logo', async () => {
  const m = await icons.manifest({ name: 'The Very Long Store Name', colors: { background: '#f8f5f2', primary: '#111111' }, tagline: 'Streetwear' });
  assert.equal(m.theme_color, '#f8f5f2');          // the page colour, not the dark primary
  assert.equal(m.background_color, '#f8f5f2');
  assert.ok(m.short_name.length <= 12);
  assert.equal(m.description, 'Streetwear');
  assert.equal(m.shortcuts.length, 2);
  assert.equal(m.icons[0].src, '/favicon.svg');
  const empty = await icons.manifest({});
  assert.equal(empty.theme_color, '#ffffff');      // never an invalid colour
});
test('favicon svg without a logo: a monogram that flips for dark tabs', async () => {
  const svg = await icons.faviconSvg({ name: 'Others.', bg: '#f8f5f2', fg: '#211c1a' });
  assert.match(svg, /prefers-color-scheme:dark/);
  assert.match(svg, />O<\/text>/);
});
test('head tags: store uses its own palette, admin gets light + dark browser-bar colours', async () => {
  const store = await icons.headTags({ name: 'Others.' }, { bg: '#111111' });
  assert.match(store, /theme-color" content="#111111"/);
  assert.match(store, /color-scheme" content="dark"/);        // a dark palette → dark form controls and scrollbars
  assert.match(store, /rel="manifest" href="\/manifest\.webmanifest"/);
  const admin = await icons.headTags({ name: 'Others.' }, { admin: true, bg: '#fafafa' });
  assert.match(admin, /prefers-color-scheme: dark/);
  assert.match(admin, /color-scheme" content="light dark"/);
});

test('app icon tile: always a colour the logo contrasts with, so the icon is never blank', () => {
  const store = ['f8f5f2', '211c1a'];                                    // cream page, dark text
  const white = { hasAlpha: true, lum: 1 }, black = { hasAlpha: true, lum: 0.01 }, orange = { hasAlpha: true, lum: 0.25 };
  assert.equal(icons.chooseTile(white, store).bg, '211c1a');             // white logo -> the dark tile, NOT cream (the blank iOS icon)
  assert.equal(icons.chooseTile(black, store).bg, 'f8f5f2');             // dark logo -> the page colour
  assert.equal(icons.chooseTile(orange, store).bg, 'f8f5f2');
  assert.equal(icons.chooseTile(white, store).tone, 'asis');             // the logo keeps its own colours
  assert.equal(icons.chooseTile(white, ['18181b', 'fafafa']).bg, '18181b'); // admin tile: dark zinc, white logo as it is
  assert.equal(icons.chooseTile(black, ['18181b', 'fafafa']).bg, 'fafafa'); // ...and a dark logo falls to the light one
  assert.equal(icons.chooseTile({ hasAlpha: false, lum: 1 }, store).bg, 'f8f5f2'); // logos with their own background are not second-guessed
  const unknown = icons.chooseTile(null, store);                         // analysis failed: a neutral tile that shows black AND white
  assert.equal(unknown.bg, icons.UNKNOWN_TILE);
  assert.ok(icons.hexLum('#' + unknown.bg) > 0.12 && icons.hexLum('#' + unknown.bg) < 0.3);
});
test('store and admin are separate web apps', async () => {
  const store = await icons.manifest({ name: 'Others.', colors: { background: '#f8f5f2' } });
  const admin = await icons.adminManifest({ name: 'Others.', colors: { background: '#f8f5f2' } });
  assert.deepEqual([store.id, store.scope, store.start_url], ['/', '/', '/']);
  assert.deepEqual([admin.id, admin.scope, admin.start_url], ['/admin/', '/admin/', '/admin/']);
  assert.notEqual(store.name, admin.name);
  assert.match(admin.name, /Admin$/);
  assert.ok(admin.short_name.length <= 12);
  assert.ok(admin.shortcuts.every(s => s.url.startsWith('/admin/')));
  assert.ok(store.shortcuts.every(s => !s.url.startsWith('/admin')));
  const tags = await icons.headTags({ name: 'Others.' }, { admin: true, bg: '#fafafa' });
  assert.match(tags, /href="\/admin\.webmanifest"/);
  assert.match(tags, /apple-mobile-web-app-title" content="Others\. Admin"/);
});

const video = require('../src/videoPipeline');
test('video: reads size, fps, rotation, HDR and audio from ffmpeg output', () => {
  const info = video.parseInfo([
    'Input #0, mov,mp4, from \'a.mov\':',
    '  Duration: 00:01:05.50, start: 0.000000, bitrate: 41233 kb/s',
    '  Stream #0:0[0x1](und): Video: hevc (Main 10), yuv420p10le(tv, bt2020nc/bt2020/smpte2084), 3840x2160, 41000 kb/s, 59.94 fps, 59.94 tbr',
    '  Stream #0:1[0x2](und): Audio: aac (LC), 48000 Hz, stereo, fltp, 128 kb/s',
  ].join('\n'));
  assert.equal(info.seconds, 65.5);
  assert.deepEqual([info.video.width, info.video.height, info.video.fps, info.video.hdr, info.audio], [3840, 2160, 59.94, true, 'aac']);
  assert.equal(video.parseInfo('Input #0\n  Duration: N/A\n  Stream #0:0: Audio: mp3, 44100 Hz'), null); // audio only: not a video
  const phone = video.parseInfo('  Duration: 00:00:10.00, bitrate: 9000 kb/s\n  Stream #0:0: Video: h264 (High), yuv420p, 1920x1080, 8900 kb/s, 30 fps\n    displaymatrix: rotation of -90.00 degrees');
  assert.deepEqual([phone.video.width, phone.video.height], [1080, 1920]); // a sideways file is a portrait video
});
test('video: output is fitted into 1080p, never upscaled, always even', () => {
  assert.deepEqual(video.outputSize(3840, 2160), { width: 1920, height: 1080, short: 1080 });
  assert.deepEqual(video.outputSize(2160, 3840), { width: 1080, height: 1920, short: 1080 });
  const small = video.outputSize(641, 359);
  assert.deepEqual([small.width, small.height], [642, 360]);              // small stays small (odd sizes rounded up to even)
  assert.ok(video.outputSize(1234, 777).width % 2 === 0 && video.outputSize(1234, 777).height % 2 === 0);
});
test('video: bitrate ceilings shrink with the picture, slow presets only for short clips', () => {
  assert.ok(video.tierFor(1080).maxKbps > video.tierFor(720).maxKbps && video.tierFor(720).maxKbps > video.tierFor(360).maxKbps);
  assert.deepEqual([60, 200, 600, 3000].map(video.presetFor), ['slow', 'medium', 'fast', 'veryfast']);
});
test('video: ffmpeg arguments are web-safe (H.264 High, yuv420p, faststart, no metadata, 30 fps cap)', () => {
  const info = { seconds: 20, bitrateKbps: 40000, video: { codec: 'h264', width: 3840, height: 2160, fps: 60, hdr: false }, audio: 'aac' };
  const a = video.buildArgs(info, { input: 'in.mp4', output: 'out.mp4', audio: 'keep', tonemap: false }).args.join(' ');
  for (const need of ['libx264', '-profile:v high', '-movflags +faststart', '-map_metadata -1', 'yuv420p', 'fps=30', '-c:a aac']) assert.ok(a.includes(need), 'missing ' + need);
  const mute = video.buildArgs(info, { input: 'in.mp4', output: 'out.mp4', audio: 'strip', tonemap: false }).args;
  assert.ok(mute.includes('-an') && !mute.join(' ').includes('-c:a'));
  const hdr = video.buildArgs({ ...info, video: { ...info.video, hdr: true } }, { input: 'in.mp4', output: 'out.mp4', audio: 'keep', tonemap: true }).args.join(' ');
  assert.ok(hdr.includes('tonemap=') && hdr.includes('bt709'));
});

test('lookbook: the cover is the uploaded one, else the first image in the media, else a video still', async () => {
  const { lookbookCover, itemKind } = await import('../src/lib/lookbook.js');
  const img = (url) => ({ type: 'image', url });
  const vid = 'https://res.cloudinary.com/demo/video/upload/v1/others-store/clip.mp4';
  assert.equal(lookbookCover({ coverImage: 'c.jpg', items: [img('a.jpg')] }), 'c.jpg');
  assert.equal(lookbookCover({ coverImage: '', items: [img('a.jpg'), img('b.jpg')] }), 'a.jpg');               // '' counts as "no cover"
  assert.equal(lookbookCover({ items: [{ type: 'video', url: vid }, img('b.jpg')] }), 'b.jpg');               // first IMAGE, not first item
  assert.match(lookbookCover({ items: [{ type: 'video', url: vid }] }), /\/so_0,w_960\/.*clip\.jpg$|f_jpg.*clip\.jpg$/); // only videos: a still from the first one
  assert.equal(lookbookCover({ images: ['old.jpg'] }), 'old.jpg');                                            // lookbooks from before items existed
  assert.equal(lookbookCover({ items: [] }), '');
  assert.equal(itemKind({ url: 'x.mp4' }), 'video');
  assert.equal(itemKind({ type: 'image', url: 'https://youtu.be/abcdefghijk' }), 'embed');
});
test('lookbook: media keeps its own shape, whether it is vertical or wide', async () => {
  const { layoutRatio, describeShape, RATIO_MIN, RATIO_MAX } = await import('../src/lib/lookbook.js');
  assert.ok(Math.abs(layoutRatio({ type: 'video', url: 'a.mp4', width: 1080, height: 1920 }) - 9 / 16) < 1e-9);
  assert.ok(Math.abs(layoutRatio({ type: 'image', url: 'a.jpg', width: 1600, height: 900 }) - 16 / 9) < 1e-9);
  assert.equal(layoutRatio({ type: 'image', url: 'a.jpg', width: 3000, height: 100 }), RATIO_MAX);            // absurd shapes are limited
  assert.equal(layoutRatio({ type: 'image', url: 'a.jpg', width: 100, height: 3000 }), RATIO_MIN);
  assert.equal(layoutRatio({ type: 'image', url: 'a.jpg' }), 4 / 5);                                          // unknown size: a sensible guess…
  assert.equal(layoutRatio({ type: 'image', url: 'a.jpg' }, 1.5), 1.5);                                       // …replaced by what the browser measured
  assert.deepEqual(describeShape(1080, 1920), { shape: 'Vertical', label: '9:16' });
  assert.deepEqual(describeShape(1600, 900), { shape: 'Horizontal', label: '16:9' });
  assert.deepEqual(describeShape(1000, 1000), { shape: 'Square', label: '1:1' });
  assert.equal(describeShape(0, 0), null);
});
