'use strict';
// Readable web addresses for products: /shop/heavyweight-hoodie instead of /shop/prod-1717171717171.
// `id` stays the product's permanent internal key (carts, orders and stock all use it); the slug is only for the address, and
// can change. Every earlier slug is remembered (`oldSlugs`), and the old `prod-…` ids keep working, so links already shared,
// bookmarked or indexed by Google still arrive (as a permanent redirect to the new address).
//
// The same rule is in src/lib/slug.js for the admin's live preview; tests/unit.test.js checks the two agree.

const MAX_LENGTH = 60;

function slugify(input) {
  let s = String(input ?? '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')       // é → e
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')                                    // "men's" → "mens", not "men-s"
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (s.length > MAX_LENGTH) s = s.slice(0, MAX_LENGTH).replace(/-[^-]*$/, '') || s.slice(0, MAX_LENGTH);   // cut at a word, not mid-word
  return s.replace(/^-+|-+$/g, '');
}

/** `base`, or `base-2`, `base-3`… the first one not already in `taken` (a Set of slugs used by OTHER products). */
function uniqueSlug(base, taken) {
  const root = base || 'product';
  if (!taken.has(root)) return root;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const candidate = root.slice(0, MAX_LENGTH - suffix.length).replace(/-+$/, '') + suffix;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Decides the slug (and the list of retired ones) for product `p`, given what is stored and what the other products use.
 *   wanted slug = what the admin typed, else the one it already has, else one made from its name.
 * `others` is a Map slug → product id for every product (this one included; its own entry is ignored).
 */
function decideSlug(p, stored, others) {
  const taken = new Set([...others].filter(([, id]) => id !== p.id).map(([slug]) => slug));
  const slug = uniqueSlug(slugify(p.slug) || slugify(stored?.slug) || slugify(p.name), taken);
  const retired = new Set([...(stored?.oldSlugs || []), ...(p.oldSlugs || [])]);
  if (stored?.slug && stored.slug !== slug) retired.add(stored.slug);
  retired.delete(slug);
  for (const [s, id] of others) if (id !== p.id) retired.delete(s);     // someone else owns it now
  return { slug, oldSlugs: [...retired].slice(-10) };
}

module.exports = { slugify, uniqueSlug, decideSlug, MAX_LENGTH };
