import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  base: '/static/', 

  server: {
    host: true,
    port: 5173,
    strictPort: true,
    cors: true,
    origin: 'http://localhost:5173',
    watch: {
      usePolling: true,
    }
  },

  build: {
    outDir: path.resolve(__dirname, '../backend/static'),
    emptyOutDir: false, 
    manifest: "manifest.json",

    rollupOptions: {
      input: {
        'index': path.resolve(__dirname, './assets/javascript/app.jsx'),
        'style': path.resolve(__dirname, './assets/styles/style.css'),
      },
      output: {
        entryFileNames: `js/[name]-bundle.js`,
        assetFileNames: `css/[name].css`,
      },
    },
  },
});