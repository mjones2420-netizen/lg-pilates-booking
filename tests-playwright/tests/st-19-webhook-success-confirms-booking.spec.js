// ST-19 — Webhook success: booking created as confirmed with Stripe IDs
//
// What this proves:
//   POSTing a signed checkout.session.completed event (with pending_booking_id
//   metadata) directly to stripe-webhook results in: the pending_bookings row
//   being deleted, a new bookings row with status='confirmed' and both
//   stripe_payment_intent_id and stripe_checkout_session_id populated, and a
//   customers row upserted for the email on the pending row.
//
// Approach:
//   A pending_bookings row is inserted directly via pg (simulating a
//   completed stripe-checkout call). A checkout.session.completed event is
//   built and signed locally (see helpers/stripe-webhook.js) and POSTed
//   directly to the test project's stripe-webhook function — Stripe itself
//   is never contacted. metadata.is_test='true' ensures any emails the
//   webhook fires are redirected to delivered@resend.dev.
//
// Side effects (non-fatal, by design):
//   This run does fire the real client confirmation (trigger 2) and admin
//   alert (trigger 5S) emails via send-email, both redirected to
//   delivered@resend.dev because is_test='true'. ST-21/22 assert on email
//   content specifically; this spec only asserts DB state.
//
// Cleanup:
//   afterEach deletes the created booking + customer (cascades parq) and
//   defensively removes the pending_bookings row if it somehow survived.

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const {
  insertPendingBooking,
  getPendingBookingById,
  deletePendingBookingById,
  deleteCustomerCascade,
  getBookingById
} = require('./helpers/admin-db');
const { buildCheckoutCompletedEvent, postToStripeWebhook } = require('./helpers/stripe-webhook');

const TEST_EMAIL = `st19-${Date.now()}@test.example`;

test.describe('ST-19 — Webhook success creates confirmed booking with Stripe IDs', () => {
  test.skip(!process.env.TEST_SUPABASE_URL || !process.env.TEST_STRIPE_WEBHOOK_SECRET, 'TEST_SUPABASE_URL / TEST_STRIPE_WEBHOOK_SECRET not set');

  let pendingId = null;
  let createdBookingId = null;
  let createdCustomerId = null;

  test.afterEach(async () => {
    if (createdCustomerId) {
      await deleteCustomerCascade(createdCustomerId); // cascades bookings + parq, resyncs blocks.booked
    }
    if (pendingId) {
      await deletePendingBookingById(pendingId); // defensive — webhook should already delete it
    }
  });

  test('booking is confirmed with stripe_payment_intent_id and stripe_checkout_session_id populated', async () => {
    const blk = await getBlockByRole('fri-upcoming');

    pendingId = await insertPendingBooking({
      classId: blk.class_id,
      blockId: blk.id,
      firstName: 'Webhook',
      lastName: 'Success',
      email: TEST_EMAIL,
      phone: '07700900119',
      customerType: 'returning',
      amountPence: 6000
    });

    const event = buildCheckoutCompletedEvent({ pendingBookingId: String(pendingId) });
    const { status, json } = await postToStripeWebhook(event);

    expect(status).toBe(200);
    expect(json).not.toBeNull();
    expect(json.received).toBe(true);
    expect(json.booking_id).toBeTruthy();
    createdBookingId = json.booking_id;

    // pending_bookings row should be deleted by the webhook
    const pendingAfter = await getPendingBookingById(pendingId);
    expect(pendingAfter).toBeNull();
    pendingId = null; // already cleaned up

    // bookings row: confirmed, both Stripe IDs populated, correct block/class
    const booking = await getBookingById(createdBookingId);
    expect(booking).not.toBeNull();
    expect(booking.status).toBe('confirmed');
    expect(booking.stripe_payment_intent_id).toBe(event.data.object.payment_intent);
    expect(booking.stripe_checkout_session_id).toBe(event.data.object.id);
    expect(Number(booking.block_id)).toBe(blk.id);
    expect(Number(booking.class_id)).toBe(blk.class_id);
    createdCustomerId = booking.customer_id;

    // customers row upserted correctly for the pending row's email
    const lookupRes = await sb.rpc('lookup_customer', { p_email: TEST_EMAIL });
    expect(lookupRes.error).toBeNull();
    expect(lookupRes.data.length).toBeGreaterThan(0);
    expect(Number(lookupRes.data[0].id)).toBe(Number(createdCustomerId));
  });
});
