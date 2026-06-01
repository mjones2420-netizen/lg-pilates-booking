// ac-01-add-new-class.spec.js
//
// AC-01: Add a new class
//
// Verifies that an admin can create a new class via the "+ Add New Class"
// button in the Upcoming Classes section of the dashboard. The class should
// appear in the #ctbody table after creation. It is NOT visible on the
// public booking page yet (no block added).
//
// Cleanup: the created class is deleted in afterEach via direct pg.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { getPool } = require('./helpers/admin-db');

if (!process.env.TEST_APP_URL) {
  test.skip(true, 'TEST_APP_URL not set');
}

test.describe('AC-01 — Add a new class', () => {
  let createdClassId = null;

  test.beforeEach(async ({ page }) => {
    createdClassId = null;
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible();
    await loginAsAdmin(page);
  });

  test.afterEach(async () => {
    if (createdClassId) {
      await getPool().query('DELETE FROM classes WHERE id = $1', [createdClassId]);
    }
  });

  test('new class appears in Upcoming Classes table after creation', async ({ page }) => {
    const uniqueName = `AC01 Test ${Date.now()}`;

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

    // Capture ID for cleanup
    const { rows } = await getPool().query(
      'SELECT id FROM classes WHERE name = $1 ORDER BY id DESC LIMIT 1',
      [uniqueName]
    );
    if (rows.length > 0) createdClassId = rows[0].id;
  });
});
