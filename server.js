'use strict';
require('dotenv').config();

const express  = require('express');
const path     = require('path');
const fs       = require('fs');
const multer   = require('multer');
const md5      = require('md5');
const morgan   = require('morgan');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { connect, getIsConnected } = require('./src/db/connection');
const { Settings, Category, Product, Order, Lookbook, Article, Pages, Subscriber, Log, LogBackup, Event } = require('./src/db/models');
const zlib = require('zlib');
const compression = require('compression');
const { parseUserAgent } = require('./src/device');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const auth = require('./src/auth');
const { yocoConfig, YocoError, createYocoCheckout, verifyYocoWebhook } = require('./src/services/yoco');
const { renderEmail, sanitizeEmailHtml } = require('./src/emails');
const { emailLogoVariants } = require('./src/emailLogo');

const app  = express();
const port = process.env.PORT || 3000;

// Add HTTP request logging
app.use(morgan('dev'));

// gzip/deflate every compressible response (HTML, JS, CSS, JSON). The SSE stream opts out
// by sending `Cache-Control: no-transform`.
app.use(compression());

// Trust the edge proxy (Fly.io, Heroku, etc) so req.protocol properly detects HTTPS
app.set('trust proxy', 1);

// ─── Security Middleware ──────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // Disabled to avoid breaking Cloudinary/External fonts for now
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// ─── Rate Limiting ────────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // 300 requests per IP — plenty for normal admin panel polling (~45/15min)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const checkoutLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 checkouts per hour per IP
  message: { error: 'Too many checkouts. Please wait an hour.' }
});

// Sign-in is the one endpoint worth brute-forcing, so it gets its own tight limit:
// 8 failed attempts per 15 minutes per IP (successful sign-ins don't count).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logAuth('warn', 'Admin sign-in rate limit reached', req, 'lockout');
    notifyAdminOfError(new Error('Repeated failed admin sign-ins'), req,
      `Someone using ${deviceInfo(req).device} (IP ${req.ip}) used up the admin sign-in attempt limit. If that wasn't you, consider changing your admin password.`).catch(() => {});
    res.status(429).json({ error: 'Too many sign-in attempts. Try again in 15 minutes.' });
  },
});

app.use('/api/checkout', checkoutLimiter);
app.use('/api/', apiLimiter);

// ─── CSRF Guard ───────────────────────────────────────────────────────────────
// Defence in depth for the admin session: its cookie is SameSite=Strict, every
// mutating admin call must also carry the session's X-CSRF-Token (see src/auth.js),
// and — here — any browser-originated mutation from another origin is rejected.
// Requests with no Origin/Referer at all (e.g. PayFast's server-to-server ITN
// webhook) are left alone since they're not coming from a browser tab.
function verifySameOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  // PayFast's ITN webhook is a server-to-server POST from PayFast's own infrastructure,
  // not a browser tab — "same origin" doesn't apply to it, and there's no guarantee
  // it sends no Origin/Referer at all (assuming so previously broke payment
  // confirmation — PayFast's notifier apparently does send one, so every ITN got
  // rejected here before ever reaching the handler that marks orders paid, leaving
  // them stuck on pending_payment). It's independently verified via IP allowlist,
  // signature check, and a server-to-server confirmation call back to PayFast —
  // exempt it explicitly instead of guessing at header behavior.
  if (req.path === '/api/payfast/itn') return next();
  // Yoco's webhook is likewise server-to-server; it is authenticated by its HMAC signature instead.
  if (req.path === '/api/yoco/webhook') return next();
  // RFC 8058 one-click unsubscribe: mailbox providers (Gmail/Yahoo/etc.) POST this
  // endpoint directly from the List-Unsubscribe-Post header, server-to-server, with
  // no Origin/Referer guarantee — same reasoning as the ITN exemption above.
  if (req.path === '/api/newsletter/unsubscribe') return next();
  const origin = req.headers.origin || req.headers.referer;
  if (!origin) return next();
  try {
    if (new URL(origin).host !== req.get('host')) {
      return res.status(403).json({ error: 'Cross-origin request blocked.' });
    }
  } catch {
    // Malformed header — fall through rather than false-positive block a real request.
  }
  next();
}
app.use(verifySameOrigin);

// ─── Admin Auth ───────────────────────────────────────────────────────────────
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;

if (!ADMIN_USER || !(ADMIN_PASS || process.env.ADMIN_PASS_HASH)) {
  console.error('FATAL: ADMIN_USER and either ADMIN_PASS_HASH (recommended) or ADMIN_PASS must be set in .env');
  process.exit(1);
}
if (!process.env.ADMIN_PASS_HASH && ADMIN_PASS.length < 12) {
  console.warn('WARNING: ADMIN_PASS is shorter than 12 characters. Use a long passphrase, or set ADMIN_PASS_HASH (see scripts/hash-password.js).');
}
if (!auth.totpEnabled()) {
  console.warn('NOTE: Two-factor sign-in is OFF. Run `node scripts/totp-secret.js` and set ADMIN_TOTP_SECRET to enable it.');
}

// Admin pages and admin API responses: strict CSP (scripts only from this site), no framing, no indexing, never cached. The public storefront keeps
// its existing, looser headers.
app.use((req, res, next) => {
  if (req.path === '/admin' || req.path.startsWith('/admin/') || req.path.startsWith('/api/admin')) {
    res.set({
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: blob: https:",
        "media-src 'self' https:",
        "connect-src 'self'",
        "frame-src https://www.youtube.com https://player.vimeo.com",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ].join('; '),
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store',
    });
  }
  next();
});

// ─── System Failsafe (Hard Maintenance) ───────────────────────────────────────
const hardMaintenanceHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Others. — Maintenance</title>
    <style>
        body { margin: 0; background: #000; color: #fff; height: 100vh; display: flex; align-items: center; justify-content: center; text-align: center; font-family: sans-serif; }
        h1 { font-family: serif; font-size: 3rem; letter-spacing: 0.2em; margin-bottom: 1.5rem; }
        p { color: #666; max-width: 400px; line-height: 1.6; font-size: 0.9rem; }
    </style>
</head>
<body>
    <div>
        <h1>OTHERS.</h1>
        <p>Our store is currently undergoing urgent technical maintenance. We apologize for the inconvenience and will be back shortly.</p>
    </div>
</body>
</html>
`;

app.use((req, res, next) => {
  // If DB is down, intercept public routes
  // Bypass if: Admin route OR API route OR static asset
  const isAsset = /\.(js|css|png|jpg|jpeg|gif|svg|webp|ico|json|woff2?|ttf|otf|mp4|webm|map)$/i.test(req.path);
  const isAdmin = req.path.startsWith('/admin') || req.path.startsWith('/api/admin');
  const isApi = req.path.startsWith('/api/');

  if (!getIsConnected() && !isAdmin && !isApi && !isAsset) {
    return res.status(503).send(hardMaintenanceHTML);
  }
  next();
});

/** True if the request carries a live admin session. */
const hasValidAdminAuth = (req) => Boolean(auth.getSession(req));

/** Guards every admin-only API route: live session + (for writes) the CSRF token. */
const requireAdmin = auth.requireAdmin;

/** What we can tell about the device behind a request: IP plus a readable browser / OS / type. */
function deviceInfo(req) {
  const ua = String(req?.headers?.['user-agent'] || '');
  const d = parseUserAgent(ua);
  return {
    ip: req?.ip,
    device: d.label, browser: d.browser, os: d.os, deviceType: d.type,
    language: String(req?.headers?.['accept-language'] || '').split(',')[0].slice(0, 20),
    ua: ua.slice(0, 300),
  };
}

/** Persists an auth event to the admin-visible system log (best effort), tagged with the
 *  device it came from. `event` is a machine-readable kind (signin, signin-failed, ...). */
function logAuth(type, message, req, event = '', extra = {}) {
  const info = deviceInfo(req);
  const full = `${message} — ${info.device} · ${info.ip}`;
  console.log(`[Auth] ${full}`);
  if (mongoose.connection.readyState !== 1) return;
  Log.create({
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type, message, context: 'AUTH', // device + IP live in `data` and are shown beside the entry
    data: { event, ...info, ...extra },
  }).catch(() => {});
}

/** Writes a log row only when the DB is up. With Mongoose's default buffering, a log write
 * against a down database would stall for ~10s — and the PayFast ITN handler must not stall:
 * its offline path is what emails the admin about a payment the DB couldn't record. */
function dbLog(entry) {
  if (mongoose.connection.readyState !== 1) return Promise.resolve();
  return Log.create(entry).catch(() => {});
}

// ─── Realtime admin events (Server-Sent Events) ──────────────────────────────
// The admin panel keeps one SSE connection open so new orders and status changes
// appear the moment they happen, instead of on the next poll.
const adminEvents = new EventEmitter();
adminEvents.setMaxListeners(50);
function emitOrderEvent(action, order) {
  adminEvents.emit('evt', {
    type: 'order', action, at: Date.now(),
    id: order?.id, customer: order?.customer, total: order?.total, status: order?.status,
  });
}

// ─── PayFast Config ───────────────────────────────────────────────────────────
const isSandbox = process.env.PAYFAST_SANDBOX === 'true';

const PF = {
  merchantId:  (isSandbox ? process.env.PAYFAST_MERCHANT_ID_SANDBOX : process.env.PAYFAST_MERCHANT_ID_LIVE) || '',
  merchantKey: (isSandbox ? process.env.PAYFAST_MERCHANT_KEY_SANDBOX : process.env.PAYFAST_MERCHANT_KEY_LIVE) || '',
  passphrase:  (isSandbox ? process.env.PAYFAST_PASSPHRASE_SANDBOX : process.env.PAYFAST_PASSPHRASE_LIVE) || '',
  sandbox:     isSandbox,
};

// Simple visual indicator of active payment mode
console.log(`PayFast mode   → ${PF.sandbox ? 'SANDBOX' : 'LIVE'}`);

const PF_CONFIGURED = Boolean(PF.merchantId && PF.merchantKey);
if (!PF_CONFIGURED) {
  console.warn(`NOTE: PayFast is not configured (set PAYFAST_MERCHANT_ID_${PF.sandbox ? 'SANDBOX' : 'LIVE'} and PAYFAST_MERCHANT_KEY_${PF.sandbox ? 'SANDBOX' : 'LIVE'}). It will not be offered at checkout.`);
}
const PF_HOST = PF.sandbox
  ? 'https://sandbox.payfast.co.za/eng/process'
  : 'https://www.payfast.co.za/eng/process';

// ─── Yoco Config ──────────────────────────────────────────────────────────────
const YOCO = yocoConfig();
console.log(`Yoco mode      → ${YOCO.mode.toUpperCase()}${YOCO.configured ? '' : ' (not configured)'}`);
if (YOCO.keyMismatch) {
  console.error(`Yoco: YOCO_SECRET_KEY_${YOCO.sandbox ? 'TEST' : 'LIVE'} looks like a ${YOCO.sandbox ? 'live' : 'test'} key. Yoco is disabled until the key matches YOCO_SANDBOX.`);
}

// ─── Payment methods ─────────────────────────────────────────────────────────
// A method is offered only when the admin has switched it on (Settings → Payments) AND the server
// has its credentials. Everything that takes money checks this, not just the UI.
const PAYMENT_METHODS = {
  payfast: { label: 'PayFast', description: 'Cards, Instant EFT and more', configured: () => PF_CONFIGURED },
  yoco:    { label: 'Yoco',    description: 'Pay by card',                  configured: () => YOCO.configured },
};
async function paymentToggles() {
  let p = {};
  try { p = (await Settings.findOne({ _id: 'main' }).select('payments').maxTimeMS(3000).lean())?.payments || {}; } catch { /* defaults */ }
  return { payfast: p.payfast?.enabled !== false, yoco: p.yoco?.enabled === true };
}
async function availablePaymentMethods() {
  const on = await paymentToggles();
  return Object.keys(PAYMENT_METHODS).filter(id => on[id] && PAYMENT_METHODS[id].configured());
}
if (!PF_CONFIGURED && !YOCO.configured) console.warn('WARNING: no payment method is configured — checkout will be unavailable.');

// ─── Email Notifier ──────────────────────────────────────────────────────────
// Raw SMTP sockets kept failing on Render — first IPv6 routes with no egress
// (ENETUNREACH), then, even pinned to a resolved IPv4 address, silent TCP
// timeouts (ETIMEDOUT) — consistent with the platform or the mail provider
// blocking outbound SMTP connections outright. Sending over Resend's HTTPS API
// sidesteps that entirely: it's the same kind of outbound HTTPS call the app
// already makes successfully to Cloudinary and PayFast.
const RESEND_API_URL = process.env.RESEND_API_URL || 'https://api.resend.com/emails';
const EMAIL_FROM = process.env.SMTP_FROM || 'onboarding@resend.dev';

async function sendEmail({ from, to, subject, html, text, replyTo, headers, attachments }) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not set');
  }
  const payload = { from, to: Array.isArray(to) ? to : [to], subject, html };
  // `text` gives every send a multipart/alternative plain-text part — better spam-filter
  // scoring and the only thing some accessibility/text-only clients render at all.
  if (text) payload.text = text;
  // Customer/marketing mail goes out "from" a no-reply sandbox address (see EMAIL_FROM);
  // reply-to points hit-reply at an inbox someone actually reads instead of bouncing.
  if (replyTo) payload.reply_to = replyTo;
  // Used for List-Unsubscribe / List-Unsubscribe-Post on marketing sends (RFC 8058).
  if (headers) payload.headers = headers;
  // [{ filename, content: <base64 string> }]
  if (attachments?.length) payload.attachments = attachments;
  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Resend API error: ${res.status}`);
  }
  return res.json();
}

/** First usable "reply to a human" address for a site — customer/marketing mail is
 * sent "from" a no-reply sandbox address (see EMAIL_FROM), so without this, hitting
 * reply on any customer-facing email goes nowhere. */
function primaryContactEmail(site) {
  const raw = site?.adminNotificationEmails || process.env.ADMIN_EMAIL || '';
  return raw.split(',').map(s => s.trim()).filter(Boolean)[0] || undefined;
}

// ─── Unsubscribe tokens ───────────────────────────────────────────────────────
// One-click unsubscribe links must not let anyone unsubscribe an arbitrary address
// just by guessing/editing the query string — sign each link with an HMAC so only
// a link this server actually generated (i.e. sent to that address) is honored.
function unsubscribeSecret() {
  // An admin credential is guaranteed set (the server exits at boot without one), so
  // there's no need for — and no safe — hardcoded fallback that an attacker could know.
  return process.env.UNSUBSCRIBE_SECRET || process.env.ADMIN_PASS_HASH || ADMIN_PASS;
}
function unsubscribeToken(email) {
  return crypto.createHmac('sha256', unsubscribeSecret()).update(String(email).toLowerCase().trim()).digest('hex').slice(0, 32);
}
function verifyUnsubscribeToken(email, token) {
  if (!email || !token) return false;
  const expected = Buffer.from(unsubscribeToken(email));
  const given = Buffer.from(String(token));
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

// ─── Shared Email Branding & Layout ──────────────────────────────────────────
/** Fetch site settings + the public contact address once, for building consistent email chrome. */
async function getEmailBranding() {
  if (mongoose.connection.readyState !== 1) return { site: null, contactAddress: '' };
  try {
    const [site, pages] = await Promise.all([
      Settings.findOne({ _id: 'main' }).maxTimeMS(1000).lean(),
      Pages.findOne({ _id: 'main' }).maxTimeMS(1000).lean(),
    ]);
    return { site, contactAddress: pages?.contact?.address || '' };
  } catch {
    return { site: null, contactAddress: '' };
  }
}

function formatDateLabel(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Cloudinary delivery URL for emails: capped size and a format every mail client renders
 * (no AVIF/WebP — Outlook and some webmail can't show them), so `f_auto` is not used here. */
function cldEmail(url, { w, h, png = false } = {}) {
  if (!url || typeof url !== 'string' || !url.includes('res.cloudinary.com') || !url.includes('/upload/')) return url;
  const t = h ? `c_fill,g_auto,h_${h},w_${w}` : `c_limit,w_${w}`;
  // Sources that can be transparent stay PNG — flattening them to JPG would put a black box behind them.
  const asPng = png || /\.(png|gif|svg)(\?|$)/i.test(url);
  return url.replace('/upload/', `/upload/${t},f_${asPng ? 'png' : 'jpg'},q_auto/`);
}

/** Everything the shared email chrome needs (logo, links, address). Logos go out as PNG/JPG at a capped size —
 *  Outlook and some webmail can't show AVIF/WebP — and always over an absolute https URL. */
async function emailBrand(site, contactAddress, baseUrl = '') {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  const abs = (u) => (u && u.startsWith('/') && base ? base + u : u);
  const logo = abs(site?.emailLogo || site?.logo);
  const socials = [['instagram', 'Instagram'], ['twitter', 'X'], ['tiktok', 'TikTok'], ['youtube', 'YouTube']]
    .filter(([k]) => site?.socials?.[k]?.trim()).map(([k, label]) => ({ label, href: site.socials[k].trim() }));
  // One image for the white card and one for the dark card (see src/emailLogo.js).
  const logos = logo ? await emailLogoVariants(logo) : null;
  return {
    name: site?.name || 'Others.',
    logoUrl: logos?.light || '',
    logoDarkUrl: logos?.dark || '',
    url: base,
    contactUrl: base ? `${base}/contact` : '',
    address: contactAddress || '',
    socials,
  };
}

// Automatic mail (alerts, summaries) is marked as such so auto-responders and out-of-office replies leave it alone.
const AUTO_HEADERS = { 'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'All' };

/** Renders a React Email template and sends it. If the templates can't render (e.g. they were never built),
 *  a plain-text fallback still goes out — a missed order alert is worse than an unstyled one. */
async function sendTemplate(name, props, mail, fallbackText = '') {
  let rendered;
  try {
    rendered = await renderEmail(name, props);
  } catch (err) {
    console.error(`[Mail] Template "${name}" failed to render: ${err.message}`);
    dbLog({ id: `log-${Date.now()}-tpl`, type: 'error', message: `Email template "${name}" failed to render: ${err.message}`, context: 'EMAIL', data: {} });
    const text = fallbackText || mail.subject;
    rendered = { text, html: `<pre style="font:14px/1.6 sans-serif;white-space:pre-wrap">${escapeHtmlAttr(text)}</pre>` };
  }
  return sendEmail({ ...mail, ...rendered });
}

/** Who gets admin emails: Settings → Emails & alerts when the DB is up, else ADMIN_EMAIL. */
async function getAdminRecipients() {
  const split = (v) => String(v || '').split(',').map(s => s.trim()).filter(Boolean);
  let recipients = split(process.env.ADMIN_EMAIL || 'othersworldwide@gmail.com');
  if (mongoose.connection.readyState === 1) {
    try {
      const site = await Settings.findOne({ _id: 'main' }).maxTimeMS(1000).lean();
      const fromSettings = split(site?.adminNotificationEmails);
      if (fromSettings.length) recipients = fromSettings;
    } catch (e) {
      console.error('Failed to fetch admin emails from DB (using defaults):', e.message);
    }
  }
  return recipients;
}

async function sendOrderNotification(order, baseUrl = '') {
  const recipients = await getAdminRecipients();

  // Never fail silently: a skipped notification is recorded where the admin can see it.
  if (recipients.length === 0 || !process.env.RESEND_API_KEY) {
    const why = !process.env.RESEND_API_KEY ? 'RESEND_API_KEY is not set' : 'no notification address configured';
    console.warn(`[Mail] Order #${order.id} notification skipped: ${why}`);
    if (mongoose.connection.readyState === 1) {
      Log.create({
        id: `log-${Date.now()}-adm-mail-skip`, type: 'warn',
        message: `Order notification NOT sent for #${order.id}: ${why}`, context: 'EMAIL', data: { orderId: order.id },
      }).catch(() => {});
    }
    return;
  }

  try {
    console.log(`[Mail] Sending order notification for #${order.id} to ${recipients.join(', ')}...`);

    const { site, contactAddress } = await getEmailBranding();
    const siteName = site?.name || 'Others.';
    const currency = site?.currency || 'R';

    const props = {
      brand: await emailBrand(site, contactAddress, baseUrl),
      currency,
      adminUrl: baseUrl ? `${baseUrl}/admin/orders` : '',
      order: {
        id: order.id, customer: order.customer, email: order.email, phone: order.phone, address: order.address,
        total: order.total, shippingCost: order.shippingCost || 0,
        paymentMethod: order.paymentMethod || (order.payfastId ? 'payfast' : ''),
        paymentRef: order.yocoPaymentId || order.payfastId || '',
        items: (order.items || []).map(i => ({ name: i.name, size: i.size, color: i.color, quantity: i.quantity, price: i.price, image: cldEmail(i.image, { w: 104, h: 104 }) })),
      },
    };
    await sendTemplate('OrderNotification', props, {
      from: `${siteName} Alerts <${EMAIL_FROM}>`,
      to: recipients,
      subject: `New order ${order.id} \u2014 ${currency}${order.total.toFixed(2)}`,
      headers: AUTO_HEADERS,
    }, `New order ${order.id} from ${order.customer || 'a customer'}: ${currency}${order.total.toFixed(2)}.\n\n${order.address || ''}\n\n${(order.items || []).map(i => `${i.quantity} x ${i.name} ${[i.size, i.color].filter(Boolean).join(' / ')}`).join('\n')}`);
    console.log(`[Email] Notification sent for order ${order.id}`);
  } catch (err) {
    console.error(`[Email] Failed to send invoice email: ${err.message} (code: ${err.code || 'n/a'})`);
    if (mongoose.connection.readyState === 1) {
      Log.create({
        id: `log-${Date.now()}-adm-mail-fail`, type: 'error',
        message: `Admin order email FAILED for #${order.id}: ${err.message}`, context: 'EMAIL', data: { orderId: order.id, recipients },
      }).catch(() => {});
    }
  }
}

// ─── Cloudinary Upload (━ replaces multer diskStorage) ────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (_req, file) => ({
    folder:         'others-store',
    resource_type:  file.mimetype.startsWith('video/') ? 'video' : 'image',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'webm'],
    // Images: cap the stored original at 2560px (phone/DSLR originals can be 6000px+ and
    // 10MB+) and let Cloudinary pick quality/format. Videos: pre-generate the two renditions the
    // storefront requests (see getVideoUrl in src/lib/cloudinary.js) in the background so the
    // first visitor doesn't wait for an on-demand transcode.
    transformation: file.mimetype.startsWith('image/')
      ? [{ width: 2560, height: 2560, crop: 'limit' }, { quality: 'auto', fetch_format: 'auto' }]
      : undefined,
    ...(file.mimetype.startsWith('video/') ? {
      eager: [1280, 1920].map(w => ({ width: w, crop: 'limit', quality: 'auto', fetch_format: 'auto' })),
      eager_async: true,
    } : {}),
  }),
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    const ok = /^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm))$/.test(file.mimetype);
    cb(ok ? null : new Error('Unsupported file type'), ok);
  },
});

// ─── Cloudinary Garbage Collector Helper ──────────────────────────────────────
const deleteCloudinaryAsset = async (url) => {
  if (!url || typeof url !== 'string' || !url.includes('res.cloudinary.com')) return;
  try {
    const parts = url.split('/');
    const folderIndex = parts.indexOf('others-store');
    if (folderIndex !== -1) {
      const publicIdWithExt = parts.slice(folderIndex).join('/');
      const publicId = publicIdWithExt.replace(/\.[^/.]+$/, "");
      const isVideo = url.match(/\.(mp4|webm)$/i);
      await cloudinary.uploader.destroy(publicId, { resource_type: isVideo ? 'video' : 'image' });
      console.log(`[Cloudinary] Deleted asset: ${publicId}`);
    }
  } catch (err) {
    console.warn(`[Cloudinary] Failed to delete asset: ${url}`, err.message);
  }
};

// ─── Middleware ───────────────────────────────────────────────────────────────
// The Yoco webhook is signed over the exact bytes it sent, so keep the raw body for that one route.
app.use(express.json({
  limit: '10mb',
  verify: (req, _res, buf) => { if (req.originalUrl.startsWith('/api/yoco/webhook')) req.rawBody = buf; },
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
// `index: false` — otherwise this would auto-serve the bare index.html for GET /
// before the SEO-meta-injecting route below ever gets a chance to run.
app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  etag: true,
  setHeaders(res, filePath) {
    // Pinned third-party libs never change under the same URL; the app bundle revalidates (ETag)
    // on each load so a deploy is picked up immediately.
    if (filePath.includes(`${path.sep}vendor${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    else if (/\.(?:js|css)$/.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  },
}));

// ─── Variant Stock Helpers ──────────────────────────────────────────────────
// Products track stock per size/color combination in `variants`; the top-level
// `stock` field is a denormalized total kept in sync so existing aggregate
// reads (dashboard alerts, sold-out badges) keep working unchanged.

function findVariant(product, size, color) {
  const s = size || '', c = color || '';
  return (product.variants || []).find(v => (v.size || '') === s && (v.color || '') === c);
}

/** Adjust a specific variant's stock (and the product's aggregate total) by delta. */
async function adjustVariantStock(query, size, color, delta) {
  const s = size || '', c = color || '';
  const result = await Product.updateOne(
    { ...query, variants: { $elemMatch: { size: s, color: c } } },
    { $inc: { 'variants.$[v].stock': delta, stock: delta } },
    { arrayFilters: [{ 'v.size': s, 'v.color': c }] }
  );
  if (result.matchedCount === 0) {
    // Legacy product with no matching variant — just adjust the aggregate so we don't lose the count.
    await Product.updateOne(query, { $inc: { stock: delta } });
  }
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

/** Assemble the full store data shape expected by the frontend */
async function readData() {
  const [site, categories, products, orders, lookbooks, community, pages, subscribers, events] = await Promise.all([
    Settings.findOne({ _id: 'main' }).lean(),
    Category.find().lean(),
    Product.find().lean(),
    Order.find().sort({ createdAt: -1 }).lean(),
    Lookbook.find().lean(),
    Article.find().lean(),
    Pages.findOne({ _id: 'main' }).lean(),
    Subscriber.find().sort({ date: -1 }).lean(),
    Event.find().sort({ date: 1, startTime: 1 }).lean(),
  ]);

  return {
    site:        site        || {},
    categories:  categories  || [],
    products:    products    || [],
    orders:      orders      || [],
    lookbooks:   lookbooks   || [],
    events:      events      || [],
    community:   community   || [],
    pages:       pages       || { shipping: { content: '' }, faq: { items: [] }, contact: { address: '', details: [] } },
    subscribers: subscribers || [],
  };
}

/** Persist a full data blob (from admin save) back to MongoDB */
async function writeData(blob) {
  const ops = [];

  if (blob.site) {
    ops.push(Settings.findOneAndUpdate(
      { _id: 'main' }, { $set: blob.site },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    ));
  }

  if (blob.categories) {
    // The admin UI "deletes" a category by omitting it from this array, but a plain
    // upsert of what's present never removes what's missing — the category kept
    // reappearing after reload, and products that referenced it were left pointing
    // at a dangling id. Diff against what's currently stored so a removal actually
    // deletes the category and reassigns its products to "uncategorized".
    const existingCategoryIds = (await Category.find().select('id').lean()).map(c => c.id);
    const keptIds = new Set(blob.categories.map(c => c.id));
    const removedIds = existingCategoryIds.filter(id => !keptIds.has(id));

    ops.push(...blob.categories.map(c =>
      Category.findOneAndUpdate({ id: c.id }, { $set: c }, { upsert: true })
    ));

    if (removedIds.length) {
      ops.push(Category.deleteMany({ id: { $in: removedIds } }));
      ops.push(Product.updateMany({ category: { $in: removedIds } }, { $set: { category: '' } }));
    }
  }

  if (blob.products) {
    ops.push(...blob.products.map(p => {
      // Keep the aggregate `stock` total in sync with per-variant stock entered in the admin UI.
      if (Array.isArray(p.variants) && p.variants.length > 0) {
        p = { ...p, stock: p.variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0) };
      }
      return Product.findOneAndUpdate({ id: p.id }, { $set: p }, { upsert: true });
    }));
  }

  if (blob.events) {
    // Only validated, well-formed events are written; the admin UI is the only caller (requireAdmin).
    ops.push(...blob.events.filter(e => e && e.id && e.title && /^\d{4}-\d{2}-\d{2}$/.test(e.date || '')).map(e =>
      Event.findOneAndUpdate({ id: e.id }, { $set: e }, { upsert: true })
    ));
  }

  if (blob.lookbooks) {
    ops.push(...blob.lookbooks.map(lb =>
      Lookbook.findOneAndUpdate({ id: lb.id }, { $set: lb }, { upsert: true })
    ));
  }

  if (blob.community) {
    ops.push(...blob.community.map(a =>
      Article.findOneAndUpdate({ id: a.id }, { $set: a }, { upsert: true })
    ));
  }

  if (blob.pages) {
    ops.push(Pages.findOneAndUpdate(
      { _id: 'main' }, { $set: blob.pages },
      { upsert: true, setDefaultsOnInsert: true }
    ));
  }

  if (blob.subscribers) {
    // Same missing-deletion gap as categories: removing a row from this array must
    // actually delete it, not just leave it unupserted (which reappears on reload).
    const existingSubscriberIds = (await Subscriber.find().select('id').lean()).map(s => s.id);
    const keptIds = new Set(blob.subscribers.map(s => s.id));
    const removedIds = existingSubscriberIds.filter(id => !keptIds.has(id));

    ops.push(...blob.subscribers.map(s =>
      Subscriber.findOneAndUpdate(
        { email: s.email?.toLowerCase() },
        { $set: s },
        { upsert: true }
      )
    ));

    if (removedIds.length) {
      ops.push(Subscriber.deleteMany({ id: { $in: removedIds } }));
    }
  }

  await Promise.all(ops);
}

// ─── API: Delete Product ─────────────────────────────────────────────────────
app.delete('/api/products/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const target = await Product.findOne({ id }).lean();
    if (!target) return res.status(404).json({ error: 'Product not found.' });
    
    // Garbage collect assets
    if (target.image) await deleteCloudinaryAsset(target.image);
    if (target.images && target.images.length) {
      for (const img of target.images) await deleteCloudinaryAsset(img);
    }
    
    await Product.deleteOne({ id });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/products/:id', err);
    res.status(500).json({ error: 'Could not delete product.' });
  }
});

// ─── API: Delete Community Post ──────────────────────────────────────────────
app.delete('/api/community/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const target = await Article.findOne({ id }).lean();
    if (!target) return res.status(404).json({ error: 'Post not found.' });

    // Garbage collect asset
    if (target.image) await deleteCloudinaryAsset(target.image);

    await Article.deleteOne({ id });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/community/:id', err);
    res.status(500).json({ error: 'Could not delete post.' });
  }
});

// ─── API: Delete Event ───────────────────────────────────────────────────────
app.delete('/api/events/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const target = await Event.findOne({ id }).lean();
    if (!target) return res.status(404).json({ error: 'Event not found.' });
    if (target.image) await deleteCloudinaryAsset(target.image);
    await Event.deleteOne({ id });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/events/:id', err);
    res.status(500).json({ error: 'Could not delete event.' });
  }
});

// ─── API: Delete Lookbook ────────────────────────────────────────────────────
app.delete('/api/lookbooks/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const target = await Lookbook.findOne({ id }).lean();
    if (!target) return res.status(404).json({ error: 'Lookbook not found.' });

    // Garbage collect assets
    if (target.items && target.items.length) {
      for (const item of target.items) {
        if (item.url) await deleteCloudinaryAsset(item.url);
      }
    }

    await Lookbook.deleteOne({ id });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/lookbooks/:id', err);
    res.status(500).json({ error: 'Could not delete lookbook.' });
  }
});

// ─── Email Notifier Helper for Customers ──────────────────────────────────────
// Returns an outcome the caller can surface to the admin (e.g. a toast) instead of
// this being a pure fire-and-forget — "sent" always means it actually left the
// server via Resend, not just that we decided to try.
async function sendCustomerStatusEmail(order, baseUrl = '') {
  if (!process.env.RESEND_API_KEY) return { sent: false, reason: 'Email is not configured on the server.' };
  if (!order.email) return { sent: false, reason: 'This order has no customer email address.' };

  if (mongoose.connection.readyState === 1) {
    await Log.create({
      id: `log-${Date.now()}-cus-mail`,
      type: 'info', message: `Customer update: Sending "${order.status}" email to ${order.email}`,
      context: 'EMAIL', data: { orderId: order.id, status: order.status, email: order.email }
    }).catch(() => {});
  }

  try {
    const { site, contactAddress } = await getEmailBranding();
    const siteName = site?.name || 'Others.';
    const currency = site?.currency || 'R';
    const templates = site?.emailTemplates || {};
    const base = String(baseUrl || '').replace(/\/+$/, '');
    // Sentence-case subjects with no brackets, capitals or exclamation marks — the patterns spam filters weigh.
    const subjects = {
      paid: `Your order ${order.id} is confirmed`,
      processing: `We're preparing your order ${order.id}`,
      shipped: `Your order ${order.id} is on its way`,
      delivered: `Your order ${order.id} has been delivered`,
      cancelled: `Your order ${order.id} has been cancelled`,
    };
    const subject = subjects[order.status] || `An update on your order ${order.id}`;
    const message = templates[order.status] || `Your order status has been updated to ${order.status}.`;

    await sendTemplate('OrderUpdate', {
      brand: await emailBrand(site, contactAddress, base),
      currency,
      message,
      supportEmail: primaryContactEmail(site) || '',
      order: {
        id: order.id, customer: order.customer, status: order.status, address: order.address,
        total: order.total, shippingCost: order.shippingCost || 0, adminNote: order.adminNote || '',
        carrier: order.carrier || '', trackingNumber: order.trackingNumber || '',
        estimatedDelivery: order.estimatedDelivery ? formatDateLabel(order.estimatedDelivery) : '',
        items: (order.items || []).map(i => ({ name: i.name, size: i.size, color: i.color, quantity: i.quantity, price: i.price, image: cldEmail(i.image, { w: 104, h: 104 }) })),
      },
    }, {
      from: `${siteName} <${EMAIL_FROM}>`,
      to: order.email,
      subject,
    }, `${subject}.\n\n${message.replace(/{orderId}/g, order.id)}`);
    console.log(`[Email] Customer status update sent for order ${order.id}`);
    return { sent: true, type: order.status, to: order.email };
  } catch (err) {
    console.error(`[Email] Failed to send customer email: ${err.message} (code: ${err.code || 'n/a'})`);
    return { sent: false, reason: err.message };
  }
}

// ─── API: Update Order Status (accept / reject) ─────────────────────────────────
app.patch('/api/orders/:id/status', requireAdmin, async (req, res) => {
  const allowed = ['processing', 'shipped', 'delivered', 'cancelled', 'paid', 'pending_payment'];
  const { status, reason, carrier, trackingNumber, estimatedDelivery } = req.body;
  if (!allowed.includes(status))
    return res.status(400).json({ error: `Invalid status. Must be one of: ${allowed.join(', ')}` });
  try {
    const oldOrder = await Order.findOne({ id: req.params.id }).lean();
    if (!oldOrder) return res.status(404).json({ error: 'Order not found.' });

    const update = { status };
    if (reason) update.adminNote = reason;
    if (carrier !== undefined) update.carrier = carrier;
    if (trackingNumber !== undefined) update.trackingNumber = trackingNumber;
    if (estimatedDelivery !== undefined) update.estimatedDelivery = estimatedDelivery;
    const order = await Order.findOneAndUpdate(
      { id: req.params.id },
      { $set: update },
      { returnDocument: 'after' }
    );

    // If cancelled manually, restore stock mapped into MongoDB
    if (status === 'cancelled' && oldOrder.status !== 'cancelled') {
        const orderItems = Array.isArray(order.items) ? order.items : [];
        for (const item of orderItems) {
          const pId = item.productId || item.id;
          let query = { id: pId };
          if (mongoose.Types.ObjectId.isValid(pId)) query = { $or: [{ id: pId }, { _id: pId }] };
          await adjustVariantStock(query, item.size, item.color, item.quantity);
        }
    }

    // Email customer if status explicitly changed. Awaited (not fire-and-forget) so
    // the admin UI can show a real "email sent" confirmation instead of just hoping.
    let emailResult = null;
    if (status !== oldOrder.status && status !== 'pending_payment') {
        emailResult = await sendCustomerStatusEmail(order, `${req.protocol}://${req.get('host')}`)
          .catch(err => ({ sent: false, reason: err.message }));
    }

    emitOrderEvent('updated', order);
    res.json({ ok: true, order, emailResult });
  } catch (err) {
    console.error('PATCH /api/orders/:id/status', err);
    res.status(500).json({ error: 'Could not update order status.' });
  }
});

// ─── API: Delete Order ──────────────────────────────────────────────────────────
app.delete('/api/orders/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findOne({ id }).lean();
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    
    // Restore product stock if it hasn't been cancelled
    if (order.status !== 'cancelled') {
      const orderItems = Array.isArray(order.items) ? order.items : [];
      let restorationCount = 0;
      for (const item of orderItems) {
        if (!item.quantity) continue;
        const pId = item.productId || item.id;
        let query = { id: pId };
        if (mongoose.Types.ObjectId.isValid(pId)) query = { $or: [{ id: pId }, { _id: pId }] };
        await adjustVariantStock(query, item.size, item.color, item.quantity);
        restorationCount++;
      }
      console.log(`[Order API] Restored stock for ${restorationCount} items from deleted order ${id}`);
    }

    await Order.deleteOne({ id });
    emitOrderEvent('deleted', order);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/orders/:id', err);
    res.status(500).json({ error: 'Could not delete order.' });
  }
});

// ─── API: Upload ──────────────────────────────────────────────────────────────
app.post('/api/upload', requireAdmin, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  res.json({ url: req.file.path }); // Cloudinary returns secure_url as .path
});

app.post('/api/upload/multi', requireAdmin, upload.array('images', 20), (req, res) => {
  if (!req.files?.length) return res.status(400).json({ error: 'No files uploaded.' });
  res.json({ urls: req.files.map(f => f.path) }); // Cloudinary: .path = secure_url
});

// ─── API: Admin sign-in / session ────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Tells the sign-in screen whether to ask for an authenticator code. Public by design.
app.get('/api/admin/auth-config', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ totp: auth.totpEnabled() });
});

app.post('/api/admin/login', loginLimiter, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const { username, password, code } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string' || username.length > 200 || password.length > 500) {
    return res.status(400).json({ error: 'Enter your username and password.' });
  }

  // Both factors are always evaluated, so a wrong password and a wrong code are
  // indistinguishable (same message, same work, same delay).
  const credsOk = auth.verifyCredentials(username, password);
  const totpStep = auth.checkTotp(code);

  if (!(credsOk && totpStep)) {
    logAuth('warn', 'Failed admin sign-in', req, 'signin-failed');
    await sleep(350 + Math.floor(Math.random() * 300));
    // Only someone who already has the right username + password is told the code was the problem,
    // so this reveals nothing to a guesser; everyone else gets the generic message.
    if (credsOk && auth.totpEnabled()) {
      return res.status(401).json({ error: 'Incorrect authentication code. Check your authenticator app and try again.', field: 'code' });
    }
    return res.status(401).json({ error: auth.totpEnabled() ? 'Incorrect username, password or code.' : 'Incorrect username or password.' });
  }

  auth.consumeTotp(totpStep); // the code is now spent
  auth.destroySession(req); // never reuse a pre-login session id
  const { id, session } = auth.createSession(req);
  auth.setSessionCookie(req, res, id);
  // Flag sign-ins from a browser/OS combination this admin has never used before, and tell them.
  const info = deviceInfo(req);
  let newDevice = false;
  if (mongoose.connection.readyState === 1) {
    try {
      const known = await Log.countDocuments({ context: 'AUTH', 'data.event': 'signin', 'data.device': info.device }).maxTimeMS(1500);
      const anyPrior = await Log.countDocuments({ context: 'AUTH', 'data.event': 'signin' }).maxTimeMS(1500);
      newDevice = known === 0 && anyPrior > 0; // the very first sign-in isn't "new"
    } catch { /* can't tell — don't alert */ }
  }
  logAuth('info', newDevice ? 'Admin signed in (new device)' : 'Admin signed in', req, 'signin', { newDevice });
  if (newDevice) sendNewDeviceAlert(req, info).catch(() => {});
  res.json({ ok: true, csrf: session.csrf });
});

app.get('/api/admin/session', requireAdmin, (req, res) => {
  res.json({ authenticated: true, csrf: req.adminSession.csrf, user: ADMIN_USER });
});

app.post('/api/admin/logout', requireAdmin, (req, res) => {
  auth.destroySession(req);
  auth.clearSessionCookie(req, res);
  logAuth('info', 'Admin signed out', req, 'signout');
  res.json({ ok: true });
});

async function sendNewDeviceAlert(req, info) {
  if (!process.env.RESEND_API_KEY) return;
  const recipients = await getAdminRecipients();
  if (!recipients.length) return;
  const when = new Date().toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
  const { site, contactAddress } = await getEmailBranding();
  const baseUrl = process.env.PUBLIC_URL || (req ? `${req.protocol}://${req.get('host')}` : '');
  await sendTemplate('NewDeviceAlert', {
    brand: await emailBrand(site, contactAddress, baseUrl),
    device: info.device, ip: info.ip, when,
    reviewUrl: baseUrl ? `${baseUrl.replace(/\/+$/, '')}/admin/status` : '',
  }, {
    from: `${site?.name || 'Others.'} Alerts <${EMAIL_FROM}>`, to: recipients,
    subject: 'New sign-in to your admin panel', headers: AUTO_HEADERS,
  }, `New admin sign-in from ${info.device} (${info.ip}) at ${when}. If this wasn't you, change your admin password now.`);
}

// ─── System log backups ──────────────────────────────────────────────────────
// The live `logs` collection can be cleared from the admin, so history is snapshotted
// separately: every day to the `logbackups` collection (gzip JSON, incremental, kept
// 180 days), and every week a summary of the week's activity — suspicious items flagged — is
// emailed to the admin with the new log entries attached as an off-site backup.
const LOG_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const LOG_EMAIL_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const LOG_BACKUP_RETENTION_DAYS = 180;

const gzipLogs = (logs, extra = {}) =>
  zlib.gzipSync(Buffer.from(JSON.stringify({ exportedAt: new Date().toISOString(), count: logs.length, ...extra, logs }), 'utf8'));

const backupSummary = (d) => ({ id: d.id, kind: d.kind, reason: d.reason, createdAt: d.createdAt, from: d.from, to: d.to, count: d.count, bytes: d.bytes });

/** Snapshots every log entry newer than the previous snapshot. Returns null if there is nothing new. */
async function createLogBackup(reason = 'scheduled') {
  if (!getIsConnected()) throw new Error('The database is offline.');
  const last = await LogBackup.findOne({ kind: 'snapshot' }).sort({ to: -1 }).select('to').lean();
  const logs = await Log.find(last?.to ? { timestamp: { $gt: last.to } } : {}).sort({ timestamp: 1 }).lean();
  if (!logs.length) return null;
  const data = gzipLogs(logs);
  const doc = await LogBackup.create({
    id: `lb-${Date.now()}`, kind: 'snapshot', reason,
    from: logs[0].timestamp, to: logs[logs.length - 1].timestamp, count: logs.length, bytes: data.length, data,
  });
  console.log(`[LogBackup] ${reason}: saved ${logs.length} entries (${data.length} bytes)`);
  return backupSummary(doc);
}

// ─── Weekly activity summary ─────────────────────────────────────────────────
// A digest of the last 7 days — sales, sign-ins, payments, errors — with anything that
// looks suspicious called out at the top. Built from the Orders and Logs collections.
const DAY_MS = 86400000;
const SAST = 'Africa/Johannesburg';

async function buildWeeklyReport(now = new Date()) {
  const to = now;
  const from = new Date(now.getTime() - 7 * DAY_MS);
  const prevFrom = new Date(from.getTime() - 7 * DAY_MS);

  const [orders, prevOrders, logs, newSubscribers, soldOut, branding] = await Promise.all([
    Order.find({ createdAt: { $gte: from, $lte: to } }).lean(),
    Order.find({ createdAt: { $gte: prevFrom, $lt: from } }).select('total status').lean(),
    Log.find({ timestamp: { $gte: from, $lte: to } }).sort({ timestamp: 1 }).lean(),
    Subscriber.countDocuments({ date: { $gte: from.toISOString().slice(0, 10) } }),
    Product.countDocuments({ stock: 0 }),
    getEmailBranding(),
  ]);
  const site = branding.site || {};
  const currency = site.currency || 'R';

  // ── Sales ───────────────────────────────────────────────────────────────────
  const REVENUE = ['paid', 'processing', 'shipped', 'delivered'];
  const sumRevenue = (list) => list.filter(o => REVENUE.includes(o.status)).reduce((t, o) => t + (o.total || 0), 0);
  const paid = orders.filter(o => REVENUE.includes(o.status));
  const revenue = sumRevenue(orders);
  const prevRevenue = sumRevenue(prevOrders);
  const prevPaidCount = prevOrders.filter(o => REVENUE.includes(o.status)).length;
  const avgOrder = paid.length ? revenue / paid.length : 0;
  const pct = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null);

  const statusCounts = {};
  for (const o of orders) statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;

  const byProduct = new Map();
  for (const o of paid) {
    for (const i of o.items || []) {
      const row = byProduct.get(i.name) || { name: i.name, units: 0, revenue: 0 };
      row.units += i.quantity || 0;
      row.revenue += (i.price || 0) * (i.quantity || 0);
      byProduct.set(i.name, row);
    }
  }
  const topProducts = [...byProduct.values()].sort((x, y) => y.units - x.units).slice(0, 5);

  // ── Security (sign-ins, log tampering) ─────────────────────────────────────
  const auth = logs.filter(l => l.context === 'AUTH');
  const ev = (name) => auth.filter(l => l.data?.event === name);
  const signins = ev('signin');
  const failed = ev('signin-failed');
  const lockouts = ev('lockout');
  const cleared = ev('logs-cleared');
  const downloads = ev('log-backup-download');

  const devices = new Map();
  for (const l of signins) {
    const key = l.data?.device || 'Unknown device';
    const d = devices.get(key) || { device: key, count: 0, ips: new Set(), isNew: false };
    d.count += 1; if (l.data?.ip) d.ips.add(l.data.ip); if (l.data?.newDevice) d.isNew = true;
    devices.set(key, d);
  }
  const deviceList = [...devices.values()].map(d => ({ ...d, ips: [...d.ips] }));
  const signinIps = new Set(signins.map(l => l.data?.ip).filter(Boolean));
  const failedIps = new Map();
  for (const l of failed) failedIps.set(l.data?.ip || '?', (failedIps.get(l.data?.ip || '?') || 0) + 1);
  const hourOf = (d) => Number(new Date(d).toLocaleString('en-GB', { timeZone: SAST, hour: 'numeric', hour12: false })) % 24;
  const lateNight = signins.filter(l => hourOf(l.timestamp) < 5);

  // ── Payments (PayFast webhook) ─────────────────────────────────────────────
  const itn = logs.filter(l => l.context === 'PAYFAST_ITN' || l.context === 'YOCO_WEBHOOK');
  const itnBadSig = itn.filter(l => /invalid signature/i.test(l.message));
  const itnBadAmount = itn.filter(l => /amount mismatch/i.test(l.message));
  const itnBadIp = itn.filter(l => /untrusted IP/i.test(l.message));

  // ── System health ──────────────────────────────────────────────────────────
  const errors = logs.filter(l => l.type === 'error');
  const errorGroups = new Map();
  for (const l of errors) errorGroups.set(l.message, (errorGroups.get(l.message) || 0) + 1);
  const topErrors = [...errorGroups.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([message, count]) => ({ message, count }));
  const emailFailures = logs.filter(l => l.context === 'EMAIL' && l.type === 'error');
  const dbDrops = logs.filter(l => /DATABASE_CONNECTION_LOST/.test(l.message));

  // ── Flags: the "anything suspicious?" list ─────────────────────────────────
  const flags = [];
  const flag = (severity, title, detail) => flags.push({ severity, title, detail });
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  for (const [name, list, what] of [['invalid-signature', itnBadSig, 'with an invalid signature'], ['amount-mismatch', itnBadAmount, 'whose amount didn\u2019t match the order'], ['untrusted-ip', itnBadIp, 'from an IP address PayFast doesn\u2019t use']]) {
    if (list.length) flag('high', `${plural(list.length, 'payment notification')} ${what}`, 'Someone may be trying to fake or alter a payment confirmation. Check these orders against your PayFast / Yoco dashboard before shipping anything.');
  }
  if (lockouts.length) flag('high', `Sign-in lockout triggered ${plural(lockouts.length, 'time')}`, `Someone hit the failed-attempt limit from: ${[...new Set(lockouts.map(l => `${l.data?.ip} (${l.data?.device})`))].join('; ')}. If that wasn\u2019t you, change your admin password and turn on two-factor sign-in.`);
  if (failed.length >= 5) {
    const top = [...failedIps.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([ip, n]) => `${ip} (${n}×)`).join(', ');
    flag(failed.length >= 20 ? 'high' : 'medium', `${plural(failed.length, 'failed admin sign-in')}`, `Top sources: ${top}.`);
  }
  const newDevs = deviceList.filter(d => d.isNew);
  if (newDevs.length) flag('medium', `Sign-in from ${plural(newDevs.length, 'new device')}`, newDevs.map(d => `${d.device} — ${d.ips.join(', ')}`).join('; ') + '. Fine if that was you.');
  if (signinIps.size >= 3) flag('medium', `Admin signed in from ${signinIps.size} different IP addresses`, [...signinIps].join(', '));
  if (lateNight.length) flag('info', `${plural(lateNight.length, 'sign-in')} between midnight and 5am (SA time)`, [...new Set(lateNight.map(l => `${l.data?.device} · ${l.data?.ip}`))].join('; '));
  if (cleared.length) flag('medium', `System logs were cleared ${plural(cleared.length, 'time')}`, 'A backup is saved first each time, but clearing logs is also what someone covering their tracks would do.');
  if (downloads.length) flag('info', `${plural(downloads.length, 'log backup')} downloaded`, 'Backups contain IP addresses and device details.');
  if (errors.length >= 10) flag('medium', `${errors.length} server errors logged`, topErrors.map(e => `${e.message} (${e.count}×)`).join('; '));
  if (dbDrops.length) flag('medium', `Database connection dropped ${plural(dbDrops.length, 'time')}`, 'The store showed its maintenance page while it was down.');
  if (emailFailures.length) flag('medium', `${plural(emailFailures.length, 'email')} failed to send`, emailFailures.slice(0, 3).map(l => l.message).join('; '));
  const abandonedCount = orders.filter(o => o.cancelReason === 'abandoned').length;
  const cancelled = (statusCounts.cancelled || 0) - abandonedCount; // checkouts that were simply never paid aren't cancellations
  if (orders.length >= 5 && cancelled / orders.length >= 0.4) flag('medium', `High cancellation rate: ${cancelled} of ${orders.length} orders cancelled`, 'Customers backing out, failed payments, or card testing.');
  if (orders.length >= 10 && abandonedCount / orders.length >= 0.6) flag('info', `${abandonedCount} of ${orders.length} checkouts were never paid`, 'Many customers reach the payment page and leave. Worth checking the payment pages work on your phone.');
  const staleUnpaid = orders.filter(o => o.status === 'pending_payment' && now - new Date(o.createdAt) > DAY_MS).length;
  if (staleUnpaid >= 5) flag('info', `${plural(staleUnpaid, 'checkout')} left unpaid for over a day`, 'Their stock is reserved until the customer cancels or the payment provider confirms.');
  // Median, not mean: one huge order would otherwise drag the average up and hide itself.
  const sortedTotals = paid.map(o => o.total || 0).sort((x, y) => x - y);
  const median = sortedTotals.length ? sortedTotals[Math.floor(sortedTotals.length / 2)] : 0;
  const big = paid.filter(o => o.total >= Math.max(5000, median * 4));
  if (big.length) flag('info', `${plural(big.length, 'unusually large order')}`, big.map(o => `${o.id} (${currency}${o.total.toFixed(2)}, ${o.customer || 'unknown'})`).join('; '));
  const byEmail = new Map();
  for (const o of orders) { const k = (o.email || '').toLowerCase(); if (k) byEmail.set(k, (byEmail.get(k) || 0) + 1); }
  const repeaters = [...byEmail.entries()].filter(([, n]) => n >= 4);
  if (repeaters.length) flag('info', `${plural(repeaters.length, 'customer')} placed 4+ orders this week`, repeaters.map(([e, n]) => `${e} (${n})`).join(', ') + ' — often a loyal customer, occasionally card testing.');
  if (soldOut > 0) flag('info', `${plural(soldOut, 'product')} sold out`, 'Restock or hide them so customers aren\u2019t disappointed.');

  const rank = { high: 0, medium: 1, info: 2 };
  flags.sort((x, y) => rank[x.severity] - rank[y.severity]);

  return {
    from, to, siteName: site.name || 'Others.', currency, site, contactAddress: branding.contactAddress,
    sales: { orders: orders.length, paidOrders: paid.length, revenue, avgOrder, prevRevenue, prevPaidOrders: prevPaidCount, revenueDelta: pct(revenue, prevRevenue), ordersDelta: pct(paid.length, prevPaidCount), statusCounts, topProducts, newSubscribers },
    security: { signins: signins.length, failed: failed.length, lockouts: lockouts.length, devices: deviceList, logsCleared: cleared.length },
    payments: { badSignature: itnBadSig.length, badAmount: itnBadAmount.length, untrustedIp: itnBadIp.length },
    health: { errors: errors.length, topErrors, emailFailures: emailFailures.length, dbDrops: dbDrops.length },
    flags, totalLogs: logs.length,
  };
}

async function renderWeeklyReportEmail(r, baseUrl = '') {
  const { site, contactAddress, ...report } = r;
  return renderEmail('WeeklySummary', {
    brand: await emailBrand(site, contactAddress, baseUrl),
    report,
    adminUrl: baseUrl ? `${baseUrl.replace(/\/+$/, '')}/admin/status` : '',
  });
}

/** Emails the weekly summary (with the new log entries attached as a backup) — at most weekly unless forced. */
async function emailLogBackup(force = false, baseUrl = '') {
  if (!process.env.RESEND_API_KEY || process.env.LOG_BACKUP_EMAIL === 'false' || !getIsConnected()) return null;
  const lastMail = await LogBackup.findOne({ kind: 'email' }).sort({ createdAt: -1 }).lean();
  if (!force && lastMail && Date.now() - new Date(lastMail.createdAt).getTime() < LOG_EMAIL_INTERVAL_MS) return null;
  const recipients = await getAdminRecipients();
  if (!recipients.length) return null;

  const report = await buildWeeklyReport();
  const logs = await Log.find(lastMail?.to ? { timestamp: { $gt: lastMail.to } } : {}).sort({ timestamp: 1 }).lean();
  const { html, text } = await renderWeeklyReportEmail(report, baseUrl || process.env.PUBLIC_URL || '');
  const day = new Date().toISOString().slice(0, 10);
  const attention = report.flags.filter(f => f.severity !== 'info').length;
  const email = {
    from: `${report.siteName} Alerts <${EMAIL_FROM}>`, to: recipients,
    subject: `Weekly summary, ${day}${attention ? ` \u2014 ${attention} to review` : ''}`,
    html, text, headers: AUTO_HEADERS,
  };
  if (logs.length) {
    const gz = gzipLogs(logs);
    email.attachments = [{ filename: `others-logs-${day}.json.gz`, content: gz.toString('base64') }];
  }
  await sendEmail(email);
  await LogBackup.create({
    id: `lb-mail-${Date.now()}`, kind: 'email', reason: force ? 'manual' : 'scheduled',
    from: logs[0]?.timestamp || null, to: logs.length ? logs[logs.length - 1].timestamp : (lastMail?.to || null), count: logs.length, bytes: 0,
  });
  return { to: recipients, flags: report.flags.length, attention, entries: logs.length };
}

async function logBackupTick() {
  if (!getIsConnected()) return;
  try {
    const last = await LogBackup.findOne({ kind: 'snapshot' }).sort({ createdAt: -1 }).select('createdAt').lean();
    if (!last || Date.now() - new Date(last.createdAt).getTime() >= LOG_BACKUP_INTERVAL_MS) {
      const made = await createLogBackup('scheduled');
      if (made) dbLog({ id: `log-${Date.now()}-lbk`, type: 'info', message: `Log backup saved: ${made.count} entries`, context: 'BACKUP', data: { backupId: made.id } });
    }
    await emailLogBackup(false);
    await LogBackup.deleteMany({ createdAt: { $lt: new Date(Date.now() - LOG_BACKUP_RETENTION_DAYS * 86400000) } });
  } catch (e) {
    console.error('[LogBackup] failed:', e.message);
    dbLog({ id: `log-${Date.now()}-lbk-fail`, type: 'error', message: `Scheduled log backup FAILED: ${e.message}`, context: 'BACKUP', data: {} });
  }
}

app.get('/api/admin/log-backups', requireAdmin, async (_req, res) => {
  try {
    if (!getIsConnected()) return res.json({ backups: [], offline: true });
    const backups = await LogBackup.find({ kind: 'snapshot' }).sort({ createdAt: -1 }).limit(30).lean();
    const lastMail = await LogBackup.findOne({ kind: 'email' }).sort({ createdAt: -1 }).select('createdAt').lean();
    res.json({
      backups: backups.map(backupSummary),
      retentionDays: LOG_BACKUP_RETENTION_DAYS,
      emailEnabled: Boolean(process.env.RESEND_API_KEY) && process.env.LOG_BACKUP_EMAIL !== 'false',
      lastEmailedAt: lastMail?.createdAt || null,
    });
  } catch {
    res.status(500).json({ error: 'Could not load log backups.' });
  }
});

app.post('/api/admin/log-backups', requireAdmin, async (req, res) => {
  try {
    const made = await createLogBackup('manual');
    if (made) logAuth('info', 'Manual log backup created', req, 'log-backup', { backupId: made.id });
    res.json({ ok: true, backup: made, empty: !made });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Backup failed.' });
  }
});

app.get('/api/admin/log-backups/:id/download', requireAdmin, async (req, res) => {
  if (!/^lb-\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Invalid backup id.' });
  try {
    const doc = await LogBackup.findOne({ id: req.params.id, kind: 'snapshot' }).select('+data').lean();
    if (!doc?.data) return res.status(404).json({ error: 'Backup not found.' });
    logAuth('info', 'Log backup downloaded', req, 'log-backup-download', { backupId: doc.id });
    res.set({
      'Content-Type': 'application/gzip',
      'Content-Disposition': `attachment; filename="others-logs-${new Date(doc.createdAt).toISOString().slice(0, 10)}-${doc.id}.json.gz"`,
    });
    res.send(Buffer.from(doc.data.buffer ?? doc.data));
  } catch {
    res.status(500).json({ error: 'Could not download the backup.' });
  }
});

app.get('/api/admin/weekly-report', requireAdmin, async (req, res) => {
  try {
    if (!getIsConnected()) return res.status(503).json({ error: 'The database is offline.' });
    const report = await buildWeeklyReport();
    if (req.query.format === 'html') {
      res.type('html').send((await renderWeeklyReportEmail(report, `${req.protocol}://${req.get('host')}`)).html);
    } else {
      const { site, contactAddress, ...rest } = report;
      res.json(rest);
    }
  } catch (e) {
    console.error('weekly-report', e);
    res.status(500).json({ error: 'Could not build the weekly summary.' });
  }
});

app.post('/api/admin/weekly-report/send', requireAdmin, async (req, res) => {
  try {
    if (!process.env.RESEND_API_KEY) return res.status(400).json({ error: 'RESEND_API_KEY is not set on the server, so no email can be sent.' });
    const sent = await emailLogBackup(true, `${req.protocol}://${req.get('host')}`);
    if (!sent) return res.status(400).json({ error: 'Nothing was sent (email backups are disabled or there is no notification address).' });
    logAuth('info', 'Weekly summary emailed on demand', req, 'weekly-report-sent');
    res.json({ ok: true, ...sent });
  } catch (e) {
    res.status(502).json({ error: e.message || 'Could not send the weekly summary.' });
  }
});

// ─── API: Admin realtime stream ──────────────────────────────────────────────
app.get('/api/admin/events', requireAdmin, (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // stop nginx-style proxies from buffering the stream
  });
  res.flushHeaders();
  res.write('retry: 5000\n\n');
  res.write('event: ready\ndata: {}\n\n');

  const onEvent = (e) => res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
  adminEvents.on('evt', onEvent);

  // Heartbeat keeps proxies from closing an idle stream, and ends it once the session
  // has expired. peekSession doesn't extend the idle timer — only real activity does.
  const heartbeat = setInterval(() => {
    if (!auth.peekSession(req)) {
      res.write('event: signed-out\ndata: {}\n\n');
      return res.end();
    }
    res.write(': ping\n\n');
  }, 25000);

  req.on('close', () => {
    adminEvents.off('evt', onEvent);
    clearInterval(heartbeat);
  });
});

// ─── API: Admin notification test ────────────────────────────────────────────
app.post('/api/admin/test-email', requireAdmin, async (_req, res) => {
  if (!process.env.RESEND_API_KEY) return res.status(400).json({ error: 'RESEND_API_KEY is not set on the server, so no email can be sent.' });
  const recipients = await getAdminRecipients();
  if (recipients.length === 0) return res.status(400).json({ error: 'No notification email address is configured (Settings → Emails & alerts).' });
  try {
    const { site, contactAddress } = await getEmailBranding();
    await sendTemplate('TestEmail', {
      brand: await emailBrand(site, contactAddress, _req ? `${_req.protocol}://${_req.get('host')}` : ''),
      from: EMAIL_FROM, sandbox: /resend\.dev$/i.test(EMAIL_FROM),
    }, {
      from: `${site?.name || 'Others.'} Alerts <${EMAIL_FROM}>`, to: recipients,
      subject: 'Test email: notifications are working', headers: AUTO_HEADERS,
    }, 'This is a test message from your admin panel. Notifications are working.');
    res.json({ ok: true, to: recipients, from: EMAIL_FROM });
  } catch (err) {
    const sandbox = /resend\.dev$/i.test(EMAIL_FROM);
    res.status(502).json({
      error: err.message,
      from: EMAIL_FROM,
      hint: sandbox ? 'You are sending from Resend’s shared sandbox address (onboarding@resend.dev), which can only deliver to the email address of your own Resend account. Verify a domain in Resend and set SMTP_FROM to an address on it to email customers.' : undefined,
    });
  }
});

// ─── API: Admin Diagnostics ──────────────────────────────────────────────────
app.get('/api/admin/status', requireAdmin, async (req, res) => {
  try {
    const isConn = getIsConnected();
    const dbStatus = isConn ? 'connected' : 'disconnected';
    const cloudinaryOk = !!(process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_CLOUD_NAME);
    let emailStatus = process.env.RESEND_API_KEY ? 'configured' : 'not_configured';

    let stats = { orders: 0, products: 0, subscribers: 0, logs: 0 };
    if (isConn) {
      try {
        stats = {
          orders: await Order.countDocuments(),
          products: await Product.countDocuments(),
          subscribers: await Subscriber.countDocuments(),
          logs: await Log.countDocuments({ type: 'error' }),
        };
      } catch (e) {
        console.warn('Could not fetch DB stats:', e.message);
      }
    }

    res.json({
      db: dbStatus,
      email: emailStatus,
      emailFrom: EMAIL_FROM,
      emailSandbox: /resend.dev$/i.test(EMAIL_FROM),
      twoFactor: auth.totpEnabled(),
      cloudinary: cloudinaryOk ? 'configured' : 'missing',
      stats,
      _db_offline: !isConn
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch diagnostics.' });
  }
});

app.get('/api/admin/logs', requireAdmin, async (req, res) => {
  try {
    if (!getIsConnected()) {
      return res.json([{ 
        timestamp: new Date(), 
        type: 'error', 
        context: 'SYSTEM', 
        message: 'DATABASE DISCONNECTED: Persistent logs are currently unavailable.' 
      }]);
    }
    const logs = await Log.find().sort({ timestamp: -1 }).limit(100).lean();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch logs.' });
  }
});

app.delete('/api/admin/logs', requireAdmin, async (req, res) => {
  try {
    // Never destroy history without a copy: snapshot what isn't backed up yet, then clear.
    let backedUp = null;
    try { backedUp = await createLogBackup('before-clear'); } catch (e) { console.warn('[LogBackup] pre-clear snapshot failed:', e.message); }
    await Log.deleteMany({});
    logAuth('warn', 'System logs cleared', req, 'logs-cleared', { backedUp: Boolean(backedUp) });
    res.json({ ok: true, backedUp: Boolean(backedUp) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear logs.' });
  }
});

// ─── API: Store Data ──────────────────────────────────────────────────────────

// ─── Favicon ─────────────────────────────────────────────────────────────────
// Browsers (and crawlers) request /favicon.ico on their own, whatever the HTML says. It resolves to
// the store's own favicon/logo — never a file bundled with the project — and falls back to a
// generated monogram until a logo is uploaded.
app.get('/favicon.ico', async (_req, res) => {
  const info = await getBrandInfo();
  res.set('Cache-Control', 'public, max-age=3600');
  res.redirect(302, brandIconUrl(info, 64) || '/favicon.svg');
});

app.get('/favicon.svg', async (_req, res) => {
  const info = await getBrandInfo();
  const ok = (c) => (/^#[0-9a-f]{3,8}$/i.test(c || '') ? c : null);
  const letter = escapeHtmlAttr((info.name || 'O').trim().charAt(0).toUpperCase() || 'O');
  res.type('image/svg+xml').set('Cache-Control', 'public, max-age=3600').send(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${ok(info.fg) || '#211c1a'}"/><text x="32" y="45" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-weight="700" font-size="38" fill="${ok(info.bg) || '#f8f5f2'}">${letter}</text></svg>`
  );
});

// ─── PWA & Favicon Manifest ───────────────────────────────────────────────────
app.get('/manifest.json', async (req, res) => {
  try {
    const site = await Settings.findOne({ _id: 'main' }).lean();
    if (!site) return res.status(404).json({ error: 'Settings not found.' });

    const name = site.name || 'Others.';
    const iconBase = site.favicon || site.logo || '';
    
    let icons = [];
    if (iconBase && !iconBase.includes('cloudinary.com')) {
      icons = [{ src: iconBase, sizes: '512x512', type: 'image/png' }];
    } else if (iconBase.includes('cloudinary.com')) {
      icons = [
        { src: iconBase.replace('/upload/', '/upload/c_pad,f_png,q_auto,w_192,h_192/'), sizes: '192x192', type: 'image/png' },
        { src: iconBase.replace('/upload/', '/upload/c_pad,f_png,q_auto,w_512,h_512/'), sizes: '512x512', type: 'image/png' },
        { src: iconBase.replace('/upload/', '/upload/c_pad,f_png,q_auto,w_180,h_180/'), sizes: '180x180', type: 'image/png', purpose: 'apple-touch-icon' }
      ];
    }

    res.json({
      name,
      short_name: name,
      start_url: '/',
      display: 'standalone',
      background_color: site.colors?.background || '#ffffff',
      theme_color: site.colors?.primary || '#111111',
      icons
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate manifest.' });
  }
});

app.get('/api/data', async (req, res) => {
  try {
    if (!getIsConnected()) {
      return res.json({
        site: { name: 'Others. (DATABASE OFFLINE)', logo: '', currency: 'R', navLogoSize: 40 },
        categories: [], products: [], orders: [], lookbooks: [], events: [], community: [], subscribers: [],
        pages: { shipping: { content: '' }, faq: { items: [] }, contact: { address: '', details: [] } },
        _db_offline: true
      });
    }
    const data = await readData();
    // This endpoint is public (the storefront needs it) but the full blob is also what
    // the admin panel loads. Customer PII (orders, subscribers) and admin-only settings
    // (notification emails, email templates) are only
    // included when the request carries valid admin credentials.
    if (!hasValidAdminAuth(req)) {
      const { adminNotificationEmails, emailTemplates, ...publicSite } = data.site || {};
      data.site = publicSite;
      data.orders = [];
      data.subscribers = [];
      data.events = data.events.filter(e => e.published); // drafts stay private
    }
    res.json(data);
  } catch (err) {
    console.error('API Error:', err);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

app.post('/api/data', requireAdmin, async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Invalid data payload.' });
    }
    await writeData(req.body);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/data', err);
    res.status(500).json({ error: 'Database write failed.' });
  }
});

// ─── API: Products (granular) ─────────────────────────────────────────────────
app.get('/api/products', async (_req, res) => {
  try { res.json(await Product.find().lean()); }
  catch (err) {
    console.error('GET /api/products', err);
    res.status(500).json({ error: 'Could not fetch products.' });
  }
});

// Lean endpoint for the admin panel's background refresh — pulling just orders +
// products (not the whole /api/data blob, which also fetches categories, lookbooks,
// community, pages, and subscribers on every 20s poll for data that rarely changes).
app.get('/api/orders', requireAdmin, async (_req, res) => {
  try { res.json(await Order.find().sort({ createdAt: -1 }).lean()); }
  catch (err) {
    console.error('GET /api/orders', err);
    res.status(500).json({ error: 'Could not fetch orders.' });
  }
});

// ─── API: Newsletter ──────────────────────────────────────────────────────────
app.post('/api/newsletter', async (req, res) => {
  const email = (req.body.email || '').toLowerCase().trim();
  if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email.' });
  }
  try {
    const existing = await Subscriber.findOne({ email });
    if (existing) return res.json({ ok: true, already: true });

    await Subscriber.create({
      id: `s-${Date.now()}`,
      email,
      date: new Date().toISOString().slice(0, 10),
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/newsletter', err);
    res.status(500).json({ error: 'Could not save subscriber.' });
  }
});

// ─── API: Newsletter Broadcast (Admin Only) ──────────────────────────────────
app.post('/api/newsletter/broadcast', requireAdmin, async (req, res) => {
  const { subject, html, subscriberIds } = req.body;
  if (!subject || !html) return res.status(400).json({ error: 'Subject and HTML body required.' });
  if (!process.env.RESEND_API_KEY) return res.status(500).json({ error: 'RESEND_API_KEY not configured on server.' });

  try {
    let query = {};
    if (subscriberIds && Array.isArray(subscriberIds) && subscriberIds.length > 0) {
      query = { _id: { $in: subscriberIds } };
    }

    const subscribers = await Subscriber.find(query).lean();
    if (subscribers.length === 0) return res.status(400).json({ error: 'No active recipients found matching selection.' });

    const { site, contactAddress } = await getEmailBranding();
    // CAN-SPAM (and most anti-spam law generally) requires every commercial/marketing
    // email carry the sender's real physical postal address — unlike the transactional
    // order-status emails, this route can't send without one.
    if (!contactAddress) {
      return res.status(400).json({ error: 'Add a physical mailing address on the Contact page before sending a newsletter — required by anti-spam law (CAN-SPAM) for marketing email.' });
    }
    const siteName = site?.name || 'Others.';
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const replyTo = primaryContactEmail(site);

    // The body is the admin's rich text: strip anything mail clients block or filters punish (scripts, embeds,
    // forms, event handlers), make relative links absolute, and serve images at a size and format email can show.
    const cleanBody = sanitizeEmailHtml(html, baseUrl)
      .replace(/(<img\b[^>]*\ssrc=")([^"]+)(")/gi, (_m, a, src, c) => a + cldEmail(src, { w: 1200 }) + c);
    const previewText = String(req.body.preview || '').trim().slice(0, 140) || subject;

    // Subject-line hygiene: patterns that raise spam scores. Advisory only — the admin decides.
    const warnings = [];
    const letters = subject.replace(/[^A-Za-z]/g, '');
    if (letters.length >= 6 && subject.replace(/[^A-Z]/g, '').length / letters.length > 0.6) warnings.push('The subject is mostly capital letters, which spam filters penalise.');
    if (/[!?]{2,}|!.*!/.test(subject)) warnings.push('Several exclamation or question marks in the subject can trigger spam filters.');
    if (subject.length > 70) warnings.push('The subject is long and will be cut off on phones (aim for under 60 characters).');
    if (/\b(free|winner|act now|limited time|100%|guarantee|urgent|cash|click here)\b/i.test(subject)) warnings.push('The subject contains words commonly used in spam (free, act now, limited time...).');
    if (!/<a\b/i.test(cleanBody) && cleanBody.replace(/<[^>]+>/g, '').trim().length < 80) warnings.push('The message is very short and has no links; image-only or near-empty emails score poorly.');

    // Process individually for privacy and deliverability
    let sentCount = 0;
    for (const sub of subscribers) {
      try {
        const token = unsubscribeToken(sub.email);
        const unsubscribeUrl = `${baseUrl}/api/newsletter/unsubscribe?email=${encodeURIComponent(sub.email)}&token=${token}`;
        const { html: emailHtml, text: emailText } = await renderEmail('Newsletter', {
          brand: await emailBrand(site, contactAddress, baseUrl),
          subject,
          html: cleanBody,
          preview: previewText,
          unsubscribeUrl,
        });
        await sendEmail({
          from: `${siteName} <${EMAIL_FROM}>`,
          to: sub.email,
          subject: subject,
          html: emailHtml,
          text: emailText,
          headers: {
            // RFC 8058 one-click unsubscribe — Gmail/Yahoo/Outlook.com show a native
            // "Unsubscribe" affordance next to the sender and hit this without the
            // user ever opening the email, when both headers are present.
            'List-Unsubscribe': `<${unsubscribeUrl}>, <mailto:${replyTo || EMAIL_FROM}?subject=unsubscribe>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        });
        sentCount++;
      } catch (mailErr) {
        console.warn(`[Broadcast] Failed to send to ${sub.email}:`, mailErr.message);
      }
    }

    console.log(`[Broadcast] Delivered ${sentCount}/${subscribers.length} individual emails`);
    res.json({ ok: true, sentCount, warnings });
  } catch (err) {
    console.error('POST /api/newsletter/broadcast', err);
    res.status(500).json({ error: 'Mail delivery failed. Check your Resend configuration.' });
  }
});

// ─── API: Newsletter Unsubscribe ──────────────────────────────────────────────
// GET is what a human clicks from their inbox — show a small confirmation page.
app.get('/api/newsletter/unsubscribe', async (req, res) => {
  const email = String(req.query.email || '').toLowerCase().trim();
  const valid = verifyUnsubscribeToken(email, req.query.token);
  if (valid) {
    try { await Subscriber.deleteOne({ email }); } catch (e) { console.error('Unsubscribe delete failed:', e.message); }
  }
  res.status(valid ? 200 : 400).send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${valid ? 'Unsubscribed' : 'Link invalid'}</title>
<style>
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; background:#f4f4f4; margin:0; padding:60px 20px; text-align:center; color:#111; }
  .card { max-width:420px; margin:0 auto; background:#fff; padding:40px 32px; border:1px solid #eee; }
  h1 { font-size:20px; margin:0 0 12px; }
  p { font-size:14px; color:#666; line-height:1.6; margin:0; }
</style></head>
<body><div class="card">
${valid
  ? `<h1>You've been unsubscribed</h1><p>${escapeHtmlAttr(email)} won't receive any more newsletter emails from us.</p>`
  : `<h1>Link invalid or expired</h1><p>We couldn't verify this unsubscribe link. If you keep receiving emails you don't want, contact us directly.</p>`}
</div></body></html>`);
});

// POST is RFC 8058's one-click endpoint: mailbox providers ping this directly from
// the List-Unsubscribe-Post header, server-to-server, with no human involved — it
// must respond quickly with a plain success status, not an HTML page.
app.post('/api/newsletter/unsubscribe', async (req, res) => {
  const email = String(req.query.email || '').toLowerCase().trim();
  if (verifyUnsubscribeToken(email, req.query.token)) {
    try { await Subscriber.deleteOne({ email }); } catch (e) { console.error('Unsubscribe delete failed:', e.message); }
  }
  res.sendStatus(200);
});

// ─── PayFast Helpers ─────────────────────────────────────────────────────────
/**
 * PHP-equivalent urlencode:
 * JS encodeURIComponent leaves !'()*~ unescaped and encodes spaces as %20.
 * PayFast (PHP backend) requires spaces as + and escapes those characters.
 */
function pfUrlEncode(str) {
  return encodeURIComponent(String(str).trim())
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A')
    .replace(/~/g, '%7E')
    .replace(/%20/g, '+');
}

function pfSignature(params) {
  const str = Object.keys(params)
    .filter(k => k !== 'signature' && params[k] !== null && params[k] !== undefined)
    .map(k => `${k}=${pfUrlEncode(params[k])}`)
    .join('&');
  const withPassphrase = PF.passphrase
    ? `${str}&passphrase=${pfUrlEncode(PF.passphrase)}`
    : str;
  return md5(withPassphrase);
}

/** PayFast-permitted source IP ranges (keep in sync with docs) */
const PF_IPS = [
  '197.97.145.144', '197.97.145.145', '197.97.145.146', '197.97.145.147',
  '41.74.179.194',  '41.74.179.195',  '41.74.179.196',  '41.74.179.197',
];

// ─── API: Checkout (PayFast) ──────────────────────────────────────────────────
app.post('/api/checkout', async (req, res) => {
  const { order } = req.body;
  
  await Log.create({
    id: `log-${Date.now()}-checkout`,
    type: 'info', message: 'Checkout initiated',
    context: 'PAYMENT', data: { customer: order?.customer, email: order?.email, total: order?.total }
  }).catch(() => {});
  if (!order) return res.status(400).json({ error: 'Missing order.' });

  // Which method? Decided (and validated) before any stock is reserved, so a bad choice costs nothing.
  const methods = await availablePaymentMethods();
  if (methods.length === 0) {
    return res.status(503).json({ error: 'Online payments are temporarily unavailable. Please try again shortly.', code: 'no_payment_method' });
  }
  const requestedMethod = String(req.body.paymentMethod || order.paymentMethod || '').toLowerCase();
  const method = requestedMethod || methods[0];
  if (!methods.includes(method)) {
    return res.status(400).json({ error: 'That payment method isn\u2019t available. Please choose another.', code: 'method_unavailable', methods });
  }

  let shippingConfig = { freeMinimum: 500, standardRate: 99 };
  try {
    const site = await Settings.findOne({ _id: 'main' }).lean();
    if (site?.shipping) shippingConfig = site.shipping;
  } catch { /* use defaults */ }

  const orderId      = `ORD-${Date.now()}`;

  // ── Stock validation & deduction (per size/color variant) ──────────────────
  // Prices, names and images are re-read from the product records — never taken
  // from the client — so a tampered cart can't set its own price.
  const requestedItems = Array.isArray(order.items) ? order.items : [];
  if (requestedItems.length === 0) return res.status(400).json({ error: 'Your cart is empty.' });

  const orderItems = []; // sanitized, server-priced line items persisted on the Order
  let subtotal = 0;
  const stockErrors = [];
  const deducted = []; // successfully-deducted items, kept for rollback on partial failure

  for (const rawItem of requestedItems) {
    const item = {
      ...rawItem,
      quantity: Math.floor(Number(rawItem?.quantity)),
    };
    if (!Number.isFinite(item.quantity) || item.quantity < 1 || item.quantity > 99) {
      stockErrors.push(`"${rawItem?.name || 'An item'}" has an invalid quantity.`);
      continue;
    }

    const pId = String(item.productId || item.id || '');
    let query = { id: pId };
    if (mongoose.Types.ObjectId.isValid(pId)) query = { $or: [{ id: pId }, { _id: pId }] };

    const product = pId ? await Product.findOne(query).lean() : null;
    if (!product) {
      stockErrors.push(`"${item.name}" is no longer available.`);
      continue;
    }
    // From here on the display name is the real product's, not the client's claim.
    item.name = product.name;

    const hasVariants = Array.isArray(product.variants) && product.variants.length > 0;
    const size = item.size || '', color = item.color || '';
    const variant = hasVariants ? findVariant(product, size, color) : null;
    const available = hasVariants ? (variant?.stock ?? 0) : product.stock;
    const variantLabel = [size, color].filter(Boolean).join(' / ');

    if (hasVariants && !variant) {
      stockErrors.push(`"${item.name}"${variantLabel ? ` (${variantLabel})` : ''} is no longer available in that size/color.`);
      continue;
    }
    if (available < item.quantity) {
      stockErrors.push(
        available === 0
          ? `"${item.name}"${variantLabel ? ` (${variantLabel})` : ''} is sold out.`
          : `"${item.name}"${variantLabel ? ` (${variantLabel})` : ''} only has ${available} unit${available !== 1 ? 's' : ''} left (you requested ${item.quantity}).`
      );
      continue;
    }

    // Deduct atomically and conditionally so two simultaneous checkouts can't both
    // claim the last unit of the same size/color combination.
    let result;
    if (hasVariants) {
      result = await Product.updateOne(
        { ...query, variants: { $elemMatch: { size, color, stock: { $gte: item.quantity } } } },
        { $inc: { 'variants.$[v].stock': -item.quantity, stock: -item.quantity } },
        { arrayFilters: [{ 'v.size': size, 'v.color': color }] }
      );
    } else {
      result = await Product.updateOne(
        { ...query, stock: { $gte: item.quantity } },
        { $inc: { stock: -item.quantity } }
      );
    }

    if (result.modifiedCount === 0) {
      stockErrors.push(`"${item.name}"${variantLabel ? ` (${variantLabel})` : ''} was just claimed by another order. Please try again.`);
      continue;
    }

    deducted.push({ query, size, color, quantity: item.quantity, hasVariants });
    orderItems.push({
      id: product.id,
      productId: product.id,
      name: product.name,
      price: product.price,
      quantity: item.quantity,
      size,
      color,
      image: product.image || product.images?.[0] || '',
    });
    subtotal += product.price * item.quantity;
  }

  if (stockErrors.length > 0) {
    // Roll back anything already deducted so a partial failure doesn't strand stock.
    for (const d of deducted) {
      if (d.hasVariants) await adjustVariantStock(d.query, d.size, d.color, d.quantity);
      else await Product.updateOne(d.query, { $inc: { stock: d.quantity } });
    }
    return res.status(400).json({ error: 'Some items are out of stock.', stockErrors });
  }

  const shippingCost = subtotal >= shippingConfig.freeMinimum ? 0 : shippingConfig.standardRate;
  const grandTotal   = (subtotal + shippingCost).toFixed(2);

  try {
    await Order.create({
      id: orderId,
      customer: order.customer || '',
      email:    order.email    || '',
      phone:    order.phone    || '',
      address:  order.address  || '',
      // Structured fields alongside the composed `address` display string above —
      // Cart.svelte sends both; these are what shipping the order actually needs.
      deliveryStreet:     order.deliveryStreet     || '',
      deliveryCity:       order.deliveryCity       || '',
      deliveryProvince:   order.deliveryProvince   || '',
      deliveryPostalCode: order.deliveryPostalCode || '',
      deliveryCountry:    order.deliveryCountry    || 'ZA',
      items:    orderItems,
      total:    parseFloat(grandTotal),
      shippingCost,
      status: 'pending_payment',
      paymentMethod: method,
    });
    emitOrderEvent('created', { id: orderId, customer: order.customer, total: parseFloat(grandTotal), status: 'pending_payment' });
  } catch (err) {
    console.error('Order save error:', err.message);
    // Stock was already deducted above — give it back, otherwise a failed save strands it.
    for (const d of deducted) {
      if (d.hasVariants) await adjustVariantStock(d.query, d.size, d.color, d.quantity).catch(() => {});
      else await Product.updateOne(d.query, { $inc: { stock: d.quantity } }).catch(() => {});
    }
    return res.status(500).json({ error: 'Could not create order.' });
  }

  const baseUrl = `${req.protocol}://${req.get('host')}`;

  // ── Yoco: create a hosted checkout and send the customer to it ─────────────
  if (method === 'yoco') {
    const cents = (n) => Math.round(n * 100);
    const lineItems = orderItems.map(i => ({
      displayName: [i.name, [i.size, i.color].filter(Boolean).join(' / ')].filter(Boolean).join(' — ').slice(0, 100),
      quantity: i.quantity,
      pricingDetails: { price: cents(i.price) },
    }));
    if (shippingCost > 0) lineItems.push({ displayName: 'Shipping', quantity: 1, pricingDetails: { price: cents(shippingCost) } });
    try {
      const checkout = await createYocoCheckout(YOCO, {
        amount: cents(parseFloat(grandTotal)),
        currency: 'ZAR',
        successUrl: `${baseUrl}/payment/success?orderId=${orderId}&m=yoco`,
        cancelUrl:  `${baseUrl}/payment/cancel?orderId=${orderId}`,
        failureUrl: `${baseUrl}/payment/cancel?orderId=${orderId}&reason=failed`,
        clientReferenceId: orderId,
        externalId: orderId,
        metadata: { orderId },
        lineItems,
      }, `order-${orderId}`);
      await Order.updateOne({ id: orderId }, { $set: { yocoCheckoutId: checkout.id } });
      return res.json({ method: 'yoco', redirectUrl: checkout.redirectUrl, orderId });
    } catch (err) {
      console.error(`[Yoco] Could not create checkout for ${orderId}:`, err.message);
      await dbLog({
        id: `log-${Date.now()}-yoco-create`,
        type: 'error', message: `Yoco: could not create checkout for ${orderId}`,
        context: 'YOCO', data: { orderId, error: err.message, status: err.status || 0, detail: err.detail || null },
      });
      if (err instanceof YocoError && err.kind === 'auth') {
        notifyAdminOfError(err, req, 'Yoco rejected the API key, so customers cannot pay by card. Check YOCO_SECRET_KEY_* and YOCO_SANDBOX in your environment.').catch(() => {});
      }
      // Nothing was charged — undo the reservation so the cart can simply be retried or paid another way.
      await releaseOrder(orderId, 'payment_failed').catch(e => console.error('releaseOrder failed:', e.message));
      return res.status(502).json({
        error: 'Card payments are temporarily unavailable. Please try again in a moment' + (methods.length > 1 ? ' or choose another payment method.' : '.'),
        code: 'payment_unavailable', methods,
      });
    }
  }

  // Fields MUST be in this exact order per PayFast documentation
  const params = {};
  // Merchant details
  params.merchant_id   = PF.merchantId;
  params.merchant_key  = PF.merchantKey;
  // Return URLs
  params.return_url    = `${baseUrl}/payment/success`;
  params.cancel_url    = `${baseUrl}/payment/cancel?orderId=${orderId}`;
  params.notify_url    = `${baseUrl}/api/payfast/itn`;
  // Buyer details
  params.name_first    = (order.customer || 'Customer').split(' ')[0].slice(0, 100);
  params.name_last     = (order.customer || '').split(' ').slice(1).join(' ').slice(0, 100);
  params.email_address = (order.email || '').slice(0, 255);
  // Transaction details
  params.m_payment_id  = orderId;           // our internal order reference
  params.amount        = grandTotal;        // must be '0.00' format, min R1.00
  params.item_name     = `Others. Order ${orderId}`.slice(0, 100);
  params.item_description = `${order.items?.length || 1} item(s)`.slice(0, 255);

  // Clean the params object of any empty properties
  Object.keys(params).forEach(k => {
    if (params[k] === '' || params[k] === null || params[k] === undefined) {
      delete params[k];
    }
  });

  // Generate signature
  params.signature = pfSignature(params);

  res.json({ method: 'payfast', paymentUrl: PF_HOST, params, orderId });
});

// ─── Order release / stock helpers ───────────────────────────────────────────
const stockQuery = (item) => {
  const pId = item.productId || item.id;
  return mongoose.Types.ObjectId.isValid(pId) ? { $or: [{ id: pId }, { _id: pId }] } : { id: pId };
};

/** Cancels an order that is still awaiting payment and gives its stock back. Atomic: only the call that
 *  actually flips pending_payment → cancelled restores stock, so repeated/racing calls can't double-restore. */
async function releaseOrder(orderId, reason = 'customer', { olderThan = null } = {}) {
  const filter = { id: orderId, status: 'pending_payment' };
  if (olderThan) filter.createdAt = { $lt: olderThan }; // sweeper: re-checked atomically, so a fresh order is never swept
  const before = await Order.findOneAndUpdate(
    filter,
    { $set: { status: 'cancelled', cancelReason: reason } },
    { returnDocument: 'before' }
  ).lean();
  if (!before) return null;
  for (const item of Array.isArray(before.items) ? before.items : []) {
    await adjustVariantStock(stockQuery(item), item.size, item.color, item.quantity);
  }
  // Abandoned orders are housekeeping, not news: the admin list refreshes, but no "cancelled" toast.
  emitOrderEvent(reason === 'abandoned' ? 'abandoned' : 'cancelled', { ...before, status: 'cancelled' });
  return before;
}

// ─── Abandoned payments ──────────────────────────────────────────────────────
// A customer who closes the tab at the payment page never triggers a cancel or a webhook, which used to
// leave their order "pending payment" with its stock reserved indefinitely. This sweep cancels any order
// still unpaid after Settings → Payments → "release unpaid orders after" (default 60 min, 15 min–24 h).
// It is safe to run often and from several instances: each order flips in one atomic update. If the
// customer did pay after all (a slow bank / delayed webhook), the payment handlers re-reserve stock.
const ABANDON_MIN = 15, ABANDON_MAX = 1440, ABANDON_DEFAULT = 60;
let sweeping = false;
async function sweepAbandonedOrders() {
  if (sweeping || mongoose.connection.readyState !== 1) return 0;
  sweeping = true;
  try {
    let minutes = ABANDON_DEFAULT;
    try {
      const p = (await Settings.findOne({ _id: 'main' }).select('payments').maxTimeMS(3000).lean())?.payments;
      if (Number.isFinite(p?.abandonAfterMinutes)) minutes = Math.min(ABANDON_MAX, Math.max(ABANDON_MIN, Math.round(p.abandonAfterMinutes)));
    } catch { /* default */ }
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    const stale = await Order.find({ status: 'pending_payment', createdAt: { $lt: cutoff } }).select('id').limit(100).lean();
    let released = 0;
    for (const { id } of stale) {
      try { if (await releaseOrder(id, 'abandoned', { olderThan: cutoff })) released++; }
      catch (e) { console.error(`[Abandoned] could not release ${id}:`, e.message); }
    }
    if (released) {
      console.log(`[Abandoned] Released ${released} unpaid order(s) older than ${minutes} min.`);
      await dbLog({ id: `log-${Date.now()}-abandoned`, type: 'info', message: `Released ${released} abandoned checkout${released === 1 ? '' : 's'} (unpaid after ${minutes} min)`, context: 'PAYMENT', data: { released, minutes } });
    }
    return released;
  } catch (e) {
    console.error('[Abandoned] sweep failed:', e.message);
    return 0;
  } finally {
    sweeping = false;
  }
}

/** Re-reserves stock for an order that was cancelled (stock released) but then turned out to be paid.
 *  Returns the names of items that could no longer be reserved. */
async function reclaimStock(items) {
  const short = [];
  for (const item of Array.isArray(items) ? items : []) {
    const query = stockQuery(item);
    const product = await Product.findOne(query).lean();
    const hasVariants = Array.isArray(product?.variants) && product.variants.length > 0;
    const size = item.size || '', color = item.color || '';
    let result = { modifiedCount: 0 };
    if (product && hasVariants) {
      result = await Product.updateOne(
        { ...query, variants: { $elemMatch: { size, color, stock: { $gte: item.quantity } } } },
        { $inc: { 'variants.$[v].stock': -item.quantity, stock: -item.quantity } },
        { arrayFilters: [{ 'v.size': size, 'v.color': color }] }
      );
    } else if (product) {
      result = await Product.updateOne({ ...query, stock: { $gte: item.quantity } }, { $inc: { stock: -item.quantity } });
    }
    if (result.modifiedCount === 0) short.push(item.name || String(item.productId || item.id));
  }
  return short;
}

// ─── API: Cancel Payment (Restore Stock) ───────────────────────────────────────
// Where the customer lands after cancelling (or failing) at PayFast or Yoco. Only an order that is
// still unpaid is touched; a paid one is never cancelled by this.
async function cancelCheckoutHandler(req, res) {
  const { orderId } = req.body || {};
  if (!orderId || typeof orderId !== 'string') return res.status(400).json({ error: 'Missing orderId.' });
  try {
    const exists = await Order.exists({ id: orderId });
    if (!exists) return res.status(404).json({ error: 'Order not found.' });
    const released = await releaseOrder(orderId, req.body.reason === 'failed' ? 'payment_failed' : 'customer');
    if (released) console.log(`[Checkout] Order ${orderId} cancelled by customer. Stock restored.`);
    res.json({ ok: true });
  } catch (err) {
    console.error('Cancel payment error:', err);
    res.status(500).json({ error: 'Failed to process cancellation.' });
  }
}
app.post('/api/checkout/cancel', cancelCheckoutHandler);
app.post('/api/payfast/cancel', cancelCheckoutHandler); // original path, kept for pages already open

// What the "payment successful" page polls while it waits for the provider's webhook. Deliberately
// returns nothing but a state — no order contents.
app.get('/api/checkout/status', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const orderId = String(req.query.orderId || '');
  if (!orderId) return res.status(400).json({ error: 'Missing orderId.' });
  try {
    const order = await Order.findOne({ id: orderId }).select('status').maxTimeMS(3000).lean();
    if (!order) return res.json({ state: 'unknown' });
    const state = ['paid', 'processing', 'shipped', 'delivered'].includes(order.status) ? 'paid' : order.status === 'cancelled' ? 'cancelled' : 'pending';
    res.json({ state });
  } catch {
    res.status(503).json({ error: 'Status unavailable.' });
  }
});

// Methods the checkout may show right now (enabled by the admin AND configured on the server).
app.get('/api/payment-methods', async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  const ids = await availablePaymentMethods();
  res.json({ methods: ids.map(id => ({ id, label: PAYMENT_METHODS[id].label, description: PAYMENT_METHODS[id].description })) });
});

// For Settings → Payments: whether each provider's credentials are in place (never the credentials themselves).
app.get('/api/admin/payments', requireAdmin, (req, res) => {
  const base = (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
  res.json({
    payfast: { configured: PF_CONFIGURED, mode: PF.sandbox ? 'sandbox' : 'live' },
    yoco: {
      configured: YOCO.configured, mode: YOCO.mode,
      hasKey: Boolean(YOCO.secretKey), hasWebhookSecret: Boolean(YOCO.webhookSecret), keyMismatch: YOCO.keyMismatch,
      webhookUrl: `${base}/api/yoco/webhook`,
    },
  });
});

// ─── Yoco webhook ────────────────────────────────────────────────────────────
// The ONLY thing that marks a Yoco order paid. Authenticated by its HMAC signature (not by origin/IP).
// Status codes matter: Yoco retries any non-2xx for ~a day, so transient problems (DB down) answer 5xx
// to get a retry, while "this will never succeed" cases (unknown order, wrong amount) answer 200.
app.post('/api/yoco/webhook', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (!YOCO.webhookSecret) {
    console.error('[Yoco] Webhook received but no YOCO_WEBHOOK_SECRET_* is configured.');
    return res.status(503).json({ error: 'Webhook not configured.' });
  }
  const verified = verifyYocoWebhook({ rawBody: req.rawBody, headers: req.headers, secret: YOCO.webhookSecret });
  if (!verified.ok) {
    console.warn(`[Yoco] Webhook rejected (${verified.reason}) from ${ip}`);
    await dbLog({
      id: `log-${Date.now()}-yoco-bad`,
      type: verified.reason === 'stale' ? 'warn' : 'error',
      message: verified.reason === 'stale' ? 'Yoco webhook: timestamp outside tolerance' : 'Yoco webhook: invalid signature (tampering check failed)',
      context: 'YOCO_WEBHOOK', data: { reason: verified.reason, ip },
    });
    return res.status(verified.reason === 'stale' ? 400 : 401).json({ error: 'Invalid webhook.' });
  }

  const event = verified.event;
  const payment = event.payload || {};
  try {
    if (event.type !== 'payment.succeeded') {
      // payment.failed: the customer can retry on Yoco's page, so it isn't treated as a cancellation
      // (the cancel/failure redirect handles abandonment). Refund events are informational here.
      await dbLog({
        id: `log-${Date.now()}-yoco-evt`,
        type: event.type === 'payment.failed' ? 'warn' : 'info', message: `Yoco webhook: ${event.type || 'event'}`,
        context: 'YOCO_WEBHOOK', data: { eventId: event.id, paymentId: payment.id, checkoutId: payment.metadata?.checkoutId },
      });
      return res.status(200).json({ ok: true });
    }

    if (mongoose.connection.readyState !== 1) return res.status(503).json({ error: 'Database unavailable, retry.' });

    const expectedMode = YOCO.mode;
    if (payment.mode && payment.mode !== expectedMode) {
      await dbLog({ id: `log-${Date.now()}-yoco-mode`, type: 'warn', message: `Yoco webhook: ignored a ${payment.mode}-mode payment while running in ${expectedMode} mode`, context: 'YOCO_WEBHOOK', data: { eventId: event.id } });
      return res.status(200).json({ ok: true });
    }

    const checkoutId = payment.metadata?.checkoutId || '';
    const metaOrderId = payment.metadata?.orderId || '';
    const order = (checkoutId && await Order.findOne({ yocoCheckoutId: checkoutId }).lean())
      || (metaOrderId && await Order.findOne({ id: String(metaOrderId), paymentMethod: 'yoco' }).lean())
      || null;
    if (!order) {
      await dbLog({ id: `log-${Date.now()}-yoco-noorder`, type: 'warn', message: 'Yoco webhook: payment for an unknown checkout', context: 'YOCO_WEBHOOK', data: { eventId: event.id, checkoutId, paymentId: payment.id } });
      return res.status(200).json({ ok: true });
    }

    // The signature proves it came from Yoco; this proves it's for the right amount.
    if (payment.currency !== 'ZAR' || Number(payment.amount) !== Math.round(order.total * 100)) {
      await dbLog({
        id: `log-${Date.now()}-yoco-amt`, type: 'error', message: `Yoco webhook: amount mismatch for #${order.id}`,
        context: 'YOCO_WEBHOOK', data: { orderId: order.id, paid: payment.amount, currency: payment.currency, expected: Math.round(order.total * 100) },
      });
      return res.status(200).json({ ok: true });
    }

    // Atomic transition → idempotent under Yoco's retries and double deliveries.
    const before = await Order.findOneAndUpdate(
      { id: order.id, status: { $in: ['pending_payment', 'pending', 'cancelled'] } },
      { $set: { status: 'paid', paymentMethod: 'yoco', yocoPaymentId: String(payment.id || '') } },
      { returnDocument: 'before' }
    ).lean();
    if (!before) return res.status(200).json({ ok: true, duplicate: true });

    let updated = { ...before, status: 'paid', paymentMethod: 'yoco', yocoPaymentId: String(payment.id || '') };
    if (before.status === 'cancelled') {
      // They paid after the checkout was cancelled (stock was released). Re-reserve what we can and tell the admin.
      const short = await reclaimStock(before.items);
      if (short.length) {
        const note = `Paid after the checkout was cancelled; stock could not be re-reserved for: ${short.join(', ')}. Check availability before shipping.`;
        await Order.updateOne({ id: order.id }, { $set: { internalNote: note } });
        updated.internalNote = note;
      }
      await dbLog({ id: `log-${Date.now()}-yoco-late`, type: 'warn', message: `Yoco payment arrived for cancelled order ${order.id}${short.length ? ' (some stock short)' : ''}`, context: 'PAYMENT', data: { orderId: order.id, short } });
    }

    emitOrderEvent('paid', updated);
    await dbLog({ id: `log-${Date.now()}-pay-ok`, type: 'info', message: `Payment completed for order ${order.id}`, context: 'PAYMENT', data: { orderId: order.id, method: 'yoco', paymentId: payment.id } });
    const base = (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
    sendOrderNotification(updated, base).catch(e => console.error('Error sending Yoco admin notification:', e));
    sendCustomerStatusEmail(updated, base).catch(e => console.error('Error sending Yoco customer email:', e));
    console.log(`✓ Yoco: order ${order.id} marked PAID (payment ${payment.id})`);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Yoco webhook processing error:', err.message);
    return res.status(500).json({ error: 'Processing failed, retry.' }); // → Yoco retries
  }
});

app.post('/api/payfast/itn', async (req, res) => {
  // Step 1 — Respond 200 immediately so PayFast does not retry
  console.log(`[ITN] Request received from PayFast (IP: ${req.headers["x-forwarded-for"] || req.socket.remoteAddress})`);
  res.status(200).send('OK');

  await dbLog({
    id: `log-${Date.now()}-itn-rx`,
    type: 'info', message: 'ITN: Request received from PayFast',
    context: 'PAYFAST_ITN', data: { body: req.body, ip: (req.headers['x-forwarded-for'] || req.socket.remoteAddress) }
  }).catch(() => {});

  try {
    // Step 2 — IP allowlist check (skip in sandbox mode)
    if (!PF.sandbox) {
      const srcIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
      if (!PF_IPS.includes(srcIp)) {
        await dbLog({
          id: `log-${Date.now()}-itn-ip`,
          type: 'warn', message: `ITN: rejected from untrusted IP ${srcIp}`,
          context: 'PAYFAST_ITN', data: { ip: srcIp }
        });
        return;
      }
    }

    const itnData = req.body;
    const { m_payment_id: orderId, payment_status, pf_payment_id, amount_gross } = itnData;

    const received = { ...itnData };
    delete received.signature;
    const computed = pfSignature(received);
    if (computed !== itnData.signature) {
      console.error(`[ITN] Signature mismatch for #${orderId}`);
      await dbLog({
        id: `log-${Date.now()}-itn-sig`,
        type: 'error', message: 'ITN: invalid signature (tampering check failed)',
        context: 'PAYFAST_ITN', data: { received: itnData.signature, computed, orderId }
      });
      return;
    }

    // Step 4 — Amount check (if DB is up)
    if (mongoose.connection.readyState === 1) {
      try {
        const dbOrder = await Order.findOne({ id: orderId }).maxTimeMS(2000).lean();
        if (dbOrder && Math.abs(parseFloat(amount_gross) - dbOrder.total) > 0.05) {
          await dbLog({
            id: `log-${Date.now()}-itn-amt`,
            type: 'error', message: `ITN: amount mismatch for #${orderId}`,
            context: 'PAYFAST_ITN', data: { orderId, itnAmount: amount_gross, dbTotal: dbOrder.total }
          });
          return;
        }
      } catch (e) {
        console.warn('ITN: could not verify amount (DB busy/offline)');
      }
    }

    // Step 5 — Server-to-server data validation with PayFast
    if (!PF.sandbox) {
      const pfValidateHost = 'www.payfast.co.za';
      const pfValidatePath = '/eng/query/validate';
      const pfBody = Object.entries(itnData)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
      try {
        const { default: https } = await import('node:https');
        await new Promise((resolve, reject) => {
          const pfReq = https.request({
            host: pfValidateHost, path: pfValidatePath, method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(pfBody) },
          }, pfRes => {
            let body = '';
            pfRes.on('data', c => (body += c));
            pfRes.on('end', () => body.trim() === 'VALID' ? resolve() : reject(new Error(`PayFast validation: ${body.trim()}`)));
          });
          pfReq.on('error', reject);
          pfReq.write(pfBody);
          pfReq.end();
        });
      } catch (e) {
        console.warn('ITN: PayFast server validation failed —', e.message);
        return;
      }
    }

    // Step 6 — All checks passed, update order status
    if (payment_status === 'COMPLETE') {
      let updated = null;
      if (mongoose.connection.readyState === 1) {
        try {
          const prev = await Order.findOneAndUpdate(
            { id: orderId },
            { $set: { status: 'paid', paymentMethod: 'payfast', payfastId: pf_payment_id || '' } },
            { returnDocument: 'before', maxTimeMS: 2000 }
          ).lean();
          if (prev) {
            updated = { ...prev, status: 'paid', paymentMethod: 'payfast', payfastId: pf_payment_id || '' };
            if (['paid', 'processing', 'shipped', 'delivered'].includes(prev.status)) {
              // PayFast re-sends ITNs; the order is already paid and fulfilled-or-fulfilling — nothing more to do.
              console.log(`ITN: duplicate COMPLETE for ${orderId} (already ${prev.status}) ignored`);
              return;
            }
            if (prev.status === 'cancelled') {
              // Paid after the checkout was cancelled or swept as abandoned: stock was released, so take it back.
              const short = await reclaimStock(prev.items);
              if (short.length) {
                const note = `Paid after the checkout was cancelled; stock could not be re-reserved for: ${short.join(', ')}. Check availability before shipping.`;
                await Order.updateOne({ id: orderId }, { $set: { internalNote: note } });
                updated.internalNote = note;
              }
              await dbLog({ id: `log-${Date.now()}-pf-late`, type: 'warn', message: `PayFast payment arrived for cancelled order ${orderId}${short.length ? ' (some stock short)' : ''}`, context: 'PAYMENT', data: { orderId, short } });
            }
          }
        } catch (e) {
          console.error(`ITN: DB status update failed for ${orderId}:`, e.message);
        }
      }

      if (updated) {
        emitOrderEvent('paid', updated);
        await dbLog({
          id: `log-${Date.now()}-pay-ok`,
          type: 'info', message: `Payment completed for order ${orderId}`,
          context: 'PAYMENT', data: { orderId, pfId: pf_payment_id }
        }).catch(() => {});

        // Trigger admin notifications for the newly paid order
        const itnBaseUrl = `${req.protocol}://${req.get('host')}`;
        sendOrderNotification(updated, itnBaseUrl).catch(e => console.error('Error sending ITN admin notification:', e));

        // Also send customer success email
        sendCustomerStatusEmail(updated, itnBaseUrl).catch(e => console.error('Error sending ITN customer email:', e));
      } else {
        // DB is offline or findOneAndUpdate failed/timed out
        console.warn(`ITN: Payment COMPLETE for ${orderId} but DB is OFFLINE. Sending emergency email.`);
        const emergencyOrder = {
          id: orderId,
          total: Number(itnData.amount_gross) || 0,
          customer: `${itnData.name_first || ''} ${itnData.name_last || ''}`.trim() || 'Unknown Customer',
          email: itnData.email_address || 'unknown@email.com',
          address: 'Check PayFast dashboard for details (DB is currently offline)',
          items: []
        };
        emitOrderEvent('paid', emergencyOrder);
        sendOrderNotification(emergencyOrder, `${req.protocol}://${req.get('host')}`).catch(e => console.error('Error sending ITN emergency admin notification:', e));
      }
      console.log(`✓ ITN: order ${orderId} marked PAID (PayFast ID: ${pf_payment_id})`);
    } else {
      let updated = null;
      if (mongoose.connection.readyState === 1) {
        try {
          updated = await Order.findOneAndUpdate(
            { id: orderId, status: { $nin: ['paid', 'processing', 'shipped', 'delivered'] } }, // a stray FAILED/PENDING notice must never cancel a paid order
            { $set: { status: 'cancelled', cancelReason: 'payment_failed' } },
            { returnDocument: 'before', maxTimeMS: 2000 }
          );
        } catch (e) {
          console.error(`ITN: DB status cancel failed for ${orderId}:`, e.message);
        }
      }
      
      // Only selectively restore stock if the order wasn't ALREADY cancelled.
      if (updated) emitOrderEvent('cancelled', { ...updated, status: 'cancelled' });
      if (updated && updated.status !== 'cancelled') {
        const orderItems = Array.isArray(updated.items) ? updated.items : [];
        for (const item of orderItems) {
          const pId = item.productId || item.id;
          let query = { id: pId };
          if (mongoose.Types.ObjectId.isValid(pId)) query = { $or: [{ id: pId }, { _id: pId }] };
          await adjustVariantStock(query, item.size, item.color, item.quantity);
        }
      }

      if (mongoose.connection.readyState === 1) {
        await dbLog({
          id: `log-${Date.now()}-pay-fail`,
          type: 'warn', message: `Payment failure/cancel: status=${payment_status} for order ${orderId}`,
          context: 'PAYMENT', data: { orderId, status: payment_status }
        }).catch(() => {});
      }

      console.log(`ITN: order ${orderId} — payment_status=${payment_status}`);
    }
  } catch (err) {
    console.error('ITN processing error:', err.message);
  }
});
// ─── SEO / Social Sharing Meta Tags ────────────────────────────────────────────
// This is a client-rendered SPA with one static index.html shell, so the
// <svelte:head> tags each page sets only ever exist after JavaScript runs.
// Link-unfurlers (Facebook, Twitter/X, Slack, Discord, WhatsApp, iMessage,
// LinkedIn) fetch the raw HTML and never execute JS, so they only ever saw the
// bare shell — every shared link showed a generic/blank preview. These routes
// render real <title>/description/og:*/twitter:* tags into the HTML server-side,
// before it's sent, so previews actually work. Client-side <svelte:head> tags
// still run on top for real visitors navigating the SPA; this is what crawlers see.
function escapeHtmlAttr(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Resize/compress a Cloudinary image for a ~1200x630 share thumbnail; leave other URLs untouched. */
function optimizeShareImage(url) {
  if (!url || !url.includes('res.cloudinary.com')) return url || '';
  return url.replace('/upload/', '/upload/c_fill,g_auto,w_1200,h_630,q_auto,f_auto/');
}

function renderMetaTags({ siteName, title, description, image, url, type = 'website', extra = '' }) {
  const safeTitle = escapeHtmlAttr(title);
  const safeDesc = escapeHtmlAttr((description || '').replace(/<[^>]*>/g, '').slice(0, 200));
  const safeImage = escapeHtmlAttr(optimizeShareImage(image));
  const safeUrl = escapeHtmlAttr(url);

  return `
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDesc}">
  <meta property="og:site_name" content="${escapeHtmlAttr(siteName)}">
  <meta property="og:type" content="${type}">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeDesc}">
  <meta property="og:url" content="${safeUrl}">
  ${safeImage ? `<meta property="og:image" content="${safeImage}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">` : ''}
  <meta name="twitter:card" content="${safeImage ? 'summary_large_image' : 'summary'}">
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="twitter:description" content="${safeDesc}">
  ${safeImage ? `<meta name="twitter:image" content="${safeImage}">` : ''}
  ${extra}`;
}

// The static loading screen in index.html (#boot) is filled in with the store's own logo/name and
// colours, so the very first paint is already on-brand. Cached briefly — it's on every page view.
let bootCache = { at: 0, admin: null, store: null };

/** The store's brand icon (favicon, else logo) as a square PNG of the given size; '' if none is set. */
function brandIconUrl(site, size) {
  const base = site?.favicon || site?.logo || '';
  if (!base) return '';
  return base.includes('res.cloudinary.com') && base.includes('/upload/')
    ? base.replace('/upload/', `/upload/c_pad,f_png,q_auto,w_${size},h_${size}/`)
    : base;
}

/** Name/logo/colours/favicon for the HTML shell, cached for a minute (it's read on every page view). */
let brandInfoCache = { at: 0, info: null };
async function getBrandInfo() {
  if (brandInfoCache.info && Date.now() - brandInfoCache.at < 60000) return brandInfoCache.info;
  const info = { name: 'Others.', logo: '', favicon: '', bg: '#f8f5f2', fg: '#211c1a' };
  if (getIsConnected()) {
    try {
      const site = await Settings.findOne({ _id: 'main' }).maxTimeMS(800).lean();
      info.name = site?.name || info.name;
      info.logo = site?.logo || '';
      info.favicon = site?.favicon || '';
      info.bg = site?.colors?.background || info.bg;
      info.fg = site?.colors?.foreground || info.fg;
    } catch { /* defaults */ }
  }
  brandInfoCache = { at: Date.now(), info };
  return info;
}

/** <link>/<meta> tags for the browser tab, home-screen and PWA install — always the store's own icon. */
function iconHead(info, bg) {
  const icon32 = brandIconUrl(info, 64);
  const apple = brandIconUrl(info, 180);
  const safeBg = /^#[0-9a-f]{3,8}$/i.test(bg || '') ? bg : '#ffffff';
  return [
    icon32 ? `<link rel="icon" type="image/png" href="${escapeHtmlAttr(icon32)}">` : '<link rel="icon" type="image/svg+xml" href="/favicon.svg">',
    apple ? `<link rel="apple-touch-icon" href="${escapeHtmlAttr(apple)}">` : '',
    '<link rel="manifest" href="/manifest.json">',
    `<meta name="theme-color" content="${safeBg}">`,
  ].join('\n  ');
}

async function bootBrand(admin) {
  const slot = admin ? 'admin' : 'store';
  if (bootCache[slot] && Date.now() - bootCache.at < 60000) return bootCache[slot];
  const info = await getBrandInfo();
  const { name, logo, bg, fg } = info;
  const safeColor = (c, d) => (/^#[0-9a-f]{3,8}$/i.test(c || '') ? c : d);
  const brand = {
    icons: iconHead(info, admin ? '#fafafa' : safeColor(bg, '#f8f5f2')),
    style: admin ? 'background:#fafafa;color:#09090b' : `background:${safeColor(bg, '#f8f5f2')};color:${safeColor(fg, '#211c1a')}`,
    inner: logo
      ? `<img class="boot-logo" src="${escapeHtmlAttr(logo.includes('res.cloudinary.com') && logo.includes('/upload/') ? logo.replace('/upload/', '/upload/c_limit,w_440,f_auto,q_auto/') : logo)}" alt="${escapeHtmlAttr(name)}">`
      : `<span class="boot-mark">${escapeHtmlAttr(name)}</span>`,
  };
  bootCache = { ...bootCache, at: Date.now(), [slot]: brand };
  return brand;
}

/** Sends the SPA shell with the brand loading screen filled in (and optional extra <head> content). */
async function sendShell(res, { admin = false, head = '' } = {}) {
  try {
    const brand = await bootBrand(admin);
    let html = fs.readFileSync(path.resolve(__dirname, 'public', 'index.html'), 'utf-8');
    html = html.replace('__BOOT_STYLE__', () => brand.style).replace('<!--BOOT-->', () => brand.inner);
    html = html.replace('<head>', () => `<head>\n  ${brand.icons}`);
    if (admin) html = html.replace('<div id="boot"', '<div id="boot" class="boot-admin"');
    if (head) { html = html.replace('<title>The Other Shop</title>', '').replace('<head>', () => `<head>${head}`); }
    res.send(html);
  } catch (err) {
    console.warn('Shell render failed:', err.message);
    res.sendFile(path.resolve(__dirname, 'public', 'index.html'));
  }
}

async function serveWithMeta(res, metaOptions) {
  await sendShell(res, { head: renderMetaTags(metaOptions) });
}

/** Site-wide fallbacks used whenever a specific page has nothing more specific of its own. */
/** <link rel="preload"> for the home hero image, using exactly the URLs the page will request
 * (same widths/transform as src/lib/cloudinary.js) so the browser starts the download from the
 * raw HTML instead of waiting for the JS bundle to boot and render. */
function heroPreloadTag(url) {
  if (!url || !url.includes('res.cloudinary.com') || !url.includes('/upload/')) return '';
  const at = (w) => url.replace('/upload/', `/upload/c_limit,w_${w},f_auto,q_auto/`);
  const srcset = [320, 480, 640, 960, 1280, 1600, 2000].map(w => `${at(w)} ${w}w`).join(', ');
  return `<link rel="preload" as="image" href="${escapeHtmlAttr(at(960))}" imagesrcset="${escapeHtmlAttr(srcset)}" imagesizes="100vw" fetchpriority="high">`;
}

async function getSeoDefaults() {
  try {
    const site = await Settings.findOne({ _id: 'main' }).maxTimeMS(1000).lean();
    return {
      siteName: site?.name || 'Others.',
      title: site?.metaTitle || site?.name || 'Others.',
      description: site?.metaDescription || site?.description || site?.tagline || '',
      image: site?.ogImage || site?.logo || '',
      // The home page's LCP element (only when the hero is an image, not a video).
      heroImage: site?.hero?.video || site?.hero?.enabled === false ? '' : (site?.hero?.image || ''),
    };
  } catch {
    return { siteName: 'Others.', title: 'Others.', description: '', image: '', heroImage: '' };
  }
}

app.get('/', async (req, res) => {
  const d = await getSeoDefaults();
  serveWithMeta(res, {
    siteName: d.siteName,
    title: d.title,
    description: d.description,
    image: d.image,
    url: `${req.protocol}://${req.get('host')}/`,
    extra: heroPreloadTag(d.heroImage),
  });
});

app.get('/shop', async (req, res) => {
  const d = await getSeoDefaults();
  serveWithMeta(res, {
    siteName: d.siteName,
    title: `Shop All — ${d.siteName}`,
    description: d.description || `Browse the full ${d.siteName} collection.`,
    image: d.image,
    url: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
  });
});

app.get('/shop/:id', async (req, res) => {
  const [d, product] = await Promise.all([
    getSeoDefaults(),
    Product.findOne({ id: req.params.id }).lean().catch(() => null),
  ]);
  serveWithMeta(res, {
    siteName: d.siteName,
    title: product ? `${product.name} — ${d.siteName}` : `Product — ${d.siteName}`,
    description: product?.description || d.description,
    image: product?.image || product?.images?.[0] || d.image,
    url: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
    type: 'product',
  });
});

app.get('/lookbook', async (req, res) => {
  const d = await getSeoDefaults();
  serveWithMeta(res, {
    siteName: d.siteName,
    title: `Lookbook — ${d.siteName}`,
    description: d.description || `Editorial photography and campaign imagery from ${d.siteName}.`,
    image: d.image,
    url: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
  });
});

app.get('/lookbook/:id', async (req, res) => {
  const [d, lookbook] = await Promise.all([
    getSeoDefaults(),
    Lookbook.findOne({ id: req.params.id }).lean().catch(() => null),
  ]);
  const image = lookbook?.coverImage || lookbook?.items?.find(i => i.type === 'image')?.url || d.image;
  serveWithMeta(res, {
    siteName: d.siteName,
    title: lookbook ? `${lookbook.title} — ${d.siteName} Lookbook` : `Lookbook — ${d.siteName}`,
    description: lookbook?.description || d.description,
    image,
    url: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
  });
});

app.get('/community', async (req, res) => {
  const d = await getSeoDefaults();
  serveWithMeta(res, {
    siteName: d.siteName,
    title: `Community — ${d.siteName}`,
    description: d.description || `Stories, news and culture from the ${d.siteName} community.`,
    image: d.image,
    url: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
  });
});

app.get('/community/:slug', async (req, res) => {
  const [d, article] = await Promise.all([
    getSeoDefaults(),
    Article.findOne({ slug: req.params.slug, published: true }).lean().catch(() => null),
  ]);
  const extra = article
    ? `<meta property="article:published_time" content="${escapeHtmlAttr(article.date)}">\n  <meta property="article:author" content="${escapeHtmlAttr(article.author)}">`
    : '';
  serveWithMeta(res, {
    siteName: d.siteName,
    title: article ? `${article.title} — ${d.siteName}` : `Community — ${d.siteName}`,
    description: article?.excerpt || d.description,
    image: article?.image || d.image,
    url: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
    type: article ? 'article' : 'website',
    extra,
  });
});

app.get('/contact', async (req, res) => {
  const d = await getSeoDefaults();
  serveWithMeta(res, {
    siteName: d.siteName,
    title: `Contact — ${d.siteName}`,
    description: `Get in touch with the ${d.siteName} team. Enquiries, returns, press and collaborations.`,
    image: d.image,
    url: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
  });
});

app.get('/faq', async (req, res) => {
  const d = await getSeoDefaults();
  serveWithMeta(res, {
    siteName: d.siteName,
    title: `FAQ — ${d.siteName}`,
    description: `Frequently asked questions about ${d.siteName} products, shipping, returns and more.`,
    image: d.image,
    url: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
  });
});

app.get('/shipping-returns', async (req, res) => {
  const d = await getSeoDefaults();
  serveWithMeta(res, {
    siteName: d.siteName,
    title: `Shipping & Returns — ${d.siteName}`,
    description: `${d.siteName} shipping policy, return information and delivery times.`,
    image: d.image,
    url: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
  });
});

// ─── Admin Routes (Basic Auth protected) ─────────────────────────────────────
// The SPA shell is public — it renders the sign-in screen itself until /api/admin/session
// confirms a session. All admin *data* sits behind requireAdmin.
app.get(/^\/admin(\/.*)?$/, (_req, res) => sendShell(res, { admin: true }));

// ─── SPA Fallback ─────────────────────────────────────────────────────────────
app.use((_req, res) => sendShell(res));

// ─── Boot ─────────────────────────────────────────────────────────────────────
connect().catch(err => {
  console.error('Initial DB Connection failed - starting in failsafe mode');
});

app.listen(port, () => {
  console.log(`\nOthers. Store  → http://localhost:${port}`);
  console.log(`PayFast mode   → ${PF.sandbox ? 'SANDBOX' : 'LIVE'}`);
  console.log(`Admin          → http://localhost:${port}/admin  [${ADMIN_USER}]`);
  console.log(`MongoDB        → ${getIsConnected() ? 'connected' : 'OFFLINE (failsafe active)'}\n`);
});

// Release abandoned checkouts: first pass 90s after boot, then every 5 minutes (ABANDON_SWEEP_MS shortens
// both — a test hook; the time limit itself is the admin setting).
const SWEEP_MS = Number(process.env.ABANDON_SWEEP_MS) || 5 * 60 * 1000;
setTimeout(sweepAbandonedOrders, Math.min(90 * 1000, SWEEP_MS)).unref();
setInterval(sweepAbandonedOrders, SWEEP_MS).unref();

// First check a minute after boot (gives the DB time to connect), then every 30 minutes.
setTimeout(logBackupTick, 60 * 1000).unref();
setInterval(logBackupTick, 30 * 60 * 1000).unref();

// ─── Database Alerts ─────────────────────────────────────────────────────────
mongoose.connection.on('disconnected', () => {
  notifyAdminOfError(
    new Error('DATABASE_CONNECTION_LOST'),
    null,
    'CRITICAL: The store database has disconnected. Automated Hard Maintenance mode is now active.'
  ).catch(e => console.error('Failsafe alert failed:', e.message));
});

// ─── Error Notification ──────────────────────────────────────────────────────
let lastErrorEmailTime = 0;
const ERROR_EMAIL_THROTTLE = 15 * 60 * 1000; // 15 minutes

async function notifyAdminOfError(err, req = null, customMsg = null) {
  if (!process.env.RESEND_API_KEY) return;
  const now = Date.now();
  if (now - lastErrorEmailTime < ERROR_EMAIL_THROTTLE) return;

  lastErrorEmailTime = now;
  try {
    const recipients = await getAdminRecipients();
    if (recipients.length === 0) return;

    const { site, contactAddress } = await getEmailBranding();
    const baseUrl = req ? `${req.protocol}://${req.get('host')}` : (process.env.PUBLIC_URL || `http://localhost:${port}`);
    const shortMessage = String(err.message || 'Unknown error').slice(0, 300);
    await sendTemplate('SystemAlert', {
      brand: await emailBrand(site, contactAddress, baseUrl),
      heading: customMsg ? 'Site alert' : 'Critical site error',
      message: customMsg || 'The system detected an internal error that might need your attention.',
      errorMessage: shortMessage,
      path: req ? `${req.method} ${req.url}` : '',
      adminUrl: `${baseUrl.replace(/\/+$/, '')}/admin/status`,
    }, {
      from: `${site?.name || 'Others.'} Alerts <${EMAIL_FROM}>`, to: recipients,
      subject: `Site alert: ${shortMessage.slice(0, 60)}`, headers: AUTO_HEADERS,
    }, `${customMsg || 'Site error'}: ${shortMessage}`);
  } catch (e) {
    console.error('Failed to send error notification email:', e);
  }
}

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  const status = err.status || 500;
  
  // Log to DB
  Log.create({
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: status >= 500 ? 'error' : 'warn',
    message: err.message,
    context: 'SERVER_ERROR',
    data: { 
      path: req.url, 
      method: req.method,
      stack: err.stack?.slice(0, 500)
    }
  }).catch(e => console.error('Failed to save log to DB:', e));

  // Notify admin if it's a 500 error
  if (status === 500) {
    notifyAdminOfError(err, req).catch(console.error);
  }

  console.error(`[Server Error] ${req.method} ${req.url}`, err);
  
  res.status(status).json({
    error: status === 500 ? 'Internal Server Error' : err.message,
    ok: false
  });
});
