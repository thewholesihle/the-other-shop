'use strict';
/**
 * Merges an admin product edit with the product's LIVE stock.
 *
 * The admin sends the stock it loaded (`base`) next to the stock it wants. Only the DIFFERENCE is applied to the
 * stock in the database right now, so a sale made while the editor was open is kept: loaded 10, a customer
 * buys 2 (live 8), admin restocks +5 to 15 → result 13, not 15. With no baseline (an older client) the sent
 * values are used as they are.
 */
function mergeProductStock(stored, incoming, base) {
  const key = (v) => `${v.size || ''}|${v.color || ''}`;
  const hasVariants = (Array.isArray(incoming.variants) && incoming.variants.length > 0) || (Array.isArray(stored.variants) && stored.variants.length > 0);
  if (!hasVariants) {
    const live = Number(stored.stock) || 0;
    const stock = base && Number.isFinite(Number(base.stock)) ? Math.max(0, live + (Number(incoming.stock) || 0) - Number(base.stock)) : Math.max(0, Number(incoming.stock) || 0);
    return { ...incoming, stock };
  }
  const baseByKey = new Map((base?.variants || []).map(v => [key(v), Number(v.stock) || 0]));
  const liveByKey = new Map((stored.variants || []).map(v => [key(v), Number(v.stock) || 0]));
  const incomingKeys = new Set((incoming.variants || []).map(key));
  const variants = (incoming.variants || []).map(v => {
    const b = baseByKey.get(key(v)), live = liveByKey.get(key(v));
    const stock = b !== undefined && live !== undefined ? Math.max(0, live + (Number(v.stock) || 0) - b) : Math.max(0, Number(v.stock) || 0);
    return { ...v, stock };
  });
  // A variant someone else added after this editor loaded (not in its baseline, not in its list) is not theirs to drop.
  for (const v of stored.variants || []) if (!incomingKeys.has(key(v)) && !baseByKey.has(key(v))) variants.push(v);
  return { ...incoming, variants, stock: variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0) };
}

module.exports = { mergeProductStock };
