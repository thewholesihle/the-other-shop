<script>
  // A contenteditable rich text editor with toolbar
  // Emits HTML via onChange

  export let value = '';
  export let onChange = () => {};

  let editor;
  let uploading = false;

  // Sync initial value once
  let initialized = false;
  $: if (editor && !initialized && value) {
    editor.innerHTML = value;
    initialized = true;
  }

  function exec(cmd, arg = null) {
    editor.focus();
    document.execCommand(cmd, false, arg);
    emit();
  }

  function emit() {
    onChange(editor.innerHTML);
  }

  function handleDoubleClick(e) {
    const el = e.target;
    if (el.tagName === 'IMG' || el.tagName === 'VIDEO' || el.tagName === 'IFRAME') {
      if (confirm('Delete this media?')) {
        if (el.tagName === 'IFRAME' && el.parentElement?.tagName === 'DIV') {
          el.parentElement.remove();
        } else {
          el.remove();
        }
        emit();
      }
    }
  }

  async function insertImage() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/gif';
    input.click();
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      uploading = true;
      try {
        const fd = new FormData();
        fd.append('image', file);
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        const { url } = await res.json();
        exec('insertHTML', `<img src="${url}" alt="" style="max-width:100%;height:auto;margin:1rem 0;" />`);
      } finally { uploading = false; }
    };
  }

  async function insertVideo() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/mp4,video/webm';
    input.click();
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      uploading = true;
      try {
        const fd = new FormData();
        fd.append('image', file); // server accepts video too via updated mimetype filter
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        const { url } = await res.json();
        exec('insertHTML', `<video src="${url}" controls style="max-width:100%;height:auto;margin:1rem 0;"></video>`);
      } finally { uploading = false; }
    };
  }

  function insertEmbed() {
    const url = prompt('Paste a YouTube or Vimeo URL:');
    if (!url) return;
    let embedUrl = url;
    // Convert YouTube watch URL to embed URL
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch) embedUrl = `https://www.youtube.com/embed/${ytMatch[1]}`;
    // Convert Vimeo URL
    const vmMatch = url.match(/vimeo\.com\/(\d+)/);
    if (vmMatch) embedUrl = `https://player.vimeo.com/video/${vmMatch[1]}`;
    exec('insertHTML', `<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;margin:1rem 0;"><iframe src="${embedUrl}" style="position:absolute;top:0;left:0;width:100%;height:100%;" frameborder="0" allowfullscreen></iframe></div>`);
  }

  function insertLink() {
    const url = prompt('Enter URL:');
    if (url) exec('createLink', url);
  }

  const tools = [
    { label: 'B',  title: 'Bold',          action: () => exec('bold') },
    { label: 'I',  title: 'Italic',        action: () => exec('italic') },
    { label: 'H2', title: 'Heading 2',     action: () => exec('formatBlock', 'h2') },
    { label: 'H3', title: 'Heading 3',     action: () => exec('formatBlock', 'h3') },
    { label: '¶',  title: 'Paragraph',     action: () => exec('formatBlock', 'p') },
    { label: '—',  title: 'Divider',       action: null },
    { label: '≡',  title: 'Bullet list',   action: () => exec('insertUnorderedList') },
    { label: '1.', title: 'Numbered list', action: () => exec('insertOrderedList') },
    { label: '—',  title: 'Divider',       action: null },
    { label: '🔗', title: 'Link',          action: insertLink },
  ];
</script>

<div class="border border-border focus-within:border-foreground transition-colors">
  <!-- Toolbar -->
  <div class="flex flex-wrap gap-0.5 p-2 border-b border-border bg-muted/40">
    {#each tools as tool}
      {#if tool.title === 'Divider'}
        <div class="w-px bg-border mx-1 self-stretch"></div>
      {:else}
        <button
          type="button"
          title={tool.title}
          onclick={tool.action}
          class="px-2 py-1 text-xs font-medium hover:bg-muted rounded transition-colors min-w-[28px] text-center"
        >{tool.label}</button>
      {/if}
    {/each}

    <!-- Image -->
    <button type="button" title="Insert image" onclick={insertImage} class="px-2 py-1 text-xs font-medium hover:bg-muted rounded transition-colors flex items-center gap-1">
      {#if uploading}
        <div class="w-3 h-3 border border-foreground/30 border-t-foreground rounded-full animate-spin"></div>
      {:else}
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
      {/if}
      IMG
    </button>

    <!-- Video upload -->
    <button type="button" title="Insert video file" onclick={insertVideo} class="px-2 py-1 text-xs font-medium hover:bg-muted rounded transition-colors flex items-center gap-1">
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>
      VID
    </button>

    <!-- YouTube/Vimeo embed -->
    <button type="button" title="Embed YouTube/Vimeo" onclick={insertEmbed} class="px-2 py-1 text-xs font-medium hover:bg-muted rounded transition-colors flex items-center gap-1">
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/><path d="m10 15 5-3-5-3z"/></svg>
      EMBED
    </button>
  </div>

  <!-- Editor area -->
  <div
    bind:this={editor}
    contenteditable="true"
    ondblclick={handleDoubleClick}
    class="min-h-[280px] p-4 text-sm focus:outline-none prose prose-sm max-w-none [&_h2]:font-display [&_h2]:font-bold [&_h2]:text-xl [&_h2]:my-3 [&_h3]:font-display [&_h3]:font-semibold [&_h3]:text-lg [&_h3]:my-2 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:ml-5 [&_ol]:list-decimal [&_ol]:ml-5 [&_a]:underline [&_a]:text-foreground [&_img]:max-w-full [&_img]:rounded [&_video]:max-w-full"
    oninput={emit}
  ></div>
</div>
