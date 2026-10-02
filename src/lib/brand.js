// The store's name/logo, remembered between visits so the loading screen can show the real
// brand instantly (the server also bakes it into the first HTML — see #boot in index.html).
const KEY = 'others-brand';

export function getBrand() {
  try { return { name: 'Others.', logo: '', ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { name: 'Others.', logo: '' }; }
}

export function saveBrand(site) {
  if (!site?.name && !site?.logo) return;
  try { localStorage.setItem(KEY, JSON.stringify({ name: site.name || 'Others.', logo: site.logo || '' })); } catch { /* storage unavailable */ }
}

/** Fades out and removes the static loading screen that index.html ships with. */
export function hideBoot() {
  const el = typeof document !== 'undefined' && document.getElementById('boot');
  if (!el) return;
  el.classList.add('boot-out');
  setTimeout(() => el.remove(), 350);
}
