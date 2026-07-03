import babel from '@rolldown/plugin-babel';
import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import tsConfigPaths from 'vite-tsconfig-paths';

const configDir = dirname(fileURLToPath(import.meta.url));

/**
 * Design surface for mock.yyork.localhost. Pages are top-level documents (no
 * Storybook iframe). Interactive surfaces mount thin React entries that reuse
 * real yyork components and tokens.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, configDir, 'VITE_');

  return {
    root: resolve(configDir, 'mock'),
    publicDir: resolve(configDir, 'public'),
    resolve: {
      alias: {
        '@': resolve(configDir, 'src'),
      },
    },
    server: {
      host: env.VITE_HOST ?? process.env.HOST ?? '127.0.0.1',
      port: process.env.PORT ? Number(process.env.PORT) : 4173,
      strictPort: false,
      fs: {
        allow: [configDir],
      },
    },
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'lucide-react',
        'ts-pattern',
        'slot-text',
      ],
    },
    plugins: [
      tsConfigPaths({
        root: configDir,
      }),
      viteReact(),
      babel({ presets: [reactCompilerPreset()] }),
    ],
  };
});
