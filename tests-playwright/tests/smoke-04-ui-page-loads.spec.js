// tests/smoke-04-ui-page-loads.spec.js
//
// Smoke test: prove the front-end renders the 3 seeded classes.
// This test is SKIPPED cleanly if TEST_APP_URL is not set, so the session-6 scaffold
// can be validated without having to serve index.html first.
//
// Once index.html is pointed at the test Supabase project and served somewhere
// (file://, local dev server, or preview deploy), this test will start passing.

const { test, expect } = require('@playwright/test');

const APP_URL = process.env.TEST_APP_URL;

test.describe('Smoke 04 — UI loads', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — UI smoke tests skipped. Set it in .env.test to enable.');

  test('page loads and shows at least one class card', async ({ page }) => {
    await page.goto('/');

    // Wait for the front-end to render classes from the DB. The exact selector
    // will depend on index.html — for now we look for any card-like element
    // that contains a day name. Robust enough for a smoke test.
    const dayHeadings = page.getByText(/Monday|Wednesday|Friday/);
    await expect(dayHeadings.first()).toBeVisible({ timeout: 10000 });
  });

  test('page shows all three seeded class days', async ({ page }) => {
    await page.goto('/');

    // One card per day — assert each is visible
    await expect(page.getByText(/Monday/).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Wednesday/).first()).toBeVisible();
    await expect(page.getByText(/Friday/).first()).toBeVisible();
  });
});
