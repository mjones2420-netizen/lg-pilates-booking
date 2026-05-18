// tests/ec-10-capacity-bar-resets-after-bulk-delete.spec.js
//
// EC (Edge Cases) — EC-10: Capacity bar resets when bookings are bulk-deleted via SQL
//
// Excel scenario EC-10: "Capacity bar resets when bookings are bulk-deleted via SQL"
//   Given: A block has some bookings (booked > 0)
//   When:  All bookings are deleted via raw SQL (DELETE FROM bookings...)
//   Then:  - Capacity bar does NOT automatically reset — this is expected behaviour
//          - booked count must be manually resynced via the resync SQL
//          - After running resync SQL and reloading, capacity bar reflects actual bookings
//
// Mechanism:
//   trg_sync_block_booked_count fires AFTER INSERT/DELETE on bookings, but
//   only at the app/SQL level. The trigger DOES fire on raw DELETE, but the
//   Excel scenario predates a schema change — historically bulk DELETEs
//   could bypass it. The current scenario verifies the workflow Mark uses:
//   bulk delete + manual resync via the canonical resync SQL.
//
//   In the live test suite, the trigger DOES fire on raw DELETE in pg, so
//   booked drops to 0 automatically. The test still asserts the workflow:
//   the resync SQL produces the correct booked count (0) and the UI
//   capacity bar reflects "0 of cap spots taken" after a page reload.
//
// Test approach:
//   1. Pre-condition: ensure mon-current has at least 1 booking. mon-current
//      is the seeded fixture block with returning-one and returning-two
//      confirmed bookings (2 bookings minimum). Verify via direct pg.
//   2. Snapshot the cap-txt element on the page BEFORE any changes —
//      expect "N of cap spots taken" where N > 0.
//   3. Save a snapshot of the existing bookings so we can restore them in
//      afterEach (preserves fixture integrity for other specs).
//   4. Run the bulk-delete SQL from the Excel scenario, scoped to mon-current
//      to avoid wiping unrelated fixture data.
//   5. Run the resync SQL from the Excel scenario.
//   6. Reload the page. Assert cap-txt now shows "0 of cap spots taken".
//   7. Direct-pg verify blocks.booked = 0 and no bookings remain on the block.
//
// Cleanup (afterEach):
//   Re-insert the bookings that were deleted in step 4, then resync. This
//   restores mon-current to its seeded state.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { getPool, resyncBlockBookedCount } = require('./helpers/admin-db');

const APP_URL = process.env.TEST_APP_URL;

test.describe('EC-10 — Capacity bar resets when bookings bulk-deleted via SQL', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — EC specs require the app to be served.');

  let blockId = null;
  let savedBookings = []; // [{ class_id, block_id, customer_id, status, amount_due }, ...]

  test.beforeEach(async ({ page }) => {
    blockId = null;
    savedBookings = [];
    await page.goto(APP_PATH);
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test.afterEach(async () => {
    // Restore the deleted bookings to keep the fixture intact for other specs.
    if (blockId != null && savedBookings.length > 0) {
      for (const b of savedBookings) {
        await getPool().query(
          `INSERT INTO bookings (class_id, block_id, customer_id, status, amount_due)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT DO NOTHING`,
          [b.class_id, b.block_id, b.customer_id, b.status, b.amount_due]
        );
      }
      await resyncBlockBookedCount(blockId);
    }
  });

  test('bulk-delete then resync brings cap-txt to "0 of cap spots taken"', async ({ page }) => {
    const monCurrent = await getBlockByRole('mon-current');
    expect(monCurrent, 'mon-current should resolve from fixture').toBeTruthy();
    blockId = monCurrent.id;

    // Pre-condition: mon-current has at least 1 booking (returning-one + returning-two seeded).
    const { rows: preBookings } = await getPool().query(
      `SELECT class_id, block_id, customer_id, status, amount_due
       FROM bookings
       WHERE block_id = $1 AND status != 'cancelled'`,
      [blockId]
    );
    expect(preBookings.length, 'mon-current should have seeded bookings').toBeGreaterThan(0);
    savedBookings = preBookings;

    // Pre-condition: capacity bar shows N of cap where N > 0.
    const card = page.locator('.card').filter({
      has: page.locator('.card-when-day', { hasText: 'Monday' })
    }).first();
    await expect(card).toBeVisible();
    const preTxt = await card.locator('.cap-txt').first().textContent();
    expect(preTxt).toMatch(new RegExp(`\\d+ of ${monCurrent.cap} spots taken`));
    const preMatch = preTxt.match(/^(\d+) of /);
    expect(Number(preMatch[1]), 'booked count should be > 0 before delete').toBeGreaterThan(0);

    // Step 1 — bulk-delete all bookings on this block via raw SQL.
    // (Excel scenario uses DELETE FROM bookings with no WHERE — we scope
    // to a single block to avoid wiping unrelated fixture data.)
    await getPool().query(
      `DELETE FROM bookings WHERE block_id = $1`,
      [blockId]
    );

    // Step 2 — run the resync SQL from the Excel scenario (scoped to one block).
    await getPool().query(
      `UPDATE blocks b
       SET booked = (
         SELECT COUNT(*) FROM bookings
         WHERE block_id = b.id AND status != 'cancelled'
       )
       WHERE id = $1`,
      [blockId]
    );

    // Step 3 — verify DB state: booked = 0, no bookings remain.
    const { rows: postBookings } = await getPool().query(
      `SELECT COUNT(*)::int AS count FROM bookings WHERE block_id = $1`,
      [blockId]
    );
    expect(postBookings[0].count).toBe(0);

    const { rows: postBlock } = await getPool().query(
      `SELECT booked, cap FROM blocks WHERE id = $1`,
      [blockId]
    );
    expect(postBlock[0].booked).toBe(0);

    // Step 4 — reload the page and assert cap-txt now shows "0 of cap spots taken".
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });

    const cardAfter = page.locator('.card').filter({
      has: page.locator('.card-when-day', { hasText: 'Monday' })
    }).first();
    await expect(cardAfter).toBeVisible();
    await expect(cardAfter.locator('.cap-txt').first())
      .toHaveText(`0 of ${monCurrent.cap} spots taken`);
  });
});
