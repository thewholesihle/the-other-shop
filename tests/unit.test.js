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
