// tests/ab-02-all-bookings-tab.spec.js
//
// AB (Admin Bookings) — All Bookings tab loads correctly.
// Covers scenario:
//   AB-02: All Bookings tab loads with correct 7-column header and fixture
//          bookings visible.
//
// Approach: login as admin, verify the table header columns in order,
// then confirm at least one fixture booking row renders with a recognisable
// client name. Read-only — no DB writes, no cleanup needed.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');

const APP_URL = process.env.TEST_APP_URL;

test.describe('AB-02 — All Bookings tab loads correctly', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — AB specs require the app to be served.');

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on'), 'TEST MODE banner must be visible').toBeVisible({ timeout: 5000 });
  });

  test('AB-02 — All Bookings tab shows 7-column header and fixture booking rows', async ({ page }) => {
    await loginAsAdmin(page);

    // All Bookings tab is active by default after login
    await expect(page.locator('#dbnav-bookings.on')).toBeVisible();

    // Verify 7 column headers in the correct order.
    // Scope via #btbody's parent table — the dashboard has multiple tables,
    // so a broad 'table thead th' selector matches all of them.
    const headers = page.locator('#btbody').locator('xpath=ancestor::table[1]').locator('thead tr th');
    await expect(headers).toHaveCount(7);
    await expect(headers.nth(0)).toHaveText('Client');
    await expect(headers.nth(1)).toHaveText('Class');
    await expect(headers.nth(2)).toHaveText('When');
    await expect(headers.nth(3)).toHaveText('Block');
    await expect(headers.nth(4)).toHaveText('Paid');
    await expect(headers.nth(5)).toHaveText('Status');
    await expect(headers.nth(6)).toHaveText('Actions');

    // Wait for the table to finish loading (no longer showing "Loading...")
    const tbody = page.locator('#btbody');
    await expect(tbody.locator('tr').first()).not.toContainText('Loading...', { timeout: 10000 });

    // At least one fixture booking should be visible — returning-one has confirmed bookings
    await expect(tbody.locator('tr', { hasText: 'Returning One' }).first()).toBeVisible();

    // Every visible row should have a status pill and action buttons
    const firstRow = tbody.locator('tr', { hasText: 'Returning One' }).first();
    await expect(firstRow.locator('.pill')).toBeVisible();
    await expect(firstRow.locator('button', { hasText: 'View' })).toBeVisible();
    await expect(firstRow.locator('button', { hasText: 'Remove from Block' })).toBeVisible();
    await expect(firstRow.locator('button', { hasText: 'Del Customer' })).toBeVisible();
  });
});
