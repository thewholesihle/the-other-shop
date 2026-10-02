'use strict';
// Rendering for every outgoing email. Templates live in /emails (React Email + shadcn-style components) and
// are compiled by `npm run build` into emails/dist/templates.cjs.
const React = require('react');
const { render, plainTextSelectors } = require('@react-email/render');

// Plain-text part: keep headings in normal case (html-to-text shouts them in capitals, which reads like spam).
const TEXT_OPTIONS = {
  wordwrap: 100,
  selectors: [...plainTextSelectors, ...['h1', 'h2', 'h3', 'h4'].map(selector => ({ selector, options: { uppercase: false } }))],
};

let templates = null;
let loadError = null;
try {
  ({ templates } = require('../emails/dist/templates.cjs'));
} catch (err) {
  loadError = err; // the server keeps running; senders fall back to a plain-text message
}

/** Renders a template to { html, text }. The plain-text part comes from the same React tree, so the two
 *  always say the same thing (a text part is a real deliverability signal, and some clients show only it). */
async function renderEmail(name, props) {
  const Template = templates?.[name];
  if (!Template) throw new Error(loadError ? `Email templates are not built (${loadError.message}). Run "npm run build".` : `Unknown email template "${name}"`);
  const element = React.createElement(Template, props);
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true, htmlToTextOptions: TEXT_OPTIONS })]);
  // Gmail clips messages over ~102 KB, which hides the unsubscribe link and the footer.
  if (html.length > 100 * 1024) console.warn(`[Mail] "${name}" is ${(html.length / 1024).toFixed(0)} KB — Gmail will clip it.`);
  return { html, text };
}

/** Makes admin-authored newsletter HTML safe and email-friendly: no scripts, embeds, forms or event
 *  handlers (clients strip them and spam filters punish them), and no javascript: links. */
function sanitizeEmailHtml(html, baseUrl = '') {
  let out = String(html || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed|form|input|button|textarea|select|link|meta|video|audio|source|svg|canvas)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|style|iframe|object|embed|form|input|button|textarea|select|link|meta|video|audio|source|svg|canvas)\b[^>]*\/?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(href|src)\s*=\s*("|')\s*(javascript|data|vbscript):[^"']*\2/gi, ' $1="#"');
  if (baseUrl) {
    const base = baseUrl.replace(/\/+$/, '');
    out = out.replace(/\s(href|src)\s*=\s*("|')(\/(?!\/)[^"']*)\2/gi, (_m, attr, q, p) => ` ${attr}=${q}${base}${p}${q}`);
  }
  return out;
}

module.exports = { renderEmail, sanitizeEmailHtml, emailTemplatesReady: () => Boolean(templates), emailTemplatesError: () => loadError };
