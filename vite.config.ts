import { defineConfig } from 'vite';

// Web build: root is src/web, output goes to dist/web, relative base so the
// bundle works from any static folder.
export default defineConfig({
  root: 'src/web',
  base: './',
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
    chunkSizeWarningLimit: 800, // three.js alone is ~500 kB; fine for a local game
  },
});
