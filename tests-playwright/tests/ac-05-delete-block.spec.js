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
  let createdBlockId = null;
  let createdCustomerId = null;
  let createdBookingId = null;
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

    const { rows: br } = await getPool().query(
      `INSERT INTO blocks (class_id, start_date, end_date, weeks, dates, price, cap, booked, wait, visible, status)
       VALUES ($1, $2, $3, 6, ARRAY[]::text[], 10, 12, 1, 0, true, 'upcoming')
       RETURNING id`,
      [createdClassId, startDate, endDate]
    );
    createdBlockId = br[0].id;

    // #56: a booking + parq row so we can prove the RPC's DELETE FROM blocks
    // cascades all the way down (orphan-check), not just removes the block row.
    const { rows: custR } = await getPool().query(
      `INSERT INTO customers (first_name, last_name, email, phone, customer_type)
       VALUES ('Ac05', 'Testclient', $1, '07700000005', 'new') RETURNING id`,
      [`ac05-${Date.now()}@test.example`]
    );
    createdCustomerId = custR[0].id;

    const { rows: bookR } = await getPool().query(
      `INSERT INTO bookings (class_id, block_id, customer_id, status, amount_due)
       VALUES ($1, $2, $3, 'confirmed', 10) RETURNING id`,
      [createdClassId, createdBlockId, createdCustomerId]
    );
    createdBookingId = bookR[0].id;

    await getPool().query(
      `INSERT INTO parq (booking_id, customer_id, age, emergency_name, emergency_relationship,
         emergency_phone, q1_heart, q2_circulatory, q3_blood_pressure, q4_chest_pain,
         q5_joint, q6_dizziness, q7_pregnant, q8_doctor_advised, q9_spinal,
         q10_medication, q11_asthma, q12_other_reasons, print_name, sign_date)
       VALUES ($1, $2, '30', 'Em Contact', 'Friend', '07700000006',
         'No','No','No','No','No','No','No','No','No','No','No','No',
         'Ac05 Testclient', CURRENT_DATE)`,
      [createdBookingId, createdCustomerId]
    );

    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible();
    await loginAsAdmin(page);
  });

  test.afterEach(async () => {
    if (createdCustomerId) {
      await getPool().query('DELETE FROM parq WHERE customer_id = $1', [createdCustomerId]);
      await getPool().query('DELETE FROM bookings WHERE customer_id = $1', [createdCustomerId]);
      await getPool().query('DELETE FROM customers WHERE id = $1', [createdCustomerId]);
    }
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

    // The class group now shows the no-blocks empty state (wording changed when
    // the Booking History page was added)
    await expect(groupBody).toContainText('No current or upcoming blocks');

    // Class is no longer visible on the public booking page
    await page.locator('#nb-schedule').click();
    await expect(page.locator('#pg-schedule.on')).toBeVisible();
    await page.locator('.card').first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    await expect(page.locator('.card').filter({ hasText: className })).not.toBeVisible();

    // #56: orphan-check — booking and parq cascaded away with the block,
    // proving admin_delete_block's single DELETE actually cascaded rather
    // than leaving orphaned rows behind.
    const { rows: bookingRows } = await getPool().query(
      'SELECT id FROM bookings WHERE id = $1', [createdBookingId]
    );
    expect(bookingRows.length, 'booking should be cascade-deleted with the block').toBe(0);
    const { rows: parqRows } = await getPool().query(
      'SELECT id FROM parq WHERE booking_id = $1', [createdBookingId]
    );
    expect(parqRows.length, 'parq should be cascade-deleted with the block').toBe(0);
  });
});
