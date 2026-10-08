// Uploading a video from the admin: the file goes up (with a progress bar), the server compresses it for the web, and we
// follow that job until it has a URL. See src/videoPipeline.js for what "compresses" means.
import { getCsrf } from './csrf.js';

let capsPromise = null;
/** What the server can do: { compression, maxMb, maxMinutes, uncompressedLimitMb }. Cached for the page's lifetime. */
export function videoCapabilities() {
  capsPromise ??= fetch('/api/upload/video-capabilities', { credentials: 'include' })
    .then(r => (r.ok ? r.json() : Promise.reject(new Error('unavailable'))))
    .catch(() => { capsPromise = null; return { compression: true, maxMb: 500, maxMinutes: 20, uncompressedLimitMb: 100 }; });
  return capsPromise;
}

/**
 * @param {File} file
 * @param {{ audio?: 'keep'|'strip', onUpdate?: (u: { state: string, progress: number, message: string }) => void }} opts
 * @returns {Promise<{ url: string, stats: object }>} rejects with an Error whose message is fit to show to the admin
 */
export function uploadVideo(file, { audio = 'keep', onUpdate = () => {} } = {}) {
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

/** "84.2 MB → 11.6 MB (86% smaller) · 1080p · 30 fps" for the admin to read after an upload. */
export function describeStats(stats) {
  if (!stats) return '';
  if (stats.compressed === false) return stats.savedPct ? '' : 'Published as it was (it was already web-ready).';
  const to = stats.to || {};
  const bits = [`${stats.originalMB} MB → ${stats.finalMB} MB (${stats.savedPct}% smaller)`];
  if (to.height) bits.push(`${to.height}p`);
  if (to.fps) bits.push(`${to.fps} fps`);
  if (stats.audio === 'removed') bits.push('no audio');
  if (stats.hdrToneMapped) bits.push('HDR converted to SDR');
  return bits.join(' · ');
}
