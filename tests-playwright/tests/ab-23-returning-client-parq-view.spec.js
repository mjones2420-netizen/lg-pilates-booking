// tests/ab-23-returning-client-parq-view.spec.js
//
// AB (Admin Bookings) — Returning client PAR-Q visible in admin view.
// Covers scenario:
//   AB-23: When a returning client makes a new booking they skip the PAR-Q
//          form, so no parq row is linked to that booking_id. The admin
//          View modal must fall back to the customer's most recent parq row
//          (from their original booking) and display it with a
//          "From previous booking" badge.
//
// Setup:
//   1. Create customer + booking on mon-current, insert parq row (first booking).
//   2. Create second booking on mon-upcoming for same customer (returning, no parq).
//   3. Open admin View modal for the returning booking.
//   4. Assert Health Form section shows parq data + "From previous booking" badge.
//
// Cleanup: afterEach deletes per-run customer cascade.

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { deleteCustomerCascade, getPool } = require('./helpers/admin-db');

const APP_URL = process.env.TEST_APP_URL;

test.describe('AB-23 — Returning client PAR-Q visible in admin view', () => {
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

  test('AB-23 — returning client booking shows PAR-Q from previous booking with badge', async ({ page }) => {
    const email = `ab23-${Date.now()}@test.example`;
    const firstBlock  = await getBlockByRole('mon-current');
    const secondBlock = await getBlockByRole('mon-upcoming');

    // Create customer (new type for first booking)
    const { data: custId, error: custErr } = await sb.rpc('upsert_customer', {
      p_first_name:    'Ab23',
      p_last_name:     'Returning',
      p_email:         email,
      p_phone:         '07700902300',
      p_customer_type: 'new'
    });
    expect(custErr).toBeNull();
    createdCustomerId = custId;

    // First booking + parq (the "original" booking)
    const { data: firstBookingId, error: bookErr1 } = await sb.rpc('book_if_available', {
      p_block_id:    firstBlock.id,
      p_class_id:    firstBlock.class_id,
      p_customer_id: createdCustomerId,
      p_amount_due:  60
    });
    expect(bookErr1).toBeNull();
    expect(firstBookingId).toBeTruthy();

    await getPool().query(
      `INSERT INTO parq (booking_id, customer_id, age, emergency_name, emergency_relationship,
         emergency_phone, q1_heart, q2_circulatory, q3_blood_pressure, q4_chest_pain,
         q5_joint, q6_dizziness, q7_pregnant, q8_doctor_advised, q9_spinal,
         q10_medication, q11_asthma, q12_other_reasons, print_name, sign_date)
       VALUES ($1, $2, '35', 'Jane Returning', 'Spouse', '07700000099',
         'No','No','No','No','No','No','No','No','No','No','No','No',
         'Ab23 Returning', '2026-01-15')`,
      [firstBookingId, createdCustomerId]
    );

    // Resync blocks.booked after direct SQL insert
    await getPool().query(
      `UPDATE blocks SET booked = (SELECT COUNT(*) FROM bookings WHERE block_id = $1 AND status != 'cancelled') WHERE id = $1`,
      [firstBlock.id]
    );

    // Second booking — returning customer, no parq row
    const { data: secondBookingId, error: bookErr2 } = await sb.rpc('book_if_available', {
      p_block_id:    secondBlock.id,
      p_class_id:    secondBlock.class_id,
      p_customer_id: createdCustomerId,
      p_amount_due:  60
    });
    expect(bookErr2).toBeNull();
    expect(secondBookingId).toBeTruthy();

    await getPool().query(
      `UPDATE blocks SET booked = (SELECT COUNT(*) FROM bookings WHERE block_id = $1 AND status != 'cancelled') WHERE id = $1`,
      [secondBlock.id]
    );

    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });
    await loginAsAdmin(page);

    // Find the returning booking row (mon-upcoming block)
    const tbody = page.locator('#btbody');
    await expect(tbody.locator('tr', { hasText: 'Ab23 Returning' }).first()).toBeVisible({ timeout: 10000 });

    // Two rows exist for this customer — click View on the first one (mon-upcoming, no parq row)
    const rows = tbody.locator('tr', { hasText: 'Ab23 Returning' });
    await expect(rows).toHaveCount(2, { timeout: 5000 });
    await rows.first().locator('button', { hasText: 'View' }).click();

    await expect(page.locator('#view-overlay.on')).toBeVisible({ timeout: 5000 });
    const viewBody = page.locator('#view-body');

    // Wait for async PAR-Q load
    await expect(viewBody.locator('.parq-section-title', { hasText: 'Health Form' })).toBeVisible({ timeout: 8000 });

    // PAR-Q data from first booking must be visible
    await expect(viewBody).toContainText('Jane Returning');
    await expect(viewBody).toContainText('Spouse');
    await expect(viewBody).toContainText('07700000099');

    // "From previous booking" badge must be present
    await expect(viewBody).toContainText('From previous booking');

    // No "no health form" message
    await expect(viewBody).not.toContainText('no health form required');
  });
});
