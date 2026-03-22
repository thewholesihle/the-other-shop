<script>
  // Props
  export let value = '';        // single URL (single mode)
  export let values = [];       // array of URLs (multi mode)
  export let multi = false;     // enable multi-image mode
  export let label = 'Upload Image';
  export let onChange = () => {};  // called with (url) or ([...urls])

  let uploading = false;
  let error = '';

  async function handleFiles(files) {
    if (!files.length) return;
    uploading = true;
    error = '';
    try {
      if (multi) {
        const fd = new FormData();
        Array.from(files).forEach(f => fd.append('images', f));
        const res = await fetch('/api/upload/multi', { method: 'POST', body: fd });
        if (!res.ok) throw new Error('Upload failed');
        const { urls } = await res.json();
        values = [...values, ...urls];
        onChange(values);
      } else {
        const fd = new FormData();
        fd.append('image', files[0]);
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        if (!res.ok) throw new Error('Upload failed');
        const { url } = await res.json();
        value = url;
        onChange(url);
      }
    } catch (e) {
      error = e.message;
    } finally {
      uploading = false;
    }
  }

  function removeImage(url) {
    values = values.filter(v => v !== url);
    onChange(values);
  }

  function handleDrop(e) {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  }
</script>

<div class="space-y-3">
  {#if label}
    <p class="text-label">{label}</p>
  {/if}

  <!-- Drop zone -->
  <label
    class="flex flex-col items-center justify-center w-full border border-dashed border-border px-4 py-6 cursor-pointer hover:bg-muted/50 transition-colors"
    ondragover={(e) => e.preventDefault()}
    ondrop={handleDrop}
  >
    <input
      type="file"
      accept="image/jpeg,image/png,image/webp,image/gif"
      multiple={multi}
      class="hidden"
      onchange={(e) => handleFiles(e.target.files)}
    />
    {#if uploading}
      <div class="w-5 h-5 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin mb-2"></div>
      <span class="text-xs text-muted-foreground">Uploading…</span>
    {:else}
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="mb-2 text-muted-foreground"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
      <span class="text-xs text-muted-foreground">Drop image{multi ? 's' : ''} or click to browse</span>
    {/if}
  </label>

  {#if error}
    <p class="text-xs text-destructive">{error}</p>
  {/if}

  <!-- Single preview -->
  {#if !multi && value}
    <div class="relative w-24 h-24 border border-border">
      <img src={value} alt="Preview" class="w-full h-full object-cover" />
      <button
        aria-label="Remove image"
        onclick={() => { value = ''; onChange(''); }}
        class="absolute top-0.5 right-0.5 bg-background text-foreground p-0.5 hover:bg-destructive hover:text-white transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
      </button>
    </div>
  {/if}

  <!-- Multi previews -->
  {#if multi && values.length}
    <div class="flex flex-wrap gap-2">
      {#each values as url}
        <div class="relative w-20 h-20 border border-border flex-shrink-0">
          <img src={url} alt="Preview" class="w-full h-full object-cover" />
          <button
            aria-label="Remove image"
            onclick={() => removeImage(url)}
            class="absolute top-0.5 right-0.5 bg-background text-foreground p-0.5 hover:bg-destructive hover:text-white transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>
