// tests/dp-02-new-client-consent-recorded.spec.js
//
// DP (Data Protection) — DP-02: a new-client bank-transfer booking records
// the T&Cs version + time (#91) and the declaration version (#90).
//   Given: a new client books Monday through the UI (bank transfer)
//   Then:  bookings.terms_version = the page's TERMS_VERSION and
//          terms_accepted_at is the DB's time (not the browser's);
//          parq.declaration_version set; health_consent_version / _at stay
//          NULL (the consent box was removed before launch, 23 Oct 2026).
//
// Fixture role: mon-current. Self-cleaning (afterEach).

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const {
  openBookingModal, fillStep1, fillStep2Medical, fillStep2Emergency, agreeAndReserve, uniqueTestEmail
} = require('./helpers/booking-flow');
const {
  deleteCustomerCascade, deleteDataProtectionLog, getCustomerByEmail, getParqByCustomerId, getPool, resetPaymentMode
} = require('./helpers/admin-db');

const APP_URL = process.env.TEST_APP_URL;

test.describe('DP-02 — New client booking records terms and consent', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — DP specs require the app to be served.');

  let createdCustomerId = null;

  test.beforeEach(async ({ page }) => {
    createdCustomerId = null;
    await resetPaymentMode();
    await page.goto(APP_PATH);
    await expect(page.getByText(/Monday|Wednesday|Friday/).first()).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test.afterEach(async () => {
    if (createdCustomerId) {
      await deleteCustomerCascade(createdCustomerId);
      await deleteDataProtectionLog(createdCustomerId);
    }
  });

  test('booking and health form carry version records with server timestamps', async ({ page }) => {
    const email = uniqueTestEmail(902);
    const versions = await page.evaluate(() => ({
      terms: TERMS_VERSION, decl: PARQ_DECLARATION_VERSION
    }));

    await openBookingModal(page, 'Monday', 'current');
    await fillStep1(page, { firstName: 'Terms', lastName: 'Recorder', email, phone: '07700900902' });
    await expect(page.locator('#step-2a')).toBeVisible({ timeout: 5000 });
    await fillStep2Medical(page, { printName: 'Terms Recorder' });
    await fillStep2Emergency(page);
    await agreeAndReserve(page);
    await expect(page.locator('#success-view.on')).toBeVisible({ timeout: 5000 });

    const customer = await getCustomerByEmail(email);
    expect(customer).toBeTruthy();
    createdCustomerId = customer.id;

    const { rows } = await getPool().query(
      `SELECT terms_version, terms_accepted_at,
              abs(extract(epoch FROM (now() - terms_accepted_at))) AS age_s
         FROM bookings WHERE customer_id = $1`, [customer.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].terms_version).toBe(versions.terms);
    expect(Number(rows[0].age_s), 'terms_accepted_at should be the DB clock, within 2 minutes').toBeLessThan(120);

    const parq = await getParqByCustomerId(customer.id);
    expect(parq).not.toBeNull();
    expect(parq.declaration_version).toBe(versions.decl);
    expect(parq.health_consent_version).toBeNull();
    expect(parq.health_consent_at).toBeNull();
    expect(parq.anonymised_at).toBeNull();
  });
});
