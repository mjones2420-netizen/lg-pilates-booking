// ST-21 — Client confirmation email: server-built template content
//
// What this proves:
//   The confirmed_booking email — now built server-side by the send-email
//   Edge Function (single source of truth, #53) — renders the confirmed
//   banner, an escaped greeting, and a "Sessions" row of date pills built from
//   the block's own dates.
//
// Approach (changed in #53):
//   Previously this asserted against a JS COPY of the template
//   (helpers/email-templates.js) — a check of a copy, never the deployed path.
//   That mirror is gone. This spec now calls the DEPLOYED test send-email
//   directly with { type: 'confirmed_booking', booking_id, isTest: true } and
//   an admin JWT. In test mode the authenticated paths echo the server-built
//   { to, subject, html } back in the response, so the assertion runs against
//   the real deployed template output — genuine end-to-end coverage.
//
//   fri-upcoming is used deliberately: all of its sessions are in the future,
//   so every date pill is the "upcoming" (teal) style — a deterministic
//   assertion regardless of the run date. The past (grey) branch is the same
//   shared datePills() code path.
//
// Cleanup:
//   afterEach removes the per-run customer and booking.

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { getAdminJwt } = require('./helpers/admin-jwt');
const { deleteCustomerCascade } = require('./helpers/admin-db');

const SUPABASE_URL = process.env.TEST_SUPABASE_URL;
const TEST_EMAIL = 'st21-confirmed@test.example';
const TEST_FIRST = 'Stevie';
const TEST_LAST  = 'TwentyOne';

test.describe('ST-21 — Server-built confirmed email content', () => {
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
      p_phone:      '07700900021',
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

  test('confirmed_booking builds the confirmed template from the booking id', async () => {
    const jwt = await getAdminJwt();

    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ type: 'confirmed_booking', booking_id: bookingId, isTest: true }),
    });
    expect(res.status, 'confirmed_booking must succeed for an admin JWT').toBe(200);
    const body = await res.json();

    // Recipient + subject resolved server-side from the booking
    expect(body.to).toBe(TEST_EMAIL);
    expect(body.subject).toContain('confirmed');

    const html = body.html;
    expect(html, 'server must echo html in test mode').toBeTruthy();

    // Confirmed banner + greeting
    expect(html).toContain('Booking confirmed');
    expect(html).toContain('Payment received');
    expect(html).toContain(`Hi ${TEST_FIRST},`);

    // "Sessions" row of pills, built from the block's own dates
    expect(html).toContain('>Sessions<');
    for (const d of (block.dates || [])) {
      // fri-upcoming is entirely in the future → every pill is the teal style
      expect(html).toContain(`background:#eef5f5;color:#2a6b6b;border:1px solid #cde0e0;">${d}</span>`);
    }
  });
});
