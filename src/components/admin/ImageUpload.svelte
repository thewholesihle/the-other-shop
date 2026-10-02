<script>
  import Upload from 'lucide-svelte/icons/upload';
  import X from 'lucide-svelte/icons/x';
  import LoaderCircle from 'lucide-svelte/icons/loader-circle';

  // Props
  export let value = '';        // single URL (single mode)
  export let values = [];       // array of URLs (multi mode)
  export let multi = false;     // enable multi-image mode
  export let label = 'Upload image';
  export let onChange = () => {};  // called with (url) or ([...urls])

  let uploading = false;
  let error = '';
  let dragging = false;

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
    dragging = false;
    handleFiles(e.dataTransfer.files);
  }
</script>

<div class="space-y-3">
  {#if label}
    <p class="text-sm font-medium leading-none">{label}</p>
  {/if}

  <!-- Drop zone -->
  <label
    class="flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-4 py-6 transition-colors hover:bg-muted/50 focus-within:ring-2 focus-within:ring-ring/40 {dragging ? 'border-ring bg-muted/60' : 'border-input'}"
    ondragover={(e) => { e.preventDefault(); dragging = true; }}
    ondragleave={() => (dragging = false)}
    ondrop={handleDrop}
  >
    <input
      type="file"
      accept="image/jpeg,image/png,image/webp,image/gif"
      multiple={multi}
      class="sr-only"
      onchange={(e) => handleFiles(e.target.files)}
    />
    {#if uploading}
      <LoaderCircle size={20} class="mb-2 animate-spin text-muted-foreground" />
      <span class="text-xs text-muted-foreground">Uploading…</span>
    {:else}
      <Upload size={20} class="mb-2 text-muted-foreground" />
      <span class="text-sm text-muted-foreground"><span class="font-medium text-foreground">Click to upload</span> or drag {multi ? 'images' : 'an image'} here</span>
      <span class="mt-0.5 text-xs text-muted-foreground">JPG, PNG, WebP or GIF</span>
    {/if}
  </label>

  {#if error}
    <p class="text-xs text-destructive">{error}</p>
  {/if}

  <!-- Single preview -->
  {#if !multi && value}
    <div class="group relative h-24 w-24 overflow-hidden rounded-lg border border-border">
      <img src={value} alt="Preview" class="h-full w-full object-cover" />
      <button
        type="button"
        aria-label="Remove image"
        onclick={() => { value = ''; onChange(''); }}
        class="absolute right-1 top-1 rounded-md bg-background/90 p-1 text-foreground shadow transition-colors hover:bg-destructive hover:text-white"
      ><X size={12} /></button>
    </div>
  {/if}

  <!-- Multi previews -->
  {#if multi && values.length}
    <div class="flex flex-wrap gap-2">
      {#each values as url, i}
        <div class="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg border border-border">
          <img src={url} alt="Preview {i + 1}" class="h-full w-full object-cover" />
          {#if i === 0}<span class="absolute bottom-0 left-0 right-0 bg-black/60 py-0.5 text-center text-[10px] font-medium text-white">Cover</span>{/if}
          <button
            type="button"
            aria-label="Remove image"
            onclick={() => removeImage(url)}
            class="absolute right-1 top-1 rounded-md bg-background/90 p-1 text-foreground shadow transition-colors hover:bg-destructive hover:text-white"
          ><X size={12} /></button>
        </div>
      {/each}
    </div>
  {/if}
</div>
