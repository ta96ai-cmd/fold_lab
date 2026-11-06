import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build`        -> dist/ (normal multi-file site)
// `npm run build:single` -> dist-single/index.html (one offline HTML file)
export default defineConfig(({ mode }) => mode === 'single'
  ? { base: './', plugins: [viteSingleFile()], build: { outDir: 'dist-single' } }
  : { base: './' });
