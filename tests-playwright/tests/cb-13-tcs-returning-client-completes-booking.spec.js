// CB-13: T&Cs — Returning client completes booking after agreeing
//
// Verifies the end-to-end happy path for a RETURNING client: they go
// straight from Step 1 to Step 3 (skipping the medical and emergency
// contact steps because their record already exists), tick the T&Cs,
// and click Reserve. The booking is saved and the success screen shown.
//
// DB verification approach (matches CB-01):
//   - We can't SELECT directly from `customers` or `bookings` as anon —
//     RLS blocks it. Instead we use the SECURITY DEFINER RPCs that are
//     explicitly granted to anon: lookup_customer and
//     has_active_booking_on_block. These are the same channels the live
//     app uses to read customer/booking state.
//   - We don't directly verify the booking row content; the success view
//     plus has_active_booking_on_block returning true after Reserve is
//     sufficient evidence that the row was created.
//
// Excel scenario: CB-13 — T&Cs — Returning client completes booking after agreeing.
//
// Test data:
//   - Customer: returning-two@test.example (already in fixture)
//   - Block:    fri-upcoming (this customer has no booking on it yet)
//
// Re-run note: after this test runs successfully, returning-two will have
// a booking on fri-upcoming. Re-running without reseeding will trip the
// already-booked detection. Run `npm run seed` between full runs.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { sb } = require('./helpers/supabase');
const { openBookingModal } = require('./helpers/booking-flow');

const RETURNING_EMAIL = 'returning-two@test.example';

test.describe('CB-13: T&Cs — Returning client completes booking after agreeing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on'), 'TEST MODE banner missing — refusing to run against production').toBeVisible();
  });

  test('Returning client books fri-upcoming after agreeing to T&Cs', async ({ page }) => {
    const friUpcoming = await getBlockByRole('fri-upcoming');
    expect(friUpcoming, 'fixture: fri-upcoming block must exist').toBeTruthy();

    // Look up the customer via the RPC the live app uses.
    const { data: customer, error: lookupErr } = await sb.rpc('lookup_customer', {
      p_email: RETURNING_EMAIL
    });
    expect(lookupErr, 'lookup_customer RPC must not error').toBeFalsy();
    expect(customer && customer.length, `fixture: ${RETURNING_EMAIL} must exist`).toBe(1);
    const customerId = customer[0].id;

    // Pre-flight: ensure this customer doesn't already have an active
    // booking on fri-upcoming. If they do, the fixture has drifted (or a
    // previous run didn't reseed) — fail fast with a clear hint.
    const { data: alreadyBookedBefore, error: hasBookedErr } = await sb.rpc(
      'has_active_booking_on_block',
      { p_customer_id: customerId, p_block_id: friUpcoming.id }
    );
    expect(hasBookedErr, 'has_active_booking_on_block RPC must not error').toBeFalsy();
    expect(
      alreadyBookedBefore,
      `${RETURNING_EMAIL} already has a booking on fri-upcoming — run \`npm run seed\` to reset`
    ).toBe(false);

    // ---- UI flow ----

    // Open booking modal for Friday's bookable block. This class has no
    // active block in the fixture — its only future block is fri-upcoming
    // which the card treats as "current" (see getActiveBlock fallback).
    await openBookingModal(page, 'Friday', 'current');

    // Step 1 — fill in the returning customer's email. The other fields
    // don't matter for the lookup; the app uses email to detect returning
    // customers.
    await page.locator('#b-firstname').fill('Returning');
    await page.locator('#b-lastname').fill('Two');
    await page.locator('#b-email').fill(RETURNING_EMAIL);
    await page.locator('#b-phone').fill('07700900222');
    await page.locator('#step-1 .step-btn').click();

    // Returning client → app skips Step 2 entirely and goes straight to
    // Step 3 after the lookup completes. goStep2() in index.html has a
    // 2.5s delay before the transition, so allow up to 8s for Step 3.
    await expect(page.locator('#step-3')).toBeVisible({ timeout: 8000 });

    // Verify Step 3 entry state
    await expect(page.locator('#tcs-agree')).not.toBeChecked();
    await expect(page.locator('#reserve-btn')).toBeDisabled();

    // Tick T&Cs and click Reserve
    await page.locator('#tcs-agree').check();
    await expect(page.locator('#reserve-btn')).toBeEnabled();
    await page.locator('#reserve-btn').click();

    // Success screen shown
    await expect(page.locator('#success-view.on')).toBeVisible({ timeout: 10000 });

    // ---- Post-booking DB verification ----

    // The booking should now exist. has_active_booking_on_block should
    // return true for this customer/block pair.
    const { data: alreadyBookedAfter, error: postErr } = await sb.rpc(
      'has_active_booking_on_block',
      { p_customer_id: customerId, p_block_id: friUpcoming.id }
    );
    expect(postErr, 'post-booking RPC must not error').toBeFalsy();
    expect(alreadyBookedAfter, 'booking should now exist for this customer/block').toBe(true);
  });
});
