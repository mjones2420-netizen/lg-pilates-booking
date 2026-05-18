// tests/ec-13-rpc-returns-already-booked.spec.js
//
// EC (Edge Cases) — EC-13: book_if_available RPC returns ALREADY_BOOKED on
// duplicate
//
// Excel scenario EC-13: "book_if_available RPC returns ALREADY_BOOKED on
// duplicate"
//   Given: A customer has an active booking on a block
//   When:  book_if_available is called with the same (customer, block) pair
//   Then:  - RPC raises an exception with message 'ALREADY_BOOKED'
//          - Front-end booking code shows "You already have a booking on
//            this block" toast (handled separately in EC-08)
//          - No new booking row inserted
//
// Mechanism:
//   book_if_available is a SECURITY DEFINER function. On INSERT it catches
//   any unique_violation from bookings_unique_active_per_block and
//   re-raises as RAISE EXCEPTION 'ALREADY_BOOKED'. This wraps the raw DB
//   unique-violation into a stable, predictable error message that the
//   front-end can string-match (index.html line 1533).
//
// Test approach:
//   Pure DB test via the shared anon RPC client (sb).
//   1. Pick a seeded (customer, block) pair with an active booking on
//      mon-current.
//   2. Call book_if_available with that pair via sb.rpc().
//   3. Assert data is null and error.message contains 'ALREADY_BOOKED'.
//   4. Verify no new row was created.
//
//   Note: this differs from EC-12 (which tests the raw unique-violation
//   from a direct INSERT) — EC-13 tests the RPC's wrapping behaviour. Both
//   are tripwires for separate code paths.
//
// Cleanup (afterEach):
//   None needed — RPC raises before any insert. Seeded data untouched.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { sb } = require('./helpers/supabase');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { getPool } = require('./helpers/admin-db');

const APP_URL = process.env.TEST_APP_URL;

test.describe('EC-13 — book_if_available RPC raises ALREADY_BOOKED for duplicate', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — EC specs require the app to be served.');

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test('RPC returns ALREADY_BOOKED for a customer/block pair with existing booking', async () => {
    const monCurrent = await getBlockByRole('mon-current');
    expect(monCurrent, 'mon-current should resolve from fixture').toBeTruthy();

    // Find an existing non-cancelled booking on mon-current.
    const { rows: existingRows } = await getPool().query(
      `SELECT customer_id, class_id, block_id
       FROM bookings
       WHERE block_id = $1 AND status != 'cancelled'
       LIMIT 1`,
      [monCurrent.id]
    );
    expect(existingRows.length, 'mon-current should have a seeded booking').toBe(1);
    const { customer_id, class_id, block_id } = existingRows[0];

    // Snapshot row count for this pair pre-call.
    const { rows: preCount } = await getPool().query(
      `SELECT COUNT(*)::int AS count FROM bookings
       WHERE customer_id = $1 AND block_id = $2`,
      [customer_id, block_id]
    );
    const preRowCount = preCount[0].count;

    // Call book_if_available via the anon RPC client.
    const { data, error } = await sb.rpc('book_if_available', {
      p_block_id:    block_id,
      p_class_id:    class_id,
      p_customer_id: customer_id,
      p_amount_due:  60
    });

    // Assert the RPC returns no data and the error message matches the
    // ALREADY_BOOKED signal the front-end keys on.
    expect(data).toBeNull();
    expect(error, 'duplicate call should have raised an exception').toBeTruthy();
    expect(error.message).toMatch(/ALREADY_BOOKED/);

    // Assert no new row created.
    const { rows: postCount } = await getPool().query(
      `SELECT COUNT(*)::int AS count FROM bookings
       WHERE customer_id = $1 AND block_id = $2`,
      [customer_id, block_id]
    );
    expect(postCount[0].count).toBe(preRowCount);
  });
});
