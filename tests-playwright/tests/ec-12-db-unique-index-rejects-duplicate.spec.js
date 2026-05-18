// tests/ec-12-db-unique-index-rejects-duplicate.spec.js
//
// EC (Edge Cases) — EC-12: DB-level duplicate booking protection — direct
// SQL insert rejected
//
// Excel scenario EC-12: "DB-level duplicate booking protection — direct SQL
// insert rejected"
//   Given: A customer has an active booking on a block
//   When:  A direct SQL INSERT attempts to create a second booking for the
//          same (customer_id, block_id) where status != 'cancelled'
//   Then:  - INSERT fails with unique-violation on
//            "bookings_unique_active_per_block"
//          - Error includes DETAIL showing the specific (customer_id, block_id)
//          - No row inserted
//
// Mechanism:
//   The partial unique index bookings_unique_active_per_block enforces
//   uniqueness of (customer_id, block_id) WHERE status != 'cancelled'.
//   Postgres rejects any INSERT that would create a second non-cancelled
//   row for the same pair with SQLSTATE 23505 (unique_violation).
//
// Test approach:
//   This is a pure DB test — no UI involved.
//   1. Pick a known seeded (customer, block) pair: returning-one on
//      mon-current (seeded by migration 09).
//   2. Verify the pair already has a non-cancelled booking.
//   3. Attempt a direct INSERT of a duplicate booking via direct pg.
//   4. Assert the error code is '23505' and the constraint name is
//      'bookings_unique_active_per_block'.
//   5. Assert no new row was actually inserted.
//
// Cleanup (afterEach):
//   None needed — the INSERT is rejected, so no state is created. The
//   pre-existing seeded booking is untouched.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { getPool } = require('./helpers/admin-db');

const APP_URL = process.env.TEST_APP_URL;

test.describe('EC-12 — DB-level duplicate booking protection: unique index rejects insert', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — EC specs require the app to be served.');

  test.beforeEach(async ({ page }) => {
    // Even pure-DB specs assert the TEST MODE banner to guarantee env switch
    // is active (defence-in-depth against accidental prod connection).
    await page.goto(APP_PATH);
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test('direct INSERT of duplicate (customer, block) fails with unique-violation', async () => {
    const monCurrent = await getBlockByRole('mon-current');
    expect(monCurrent, 'mon-current should resolve from fixture').toBeTruthy();

    // Find a known seeded (customer, block) pair with an existing
    // non-cancelled booking on mon-current.
    const { rows: existingRows } = await getPool().query(
      `SELECT customer_id, class_id, block_id
       FROM bookings
       WHERE block_id = $1 AND status != 'cancelled'
       LIMIT 1`,
      [monCurrent.id]
    );
    expect(existingRows.length, 'mon-current should have a seeded booking').toBe(1);
    const { customer_id, class_id, block_id } = existingRows[0];

    // Snapshot pre-INSERT row count for this pair.
    const { rows: preCount } = await getPool().query(
      `SELECT COUNT(*)::int AS count FROM bookings
       WHERE customer_id = $1 AND block_id = $2`,
      [customer_id, block_id]
    );
    const preRowCount = preCount[0].count;
    expect(preRowCount).toBeGreaterThan(0);

    // Attempt duplicate INSERT — should fail.
    let caught = null;
    try {
      await getPool().query(
        `INSERT INTO bookings (class_id, block_id, customer_id, status, amount_due)
         VALUES ($1, $2, $3, 'reserved', 60)`,
        [class_id, block_id, customer_id]
      );
    } catch (err) {
      caught = err;
    }

    // Assert: error fires, code is unique-violation, constraint name matches.
    expect(caught, 'duplicate INSERT should have raised an error').toBeTruthy();
    expect(caught.code, 'SQLSTATE should be 23505 (unique_violation)').toBe('23505');
    expect(caught.constraint, 'violated constraint should be the partial unique index')
      .toBe('bookings_unique_active_per_block');

    // Assert: no new row was inserted.
    const { rows: postCount } = await getPool().query(
      `SELECT COUNT(*)::int AS count FROM bookings
       WHERE customer_id = $1 AND block_id = $2`,
      [customer_id, block_id]
    );
    expect(postCount[0].count, 'row count should not have changed').toBe(preRowCount);
  });
});
