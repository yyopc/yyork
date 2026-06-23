import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import mdx from 'fumadocs-mdx/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const host = env.HOST ?? env.VITE_HOST ?? '127.0.0.1';
  const port = env.PORT
    ? Number(env.PORT)
    : env.VITE_PORT
      ? Number(env.VITE_PORT)
      : 5173;

  return {
    plugins: [mdx(), tailwindcss(), reactRouter()],
    resolve: {
      tsconfigPaths: true,
    },
    server: {
      host,
      port,
      strictPort: true,
      allowedHosts: ['docs.yyork.localhost', '.yyork.localhost', '.localhost'],
    },
  };
});
