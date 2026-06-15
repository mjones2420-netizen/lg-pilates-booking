// ST-21 — Webhook success: client confirmation email content (template check)
//
// What this proves:
//   The client confirmation email template (buildConfirmedEmailHtml) renders
//   a "Sessions" row of date pills — past dates greyed, upcoming dates teal —
//   instead of the old "Block dates" range row, alongside the correct
//   greeting, class, venue, and day/time details.
//
// Why this is a template check, not an integration test:
//   stripe-webhook calls send-email server-to-server when a payment succeeds.
//   Playwright's page.route() can only intercept requests made from the
//   browser page it controls, so it cannot intercept this call. ST-19/20
//   already prove the webhook completes successfully (200, booking
//   confirmed) when this email-sending code path runs, with is_test='true'
//   routing any real emails to delivered@resend.dev. This spec instead
//   verifies the template logic in isolation using a copy of the function
//   (see helpers/email-templates.js for the drift warning on that copy).
//
// Test dates are computed relative to "today" (±10/±20 days) so the
// past/upcoming split remains correct whenever this is run, without relying
// on the test DB fixture.

const { test, expect } = require('@playwright/test');
const { buildConfirmedEmailHtml, formatDDMmm } = require('./helpers/email-templates');

test.describe('ST-21 — Client confirmation email template includes Sessions date pills', () => {
  test('Sessions row shows past dates greyed and upcoming dates teal, with correct booking details', () => {
    const today = new Date();
    const addDays = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return d; };

    const pastDates = [addDays(-20), addDays(-10)].map(formatDDMmm);
    const upcomingDates = [addDays(10), addDays(20)].map(formatDDMmm);

    const html = buildConfirmedEmailHtml({
      firstName: 'Stevie',
      className: 'Mixed Ability',
      venue: 'Baildon Moravian Church',
      loc: 'Baildon',
      day: 'Monday',
      time: '9:45am',
      endTime: '10:30am',
      blockDates: [...pastDates, ...upcomingDates]
    });

    // Greeting + booking details
    expect(html).toContain('Hi Stevie,');
    expect(html).toContain('Mixed Ability');
    expect(html).toContain('Baildon Moravian Church, Baildon');
    expect(html).toContain('Monday, 9:45am');

    // Confirmed banner
    expect(html).toContain('Booking confirmed');
    expect(html).toContain('Payment received');

    // "Sessions" row present, old "Block dates" range row gone
    expect(html).toContain('>Sessions<');
    expect(html).not.toContain('Block dates');

    // Past dates styled grey
    for (const d of pastDates) {
      expect(html).toContain(`background:#f0f0f0;color:#aaaaaa;border:1px solid #dddddd;">${d}</span>`);
    }

    // Upcoming dates styled teal
    for (const d of upcomingDates) {
      expect(html).toContain(`background:#eef5f5;color:#2a6b6b;border:1px solid #cde0e0;">${d}</span>`);
    }
  });
});
