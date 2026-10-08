// Lookbook helpers shared by the storefront and the admin: what kind of thing an item is, which picture stands in as the
// cover, and how to lay media out whatever its shape (wide, square or vertical).
import { getVideoPoster, isVideoFile, youtubeId } from './cloudinary.js';

/** 'embed' | 'video' | 'image', also for older items that were saved without a reliable type. */
export function itemKind(item) {
  const url = String(item?.url || '');
  if (item?.type === 'embed' || /youtube|youtu\.be|vimeo/i.test(url)) return 'embed';
  if (item?.type === 'video' || isVideoFile(url)) return 'video';
  return 'image';
}

/** A still picture that represents the item (used as a cover when nothing better exists). */
export function itemStill(item) {
  const url = item?.url || '';
  if (!url) return '';
  const kind = itemKind(item);
  if (kind === 'image') return url;
  if (kind === 'video') return getVideoPoster(url, 960);        // '' unless the video is on Cloudinary
  const id = youtubeId(url);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '';
}

/**
 * The picture shown for a lookbook in lists and share cards: the uploaded cover, otherwise the FIRST IMAGE in the media
 * (in the order the admin arranged it), otherwise a still from the first video or embed.
 */
export function lookbookCover(lb) {
  if (!lb) return '';
  if (lb.coverImage) return lb.coverImage;
  const items = lb.items?.length ? lb.items : (lb.images || []).map(url => ({ type: 'image', url }));
  const firstImage = items.find(i => i?.url && itemKind(i) === 'image');
  if (firstImage) return firstImage.url;
  for (const item of items) { const still = itemStill(item); if (still) return still; }
  return '';
}

// ── Shape-aware layout ───────────────────────────────────────────────────────
// Every item is shown at its own aspect ratio (no cropping) and packed into rows of equal height, so wide and vertical
// media sit together naturally. A ratio is width ÷ height: 1.78 is 16:9 widescreen, 0.56 is 9:16 vertical.
export const RATIO_MIN = 0.5, RATIO_MAX = 2.4;           // anything more extreme is shown cropped to this
export const DEFAULT_RATIO = { image: 4 / 5, video: 16 / 9, embed: 16 / 9 };

export function ratioOf(width, height) {
  const w = Number(width), h = Number(height);
  return w > 0 && h > 0 ? w / h : 0;
}
/** The ratio a layout should use for an item: the real one when known (clamped), else a sensible guess by type. */
export function layoutRatio(item, measured = 0) {
  const known = ratioOf(item?.width, item?.height) || measured;
  const r = known || DEFAULT_RATIO[itemKind(item)];
  return Math.min(RATIO_MAX, Math.max(RATIO_MIN, r));
}

const COMMON = [['9:16', 9 / 16], ['2:3', 2 / 3], ['3:4', 3 / 4], ['4:5', 4 / 5], ['1:1', 1], ['5:4', 5 / 4], ['4:3', 4 / 3], ['3:2', 3 / 2], ['16:9', 16 / 9], ['2:1', 2], ['21:9', 21 / 9]];
/** { shape: 'Vertical'|'Square'|'Horizontal', label: '9:16' } for showing the admin what they uploaded. */
export function describeShape(width, height) {
  const r = ratioOf(width, height);
  if (!r) return null;
  const shape = r < 0.95 ? 'Vertical' : r > 1.05 ? 'Horizontal' : 'Square';
  const near = COMMON.find(([, v]) => Math.abs(v - r) / v < 0.04);
  return { shape, label: near ? near[0] : `${Math.round(width)}×${Math.round(height)}` };
}

// ── Measuring media in the browser ───────────────────────────────────────────
/** Natural size of an image given as a File or a URL, or null if it can't be read. */
export function measureImage(source) {
  return new Promise((resolve) => {
    const isFile = typeof source !== 'string';
    const src = isFile ? URL.createObjectURL(source) : source;
    const img = new Image();
    const done = (v) => { if (isFile) URL.revokeObjectURL(src); resolve(v); };
    img.onload = () => done(img.naturalWidth ? { width: img.naturalWidth, height: img.naturalHeight } : null);
    img.onerror = () => done(null);
    setTimeout(() => done(null), 15000);
    img.src = src;
  });
}
/** Displayed size of a video File or URL (as a player shows it, so a phone video recorded sideways is reported upright). */
export function measureVideo(source) {
  return new Promise((resolve) => {
    const isFile = typeof source !== 'string';
    const src = isFile ? URL.createObjectURL(source) : source;
    const v = document.createElement('video');
    const done = (r) => { if (isFile) URL.revokeObjectURL(src); v.removeAttribute('src'); v.load(); resolve(r); };
    v.preload = 'metadata'; v.muted = true;
    v.onloadedmetadata = () => done(v.videoWidth ? { width: v.videoWidth, height: v.videoHeight } : null);
    v.onerror = () => done(null);
    setTimeout(() => done(null), 15000);
    v.src = src;
  });
}
