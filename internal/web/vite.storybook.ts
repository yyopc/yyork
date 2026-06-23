import viteReact from '@vitejs/plugin-react';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import tsConfigPaths from 'vite-tsconfig-paths';

const configDir = dirname(fileURLToPath(import.meta.url));

/**
 * Vite config for Storybook. Keeps path aliases and React compiler support
 * without the app router plugin or production embed build settings.
 */
export default defineConfig({
  resolve: {
    alias: {
      // lil-gui ships CSS on disk but omits it from package exports.
      'lil-gui/dist/lil-gui.css': join(
        dirname(createRequire(import.meta.url).resolve('lil-gui')),
        'lil-gui.css'
      ),
    },
  },
  plugins: [
    tsConfigPaths({
      root: configDir,
    }),
    viteReact({
      babel: {
        plugins: ['babel-plugin-react-compiler'],
      },
    }),
  ],
});
