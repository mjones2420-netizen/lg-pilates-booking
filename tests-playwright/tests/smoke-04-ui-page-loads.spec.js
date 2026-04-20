// tests/smoke-04-ui-page-loads.spec.js
//
// Smoke test: prove the front-end renders the 3 seeded classes.
// This test is SKIPPED cleanly if TEST_APP_URL is not set.
//
// IMPORTANT: uses APP_PATH from tests/helpers/app-url.js so that query
// strings like ?env=test in TEST_APP_URL are preserved. A plain
// page.goto('/') strips the query and sends the app to PRODUCTION Supabase.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');

const APP_URL = process.env.TEST_APP_URL;

test.describe('Smoke 04 — UI loads', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — UI smoke tests skipped. Set it in .env.test to enable.');

  test('page loads and shows at least one class card', async ({ page }) => {
    await page.goto(APP_PATH);

    const dayHeadings = page.getByText(/Monday|Wednesday|Friday/);
    await expect(dayHeadings.first()).toBeVisible({ timeout: 10000 });
  });

  test('page shows all three seeded class days', async ({ page }) => {
    await page.goto(APP_PATH);

    await expect(page.getByText(/Monday/).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Wednesday/).first()).toBeVisible();
    await expect(page.getByText(/Friday/).first()).toBeVisible();
  });

  test('TEST MODE banner is visible (proves env switch is active)', async ({ page }) => {
    await page.goto(APP_PATH);
    // When ?env=test is honoured, the red TEST MODE banner should be visible
    // (class toggles from "test-mode-banner" to "test-mode-banner on").
    // If this fails, the test is hitting production — stop everything.
    await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });
  });
});
