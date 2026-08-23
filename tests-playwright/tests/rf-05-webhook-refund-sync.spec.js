// tests/rf-05-webhook-refund-sync.spec.js
//
// RF-05 — T1-09c / issue #29: refunds issued directly in the Stripe dashboard
// (bypassing the in-app "Mark Refunded" flow, #28) sync back into
// cancellations + bookings via a signed charge.refunded webhook event.
//
// Approach: mirrors ST-19's pattern — build and sign a charge.refunded event
// locally and POST it directly to the test project's stripe-webhook function.
// Stripe itself is never contacted. A cancellation row + a real booking row
// (both carrying the same fake payment_intent id) are seeded directly so the
// webhook has something to match and sync.
//
// Covers:
//   RF-05a: matching cancellation + booking both sync (refunded flips,
//           refunded_at set, bookings.refund_status updated).
//   RF-05b: idempotent — resending the same event after it's already synced
//           is a no-op (already_synced:true, no error, flag stays true).
//   RF-05c: no matching cancellation for the payment_intent — safe no-op,
//           200 received:true, nothing thrown.
//
// Cleanup: afterEach deletes the seeded cancellation row directly and cascades
// the created customer (which removes the booking + resyncs blocks.booked).

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { deleteCustomerCascade, setBookingStripeIntent, getBookingById, getPool } = require('./helpers/admin-db');
const { buildChargeRefundedEvent, postToStripeWebhook } = require('./helpers/stripe-webhook');

// Mirrors the shape rfbConfirm() writes (see index.html ~3603) — same helper
// pattern as rf-02-03-04's insertCancellation.
async function insertCancellation({ customerId, block, firstName, lastName, email, refundAmount, intentId }) {
  const { rows } = await getPool().query(
    `INSERT INTO cancellations
       (customer_id, class_id, block_id, first_name, last_name, email, class_name,
        venue, block_start_date, block_end_date, sessions_attended, sessions_remaining,
        price_per_session, refund_amount, refunded, stripe_payment_intent_id, cancelled_at)
     VALUES ($1,$2,$3,$4,$5,$6,'Test Class','Baildon',$7,$8,3,3,10,$9,false,$10,now())
     RETURNING id`,
    [customerId, block.class_id, block.id, firstName, lastName, email,
     block.start_date || null, block.end_date || null, refundAmount, intentId]
  );
  return rows[0].id;
}

test.describe('RF-05 — Dashboard-issued Stripe refunds sync back via webhook', () => {
  test.skip(!process.env.TEST_SUPABASE_URL || !process.env.TEST_STRIPE_WEBHOOK_SECRET, 'TEST_SUPABASE_URL / TEST_STRIPE_WEBHOOK_SECRET not set');

  let createdCustomerId = null;
  let insertedCancellationId = null;

  test.beforeEach(async () => {
    createdCustomerId = null;
    insertedCancellationId = null;
  });

  test.afterEach(async () => {
    if (insertedCancellationId) {
      await getPool().query('DELETE FROM cancellations WHERE id = $1', [insertedCancellationId]);
    }
    if (createdCustomerId) {
      await deleteCustomerCascade(createdCustomerId); // cascades the booking, resyncs blocks.booked
    }
  });

  test('RF-05a — matching cancellation and booking both sync on charge.refunded', async () => {
    const email = `rf05a-${Date.now()}@test.example`;
    const block = await getBlockByRole('fri-upcoming');
    const intentId = `pi_test_rf05a_${Date.now()}`;

    const { data: custId, error: custErr } = await sb.rpc('upsert_customer', {
      p_first_name: 'Rf05a', p_last_name: 'DashboardRefund', p_email: email,
      p_phone: '07700930401', p_customer_type: 'returning'
    });
    expect(custErr, 'upsert_customer should not error').toBeNull();
    createdCustomerId = custId;

    const { data: bookingId, error: bookErr } = await sb.rpc('book_if_available', {
      p_block_id: block.id, p_class_id: block.class_id,
      p_customer_id: createdCustomerId, p_amount_due: 30
    });
    expect(bookErr, 'book_if_available should not error').toBeNull();
    await setBookingStripeIntent(bookingId, intentId);

    insertedCancellationId = await insertCancellation({
      customerId: createdCustomerId, block, firstName: 'Rf05a', lastName: 'DashboardRefund',
      email, refundAmount: 30, intentId
    });

    const event = buildChargeRefundedEvent({ paymentIntentId: intentId, amountRefundedPence: 3000 });
    const { status, json } = await postToStripeWebhook(event);

    expect(status).toBe(200);
    expect(json.received).toBe(true);
    // pg returns bigint ids as strings; postgrest/JSON returns them as numbers.
    expect(Number(json.cancellation_id)).toBe(Number(insertedCancellationId));

    const { rows } = await getPool().query(
      'SELECT refunded, refunded_at FROM cancellations WHERE id = $1', [insertedCancellationId]
    );
    expect(rows[0].refunded).toBe(true);
    expect(rows[0].refunded_at).not.toBeNull();

    const booking = await getBookingById(bookingId);
    expect(booking.refund_status).toBe('refunded');
  });

  test('RF-05b — resending the same event after sync is idempotent', async () => {
    const email = `rf05b-${Date.now()}@test.example`;
    const block = await getBlockByRole('fri-upcoming');
    const intentId = `pi_test_rf05b_${Date.now()}`;

    const { data: custId, error: custErr } = await sb.rpc('upsert_customer', {
      p_first_name: 'Rf05b', p_last_name: 'Repeat', p_email: email,
      p_phone: '07700930402', p_customer_type: 'returning'
    });
    expect(custErr, 'upsert_customer should not error').toBeNull();
    createdCustomerId = custId;

    insertedCancellationId = await insertCancellation({
      customerId: createdCustomerId, block, firstName: 'Rf05b', lastName: 'Repeat',
      email, refundAmount: 30, intentId
    });

    const event = buildChargeRefundedEvent({ paymentIntentId: intentId, amountRefundedPence: 3000 });

    const first = await postToStripeWebhook(event);
    expect(first.status).toBe(200);
    expect(first.json.already_synced).toBeFalsy();

    const second = await postToStripeWebhook(event);
    expect(second.status).toBe(200);
    expect(second.json.already_synced).toBe(true);

    const { rows } = await getPool().query(
      'SELECT refunded FROM cancellations WHERE id = $1', [insertedCancellationId]
    );
    expect(rows[0].refunded).toBe(true);
  });

  test('RF-05c — no matching cancellation is a safe no-op', async () => {
    const event = buildChargeRefundedEvent({ paymentIntentId: `pi_test_rf05c_nomatch_${Date.now()}`, amountRefundedPence: 3000 });
    const { status, json } = await postToStripeWebhook(event);

    expect(status).toBe(200);
    expect(json.received).toBe(true);
    expect(json.cancellation_id).toBeUndefined();
  });
});
