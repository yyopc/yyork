import { tanstackRouter } from '@tanstack/router-plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import tsConfigPaths from 'vite-tsconfig-paths';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const backendOrigin = env.VITE_BACKEND_ORIGIN ?? 'http://127.0.0.1:7331';

  return {
    server: {
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
      // Generates src/routeTree.gen.ts from src/routes/. Replaces the
      // route-tree codegen that @tanstack/react-start used to do as part of
      // its SSR setup — we're now a client-only SPA.
      tanstackRouter({
        target: 'react',
        autoCodeSplitting: true,
      }),
      // react's vite plugin must come after the router plugin.
      viteReact({
        babel: {
          plugins: ['babel-plugin-react-compiler'],
        },
      }),
    ],
  };
});
