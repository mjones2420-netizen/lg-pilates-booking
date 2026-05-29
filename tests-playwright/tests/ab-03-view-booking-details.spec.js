// tests/ab-03-view-booking-details.spec.js
//
// AB (Admin Bookings) — View booking details modal.
// Covers scenario:
//   AB-03: Clicking View on a booking row opens the detail overlay,
//          showing booking fields (status, email, block dates) and — for
//          returning customers — the "no health form required" message.
//
// Uses the returning-one fixture customer (confirmed booking on mon-current).
// Read-only — no DB writes, no cleanup needed.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');

const APP_URL = process.env.TEST_APP_URL;

test.describe('AB-03 — View booking details modal', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — AB specs require the app to be served.');

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on'), 'TEST MODE banner must be visible').toBeVisible({ timeout: 5000 });
  });

  test('AB-03 — View button opens detail overlay with booking and customer info', async ({ page }) => {
    await loginAsAdmin(page);

    const tbody = page.locator('#btbody');
    await expect(tbody.locator('tr', { hasText: 'Returning One' }).first()).toBeVisible({ timeout: 10000 });

    // Click View on the first Returning One row
    const row = tbody.locator('tr', { hasText: 'Returning One' }).first();
    await row.locator('button', { hasText: 'View' }).click();

    // Overlay should open with the client's name in the title
    await expect(page.locator('#view-overlay.on')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#view-title')).toHaveText('Returning One');

    // Wait for async body load (replaces the "Loading..." placeholder)
    const viewBody = page.locator('#view-body');
    await expect(viewBody).not.toContainText('Loading...', { timeout: 8000 });

    // Booking Details section should contain key fields
    await expect(viewBody).toContainText('Status');
    await expect(viewBody).toContainText('Email');
    await expect(viewBody).toContainText('returning-one@test.example');
    await expect(viewBody).toContainText('Amount Due');

    // Returning customer has no PAR-Q — "no health form" message should show
    await expect(viewBody).toContainText('no health form required');

    // Close the overlay
    await page.locator('#view-overlay button', { hasText: 'Close' }).click();
    await expect(page.locator('#view-overlay.on')).not.toBeVisible({ timeout: 3000 });
  });
});
