// ac-05-delete-block.spec.js
//
// AC-05: Delete a block
//
// Verifies that an admin can delete a block via the "Delete Block" button
// in the By Class tab. After deletion the block should disappear from the
// accordion and, since this is the only block, the class should also
// disappear from the public booking page.
//
// Uses a fresh class + block per-run. Deletion IS the test, so afterEach
// only needs to clean up if something went wrong before deletion.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { getPool } = require('./helpers/admin-db');

if (!process.env.TEST_APP_URL) {
  test.skip(true, 'TEST_APP_URL not set');
}

function futureMonday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const daysUntil = day === 1 ? 7 : (8 - day) % 7;
  d.setDate(d.getDate() + daysUntil + 28);
  return d.toISOString().split('T')[0];
}

test.describe('AC-05 — Delete a block', () => {
  let createdClassId = null;
  const className = `AC05 Test ${Date.now()}`;

  test.beforeEach(async ({ page }) => {
    const startDate = futureMonday();
    const end = new Date(startDate + 'T00:00:00');
    end.setDate(end.getDate() + 35);
    const endDate = end.toISOString().split('T')[0];

    const { rows: cr } = await getPool().query(
      `INSERT INTO classes (name, level, day, time, end_time, venue, loc)
       VALUES ($1, $1, 'Monday', '8:00am', '8:45am', 'Test Venue', 'Baildon')
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
      const { rows } = await getPool().query('SELECT id FROM classes WHERE id = $1', [createdClassId]);
      if (rows.length > 0) {
        await getPool().query('DELETE FROM blocks WHERE class_id = $1', [createdClassId]);
        await getPool().query('DELETE FROM classes WHERE id = $1', [createdClassId]);
      }
      createdClassId = null;
    }
  });

  test('block removed from accordion and class hidden on schedule after deletion', async ({ page }) => {
    // Navigate to By Class tab
    await page.locator('#dbnav-byclass').click();
    await expect(page.locator('#dbnav-byclass.on')).toBeVisible();

    // Expand the class group
    const header = page.locator('.class-group-header').filter({ hasText: className });
    await expect(header).toBeVisible({ timeout: 5000 });
    await header.click();
    const groupBody = page.locator(`#cg-${createdClassId}`);
    await expect(groupBody).toBeVisible();

    // Click Delete Block — accept the confirm dialog
    page.once('dialog', d => d.accept());
    await groupBody.getByRole('button', { name: 'Delete Block' }).click();

    // Toast confirms deletion
    await expect(page.locator('#toastEl')).toContainText('Block deleted.');

    // The class group now shows "No blocks yet"
    await expect(groupBody).toContainText('No blocks yet');

    // Class is no longer visible on the public booking page
    await page.locator('#nb-schedule').click();
    await expect(page.locator('#pg-schedule.on')).toBeVisible();
    await page.locator('.card').first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    await expect(page.locator('.card').filter({ hasText: className })).not.toBeVisible();
  });
});
