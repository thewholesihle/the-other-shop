'use strict';
// ─── Admin authentication ────────────────────────────────────────────────────
// Server-side sessions behind an HttpOnly, SameSite=Strict cookie, replacing
// HTTP Basic Auth (whose credentials browsers cache and resend for the whole
// origin, with no real logout and no way to add a second factor).
//
//  • Credentials: ADMIN_USER + either ADMIN_PASS_HASH (scrypt, preferred) or ADMIN_PASS.
//    Comparisons are constant-time and always do the same work, hit or miss.
//  • Optional 2FA: set ADMIN_TOTP_SECRET (base32) to require a 6-digit authenticator code.
//  • Sessions: 256-bit random ids held in memory (never in the cookie as data), a fresh
//    id on every login (no fixation), 30-minute idle timeout, 12-hour hard cap,
//    revocable on logout.
//  • CSRF: every session carries its own token which mutating requests must echo in
//    the X-CSRF-Token header (on top of SameSite=Strict and the Origin check).
const crypto = require('crypto');

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const ABSOLUTE_TIMEOUT_MS = 12 * 60 * 60 * 1000;
const MAX_SESSIONS = 20; // a single admin never needs more; caps memory if abused

const sessions = new Map(); // id -> { csrf, createdAt, lastSeen, ip, ua }

const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(sha256(a), sha256(b)); // equal-length digests: no length leak

// ── Password verification ────────────────────────────────────────────────────
// ADMIN_PASS_HASH format:  scrypt$<N>$<saltBase64>$<hashBase64>   (see scripts/hash-password.js)
function verifyScryptHash(password, stored) {
  const [scheme, nStr, saltB64, hashB64] = String(stored).split('$');
  if (scheme !== 'scrypt') return false;
  const N = parseInt(nStr, 10);
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  if (!N || !salt.length || !expected.length) return false;
  const actual = crypto.scryptSync(String(password), salt, expected.length, { N, r: 8, p: 1, maxmem: 128 * N * 8 * 2 });
  return crypto.timingSafeEqual(actual, expected);
}

function verifyCredentials(username, password) {
  const userOk = safeEqual(username ?? '', process.env.ADMIN_USER ?? '');
  let passOk;
  try {
    passOk = process.env.ADMIN_PASS_HASH
      ? verifyScryptHash(password ?? '', process.env.ADMIN_PASS_HASH)
      : safeEqual(password ?? '', process.env.ADMIN_PASS ?? '');
  } catch {
    passOk = false;
  }
  return userOk && passOk; // both are always evaluated before combining
}

// ── TOTP (RFC 6238, SHA-1, 6 digits, 30s step) ───────────────────────────────
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

function hotp(key, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', key).update(buf).digest();
  const off = h[h.length - 1] & 0xf;
  const code = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(code % 1_000_000).padStart(6, '0');
}

const totpEnabled = () => Boolean(process.env.ADMIN_TOTP_SECRET);
let lastTotpStep = 0; // a code can only be used once

/** Returns the matching 30s step (truthy) if the code is valid and unused, else 0.
 *  Doesn't consume it — call consumeTotp() once the whole sign-in has succeeded, so a
 *  typo in the password doesn't burn a good code. When 2FA is off, always returns 1. */
function checkTotp(code) {
  if (!totpEnabled()) return 1;
  const given = String(code ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(given)) return 0;
  const key = base32Decode(process.env.ADMIN_TOTP_SECRET);
  const step = Math.floor(Date.now() / 30000);
  let match = 0;
  for (const drift of [-1, 0, 1]) { // every candidate is checked, hit or miss
    const s = step + drift;
    if (safeEqual(hotp(key, s), given) && s > lastTotpStep) match = s;
  }
  return match;
}

function consumeTotp(step) {
  if (totpEnabled() && step > lastTotpStep) lastTotpStep = step;
}

// ── Sessions & cookies ───────────────────────────────────────────────────────
const cookieName = (secure) => (secure ? '__Host-admin_session' : 'admin_session');

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function sweep() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.lastSeen > IDLE_TIMEOUT_MS || now - s.createdAt > ABSOLUTE_TIMEOUT_MS) sessions.delete(id);
  }
}
setInterval(sweep, 60 * 1000).unref();

function createSession(req) {
  sweep();
  if (sessions.size >= MAX_SESSIONS) {
    // Drop the oldest rather than refuse a legitimate login.
    const oldest = [...sessions.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt)[0];
    if (oldest) sessions.delete(oldest[0]);
  }
  const id = crypto.randomBytes(32).toString('base64url');
  const session = {
    csrf: crypto.randomBytes(24).toString('base64url'),
    createdAt: Date.now(), lastSeen: Date.now(),
    ip: req.ip, ua: String(req.headers['user-agent'] || '').slice(0, 200),
  };
  sessions.set(id, session);
  return { id, session };
}

function getSession(req) {
  const id = parseCookies(req.headers.cookie)[cookieName(req.secure)];
  if (!id) return null;
  const s = sessions.get(id);
  if (!s) return null;
  const now = Date.now();
  if (now - s.lastSeen > IDLE_TIMEOUT_MS || now - s.createdAt > ABSOLUTE_TIMEOUT_MS) {
    sessions.delete(id);
    return null;
  }
  s.lastSeen = now; // sliding idle window
  return Object.assign(s, { id });
}

/** Like getSession, but doesn't extend the idle window — for background heartbeats. */
function peekSession(req) {
  const id = parseCookies(req.headers.cookie)[cookieName(req.secure)];
  const s = id && sessions.get(id);
  if (!s) return null;
  const now = Date.now();
  return now - s.lastSeen > IDLE_TIMEOUT_MS || now - s.createdAt > ABSOLUTE_TIMEOUT_MS ? null : s;
}

function destroySession(req) {
  const id = parseCookies(req.headers.cookie)[cookieName(req.secure)];
  if (id) sessions.delete(id);
}

function setSessionCookie(req, res, id) {
  const secure = req.secure;
  res.append('Set-Cookie', `${cookieName(secure)}=${id}; Path=/; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}; Max-Age=${ABSOLUTE_TIMEOUT_MS / 1000}`);
}

function clearSessionCookie(req, res) {
  const secure = req.secure;
  res.append('Set-Cookie', `${cookieName(secure)}=; Path=/; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}; Max-Age=0`);
}

/** Express middleware: requires a live session; mutating requests also need the CSRF token. */
function requireAdmin(req, res, next) {
  res.set('Cache-Control', 'no-store');
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Not signed in.' });
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const token = req.get('x-csrf-token') || '';
    if (!token || !safeEqual(token, session.csrf)) {
      return res.status(403).json({ error: 'Missing or invalid CSRF token. Reload the page and try again.' });
    }
  }
  req.adminSession = session;
  next();
}

module.exports = {
  verifyCredentials, checkTotp, consumeTotp, totpEnabled, safeEqual,
  createSession, getSession, peekSession, destroySession, setSessionCookie, clearSessionCookie, requireAdmin,
  base32Decode, hotp,
};
