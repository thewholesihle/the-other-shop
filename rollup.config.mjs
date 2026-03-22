import svelte from 'rollup-plugin-svelte';
import resolve from '@rollup/plugin-node-resolve';
import postcss from 'rollup-plugin-postcss';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

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
      minimize: true,
      sourceMap: true,
      plugins: [
        tailwindcss('./tailwind.config.js'),
        autoprefixer(),
      ],
    }),
  ],
};
