import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';

export default defineConfig({
  main: { build: { outDir: 'out/main' } },
  preload: { build: { outDir: 'out/preload' } },
  renderer: {
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          abbina: resolve(__dirname, 'src/renderer/abbina.html'),
          richiesta: resolve(__dirname, 'src/renderer/richiesta.html'),
          cronologia: resolve(__dirname, 'src/renderer/cronologia.html'),
          senzaapp: resolve(__dirname, 'src/renderer/senzaapp.html'),
        },
      },
    },
  },
});
