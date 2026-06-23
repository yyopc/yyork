import { tanstackRouter } from '@tanstack/router-plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import tsConfigPaths from 'vite-tsconfig-paths';

const configDir = dirname(fileURLToPath(import.meta.url));
const buildDir = resolvePath(configDir, 'build');

function cleanBuildDirPreservingPlaceholder() {
  return {
    name: 'yyork-clean-build-dir',
    apply: 'build' as const,
    buildStart() {
      mkdirSync(buildDir, { recursive: true });
      for (const entry of readdirSync(buildDir)) {
        if (entry === '.gitkeep') {
          continue;
        }
        rmSync(resolvePath(buildDir, entry), { recursive: true, force: true });
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const backendOrigin = env.VITE_BACKEND_ORIGIN ?? 'http://127.0.0.1:7331';
  const webHost = env.VITE_HOST ?? '127.0.0.1';
  const lilGuiDir = dirname(createRequire(import.meta.url).resolve('lil-gui'));

  const resolve =
    mode === 'development'
      ? {
          alias: [
            // lil-gui ships CSS on disk but omits it from package exports.
            {
              find: 'lil-gui/dist/lil-gui.css',
              replacement: join(lilGuiDir, 'lil-gui.css'),
            },
            {
              // Avoid stale Vite optimized-dependency cache entries for the
              // dev-only lazy Glimm panel.
              find: /^lil-gui$/,
              replacement: join(lilGuiDir, 'lil-gui.esm.js'),
            },
          ],
        }
      : undefined;

  return {
    ...(resolve ? { resolve } : {}),
    build: {
      // Build into the Go embed directory. The .gitkeep placeholder keeps the
      // embed pattern valid on a fresh checkout before a web build exists.
      outDir: 'build',
      emptyOutDir: false,
    },
    server: {
      host: webHost,
      port: env.VITE_PORT ? Number(env.VITE_PORT) : 3000,
      proxy: {
        '/api': {
          changeOrigin: true,
          target: backendOrigin,
          ws: true,
        },
      },
      strictPort: true,
    },
    plugins: [
      tsConfigPaths(),
      // Generates src/route-tree.gen.ts from src/routes/. Replaces the
      // route-tree codegen that @tanstack/react-start used to do as part of
      // its SSR setup — we're now a client-only SPA.
      tanstackRouter({
        generatedRouteTree: './src/route-tree.gen.ts',
        target: 'react',
        autoCodeSplitting: true,
      }),
      // react's vite plugin must come after the router plugin.
      viteReact({
        babel: {
          plugins: ['babel-plugin-react-compiler'],
        },
      }),
      cleanBuildDirPreservingPlaceholder(),
    ],
  };
});
