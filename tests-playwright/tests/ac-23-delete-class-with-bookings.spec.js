// AC-23 — Delete class with bookings + PAR-Qs — completes cleanly
// Verifies that deleting a class that has bookings and PAR-Q records succeeds without
// error. The class, its blocks, and bookings are removed. The cancellations audit trail
// is NOT checked here (deleteClass does not write cancellations — that's the RFB flow).
//
// Setup: Per-run class + block + customer + booking + parq row, all via direct pg.
// The test then logs into the admin dashboard, locates the class in #ctbody, and
// clicks Delete → confirms → asserts toast "Class deleted." and row gone from ctbody.
// Also asserts the class no longer appears on the public schedule.
//
// afterEach cleans up if the test fails before deletion completes.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin, signOutAdmin } = require('./helpers/admin-auth');

test.describe('AC-23 — Delete class with bookings + PAR-Qs completes cleanly', () => {

  let createdClassId = null;
  let createdCustomerId = null;

  test.beforeEach(async () => {
    createdClassId = null;
    createdCustomerId = null;
  });

  test.afterEach(async () => {
    const { getPool } = require('./helpers/admin-db');
    const pool = getPool();
    if (createdCustomerId) {
      await pool.query('DELETE FROM parq WHERE customer_id = $1', [createdCustomerId]);
      await pool.query('DELETE FROM bookings WHERE customer_id = $1', [createdCustomerId]);
      await pool.query('DELETE FROM customers WHERE id = $1', [createdCustomerId]);
    }
    if (createdClassId) {
      await pool.query('DELETE FROM blocks WHERE class_id = $1', [createdClassId]);
      await pool.query('DELETE FROM classes WHERE id = $1', [createdClassId]);
    }
  });

  test('deleting a class with bookings and PAR-Qs shows success toast and removes class', async ({ page }) => {
    const { getPool } = require('./helpers/admin-db');
    const pool = getPool();

    // Create a per-run Wednesday class (safe day — won't clash with fixture overlap)
    const classResult = await pool.query(`
      INSERT INTO classes (name, level, day, time, end_time, venue, loc)
      VALUES ('AC23 Test Class', 'Mixed Ability', 'Wednesday', '6:00pm', '6:45pm', 'Test Venue', 'Test Loc')
      RETURNING id
    `);
    createdClassId = classResult.rows[0].id;

    // Add a block far in the future
    const blockResult = await pool.query(`
      INSERT INTO blocks (class_id, start_date, end_date, weeks, dates, price, cap, booked, visible, status)
      VALUES ($1, '2030-04-02', '2030-05-07', 6, ARRAY[]::text[], 60, 12, 1, true, 'upcoming')
      RETURNING id
    `, [createdClassId]);
    const blockId = blockResult.rows[0].id;

    // Create a customer
    const custResult = await pool.query(`
      INSERT INTO customers (first_name, last_name, email, phone, customer_type)
      VALUES ('AC23', 'Testclient', 'ac23-test@test.example', '07700000023', 'new')
      RETURNING id
    `);
    createdCustomerId = custResult.rows[0].id;

    // Create a booking
    const bookingResult = await pool.query(`
      INSERT INTO bookings (class_id, block_id, customer_id, status, amount_due)
      VALUES ($1, $2, $3, 'confirmed', 60)
      RETURNING id
    `, [createdClassId, blockId, createdCustomerId]);
    const bookingId = bookingResult.rows[0].id;

    // Create a PAR-Q row for that booking
    await pool.query(`
      INSERT INTO parq (booking_id, customer_id, age, emergency_name, emergency_relationship, emergency_phone,
        q1_heart, q2_circulatory, q3_blood_pressure, q4_chest_pain, q5_joint,
        q6_dizziness, q7_pregnant, q8_doctor_advised, q9_spinal, q10_medication, q11_asthma, q12_other_reasons,
        print_name, sign_date)
      VALUES ($1, $2, 30, 'Test Contact', 'Friend', '07700000000',
        'No','No','No','No','No','No','No','No','No','No','No','No',
        'AC23 Testclient', '2026-06-01')
    `, [bookingId, createdCustomerId]);

    await page.goto(APP_PATH);
    expect(await page.locator('#test-mode-banner.on').isVisible()).toBe(true);

    await loginAsAdmin(page);

    // Navigate to Classes page
    await page.locator('#dbnav-classes').click();
    await expect(page.locator('#dbnav-classes.on')).toBeVisible();

    // Find the class row in #ctbody and click Delete
    const ctbody = page.locator('#ctbody');
    await expect(ctbody).toBeVisible();
    const classRow = ctbody.locator('tr', { hasText: 'AC23 Test Class' });
    await expect(classRow).toBeVisible();

    page.once('dialog', d => d.accept());
    await classRow.locator('button', { hasText: 'Delete' }).click();

    // Toast confirms deletion
    await expect(page.locator('#toastEl')).toContainText('Class deleted.');

    // Row gone from ctbody
    await expect(ctbody.locator('tr', { hasText: 'AC23 Test Class' })).toHaveCount(0);

    // Class no longer on public schedule
    await signOutAdmin(page);
    await page.locator('#nb-schedule').click();
    await expect(page.locator('.card', { hasText: 'AC23 Test Class' })).toHaveCount(0);

    // #56: orphan-check — booking and parq cascaded away with the class,
    // proving admin_delete_class's single DELETE actually cascaded rather
    // than leaving orphaned rows behind.
    const { rows: bookingRows } = await pool.query('SELECT id FROM bookings WHERE id = $1', [bookingId]);
    expect(bookingRows.length, 'booking should be cascade-deleted with the class').toBe(0);
    const { rows: parqRows } = await pool.query('SELECT id FROM parq WHERE booking_id = $1', [bookingId]);
    expect(parqRows.length, 'parq should be cascade-deleted with the class').toBe(0);
    const { rows: blockRows } = await pool.query('SELECT id FROM blocks WHERE class_id = $1', [createdClassId]);
    expect(blockRows.length, 'block should be cascade-deleted with the class').toBe(0);

    // afterEach cleanup skips if rows already deleted — safe to leave createdClassId/CustomerId set
  });

});
