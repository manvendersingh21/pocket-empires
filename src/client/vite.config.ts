import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: here,
  base: './',
  build: {
    outDir: path.resolve(here, '../../dist/client'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        game: path.resolve(here, 'game.html'),
        splash: path.resolve(here, 'splash.html'),
      },
    },
  },
});
