import { defineConfig } from 'vite';
import path from 'path';
import 'vite/modulepreload-polyfill';


export default defineConfig({
  // This matches Django's STATIC_URL
  base: '/static/', 

  build: {
    // 1. Where the compiled files go (your project's static folder)
    outDir: path.resolve(__dirname, './static'),
    
    // 2. Don't delete existing files in /static/ (like images or css you put there manually)
    emptyOutDir: false, 

    // 3. Generate a manifest.json so Django can find the hashed files later if needed
    manifest: "manifest.json",

    rollupOptions: {
      input: {
        // 4. This is the path to your raw JS file (the "Source")
        'index': path.resolve(__dirname, './assets/index.js'),
      },
      output: {
        // 5. This names the file 'js/index-bundle.js' inside your outDir
        entryFileNames: `js/[name]-bundle.js`,
        chunkFileNames: `js/[name]-[hash].js`,
        assetFileNames: `assets/[name]-[hash][extname]`,
      },
    },
  },
});