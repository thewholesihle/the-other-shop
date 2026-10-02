// Yoco Checkout API — https://developer.yoco.com/docs/checkout-api
//
// Flow: the server creates a hosted checkout (POST /checkouts, amount in cents, ZAR), the customer
// is redirected to its `redirectUrl`, and the outcome is confirmed by a SIGNED WEBHOOK — never by the
// success redirect, which anyone can visit. Secret keys never leave the server.
//
// Configuration (environment, same style as PayFast):
//   YOCO_SANDBOX=true                 → use the test keys below ("live" otherwise)
//   YOCO_SECRET_KEY_TEST / _LIVE      → Checkout API secret key
//   YOCO_WEBHOOK_SECRET_TEST / _LIVE  → the `whsec_…` secret returned when the webhook was registered
//   YOCO_API_URL                      → override for the API base (tests only)
'use strict';
const crypto = require('node:crypto');

function yocoConfig(env = process.env) {
  const sandbox = env.YOCO_SANDBOX === 'true';
  const pick = (name) => (env[`${name}_${sandbox ? 'TEST' : 'LIVE'}`] || '').trim();
  const secretKey = pick('YOCO_SECRET_KEY');
  const webhookSecret = pick('YOCO_WEBHOOK_SECRET');
  // A live key in test mode (or vice versa) is always a mistake — refuse rather than charge real cards by accident.
  const wrongMode = sandbox ? /^sk_live/i.test(secretKey) : /^sk_test/i.test(secretKey);
  return {
    sandbox,
    mode: sandbox ? 'test' : 'live',
    secretKey,
    webhookSecret,
    apiUrl: (env.YOCO_API_URL || 'https://payments.yoco.com/api').replace(/\/+$/, ''),
    keyMismatch: Boolean(secretKey) && wrongMode,
    // Usable for taking payments: a key of the right mode AND a webhook secret to confirm payments with.
    configured: Boolean(secretKey) && !wrongMode && Boolean(webhookSecret),
  };
}

class YocoError extends Error {
  constructor(message, { status = 0, detail = null, kind = 'api' } = {}) {
    super(message);
    this.name = 'YocoError';
    this.status = status;
    this.detail = detail;
    this.kind = kind; // 'auth' | 'request' | 'network' | 'api'
  }
}

/** Creates a hosted checkout. Throws YocoError; resolves to Yoco's checkout object. */
async function createYocoCheckout(cfg, payload, idempotencyKey, { timeoutMs = 15000, fetchImpl = fetch } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl(`${cfg.apiUrl}/checkouts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.secretKey}`,
        'Content-Type': 'application/json',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
  } catch (err) {
    throw new YocoError(err.name === 'AbortError' ? 'Yoco did not respond in time.' : `Could not reach Yoco: ${err.message}`, { kind: 'network' });
  } finally {
    clearTimeout(timer);
  }

  let body = null;
  try { body = await res.json(); } catch { /* non-JSON error page */ }

  if (!res.ok) {
    const detail = body ? { message: body.message, reason: body.reason, solution: body.solution } : null;
    const why = detail?.message || detail?.reason || `HTTP ${res.status}`;
    const kind = res.status === 401 || res.status === 403 ? 'auth' : res.status >= 400 && res.status < 500 ? 'request' : 'api';
    throw new YocoError(`Yoco rejected the checkout (${res.status}): ${why}`, { status: res.status, detail, kind });
  }
  if (!body?.id || typeof body.redirectUrl !== 'string' || !/^https:\/\//i.test(body.redirectUrl) && !/^http:\/\/(localhost|127\.0\.0\.1)/i.test(body.redirectUrl)) {
    throw new YocoError('Yoco returned an unexpected response (no checkout link).', { status: res.status, kind: 'api' });
  }
  return body;
}

/**
 * Verifies a webhook per https://developer.yoco.com/guides/online-payments/webhooks/verifying-the-events
 *   signed content = `${webhook-id}.${webhook-timestamp}.${raw body}`
 *   secret         = base64-decode(whsec_… without its prefix)
 *   signature      = base64(HMAC-SHA256(secret, signed content)), header holds space-separated `v1,<sig>` entries
 * The timestamp must be within `toleranceSec` (Yoco recommends 3 minutes) to stop replays.
 * Returns { ok: true, event } or { ok: false, reason }.
 */
function verifyYocoWebhook({ rawBody, headers, secret, toleranceSec = 180, now = Date.now() }) {
  if (!secret) return { ok: false, reason: 'no-secret' };
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) return { ok: false, reason: 'no-body' };

  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const signatureHeader = headers['webhook-signature'];
  if (!id || !timestamp || !signatureHeader) return { ok: false, reason: 'missing-headers' };

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > toleranceSec) return { ok: false, reason: 'stale' };

  const key = Buffer.from(String(secret).replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.`).update(rawBody).digest();

  let matched = false;
  for (const entry of String(signatureHeader).split(' ')) {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) continue;
    const got = Buffer.from(sig, 'base64');
    // Always compare (no early exit) so timing reveals nothing about which entry matched.
    if (got.length === expected.length && crypto.timingSafeEqual(got, expected)) matched = true;
  }
  if (!matched) return { ok: false, reason: 'bad-signature' };

  let event;
  try { event = JSON.parse(rawBody.toString('utf8')); } catch { return { ok: false, reason: 'bad-json' }; }
  if (!event || typeof event !== 'object') return { ok: false, reason: 'bad-json' };
  return { ok: true, event, id };
}

module.exports = { yocoConfig, YocoError, createYocoCheckout, verifyYocoWebhook };
