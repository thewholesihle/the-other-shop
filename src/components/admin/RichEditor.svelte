<script>
  // A contenteditable rich text editor with toolbar
  // Emits HTML via onChange
  import { toast } from '../../lib/toast.js';
  import { uploadVideo, describeStats } from '../../lib/videoUpload.js';
  import { confirmDialog } from '../../lib/confirm.js';
  import Bold from 'lucide-svelte/icons/bold';
  import Italic from 'lucide-svelte/icons/italic';
  import Underline from 'lucide-svelte/icons/underline';
  import Strikethrough from 'lucide-svelte/icons/strikethrough';
  import Heading2 from 'lucide-svelte/icons/heading-2';
  import Heading3 from 'lucide-svelte/icons/heading-3';
  import Pilcrow from 'lucide-svelte/icons/pilcrow';
  import Quote from 'lucide-svelte/icons/quote';
  import List from 'lucide-svelte/icons/list';
  import ListOrdered from 'lucide-svelte/icons/list-ordered';
  import LinkIcon from 'lucide-svelte/icons/link';
  import RemoveFormatting from 'lucide-svelte/icons/remove-formatting';
  import Undo2 from 'lucide-svelte/icons/undo-2';
  import Redo2 from 'lucide-svelte/icons/redo-2';
  import ImageIcon from 'lucide-svelte/icons/image';
  import Video from 'lucide-svelte/icons/video';
  import Youtube from 'lucide-svelte/icons/youtube';
  import LoaderCircle from 'lucide-svelte/icons/loader-circle';

  export let value = '';
  export let onChange = () => {};

  let editor;
  let uploading = false;
  let uploadNote = '';

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

  // ── Paste sanitization ───────────────────────────────────────────────────
  // Pasting from Word, Google Docs, or a random webpage drags in bloated markup
  // (inline styles, <span>/<font> wrappers, comments, whole class names) that
  // would otherwise get baked straight into the stored article HTML. Rebuild
  // pasted content from a small tag whitelist so only clean, semantic HTML
  // ever lands in the editor — the admin never has to see or touch a tag.
  const ALLOWED_TAGS = new Set(['P', 'H2', 'H3', 'UL', 'OL', 'LI', 'A', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'STRIKE', 'BLOCKQUOTE', 'IMG', 'VIDEO', 'IFRAME', 'BR', 'HR']);
  const UNWRAP_TAGS = new Set(['DIV', 'SPAN', 'FONT', 'SECTION', 'ARTICLE', 'O:P']);
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'META', 'LINK', 'HEAD', 'TITLE']);
  const ALLOWED_ATTRS = {
    A: ['href', 'target', 'rel'],
    IMG: ['src', 'alt', 'style'],
    VIDEO: ['src', 'controls', 'style'],
    IFRAME: ['src', 'style', 'frameborder', 'allowfullscreen'],
  };

  function sanitizeInto(sourceNode, target) {
    for (const child of Array.from(sourceNode.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        target.appendChild(child.cloneNode());
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue; // drop comments etc.
      const tag = child.tagName;
      if (SKIP_TAGS.has(tag)) continue;
      if (UNWRAP_TAGS.has(tag) || !ALLOWED_TAGS.has(tag)) {
        sanitizeInto(child, target); // drop the wrapper, keep its content
        continue;
      }
      const el = document.createElement(tag);
      for (const attr of ALLOWED_ATTRS[tag] || []) {
        if (child.hasAttribute(attr)) el.setAttribute(attr, child.getAttribute(attr));
      }
      sanitizeInto(child, el);
      target.appendChild(el);
    }
  }

  function sanitizeHtml(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const container = document.createElement('div');
    sanitizeInto(doc.body, container);
    return container.innerHTML;
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function handlePaste(e) {
    e.preventDefault();
    const html = e.clipboardData?.getData('text/html');
    const text = e.clipboardData?.getData('text/plain') || '';
    const clean = html
      ? sanitizeHtml(html)
      : text.split(/\n{2,}/).map(p => `<p>${escapeHtml(p)}</p>`).join('');
    editor.focus();
    document.execCommand('insertHTML', false, clean);
    emit();
  }

  async function handleDoubleClick(e) {
    const el = e.target;
    if (el.tagName === 'IMG' || el.tagName === 'VIDEO' || el.tagName === 'IFRAME') {
      const ok = await confirmDialog.ask({ title: 'Delete this media?', confirmLabel: 'Delete', destructive: true });
      if (!ok) return;
      if (el.tagName === 'IFRAME' && el.parentElement?.tagName === 'DIV') {
        el.parentElement.remove();
      } else {
        el.remove();
      }
      emit();
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
        if (!res.ok) throw new Error('Upload failed');
        const { url } = await res.json();
        exec('insertHTML', `<img src="${url}" alt="" style="max-width:100%;height:auto;margin:1rem 0;" />`);
      } catch (err) { toast.error(err.message); } finally { uploading = false; }
    };
  }

  async function insertVideo() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/mp4,video/quicktime,video/webm';
    input.click();
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      uploading = true;
      uploadNote = 'Uploading video…';
      try {
        // Compressed for the web on the server first (smaller, faster, no GPS/device data); this can take a little while.
        const { url, stats } = await uploadVideo(file, { audio: 'keep', onUpdate: (u) => { uploadNote = u.message; } });
        exec('insertHTML', `<video src="${url}" controls playsinline preload="metadata" style="max-width:100%;height:auto;margin:1rem 0;"></video>`);
        toast.success(`Video added. ${describeStats(stats)}`);
      } catch (err) { toast.error(err.message); } finally { uploading = false; uploadNote = ''; }
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
    { icon: Bold, title: 'Bold', action: () => exec('bold') },
    { icon: Italic, title: 'Italic', action: () => exec('italic') },
    { icon: Underline, title: 'Underline', action: () => exec('underline') },
    { icon: Strikethrough, title: 'Strikethrough', action: () => exec('strikeThrough') },
    { divider: true },
    { icon: Heading2, title: 'Heading 2', action: () => exec('formatBlock', 'h2') },
    { icon: Heading3, title: 'Heading 3', action: () => exec('formatBlock', 'h3') },
    { icon: Pilcrow, title: 'Paragraph', action: () => exec('formatBlock', 'p') },
    { icon: Quote, title: 'Quote', action: () => exec('formatBlock', 'blockquote') },
    { divider: true },
    { icon: List, title: 'Bullet list', action: () => exec('insertUnorderedList') },
    { icon: ListOrdered, title: 'Numbered list', action: () => exec('insertOrderedList') },
    { divider: true },
    { icon: LinkIcon, title: 'Link', action: insertLink },
    { icon: RemoveFormatting, title: 'Clear formatting', action: () => exec('removeFormat') },
    { divider: true },
    { icon: Undo2, title: 'Undo', action: () => exec('undo') },
    { icon: Redo2, title: 'Redo', action: () => exec('redo') },
  ];
  const btnCls = 'inline-flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50';
</script>

<div class="overflow-hidden rounded-md border border-input bg-background shadow-xs transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
  <!-- Toolbar -->
  <div class="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/50 p-1.5" role="toolbar" aria-label="Formatting">
    {#each tools as tool}
      {#if tool.divider}
        <div class="mx-1 h-5 w-px bg-border"></div>
      {:else}
        <button type="button" title={tool.title} aria-label={tool.title} onclick={tool.action} class={btnCls}><tool.icon size={15} /></button>
      {/if}
    {/each}
    <div class="mx-1 h-5 w-px bg-border"></div>
    <button type="button" title="Insert image" onclick={insertImage} class={btnCls}>
      {#if uploading}<LoaderCircle size={15} class="animate-spin" />{:else}<ImageIcon size={15} />{/if} Image
    </button>
    <button type="button" title="Insert video file" onclick={insertVideo} class={btnCls}><Video size={15} /> Video</button>
    {#if uploadNote}<span class="px-2 text-xs text-muted-foreground" role="status">{uploadNote}</span>{/if}
    <button type="button" title="Embed YouTube or Vimeo" onclick={insertEmbed} class={btnCls}><Youtube size={15} /> Embed</button>
  </div>

  <!-- Editor area -->
  <div
    bind:this={editor}
    contenteditable="true"
    role="textbox"
    aria-multiline="true"
    aria-label="Rich text editor"
    tabindex="0"
    ondblclick={handleDoubleClick}
    onpaste={handlePaste}
    class="min-h-[280px] p-4 text-sm focus:outline-hidden [&_h2]:font-semibold [&_h2]:text-xl [&_h2]:my-3 [&_h3]:font-semibold [&_h3]:text-lg [&_h3]:my-2 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:ml-5 [&_ol]:list-decimal [&_ol]:ml-5 [&_a]:underline [&_a]:text-foreground [&_img]:max-w-full [&_img]:rounded-[0.25rem] [&_video]:max-w-full [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_u]:underline [&_s]:line-through"
    oninput={emit}
  ></div>
</div>
