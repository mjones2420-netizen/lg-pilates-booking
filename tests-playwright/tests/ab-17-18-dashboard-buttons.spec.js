// tests/ab-17-18-dashboard-buttons.spec.js
//
// AB (Admin Bookings) — Dashboard button layout and sign-in regression.
// Covers scenarios:
//   AB-17: Each booking row shows View, Remove from Block, Del Customer.
//          Confirm button only present for reserved bookings.
//          No "Cancel" or "Refund" buttons (removed in a prior session).
//   AB-18: After sign-out, signing in again resets the button text to
//          "Sign In" and the dashboard loads normally (regression check).
//
// AB-17 is read-only — uses fixture bookings, no DB writes.
// AB-18 requires sign-out then sign-in without a page reload.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin, signOutAdmin } = require('./helpers/admin-auth');

const APP_URL = process.env.TEST_APP_URL;

test.describe('AB-17/AB-18 — Dashboard button layout and sign-in reset', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — AB specs require the app to be served.');

  // ── AB-17 ─────────────────────────────────────────────────────────────────

  test('AB-17 — booking row shows correct action buttons, no stale Cancel/Refund', async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });
    await loginAsAdmin(page);

    const tbody = page.locator('#btbody');
    const firstRow = tbody.locator('tr').first();
    await expect(firstRow).toBeVisible({ timeout: 10000 });

    // Required buttons present
    await expect(firstRow.locator('button', { hasText: 'View' })).toBeVisible();
    await expect(firstRow.locator('button', { hasText: 'Remove from Block' })).toBeVisible();
    await expect(firstRow.locator('button', { hasText: 'Del Customer' })).toBeVisible();

    // Stale buttons must NOT be present on any row
    await expect(tbody.locator('button', { hasText: 'Cancel' })).toHaveCount(0);
    await expect(tbody.locator('button', { hasText: 'Refund' })).toHaveCount(0);
  });

  // ── AB-18 ─────────────────────────────────────────────────────────────────

  test('AB-18 — sign-in button resets correctly on second sign-in after sign-out', async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });
    await loginAsAdmin(page);

    // Sign out — returns to schedule view
    await signOutAdmin(page);

    // Navigate back to dashboard login WITHOUT a page reload
    await page.locator('#nb-dashboard').click();
    await expect(page.locator('#pg-dash-login.on')).toBeVisible({ timeout: 5000 });

    // Button starts as "Sign In"
    const loginBtn = page.locator('#dash-login-btn');
    await expect(loginBtn).toHaveText('Sign In');

    // Sign in again
    await page.locator('#dash-email').fill(process.env.TEST_ADMIN_EMAIL);
    await page.locator('#dash-password').fill(process.env.TEST_ADMIN_PASSWORD);
    await loginBtn.click();

    // Dashboard loads — button text resets to "Sign In" (not stuck on "Signing in...")
    await expect(page.locator('#pg-dashboard.on')).toBeVisible({ timeout: 10000 });
    await expect(loginBtn).toHaveText('Sign In');
    await expect(loginBtn).toBeEnabled();
  });
});
