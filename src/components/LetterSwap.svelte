<script>
  // Letter-swap hover: every letter rolls up and out while a copy of it rolls in from below,
  // staggered left to right (https://www.fancycomponents.dev/docs/components/text/letter-swap).
  // The animation is triggered by hovering or keyboard-focusing the *link or button that contains
  // this component* — see the `.ls-char` rules in src/index.css — so it can be dropped inside any
  // <a>/<button> without wiring up events.
  let { text = '', stagger = 22, class: className = '' } = $props();

  let chars = $derived([...String(text)]);
</script>

<!-- The animated letters are decorative; a visually hidden copy carries the real text for screen readers. -->
<span class="letter-swap {className}">
  <span class="sr-only">{text}</span>
  {#each chars as ch, i}
    <span class="ls-char" aria-hidden="true" data-char={ch === ' ' ? ' ' : ch} style="transition-delay:{i * stagger}ms">{ch === ' ' ? ' ' : ch}</span>
  {/each}
</span>
