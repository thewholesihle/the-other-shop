#!/usr/bin/env node
'use strict';
// Renders every email with sample data into emails/preview/ (HTML + plain text) plus an index page that
// shows each at phone and desktop width. Open emails/preview/index.html in a browser.
//   npm run emails:preview
const fs = require('fs');
const path = require('path');
const { renderEmail, sanitizeEmailHtml } = require('../src/emails');
const fixtures = require('../emails/fixtures');

(async () => {
  const out = path.join(__dirname, '..', 'emails', 'preview');
  fs.mkdirSync(out, { recursive: true });
  const rows = [];
  for (const [key, props] of Object.entries(fixtures)) {
    const name = key.split('-')[0];
    const p = name === 'Newsletter' ? { ...props, html: sanitizeEmailHtml(props.html, props.brand.url) } : props;
    const { html, text } = await renderEmail(name, p);
    fs.writeFileSync(path.join(out, `${key}.html`), html);
    fs.writeFileSync(path.join(out, `${key}.txt`), text);
    rows.push({ key, kb: (html.length / 1024).toFixed(1) });
    console.log(`${key.padEnd(24)} ${(html.length / 1024).toFixed(1).padStart(6)} KB html, ${text.length} chars text`);
  }
  const page = `<!doctype html><meta charset="utf-8"><title>Email previews</title>
<style>body{font:14px system-ui;margin:24px;background:#e4e4e7}h2{margin:32px 0 8px}.row{display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap}iframe{border:1px solid #a1a1aa;background:#fff;height:900px}</style>
<h1>Email previews</h1>${rows.map(r => `<h2>${r.key} <small>(${r.kb} KB)</small> &middot; <a href="${r.key}.txt">plain text</a></h2><div class="row"><iframe src="${r.key}.html" width="375"></iframe><iframe src="${r.key}.html" width="680"></iframe></div>`).join('')}`;
  fs.writeFileSync(path.join(out, 'index.html'), page);
  console.log(`\nOpen ${path.join(out, 'index.html')}`);
})().catch(e => { console.error(e); process.exit(1); });
