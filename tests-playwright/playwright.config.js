// playwright.config.js
//
// Loads .env.test secrets, runs the safety check, then configures test runs.

require('dotenv').config({ path: '.env.test' });

const { assertNotProduction } = require('./tests/safety-check');

// This throws and crashes the run if any check fails — by design.
assertNotProduction();

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testIgnore: ['safety-check.js', 'helpers/**'],

  // Fail fast in CI; locally allow retries
  fullyParallel: false,      // The booking system has shared state (DB), serialise for safety
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,                // One worker — we share a single test DB

  reporter: [
    ['list'],
    ['html', { open: 'never' }]
  ],

  use: {
    // Only use baseURL if TEST_APP_URL is set — tests that need a served page
    // will skip cleanly if it's blank.
    baseURL: process.env.TEST_APP_URL || undefined,

    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
