import svelte from 'rollup-plugin-svelte';
import resolve from '@rollup/plugin-node-resolve';
import postcss from 'rollup-plugin-postcss';
import tailwindcss from '@tailwindcss/postcss';
import terser from '@rollup/plugin-terser';

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
    postcss({
      extract: 'bundle.css',
      // Not `minimize: true`: the cssnano it runs wrongly merges Tailwind 4's `.text-x` and `.text-x/30` rules (plain
      // text came out at 30% opacity). Tailwind's own optimizer (lightningcss) minifies correctly.
      minimize: false,
      sourceMap: true,
      plugins: [
        tailwindcss({ optimize: { minify: true } }),
      ],
    }),
    // Minify the bundle (it shipped as ~1 MB of unminified JS).
    terser({ compress: { passes: 2 }, format: { comments: false } }),
  ],
};
