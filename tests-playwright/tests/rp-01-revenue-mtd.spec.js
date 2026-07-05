// RP-01 — Reports "Revenue MTD" counts this month's bookings (#50 regression)
// Before #50, renderDashboard never SELECTed bookings.created_at, so every booking
// looked date-less and none counted towards the month total — Revenue MTD was always
// £0. This seeds one confirmed booking with a known amount_due (created_at defaults to
// now(), i.e. this month), opens the Reports page, and asserts the Revenue MTD figure
// is greater than £0. Self-cleaning: the seeded customer + booking cascade away in
// afterEach.

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { APP_PATH } = require('./helpers/app-url');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { getPool, setBookingStatus, deleteCustomerCascade } = require('./helpers/admin-db');

test.describe('RP-01 — Reports Revenue MTD', () => {
  let createdCustomerId = null;

  test.beforeEach(() => { createdCustomerId = null; });

  test.afterEach(async () => {
    if (createdCustomerId) await deleteCustomerCascade(createdCustomerId);
  });

  test('RP-01 — a confirmed booking this month makes Revenue MTD greater than £0', async ({ page }) => {
    test.skip(!process.env.TEST_APP_URL, 'TEST_APP_URL not set');

    const block = await getBlockByRole('fri-upcoming');

    const { data: custId, error: custErr } = await sb.rpc('upsert_customer', {
      p_first_name: 'Rp01',
      p_last_name:  'Revenue',
      p_email:      `rp01-${Date.now()}@test.example`,
      p_phone:      '07700900501',
      p_customer_type: 'returning'
    });
    expect(custErr, 'upsert_customer should not error').toBeNull();
    createdCustomerId = custId;

    const { data: bookingId, error: bookErr } = await sb.rpc('book_if_available', {
      p_block_id:    block.id,
      p_class_id:    block.class_id,
      p_customer_id: createdCustomerId,
      p_amount_due:  60
    });
    expect(bookErr, 'book_if_available should not error').toBeNull();
    expect(bookingId).toBeTruthy();

    // Stage a known non-zero paid amount and confirm the booking (created_at = now()).
    await getPool().query('UPDATE bookings SET amount_due = 60 WHERE id = $1', [bookingId]);
    await setBookingStatus(bookingId, 'confirmed');

    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });
    await loginAsAdmin(page);

    await page.locator('#dbnav-reports').click();
    await expect(page.locator('#dbnav-reports.on')).toBeVisible();

    // Revenue MTD should now reflect this month's bookings, not the old constant £0.
    const revText = (await page.locator('#rpt-revenue-mtd').textContent()).trim();
    const revValue = Number(revText.replace(/[^0-9.]/g, ''));
    expect(revText).not.toBe('£0');
    expect(revValue).toBeGreaterThan(0);
  });
});
