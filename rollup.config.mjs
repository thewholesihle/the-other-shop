import svelte from 'rollup-plugin-svelte';
import resolve from '@rollup/plugin-node-resolve';
import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';
import terser from '@rollup/plugin-terser';

// Collects every CSS file the app imports (index.css with Tailwind, Splide's core CSS, Svelte component styles), runs
// them through Tailwind's PostCSS plugin and writes one bundle.css. This replaces rollup-plugin-postcss, whose
// cssnano/postcss-* dependency chain is old, unmaintained, and now flagged by npm audit — and whose minifier we had
// already switched off, because it merged Tailwind 4's rules wrongly. Tailwind's own optimizer minifies instead.
function cssBundle({ fileName = 'bundle.css' } = {}) {
  const sheets = new Map();
  const processor = postcss([tailwindcss({ optimize: { minify: true } })]);
  return {
    name: 'css-bundle',
    async transform(code, id) {
      const file = id.split('?')[0];
      if (!/\.css$/.test(file) && !/lang\.css$/.test(id)) return null;
      const result = await processor.process(code, { from: file, map: false });
      sheets.set(id, result.css);
      return { code: 'export default "";', map: null };
    },
    generateBundle() {
      // In import order, so index.css (Tailwind's layers) comes before the libraries' unlayered CSS, as before.
      const css = this.getModuleIds ? [...this.getModuleIds()].filter(id => sheets.has(id)).map(id => sheets.get(id)).join('\n') : [...sheets.values()].join('\n');
      this.emitFile({ type: 'asset', fileName, source: css });
    },
  };
}

export default {
  input: 'src/main.js',
  output: {
    file: 'public/build/bundle.js',
    format: 'iife',
    name: 'app',
    sourcemap: true,
  },
  plugins: [
    svelte({
      compilerOptions: { dev: false },
      emitCss: true,
    }),
    resolve({
      browser: true,
      dedupe: ['svelte'],
      exportConditions: ['svelte'],
    }),
    cssBundle({ fileName: 'bundle.css' }),
    // Minify the bundle (it shipped as ~1 MB of unminified JS).
    terser({ compress: { passes: 2 }, format: { comments: false } }),
  ],
};
