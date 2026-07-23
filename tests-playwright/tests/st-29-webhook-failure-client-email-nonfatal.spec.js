// ST-29 — Webhook failure path (#6b): client failure email is fire-and-forget
//
// What this proves:
//   When a booking fails AFTER payment (CLASS_FULL), the webhook now also sends
//   the customer a "payment received, place not secured" email (#6b) in addition
//   to the admin alert (ST-23). That client send is wrapped in its own try/catch
//   and is fire-and-forget: it must NOT change the failure path's contract. The
//   webhook must still return { received: true, warning: "booking_failed_after_
//   payment" }, retain the pending_bookings row for manual review, and create no
//   bookings row — with the new client-email code deployed.
//
//   This is the regression guard that adding the client email did not break the
//   failure path (e.g. a throw escaping the try, or the restructured cls-only
//   guard skipping the failure handling).
//
// Why the email itself is not asserted here:
//   The client email is a server-to-server send-email call made with the
//   service-role key inside the webhook (like the admin alert in ST-23). Its HTTP
//   echo (#68) is consumed by the webhook and never surfaced in the webhook's own
//   response, and the builder (buildPaymentFailedClientEmailHtml) lives in the
//   Deno webhook, not importable by this Node suite. So, as with ST-23's admin
//   alert, the email is reviewed manually; this spec asserts the path contract.
//
// Approach (parallel-safe, no block mutation):
//   Uses the 'mon-full' fixture block (cap=2, booked=2 — full by seed design), so
//   book_if_available returns CLASS_FULL naturally. Unlike ST-23 (which forces
//   fri-upcoming to capacity via setBlockBookedCount and resyncs in afterEach),
//   this spec never writes blocks.booked, so it can't collide with the many other
//   webhook specs that hammer fri-upcoming in parallel (#101 flake surface).
//
// Cleanup:
//   afterEach deletes the pending row and the customer record created by
//   upsert_customer (which runs BEFORE the book_if_available check). mon-full is
//   left untouched.

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const {
  insertPendingBooking,
  getPendingBookingById,
  deletePendingBookingById,
  countBookingsForCustomerOnBlock,
  deleteCustomerCascade
} = require('./helpers/admin-db');
const { buildCheckoutCompletedEvent, postToStripeWebhook } = require('./helpers/stripe-webhook');

const TEST_EMAIL = `st29-${Date.now()}@test.example`;

test.describe('ST-29 — Webhook failure (#6b): client email is fire-and-forget, failure contract unchanged', () => {
  test.skip(!process.env.TEST_SUPABASE_URL || !process.env.TEST_STRIPE_WEBHOOK_SECRET, 'TEST_SUPABASE_URL / TEST_STRIPE_WEBHOOK_SECRET not set');

  let pendingId = null;
  let blockId = null;

  test.afterEach(async () => {
    if (pendingId) {
      await deletePendingBookingById(pendingId);
    }
    const lookupRes = await sb.rpc('lookup_customer', { p_email: TEST_EMAIL });
    if (!lookupRes.error && lookupRes.data && lookupRes.data.length > 0) {
      await deleteCustomerCascade(lookupRes.data[0].id);
    }
  });

  test('CLASS_FULL after payment still returns booking_failed_after_payment, pending retained, no booking', async () => {
    const blk = await getBlockByRole('mon-full'); // cap=2, booked=2 by seed design
    blockId = blk.id;

    pendingId = await insertPendingBooking({
      classId: blk.class_id,
      blockId: blk.id,
      firstName: 'Webhook',
      lastName: 'ClientFail',
      email: TEST_EMAIL,
      phone: '07700900123',
      customerType: 'returning',
      amountPence: 6000
    });

    const event = buildCheckoutCompletedEvent({ pendingBookingId: String(pendingId) });
    const { status, json } = await postToStripeWebhook(event);

    // Failure-path contract is unchanged by the added client email
    expect(status).toBe(200);
    expect(json).not.toBeNull();
    expect(json.received).toBe(true);
    expect(json.warning).toBe('booking_failed_after_payment');
    expect(json.booking_id).toBeUndefined();

    // pending_bookings row retained for manual review
    const pendingAfter = await getPendingBookingById(pendingId);
    expect(pendingAfter).not.toBeNull();
    expect(pendingAfter.email).toBe(TEST_EMAIL);

    // upsert_customer ran before the failure, but no bookings row was created
    const lookupRes = await sb.rpc('lookup_customer', { p_email: TEST_EMAIL });
    expect(lookupRes.error).toBeNull();
    expect(lookupRes.data.length).toBeGreaterThan(0);
    const customerId = lookupRes.data[0].id;

    const bookingCount = await countBookingsForCustomerOnBlock(customerId, blk.id);
    expect(bookingCount).toBe(0);
  });
});
