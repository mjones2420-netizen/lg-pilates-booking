// tests/ab-10-by-class-tab.spec.js
//
// AB (Admin Bookings) — By Class tab.
// Covers scenario:
//   AB-10: By Class tab groups bookings by block, with Edit/Delete buttons.
//
// The By Class tab renders an accordion of class groups. Each group starts
// collapsed (class-group-body display:none). Clicking the header toggles
// it open by adding the .on class.
//
// This is a read-only spec — uses seeded fixture data, no DB writes.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');

const APP_URL = process.env.TEST_APP_URL;

test.describe('AB-10 — By Class tab', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — AB specs require the app to be served.');

  test('AB-10 — By Class tab groups blocks by class with Edit and Delete buttons', async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });
    await loginAsAdmin(page);

    // Switch to By Class page via sidebar
    await page.locator('#dbnav-byclass').click();
    await expect(page.locator('#dbnav-byclass.on')).toBeVisible();

    const accordion = page.locator('#classes-accordion');
    await expect(accordion).toBeVisible();

    // At least one class group renders
    const groups = accordion.locator('.class-group');
    await expect(groups.first()).toBeVisible({ timeout: 8000 });

    // Find the Monday group and expand it (single click only)
    const monGroup = accordion.locator('.class-group').filter({
      has: page.locator('.class-group-title', { hasText: /Monday/i })
    }).first();
    await expect(monGroup).toBeVisible();
    await monGroup.locator('.class-group-header').click();

    // Body is now visible
    const monBody = monGroup.locator('.class-group-body');
    await expect(monBody).toBeVisible({ timeout: 5000 });

    // Edit Block and Delete Block buttons present
    await expect(monBody.locator('button', { hasText: 'Edit Block' }).first()).toBeVisible();
    await expect(monBody.locator('button', { hasText: 'Delete Block' }).first()).toBeVisible();

    // Mini booking table renders with correct columns (fixture has bookings on mon-current)
    const miniTable = monBody.locator('table').first();
    await expect(miniTable).toBeVisible({ timeout: 5000 });
    await expect(miniTable.locator('th', { hasText: 'Client' })).toBeVisible();
    await expect(miniTable.locator('th', { hasText: 'Status' })).toBeVisible();
    await expect(miniTable.locator('th', { hasText: 'Actions' })).toBeVisible();

    // At least one booking row present
    await expect(miniTable.locator('tbody tr').first()).toBeVisible();
  });
});
