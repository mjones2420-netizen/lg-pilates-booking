// tests/dp-14-delete-customer-cleans-extras.spec.js
//
// DP (Data Protection) — DP-14: Clients → Data → "Delete customer completely"
// also removes the rows matched by email that the old delete left behind —
// waiting-list requests and EXPIRED card attempts (a live checkout is kept,
// it may be about to charge the card) — while KEEPING the
// cancellation record (financial history; Mark's decision 05 Oct 2026).
// The delete is logged.
//
// Fixture roles: mon-upcoming, wed-upcoming. Self-cleaning (incl. the kept cancellation).

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin, openClientsTab } = require('./helpers/admin-auth');
const { getPool, getCustomerById, getDataProtectionLog, insertPendingBooking } = require('./helpers/admin-db');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { createDpCustomer, cleanupDpCustomer } = require('./helpers/dp-fixtures');

const APP_URL = process.env.TEST_APP_URL;

test.describe('DP-14 — Full delete cleans up extras, keeps cancellations', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — DP specs require the app to be served.');

  let made = null;

  test.beforeEach(async ({ page }) => {
    made = null;
    await page.goto(APP_PATH);
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test.afterEach(async () => {
    if (!made) return;
    await getPool().query(`DELETE FROM cancellations WHERE lower(email) = lower($1)`, [made.email]);
    await getPool().query(`DELETE FROM waitlist_requests WHERE lower(email) = lower($1)`, [made.email]);
    await cleanupDpCustomer(made.customerId, made.email);
  });

  test('waiting-list requests and expired card attempts go; live checkout and cancellation stay', async ({ page }) => {
    const blk = await getBlockByRole('mon-upcoming');
    const wed = await getBlockByRole('wed-upcoming');
    made = await createDpCustomer({ tag: 'dp14', blocks: [blk], lastName: 'Dp14' });
    const pool = getPool();
    await pool.query(
      `INSERT INTO waitlist_requests (block_id, first_name, last_name, email, phone)
       VALUES ($1, 'Data', 'Dp14', $2, '07700900914')`, [wed.id, made.email]);
    const pendingRow = { classId: wed.class_id, blockId: wed.id, firstName: 'Data', lastName: 'Dp14', email: made.email,
      phone: '07700900914', customerType: 'returning', amountPence: 6000 };
    // One abandoned (expired) card attempt — deleted — and one live one,
    // which must be KEPT: it may be mid-Stripe-checkout.
    const expiredId = await insertPendingBooking(pendingRow);
    await pool.query(`UPDATE pending_bookings SET expires_at = now() - interval '1 hour' WHERE id = $1`, [expiredId]);
    const liveId = await insertPendingBooking(pendingRow);
    await pool.query(
      `INSERT INTO cancellations (customer_id, class_id, block_id, first_name, last_name, email)
       VALUES ($1, $2, $3, 'Data', 'Dp14', $4)`, [made.customerId, blk.class_id, blk.id, made.email]);

    await loginAsAdmin(page);
    await openClientsTab(page);
    await page.locator(`#cust-row-${made.customerId} .cust-data-btn`).click();
    page.once('dialog', (d) => d.accept());
    await page.locator(`#cust-data-${made.customerId}`).getByRole('button', { name: 'Delete customer completely' }).click();
    await expect(page.locator('#toastEl')).toContainText(/Client deleted/i, { timeout: 8000 });

    expect(await getCustomerById(made.customerId)).toBeFalsy();
    const count = async (sql) => Number((await pool.query(sql, [made.email])).rows[0].n);
    expect(await count(`SELECT count(*) n FROM waitlist_requests WHERE lower(email) = lower($1)`)).toBe(0);
    const pend = (await pool.query(`SELECT id FROM pending_bookings WHERE lower(email) = lower($1)`, [made.email])).rows.map((r) => r.id);
    expect(pend, 'expired attempt removed, live checkout kept').toEqual([liveId]);
    expect(pend).not.toContain(expiredId);
    expect(await count(`SELECT count(*) n FROM cancellations WHERE lower(email) = lower($1)`), 'cancellation must be kept').toBe(1);

    const log = await getDataProtectionLog(made.customerId);
    expect(log.map((r) => r.action)).toContain('admin_delete_customer');
  });
});
