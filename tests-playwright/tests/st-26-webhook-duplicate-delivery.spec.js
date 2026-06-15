// ST-26 — Duplicate webhook delivery is handled gracefully
//
// What this proves:
//   Stripe may deliver the same webhook event more than once (retries). The
//   first delivery processes normally (pending_bookings row deleted, booking
//   created). The second delivery for the SAME event finds no matching
//   pending_bookings row, takes the "already processed" early-return path,
//   and responds 200 { received: true } with no booking_id/warning — without
//   erroring or creating a duplicate booking.
//
// Approach:
//   A pending_bookings row is inserted. The same checkout.session.completed
//   event object is POSTed twice via postToStripeWebhook (each call computes
//   its own valid signature for the identical JSON body — fine, since
//   stripe-webhook has no replay-window/timestamp-freshness check). No real
//   Stripe contact either time.
//
// Side effects (non-fatal, by design):
//   The first delivery fires the real client confirmation + admin alert
//   emails (is_test='true' -> delivered@resend.dev), same as ST-19.
//
// Cleanup:
//   afterEach deletes the created booking + customer (cascades parq), and
//   defensively removes the pending row if it somehow survived.

const { test, expect } = require('@playwright/test');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const {
  insertPendingBooking,
  getPendingBookingById,
  deletePendingBookingById,
  deleteCustomerCascade,
  getBookingById,
  countBookingsForCustomerOnBlock
} = require('./helpers/admin-db');
const { buildCheckoutCompletedEvent, postToStripeWebhook } = require('./helpers/stripe-webhook');

const TEST_EMAIL = `st26-${Date.now()}@test.example`;

test.describe('ST-26 — Duplicate webhook delivery handled gracefully', () => {
  test.skip(!process.env.TEST_SUPABASE_URL || !process.env.TEST_STRIPE_WEBHOOK_SECRET, 'TEST_SUPABASE_URL / TEST_STRIPE_WEBHOOK_SECRET not set');

  let pendingId = null;
  let createdBookingId = null;
  let createdCustomerId = null;

  test.afterEach(async () => {
    if (createdCustomerId) {
      await deleteCustomerCascade(createdCustomerId); // cascades bookings + parq, resyncs blocks.booked
    }
    if (pendingId) {
      await deletePendingBookingById(pendingId); // defensive
    }
  });

  test('second delivery returns 200 with no booking_id, no duplicate booking created', async () => {
    const blk = await getBlockByRole('fri-upcoming');

    pendingId = await insertPendingBooking({
      classId: blk.class_id,
      blockId: blk.id,
      firstName: 'Webhook',
      lastName: 'Duplicate',
      email: TEST_EMAIL,
      phone: '07700900126',
      customerType: 'returning',
      amountPence: 6000
    });

    const event = buildCheckoutCompletedEvent({ pendingBookingId: String(pendingId) });

    // First delivery — processes normally
    const first = await postToStripeWebhook(event);
    expect(first.status).toBe(200);
    expect(first.json).not.toBeNull();
    expect(first.json.received).toBe(true);
    expect(first.json.booking_id).toBeTruthy();
    createdBookingId = first.json.booking_id;

    const pendingAfterFirst = await getPendingBookingById(pendingId);
    expect(pendingAfterFirst).toBeNull();
    pendingId = null;

    // Second delivery — same event, pending row already gone
    const second = await postToStripeWebhook(event);
    expect(second.status).toBe(200);
    expect(second.json).not.toBeNull();
    expect(second.json.received).toBe(true);
    expect(second.json.booking_id).toBeUndefined();
    expect(second.json.warning).toBeUndefined();

    // Exactly one booking exists — no duplicate created by the second delivery
    const booking = await getBookingById(createdBookingId);
    expect(booking).not.toBeNull();
    createdCustomerId = booking.customer_id;

    const bookingCount = await countBookingsForCustomerOnBlock(createdCustomerId, blk.id);
    expect(bookingCount).toBe(1);
  });
});
