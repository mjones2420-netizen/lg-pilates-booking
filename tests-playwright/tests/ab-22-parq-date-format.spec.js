// tests/ab-22-parq-date-format.spec.js
//
// AB (Admin Bookings) — Admin PAR-Q view date format.
// Covers scenario:
//   AB-22: The Declaration section of the booking view modal shows
//          sign_date in "D MMM YYYY" format (e.g. "1 Jun 2026"),
//          NOT the raw ISO format stored in the DB ("2026-06-01").
//
// The app calls formatDateDisplay(p.sign_date) when rendering the view modal,
// which converts YYYY-MM-DD → "D MMM YYYY". This test verifies that
// conversion is applied correctly in the admin view.
//
// Setup: per-run 'new' customer + booking + parq row inserted directly via
// getPool() with a known sign_date. The View modal is opened and the
// Declaration section is asserted.
//
// Cleanup: afterEach deletes per-run customer cascade.

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { deleteCustomerCascade, getPool } = require('./helpers/admin-db');

const APP_URL = process.env.TEST_APP_URL;

test.describe('AB-22 — Admin PAR-Q view date format', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — AB specs require the app to be served.');

  let createdCustomerId = null;

  test.beforeEach(async () => {
    createdCustomerId = null;
  });

  test.afterEach(async () => {
    if (createdCustomerId) {
      await deleteCustomerCascade(createdCustomerId);
    }
  });

  test('AB-22 — Declaration section shows "D MMM YYYY" date, not raw ISO', async ({ page }) => {
    const email = `ab22-${Date.now()}@test.example`;
    const block = await getBlockByRole('mon-current');

    const { data: custId, error: custErr } = await sb.rpc('upsert_customer', {
      p_first_name: 'Ab22',
      p_last_name:  'Dateformat',
      p_email:      email,
      p_phone:      '07700902201',
      p_customer_type: 'new'
    });
    expect(custErr).toBeNull();
    createdCustomerId = custId;

    const { data: bookingId, error: bookErr } = await sb.rpc('book_if_available', {
      p_block_id:    block.id,
      p_class_id:    block.class_id,
      p_customer_id: createdCustomerId,
      p_amount_due:  60
    });
    expect(bookErr).toBeNull();
    expect(bookingId).toBeTruthy();

    // Insert parq with a known fixed sign_date so we can assert the formatted output
    const signDateIso = '2026-06-01';
    // Expected display: formatDateDisplay('2026-06-01') → "1 Jun 2026"
    const expectedDisplay = '1 Jun 2026';

    await getPool().query(
      `INSERT INTO parq (booking_id, customer_id, age, emergency_name, emergency_relationship,
         emergency_phone, q1_heart, q2_circulatory, q3_blood_pressure, q4_chest_pain,
         q5_joint, q6_dizziness, q7_pregnant, q8_doctor_advised, q9_spinal,
         q10_medication, q11_asthma, q12_other_reasons, print_name, sign_date)
       VALUES ($1, $2, '28', 'Em Contact', 'Friend', '07700000001',
         'No','No','No','No','No','No','No','No','No','No','No','No',
         'Ab22 Dateformat', $3)`,
      [bookingId, createdCustomerId, signDateIso]
    );

    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });
    await loginAsAdmin(page);

    const tbody = page.locator('#btbody');
    await expect(tbody.locator('tr', { hasText: 'Ab22 Dateformat' }).first()).toBeVisible({ timeout: 10000 });

    // Open the View modal
    const row = tbody.locator('tr', { hasText: 'Ab22 Dateformat' }).first();
    await row.locator('button', { hasText: 'View' }).click();
    await expect(page.locator('#view-overlay.on')).toBeVisible({ timeout: 5000 });

    const viewBody = page.locator('#view-body');

    // Wait for PAR-Q content to load (async fetch inside viewBooking)
    await expect(viewBody.locator('.parq-section-title', { hasText: 'Declaration' })).toBeVisible({ timeout: 8000 });

    // "Signed by" row
    await expect(viewBody).toContainText('Ab22 Dateformat');

    // Date row: friendly format, NOT raw ISO
    await expect(viewBody).toContainText(expectedDisplay);
    await expect(viewBody).not.toContainText(signDateIso);
  });
});
