// ST-22 — Admin card-payment alert email: server-built template content
//
// What this proves:
//   The card_payment_alert email (webhook trigger 5S) — now built server-side
//   by send-email (single source of truth, #53) — has a subject mentioning
//   "card payment", a body showing the client's name and amount, the
//   "via card payment" wording, and — for new clients only — a PAR-Q warning
//   box prompting Louise to review the health form.
//
// Approach (changed in #53):
//   Previously this asserted against a JS COPY of the template. That mirror is
//   gone. This spec now calls the DEPLOYED test send-email directly with
//   { type: 'card_payment_alert', booking_id, isTest: true } and an admin JWT;
//   in test mode the authenticated path echoes the server-built
//   { to, subject, html } back so the assertion runs against real output.
//
// Cleanup:
//   afterEach removes every per-run customer + booking created.

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { getAdminJwt } = require('./helpers/admin-jwt');
const { deleteCustomerCascade } = require('./helpers/admin-db');

const SUPABASE_URL = process.env.TEST_SUPABASE_URL;

test.describe('ST-22 — Server-built card-payment alert content', () => {
  let createdCustomerIds = [];

  test.beforeEach(() => { createdCustomerIds = []; });

  test.afterEach(async () => {
    for (const id of createdCustomerIds) {
      await deleteCustomerCascade(id);
    }
  });

  // Creates a customer of the given type + a booking on fri-upcoming, and
  // returns the new booking id. Registers the customer for afterEach cleanup.
  async function makeBooking(customerType, first) {
    const email = `st22-${customerType}-${Date.now()}@test.example`;
    const { data: custId, error: custErr } = await sb.rpc('upsert_customer', {
      p_first_name: first,
      p_last_name:  'Smith',
      p_email:      email,
      p_phone:      '07700900022',
      p_customer_type: customerType,
    });
    expect(custErr).toBeNull();
    createdCustomerIds.push(custId);

    const block = await getBlockByRole('fri-upcoming');
    const { data: bId, error: bookErr } = await sb.rpc('book_if_available', {
      p_block_id:    block.id,
      p_class_id:    block.class_id,
      p_customer_id: custId,
      p_amount_due:  block.price || 60,
    });
    expect(bookErr).toBeNull();
    return bId;
  }

  async function callAlert(bookingId) {
    const jwt = await getAdminJwt();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ type: 'card_payment_alert', booking_id: bookingId, isTest: true }),
    });
    expect(res.status, 'card_payment_alert must succeed for an admin JWT').toBe(200);
    return res.json();
  }

  test('subject mentions card payment and includes the client name', async () => {
    const bookingId = await makeBooking('returning', 'Stevie');
    const body = await callAlert(bookingId);
    expect(body.subject).toContain('card payment');
    expect(body.subject).toContain('Stevie Smith');
    expect(body.to, 'recipient is the configured admin address').toBeTruthy();
  });

  test('new client: body shows the card-payment wording and a PAR-Q warning box', async () => {
    const bookingId = await makeBooking('new', 'Nadia');
    const body = await callAlert(bookingId);
    expect(body.html).toContain('New booking');
    expect(body.html).toContain('Nadia Smith (New client) has made a new booking via card payment.');
    expect(body.html).toContain('&pound;');
    expect(body.html).toContain('A PAR-Q health form has been submitted with this booking.');
  });

  test('returning client: card-payment wording, no PAR-Q warning box', async () => {
    const bookingId = await makeBooking('returning', 'Rory');
    const body = await callAlert(bookingId);
    expect(body.html).toContain('Rory Smith (Returning client) has made a new booking via card payment.');
    expect(body.html).toContain('&pound;');
    expect(body.html).not.toContain('A PAR-Q health form has been submitted');
  });
});
