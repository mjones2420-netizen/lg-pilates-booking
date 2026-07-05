// SEC-08 — customer-supplied name/email fields are escaped in outgoing emails (#39)
//
// Before the fix, several email builders interpolated firstName/lastName/email
// straight into the HTML with no escaping — a booking name containing HTML
// could distort the email or read as a light phishing attempt. This spec
// proves the fix on every place email HTML is now built:
//
//   1. index.html — sanitise() and the client-side builders that remain there
//      (cancellation + refund emails).
//   2. send-email Edge Function (deployed test project) — the confirmed_booking
//      and card_payment_alert templates, which moved server-side in #53. These
//      are checked against the real deployed output via the test-mode html
//      echo (an admin JWT + isTest returns the server-built html).
//
// The old stripe-webhook JS mirror (helpers/email-templates.js) is gone — the
// confirmed/alert templates now live only in send-email, so they are checked
// server-side here instead of against a copy.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { sb } = require('./helpers/supabase');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { getAdminJwt } = require('./helpers/admin-jwt');
const { deleteCustomerCascade } = require('./helpers/admin-db');

const SUPABASE_URL = process.env.TEST_SUPABASE_URL;
const MALICIOUS_NAME = '<img src=x onerror=alert(1)>';
const MALICIOUS_EMAIL = '"><script>alert(1)</script>';

test.describe('SEC-08 — Email name/email fields are escaped (#39)', () => {

  // --- Client-side builders that remain in index.html ---

  test('index.html sanitise() escapes angle brackets and quotes', async ({ page }) => {
    await page.goto(APP_PATH);
    const out = await page.evaluate((s) => sanitise(s), MALICIOUS_NAME);
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
    expect(out).toContain('&gt;');
  });

  test('index.html buildCancelledAdminEmailHtml escapes firstName, lastName and email', async ({ page }) => {
    await page.goto(APP_PATH);
    const html = await page.evaluate(({ name, email }) => buildCancelledAdminEmailHtml({
      firstName: name, lastName: name, email: email, className: 'Mixed Ability',
      venue: 'Baildon Moravian Church', loc: 'Baildon', day: 'Monday', time: '9:45am',
      endTime: '10:30am', blockDates: [], sessionsAttended: 1, totalSessions: 6,
      pricePerSession: 10, refundAmount: 0, dashboardUrl: ''
    }), { name: MALICIOUS_NAME, email: MALICIOUS_EMAIL });
    expect(html).not.toContain(MALICIOUS_NAME);
    expect(html).not.toContain(MALICIOUS_EMAIL);
    expect(html).toContain('&lt;img');
    expect(html).toContain('&lt;script&gt;');
  });

  test('index.html buildRefundClientEmailHtml escapes firstName', async ({ page }) => {
    await page.goto(APP_PATH);
    const html = await page.evaluate((name) => buildRefundClientEmailHtml({
      firstName: name, className: 'Mixed Ability', venue: 'Baildon Moravian Church',
      loc: 'Baildon', day: 'Monday', time: '9:45am', endTime: '10:30am', blockDates: [], refundAmount: 0
    }), MALICIOUS_NAME);
    expect(html).not.toContain(MALICIOUS_NAME);
    expect(html).toContain('&lt;img');
  });

  test('index.html buildRefundAdminEmailHtml escapes firstName, lastName and email', async ({ page }) => {
    await page.goto(APP_PATH);
    const html = await page.evaluate(({ name, email }) => buildRefundAdminEmailHtml({
      firstName: name, lastName: name, email: email, className: 'Mixed Ability',
      venue: 'Baildon Moravian Church', loc: 'Baildon', day: 'Monday', time: '9:45am',
      endTime: '10:30am', blockDates: [], sessionsAttended: 1, totalSessions: 6,
      pricePerSession: 10, refundAmount: 10, dashboardUrl: ''
    }), { name: MALICIOUS_NAME, email: MALICIOUS_EMAIL });
    expect(html).not.toContain(MALICIOUS_NAME);
    expect(html).not.toContain(MALICIOUS_EMAIL);
    expect(html).toContain('&lt;img');
    expect(html).toContain('&lt;script&gt;');
  });

  // --- Server-side templates (send-email, #53) ---

  test.describe('send-email server templates escape a malicious client name', () => {
    let createdCustomerId = null;
    let bookingId = null;

    test.beforeEach(async () => {
      createdCustomerId = null;
      bookingId = null;
      const { data: custId, error: custErr } = await sb.rpc('upsert_customer', {
        p_first_name: MALICIOUS_NAME,
        p_last_name:  MALICIOUS_NAME,
        p_email:      `sec08-${Date.now()}@test.example`,
        p_phone:      '07700900088',
        p_customer_type: 'new',
      });
      expect(custErr).toBeNull();
      createdCustomerId = custId;

      const block = await getBlockByRole('fri-upcoming');
      const { data: bId, error: bookErr } = await sb.rpc('book_if_available', {
        p_block_id:    block.id,
        p_class_id:    block.class_id,
        p_customer_id: custId,
        p_amount_due:  block.price || 60,
      });
      expect(bookErr).toBeNull();
      bookingId = bId;
    });

    test.afterEach(async () => {
      if (createdCustomerId) await deleteCustomerCascade(createdCustomerId);
    });

    async function serverHtml(type) {
      const jwt = await getAdminJwt();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ type, booking_id: bookingId, isTest: true }),
      });
      expect(res.status).toBe(200);
      return (await res.json()).html;
    }

    test('confirmed_booking escapes the client name', async () => {
      const html = await serverHtml('confirmed_booking');
      expect(html).not.toContain(MALICIOUS_NAME);
      expect(html).toContain('&lt;img');
    });

    test('card_payment_alert escapes the client name', async () => {
      const html = await serverHtml('card_payment_alert');
      expect(html).not.toContain(MALICIOUS_NAME);
      expect(html).toContain('&lt;img');
    });
  });

});
