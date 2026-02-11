import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://127.0.0.1:3701',
    trace: 'on-first-retry',
    ignoreHTTPSErrors: true,
    proxy: undefined,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--no-proxy-server'],
        },
      },
    },
  ],
  webServer: {
    command: 'NO_PROXY="*" no_proxy="*" PORT=3701 bun run src/index.ts',
    url: 'http://127.0.0.1:3701',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
})
