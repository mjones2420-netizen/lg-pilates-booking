// ST-23 — Webhook failure path: CLASS_FULL after payment
//
// What this proves:
//   If a block fills (booked >= cap) in the moments between Stripe taking
//   payment and the webhook arriving, book_if_available fails with
//   CLASS_FULL. The webhook must NOT delete the pending_bookings row (it's
//   left for manual review) and must NOT create a bookings row, returning
//   { received: true, warning: "booking_failed_after_payment" }.
//
// Approach:
//   fri-upcoming's blocks.booked is set to its cap via direct pg (no real
//   bookings inserted — see admin-db.js setBlockBookedCount), making
//   book_if_available fail. A signed checkout.session.completed event is
//   POSTed directly to stripe-webhook (no real Stripe contact).
//
// Note on the admin failure-alert email:
//   The webhook also attempts to send a payment-failed admin alert email in
//   this path (see the rendered preview discussed in chat). As with
//   ST-19/20, this cannot be intercepted from Playwright (server-to-server
//   call) — this spec does not assert on it. Its template was reviewed
//   manually; a dedicated template check could be added later if needed.
//
// Side note (flagged separately in BACKLOG.md):
//   The client receives NO email in this path, and the front-end success
//   overlay shows "Booking confirmed" immediately on the Stripe redirect —
//   before this webhook even runs. This is a known UX gap, out of scope for
//   this spec.
//
// Cleanup:
//   afterEach restores blocks.booked via resyncBlockBookedCount (recalculates
//   from real bookings rows, which are unchanged), deletes the pending row,
//   and removes the customer record created by upsert_customer (which runs
//   BEFORE the book_if_available check, even on this failure path).

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const {
  insertPendingBooking,
  getPendingBookingById,
  deletePendingBookingById,
  setBlockBookedCount,
  resyncBlockBookedCount,
  countBookingsForCustomerOnBlock,
  deleteCustomerCascade
} = require('./helpers/admin-db');
const { buildCheckoutCompletedEvent, postToStripeWebhook } = require('./helpers/stripe-webhook');

const TEST_EMAIL = `st23-${Date.now()}@test.example`;

test.describe('ST-23 — Webhook failure (CLASS_FULL) retains pending row, no booking created', () => {
  test.skip(!process.env.TEST_SUPABASE_URL || !process.env.TEST_STRIPE_WEBHOOK_SECRET, 'TEST_SUPABASE_URL / TEST_STRIPE_WEBHOOK_SECRET not set');

  let pendingId = null;
  let blockId = null;

  test.afterEach(async () => {
    if (blockId) {
      await resyncBlockBookedCount(blockId); // restore booked from real bookings (unchanged)
    }
    if (pendingId) {
      await deletePendingBookingById(pendingId);
    }
    const lookupRes = await sb.rpc('lookup_customer', { p_email: TEST_EMAIL });
    if (!lookupRes.error && lookupRes.data && lookupRes.data.length > 0) {
      await deleteCustomerCascade(lookupRes.data[0].id);
    }
  });

  test('returns booking_failed_after_payment, pending row retained, no bookings row created', async () => {
    const blk = await getBlockByRole('fri-upcoming');
    blockId = blk.id;

    pendingId = await insertPendingBooking({
      classId: blk.class_id,
      blockId: blk.id,
      firstName: 'Webhook',
      lastName: 'ClassFull',
      email: TEST_EMAIL,
      phone: '07700900123',
      customerType: 'returning',
      amountPence: 6000
    });

    // Force the block to capacity without inserting real bookings rows.
    await setBlockBookedCount(blk.id, blk.cap);

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
    expect(Number(pendingAfter.amount_pence)).toBe(6000);

    // No bookings row was created for this customer on this block
    const lookupRes = await sb.rpc('lookup_customer', { p_email: TEST_EMAIL });
    expect(lookupRes.error).toBeNull();
    expect(lookupRes.data.length).toBeGreaterThan(0); // upsert_customer ran before the failure
    const customerId = lookupRes.data[0].id;

    const bookingCount = await countBookingsForCustomerOnBlock(customerId, blk.id);
    expect(bookingCount).toBe(0);
  });
});
