// ST-24 — Webhook failure path: ALREADY_BOOKED after payment
//
// What this proves:
//   If a customer already has a non-cancelled booking on a block (e.g. they
//   booked via bank transfer, then separately paid via Stripe for the same
//   class — a race condition), book_if_available fails with ALREADY_BOOKED
//   (the bookings_unique_active_per_block partial unique index). The webhook
//   must NOT delete the pending_bookings row, must NOT touch the existing
//   booking, and returns { received: true, warning: "booking_failed_after_payment" }
//   — same response shape as ST-23's CLASS_FULL case; the difference is only
//   in the (unasserted) admin alert email's wording.
//
// Approach:
//   A customer is created with an existing 'reserved' booking on fri-upcoming
//   (via upsert_customer + book_if_available, same as fixture setup elsewhere).
//   A pending_bookings row is then inserted for the SAME email/block,
//   simulating a Stripe payment for a class they already have a booking on.
//   A signed checkout.session.completed event is POSTed directly to
//   stripe-webhook (no real Stripe contact).
//
// Cleanup:
//   afterEach deletes the pending row and the customer (cascades the existing
//   booking + resyncs blocks.booked).

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const {
  insertPendingBooking,
  getPendingBookingById,
  deletePendingBookingById,
  countBookingsForCustomerOnBlock,
  getBookingById,
  deleteCustomerCascade
} = require('./helpers/admin-db');
const { buildCheckoutCompletedEvent, postToStripeWebhook } = require('./helpers/stripe-webhook');

const TEST_EMAIL = `st24-${Date.now()}@test.example`;

test.describe('ST-24 — Webhook failure (ALREADY_BOOKED) retains pending row, existing booking untouched', () => {
  test.skip(!process.env.TEST_SUPABASE_URL || !process.env.TEST_STRIPE_WEBHOOK_SECRET, 'TEST_SUPABASE_URL / TEST_STRIPE_WEBHOOK_SECRET not set');

  let pendingId = null;
  let createdCustomerId = null;

  test.afterEach(async () => {
    if (pendingId) {
      await deletePendingBookingById(pendingId);
    }
    if (createdCustomerId) {
      await deleteCustomerCascade(createdCustomerId); // cascades existing booking, resyncs blocks.booked
    }
  });

  test('returns booking_failed_after_payment, pending row retained, existing booking untouched', async () => {
    const blk = await getBlockByRole('fri-upcoming');

    // Create customer with an existing reserved booking on this block
    const { data: customerId, error: custErr } = await sb.rpc('upsert_customer', {
      p_first_name: 'Webhook',
      p_last_name:  'AlreadyBooked',
      p_email:      TEST_EMAIL,
      p_phone:      '07700900124',
      p_customer_type: 'returning'
    });
    expect(custErr).toBeNull();
    createdCustomerId = customerId;

    const { data: existingBookingId, error: bookErr1 } = await sb.rpc('book_if_available', {
      p_block_id:   blk.id,
      p_class_id:   blk.class_id,
      p_customer_id: customerId,
      p_amount_due:  60
    });
    expect(bookErr1).toBeNull();
    expect(existingBookingId).toBeTruthy();

    // pending_bookings row for the SAME email/block — simulates a Stripe
    // payment for a class they already have a booking on
    pendingId = await insertPendingBooking({
      classId: blk.class_id,
      blockId: blk.id,
      firstName: 'Webhook',
      lastName: 'AlreadyBooked',
      email: TEST_EMAIL,
      phone: '07700900124',
      customerType: 'returning',
      amountPence: 6000
    });

    const event = buildCheckoutCompletedEvent({ pendingBookingId: String(pendingId) });
    const { status, json } = await postToStripeWebhook(event);

    expect(status).toBe(200);
    expect(json).not.toBeNull();
    expect(json.received).toBe(true);
    expect(json.warning).toBe('booking_failed_after_payment');
    expect(json.booking_id).toBeUndefined();

    // pending_bookings row must be RETAINED for manual review
    const pendingAfter = await getPendingBookingById(pendingId);
    expect(pendingAfter).not.toBeNull();
    expect(pendingAfter.email).toBe(TEST_EMAIL);

    // Exactly one booking still exists for this (customer, block) — the
    // original — and it is unchanged
    const bookingCount = await countBookingsForCustomerOnBlock(customerId, blk.id);
    expect(bookingCount).toBe(1);

    const existingBooking = await getBookingById(existingBookingId);
    expect(existingBooking).not.toBeNull();
    expect(existingBooking.status).toBe('reserved');
    expect(existingBooking.stripe_payment_intent_id).toBeNull();
    expect(existingBooking.stripe_checkout_session_id).toBeNull();
  });
});
