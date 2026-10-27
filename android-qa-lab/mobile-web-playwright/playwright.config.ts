import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;
const PORT = Number(process.env.PORT) || 4173;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  // One retry on CI; anything that only passes on retry is reported as "flaky".
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 5_000 },

  reporter: isCI
    ? [
        ['list'],
        ['github'],
        ['html', { open: 'never' }],
        ['junit', { outputFile: 'test-results/junit.xml' }],
        // Feeds the test results dashboard (scripts/build-test-dashboard.mjs).
        ['json', { outputFile: 'test-results/results.json' }],
      ]
    : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: `http://localhost:${PORT}`,
    // Same time zone and language everywhere, so dates and "overdue" never depend on the machine.
    timezoneId: 'America/Chicago',
    locale: 'en-US',
    // RECORD_VIDEO=1 keeps a trace and a video of every test (for demos); otherwise only for failures.
    trace: process.env.RECORD_VIDEO ? 'on' : 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: process.env.RECORD_VIDEO ? 'on' : 'retain-on-failure',
  },

  projects: [
    {
      name: 'Android - Pixel 7',
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'iPhone 14',
      use: { ...devices['iPhone 14'] },
    },
    {
      // Same app on a desktop browser: proves the responsive layout works both ways.
      name: 'Desktop Chrome',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'node server.js',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !isCI,
    timeout: 30_000,
  },
});
