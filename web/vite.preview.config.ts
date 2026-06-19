import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const configDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(configDir, 'src/browser-preview-agentation.ts'),
      fileName: () => 'agentation.js',
      formats: ['iife'],
      name: 'YyorkBrowserAgentation',
    },
    outDir: '../cmd/yyork/dashboard/app/__yyork_browser',
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
});
