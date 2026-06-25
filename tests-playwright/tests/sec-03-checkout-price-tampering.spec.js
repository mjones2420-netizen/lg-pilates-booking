// SEC-03 — stripe-checkout price tampering is closed (issue #32)
//
// Before the fix, stripe-checkout trusted the client-supplied amount_pence
// for both the Stripe line item and the pending_bookings row. A tampered
// browser request could set this to 1p (or anything) and pay almost nothing
// for a real class. This spec proves the deployed test Edge Function now
// recomputes the price itself from the block's own price/weeks/dates —
// the client's number is ignored entirely.
//
// Requires the updated stripe-checkout function to be deployed to the test
// project, and TEST_APP_URL set (used as a plausible success/cancel URL).

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { getPendingBookingByEmail, deletePendingBookingByEmail } = require('./helpers/admin-db');

const SUPABASE_URL = process.env.TEST_SUPABASE_URL;
const APP_URL = process.env.TEST_APP_URL || 'http://localhost:8000';

test.describe('SEC-03 — stripe-checkout price tampering is closed (#32)', () => {
  test.skip(!SUPABASE_URL, 'TEST_SUPABASE_URL not set');

  const tamperEmail = 'sec03-tamper@test.example';
  const mismatchEmail = 'sec03-mismatch@test.example';

  test.afterEach(async () => {
    await deletePendingBookingByEmail(tamperEmail);
    await deletePendingBookingByEmail(mismatchEmail);
  });

  async function callCheckout(body) {
    return fetch(`${SUPABASE_URL}/functions/v1/stripe-checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  test('a forged 1p amount_pence is ignored — pending row gets the real server-computed price', async () => {
    const blk = await getBlockByRole('fri-upcoming');
    const { data: blockRow, error: blockErr } = await sb
      .from('blocks')
      .select('price, weeks, dates')
      .eq('id', blk.id)
      .single();
    expect(blockErr).toBeNull();
    const expectedPence = blockRow.price * blockRow.weeks * 100;

    const res = await callCheckout({
      class_id: blk.class_id,
      block_id: blk.id,
      first_name: 'Sec03',
      last_name: 'Tamper',
      email: tamperEmail,
      phone: '07000000000',
      customer_type: 'new',
      amount_pence: 1, // forged — should be ignored
      class_name: 'Test Class',
      success_url: `${APP_URL}?success=true`,
      cancel_url: `${APP_URL}?cancelled=true`,
      is_test: true,
    });

    expect(res.status, 'checkout should succeed (forged amount must not block it)').toBe(200);

    const pending = await getPendingBookingByEmail(tamperEmail);
    expect(pending, 'pending_bookings row should have been created').not.toBeNull();
    expect(pending.amount_pence, 'pending row must use the real price, not the forged 1p').toBe(expectedPence);
    expect(pending.amount_pence).not.toBe(1);
  });

  test('a block_id that does not belong to the given class_id is rejected', async () => {
    const friBlk = await getBlockByRole('fri-upcoming');
    const monBlk = await getBlockByRole('mon-upcoming');

    const res = await callCheckout({
      class_id: monBlk.class_id,   // mismatched on purpose
      block_id: friBlk.id,
      first_name: 'Sec03',
      last_name: 'Mismatch',
      email: mismatchEmail,
      phone: '07000000000',
      customer_type: 'new',
      amount_pence: 1,
      class_name: 'Test Class',
      success_url: `${APP_URL}?success=true`,
      cancel_url: `${APP_URL}?cancelled=true`,
      is_test: true,
    });

    expect(res.status, 'mismatched class_id/block_id must be rejected').toBe(400);

    const pending = await getPendingBookingByEmail(mismatchEmail);
    expect(pending, 'no pending row should be created for a rejected request').toBeNull();
  });
});
