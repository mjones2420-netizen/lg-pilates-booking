// ST-27 — Webhook rejects events with a stale (replayed) timestamp
//
// What this proves:
//   stripe-webhook's verifyStripeSignature() now enforces a 5-minute replay
//   tolerance (issue #52). An otherwise perfectly-signed event whose signed
//   timestamp is older than 300s must be rejected with 400, with no side
//   effects — the pending_bookings row is left untouched. A fresh timestamp
//   (default) on the same payload is still accepted, proving the tolerance
//   only rejects stale events, not valid ones.
//
// Approach:
//   Insert a pending_bookings row. Build a valid checkout.session.completed
//   payload and sign it with a timestamp 400s in the past (via the helper's
//   `timestamp` override). The HMAC is correct for that timestamp, so this
//   isolates the freshness check from the signature check. Expect 400 and an
//   untouched pending row. No real Stripe contact.
//
// Cleanup:
//   afterEach deletes the pending_bookings row.

const { test, expect } = require('@playwright/test');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const {
  insertPendingBooking,
  getPendingBookingById,
  deletePendingBookingById
} = require('./helpers/admin-db');
const { buildCheckoutCompletedEvent, postToStripeWebhook } = require('./helpers/stripe-webhook');

const TEST_EMAIL = `st27-${Date.now()}@test.example`;

test.describe('ST-27 — Stale webhook timestamps are rejected (replay protection)', () => {
  test.skip(!process.env.TEST_SUPABASE_URL || !process.env.TEST_STRIPE_WEBHOOK_SECRET, 'TEST_SUPABASE_URL / TEST_STRIPE_WEBHOOK_SECRET not set');

  let pendingId = null;

  test.beforeEach(async () => {
    const blk = await getBlockByRole('fri-upcoming');
    pendingId = await insertPendingBooking({
      classId: blk.class_id,
      blockId: blk.id,
      firstName: 'Webhook',
      lastName: 'StaleStamp',
      email: TEST_EMAIL,
      phone: '07700900127',
      customerType: 'returning',
      amountPence: 6000
    });
  });

  test.afterEach(async () => {
    if (pendingId) {
      await deletePendingBookingById(pendingId);
      pendingId = null;
    }
  });

  test('timestamp older than the 5-minute tolerance returns 400 and leaves pending row untouched', async () => {
    const before = await getPendingBookingById(pendingId);
    expect(before).not.toBeNull();

    const event = buildCheckoutCompletedEvent({ pendingBookingId: String(pendingId) });
    // Correctly signed for a timestamp 400s in the past — signature is valid,
    // only the freshness check should reject it.
    const staleTimestamp = Math.floor(Date.now() / 1000) - 400;
    const { status, json } = await postToStripeWebhook(event, { timestamp: staleTimestamp });

    expect(status).toBe(400);
    expect(json).not.toBeNull();
    expect(json.error).toBeTruthy();

    const after = await getPendingBookingById(pendingId);
    expect(after).not.toBeNull();
    expect(after.email).toBe(before.email);
    expect(Number(after.amount_pence)).toBe(Number(before.amount_pence));
  });

  test('fresh timestamp on the same payload is accepted (proves only stale events are rejected)', async () => {
    const event = buildCheckoutCompletedEvent({ pendingBookingId: String(pendingId) });
    // Default timestamp = now → within tolerance → processed normally.
    const { status, json } = await postToStripeWebhook(event);

    expect(status).toBe(200);
    expect(json).not.toBeNull();
    expect(json.received).toBe(true);
    expect(json.booking_id).toBeTruthy();

    // The booking was placed, so the pending row was consumed. Clean up via the
    // created customer cascade instead; mark pendingId null so afterEach skips.
    const { getBookingById, deleteCustomerCascade } = require('./helpers/admin-db');
    const booking = await getBookingById(json.booking_id);
    expect(booking).not.toBeNull();
    await deleteCustomerCascade(booking.customer_id);
    pendingId = null;
  });
});
