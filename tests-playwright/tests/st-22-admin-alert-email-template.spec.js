// ST-22 — Webhook success: admin alert email content (template check)
//
// What this proves:
//   The admin alert email (trigger 5S, sent to admin_email on a successful
//   card payment) has a subject mentioning "card payment", a body showing
//   the client's name and amount paid, and — for new clients only — a PAR-Q
//   warning box prompting Louise to review the health form.
//
// Why this is a template check, not an integration test:
//   Same reasoning as ST-21 — stripe-webhook calls send-email server-to-server,
//   which Playwright cannot intercept. ST-19/20 already prove the webhook
//   completes successfully end-to-end with is_test='true' (routing any real
//   emails to delivered@resend.dev). This spec verifies the template/subject
//   logic in isolation using copies of the functions (see
//   helpers/email-templates.js for the drift warning on these copies).

const { test, expect } = require('@playwright/test');
const { buildAdminAlertEmailHtml, buildAdminAlertSubject } = require('./helpers/email-templates');

const BASE_OPTS = {
  firstName: 'Stevie',
  lastName: 'Smith',
  className: 'Mixed Ability',
  venue: 'Baildon Moravian Church',
  loc: 'Baildon',
  day: 'Monday',
  time: '9:45am',
  endTime: '10:30am',
  blockDates: ['1 Jun', '8 Jun'],
  amountDue: 60,
  dashboardUrl: 'http://localhost:8000/?env=test#dashboard'
};

test.describe('ST-22 — Admin alert email subject and content', () => {
  test('subject mentions card payment and includes client name, class and venue', () => {
    const subject = buildAdminAlertSubject(BASE_OPTS);
    expect(subject).toContain('card payment');
    expect(subject).toContain('Stevie Smith');
    expect(subject).toContain('Monday 9:45am');
    expect(subject).toContain('Baildon Moravian Church');
  });

  test('new client: body shows client name, amount paid, and PAR-Q warning box', () => {
    const html = buildAdminAlertEmailHtml({ ...BASE_OPTS, customerType: 'new' });

    expect(html).toContain('New booking');
    expect(html).toContain('Stevie Smith (New client) has made a new booking via card payment.');
    expect(html).toContain('&pound;60');
    expect(html).toContain('A PAR-Q health form has been submitted with this booking.');
    expect(html).toContain('View full details in the dashboard');
  });

  test('returning client: body shows client name and amount paid, no PAR-Q warning box', () => {
    const html = buildAdminAlertEmailHtml({ ...BASE_OPTS, customerType: 'returning' });

    expect(html).toContain('New booking');
    expect(html).toContain('Stevie Smith (Returning client) has made a new booking via card payment.');
    expect(html).toContain('&pound;60');
    expect(html).not.toContain('A PAR-Q health form has been submitted');
  });

  test('no dashboardUrl: dashboard link is omitted', () => {
    const html = buildAdminAlertEmailHtml({ ...BASE_OPTS, customerType: 'returning', dashboardUrl: '' });
    expect(html).not.toContain('View full details in the dashboard');
  });
});
