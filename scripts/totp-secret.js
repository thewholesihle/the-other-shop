'use strict';
// Usage:  node scripts/totp-secret.js
// Prints a new ADMIN_TOTP_SECRET and the otpauth:// link to add it to an authenticator
// app (Google Authenticator, 1Password, Authy…). Once set, sign-in also needs the 6-digit code.
const crypto = require('crypto');

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const bytes = crypto.randomBytes(20);
let bits = 0, value = 0, secret = '';
for (const b of bytes) {
  value = (value << 8) | b; bits += 8;
  while (bits >= 5) { secret += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
}
if (bits > 0) secret += B32[(value << (5 - bits)) & 31];

const issuer = 'Others. Admin';
const account = process.env.ADMIN_USER || 'admin';
console.log(`ADMIN_TOTP_SECRET=${secret}`);
console.log(`\nAdd to your authenticator app (manual entry), or open this link:\notpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`);
