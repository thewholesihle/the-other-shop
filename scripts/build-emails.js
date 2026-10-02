#!/usr/bin/env node
'use strict';
// Compiles the React Email templates (emails/*.jsx) into one CommonJS file the server can require.
// Runs as part of `npm run build`. React and React Email stay external (they're normal dependencies).
const path = require('path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
esbuild.build({
  absWorkingDir: root,
  entryPoints: ['emails/index.js'],
  outfile: 'emails/dist/templates.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  jsx: 'automatic',
  loader: { '.js': 'jsx' },
  external: ['react', 'react-dom', 'react/jsx-runtime', '@react-email/*'],
  logLevel: 'info',
}).then(() => console.log('emails: built emails/dist/templates.cjs')).catch(() => process.exit(1));
