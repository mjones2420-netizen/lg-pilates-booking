// SEC-10 — send-email public path is one-shot per booking (issue #45)
//
// Before the fix, anyone holding the anon key could fire the public
// reserved_confirmation / new_booking_alert path for any booking id
// (sequential, so guessable), any number of times — a harassment/spam vector
// sending real, legitimate-looking emails from bookings@lg-pilates.co.uk.
//
// Migration 18 adds reserved_email_sent_at / alert_email_sent_at stamps to
// bookings; the deployed function claims the stamp atomically (UPDATE ...
// WHERE <col> IS NULL) BEFORE sending, so:
//   - the second call for the same booking returns 429,
//   - a concurrent burst yields exactly one send (no check-then-send gap).
//
// All calls use isTest: true, so any real send is redirected to Resend's
// delivered@resend.dev sink — nothing is delivered to a person.
//
// Requires migration 18 + the updated send-email function deployed to the
// test project.
//
// Cleanup (afterEach): deleteCustomerCascade removes the per-run customer and
// booking. admin_email is baseline persistent state in the test DB (smoke-01
// asserts it, SE-10/SE-11 restore it) — this spec upserts the same baseline
// value and NEVER deletes the key, so parallel workers are unaffected.

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const {
  deleteCustomerCascade, getBookingById, getCustomerByEmail,
  setSetting,
} = require('./helpers/admin-db');

const SUPABASE_URL = process.env.TEST_SUPABASE_URL;
const ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY;

// Same baseline as SE-10/SE-11 — keep in sync with those specs.
const ORIG_ADMIN_EMAIL = 'mjones970@live.co.uk';

test.describe('SEC-10 — send-email public path is one-shot per booking (#45)', () => {
  test.skip(!SUPABASE_URL || !ANON_KEY, 'TEST_SUPABASE_URL / TEST_SUPABASE_ANON_KEY not set');

  const emails = [
    'sec10-reserved@test.example',
    'sec10-alert@test.example',
    'sec10-burst@test.example',
  ];

  test.afterEach(async () => {
    for (const email of emails) {
      const cust = await getCustomerByEmail(email);
      if (cust) await deleteCustomerCascade(cust.id);
    }
    await setSetting('admin_email', ORIG_ADMIN_EMAIL);
  });

  async function createBooking(email, blockRole) {
    const blk = await getBlockByRole(blockRole);
    const { data: customerId, error: custErr } = await sb.rpc('upsert_customer', {
      p_first_name: 'Sec10',
      p_last_name: 'OneShot',
      p_email: email,
      p_phone: '07000000000',
      p_customer_type: 'new',
    });
    expect(custErr).toBeNull();
    const { data: bookingId, error: bookErr } = await sb.rpc('book_if_available', {
      p_block_id: blk.id,
      p_class_id: blk.class_id,
      p_customer_id: customerId,
      p_amount_due: 60,
    });
    expect(bookErr).toBeNull();
    return bookingId;
  }

  function callSendEmail(type, bookingId) {
    return fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({ type, booking_id: bookingId, isTest: true }),
    });
  }

  test('reserved_confirmation: first call sends, second call is refused with 429', async () => {
    const bookingId = await createBooking(emails[0], 'fri-upcoming');

    const first = await callSendEmail('reserved_confirmation', bookingId);
    expect(first.status, 'first send should succeed').toBe(200);

    const booking = await getBookingById(bookingId);
    expect(booking.reserved_email_sent_at, 'stamp should be set after the first send').toBeTruthy();

    const second = await callSendEmail('reserved_confirmation', bookingId);
    expect(second.status, 'repeat send must be refused').toBe(429);
  });

  test('new_booking_alert: first call sends, second call is refused with 429', async () => {
    // Ensure the baseline admin_email is present (isTest redirects the actual
    // delivery to the Resend sink, so the value only needs to be non-empty).
    await setSetting('admin_email', ORIG_ADMIN_EMAIL);
    const bookingId = await createBooking(emails[1], 'mon-upcoming');

    const first = await callSendEmail('new_booking_alert', bookingId);
    expect(first.status, 'first alert should succeed').toBe(200);

    const booking = await getBookingById(bookingId);
    expect(booking.alert_email_sent_at, 'alert stamp should be set').toBeTruthy();
    expect(booking.reserved_email_sent_at, 'the two stamps are independent').toBeNull();

    const second = await callSendEmail('new_booking_alert', bookingId);
    expect(second.status, 'repeat alert must be refused').toBe(429);
  });

  test('a concurrent burst yields exactly one accepted send', async () => {
    const bookingId = await createBooking(emails[2], 'wed-upcoming');

    const results = await Promise.all([
      callSendEmail('reserved_confirmation', bookingId),
      callSendEmail('reserved_confirmation', bookingId),
      callSendEmail('reserved_confirmation', bookingId),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 200).length, 'exactly one call may send').toBe(1);
    expect(statuses.filter((s) => s === 429).length, 'the rest must be refused').toBe(2);
  });
});
