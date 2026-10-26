// RP-02 — Reports opened before the bookings have loaded waits for them (#112)
// The Reports page works out its figures from the dashboard's bookings list.
// Before #112, opening Reports before that load finished drew from an empty
// list, leaving Revenue MTD stuck at £0 until the page was opened again — the
// cause of RP-01's CI flakes. This holds the bookings request back, opens
// Reports while it is held (Reports must not draw yet), then lets it through and
// asserts the figures appear by themselves. Self-cleaning: builds its own
// hidden class + block (shared fixture blocks are never touched) and deletes
// them, the customer and the booking in afterEach.

const { test, expect } = require('@playwright/test');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { APP_PATH } = require('./helpers/app-url');
const { getPool, deleteCustomerCascade } = require('./helpers/admin-db');
const { holdRequest } = require('./helpers/hold-request');

test.describe('RP-02 — Reports opened before data loads', () => {
  let classId = null;
  let customerId = null;

  test.beforeEach(() => { classId = null; customerId = null; });

  test.afterEach(async () => {
    const pool = getPool();
    if (customerId) await deleteCustomerCascade(customerId);
    if (classId != null) {
      await pool.query('DELETE FROM bookings WHERE class_id = $1', [classId]);
      await pool.query('DELETE FROM blocks WHERE class_id = $1', [classId]);
      await pool.query('DELETE FROM classes WHERE id = $1', [classId]);
    }
  });

  test('RP-02 — Revenue MTD appears once the bookings arrive, without reopening Reports', async ({ page }) => {
    test.skip(!process.env.TEST_APP_URL, 'TEST_APP_URL not set');

    // Own hidden class + block, one £60 confirmed booking made today.
    const pool = getPool();
    const cls = await pool.query(
      `INSERT INTO classes (name, level, day, time, end_time, venue, loc)
       VALUES ('RP02 Reports Class', 'Mixed', 'Sunday', '5:00am', '6:00am', 'RP02 Venue', 'Baildon')
       RETURNING id`
    );
    classId = cls.rows[0].id;
    const blk = await pool.query(
      `INSERT INTO blocks (class_id, start_date, end_date, weeks, dates, price, cap, booked, wait, visible, status)
       VALUES ($1, (CURRENT_DATE + INTERVAL '7 days')::date, (CURRENT_DATE + INTERVAL '42 days')::date, 6,
               ARRAY['a','b','c','d','e','f'], 60, 12, 1, 0, false, 'upcoming')
       RETURNING id`,
      [classId]
    );
    const cust = await pool.query(
      `INSERT INTO customers (first_name, last_name, email, phone, customer_type)
       VALUES ('Rp02', 'Early', $1, '07700900502', 'returning')
       RETURNING id`,
      [`rp02-${Date.now()}@test.example`]
    );
    customerId = cust.rows[0].id;
    await pool.query(
      `INSERT INTO bookings (class_id, block_id, customer_id, status, amount_due)
       VALUES ($1, $2, $3, 'confirmed', 60)`,
      [classId, blk.rows[0].id, customerId]
    );

    // Hold the dashboard's bookings load (and only that query) until we say so.
    const releaseBookings = await holdRequest(page, 'bookings', 'id,status,amount_due');

    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });
    await loginAsAdmin(page);

    await page.locator('#dbnav-reports').click();
    await expect(page.locator('#dbnav-reports.on')).toBeVisible();

    // Opened while the bookings are held: Reports must wait, not draw from an
    // empty list. Its month label is blank in the page markup until it draws.
    const monthLabel = page.locator('#rpt-revenue-month');
    await page.waitForTimeout(500); // room for an early draw to happen, if it would
    await expect(monthLabel).toHaveText('');

    releaseBookings();

    // Once the bookings land, Reports draws, still open. The seeded £60
    // confirmed booking alone puts Revenue MTD at £60 or more.
    const revLocator = page.locator('#rpt-revenue-mtd');
    await expect(monthLabel).not.toHaveText('');
    await expect(page.locator('#rpt-active-bookings')).not.toHaveText('0');
    await expect(revLocator).toHaveText(/£[1-9]/);
    const revValue = Number((await revLocator.textContent()).replace(/[^0-9.]/g, ''));
    expect(revValue).toBeGreaterThanOrEqual(60);
    await expect(page.locator('#dbnav-reports.on')).toBeVisible();
  });
});
