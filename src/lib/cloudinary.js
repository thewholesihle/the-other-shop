/**
 * Media optimisation helpers.
 *
 * Every image and video URL that points at Cloudinary is rewritten on the fly so the browser
 * only ever downloads what it needs: the right size (c_limit never upscales), the best format
 * for that browser (f_auto → AVIF/WebP/MP4/WebM) and an automatic quality level (q_auto).
 * URLs from anywhere else (YouTube, local files) pass through untouched.
 */

const isCloudinary = (url) => typeof url === 'string' && url.includes('res.cloudinary.com') && url.includes('/upload/');

function withTransform(url, transform) {
  const i = url.indexOf('/upload/');
  return `${url.slice(0, i + 8)}${transform}/${url.slice(i + 8)}`;
}

// Widths a responsive <img srcset> chooses between. Capped at 2000 — beyond that the extra
// pixels are invisible on virtually every screen but cost real bytes.
export const DEFAULT_WIDTHS = [320, 480, 640, 960, 1280, 1600, 2000];

/**
 * @param {string} url      Original (Cloudinary) URL
 * @param {number|'auto'} width  Max width in px (never upscales) or 'auto' to keep the original size
 * @param {{ height?: number }} [opts]  With a height, crops to that box around the subject (g_auto)
 */
export function getOptimizedUrl(url, width = 'auto', opts = {}) {
  if (!isCloudinary(url)) return url;
  const t = [];
  if (opts.height && width !== 'auto') t.push('c_fill', 'g_auto', `h_${opts.height}`, `w_${width}`);
  else if (width !== 'auto') t.push('c_limit', `w_${width}`);
  t.push('f_auto', 'q_auto');
  return withTransform(url, t.join(','));
}

/** HTML srcset string, e.g. "…w_320… 320w, …w_480… 480w". Empty for non-Cloudinary URLs. */
export function getSrcset(url, widths = DEFAULT_WIDTHS) {
  if (!isCloudinary(url)) return '';
  return widths.map((w) => `${getOptimizedUrl(url, w)} ${w}w`).join(', ');
}

/** Small square-ish thumbnail for admin lists and previews. */
export const thumb = (url, size = 96) => getOptimizedUrl(url, size * 2, { height: size * 2 });

// ── Video ─────────────────────────────────────────────────────────────────────

/** Streams the best codec/bitrate for the viewer (f_auto,q_auto), capped at `width`. */
export function getVideoUrl(url, width = 1280) {
  if (!isCloudinary(url)) return url;
  return withTransform(url, `c_limit,f_auto,q_auto,w_${width}`);
}

/** A still frame (first frame, JPEG/WebP via f_auto isn't allowed for .jpg so we pin f_jpg). */
export function getVideoPoster(url, width = 1280) {
  if (!isCloudinary(url)) return '';
  const still = withTransform(url, `c_limit,f_jpg,q_auto,so_0,w_${width}`);
  return still.replace(/\.(mp4|webm|mov|m4v|ogv)(\?.*)?$/i, '.jpg');
}

export const isGif = (url) => typeof url === 'string' && /\.gif(\?.*)?$/i.test(url);
export const isVideoFile = (url) => typeof url === 'string' && /\.(mp4|webm|mov|m4v|ogv)(\?.*)?$/i.test(url);

// ── Embeds ────────────────────────────────────────────────────────────────────

/** Extracts a YouTube video id from watch, short, or embed URLs. */
export function youtubeId(url) {
  const m = String(url || '').match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

// ── Rich-text (editor) content ────────────────────────────────────────────────

/**
 * Admin-written HTML (articles, shipping page) can contain full-size images, videos and
 * iframes pasted straight from uploads. This rewrites them so they load efficiently:
 * Cloudinary images get responsive srcsets, everything below the fold is lazy, videos don't
 * preload, and iframes only load when scrolled near.
 */
export function optimizeHtml(html) {
  if (!html || typeof DOMParser === 'undefined') return html || '';
  const doc = new DOMParser().parseFromString(html, 'text/html');

  doc.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src');
    img.setAttribute('loading', 'lazy');
    img.setAttribute('decoding', 'async');
    if (isCloudinary(src)) {
      img.setAttribute('src', getOptimizedUrl(src, 1200));
      img.setAttribute('srcset', getSrcset(src));
      img.setAttribute('sizes', '(max-width: 768px) 100vw, 768px');
    }
  });

  doc.querySelectorAll('video').forEach((v) => {
    const src = v.getAttribute('src');
    v.setAttribute('preload', 'none');
    v.setAttribute('playsinline', '');
    if (isCloudinary(src)) {
      v.setAttribute('src', getVideoUrl(src, 1280));
      if (!v.getAttribute('poster')) v.setAttribute('poster', getVideoPoster(src, 1280));
    }
  });

  doc.querySelectorAll('iframe').forEach((f) => f.setAttribute('loading', 'lazy'));

  return doc.body.innerHTML;
}
