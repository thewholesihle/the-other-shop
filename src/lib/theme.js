/**
 * Turns the five colours an admin picks (background, text, primary, border, hover) into a complete,
 * accessible set of design tokens for the storefront.
 *
 * Whatever palette is chosen, every text/background pair the site actually renders is checked against
 * WCAG 2.1 and, where it falls short, nudged (same hue, adjusted lightness) until it passes:
 *   • body text            ≥ 7:1   (AAA)
 *   • muted / secondary    ≥ 4.5:1 (AA)  — descriptions, captions, labels
 *   • links & hover text   ≥ 4.5:1 on light surfaces AND on the dark footer
 *   • button hover fill    its label colour is picked for ≥ 4.5:1
 *   • input borders / focus ring ≥ 3:1 (WCAG 1.4.11 non-text contrast)
 *   • error / success      ≥ 4.5:1 with their own on-colours
 */

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function parseHex(hex) {
  let h = String(hex || '').trim().replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}
export const toHex = (rgb) => '#' + rgb.map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');

const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
export const luminance = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
export function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return [h * 360, s * 100, l * 100];
}
export function hslToRgb([h, s, l]) {
  h = ((h % 360) + 360) % 360 / 360; s /= 100; l /= 100;
  if (s === 0) { const v = l * 255; return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t); // t=0 → a, t=1 → b

/** Same hue/saturation, lightness moved (away from `against`) until `min` contrast is reached. */
export function ensureContrast(color, against, min) {
  if (contrast(color, against) >= min * 1.03) return color;
  min *= 1.04; // small margin: the final CSS values are rounded to whole HSL units
  const [h, s, l] = rgbToHsl(color);
  // Move toward whichever extreme (black or white) can actually reach the target on this surface.
  const goDarker = contrast([0, 0, 0], against) >= contrast([255, 255, 255], against);
  let best = goDarker ? [0, 0, 0] : [255, 255, 255];
  let lo = goDarker ? 0 : l, hi = goDarker ? l : 100;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const cand = hslToRgb([h, s, mid]);
    if (contrast(cand, against) >= min) { best = cand; if (goDarker) lo = mid; else hi = mid; }
    else { if (goDarker) hi = mid; else lo = mid; }
  }
  return best;
}

const bestOn = (bg, options) => options.reduce((a, b) => (contrast(b, bg) > contrast(a, bg) ? b : a));
const hsl = (rgb) => { const [h, s, l] = rgbToHsl(rgb); return `${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%`; };

// The palette shipped in index.css — used for any colour that's missing or isn't valid hex.
const DEFAULTS = {
  background: hslToRgb([40, 20, 97]),
  foreground: hslToRgb([30, 10, 12]),
  primary: hslToRgb([30, 10, 12]),
  border: hslToRgb([35, 12, 86]),
  hover: hslToRgb([18, 58, 46]),
};

const WHITE = [255, 255, 255], BLACK = [0, 0, 0];

export function buildTheme(colors = {}) {
  const pick = (k) => parseHex(colors?.[k]) || DEFAULTS[k];
  const bg = pick('background');
  const chosen = { fg: pick('foreground'), primary: pick('primary'), border: pick('border'), hover: pick('hover') };

  // Text must read as text on the page background.
  const fg = ensureContrast(chosen.fg, bg, 7);
  const primary = ensureContrast(chosen.primary, bg, 3);

  // Muted text: start halfway between page and text colour, then strengthen until it passes on
  // both the page and the (slightly tinted) muted surface.
  const muted = mix(bg, chosen.border, 0.5);
  let mutedFg = mix(bg, fg, 0.45);
  for (let t = 0.45; t <= 1 && (contrast(mutedFg, bg) < 4.7 || contrast(mutedFg, muted) < 4.7); t += 0.02) mutedFg = mix(bg, fg, t);

  // Borders: decorative hairlines stay as chosen (but never invisible); form-control borders must be ≥3:1.
  let border = chosen.border;
  if (contrast(border, bg) < 1.2) border = mix(bg, fg, 0.12);
  let input = border;
  for (let t = 0; t <= 1 && contrast(input, bg) < 3.15; t += 0.02) input = mix(border, fg, t);

  // Hover: link/text colour on light surfaces, and a (usually lighter) variant for the dark footer.
  const hover = ensureContrast(chosen.hover, bg, 4.5);
  const hoverOnDark = ensureContrast(chosen.hover, fg, 4.5);
  // The button hover fill is the chosen hover colour as long as some label colour reads on it.
  const hoverFill = [bg, fg].some(c => contrast(c, chosen.hover) >= 4.5) ? chosen.hover : hover;
  const onHover = bestOn(hoverFill, [bg, fg]);

  const ring = ensureContrast(chosen.primary, bg, 3);
  const accentFg = bestOn(hover, [bg, fg]);

  // Footer (dark) secondary text.
  const onDarkMuted = ensureContrast(mix(fg, bg, 0.7), fg, 4.5);

  // Semantic colours, tuned per palette so they pass on this background.
  const destructive = ensureContrast(hslToRgb([0, 72, 42]), bg, 4.5);
  const destructiveOnDark = ensureContrast(hslToRgb([0, 85, 68]), fg, 4.5); // error text in the dark footer
  const success = ensureContrast(hslToRgb([142, 64, 26]), bg, 4.5);

  const vars = {
    background: hsl(bg), foreground: hsl(fg),
    primary: hsl(primary), 'primary-foreground': hsl(bg),
    border: hsl(border), input: hsl(input), ring: hsl(ring),
    hover: hsl(hover), 'hover-on-dark': hsl(hoverOnDark), 'hover-fill': hsl(hoverFill), 'on-hover': hsl(onHover),
    accent: hsl(hover), 'accent-foreground': hsl(accentFg),
    card: hsl(bg), 'card-foreground': hsl(fg), popover: hsl(bg), 'popover-foreground': hsl(fg),
    secondary: hsl(border), 'secondary-foreground': hsl(fg),
    muted: hsl(muted), 'muted-foreground': hsl(mutedFg),
    'on-dark-muted': hsl(onDarkMuted),
    'destructive-on-dark': hsl(destructiveOnDark),
    destructive: hsl(destructive), 'destructive-foreground': hsl(bestOn(destructive, [WHITE, BLACK])),
    success: hsl(success), 'success-foreground': hsl(bestOn(success, [WHITE, BLACK])),
  };

  // For the admin's contrast checker: what was chosen vs what the storefront will actually use.
  const row = (id, label, a, b, min, applied, appliedAgainst = b) => {
    const ratio = contrast(a, b);
    return { id, label, min, ratio: Math.round(ratio * 10) / 10, pass: ratio >= min, applied: toHex(applied), appliedRatio: Math.round(contrast(applied, appliedAgainst) * 10) / 10 };
  };
  const checks = [
    row('text', 'Text on background', chosen.fg, bg, 7, fg),
    row('hover-text', 'Link hover on background', chosen.hover, bg, 4.5, hover),
    row('hover-dark', 'Link hover in the dark footer', chosen.hover, chosen.fg, 4.5, hoverOnDark, fg),
    row('border', 'Form borders on background', chosen.border, bg, 3, input),
    row('button', 'Button hover label', onHover, hoverFill, 4.5, onHover),
  ];

  return { vars, checks, hex: { background: toHex(bg), foreground: toHex(fg), hover: toHex(hover), mutedForeground: toHex(mutedFg) } };
}

/** `:root { --x: …; }` declarations for a theme. */
export const themeCss = (vars) => Object.entries(vars).map(([k, v]) => `--${k}: ${v};`).join('\n');
