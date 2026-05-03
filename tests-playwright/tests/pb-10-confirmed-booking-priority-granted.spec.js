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
// Self-cleaning: pre-flight test.skip() if returning-one is already booked
// on mon-upcoming (i.e. a previous PB-10 run left state behind).

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { APP_PATH } = require('./helpers/app-url');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const {
  fillStep1,
  agreeAndReserve
} = require('./helpers/booking-flow');

const APP_URL = process.env.TEST_APP_URL;
const PRIORITY_EMAIL = 'returning-one@test.example';

test.describe('PB-10 — Confirmed booking on previous block: priority granted', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — PB specs require the app to be served.');

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.getByText(/Monday|Wednesday|Friday/).first()).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test('eligible client enters email in gate and proceeds through to a completed priority booking', async ({ page }) => {
    const monUpcoming = await getBlockByRole('mon-upcoming');

    // Sanity: mon-upcoming must be in the priority window.
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const start = new Date(monUpcoming.start_date + 'T00:00:00');
    const daysUntil = Math.round((start - today) / (1000 * 60 * 60 * 24));
    expect(daysUntil, 'mon-upcoming must be 8-14 days out for the priority-window UI').toBeGreaterThan(7);
    expect(daysUntil).toBeLessThanOrEqual(14);

    // Pre-flight: skip cleanly if returning-one already has a booking on
    // mon-upcoming (e.g. left over from a prior PB-10 run that wasn't reseeded).
    const { data: customer } = await sb.rpc('lookup_customer', { p_email: PRIORITY_EMAIL });
    expect(customer && customer.length, `fixture: ${PRIORITY_EMAIL} must exist`).toBe(1);
    const customerId = customer[0].id;

    const { data: alreadyBooked } = await sb.rpc('has_active_booking_on_block', {
      p_customer_id: customerId,
      p_block_id:    monUpcoming.id
    });
    test.skip(
      alreadyBooked === true,
      `${PRIORITY_EMAIL} already has a booking on mon-upcoming — run \`npm run seed\` to reset.`
    );

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
