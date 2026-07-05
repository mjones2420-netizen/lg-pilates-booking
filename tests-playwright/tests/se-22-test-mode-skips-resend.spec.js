// SE-22 — Test mode does not call Resend
//
// What this proves:
//   In test mode (isTest: true) the send-email Edge Function short-circuits
//   BEFORE the Resend API call and returns a synthetic success id
//   ('test-mode-no-send'). This is the observable signal that no real email was
//   sent — so the Playwright suite never consumes the Resend daily quota
//   (100/day free tier), which previously exhausted after a few suite runs even
//   though nothing was delivered (recipients were only redirected to a sink).
//
// Why the sentinel id proves it:
//   The id is the ONLY value the function ever takes from Resend's response. In
//   prod (isTest falsey) it is a real Resend uuid. The fixed test path never
//   reaches the fetch, so it returns the fixed sentinel instead. Asserting the
//   sentinel therefore proves the fetch was skipped. The echo (to/subject/html)
//   must still be present — the mock changes only whether Resend is called, not
//   what the function builds.
//
// Uses the same DEPLOYED test send-email + admin JWT path as ST-21/ST-22.
//
// Cleanup:
//   afterEach removes the per-run customer and booking.

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { getAdminJwt } = require('./helpers/admin-jwt');
const { deleteCustomerCascade } = require('./helpers/admin-db');

const SUPABASE_URL = process.env.TEST_SUPABASE_URL;
const TEST_EMAIL = 'se22-nosend@test.example';
const TEST_FIRST = 'Sendra';
const TEST_LAST  = 'TwentyTwo';

test.describe('SE-22 — Test mode skips the Resend API', () => {
  let createdCustomerId = null;
  let bookingId = null;
  let block = null;

  test.beforeEach(async () => {
    createdCustomerId = null;
    bookingId = null;

    const { data: custId, error: custErr } = await sb.rpc('upsert_customer', {
      p_first_name: TEST_FIRST,
      p_last_name:  TEST_LAST,
      p_email:      TEST_EMAIL,
      p_phone:      '07700900022',
      p_customer_type: 'returning',
    });
    expect(custErr).toBeNull();
    createdCustomerId = custId;

    block = await getBlockByRole('fri-upcoming');
    const { data: bId, error: bookErr } = await sb.rpc('book_if_available', {
      p_block_id:    block.id,
      p_class_id:    block.class_id,
      p_customer_id: createdCustomerId,
      p_amount_due:  block.price || 60,
    });
    expect(bookErr).toBeNull();
    bookingId = bId;
  });

  test.afterEach(async () => {
    if (createdCustomerId) {
      await deleteCustomerCascade(createdCustomerId);
    }
  });

  test('isTest send returns the no-send sentinel id and still echoes the template', async () => {
    const jwt = await getAdminJwt();

    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ type: 'confirmed_booking', booking_id: bookingId, isTest: true }),
    });
    expect(res.status, 'confirmed_booking must succeed for an admin JWT').toBe(200);
    const body = await res.json();

    // The sentinel id is only ever returned by the Resend-skip branch —
    // proof that no real Resend call was made.
    expect(body.id, 'test mode must return the no-send sentinel, not a Resend id').toBe('test-mode-no-send');

    // The mock changes only whether Resend is called — the server-built echo
    // must still be intact.
    expect(body.to, 'recipient still resolved server-side').toBe(TEST_EMAIL);
    expect(body.subject, 'subject still built server-side').toContain('confirmed');
    expect(body.html, 'html still built server-side').toBeTruthy();
    expect(body.html).toContain('Booking confirmed');
  });
});
