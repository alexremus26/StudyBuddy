import { defineConfig } from 'vite';
import path from 'path';
import 'vite/modulepreload-polyfill';


export default defineConfig({
  base: '/static/', 

  server: {
    host: true,
    port: 5173,
    watch: {
      usePolling: true,
    }
  },

  build: {
    outDir: path.resolve(__dirname, './static'),
    
    emptyOutDir: false, 

    manifest: "manifest.json",

    rollupOptions: {
      input: {
        'index': path.resolve(__dirname, './assets/index.js'),
      },
      output: {
        entryFileNames: `js/[name]-bundle.js`,
        chunkFileNames: `js/[name]-[hash].js`,
        assetFileNames: `assets/[name]-[hash][extname]`,
      },
    },
  },
});