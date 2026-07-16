import { defineConfig, devices } from '@playwright/test';

const port = process.env.VITE_PORT ?? '3000';
const baseURL = process.env.VITE_BASE_URL ?? `http://localhost:${port}`;
const desktopViewport = { width: 1440, height: 900 };
const isCI = Boolean(process.env.CI);

// Headed but off-screen so agent/local runs don't steal keyboard focus.
// Playwright defaults colorScheme to "light"; null follows the OS (system).
const backgroundHeadedLaunchArgs = [
  `--window-position=-2400,-2400`,
  `--window-size=${desktopViewport.width},${desktopViewport.height}`,
];

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI ? 'github' : 'list',
  use: {
    baseURL,
    // null → no prefers-color-scheme override (system theme).
    colorScheme: null,
    // Local/agent: headed off-screen. CI: headless.
    headless: isCI,
    launchOptions: {
      args: isCI ? undefined : backgroundHeadedLaunchArgs,
    },
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        contextOptions: {
          screen: desktopViewport,
        },
        hasTouch: false,
        isMobile: false,
        viewport: desktopViewport,
      },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    reuseExistingServer: !isCI,
    url: baseURL,
  },
});
