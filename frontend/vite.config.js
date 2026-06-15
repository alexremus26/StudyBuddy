import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig(({ mode }) => {
  // Load environment variables from the parent directory where the root .env is located
  const env = loadEnv(mode, path.resolve(__dirname, '../'), 'VITE_');
  
  // Merge loaded env with process.env to support Docker/OS container environment variables
  const VITE_MAPBOX_ACCESS_TOKEN = env.VITE_MAPBOX_ACCESS_TOKEN || process.env.VITE_MAPBOX_ACCESS_TOKEN || '';

  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
    base: process.env.NODE_ENV === 'development' ? '/' : '/static/', 

    define: {
      'import.meta.env.VITE_MAPBOX_ACCESS_TOKEN': JSON.stringify(VITE_MAPBOX_ACCESS_TOKEN),
    },

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
        assetFileNames: (assetInfo) => {
          if (assetInfo?.name?.endsWith('.css')) {
            return 'css/[name][extname]';
          }
          return 'assets/[name][extname]';
        },
      },
    },
  },
  };
});