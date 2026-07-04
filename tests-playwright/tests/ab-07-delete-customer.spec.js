// tests/ab-07-delete-customer.spec.js
//
// AB (Admin Bookings) — Permanently Delete Customer.
// Covers scenario:
//   AB-07: Clicking "Del Customer" triggers a window.confirm dialog. On
//          acceptance, the customer record and ALL their bookings (+ parq)
//          are removed from the DB. The row disappears from the bookings table.
//
// deleteCustomer() calls window.confirm — Playwright handles this via
// page.on('dialog', d => d.accept()) registered BEFORE the button click.
//
// Setup: per-run customer + booking + parq row created via RPC + direct pg.
// deleteCustomer() calls the admin_delete_customer RPC (#56, migration 21) —
// one transaction, not the old client-side delete chain — so we verify the
// DB state directly after the flow completes rather than relying on the
// deleteCustomerCascade test helper.
//
// Cleanup: afterEach calls deleteCustomerCascade as a safety net in case
// the test fails before the in-app deletion completes. Idempotent — if the
// customer was already deleted, it simply deletes 0 rows.

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { deleteCustomerCascade, getPool } = require('./helpers/admin-db');

const APP_URL = process.env.TEST_APP_URL;

test.describe('AB-07 — Permanently Delete Customer', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — AB specs require the app to be served.');

  let createdCustomerId = null;

  test.beforeEach(async () => {
    createdCustomerId = null;
  });

  test.afterEach(async () => {
    // Safety net — no-op if already deleted by the in-app flow
    if (createdCustomerId) {
      await deleteCustomerCascade(createdCustomerId);
    }
  });

  test('AB-07 — Del Customer removes customer, booking, and parq from DB', async ({ page }) => {
    const email = `ab07-${Date.now()}@test.example`;
    const block = await getBlockByRole('mon-current');

    // #56: capture blocks.booked baseline to verify resync after deletion
    const { rows: bookedBaseline } = await getPool().query(
      `SELECT booked FROM blocks WHERE id = $1`,
      [block.id]
    );
    const initialBooked = bookedBaseline[0].booked;

    // Create per-run customer
    const { data: custId, error: custErr } = await sb.rpc('upsert_customer', {
      p_first_name: 'Ab07',
      p_last_name: 'Deletable',
      p_email: email,
      p_phone: '07700900707',
      p_customer_type: 'new'
    });
    expect(custErr, 'upsert_customer should not error').toBeNull();
    createdCustomerId = custId;

    // Create booking
    const { data: bookingId, error: bookErr } = await sb.rpc('book_if_available', {
      p_block_id: block.id,
      p_class_id: block.class_id,
      p_customer_id: createdCustomerId,
      p_amount_due: block.price || 60
    });
    expect(bookErr, 'book_if_available should not error').toBeNull();
    expect(bookingId).toBeTruthy();

    // Insert parq row
    const today = new Date().toISOString().slice(0, 10);
    await getPool().query(
      `INSERT INTO parq (booking_id, customer_id, age, emergency_name, emergency_relationship,
         emergency_phone, q1_heart, q2_circulatory, q3_blood_pressure, q4_chest_pain,
         q5_joint, q6_dizziness, q7_pregnant, q8_doctor_advised, q9_spinal,
         q10_medication, q11_asthma, q12_other_reasons, print_name, sign_date)
       VALUES ($1, $2, '25', 'Contact Person', 'Sibling', '07700000002',
         'No','No','No','No','No','No','No','No','No','No','No','No',
         'Ab07 Deletable', $3)`,
      [bookingId, createdCustomerId, today]
    );

    // Navigate and log in
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });
    await loginAsAdmin(page);

    const tbody = page.locator('#btbody');
    await expect(tbody.locator('tr', { hasText: 'Ab07 Deletable' }).first()).toBeVisible({ timeout: 10000 });

    // Register dialog handler BEFORE clicking — must be set up before the dialog fires
    page.once('dialog', dialog => dialog.accept());

    // Click Del Customer
    const row = tbody.locator('tr', { hasText: 'Ab07 Deletable' }).first();
    await row.locator('button', { hasText: 'Del Customer' }).click();

    // Wait for the toast confirming deletion
    await expect(page.locator('#toastEl.on')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('#toastEl')).toContainText('Customer deleted');

    // Row should be gone from the table
    await expect(tbody.locator('tr', { hasText: 'Ab07 Deletable' })).toHaveCount(0, { timeout: 8000 });

    // Verify customer deleted from DB
    const { rows: custRows } = await getPool().query(
      `SELECT id FROM customers WHERE id = $1`,
      [createdCustomerId]
    );
    expect(custRows.length, 'customer should be deleted from DB').toBe(0);

    // Verify booking deleted
    const { rows: bookingRows } = await getPool().query(
      `SELECT id FROM bookings WHERE id = $1`,
      [bookingId]
    );
    expect(bookingRows.length, 'booking should be deleted from DB').toBe(0);

    // Verify parq deleted (parq.booking_id FK is ON DELETE CASCADE, but app also explicitly deletes)
    const { rows: parqRows } = await getPool().query(
      `SELECT id FROM parq WHERE customer_id = $1`,
      [createdCustomerId]
    );
    expect(parqRows.length, 'parq should be deleted from DB').toBe(0);

    // #56: blocks.booked resynced back to baseline (orphan-check — proves
    // the RPC's bookings DELETE actually fired the trigger)
    const { rows: blockAfter } = await getPool().query(
      `SELECT booked FROM blocks WHERE id = $1`,
      [block.id]
    );
    expect(blockAfter[0].booked, 'blocks.booked should resync after customer deletion').toBe(initialBooked);

    // Customer deleted — afterEach safety net will find 0 rows and exit cleanly
  });
});
