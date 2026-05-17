// tests/ec-06-long-text-in-booking-form.spec.js
//
// EC (Edge Cases) — EC-06: Long text in booking form is handled gracefully
// (HTML maxlength caps input at 50 chars on name fields; the booking flow
// completes without errors; the admin Bookings table row renders without
// layout breakage).
//
// Excel scenario EC-06: "Very long text in booking form"
//   Given: A user enters 100+ characters in the name field
//   When:  They complete the booking
//   Then:  - Handled gracefully — no crash
//          - No layout breakage in admin dashboard rows
//
// Mechanism (front-end):
//   #b-firstname has maxlength="50" (index.html line 480), so the browser
//   physically prevents typing past 50 characters. The fill helper still
//   accepts the long string but the input value is truncated to 50.
//
// Mechanism note (DEVIATION FROM EXCEL):
//   Excel says "100+ characters". With maxlength=50 on the input, the
//   actual cap is 50. This spec fills with a 100-char string to verify the
//   maxlength enforcement, then asserts the stored value is exactly 50 chars.
//   That covers both the "no crash" and "input is bounded" aspects.
//
// Target block: fri-upcoming (standard window, no priority gate, single
// block on Friday so it's always the displayed one).
//
// Self-cleaning: per-run customer with timestamped email tracked in
// createdCustomerId; afterEach calls deleteCustomerCascade.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { sb } = require('./helpers/supabase');
const {
  openBookingModal,
  fillStep1,
  fillStep2Medical,
  fillStep2Emergency,
  agreeAndReserve
} = require('./helpers/booking-flow');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { deleteCustomerCascade } = require('./helpers/admin-db');

const APP_URL = process.env.TEST_APP_URL;

test.describe('EC-06 — Long text in booking form is handled gracefully', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — EC specs require the app to be served.');

  let createdCustomerId = null;

  test.beforeEach(async ({ page }) => {
    createdCustomerId = null;

    await page.goto(APP_PATH);
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test.afterEach(async () => {
    if (createdCustomerId != null) {
      await deleteCustomerCascade(createdCustomerId);
    }
  });

  test('100-char first name is capped at 50 chars by the input, booking completes, admin row renders', async ({ page }) => {
    // 100-character first name — the input's maxlength=50 should truncate
    // this to exactly 50 characters when stored.
    const LONG_NAME = 'A'.repeat(100);
    const EXPECTED_NAME = 'A'.repeat(50);
    const email = `ec06-${Date.now()}@test.example`;

    await openBookingModal(page, 'Friday', 'current');

    // Step 1: fill with the long first name. The browser will enforce
    // maxlength=50 on the input regardless of what fill() supplies.
    await page.locator('#b-firstname').fill(LONG_NAME);
    await page.locator('#b-lastname').fill('LongName');
    await page.locator('#b-email').fill(email);
    await page.locator('#b-phone').fill('07700900006');

    // Assert the input's actual stored value is exactly the cap (50 chars).
    const inputValue = await page.locator('#b-firstname').inputValue();
    expect(inputValue.length, 'b-firstname should be capped at maxlength=50').toBe(50);

    await page.locator('#step-1 .step-btn').click();

    // New-client flow: step 2a, then 2b, then 3.
    await fillStep2Medical(page, { age: 34, printName: EXPECTED_NAME });
    await fillStep2Emergency(page);
    await agreeAndReserve(page);

    // Booking should complete without crashing.
    await expect(page.locator('#success-view.on')).toBeVisible({ timeout: 8000 });

    // Close the success view so its overlay doesn't intercept later clicks
    // (admin login routes through the Dashboard nav button which lives
    // beneath the modal overlay).
    await page.getByRole('button', { name: 'Back to Schedule' }).click();
    await expect(page.locator('#overlay.on')).toBeHidden({ timeout: 3000 });

    // Verify the customer was created with the truncated name.
    const { data: lookup, error: lookupErr } = await sb.rpc('lookup_customer', { p_email: email });
    expect(lookupErr).toBeNull();
    expect(lookup && lookup.length, 'customer must exist post-booking').toBe(1);
    createdCustomerId = lookup[0].id;
    expect(lookup[0].first_name).toBe(EXPECTED_NAME);
    expect(lookup[0].first_name.length).toBe(50);

    // Admin layout check — log in and confirm the row renders in the
    // Bookings table. The Bookings table renders client name (first +
    // last), class, when, block dates, paid, status, actions — it does
    // NOT include the email column. We filter by the unique 50-char
    // first name string + last name, which is enough to identify our
    // row and prove the tbody render didn't crash.
    await loginAsAdmin(page);
    const adminRow = page.locator('#btbody tr').filter({ hasText: `${EXPECTED_NAME} LongName` }).first();
    await expect(adminRow).toBeVisible({ timeout: 10000 });
    await expect(adminRow).toContainText(EXPECTED_NAME);
  });
});
