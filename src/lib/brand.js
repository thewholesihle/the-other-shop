// The store's name/logo, remembered between visits so the loading screen can show the real
// brand instantly (the server also bakes it into the first HTML — see #boot in index.html).
const KEY = 'others-brand';

export function getBrand() {
  try { return { name: 'Others.', logo: '', dark: false, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { name: 'Others.', logo: '', dark: false }; }
}

/** True for a dark page colour, so the (black) loading animation can be shown in white. Same cut-off as the server's. */
export function isDarkColor(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return false;
  const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
  const lin = (i) => { const v = parseInt(h.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(0) + 0.7152 * lin(2) + 0.0722 * lin(4) < 0.35;
}

export function saveBrand(site) {
  if (!site?.name && !site?.logo) return;
  try { localStorage.setItem(KEY, JSON.stringify({ name: site.name || 'Others.', logo: site.logo || '', dark: isDarkColor(site.colors?.background) })); } catch { /* storage unavailable */ }
}

/** Fades out and removes the static loading screen that index.html ships with. */
export function hideBoot() {
  const el = typeof document !== 'undefined' && document.getElementById('boot');
  if (!el) return;
  el.classList.add('boot-out');
  setTimeout(() => el.remove(), 350);
}
