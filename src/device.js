'use strict';
// Small, dependency-free User-Agent reader for the sign-in audit log. It only needs to be
// good enough for a human to recognise "yes, that's my laptop" — not to fingerprint anyone.

function parseUserAgent(ua = '') {
  ua = String(ua || '');
  if (!ua) return { browser: 'Unknown browser', os: 'Unknown OS', type: 'Unknown', label: 'Unknown device' };

  // Browser — order matters: Edge/Opera/Samsung also contain "Chrome", Chrome also contains "Safari".
  const pick = (re) => { const m = ua.match(re); return m ? { v: m[1].split('.')[0] } : null; };
  let browser = 'Unknown browser';
  let m;
  if ((m = pick(/Edg(?:e|A|iOS)?\/([\d.]+)/))) browser = `Edge ${m.v}`;
  else if ((m = pick(/OPR\/([\d.]+)/))) browser = `Opera ${m.v}`;
  else if ((m = pick(/SamsungBrowser\/([\d.]+)/))) browser = `Samsung Internet ${m.v}`;
  else if ((m = pick(/(?:Firefox|FxiOS)\/([\d.]+)/))) browser = `Firefox ${m.v}`;
  else if ((m = pick(/(?:Chrome|CriOS)\/([\d.]+)/))) browser = `Chrome ${m.v}`;
  else if (/Safari\//.test(ua) && (m = pick(/Version\/([\d.]+)/))) browser = `Safari ${m.v}`;
  else if (/curl\//i.test(ua)) browser = 'curl';
  else if (/Postman/i.test(ua)) browser = 'Postman';
  else if (/node|undici/i.test(ua)) browser = 'Node.js client';

  // Operating system
  let os = 'Unknown OS';
  if (/Windows NT 10\.0/.test(ua)) os = 'Windows 10/11'; // the UA can't tell them apart
  else if (/Windows NT 6\.3/.test(ua)) os = 'Windows 8.1';
  else if (/Windows NT 6\.1/.test(ua)) os = 'Windows 7';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if ((m = ua.match(/Android ([\d.]+)/))) os = `Android ${m[1].split('.')[0]}`;
  else if ((m = ua.match(/(?:iPhone|CPU) OS ([\d_]+)/)) && /iPhone|iPad|iPod/.test(ua)) os = `iOS ${m[1].split('_')[0]}`;
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Linux/.test(ua)) os = 'Linux';

  // Device class
  let type = 'Desktop';
  if (/iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) type = 'Tablet';
  else if (/Mobi|iPhone|iPod|Android/.test(ua)) type = 'Mobile';
  else if (/curl|Postman|node|undici/i.test(ua)) type = 'Script';

  return { browser, os, type, label: `${browser} on ${os} (${type})` };
}

module.exports = { parseUserAgent };
