/**
 * Vertical "cut" reveal for headings (the line-by-line mask reveal popularised by editorial and
 * streetwear sites such as patta.nl): every word sits inside its own clipping mask and slides up
 * from below it, staggered, the first time the heading scrolls into view.
 *
 *   <h1 use:cutReveal>Shop all</h1>
 *   <h1 use:cutReveal={{ delay: 250, stagger: 80 }}>…</h1>
 *
 * Styles live in src/index.css (.cut-mask / .cut-word). Notes:
 *  • The heading keeps its accessible name (aria-label) while the split spans are hidden from
 *    screen readers, so it isn't read out word by word.
 *  • Visitors who prefer reduced motion get the plain, already-visible heading.
 *  • Only text nodes are split; child elements (<br>, <span>…) are kept in place.
 */
export function cutReveal(node, options = {}) {
  if (typeof window === 'undefined') return {};
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return {};

  const { delay = 0, stagger = 55, threshold = 0.2 } = options;
  // innerText (not textContent) so words separated only by <br> keep a space in the accessible name.
  const label = (node.innerText || node.textContent).replace(/\s+/g, ' ').trim();
  if (!label) return {};

  let index = 0;
  const split = (parent) => {
    for (const child of Array.from(parent.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        for (const part of child.textContent.split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) { frag.append(part); continue; }
          const mask = document.createElement('span');
          mask.className = 'cut-mask';
          mask.setAttribute('aria-hidden', 'true');
          const word = document.createElement('span');
          word.className = 'cut-word';
          word.textContent = part;
          word.style.transitionDelay = `${delay + index * stagger}ms`;
          index += 1;
          mask.append(word);
          frag.append(mask);
        }
        parent.replaceChild(frag, child);
      } else if (child.nodeType === Node.ELEMENT_NODE && !child.matches('script, style, svg')) {
        split(child);
      }
    }
  };

  if (!node.hasAttribute('aria-label')) node.setAttribute('aria-label', label);
  split(node);

  const io = new IntersectionObserver((entries) => {
    if (entries.some(e => e.isIntersecting)) {
      // Two frames so the hidden start state is painted before the transition begins.
      requestAnimationFrame(() => requestAnimationFrame(() => node.classList.add('cut-in')));
      io.disconnect();
    }
  }, { threshold, rootMargin: '0px 0px -6% 0px' });
  io.observe(node);

  return { destroy: () => io.disconnect() };
}
