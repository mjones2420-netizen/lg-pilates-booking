// SEC-09 — book_if_available price tampering is closed (issue #46)
//
// Before the fix, the bank-transfer booking path trusted the client-supplied
// p_amount_due: anyone holding the anon key could book a real block with
// amount_due £0.01 (and Louise would see that figure as what's owed), or pass
// a forged class_id to mislabel the booking row. Migration 17 makes the RPC
// recompute the amount from the block's own price/weeks/start_date (ISO date
// arithmetic) and validate class_id against the block — mirroring the #32 fix
// in stripe-checkout.
//
// Pure DB spec via the shared anon RPC client (sb) — proves the fix at the
// same trust boundary an attacker would use. Requires migration 17 applied to
// the test project.
//
// Cleanup (afterEach): deleteCustomerCascade removes the per-run customer and
// any booking it created, then resyncs blocks.booked.

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { deleteCustomerCascade, getBookingById, getCustomerByEmail } = require('./helpers/admin-db');

const SUPABASE_URL = process.env.TEST_SUPABASE_URL;

test.describe('SEC-09 — book_if_available ignores client-supplied amount (#46)', () => {
  test.skip(!SUPABASE_URL, 'TEST_SUPABASE_URL not set');

  const tamperEmail = 'sec09-tamper@test.example';
  const mismatchEmail = 'sec09-mismatch@test.example';

  test.afterEach(async () => {
    for (const email of [tamperEmail, mismatchEmail]) {
      const cust = await getCustomerByEmail(email);
      if (cust) await deleteCustomerCascade(cust.id);
    }
  });

  async function createCustomer(email) {
    const { data: customerId, error } = await sb.rpc('upsert_customer', {
      p_first_name: 'Sec09',
      p_last_name: 'Tamper',
      p_email: email,
      p_phone: '07000000000',
      p_customer_type: 'new',
    });
    expect(error, 'upsert_customer should succeed').toBeNull();
    return customerId;
  }

  test('a forged 1p amount_due is ignored — booking row gets the server-computed price', async () => {
    // fri-upcoming: all sessions in the future, so the correct amount is the
    // full block price (price × weeks) — no prorata ambiguity.
    const blk = await getBlockByRole('fri-upcoming');
    const { data: blockRow, error: blockErr } = await sb
      .from('blocks')
      .select('price, weeks')
      .eq('id', blk.id)
      .single();
    expect(blockErr).toBeNull();
    const expectedAmount = blockRow.price * blockRow.weeks;

    const customerId = await createCustomer(tamperEmail);

    const { data: bookingId, error } = await sb.rpc('book_if_available', {
      p_block_id: blk.id,
      p_class_id: blk.class_id,
      p_customer_id: customerId,
      p_amount_due: 0.01, // forged — must be ignored
    });
    expect(error, 'booking itself should succeed').toBeNull();
    expect(bookingId).toBeTruthy();

    const booking = await getBookingById(bookingId);
    expect(booking, 'booking row should exist').toBeTruthy();
    expect(Number(booking.amount_due), 'amount_due must be the server-computed price, not the forged 1p')
      .toBe(expectedAmount);
    expect(Number(booking.class_id), 'class_id must come from the block itself').toBe(blk.class_id);
  });

  test('a forged class_id is rejected with CLASS_MISMATCH and no booking is created', async () => {
    const blk = await getBlockByRole('fri-upcoming');
    const wrongClass = await getBlockByRole('mon-upcoming'); // different class
    expect(wrongClass.class_id).not.toBe(blk.class_id);

    const customerId = await createCustomer(mismatchEmail);

    const { data, error } = await sb.rpc('book_if_available', {
      p_block_id: blk.id,
      p_class_id: wrongClass.class_id, // forged — does not match the block
      p_customer_id: customerId,
      p_amount_due: 60,
    });
    expect(data).toBeNull();
    expect(error, 'RPC should raise').toBeTruthy();
    expect(error.message).toContain('CLASS_MISMATCH');
  });
});
