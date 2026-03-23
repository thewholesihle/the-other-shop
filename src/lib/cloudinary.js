/**
 * Helper to generate responsive Cloudinary URLs and srcsets
 */

/**
 * Generates a specific max-width URL for a Cloudinary image
 * @param {string} url - Original URL
 * @param {number|'auto'} width - Target width or auto
 * @returns {string} The optimized URL
 */
export function getOptimizedUrl(url, width = 'auto') {
  if (!url || typeof url !== 'string' || !url.includes('res.cloudinary.com')) return url;
  
  const uploadIndex = url.indexOf('/upload/');
  if (uploadIndex === -1) return url;
  
  const basePrefix = url.substring(0, uploadIndex + 8); // keeps '/upload/'
  const remainder = url.substring(uploadIndex + 8);

  // Use c_limit for smooth resizing, locking max dimension but preserving aspect
  const transformer = width === 'auto' ? 'q_auto:best,f_auto' : `c_limit,w_${width},q_auto:best,f_auto`;
  
  return `${basePrefix}${transformer}/${remainder}`;
}

/**
 * Generates an HTML5 srcset string with multiple resolution stops
 * @param {string} url - Original URL
 * @returns {string} Comma-separated srcset string
 */
export function getSrcset(url) {
  if (!url || typeof url !== 'string' || !url.includes('res.cloudinary.com')) return '';
  const widths = [400, 800, 1200, 1600, 2000, 2400];
  return widths.map(w => `${getOptimizedUrl(url, w)} ${w}w`).join(', ');
}
