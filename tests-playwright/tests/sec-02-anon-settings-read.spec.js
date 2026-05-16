// tests/sec-02-anon-settings-read.spec.js
//
// SEC (Security) — Anon can SELECT the settings table.
// Covers scenario:
//   SEC-02: Bank details visible on payment screen without sign-in
//
// Security framing:
//   The settings table is one of only four tables anon can SELECT (alongside
//   classes, blocks, and parq INSERT). This is intentional — bank details
//   must render on the payment screen for unauthenticated visitors completing
//   a booking. This spec confirms two things:
//
//     1. The anon role can SELECT from settings directly (positive grant)
//     2. The functional consequence: bank details populate inside the
//        booking modal's payment step (#bank-name-1, #bank-sort-1, #bank-acc-1)
//
// What a fail would mean:
//   - If the direct SELECT returns empty: the anon grant on settings has been
//     revoked. Bank details would silently disappear from payment screens
//     for real clients.
//   - If the SELECT works but the modal shows empty bank fields: a front-end
//     regression in populateBankDetails() or the settings fetch on page load.
//
// State management:
//   Neither test in this file calls Reserve, so no customer/booking rows are
//   created. Test 2 navigates as far as Step 3 (payment screen), but
//   upsert_customer only runs inside the Reserve click handler. No afterEach
//   cleanup is needed.

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { APP_PATH } = require('./helpers/app-url');
const {
  openBookingModal,
  fillStep1,
  fillStep2Medical,
  fillStep2Emergency,
  uniqueTestEmail
} = require('./helpers/booking-flow');

const APP_URL = process.env.TEST_APP_URL;

test.describe('SEC-02 — Anon SELECT on settings (bank details on payment screen)', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — SEC specs require the app to be served.');

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.getByText(/Monday|Wednesday|Friday/).first()).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test('SEC-02 — anon can SELECT settings rows directly', async () => {
    // Direct anon-client SELECT — confirms the GRANT, not the page rendering.
    // If this returns null or empty, the anon role has lost SELECT on settings
    // and bank details will silently disappear for real clients.
    const { data, error } = await sb
      .from('settings')
      .select('key,value');

    expect(error, 'anon SELECT on settings should not error').toBeNull();
    expect(data, 'anon SELECT on settings should return rows').toBeTruthy();
    expect(data.length).toBeGreaterThanOrEqual(3);

    const keys = data.map(r => r.key);
    expect(keys).toContain('bank_name');
    expect(keys).toContain('bank_sort_code');
    expect(keys).toContain('bank_account_no');
  });

  test('SEC-02 — bank details render on payment screen for anon user', async ({ page }) => {
    // Drive an anonymous booking flow to the payment step (Step 3) and
    // assert the bank detail spans are populated, NOT empty. This is the
    // functional consequence of the anon SELECT grant.
    //
    // The flow stops short of Reserve so no customer/booking rows are
    // created — upsert_customer only runs inside the Reserve handler.
    const email = uniqueTestEmail(2);
    const firstName = 'Bankcheck';
    const lastName  = 'Anon';

    await openBookingModal(page, 'Monday', 'current');

    await fillStep1(page, { firstName, lastName, email, phone: '07700900700' });

    await expect(page.locator('#step-2a')).toBeVisible({ timeout: 5000 });
    await fillStep2Medical(page, { printName: `${firstName} ${lastName}` });
    await fillStep2Emergency(page);

    await expect(page.locator('#step-3')).toBeVisible();

    // The three bank detail spans inside the payment modal should be populated.
    // populateBankDetails() runs on page load; if settings SELECT failed, these
    // would still be empty when Step 3 renders.
    await expect(page.locator('#bank-name-1')).not.toBeEmpty();
    await expect(page.locator('#bank-sort-1')).not.toBeEmpty();
    await expect(page.locator('#bank-acc-1')).not.toBeEmpty();

    const bankName = (await page.locator('#bank-name-1').textContent()).trim();
    const bankSort = (await page.locator('#bank-sort-1').textContent()).trim();
    const bankAcc  = (await page.locator('#bank-acc-1').textContent()).trim();

    expect(bankName.length).toBeGreaterThan(0);
    expect(bankSort.length).toBeGreaterThan(0);
    expect(bankAcc.length).toBeGreaterThan(0);
  });
});
