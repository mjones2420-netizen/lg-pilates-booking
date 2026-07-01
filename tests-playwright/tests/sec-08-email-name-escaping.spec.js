// SEC-08 — customer-supplied name/email fields are escaped in outgoing emails (#39)
//
// Before the fix, several email builders interpolated firstName/lastName/email
// straight into the HTML with no escaping — a booking name containing HTML
// could distort the email or read as a light phishing attempt. This spec
// proves the fix on both copies of the templates:
//
//   1. index.html — sanitise() and the client-side email builders
//   2. stripe-webhook (test project deployment) — via the JS mirror in
//      helpers/email-templates.js, which was updated alongside the deployed
//      function in the same fix (see file's drift warning).
//
// This is a template check, not an end-to-end delivery test — same reasoning
// as ST-21/ST-22.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { buildConfirmedEmailHtml, buildAdminAlertEmailHtml } = require('./helpers/email-templates');

const MALICIOUS_NAME = '<img src=x onerror=alert(1)>';
const MALICIOUS_EMAIL = '"><script>alert(1)</script>';

test.describe('SEC-08 — Email name/email fields are escaped (#39)', () => {

  test('index.html sanitise() escapes angle brackets and quotes', async ({ page }) => {
    await page.goto(APP_PATH);
    const out = await page.evaluate((s) => sanitise(s), MALICIOUS_NAME);
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
    expect(out).toContain('&gt;');
  });

  test('index.html buildConfirmedEmailHtml escapes firstName', async ({ page }) => {
    await page.goto(APP_PATH);
    const html = await page.evaluate((name) => buildConfirmedEmailHtml({
      firstName: name, className: 'Mixed Ability', venue: 'Baildon Moravian Church',
      loc: 'Baildon', day: 'Monday', time: '9:45am', endTime: '10:30am', blockDates: []
    }), MALICIOUS_NAME);
    expect(html).not.toContain(MALICIOUS_NAME);
    expect(html).toContain('&lt;img');
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

  test('stripe-webhook mirror: buildConfirmedEmailHtml escapes firstName', () => {
    const html = buildConfirmedEmailHtml({
      firstName: MALICIOUS_NAME, className: 'Mixed Ability', venue: 'Baildon Moravian Church',
      loc: 'Baildon', day: 'Monday', time: '9:45am', endTime: '10:30am', blockDates: []
    });
    expect(html).not.toContain(MALICIOUS_NAME);
    expect(html).toContain('&lt;img');
  });

  test('stripe-webhook mirror: buildAdminAlertEmailHtml escapes firstName and lastName', () => {
    const html = buildAdminAlertEmailHtml({
      firstName: MALICIOUS_NAME, lastName: MALICIOUS_NAME, className: 'Mixed Ability',
      venue: 'Baildon Moravian Church', loc: 'Baildon', day: 'Monday', time: '9:45am',
      endTime: '10:30am', blockDates: [], amountDue: 60, customerType: 'new', dashboardUrl: ''
    });
    expect(html).not.toContain(MALICIOUS_NAME);
    expect(html).toContain('&lt;img');
  });

});
