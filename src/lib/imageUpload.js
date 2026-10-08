// Uploading a photo from the admin: measured, shrunk in the browser when it's big, then sent to the server.
import { measureImage } from './lookbook.js';

// Phone and camera photos are routinely 5–15 MB. Re-encode anything over ~1.2 MB as WebP capped at 2560px before it
// leaves the browser: a much faster upload, and no visible quality loss.
export async function shrinkImage(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 1.2 * 1024 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2560 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', 0.88));
    if (blob && blob.size < file.size) return new File([blob], file.name.replace(/\.\w+$/, '') + '.webp', { type: 'image/webp' });
  } catch { /* fall back to the original file */ }
  return file;
}

/** Uploads one photo. Resolves { url, width, height } (the size is 0×0 if the browser couldn't read it). */
export async function uploadImage(file) {
  const [size, ready] = await Promise.all([measureImage(file), shrinkImage(file)]);
  const fd = new FormData();
  fd.append('image', ready);
  const res = await fetch('/api/upload', { method: 'POST', body: fd });
  if (res.status === 401) throw new Error('Your session expired. Please sign in again.');
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Upload failed');
  const { url } = await res.json();
  return { url, width: size?.width || 0, height: size?.height || 0 };
}
