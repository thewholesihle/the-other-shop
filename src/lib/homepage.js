// Which products the home page's product sections show. Pure functions, so the rules are easy to test.

/** A product is available unless its total stock is exactly 0 (older products without a stock count are treated as available). */
export const isAvailable = (p) => p?.stock !== 0;

/** Newest first. Products are stored oldest → newest, so this is just the reverse. */
const newestFirst = (list) => [...list].reverse();

/**
 * The "New Drops" / "New Arrivals" strip.
 *   mode 'featured' (the hero is on):  products marked Featured → else ones marked New → else whatever is available.
 *   mode 'arrivals' (the hero is off): products marked New → else Featured → else whatever is available.
 * `source` says which rule won, so the heading can be honest ("Available Now" instead of "New Drops" when nothing is new).
 */
export function pickDrops(products = [], mode = 'featured') {
  const list = products || [];
  const featured = list.filter(p => p.isFeatured), fresh = list.filter(p => p.isNew);
  const limit = mode === 'arrivals' ? 10 : 6;
  const rules = mode === 'arrivals'
    ? [['new', fresh], ['featured', featured]]
    : [['featured', featured], ['new', fresh]];
  for (const [source, pool] of rules) {
    if (pool.length) return { source, items: (mode === 'arrivals' ? newestFirst(pool) : pool).slice(0, limit) };
  }
  const available = list.filter(isAvailable);
  return { source: 'available', items: newestFirst(available.length ? available : list).slice(0, limit) };
}

export const PROMO_COUNTS = [4, 6, 8, 10];

/** The promoted-category section: the chosen category's products, in stock first and newest first. Null when it shouldn't show. */
export function pickPromoted(products = [], categories = [], cfg = {}) {
  if (!cfg?.enabled || !cfg.category) return null;
  const category = (categories || []).find(c => c.id === cfg.category);
  if (!category) return null;
  const inCategory = newestFirst((products || []).filter(p => p.category === category.id));
  if (!inCategory.length) return null;
  const count = PROMO_COUNTS.includes(Number(cfg.count)) ? Number(cfg.count) : 4;
  const items = [...inCategory.filter(isAvailable), ...inCategory.filter(p => !isAvailable(p))].slice(0, count);
  return { category, items };
}
