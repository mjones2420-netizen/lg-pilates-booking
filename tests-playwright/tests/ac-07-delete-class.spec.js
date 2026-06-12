// ac-07-delete-class.spec.js
//
// AC-07: Delete a class
//
// Verifies that an admin can delete a class via the "Delete" button in the
// Upcoming Classes section. After deletion: toast confirms, class disappears
// from the ctbody table, and the class no longer appears on the public
// booking page.
//
// Uses a fresh class + block per-run. Deletion IS the test — no afterEach
// cleanup needed on success. Belt-and-braces afterEach cleans up if the
// test fails before the deletion step.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { getPool } = require('./helpers/admin-db');

if (!process.env.TEST_APP_URL) {
  test.skip(true, 'TEST_APP_URL not set');
}

function futureTuesday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const daysUntil = day <= 2 ? 2 - day : 9 - day;
  d.setDate(d.getDate() + daysUntil + 14);
  return d.toISOString().split('T')[0];
}

test.describe('AC-07 — Delete a class', () => {
  let createdClassId = null;
  const className = `AC07 Test ${Date.now()}`;

  test.beforeEach(async ({ page }) => {
    const startDate = futureTuesday();
    const end = new Date(startDate + 'T00:00:00');
    end.setDate(end.getDate() + 35);
    const endDate = end.toISOString().split('T')[0];

    const { rows: cr } = await getPool().query(
      `INSERT INTO classes (name, level, day, time, end_time, venue, loc)
       VALUES ($1, $1, 'Tuesday', '6:00pm', '6:45pm', 'Test Venue', 'Guiseley')
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
    // Only fires if the class still exists — i.e. the test didn't complete deletion
    if (createdClassId) {
      const { rows } = await getPool().query(
        'SELECT id FROM classes WHERE id = $1', [createdClassId]
      );
      if (rows.length > 0) {
        await getPool().query('DELETE FROM blocks WHERE class_id = $1', [createdClassId]);
        await getPool().query('DELETE FROM classes WHERE id = $1', [createdClassId]);
      }
      createdClassId = null;
    }
  });

  test('class deleted — toast shown, row gone, class absent from schedule', async ({ page }) => {
    // Navigate to Classes page
    await page.locator('#dbnav-classes').click();
    await expect(page.locator('#dbnav-classes.on')).toBeVisible();

    // Find the class row in #ctbody and click Delete
    const ctRow = page.locator('#ctbody tr').filter({ hasText: className });
    await expect(ctRow).toBeVisible({ timeout: 5000 });

    // Accept the confirm dialog
    page.once('dialog', d => d.accept());
    await ctRow.getByRole('button', { name: 'Delete' }).click();

    // Toast confirms deletion
    await expect(page.locator('#toastEl')).toContainText('Class deleted.');

    // Row is gone from #ctbody
    await expect(ctRow).not.toBeVisible();

    // Class no longer appears on the public booking page
    await page.locator('#nb-schedule').click();
    await expect(page.locator('#pg-schedule.on')).toBeVisible();
    await page.locator('.card').first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    await expect(page.locator('.card').filter({ hasText: className })).not.toBeVisible();

    // Mark as already deleted so afterEach skips the cleanup
    createdClassId = null;
  });
});
