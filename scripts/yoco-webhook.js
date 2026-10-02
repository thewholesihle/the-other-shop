#!/usr/bin/env node
'use strict';
// Registers this store's webhook with Yoco and prints the signing secret (shown ONCE — save it).
//
//   node scripts/yoco-webhook.js https://your-store.example.com/api/yoco/webhook
//
// Uses YOCO_SECRET_KEY_TEST when YOCO_SANDBOX=true, otherwise YOCO_SECRET_KEY_LIVE (from .env).
// Then put the printed value in YOCO_WEBHOOK_SECRET_TEST / YOCO_WEBHOOK_SECRET_LIVE and restart.
// Yoco allows 5 webhooks per account; one per store is recommended.
require('dotenv').config();
const { yocoConfig } = require('../src/services/yoco');

(async () => {
  const url = process.argv[2];
  if (!url || !/^https:\/\//i.test(url)) {
    console.error('Usage: node scripts/yoco-webhook.js https://your-store.example.com/api/yoco/webhook\n(Yoco requires an https address.)');
    process.exit(1);
  }
  const cfg = yocoConfig();
  if (!cfg.secretKey) {
    console.error(`No key found: set YOCO_SECRET_KEY_${cfg.sandbox ? 'TEST' : 'LIVE'} in .env first.`);
    process.exit(1);
  }
  if (cfg.keyMismatch) {
    console.error(`That key doesn't look like a ${cfg.mode} key — check YOCO_SANDBOX.`);
    process.exit(1);
  }

  console.log(`Registering ${url} with Yoco (${cfg.mode} mode)…`);
  const res = await fetch(`${cfg.apiUrl}/webhooks`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.secretKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'others-store', url }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`Yoco said ${res.status}:`, body.message || body.reason || JSON.stringify(body));
    process.exit(1);
  }
  console.log('\nRegistered. Add this to your environment (it is not shown again):\n');
  console.log(`  YOCO_WEBHOOK_SECRET_${cfg.sandbox ? 'TEST' : 'LIVE'}=${body.secret}\n`);
  console.log(`Webhook id: ${body.id}`);
})().catch(err => { console.error(err.message); process.exit(1); });
