// The admin's live preview of a product's web address. Must stay identical to slugify() in src/slugs.js (the server is the
// one that decides; a test checks the two agree).
const MAX_LENGTH = 60;

export function slugify(input) {
  let s = String(input ?? '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (s.length > MAX_LENGTH) s = s.slice(0, MAX_LENGTH).replace(/-[^-]*$/, '') || s.slice(0, MAX_LENGTH);
  return s.replace(/^-+|-+$/g, '');
}
