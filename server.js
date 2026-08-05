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
const { Settings, Category, Product, Order, Lookbook, Article, Pages, Subscriber, Log } = require('./src/db/models');
const crypto = require('crypto');

const app  = express();
const port = process.env.PORT || 3000;

// Add HTTP request logging
app.use(morgan('dev'));

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

// The admin page itself (where Basic Auth is challenged) previously had no rate
// limiting at all — apiLimiter only covers /api/*, and the /admin route was never
// mounted under it — leaving credential brute-forcing completely unthrottled.
const adminAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // 20 attempts per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' },
});

app.use('/api/checkout', checkoutLimiter);
app.use('/api/', apiLimiter);

// ─── CSRF Guard ───────────────────────────────────────────────────────────────
// Basic Auth credentials are cached and auto-resent by browsers on same-origin
// requests, similar to cookies — a malicious page could still trigger a
// state-changing request against this API from a logged-in admin's browser.
// Reject cross-origin mutations; requests with no Origin/Referer at all (e.g.
// PayFast's server-to-server ITN webhook) are left alone since they're not
// coming from a browser tab in the first place.
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

if (!ADMIN_USER || !ADMIN_PASS) {
  console.error('FATAL: ADMIN_USER and ADMIN_PASS must be set in .env');
  process.exit(1);
}

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
  const isAsset = /\.(js|css|png|jpg|jpeg|gif|svg|webp|ico|json|woff2?|mp4|webm|map)$/i.test(req.path);
  const isAdmin = req.path.startsWith('/admin') || req.path.startsWith('/api/admin');
  const isApi = req.path.startsWith('/api/');

  if (!getIsConnected() && !isAdmin && !isApi && !isAsset) {
    return res.status(503).send(hardMaintenanceHTML);
  }
  next();
});

function basicAuth(req, res, next) {
  const h = req.headers['authorization'];
  if (!h || !h.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Others. Admin"');
    return res.status(401).send('Authentication required.');
  }
  
  try {
    const [user, pass] = Buffer.from(h.slice(6), 'base64').toString().split(':');
    
    // Timing-safe comparison to prevent side-channel attacks
    const userBuffer = Buffer.from(user);
    const adminUserBuffer = Buffer.from(ADMIN_USER);
    const passBuffer = Buffer.from(pass);
    const adminPassBuffer = Buffer.from(ADMIN_PASS);

    if (userBuffer.length === adminUserBuffer.length &&
        passBuffer.length === adminPassBuffer.length &&
        crypto.timingSafeEqual(userBuffer, adminUserBuffer) &&
        crypto.timingSafeEqual(passBuffer, adminPassBuffer)) {
      return next();
    }
  } catch (e) {
    // Basic auth format error
  }

  res.set('WWW-Authenticate', 'Basic realm="Others. Admin"');
  return res.status(401).send('Invalid credentials.');
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

if (!PF.merchantId || !PF.merchantKey) {
  console.error(`FATAL: PAYFAST_MERCHANT_ID_${PF.sandbox ? 'SANDBOX' : 'LIVE'} and PAYFAST_MERCHANT_KEY_${PF.sandbox ? 'SANDBOX' : 'LIVE'} must be set in .env`);
  process.exit(1);
}
const PF_HOST = PF.sandbox
  ? 'https://sandbox.payfast.co.za/eng/process'
  : 'https://www.payfast.co.za/eng/process';

// ─── Email Notifier ──────────────────────────────────────────────────────────
// Raw SMTP sockets kept failing on Render — first IPv6 routes with no egress
// (ENETUNREACH), then, even pinned to a resolved IPv4 address, silent TCP
// timeouts (ETIMEDOUT) — consistent with the platform or the mail provider
// blocking outbound SMTP connections outright. Sending over Resend's HTTPS API
// sidesteps that entirely: it's the same kind of outbound HTTPS call the app
// already makes successfully to Cloudinary and PayFast.
const RESEND_API_URL = 'https://api.resend.com/emails';
const EMAIL_FROM = process.env.SMTP_FROM || 'onboarding@resend.dev';

async function sendEmail({ from, to, subject, html, text, replyTo, headers }) {
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

/** Best-effort plain-text derivation of an email's HTML, preserving link URLs.
 * Every send gets this as the `text` part alongside `html` — some clients render
 * text-only, and having one at all measurably helps spam-filter scoring. */
function htmlToText(html) {
  return String(html || '')
    // Outlook conditional comments (<!--[if mso]>...<![endif]-->) are valid HTML
    // comments end to end, and emailLayout() uses them for its width-table fallback
    // and MSO-only <head> block — left unstripped, their raw contents (stray "96"
    // from <o:PixelsPerInch>, duplicate wrapper markup) leaked straight into the
    // plain-text part. Drop <head> and all comments before anything else runs.
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    // Keep link destinations instead of dropping them with the rest of the tags —
    // a plain-text "Unsubscribe" with no URL next to it is useless. Icon links
    // wrap an <img> with no text, so fall back to its alt text as the label.
    .replace(/<a\s+[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, label) => {
      let text = label.replace(/<[^>]+>/g, '').trim();
      if (!text) {
        const alt = label.match(/alt=["']([^"']*)["']/i);
        if (alt) text = alt[1];
      }
      return href && !href.startsWith('#') ? `${text} (${href})` : text;
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|table|h[1-6]|li)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&zwnj;/gi, '') // zero-width joiner — invisible padding, not real text
    .replace(/&middot;/gi, '·')
    .replace(/&times;/gi, '×')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
  return process.env.UNSUBSCRIBE_SECRET || process.env.ADMIN_PASS || 'others-unsubscribe-fallback-secret';
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

// Small monochrome glyphs, inlined as base64 data-URI <img> sources rather than live
// <svg> (email clients — Outlook especially — render inline SVG unreliably, but a
// data-URI image degrades gracefully everywhere image loading is supported).
const EMAIL_SOCIAL_ICONS = {
  instagram: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/></svg>',
  twitter: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round"><path d="M4 4l16 16M20 4L4 20"/></svg>',
  tiktok: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V6c0-1 1-2 3-2 1.5 3 3 4 6 4"/><circle cx="9" cy="18" r="3"/></svg>',
  youtube: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#ffffff" stroke="none"><path d="M21.6 7.2a2.7 2.7 0 0 0-1.9-1.9C18 5 12 5 12 5s-6 0-7.7.3a2.7 2.7 0 0 0-1.9 1.9A28 28 0 0 0 2 12a28 28 0 0 0 .4 4.8 2.7 2.7 0 0 0 1.9 1.9C6 19 12 19 12 19s6 0 7.7-.3a2.7 2.7 0 0 0 1.9-1.9A28 28 0 0 0 22 12a28 28 0 0 0-.4-4.8zM10 15.5v-7l6 3.5-6 3.5z"/></svg>',
};

const EMAIL_SOCIAL_PLATFORMS = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'twitter',   label: 'Twitter' },
  { key: 'tiktok',    label: 'TikTok' },
  { key: 'youtube',   label: 'YouTube' },
];

function emailSocialLinks(socials) {
  const active = EMAIL_SOCIAL_PLATFORMS.filter(p => socials?.[p.key]?.trim());
  if (!active.length) return '';
  // Table cells, not inline-block <a> tags side by side — Outlook's Word rendering
  // engine supports inline-block inconsistently and can stack these instead of
  // rowing them; a <table> row is the one layout primitive every client agrees on.
  const cells = active.map(p => {
    const iconSrc = `data:image/svg+xml;base64,${Buffer.from(EMAIL_SOCIAL_ICONS[p.key]).toString('base64')}`;
    return `<td style="padding:0 5px;">
      <a href="${socials[p.key]}" style="display:inline-block; width:34px; height:34px; line-height:34px; border-radius:50%; border:1px solid rgba(255,255,255,0.25); text-align:center;">
        <img src="${iconSrc}" width="16" height="16" alt="${p.label}" style="display:inline; vertical-align:middle;" />
      </a>
    </td>`;
  }).join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr>${cells}</tr></table>`;
}

function formatDateLabel(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Wraps email body content in the shared branded header/footer chrome used by every
 * template. Produces a full standalone HTML document (doctype/head/body), not a
 * fragment — Resend forwards `html` verbatim to the mailbox, and clients like
 * Outlook (Word rendering engine) and Windows Mail need the real document
 * structure, an explicit charset, and an Outlook conditional-comment width table
 * to render a fixed-width layout reliably; a bare `<div>` soup degrades badly.
 *
 * `preheader` sets the hidden preview snippet shown next to the subject line in
 * the inbox list. `unsubscribeUrl` is only passed for marketing sends (the
 * newsletter broadcast) — transactional order emails have nothing to unsubscribe
 * from, so the footer link is conditional rather than always present. */
function emailLayout({ siteName, logoUrl, bodyHtml, socials, contactAddress, contactUrl, preheader = '', unsubscribeUrl = '' }) {
  const socialLinksHtml = emailSocialLinks(socials);
  const safeSiteName = escapeHtmlAttr(siteName);
  // Invisible preview text + zero-width joiners to pad it past the boilerplate the
  // client would otherwise pull into the inbox preview snippet (e.g. "View this
  // email in your browser..."). mso-hide keeps Outlook's preview pane from showing it.
  const preheaderHtml = preheader
    ? `<div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:#ffffff; opacity:0;">${escapeHtmlAttr(preheader)}${'&nbsp;&zwnj;'.repeat(10)}</div>`
    : '';

  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="format-detection" content="telephone=no" />
<!-- Locks light mode: this template's dark header/footer against a light body is
     an intentional contrast, not a light-mode default — letting Gmail/Apple Mail/
     Outlook.com auto-dark-mode invert it flattens that and can make text unreadable. -->
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${safeSiteName}</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<![endif]-->
<style>
  body, table, td { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
  img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
  a { text-decoration:none; }
  @media only screen and (max-width:600px) {
    .email-container { width:100% !important; }
    .email-padded { padding-left:20px !important; padding-right:20px !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; width:100%; background:#f4f4f4; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
${preheaderHtml}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f4;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <!--[if mso]>
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" align="center"><tr><td>
      <![endif]-->
      <table role="presentation" class="email-container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px; margin:0 auto; background:#ffffff;">
        <tr>
          <td align="center" style="background:#111111; padding:28px 24px;">
            ${logoUrl
              ? `<img src="${logoUrl}" width="180" height="36" alt="${safeSiteName}" style="max-height:36px; max-width:180px; width:auto; height:auto; display:block; margin:0 auto;" />`
              : `<span style="color:#ffffff; font-size:18px; font-weight:800; letter-spacing:0.2em; text-transform:uppercase;">${safeSiteName}</span>`}
          </td>
        </tr>
        <tr>
          <td class="email-padded" style="padding:40px 32px; color:#111111;">
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td align="center" class="email-padded" style="background:#111111; padding:32px 24px;">
            ${socialLinksHtml ? `
              <p style="color:rgba(255,255,255,0.5); font-size:11px; text-transform:uppercase; letter-spacing:0.1em; margin:0 0 16px;">Want updates through more platforms?</p>
              <div style="margin-bottom:24px;">${socialLinksHtml}</div>
            ` : ''}
            ${contactAddress ? `<p style="color:rgba(255,255,255,0.4); font-size:11px; margin:0 0 12px; line-height:1.5;">${contactAddress}</p>` : ''}
            <p style="margin:0;">
              ${contactUrl ? `<a href="${contactUrl}" style="color:rgba(255,255,255,0.6); font-size:11px;">Contact us</a>` : ''}
              ${contactUrl && unsubscribeUrl ? `<span style="color:rgba(255,255,255,0.3); font-size:11px;">&nbsp;&middot;&nbsp;</span>` : ''}
              ${unsubscribeUrl ? `<a href="${unsubscribeUrl}" style="color:rgba(255,255,255,0.6); font-size:11px;">Unsubscribe</a>` : ''}
            </p>
          </td>
        </tr>
      </table>
      <!--[if mso]>
      </td></tr></table>
      <![endif]-->
    </td>
  </tr>
</table>
</body>
</html>`;
}

/** One order-line-item row, shared by the admin notification and customer status
 * emails. A <table> row, not the flexbox div this used to be — Outlook's Word
 * rendering engine ignores `display:flex` entirely, which collapsed the image,
 * name and quantity into an unreadable stack in that one client. */
function emailItemRow(item, { showPrice = false, currency = 'R' } = {}) {
  const meta = [item.size, item.color].filter(Boolean).join(' / ');
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #eee; margin-bottom:8px;">
      <tr>
        ${item.image ? `<td width="48" valign="top" style="padding:12px 0 12px 12px;"><img src="${item.image}" width="48" height="48" alt="" style="width:48px; height:48px; object-fit:cover; background:#f5f5f5;" /></td>` : ''}
        <td valign="middle" style="padding:12px;">
          <p style="margin:0; font-size:13px; font-weight:600;">${item.name}</p>
          ${meta ? `<p style="margin:2px 0 0; font-size:11px; color:#888;">${meta}</p>` : ''}
        </td>
        <td valign="middle" align="right" style="padding:12px; white-space:nowrap;">
          <p style="margin:0; font-size:12px; color:#666;">${showPrice ? `&times;${item.quantity}` : `Qty: ${item.quantity}`}</p>
          ${showPrice ? `<p style="margin:2px 0 0; font-size:13px; font-weight:600;">${currency}${(item.price * item.quantity).toFixed(2)}</p>` : ''}
        </td>
      </tr>
    </table>`;
}

async function sendOrderNotification(order, baseUrl = '') {
  let recipients = (process.env.ADMIN_EMAIL || 'othersworldwide@gmail.com').split(',').map(s => s.trim()).filter(Boolean);
  
  // Try to get custom emails from DB if connected
  if (mongoose.connection.readyState === 1) {
    try {
      const site = await Settings.findOne({ _id: 'main' }).maxTimeMS(1000).lean();
      if (site?.adminNotificationEmails) {
        recipients = site.adminNotificationEmails.split(',').map(s => s.trim()).filter(Boolean);
      }
      
      await Log.create({
        id: `log-${Date.now()}-adm-mail`,
        type: 'info', message: `Order notification: Sending to ${recipients.join(', ')}`,
        context: 'EMAIL', data: { orderId: order.id, recipients }
      }).catch(() => {});
    } catch (e) {
      console.error('Failed to fetch admin emails from DB (using defaults):', e.message);
    }
  }

  if (recipients.length === 0 || !process.env.RESEND_API_KEY) return;

  try {
    console.log(`[Mail] Sending order notification for #${order.id} to ${recipients.join(', ')}...`);

    const { site, contactAddress } = await getEmailBranding();
    const siteName = site?.name || 'Others.';
    const currency = site?.currency || 'R';

    const itemsHtml = (order.items || []).map(i => emailItemRow(i, { showPrice: true, currency })).join('');

    const totalHtml = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #111; margin-top:16px; margin-bottom:32px;">
        <tr>
          <td style="padding-top:16px; font-weight:700; font-size:16px;">Total paid</td>
          <td align="right" style="padding-top:16px; font-weight:700; font-size:16px;">${currency}${order.total.toFixed(2)}</td>
        </tr>
      </table>
    `;

    const bodyHtml = `
      <h1 style="font-size:22px; font-weight:800; margin:0 0 8px;">New order paid</h1>
      <p style="font-size:14px; color:#666; margin:0 0 32px;">#${order.id} &middot; ${order.customer || 'Customer'} (${order.email || '—'})</p>

      <div style="margin-bottom:24px;">
        <p style="font-size:11px; text-transform:uppercase; letter-spacing:0.05em; color:#888; margin:0 0 4px;">Delivery address</p>
        <p style="font-size:14px; margin:0;">${order.address || '—'}</p>
      </div>

      <p style="font-size:11px; text-transform:uppercase; letter-spacing:0.1em; color:#888; margin:0 0 12px;">Items</p>
      ${itemsHtml}

      ${totalHtml}

      ${baseUrl ? `
        <div style="text-align:center;">
          <a href="${baseUrl}/admin" style="display:inline-block; background:#111; color:#fff; text-decoration:none; padding:14px 32px; font-size:12px; font-weight:700; letter-spacing:0.15em; text-transform:uppercase;">Open Admin Dashboard</a>
        </div>
      ` : ''}
    `;

    const html = emailLayout({
      siteName,
      logoUrl: site?.emailLogo || site?.logo,
      bodyHtml,
      socials: site?.socials,
      contactAddress,
      contactUrl: baseUrl ? `${baseUrl}/contact` : '',
      preheader: `New order #${order.id} — ${currency}${order.total.toFixed(2)} from ${order.customer || 'a customer'}.`,
    });

    await sendEmail({
      from: `${siteName} Store <${EMAIL_FROM}>`,
      to: recipients,
      subject: `New Order Paid: #${order.id}`,
      html,
      text: htmlToText(html),
      // Admin hits reply and it goes straight to the customer, not into the void.
      replyTo: order.email || undefined,
    });
    console.log(`[Email] Notification sent for order ${order.id}`);
  } catch (err) {
    console.error(`[Email] Failed to send invoice email: ${err.message} (code: ${err.code || 'n/a'})`);
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
    transformation: file.mimetype.startsWith('image/')
      ? [{ quality: 'auto', fetch_format: 'auto' }]
      : undefined,
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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
// `index: false` — otherwise this would auto-serve the bare index.html for GET /
// before the SEO-meta-injecting route below ever gets a chance to run.
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

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
  const [site, categories, products, orders, lookbooks, community, pages, subscribers] = await Promise.all([
    Settings.findOne({ _id: 'main' }).lean(),
    Category.find().lean(),
    Product.find().lean(),
    Order.find().sort({ createdAt: -1 }).lean(),
    Lookbook.find().lean(),
    Article.find().lean(),
    Pages.findOne({ _id: 'main' }).lean(),
    Subscriber.find().sort({ date: -1 }).lean(),
  ]);

  return {
    site:        site        || {},
    categories:  categories  || [],
    products:    products    || [],
    orders:      orders      || [],
    lookbooks:   lookbooks   || [],
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
app.delete('/api/products/:id', basicAuth, async (req, res) => {
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
app.delete('/api/community/:id', basicAuth, async (req, res) => {
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

// ─── API: Delete Lookbook ────────────────────────────────────────────────────
app.delete('/api/lookbooks/:id', basicAuth, async (req, res) => {
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
    const firstName = (order.customer || '').split(' ')[0] || 'there';

    const statusMap = { shipped: 'shipped', delivered: 'delivered', cancelled: 'cancelled', paid: 'confirmed' };

    // A shipping update and a payment receipt need different information — a
    // shipped/delivered email is a logistics update (tracking, ETA, address) and
    // has no reason to repeat pricing; a paid/cancelled email is financial and
    // has no tracking info to show yet. Pick what's actually relevant per status.
    const headlineMap = {
      paid: `${firstName}, thank you for your order.`,
      processing: `${firstName}, your order is being prepared.`,
      shipped: `${firstName}, your order is on its way.`,
      delivered: `${firstName}, your order has arrived.`,
      cancelled: `${firstName}, your order has been cancelled.`,
    };
    const headline = headlineMap[order.status] || `${firstName}, your order has been updated.`;

    let messageBody = templates[order.status] || `Your order status has been updated to: ${order.status}.`;
    messageBody = messageBody.replace(/{orderId}/g, `<strong>#${order.id}</strong>`);

    const addressLines = (order.address || '').split(',').map(s => s.trim()).filter(Boolean);
    const showTracking = ['shipped', 'delivered'].includes(order.status) && (order.trackingNumber || order.carrier);
    const showFinancials = ['paid', 'cancelled'].includes(order.status);

    const detailRow = (label, value) => value ? `
      <div style="margin-bottom:20px;">
        <p style="font-size:11px; text-transform:uppercase; letter-spacing:0.05em; color:#888; margin:0 0 4px;">${label}</p>
        <p style="font-size:15px; font-weight:700; margin:0; line-height:1.4;">${value}</p>
      </div>` : '';

    const orderDetailsHtml = `
      <div style="border:1px solid #eee; padding:24px; margin-bottom:24px;">
        ${detailRow('Order number', `#${order.id}`)}
        ${showTracking ? detailRow('Carrier', order.carrier) : ''}
        ${showTracking ? detailRow('Tracking number', order.trackingNumber) : ''}
        ${order.estimatedDelivery ? detailRow('Estimated delivery', formatDateLabel(order.estimatedDelivery)) : ''}
        ${addressLines.length ? detailRow('Delivery address', addressLines.join('<br>')) : ''}
      </div>
    `;

    const itemsHtml = (order.items || []).map(i => emailItemRow(i, { showPrice: false })).join('');

    const financialsHtml = showFinancials ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #eee; margin-bottom:32px;">
        <tr>
          <td style="padding-top:16px; font-size:14px; color:#666;">Subtotal</td>
          <td align="right" style="padding-top:16px; font-size:14px; color:#666;">${currency}${(order.total - (order.shippingCost || 0)).toFixed(2)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0 16px; font-size:14px; color:#666;">Shipping</td>
          <td align="right" style="padding:8px 0 16px; font-size:14px; color:#666;">${order.shippingCost ? `${currency}${order.shippingCost.toFixed(2)}` : 'Free'}</td>
        </tr>
        <tr>
          <td style="padding-top:14px; border-top:1px solid #111; font-size:17px; font-weight:800;">Total</td>
          <td align="right" style="padding-top:14px; border-top:1px solid #111; font-size:17px; font-weight:800;">${currency}${order.total.toFixed(2)}</td>
        </tr>
      </table>
    ` : '';

    const bodyHtml = `
      <h1 style="font-size:24px; font-weight:800; margin:0 0 16px; line-height:1.3;">${headline}</h1>
      <p style="font-size:15px; color:#333; line-height:1.6; margin:0 0 32px;">${messageBody}</p>

      ${order.adminNote ? `
        <div style="background:#f7f7f7; padding:20px; border-left:2px solid #111; margin-bottom:32px;">
          <p style="margin:0; font-size:14px; font-style:italic; color:#444; line-height:1.5;">"${order.adminNote}"</p>
        </div>
      ` : ''}

      ${orderDetailsHtml}

      <p style="font-size:11px; text-transform:uppercase; letter-spacing:0.1em; color:#888; margin:0 0 12px;">Items</p>
      ${itemsHtml}

      ${financialsHtml}

      <p style="text-align:center; font-size:14px; color:#666; margin-top:8px;">Thank you for shopping with ${siteName}.</p>
    `;

    const html = emailLayout({
      siteName,
      logoUrl: site?.emailLogo || site?.logo,
      bodyHtml,
      socials: site?.socials,
      contactAddress,
      contactUrl: baseUrl ? `${baseUrl}/contact` : '',
      preheader: headline,
    });

    await sendEmail({
      from: `${siteName} <${EMAIL_FROM}>`,
      to: order.email,
      subject: `Order Update: #${order.id} [${statusMap[order.status]?.toUpperCase() || order.status.toUpperCase()}]`,
      html,
      text: htmlToText(html),
      // Customer hits reply and it lands in the store's real inbox, not the no-reply sandbox address.
      replyTo: primaryContactEmail(site),
    });
    console.log(`[Email] Customer status update sent for order ${order.id}`);
    return { sent: true, type: order.status, to: order.email };
  } catch (err) {
    console.error(`[Email] Failed to send customer email: ${err.message} (code: ${err.code || 'n/a'})`);
    return { sent: false, reason: err.message };
  }
}

// ─── API: Update Order Status (accept / reject) ─────────────────────────────────
app.patch('/api/orders/:id/status', basicAuth, async (req, res) => {
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
    if (status !== oldOrder.status) {
        emailResult = await sendCustomerStatusEmail(order, `${req.protocol}://${req.get('host')}`)
          .catch(err => ({ sent: false, reason: err.message }));
    }

    res.json({ ok: true, order, emailResult });
  } catch (err) {
    console.error('PATCH /api/orders/:id/status', err);
    res.status(500).json({ error: 'Could not update order status.' });
  }
});

// ─── API: Delete Order ──────────────────────────────────────────────────────────
app.delete('/api/orders/:id', basicAuth, async (req, res) => {
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
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/orders/:id', err);
    res.status(500).json({ error: 'Could not delete order.' });
  }
});

// ─── API: Upload ──────────────────────────────────────────────────────────────
app.post('/api/upload', basicAuth, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  res.json({ url: req.file.path }); // Cloudinary returns secure_url as .path
});

app.post('/api/upload/multi', basicAuth, upload.array('images', 20), (req, res) => {
  if (!req.files?.length) return res.status(400).json({ error: 'No files uploaded.' });
  res.json({ urls: req.files.map(f => f.path) }); // Cloudinary: .path = secure_url
});

// ─── API: Admin Diagnostics ──────────────────────────────────────────────────
app.get('/api/admin/status', basicAuth, async (req, res) => {
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
      cloudinary: cloudinaryOk ? 'configured' : 'missing',
      stats,
      _db_offline: !isConn
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch diagnostics.' });
  }
});

app.get('/api/admin/logs', basicAuth, async (req, res) => {
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

app.delete('/api/admin/logs', basicAuth, async (req, res) => {
  try {
    await Log.deleteMany({});
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear logs.' });
  }
});

// ─── API: Store Data ──────────────────────────────────────────────────────────

// ─── PWA & Favicon Manifest ───────────────────────────────────────────────────
app.get('/manifest.json', async (req, res) => {
  try {
    const site = await Settings.findOne({ _id: 'main' }).lean();
    if (!site) return res.status(404).json({ error: 'Settings not found.' });

    const name = site.name || 'Others.';
    const iconBase = site.favicon || site.logo || '';
    
    let icons = [];
    if (iconBase.includes('cloudinary.com')) {
      icons = [
        { src: iconBase.replace('/upload/', '/upload/c_pad,w_192,h_192/'), sizes: '192x192', type: 'image/png' },
        { src: iconBase.replace('/upload/', '/upload/c_pad,w_512,h_512/'), sizes: '512x512', type: 'image/png' },
        { src: iconBase.replace('/upload/', '/upload/c_pad,w_180,h_180/'), sizes: '180x180', type: 'image/png', purpose: 'apple-touch-icon' }
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
        categories: [], products: [], orders: [], lookbooks: [], community: [], subscribers: [],
        pages: { shipping: { content: '' }, faq: { items: [] }, contact: { address: '', details: [] } },
        _db_offline: true
      });
    }
    const data = await readData();
    res.json(data);
  } catch (err) {
    console.error('API Error:', err);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

app.post('/api/data', basicAuth, async (req, res) => {
  try {
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
  catch (err) { res.status(500).json({ error: err.message }); }
});

// Lean endpoint for the admin panel's background refresh — pulling just orders +
// products (not the whole /api/data blob, which also fetches categories, lookbooks,
// community, pages, and subscribers on every 20s poll for data that rarely changes).
app.get('/api/orders', basicAuth, async (_req, res) => {
  try { res.json(await Order.find().sort({ createdAt: -1 }).lean()); }
  catch (err) { res.status(500).json({ error: err.message }); }
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
app.post('/api/newsletter/broadcast', basicAuth, async (req, res) => {
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

    // Process individually for privacy and deliverability
    let sentCount = 0;
    for (const sub of subscribers) {
      try {
        const token = unsubscribeToken(sub.email);
        const unsubscribeUrl = `${baseUrl}/api/newsletter/unsubscribe?email=${encodeURIComponent(sub.email)}&token=${token}`;
        const emailHtml = emailLayout({
          siteName,
          logoUrl: site?.logo,
          bodyHtml: `<div style="font-size:16px; line-height:1.6;">${html}</div>`,
          socials: site?.socials,
          contactAddress,
          contactUrl: `${baseUrl}/contact`,
          preheader: subject,
          unsubscribeUrl,
        });
        await sendEmail({
          from: `${siteName} <${EMAIL_FROM}>`,
          to: sub.email,
          subject: subject,
          html: emailHtml,
          text: htmlToText(emailHtml),
          replyTo,
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
    res.json({ ok: true, sentCount });
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

  let shippingConfig = { freeMinimum: 500, standardRate: 99 };
  try {
    const site = await Settings.findOne({ _id: 'main' }).lean();
    if (site?.shipping) shippingConfig = site.shipping;
  } catch { /* use defaults */ }

  const subtotal     = parseFloat(order.total) || 0;
  const shippingCost = subtotal >= shippingConfig.freeMinimum ? 0 : shippingConfig.standardRate;
  const grandTotal   = (subtotal + shippingCost).toFixed(2);
  const orderId      = `ORD-${Date.now()}`;

  // ── Stock validation & deduction (per size/color variant) ──────────────────
  const orderItems = Array.isArray(order.items) ? order.items : [];
  const stockErrors = [];
  const deducted = []; // successfully-deducted items, kept for rollback on partial failure

  for (const item of orderItems) {
    const pId = item.productId || item.id;
    let query = { id: pId };
    if (mongoose.Types.ObjectId.isValid(pId)) query = { $or: [{ id: pId }, { _id: pId }] };

    const product = await Product.findOne(query).lean();
    if (!product) {
      stockErrors.push(`"${item.name}" is no longer available.`);
      continue;
    }

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
  }

  if (stockErrors.length > 0) {
    // Roll back anything already deducted so a partial failure doesn't strand stock.
    for (const d of deducted) {
      if (d.hasVariants) await adjustVariantStock(d.query, d.size, d.color, d.quantity);
      else await Product.updateOne(d.query, { $inc: { stock: d.quantity } });
    }
    return res.status(400).json({ error: 'Some items are out of stock.', stockErrors });
  }

  try {
    await Order.create({
      id: orderId,
      customer: order.customer || '',
      email:    order.email    || '',
      phone:    order.phone    || '',
      address:  order.address  || '',
      items:    orderItems,
      total:    parseFloat(grandTotal),
      shippingCost,
      status: 'pending_payment',
    });
  } catch (err) {
    console.error('Order save error:', err.message);
    return res.status(500).json({ error: 'Could not create order.' });
  }

  const baseUrl = `${req.protocol}://${req.get('host')}`;

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

  res.json({ paymentUrl: PF_HOST, params, orderId });
});

// ─── API: Cancel Payment (Restore Stock) ───────────────────────────────────────
app.post('/api/payfast/cancel', async (req, res) => {
  const { orderId } = req.body;
  if (!orderId) return res.status(400).json({ error: 'Missing orderId.' });

  try {
    const order = await Order.findOne({ id: orderId });
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    // Only cancel if it's still pending_payment to avoid double-cancelling or cancelling paid orders
    if (order.status === 'pending_payment') {
      order.status = 'cancelled';
      await order.save();

      // Restore stock
      const orderItems = Array.isArray(order.items) ? order.items : [];
      for (const item of orderItems) {
        const pId = item.productId || item.id;
        let query = { id: pId };
        if (mongoose.Types.ObjectId.isValid(pId)) query = { $or: [{ id: pId }, { _id: pId }] };
        await adjustVariantStock(query, item.size, item.color, item.quantity);
      }

      console.log(`[PayFast] Order ${orderId} cancelled by user. Stock restored.`);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Cancel payment error:', err);
    res.status(500).json({ error: 'Failed to process cancellation.' });
  }
});
app.post('/api/payfast/itn', async (req, res) => {
  // Step 1 — Respond 200 immediately so PayFast does not retry
  console.log(`[ITN] Request received from PayFast (IP: ${req.headers["x-forwarded-for"] || req.socket.remoteAddress})`);
  res.status(200).send('OK');

  await Log.create({
    id: `log-${Date.now()}-itn-rx`,
    type: 'info', message: 'ITN: Request received from PayFast',
    context: 'PAYFAST_ITN', data: { body: req.body, ip: (req.headers['x-forwarded-for'] || req.socket.remoteAddress) }
  }).catch(() => {});

  try {
    // Step 2 — IP allowlist check (skip in sandbox mode)
    if (!PF.sandbox) {
      const srcIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
      if (!PF_IPS.includes(srcIp)) {
        await Log.create({
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
      console.error(`[ITN] Signature mismatch for #${orderId}`);
    if (computed !== itnData.signature) {
      await Log.create({
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
          await Log.create({
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
          updated = await Order.findOneAndUpdate(
            { id: orderId },
            { $set: { status: 'paid', payfastId: pf_payment_id || '' } },
            { returnDocument: 'after', maxTimeMS: 2000 }
          );
        } catch (e) {
          console.error(`ITN: DB status update failed for ${orderId}:`, e.message);
        }
      }

      if (updated) {
        await Log.create({
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
        sendOrderNotification(emergencyOrder, `${req.protocol}://${req.get('host')}`).catch(e => console.error('Error sending ITN emergency admin notification:', e));
      }
      console.log(`✓ ITN: order ${orderId} marked PAID (PayFast ID: ${pf_payment_id})`);
    } else {
      let updated = null;
      if (mongoose.connection.readyState === 1) {
        try {
          updated = await Order.findOneAndUpdate(
            { id: orderId },
            { $set: { status: 'cancelled' } },
            { returnDocument: 'before', maxTimeMS: 2000 }
          );
        } catch (e) {
          console.error(`ITN: DB status cancel failed for ${orderId}:`, e.message);
        }
      }
      
      // Only selectively restore stock if the order wasn't ALREADY cancelled.
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
        await Log.create({
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

function serveWithMeta(res, metaOptions) {
  try {
    const indexPath = path.resolve(__dirname, 'public', 'index.html');
    let html = fs.readFileSync(indexPath, 'utf-8');
    html = html.replace('<title>The Other Shop</title>', '');
    html = html.replace('<head>', `<head>${renderMetaTags(metaOptions)}`);
    res.send(html);
  } catch (err) {
    console.warn('Metadata injection failed:', err.message);
    res.sendFile(path.resolve(__dirname, 'public', 'index.html'));
  }
}

/** Site-wide fallbacks used whenever a specific page has nothing more specific of its own. */
async function getSeoDefaults() {
  try {
    const site = await Settings.findOne({ _id: 'main' }).maxTimeMS(1000).lean();
    return {
      siteName: site?.name || 'Others.',
      title: site?.metaTitle || site?.name || 'Others.',
      description: site?.metaDescription || site?.description || site?.tagline || '',
      image: site?.ogImage || site?.logo || '',
    };
  } catch {
    return { siteName: 'Others.', title: 'Others.', description: '', image: '' };
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
app.get(/^\/admin(\/.*)?$/, adminAuthLimiter, basicAuth, (_req, res) => {
  res.sendFile(path.resolve(__dirname, 'public', 'index.html'));
});

// ─── SPA Fallback ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.sendFile(path.resolve(__dirname, 'public', 'index.html'));
});

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
  if (!process.env.ADMIN_EMAIL || !process.env.RESEND_API_KEY) return;
  const now = Date.now();
  if (now - lastErrorEmailTime < ERROR_EMAIL_THROTTLE) return;

  lastErrorEmailTime = now;
  try {
    const isConnected = mongoose.connection.readyState === 1;
    let recipients = (process.env.ADMIN_EMAIL || 'othersworldwide@gmail.com').split(',').map(s => s.trim()).filter(Boolean);

    if (isConnected) {
      try {
        const site = await Settings.findOne({ _id: 'main' }).maxTimeMS(1000).lean();
        if (site?.adminNotificationEmails) {
          recipients = site.adminNotificationEmails.split(',').map(s => s.trim()).filter(Boolean);
        }
      } catch (e) {
        console.error('Failsafe: error fetching settings for alert:', e.message);
      }
    }

    if (recipients.length === 0) return;

    const alertHtml = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>System Alert</title></head>
<body style="margin:0; padding:0; background:#f4f4f4;">
        <div style="font-family: sans-serif; padding: 20px; color: #111; max-width: 600px; margin: 20px auto; background:#fff; border: 1px solid #eee;">
          <h2 style="color: #d32f2f; text-transform: uppercase; letter-spacing: 0.1em;">${customMsg ? 'System Alert' : 'Critical Site Error'}</h2>
          <p>${customMsg || 'The system detected an internal error that might require your attention.'}</p>
          <div style="background: #f9f9f9; padding: 15px; border-left: 4px solid #d32f2f; margin: 20px 0;">
            ${req ? `<p style="margin: 0 0 10px;"><strong>Path:</strong> ${req.method} ${req.url}</p>` : ''}
            <p style="margin: 0;"><strong>Message:</strong> ${err.message}</p>
          </div>
          <p style="margin-top: 30px;">
            <a href="${req ? `${req.protocol}://${req.get('host')}` : 'http://localhost:' + port}/admin"
               style="display: inline-block; padding: 12px 24px; background: #000; color: #fff; text-decoration: none; font-weight: bold; font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase;">
               Open Admin Dashboard
            </a>
          </p>
          <hr style="margin: 30px 0; border: 0; border-top: 1px solid #eee;" />
          <p style="font-size: 12px; color: #888;">This alert is throttled to once every 15 minutes.</p>
        </div>
</body></html>`;

    await sendEmail({
      from: `Others. System <${EMAIL_FROM}>`,
      to: recipients,
      subject: `[ALERT] Site Error: ${err.message.slice(0, 50)}`,
      html: alertHtml,
      text: htmlToText(alertHtml),
    });
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
