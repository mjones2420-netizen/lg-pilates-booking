// SEC-01 — send-email open-relay is closed (issue #33)
//
// Before the fix, anyone holding the public anon key could POST
// { to, subject, html } to the send-email Edge Function and have it deliver an
// arbitrary email from bookings@lg-pilates.co.uk. This spec proves that hole is
// closed against the DEPLOYED test Edge Function:
//
//   1. anon key + raw {to,subject,html}        -> 401 (admin/internal only)
//   2. no Authorization header at all          -> 401
//   3. anon key + {type, booking_id:<bogus>}   -> 404 (public path IS reachable
//      with the anon key, but the recipient/HTML are resolved server-side from
//      the booking — a bogus id simply isn't found; no email is ever sent)
//
// Case 3 deliberately uses an unknown booking id so the function returns before
// calling Resend — the assertion is about auth + routing, not delivery. Real
// delivery is verified out-of-band at the Resend sink.
//
// Requires the updated send-email function to be deployed to the test project.

const { test, expect } = require('@playwright/test');

const SUPABASE_URL = process.env.TEST_SUPABASE_URL;
const ANON_KEY     = process.env.TEST_SUPABASE_ANON_KEY;

test.describe('SEC-01 — send-email open relay is closed (#33)', () => {

  test.beforeAll(() => {
    expect(SUPABASE_URL, 'TEST_SUPABASE_URL must be set').toBeTruthy();
    expect(ANON_KEY, 'TEST_SUPABASE_ANON_KEY must be set').toBeTruthy();
  });

  async function callSendEmail(headers, body) {
    return fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  }

  test('anon key cannot send a raw arbitrary-recipient/HTML email', async () => {
    const res = await callSendEmail(
      { Authorization: `Bearer ${ANON_KEY}` },
      { to: 'attacker@example.com', subject: 'Spam from LG', html: '<b>phish</b>', isTest: true }
    );
    expect(res.status, 'anon raw send must be rejected').toBe(401);
  });

  test('missing Authorization header is rejected on the raw path', async () => {
    const res = await callSendEmail(
      {},
      { to: 'attacker@example.com', subject: 'Spam', html: '<b>x</b>', isTest: true }
    );
    expect(res.status).toBe(401);
  });

  test('public type path is reachable with the anon key but is bound to a real booking', async () => {
    // A random (well-formed) UUID that does not exist as a booking.
    const bogusBookingId = '00000000-0000-4000-8000-000000000000';
    const res = await callSendEmail(
      { Authorization: `Bearer ${ANON_KEY}` },
      { type: 'reserved_confirmation', booking_id: bogusBookingId, isTest: true }
    );
    // Passes auth + routing (not 401), then fails to find the booking (404).
    // No recipient or HTML was ever supplied by the caller.
    expect(res.status, 'public path should authenticate then 404 on unknown booking').toBe(404);
  });

});
