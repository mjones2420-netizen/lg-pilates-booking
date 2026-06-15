// ST-25 — Webhook signature verification rejects invalid signatures
//
// What this proves:
//   stripe-webhook's verifyStripeSignature() runs BEFORE any JSON parsing or
//   database access. A request with a missing or incorrect stripe-signature
//   header must be rejected with 400, with no side effects at all — the
//   pending_bookings row referenced in the (unsigned/incorrectly-signed)
//   payload is left completely untouched.
//
// Approach:
//   A pending_bookings row is inserted (as if a real checkout were in
//   progress). A valid checkout.session.completed payload referencing it is
//   built, then POSTed twice — once with the stripe-signature header omitted,
//   once with a syntactically valid but incorrect signature. Both must return
//   400 and leave the pending row untouched. Neither contacts Stripe.
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

const TEST_EMAIL = `st25-${Date.now()}@test.example`;

test.describe('ST-25 — Invalid webhook signatures are rejected', () => {
  test.skip(!process.env.TEST_SUPABASE_URL || !process.env.TEST_STRIPE_WEBHOOK_SECRET, 'TEST_SUPABASE_URL / TEST_STRIPE_WEBHOOK_SECRET not set');

  let pendingId = null;

  test.beforeEach(async () => {
    const blk = await getBlockByRole('fri-upcoming');
    pendingId = await insertPendingBooking({
      classId: blk.class_id,
      blockId: blk.id,
      firstName: 'Webhook',
      lastName: 'BadSignature',
      email: TEST_EMAIL,
      phone: '07700900125',
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

  test('missing stripe-signature header returns 400 and leaves pending row untouched', async () => {
    const before = await getPendingBookingById(pendingId);
    expect(before).not.toBeNull();

    const event = buildCheckoutCompletedEvent({ pendingBookingId: String(pendingId) });
    const { status, json } = await postToStripeWebhook(event, { signatureHeaderOverride: null });

    expect(status).toBe(400);
    expect(json).not.toBeNull();
    expect(json.error).toBeTruthy();

    const after = await getPendingBookingById(pendingId);
    expect(after).not.toBeNull();
    expect(after.email).toBe(before.email);
    expect(Number(after.amount_pence)).toBe(Number(before.amount_pence));
  });

  test('incorrect signature returns 400 and leaves pending row untouched', async () => {
    const before = await getPendingBookingById(pendingId);
    expect(before).not.toBeNull();

    const event = buildCheckoutCompletedEvent({ pendingBookingId: String(pendingId) });
    const badSignature = `t=${Math.floor(Date.now() / 1000)},v1=${'0'.repeat(64)}`;
    const { status, json } = await postToStripeWebhook(event, { signatureHeaderOverride: badSignature });

    expect(status).toBe(400);
    expect(json).not.toBeNull();
    expect(json.error).toBeTruthy();

    const after = await getPendingBookingById(pendingId);
    expect(after).not.toBeNull();
    expect(after.email).toBe(before.email);
    expect(Number(after.amount_pence)).toBe(Number(before.amount_pence));
  });
});
