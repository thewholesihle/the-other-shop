/**
 * Shared data access utility for public pages.
 * Always fetches from /api/data (MongoDB) — no localStorage, no store.json.
 */

let _cache = null;
let _promise = null;

/**
 * Load store data. Caches for the lifetime of the page visit so multiple
 * component onMounts don't fire redundant requests.
 * Pass `fresh = true` to bypass cache (e.g. after a write).
 */
export async function loadStoreData(fresh = false) {
  if (!fresh && _cache) return _cache;
  if (!fresh && _promise) return _promise;

  _promise = fetch('/api/data')
    .then(r => {
      if (!r.ok) throw new Error(`Could not load store data: ${r.status}`);
      return r.json();
    })
    .then(d => { _cache = d; _promise = null; return d; })
    .catch(e => { _promise = null; throw e; });

  return _promise;
}
