'use strict';
// Video uploads, compressed for the web BEFORE they are published.
//
// Phone and camera video is made to be edited, not streamed: 30–100 Mbps, 4K, 60 fps, with GPS and device data in the
// metadata. A visitor on mobile data shouldn't download that. Every video uploaded in the admin therefore goes through
// ffmpeg first:
//
//   • H.264 High profile with constant-quality encoding (CRF) held under a bitrate ceiling (VBV), so quality is steady
//     and the file can never balloon on busy footage. Ceilings follow the output size: ~5 Mbps for 1080p, 2.8 for 720p…
//   • Fits inside 1920×1080 (portrait: 1080×1920), never upscaled, even dimensions; frame rate capped at 30 fps.
//   • yuv420p with BT.709 colour tags, so it plays everywhere; HDR (iPhone HLG / HDR10) is tone-mapped to SDR instead of
//     looking washed out.
//   • AAC-LC 128 kbps stereo audio, or no audio track at all for muted background videos (saves ~10%).
//   • `+faststart` (playback starts before the file has finished downloading), a keyframe every 2 s (instant seeking),
//     and ALL metadata stripped (no GPS location or device identifiers leave the building).
//   • A slower, better x264 preset for short clips (hero loops), faster ones for long footage, so a job finishes in a
//     sensible time on a small server. One job at a time; progress is reported as it runs.
//   • If the "compressed" file would not be smaller than a source that is already web-ready, the source is kept.
//
// The result is published to Cloudinary, which then serves it in the best codec each browser supports (VP9/AV1/H.264,
// via f_auto in src/lib/cloudinary.js). If ffmpeg isn't available the upload still works, uncompressed (≤ 100 MB).
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_MB = Number(process.env.VIDEO_MAX_MB) || 500;
const MAX_MINUTES = Number(process.env.VIDEO_MAX_MINUTES) || 20;
const JOB_TIMEOUT_MS = 30 * 60 * 1000;
const UNCOMPRESSED_LIMIT_MB = 100;                   // Cloudinary's own cap on a single video when we can't shrink it first

// ── ffmpeg discovery ─────────────────────────────────────────────────────────
let found;                                           // undefined = not looked yet, null = not available
let features = { tonemap: false };
function ffmpegBinary() {
  if (found !== undefined) return found;
  const candidates = [process.env.FFMPEG_PATH];
  try { candidates.push(require('ffmpeg-static')); } catch { /* optional dependency */ }
  candidates.push('ffmpeg');
  for (const c of candidates.filter(Boolean)) {
    const r = spawnSync(c, ['-version'], { timeout: 8000 });
    if (!r.error && r.status === 0) {
      found = c;
      const filters = String(spawnSync(c, ['-hide_banner', '-filters'], { timeout: 8000 }).stdout || '');
      const enc = String(spawnSync(c, ['-hide_banner', '-encoders'], { timeout: 8000 }).stdout || '');
      if (!/libx264/.test(enc)) { found = null; break; }  // can't produce H.264 → useless to us
      features = { tonemap: /\bzscale\b/.test(filters) && /\btonemap\b/.test(filters) };
      return found;
    }
  }
  found = null;
  return found;
}

// ── probing ──────────────────────────────────────────────────────────────────
function run(cmd, args, { timeout = 60000, onStdout } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let out = '', err = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeout);
    child.stdout.on('data', d => { out += d; if (onStdout) onStdout(String(d)); });
    child.stderr.on('data', d => { err += d; if (err.length > 400000) err = err.slice(-200000); });
    child.on('close', code => { clearTimeout(timer); resolve({ code, out, err }); });
    child.on('error', e => { clearTimeout(timer); resolve({ code: -1, out, err: String(e.message) }); });
  });
}

/** Parses what `ffmpeg -i` prints about a file. Returns null if it isn't a video. */
function parseInfo(stderr) {
  const dur = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  const seconds = dur ? (+dur[1]) * 3600 + (+dur[2]) * 60 + parseFloat(dur[3]) : 0;
  const vline = /Stream #\d+:\d+[^\n]*?: Video: [^\n]*/.exec(stderr)?.[0] || '';
  if (!vline) return null;
  const size = /,\s*(\d{2,5})x(\d{2,5})/.exec(vline);
  const rot = /rotation of (-?[\d.]+) degrees/.exec(stderr) || /rotate\s*:\s*(-?\d+)/.exec(stderr);
  let width = size ? +size[1] : 0, height = size ? +size[2] : 0;
  const turned = rot && Math.abs(Math.round(parseFloat(rot[1]) / 90)) % 2 === 1;
  if (turned) [width, height] = [height, width];       // ffmpeg auto-rotates, so the picture is the other way round
  const fps = /([\d.]+)\s*fps/.exec(vline);
  const kbps = /Duration:[^\n]*bitrate:\s*(\d+)\s*kb\/s/.exec(stderr);
  return {
    seconds,
    bitrateKbps: kbps ? +kbps[1] : 0,
    video: {
      codec: /Video:\s*([a-z0-9_]+)/i.exec(vline)?.[1] || '',
      width, height,
      fps: fps ? parseFloat(fps[1]) : 0,
      hdr: /(smpte2084|arib-std-b67|bt2020)/i.test(vline),
    },
    audio: /Stream #\d+:\d+[^\n]*?: Audio: ([a-z0-9_]+)/i.exec(stderr)?.[1] || null,
  };
}

async function probe(file) {
  const bin = ffmpegBinary();
  const r = await run(bin, ['-hide_banner', '-nostdin', '-i', file], { timeout: 30000 });
  return parseInfo(r.err);
}

// ── the compression profile ──────────────────────────────────────────────────
/** Output size after fitting in 1920×1080 (or 1080×1920), never upscaling. */
function outputSize(w, h) {
  const landscape = w >= h;
  const maxW = landscape ? 1920 : 1080, maxH = landscape ? 1080 : 1920;
  const s = Math.min(1, maxW / w, maxH / h);
  const even = (n) => Math.max(2, Math.round(n * s / 2) * 2);
  return { width: even(w), height: even(h), short: Math.min(even(w), even(h)) };
}

/** CRF and bitrate ceiling by how big the picture is: small pictures need proportionally more bits, large ones cap out. */
function tierFor(shortSide) {
  if (shortSide >= 1000) return { crf: 23, maxKbps: 5000 };     // 1080p
  if (shortSide >= 700) return { crf: 23, maxKbps: 2800 };      // 720p
  if (shortSide >= 500) return { crf: 24, maxKbps: 1600 };      // 540p
  return { crf: 25, maxKbps: 900 };
}

/** Slower preset = smaller file at the same quality, so use it where the job is short enough to afford it. */
function presetFor(seconds) {
  if (seconds <= 90) return 'slow';
  if (seconds <= 300) return 'medium';
  if (seconds <= 900) return 'fast';
  return 'veryfast';
}

function buildArgs(info, { input, output, audio, tonemap }) {
  const out = outputSize(info.video.width, info.video.height);
  const { crf, maxKbps } = tierFor(out.short);
  const fps = info.video.fps > 30.5 ? 30 : (info.video.fps || 30);
  const gop = Math.round(Math.max(24, fps * 2));
  const filters = [];
  if (info.video.hdr && tonemap) {
    // HDR → SDR: linearise, map the highlights (Hable keeps detail without a grey wash), back to BT.709.
    filters.push('zscale=t=linear:npl=100', 'format=gbrpf32le', 'zscale=p=bt709', 'tonemap=tonemap=hable:desat=0', 'zscale=t=bt709:m=bt709:r=tv');
  }
  filters.push(`scale=w='min(iw,if(gt(iw,ih),1920,1080))':h='min(ih,if(gt(iw,ih),1080,1920))':force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos`);
  if (info.video.fps > 30.5) filters.push('fps=30');
  filters.push('format=yuv420p');
  const args = [
    '-hide_banner', '-nostdin', '-y', '-i', input,
    '-map', '0:v:0',
    ...(audio === 'keep' && info.audio ? ['-map', '0:a:0'] : []),
    '-sn', '-dn', '-map_metadata', '-1', '-map_chapters', '-1',      // no subtitles/data/metadata/chapters: nothing personal travels
    '-vf', filters.join(','),
    '-c:v', 'libx264', '-profile:v', 'high', '-preset', presetFor(info.seconds),
    '-crf', String(crf), '-maxrate', `${maxKbps}k`, '-bufsize', `${maxKbps * 2}k`,
    '-g', String(gop), '-keyint_min', String(Math.round(gop / 2)),
    '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    ...(audio === 'keep' && info.audio ? ['-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2'] : ['-an']),
    '-movflags', '+faststart', '-f', 'mp4',
    '-progress', 'pipe:1', '-nostats', output,
  ];
  return { args, plan: { ...out, crf, maxKbps, fps, preset: presetFor(info.seconds), tonemapped: Boolean(info.video.hdr && tonemap) } };
}

/** Runs ffmpeg for one file. Resolves { ok, plan, error? }; `onProgress` gets 0–100. */
async function transcode(info, { input, output, audio }, onProgress, shouldCancel = () => false) {
  const bin = ffmpegBinary();
  const attempts = info.video.hdr && features.tonemap ? [true, false] : [false];   // if the tone-mapping chain fails, retry plainly
  let last = { ok: false, error: 'ffmpeg did not run' };
  for (const tonemap of attempts) {
    const { args, plan } = buildArgs(info, { input, output, audio, tonemap });
    let stderr = '';
    const result = await new Promise((resolve) => {
      const child = spawn(bin, args, { windowsHide: true });
      const timer = setTimeout(() => child.kill('SIGKILL'), JOB_TIMEOUT_MS);
      const poll = setInterval(() => { if (shouldCancel()) child.kill('SIGKILL'); }, 1000);
      let buf = '';
      child.stdout.on('data', (d) => {
        buf += d;
        for (const line of buf.split('\n').slice(0, -1)) {
          const m = /^out_time_(?:us|ms)=(\d+)/.exec(line);                // (both are microseconds, whatever the name says)
          if (m && info.seconds > 0) onProgress(Math.min(99, Math.round((+m[1] / 1e6 / info.seconds) * 100)));
        }
        buf = buf.slice(buf.lastIndexOf('\n') + 1);
      });
      child.stderr.on('data', d => { stderr += d; if (stderr.length > 60000) stderr = stderr.slice(-30000); });
      child.on('close', code => { clearTimeout(timer); clearInterval(poll); resolve(code); });
      child.on('error', e => { clearTimeout(timer); clearInterval(poll); stderr += String(e.message); resolve(-1); });
    });
    if (result === 0 && fs.existsSync(output) && fs.statSync(output).size > 0) return { ok: true, plan };
    last = { ok: false, error: stderr.trim().split('\n').slice(-3).join(' ').slice(0, 300) || `ffmpeg exited with code ${result}` };
    try { fs.unlinkSync(output); } catch { /* nothing written */ }
    if (shouldCancel()) break;
  }
  return last;
}

// ── the job service ──────────────────────────────────────────────────────────
const mb = (n) => Math.round(n / 1048576 * 10) / 10;

/**
 * @param publish async (filePath, { name }) => url — where the finished file goes (Cloudinary in production)
 */
function createVideoService({ publish, tmpDir = path.join(os.tmpdir(), 'others-video'), log = console } = {}) {
  fs.mkdirSync(tmpDir, { recursive: true });
  // Leftovers from a crashed run (an upload that never became a job, a killed process) are cleared at start-up.
  try { for (const f of fs.readdirSync(tmpDir)) { const p = path.join(tmpDir, f); if (Date.now() - fs.statSync(p).mtimeMs > 6 * 3600 * 1000) fs.unlinkSync(p); } } catch { /* best effort */ }

  const jobs = new Map();
  const queue = [];
  let busy = false;

  const snapshot = (j) => ({ id: j.id, state: j.state, progress: j.progress, message: j.message, name: j.name, url: j.url || '', stats: j.stats || null, error: j.error || '', queuePosition: queue.indexOf(j.id) + 1 });
  const set = (j, patch) => Object.assign(j, patch);

  function submit({ file, name, size, audio = 'keep' }) {
    const id = crypto.randomBytes(12).toString('hex');
    const job = { id, file, name: name || 'video', size, audio: audio === 'strip' ? 'strip' : 'keep', state: 'queued', progress: 0, message: 'Waiting for its turn…', createdAt: Date.now() };
    jobs.set(id, job);
    queue.push(id);
    setImmediate(next);
    // Finished jobs are forgotten after an hour.
    for (const [k, v] of jobs) if (v.finishedAt && Date.now() - v.finishedAt > 3600 * 1000) jobs.delete(k);
    return snapshot(job);
  }

  function get(id) { const j = jobs.get(id); return j ? snapshot(j) : null; }
  function cancel(id) { const j = jobs.get(id); if (j && !j.finishedAt) j.cancelled = true; }

  async function next() {
    if (busy) return;
    const id = queue.shift();
    if (!id) return;
    busy = true;
    const job = jobs.get(id);
    try { await process(job); }
    catch (err) {
      if (err.publishError) set(job, { state: 'failed', progress: 0, error: `The video was compressed but could not be published: ${err.publishError}` });
      else { log.error?.('[Video] job failed:', err); set(job, { state: 'failed', progress: 0, error: 'Something went wrong while processing this video.' }); }
    }
    finally {
      job.finishedAt = Date.now();
      for (const f of [job.file, job.output]) if (f) { try { fs.unlinkSync(f); } catch { /* already gone */ } }
      busy = false;
      setImmediate(next);
    }
  }

  async function process(job) {
    const started = Date.now();
    const bin = ffmpegBinary();
    const fail = (error) => set(job, { state: 'failed', error, progress: 0 });

    // Publishing is the one step that talks to another service; say plainly when it is what failed.
    const publishFile = async (file) => {
      try { return await publish(file, { name: job.name }); }
      catch (err) { log.error?.('[Video] publish failed:', err.message); throw Object.assign(new Error('publish'), { publishError: String(err.message || err).slice(0, 200) }); }
    };

    // No ffmpeg on this server: publish as it is (within what Cloudinary accepts).
    if (!bin) {
      if (job.size > UNCOMPRESSED_LIMIT_MB * 1048576) return fail(`Video compression isn't available on this server, and the file is larger than ${UNCOMPRESSED_LIMIT_MB} MB. Compress it first, or enable ffmpeg on the server.`);
      set(job, { state: 'publishing', progress: 90, message: 'Publishing…' });
      const url = await publishFile(job.file);
      return set(job, { state: 'done', progress: 100, message: 'Published (not compressed — ffmpeg is not available on this server).', url, stats: { compressed: false, originalBytes: job.size, finalBytes: job.size, savedPct: 0 } });
    }

    set(job, { state: 'analysing', progress: 2, message: 'Analysing the video…' });
    const info = await probe(job.file);
    if (!info || !info.video.width) return fail('That file could not be read as a video. Try an MP4 or MOV.');
    if (info.seconds > MAX_MINUTES * 60) return fail(`That video is ${Math.round(info.seconds / 60)} minutes long; the limit is ${MAX_MINUTES}. Trim it first.`);

    job.output = path.join(tmpDir, `${job.id}.out.mp4`);
    set(job, { state: 'compressing', progress: 3, message: 'Compressing for the web…' });
    const t = await transcode(info, { input: job.file, output: job.output, audio: job.audio }, (p) => set(job, { progress: Math.max(job.progress, Math.round(3 + p * 0.87)), message: `Compressing for the web… ${p}%` }), () => job.cancelled);
    if (job.cancelled) return fail('Cancelled.');
    if (!t.ok) return fail(`This video couldn't be converted (${t.error}).`);

    // Keep the original if it is already web-ready and the new file isn't meaningfully smaller.
    const outBytes = fs.statSync(job.output).size;
    const ext = path.extname(job.name).toLowerCase();
    const alreadyGood = ext === '.mp4' && info.video.codec === 'h264' && t.plan.width === info.video.width && t.plan.height === info.video.height && info.video.fps <= 30.5;
    const keepOriginal = alreadyGood && outBytes >= job.size * 0.97 && job.audio === 'keep';
    const toPublish = keepOriginal ? job.file : job.output;
    const finalBytes = keepOriginal ? job.size : outBytes;

    set(job, { state: 'publishing', progress: 92, message: 'Publishing…' });
    const url = await publishFile(toPublish);
    const after = keepOriginal ? info : (await probe(job.output)) || info;
    set(job, {
      state: 'done', progress: 100, message: 'Done', url,
      stats: {
        compressed: !keepOriginal,
        originalBytes: job.size, finalBytes,
        originalMB: mb(job.size), finalMB: mb(finalBytes),
        savedPct: Math.max(0, Math.round((1 - finalBytes / job.size) * 100)),
        seconds: Math.round(info.seconds * 10) / 10,
        from: { width: info.video.width, height: info.video.height, fps: Math.round(info.video.fps), codec: info.video.codec, kbps: info.bitrateKbps },
        to: { width: after.video.width, height: after.video.height, fps: Math.round(after.video.fps), codec: after.video.codec, kbps: after.seconds ? Math.round(finalBytes * 8 / 1000 / after.seconds) : 0 },
        audio: job.audio === 'strip' ? 'removed' : (info.audio ? 'kept' : 'none'),
        hdrToneMapped: t.plan.tonemapped, preset: t.plan.preset,
        tookSeconds: Math.round((Date.now() - started) / 100) / 10,
      },
    });
  }

  return { submit, get, cancel, tmpDir, capabilities: () => ({ compression: Boolean(ffmpegBinary()), maxMb: MAX_MB, maxMinutes: MAX_MINUTES, uncompressedLimitMb: UNCOMPRESSED_LIMIT_MB, tonemap: features.tonemap }) };
}

module.exports = { createVideoService, parseInfo, probe, outputSize, tierFor, presetFor, buildArgs, transcode, ffmpegBinary, MAX_MB };
