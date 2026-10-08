<script>
  // Upload a video in the admin. The server compresses it for the web (smaller, faster, no GPS/device data) before it is
  // published; this shows the upload, the compression progress and what was saved.
  import { onMount } from 'svelte';
  import { uploadVideo, videoCapabilities, describeStats } from '../../lib/videoUpload.js';
  import Upload from 'lucide-svelte/icons/upload';
  import X from 'lucide-svelte/icons/x';
  import LoaderCircle from 'lucide-svelte/icons/loader-circle';
  import CircleCheck from 'lucide-svelte/icons/circle-check';

  let {
    value = '',
    onChange = () => {},
    label = 'Video',
    // Background videos play muted, so their audio track is dead weight. Lookbook / article videos usually have sound.
    stripAudio = false,
    allowAudioChoice = true,
    accept = 'video/mp4,video/quicktime,video/webm,image/gif',
  } = $props();

  let busy = $state(false);
  let progress = $state(0);
  let message = $state('');
  let error = $state('');
  let summary = $state('');
  let dragging = $state(false);
  let removeAudio = $state(stripAudio);
  let caps = $state(null);
  const id = `vu-${Math.random().toString(36).slice(2, 8)}`;

  onMount(async () => { caps = await videoCapabilities(); });

  async function handle(file) {
    if (!file || busy) return;
    error = ''; summary = ''; busy = true; progress = 1; message = 'Starting…';
    if (caps && file.size > caps.maxMb * 1048576) { error = `That video is ${Math.round(file.size / 1048576)} MB; the limit is ${caps.maxMb} MB. Trim it or export it at a lower quality first.`; busy = false; return; }
    try {
      const { url, stats } = await uploadVideo(file, { audio: removeAudio ? 'strip' : 'keep', onUpdate: (u) => { progress = u.progress; message = u.message; } });
      value = url;
      summary = describeStats(stats);
      onChange(url, { width: stats?.to?.width || 0, height: stats?.to?.height || 0 });
    } catch (e) {
      error = e.message;
    } finally {
      busy = false;
    }
  }
</script>

<div class="space-y-3">
  {#if label}<p class="text-sm font-medium leading-none">{label}</p>{/if}

  {#if allowAudioChoice}
    <label class="flex items-start gap-2 text-sm">
      <input type="checkbox" bind:checked={removeAudio} disabled={busy} class="mt-0.5 h-4 w-4 rounded-[0.25rem] border-input accent-primary" />
      <span>Remove the audio track <span class="text-muted-foreground">— best for muted background videos (about 10% smaller)</span></span>
    </label>
  {/if}

  <label
    for={id}
    class="flex w-full flex-col items-center justify-center rounded-lg border border-dashed px-4 py-6 transition-colors focus-within:ring-2 focus-within:ring-ring/40 {busy ? 'cursor-progress' : 'cursor-pointer hover:bg-muted/50'} {dragging ? 'border-ring bg-muted/60' : 'border-input'}"
    ondragover={(e) => { e.preventDefault(); if (!busy) dragging = true; }}
    ondragleave={() => (dragging = false)}
    ondrop={(e) => { e.preventDefault(); dragging = false; handle(e.dataTransfer.files[0]); }}
  >
    <input {id} type="file" {accept} class="sr-only" disabled={busy} onchange={(e) => { handle(e.target.files[0]); e.target.value = ''; }} />
    {#if busy}
      <LoaderCircle size={20} class="mb-2 animate-spin text-muted-foreground" />
      <span class="text-sm" role="status">{message}</span>
      <div class="mt-3 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress} aria-label="Video upload progress">
        <div class="h-full rounded-full bg-primary transition-[width] duration-500" style="width: {progress}%"></div>
      </div>
    {:else}
      <Upload size={20} class="mb-2 text-muted-foreground" />
      <span class="text-sm text-muted-foreground"><span class="font-medium text-foreground">Click to upload</span> or drag a video here</span>
      <span class="mt-0.5 text-xs text-muted-foreground">
        MP4, MOV, WebM or GIF{caps ? `, up to ${caps.maxMb} MB` : ''}.
        {#if caps?.compression === false}Not compressed on this server (up to {caps.uncompressedLimitMb} MB).{:else}Compressed for the web automatically.{/if}
      </span>
    {/if}
  </label>

  {#if error}<p role="alert" class="text-xs text-destructive">{error}</p>{/if}

  {#if value && !busy}
    <div class="flex items-start gap-3 rounded-lg border border-border p-3">
      <!-- svelte-ignore a11y_media_has_caption -->
      <video src={value} muted playsinline controls preload="metadata" class="h-24 w-auto max-w-[45%] rounded-[0.25rem] bg-muted object-cover"></video>
      <div class="min-w-0 flex-1 space-y-1 text-xs">
        {#if summary}<p class="flex items-start gap-1.5 text-muted-foreground"><CircleCheck size={14} class="mt-px shrink-0 text-success" /> <span>{summary}</span></p>{/if}
        <p class="truncate font-mono text-muted-foreground" title={value}>{value}</p>
        <button type="button" onclick={() => { value = ''; summary = ''; onChange(''); }} class="inline-flex items-center gap-1 text-destructive hover:underline"><X size={12} /> Remove</button>
      </div>
    </div>
  {/if}
</div>
