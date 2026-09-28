import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root,
  build: {
    emptyOutDir: false,
    lib: {
      entry: fileURLToPath(new URL('../../ui/scripts/features/blog-next/manuscript-editor-entry.js', import.meta.url)),
      name: 'BlogGeniusManuscriptEditor',
      formats: ['iife'],
      fileName: () => 'manuscript-editor.js'
    },
    outDir: fileURLToPath(new URL('../../ui/scripts/vendor', import.meta.url)),
  }
});
