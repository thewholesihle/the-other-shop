'use strict';
// Usage:  node scripts/hash-password.js "your long passphrase"
// Prints a value for ADMIN_PASS_HASH. With it set, the plaintext ADMIN_PASS is no
// longer used for sign-in, so the real password never has to sit in your host's env.
const crypto = require('crypto');

const password = process.argv[2];
if (!password) {
  console.error('Usage: node scripts/hash-password.js "<password>"');
  process.exit(1);
}
if (password.length < 12) console.warn('Warning: use at least 12 characters (a long passphrase is best).');

const N = 32768; // scrypt cost
const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(password, salt, 64, { N, r: 8, p: 1, maxmem: 128 * N * 8 * 2 });
console.log(`ADMIN_PASS_HASH=scrypt$${N}$${salt.toString('base64')}$${hash.toString('base64')}`);
