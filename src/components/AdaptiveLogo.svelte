<script>
  // A logo that stays visible in any theme. `surface` names the colour variable it sits on
  // ('--background', '--card' or '--foreground'); `theme` is any value that changes when the theme does,
  // so the check re-runs on a light/dark switch. See lib/logoTone.js for the rule.
  import Img from './Img.svelte';
  import { analyzeLogo, toneFilter } from '../lib/logoTone.js';

  let { src = '', alt = '', surface = '--background', theme = '', style = '', ...rest } = $props();

  let probe = $state(null);
  let info = $state(null);
  let filter = $state('');

  $effect(() => {
    const url = src;
    info = null;
    if (!url) return;
    let live = true;
    analyzeLogo(url).then((r) => { if (live) info = r; });
    return () => { live = false; };
  });

  // Wait a frame so the theme's own class/variables have been applied before reading the surface colour.
  $effect(() => {
    void theme;
    const el = probe, a = info, s = surface;
    if (!el || !a) { filter = ''; return; }
    const id = requestAnimationFrame(() => { filter = toneFilter(a, el, s); });
    return () => cancelAnimationFrame(id);
  });
</script>

<span bind:this={probe} style="display:contents">
  <Img {src} {alt} style={filter ? `${style};filter:${filter}` : style} {...rest} />
</span>
