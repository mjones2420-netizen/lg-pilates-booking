// playwright.config.js
//
// Loads .env.test secrets, runs the safety check, then configures test runs.

require('dotenv').config({ path: '.env.test' });

const { assertNotProduction } = require('./tests/safety-check');

// This throws and crashes the run if any check fails — by design.
assertNotProduction();

const { defineConfig, devices } = require('@playwright/test');

// Derive the origin (e.g. "http://localhost:8000") from TEST_APP_URL so
// page.goto('/') resolves against the correct server. The path+query
// (e.g. "/?env=test") is consumed separately via tests/helpers/app-url.js.
//
// This split is necessary because Playwright's baseURL strips the query
// string — without it, page.goto('/') would load "http://localhost:8000/"
// with no env switch, defaulting the app to PRODUCTION Supabase.
let baseURL;
if (process.env.TEST_APP_URL) {
  try { baseURL = new URL(process.env.TEST_APP_URL).origin; }
  catch (e) { baseURL = undefined; }
}

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
    baseURL,
    trace: 'on',
    screenshot: 'on',
    video: 'on',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
