// tests/pb-10-confirmed-booking-priority-granted.spec.js
//
// PB (Priority Booking) — PB-10: Confirmed booking DOES grant priority access.
//
// Excel scenario PB-10: "Confirmed booking DOES grant priority access"
//   Given: A client has a Confirmed booking on the previous block of a class
//   When:  The next block is in the priority window (8-14 days away)
//          and the client enters their email in the priority gate
//   Then:  - Priority access is GRANTED
//          - "Priority confirmed! Opening booking form..." message shown
//          - The booking modal opens with the email pre-filled
//          - The client can complete the booking through the priority window
//
// This is the positive-path companion to PB-09 — together they prove the
// confirmed-vs-reserved distinction in check_priority_access. PB-10 also
// covers PB-03 (Priority granted — eligible client), since the assertion
// is structurally identical.
//
// Fixture role used: mon-upcoming
//   The check_priority_access RPC selects mon-current as the "previous block"
//   for mon-upcoming (most-recent end_date < mon-upcoming.start_date).
//   returning-one@test.example is confirmed on mon-current (seeded by
//   migration 09 / the same booking CB-31 relies on). They are NOT booked
//   on mon-upcoming, so the priority flow can run cleanly to completion.
//
// Customer choice rationale: returning-one is the only seeded customer
// confirmed on mon-current (the actual previous block per the RPC's logic).
// returning-two is confirmed on mon-past, but mon-past is NOT the previous
// block per the RPC because mon-current's end_date is later. So
// returning-two is denied for mon-upcoming and cannot be used here.
//
// Collision check:
//   - smoke-02 uses returning-one for the wed-upcoming manual-priority test —
//     not affected by adding a booking on mon-upcoming.
//   - CB-31 uses returning-one as already-booked on mon-current — also
//     unaffected.
//   - No other PB spec in this batch uses returning-one + mon-upcoming.
//
// Self-cleaning (Session 19, Batch 6): afterEach calls
// deleteBookingsForCustomerOnBlock to remove the booking this test creates
// on mon-upcoming. Migrated from entry-side pre-flight check to exit-side
// cleanup for consistency with the rest of the Batch 6 rollout.

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { APP_PATH } = require('./helpers/app-url');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const {
  fillStep1,
  agreeAndReserve
} = require('./helpers/booking-flow');
const { deleteBookingsForCustomerOnBlock } = require('./helpers/admin-db');

const APP_URL = process.env.TEST_APP_URL;
const PRIORITY_EMAIL = 'returning-one@test.example';

test.describe('PB-10 — Confirmed booking on previous block: priority granted', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — PB specs require the app to be served.');

  // Self-cleaning: returning-one is a fixture customer (must persist) but
  // the booking on mon-upcoming created by this test is junk. afterEach
  // deletes just the booking via deleteBookingsForCustomerOnBlock.
  let createdBooking = null;

  test.beforeEach(async ({ page }) => {
    createdBooking = null;
    await page.goto(APP_PATH);
    await expect(page.getByText(/Monday|Wednesday|Friday/).first()).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test.afterEach(async () => {
    if (createdBooking) {
      await deleteBookingsForCustomerOnBlock(createdBooking.customerId, createdBooking.blockId);
    }
  });

  test('eligible client enters email in gate and proceeds through to a completed priority booking', async ({ page }) => {
    const monUpcoming = await getBlockByRole('mon-upcoming');

    // Sanity: mon-upcoming must be in the priority window.
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const start = new Date(monUpcoming.start_date + 'T00:00:00');
    const daysUntil = Math.round((start - today) / (1000 * 60 * 60 * 24));
    expect(daysUntil, 'mon-upcoming must be 8-14 days out for the priority-window UI').toBeGreaterThan(7);
    expect(daysUntil).toBeLessThanOrEqual(14);

    // Look up the fixture customer.
    const { data: customer } = await sb.rpc('lookup_customer', { p_email: PRIORITY_EMAIL });
    expect(customer && customer.length, `fixture: ${PRIORITY_EMAIL} must exist`).toBe(1);
    const customerId = customer[0].id;

    // Set tracking BEFORE the UI flow runs so afterEach cleans up even if
    // assertions fail.
    createdBooking = { customerId, blockId: monUpcoming.id };

    // Open the Monday card's next-block toggle.
    const card = page.locator('.card').filter({
      has: page.locator('.card-when-day', { hasText: 'Monday' })
    }).first();
    await card.locator('.next-blk-toggle').click();
    const nextPanel = card.locator('.next-blk-body');
    await expect(nextPanel).toBeVisible();

    // Enter eligible email and click Check My Priority.
    await nextPanel.locator(`#pemail-${monUpcoming.id}`).fill(PRIORITY_EMAIL);
    await nextPanel.locator('button.book-btn', { hasText: 'Check My Priority' }).click();

    // The "Priority confirmed!" message renders before the modal opens.
    const grantMsg = nextPanel.locator(`#pmsg-${monUpcoming.id}`);
    await expect(grantMsg).toBeVisible({ timeout: 5000 });
    await expect(grantMsg).toContainText(/Priority confirmed/i);

    // After the 1.2s setTimeout, the booking modal opens with email pre-filled.
    await expect(page.locator('#overlay.on')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#step-1')).toBeVisible();
    await expect(page.locator('#b-email')).toHaveValue(PRIORITY_EMAIL);

    // Complete Step 1 — returning-one is recognised so flow goes Step 1 → Step 3.
    await fillStep1(page, {
      firstName: 'Returning',
      lastName:  'One',
      email:     PRIORITY_EMAIL,
      phone:     '07700900100'
    });

    // Welcome-back flow: 2.5s delay, then Step 3 visible.
    await expect(page.locator('#step-3')).toBeVisible({ timeout: 8000 });

    // Negative check — already-booked view must NOT appear.
    await expect(page.locator('#already-booked-view')).not.toBeVisible();

    // Complete the booking: agree to T&Cs and reserve.
    await agreeAndReserve(page);
    await expect(page.locator('#success-view.on')).toBeVisible({ timeout: 5000 });

    // Post-booking DB verification — the booking row exists on mon-upcoming.
    const { data: hasBookingNow } = await sb.rpc('has_active_booking_on_block', {
      p_customer_id: customerId,
      p_block_id:    monUpcoming.id
    });
    expect(hasBookingNow, 'booking should now exist for returning-one on mon-upcoming').toBe(true);
  });
});
