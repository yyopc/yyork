import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

const resolve = (filePath: string) => path.resolve(__dirname, filePath);
const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const isCI = Boolean(process.env.CI);

// Headed-but-background: keep Chromium off-screen so local/agent runs do not
// steal focus. CI stays headless via browser.headless default (process.env.CI).
const backgroundHeadedLaunchArgs = [
  '--window-position=-2400,-2400',
  '--window-size=1440,900',
];

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        optimizeDeps: {
          include: [
            '@base-ui/react/checkbox',
            '@base-ui/react/scroll-area',
            '@base-ui/react/toggle',
            '@pierre/diffs/react',
            '@pierre/trees/react',
            'react-resizable-panels',
          ],
        },
        test: {
          name: 'browser',
          browser: {
            enabled: true,
            // Explicit: headed locally (out of focus via launch args), headless in CI.
            headless: isCI,
            provider: playwright({
              launchOptions: {
                ...(chromiumExecutablePath
                  ? { executablePath: chromiumExecutablePath }
                  : {}),
                ...(isCI ? {} : { args: backgroundHeadedLaunchArgs }),
              },
              contextOptions: {
                // null → follow OS prefers-color-scheme (system theme).
                // Playwright otherwise defaults to light.
                colorScheme: null,
                permissions: ['clipboard-write', 'clipboard-read'],
              },
            }),
            instances: [{ browser: 'chromium' }],
          },
          include: ['src/**/*.browser.{test,spec}.?(c|m)[jt]s?(x)'],
          setupFiles: [
            resolve('src/tests/setup.base.ts'),
            resolve('src/tests/setup.browser.ts'),
          ],
        },
        resolve: {
          alias: {
            '@': resolve('./src'),
          },
        },
      },
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.unit.{test,spec}.?(c|m)[jt]s?(x)'],
          setupFiles: [resolve('src/tests/setup.base.ts')],
        },
        resolve: {
          alias: {
            '@': resolve('./src'),
          },
        },
      },
    ],
  },
});
