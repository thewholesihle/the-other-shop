// Uploading a video from the admin. Two paths, chosen by the server (see "Video upload" in server.js):
//   • cloudinary: the browser sends the original straight to Cloudinary in small signed chunks (resumable on a bad connection)
//     and Cloudinary prepares the web versions. The app server does no video work, which is what a small instance needs.
//   • server: the file goes to our server, ffmpeg compresses it (src/videoPipeline.js), and we follow that job to a URL.
import { getCsrf } from './csrf.js';
import { measureVideo } from './lookbook.js';

let capsPromise = null;
/** What the server can do: { mode, compression, maxMb, maxMinutes, uncompressedLimitMb }. Cached for the page's lifetime. */
export function videoCapabilities() {
  capsPromise ??= fetch('/api/upload/video-capabilities', { credentials: 'include' })
    .then(r => (r.ok ? r.json() : Promise.reject(new Error('unavailable'))))
    .catch(() => { capsPromise = null; return { mode: 'server', compression: true, maxMb: 500, maxMinutes: 20, uncompressedLimitMb: 100 }; });
  return capsPromise;
}

/**
 * @param {File} file
 * @param {{ audio?: 'keep'|'strip', onUpdate?: (u: { state: string, progress: number, message: string }) => void }} opts
 * @returns {Promise<{ url: string, stats: object }>} rejects with an Error whose message is fit to show to the admin
 */
export async function uploadVideo(file, opts = {}) {
  const caps = await videoCapabilities();
  return caps.mode === 'cloudinary' ? uploadToCloudinary(file, opts) : uploadViaServer(file, opts);
}

// ── Straight to Cloudinary ───────────────────────────────────────────────────
const CHUNK = 6 * 1024 * 1024;                       // Cloudinary needs chunks of at least 5 MB (except the last)

function uploadToCloudinary(file, { onUpdate = () => {} } = {}) {
  return (async () => {
    onUpdate({ state: 'uploading', progress: 1, message: 'Starting…' });
    if (file.type === 'image/gif') return uploadGif(file, onUpdate);
    const sigRes = await fetch('/api/upload/video-signature', { method: 'POST', credentials: 'include', headers: getCsrf() ? { 'X-CSRF-Token': getCsrf() } : {} });
    if (sigRes.status === 401) throw new Error('Your session expired. Please sign in again.');
    const sig = await sigRes.json().catch(() => ({}));
    if (!sigRes.ok) throw new Error(sig.error || 'Could not start the upload.');
    if (file.size > sig.maxMb * 1048576) throw new Error(`That video is ${Math.round(file.size / 1048576)} MB; the limit is ${sig.maxMb} MB. Trim it or export it at a lower quality first.`);

    const uid = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    const total = file.size;
    const chunks = Math.max(1, Math.ceil(total / CHUNK));
    let last = null;
    for (let i = 0; i < chunks; i++) {
      const start = i * CHUNK, end = Math.min(total, start + CHUNK);
      const base = start;
      last = await sendChunk(sig, file.slice(start, end), file.name, uid, chunks > 1 ? { start, end: end - 1, total } : null, (loaded) => {
        const pct = Math.round(((base + loaded) / total) * 100);
        onUpdate({ state: 'uploading', progress: Math.min(95, Math.max(1, Math.round(pct * 0.95))), message: `Uploading… ${pct}%` });
      });
    }
    if (!last?.secure_url) throw new Error('The upload finished but Cloudinary did not return the video. Please try again.');

    onUpdate({ state: 'publishing', progress: 97, message: 'Almost done…' });
    // What a viewer will see (a sideways phone video is reported upright by the browser); Cloudinary's own numbers otherwise.
    const shown = await measureVideo(file).catch(() => null);
    const width = shown?.width || last.width || 0, height = shown?.height || last.height || 0;
    return {
      url: last.secure_url,
      stats: {
        compressed: true, cloud: true, originalBytes: total, originalMB: Math.round(total / 104857.6) / 10,
        to: { width, height }, seconds: Math.round((last.duration || 0) * 10) / 10,
      },
    };
  })();
}

// A GIF is an image to Cloudinary: it goes through the ordinary photo upload (and is played as an animated picture).
async function uploadGif(file, onUpdate) {
  if (file.size > 50 * 1048576) throw new Error(`That GIF is ${Math.round(file.size / 1048576)} MB; the limit is 50 MB. Export it as an MP4 instead; it will be far smaller.`);
  onUpdate({ state: 'uploading', progress: 30, message: 'Uploading…' });
  const fd = new FormData();
  fd.append('image', file);
  const res = await fetch('/api/upload', { method: 'POST', body: fd, credentials: 'include' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Upload failed.');
  return { url: body.url, stats: { compressed: true, cloud: true, originalBytes: file.size, originalMB: Math.round(file.size / 104857.6) / 10, to: {} } };
}

// One signed POST to Cloudinary (a whole small file, or one slice of a big one). Retries a few times, because a phone on mobile
// data drops connections; a chunk that already arrived is simply sent again and Cloudinary accepts it.
function sendChunk(sig, blob, name, uid, range, onProgress) {
  const attempt = (n) => new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('api_key', sig.apiKey);
    form.append('signature', sig.signature);
    for (const [k, v] of Object.entries(sig.params)) form.append(k, String(v));
    form.append('file', blob, name);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', sig.url);
    if (range) {
      xhr.setRequestHeader('X-Unique-Upload-Id', uid);
      xhr.setRequestHeader('Content-Range', `bytes ${range.start}-${range.end}/${range.total}`);
    }
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.min(blob.size, e.loaded)); };
    const retry = (why) => (n < 3 ? setTimeout(() => attempt(n + 1).then(resolve, reject), 1500 * (n + 1)) : reject(new Error(why)));
    xhr.onerror = () => retry('The connection dropped while uploading. Please try again.');
    xhr.ontimeout = () => retry('The upload timed out. Please try again.');
    xhr.onload = () => {
      let body = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(body);
      if (xhr.status >= 500) return retry('The video service had a problem. Please try again in a moment.');
      reject(new Error(friendlyCloudError(body.error?.message, xhr.status)));
    };
    xhr.send(form);
  });
  return attempt(0);
}

function friendlyCloudError(message = '', status = 0) {
  if (/too large|maximum is|file size/i.test(message)) return 'That video is larger than your Cloudinary plan allows. Trim it or export it at a lower quality first.';
  if (/signature|timestamp|stale/i.test(message)) return 'The upload permission expired. Please try again.';
  if (/invalid (image|video)|unsupported|not a valid/i.test(message)) return 'That file could not be read as a video. Try an MP4 or MOV.';
  return message ? `Cloudinary: ${message}` : `Upload failed (${status}).`;
}

// ── Via our own server (ffmpeg) ──────────────────────────────────────────────
function uploadViaServer(file, { audio = 'keep', onUpdate = () => {} } = {}) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('audio', audio);            // before the file: the server reads it while the file is still arriving
    form.append('video', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload/video');
    xhr.withCredentials = true;
    if (getCsrf()) xhr.setRequestHeader('X-CSRF-Token', getCsrf());
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const pct = Math.round((e.loaded / e.total) * 100);
      onUpdate({ state: 'uploading', progress: Math.round(pct * 0.3), message: `Uploading… ${pct}%` });
    };
    xhr.onerror = () => reject(new Error('The connection dropped while uploading. Please try again.'));
    xhr.ontimeout = () => reject(new Error('The upload timed out. Please try again.'));
    xhr.onload = () => {
      let body = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      if (xhr.status === 401) return reject(new Error('Your session expired. Please sign in again.'));
      if (xhr.status !== 202) return reject(new Error(body.error || `Upload failed (${xhr.status}).`));
      follow(body.id).then(resolve, reject);
    };
    xhr.send(form);
  });

  async function follow(id) {
    let misses = 0;
    for (let i = 0; ; i++) {
      await new Promise(r => setTimeout(r, i < 30 ? 1000 : 2000));
      let res;
      try { res = await fetch(`/api/upload/video/${encodeURIComponent(id)}`, { credentials: 'include', cache: 'no-store' }); }
      catch { if (++misses > 8) throw new Error('Lost contact with the server while the video was processing.'); continue; }
      if (res.status === 404) throw new Error((await res.json().catch(() => ({}))).error || 'The upload was lost. Please try again.');
      if (!res.ok) { if (++misses > 8) throw new Error('The server stopped answering. Please try again.'); continue; }
      misses = 0;
      const job = await res.json();
      // The upload leg already used 0–30%; the server's own progress fills the rest.
      onUpdate({ state: job.state, progress: Math.min(100, Math.max(30, 30 + Math.round(job.progress * 0.7))), message: job.queuePosition > 0 ? `Waiting for ${job.queuePosition} other video${job.queuePosition > 1 ? 's' : ''} to finish…` : job.message });
      if (job.state === 'done') return { url: job.url, stats: job.stats };
      if (job.state === 'failed') throw new Error(job.error || 'The video could not be processed.');
    }
  }
}

/** "84.2 MB → 11.6 MB (86% smaller) · 1080p · 30 fps" for the admin to read after an upload (or a short note when Cloudinary does the work). */
export function describeStats(stats) {
  if (!stats) return '';
  if (stats.cloud) {
    const dims = stats.to?.height ? ` · ${stats.to.width}×${stats.to.height}` : '';
    return `Uploaded (${stats.originalMB} MB${dims}). Optimised web versions are prepared in the background; visitors get a smaller one sized for their screen.`;
  }
  if (stats.compressed === false) return stats.savedPct ? '' : 'Published as it was (it was already web-ready).';
  const to = stats.to || {};
  const bits = [`${stats.originalMB} MB → ${stats.finalMB} MB (${stats.savedPct}% smaller)`];
  if (to.height) bits.push(`${to.height}p`);
  if (to.fps) bits.push(`${to.fps} fps`);
  if (stats.audio === 'removed') bits.push('no audio');
  if (stats.hdrToneMapped) bits.push('HDR converted to SDR');
  return bits.join(' · ');
}
