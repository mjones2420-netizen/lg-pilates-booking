// tests/ec-07-overbooking-race-condition.spec.js
//
// EC (Edge Cases) — EC-07: Overbooking prevented when a class fills up
// between the user opening the booking modal and clicking Reserve.
//
// Excel scenario EC-07: "Overbooking prevented — class fills during booking"
//   Given: A block has one spot remaining (booked = cap - 1)
//   When:  User A opens the booking modal and advances to Step 3
//          User B completes a booking in a separate session, filling the block
//          User A clicks Reserve
//   Then:  - User A's Reserve fails with "this class just became full" toast
//          - Modal closes
//          - No booking row created for User A
//          - Block booked count does not exceed cap
//
// Mechanism (back-end):
//   book_if_available() (SECURITY DEFINER RPC) does:
//     SELECT booked, cap FROM blocks WHERE id = $1 FOR UPDATE;
//     IF v_booked >= v_cap THEN RAISE EXCEPTION 'CLASS_FULL';
//   The FOR UPDATE row lock serialises concurrent attempts at the DB level,
//   so this race is genuinely safe — the test simulates the second user by
//   inserting a real booking row via direct pg between modal-open and Reserve.
//
// Front-end response (index.html line 1525):
//   If the RPC returns an error message containing "CLASS_FULL", the page
//   shows the toast "Sorry — this class just became full. Please try
//   another block." then calls closeModal() and renderGrid().
//
// Target block: fri-upcoming (single block on Friday, displayed as the
// current block via getActiveBlock, no priority gate to navigate).
//
// IMPORTANT — trigger interaction:
//   trg_sync_block_booked_count fires AFTER INSERT/DELETE on bookings and
//   recalculates blocks.booked from the real booking count. This means
//   setBlockBookedCount (which directly updates blocks.booked) gets
//   OVERWRITTEN as soon as a real booking row is inserted. So the test
//   must fill the block with REAL booking rows, not a faked booked count.
//
// Test simulation:
//   1. Create cap-1 ephemeral test customers and a booking row for each
//      directly via pg. Trigger keeps blocks.booked in sync as we go.
//   2. Open the booking modal as a NEW client (cap+1th customer), advance
//      to Step 3.
//   3. Before clicking Reserve, insert ONE more booking via direct pg
//      using yet another ephemeral test customer. Trigger bumps booked
//      to cap.
//   4. Click Reserve. RPC sees booked >= cap and raises CLASS_FULL.
//   5. Assert toast, modal close, no booking row for the test customer,
//      and final booked count exactly equals cap.
//
// Cleanup (afterEach):
//   Delete all ephemeral test customers created during the test —
//   deleteCustomerCascade removes their bookings first, then the
//   customer rows, and resyncs blocks.booked at the end. The fri-upcoming
//   block returns to its seeded state (booked = 0).

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { sb } = require('./helpers/supabase');
const {
  openBookingModal,
  fillStep1,
  fillStep2Medical,
  fillStep2Emergency
} = require('./helpers/booking-flow');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const {
  getPool,
  deleteCustomerCascade
} = require('./helpers/admin-db');

const APP_URL = process.env.TEST_APP_URL;

/** Insert an ephemeral customer + booking on the given block. Returns the customer ID. */
async function seedFillerBooking(classId, blockId, idx) {
  const pool = getPool();
  const email = `ec07-filler-${Date.now()}-${idx}@test.example`;
  const { rows: custRows } = await pool.query(
    `INSERT INTO customers (first_name, last_name, email, phone, customer_type)
     VALUES ($1, $2, $3, $4, 'new')
     RETURNING id`,
    [`Filler${idx}`, 'Test', email, '07700900000']
  );
  const customerId = custRows[0].id;
  await pool.query(
    `INSERT INTO bookings (class_id, block_id, customer_id, status, amount_due)
     VALUES ($1, $2, $3, 'reserved', $4)`,
    [classId, blockId, customerId, 60]
  );
  return customerId;
}

test.describe('EC-07 — Overbooking prevented when class fills during booking', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — EC specs require the app to be served.');

  let targetBlockId         = null;
  let testCustomerId        = null;   // the new user attempting to book via UI
  let fillerCustomerIds     = [];     // ephemeral customers that take the cap-1 + 1 slots

  test.beforeEach(async ({ page }) => {
    targetBlockId       = null;
    testCustomerId      = null;
    fillerCustomerIds   = [];

    await page.goto(APP_PATH);
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test.afterEach(async () => {
    // Delete all ephemeral filler customers — cascades bookings + parq,
    // and the helper resyncs blocks.booked at the end.
    for (const cid of fillerCustomerIds) {
      await deleteCustomerCascade(cid);
    }
    // Delete the test customer too if one was created by the upsert step.
    if (testCustomerId != null) {
      await deleteCustomerCascade(testCustomerId);
    }
  });

  test('Reserve click after block fills during booking shows CLASS_FULL toast and creates no booking', async ({ page }) => {
    const friUpcoming = await getBlockByRole('fri-upcoming');
    expect(friUpcoming, 'fri-upcoming should resolve from fixture').toBeTruthy();
    targetBlockId = friUpcoming.id;

    // Step 1 — fill the block to (cap - 1) with real bookings via direct pg.
    // The trigger keeps blocks.booked in sync after each insert.
    for (let i = 0; i < friUpcoming.cap - 1; i++) {
      const cid = await seedFillerBooking(friUpcoming.class_id, targetBlockId, i);
      fillerCustomerIds.push(cid);
    }

    // Verify pre-condition: booked = cap - 1.
    const { rows: preRows } = await getPool().query(
      `SELECT booked, cap FROM blocks WHERE id = $1`,
      [targetBlockId]
    );
    expect(preRows[0].booked).toBe(friUpcoming.cap - 1);

    // Reload so the page picks up the new booked count.
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });

    // Sanity: the book button should still be enabled (not Full yet).
    const card = page.locator('.card').filter({
      has: page.locator('.card-when-day', { hasText: 'Friday' })
    }).first();
    await expect(card.locator('button.book-btn').first()).toBeEnabled();

    // Step 2 — open modal as a new client, advance to Step 3.
    const testEmail = `ec07-${Date.now()}@test.example`;
    await openBookingModal(page, 'Friday', 'current');
    await fillStep1(page, {
      firstName: 'Race',
      lastName:  'Loser',
      email:     testEmail,
      phone:     '07700900007'
    });
    await fillStep2Medical(page, { age: 34, printName: 'Race Loser' });
    await fillStep2Emergency(page);

    // We should now be on Step 3 (Payment).
    await expect(page.locator('#step-3')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#reserve-btn')).toBeVisible();

    // Step 3 — simulate the OTHER user filling the last spot. Insert one
    // more real booking via direct pg. Trigger bumps booked to cap.
    const lastFillerId = await seedFillerBooking(
      friUpcoming.class_id, targetBlockId, 999
    );
    fillerCustomerIds.push(lastFillerId);

    // Verify the block is now full at the DB level.
    const { rows: blkRows } = await getPool().query(
      `SELECT booked, cap FROM blocks WHERE id = $1`,
      [targetBlockId]
    );
    expect(blkRows[0].booked).toBe(blkRows[0].cap);

    // Step 4 — tick T&Cs and click Reserve. Front-end will call book_if_available,
    // which sees booked >= cap and raises CLASS_FULL.
    await page.locator('#tcs-agree').check();
    await page.locator('#reserve-btn').click();

    // The toast should appear with the CLASS_FULL message.
    const toast = page.locator('#toastEl.on');
    await expect(toast).toBeVisible({ timeout: 5000 });
    await expect(toast).toContainText(/this class just became full/i);

    // Modal should close.
    await expect(page.locator('#overlay.on')).toBeHidden({ timeout: 5000 });

    // Look up the test customer (upsert_customer ran BEFORE book_if_available,
    // so the customer row was created — afterEach will clean it up).
    const { data: testCust } = await sb.rpc('lookup_customer', { p_email: testEmail });
    if (testCust && testCust.length > 0) {
      testCustomerId = testCust[0].id;
      // Verify NO booking row was created for this customer on fri-upcoming.
      const { rows: testBookings } = await getPool().query(
        `SELECT id FROM bookings WHERE customer_id = $1 AND block_id = $2`,
        [testCustomerId, targetBlockId]
      );
      expect(testBookings.length, 'no booking should have been created for the test customer').toBe(0);
    }

    // Final assertion: booked count is still exactly cap (never exceeded it).
    const { rows: finalRows } = await getPool().query(
      `SELECT booked, cap FROM blocks WHERE id = $1`,
      [targetBlockId]
    );
    expect(finalRows[0].booked).toBe(finalRows[0].cap);
  });
});
