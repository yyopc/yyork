import { defineConfig, devices } from '@playwright/test';

const port = process.env.VITE_PORT ?? '3000';
const baseURL = process.env.VITE_BASE_URL ?? `http://localhost:${port}`;
const desktopViewport = { width: 1440, height: 900 };

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
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
    reuseExistingServer: !process.env.CI,
    url: baseURL,
  },
});
