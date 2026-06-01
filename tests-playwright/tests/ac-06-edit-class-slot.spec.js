// ac-06-edit-class-slot.spec.js
//
// AC-06: Edit a class slot
//
// Verifies that an admin can edit an existing class via the "Edit" button
// in the Upcoming Classes section. Updated info (venue, time) should be
// reflected on the public booking page class cards after saving.
//
// Uses a fresh class + block per-run so the edited class is visible on the
// public schedule. Cleanup: afterEach deletes class (blocks cascade).

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { getPool } = require('./helpers/admin-db');

if (!process.env.TEST_APP_URL) {
  test.skip(true, 'TEST_APP_URL not set');
}

function futureWednesday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const daysUntil = day <= 3 ? 3 - day : 10 - day;
  d.setDate(d.getDate() + daysUntil + 14);
  return d.toISOString().split('T')[0];
}

test.describe('AC-06 — Edit a class slot', () => {
  let createdClassId = null;
  const className = `AC06 Test ${Date.now()}`;

  test.beforeEach(async ({ page }) => {
    const startDate = futureWednesday();
    const end = new Date(startDate + 'T00:00:00');
    end.setDate(end.getDate() + 35);
    const endDate = end.toISOString().split('T')[0];

    const { rows: cr } = await getPool().query(
      `INSERT INTO classes (name, level, day, time, end_time, venue, loc)
       VALUES ($1, $1, 'Wednesday', '7:00pm', '7:45pm', 'Old Venue', 'Baildon')
       RETURNING id`,
      [className]
    );
    createdClassId = cr[0].id;

    await getPool().query(
      `INSERT INTO blocks (class_id, start_date, end_date, weeks, dates, price, cap, booked, wait, visible, status)
       VALUES ($1, $2, $3, 6, ARRAY[]::text[], 10, 12, 0, 0, true, 'upcoming')`,
      [createdClassId, startDate, endDate]
    );

    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible();
    await loginAsAdmin(page);
  });

  test.afterEach(async () => {
    if (createdClassId) {
      await getPool().query('DELETE FROM blocks WHERE class_id = $1', [createdClassId]);
      await getPool().query('DELETE FROM classes WHERE id = $1', [createdClassId]);
    }
  });

  test('updated venue and time shown on public booking page after save', async ({ page }) => {
    // Find the class row in #ctbody and click Edit
    const ctRow = page.locator('#ctbody tr').filter({ hasText: className });
    await expect(ctRow).toBeVisible({ timeout: 5000 });
    await ctRow.getByRole('button', { name: 'Edit' }).click();

    // Edit modal opens (reuses the add-class overlay with "Edit Class" title)
    await expect(page.locator('#add-class-overlay.on')).toBeVisible();
    await expect(page.locator('#add-class-overlay .mtitle')).toContainText('Edit Class');

    // Change venue and time
    await page.locator('#ac-venue').fill('New Venue');
    await page.locator('#ac-time').fill('8:00pm');
    await page.locator('#ac-end').fill('8:45pm');

    // Save
    await page.locator('#ac-btn').click();

    // Toast confirms update
    await expect(page.locator('#toastEl')).toContainText('Class updated!');
    await expect(page.locator('#add-class-overlay.on')).not.toBeVisible();

    // Updated info appears on the public booking page
    await page.locator('#nb-schedule').click();
    await expect(page.locator('#pg-schedule.on')).toBeVisible();
    const card = page.locator('.card').filter({ hasText: className });
    await expect(card).toBeVisible({ timeout: 5000 });
    await expect(card).toContainText('8:00pm');
  });
});
