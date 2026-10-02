// Light / dark / system theme for the admin panel. The preference lives in localStorage (per
// browser); "system" follows the OS and updates live when it changes. The resolved theme is applied
// as a `dark` class on the .admin-root element, which both re-points the colour variables
// (index.css) and switches on Tailwind's `dark:` variants.
import { writable, get } from 'svelte/store';

const KEY = 'admin-theme';
const MODES = ['system', 'light', 'dark'];

function read() {
  try { const v = localStorage.getItem(KEY); return MODES.includes(v) ? v : 'system'; } catch { return 'system'; }
}

export const themeMode = writable(read());

const query = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
export const resolve = (mode) => (mode === 'system' ? (query?.matches ? 'dark' : 'light') : mode);

export const resolvedTheme = writable(resolve(get(themeMode)));

function sync() { resolvedTheme.set(resolve(get(themeMode))); }
themeMode.subscribe(sync);
query?.addEventListener?.('change', sync);

export function setThemeMode(mode) {
  if (!MODES.includes(mode)) return;
  try { localStorage.setItem(KEY, mode); } catch { /* private mode — still works for this visit */ }
  themeMode.set(mode);
}

// Svelte action for the admin root: keeps the `dark` class in step with the resolved theme.
export function adminThemeClass(node) {
  const apply = (t) => { node.classList.toggle('dark', t === 'dark'); node.style.colorScheme = t; };
  const unsub = resolvedTheme.subscribe(apply);
  return { destroy: unsub };
}
