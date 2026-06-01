// ac-01-add-new-class.spec.js
//
// AC-01: Add a new class
//
// Verifies that an admin can create a new class via the "+ Add New Class"
// button in the Upcoming Classes section of the dashboard. The class should
// appear in the #ctbody table after creation. It is NOT visible on the
// public booking page yet (no block added).
//
// Cleanup: the unique class name is set in beforeEach so afterEach can
// always query and delete by name, regardless of whether the test passed
// or failed before the ID was captured.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { getPool } = require('./helpers/admin-db');

if (!process.env.TEST_APP_URL) {
  test.skip(true, 'TEST_APP_URL not set');
}

test.describe('AC-01 — Add a new class', () => {
  let uniqueName = null;

  test.beforeEach(async ({ page }) => {
    // Set the name here so afterEach can always clean up by name,
    // even if the test fails before the class is created or the ID captured.
    uniqueName = `AC01 Test ${Date.now()}`;
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible();
    await loginAsAdmin(page);
  });

  test.afterEach(async () => {
    if (uniqueName) {
      await getPool().query('DELETE FROM classes WHERE name = $1', [uniqueName]);
    }
  });

  test('new class appears in Upcoming Classes table after creation', async ({ page }) => {
    // Click + Add New Class button
    await page.getByRole('button', { name: '+ Add New Class' }).click();
    await expect(page.locator('#add-class-overlay.on')).toBeVisible();

    // Fill the form
    await page.locator('#ac-day').selectOption('Monday');
    await page.locator('#ac-level').fill(uniqueName);
    await page.locator('#ac-time').fill('9:00am');
    await page.locator('#ac-end').fill('9:45am');
    await page.locator('#ac-venue').fill('Test Venue');
    await page.locator('#ac-loc').selectOption('Baildon');

    // Submit
    await page.locator('#ac-btn').click();

    // Toast confirms creation
    await expect(page.locator('#toastEl')).toContainText('Class created!');

    // Modal closes
    await expect(page.locator('#add-class-overlay.on')).not.toBeVisible();

    // Class appears in the Upcoming Classes table (#ctbody)
    const row = page.locator('#ctbody tr').filter({ hasText: uniqueName });
    await expect(row).toBeVisible({ timeout: 5000 });

    // Not visible on the public booking page yet (no block added)
    await page.locator('#nb-schedule').click();
    await expect(page.locator('#pg-schedule.on')).toBeVisible();
    await expect(page.locator('.card').filter({ hasText: uniqueName })).not.toBeVisible();
  });
});
