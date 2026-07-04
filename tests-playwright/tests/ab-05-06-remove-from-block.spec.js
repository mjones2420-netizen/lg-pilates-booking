// tests/ab-05-06-remove-from-block.spec.js
//
// AB (Admin Bookings) — Remove from Block flow.
// Covers scenarios:
//   AB-05: Admin can remove a client from a block using the RFB modal
//          (0 sessions attended, not paid → no refund flow).
//   AB-06: After removal, the booking row and parq are deleted from the DB,
//          but the customer record is preserved.
//
// The RFB flow for 0 sessions:
//   Step 1: select sessions attended (0) → Next
//   Step 1b: Has client paid? → click "No — not paid" → Next
//   Step 2: Review summary → Confirm Removal
//   Step 3: Done button (calls closeRfbModal)
//
// Setup: per-run new-client customer + booking created via RPC, then a parq
// row inserted directly via admin-db pool so AB-06 can verify it gets deleted.
//
// Cleanup: afterEach deletes the per-run customer cascade. Safe to call even
// if the booking was already removed by the flow — deleteCustomerCascade
// deletes 0 booking rows and then deletes the customer.

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { deleteCustomerCascade, getPool } = require('./helpers/admin-db');

const APP_URL = process.env.TEST_APP_URL;

test.describe('AB-05/AB-06 — Remove from Block', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — AB specs require the app to be served.');

  let createdCustomerId = null;

  test.beforeEach(async () => {
    createdCustomerId = null;
  });

  test.afterEach(async () => {
    // Safe even when booking already deleted by the flow
    if (createdCustomerId) {
      await deleteCustomerCascade(createdCustomerId);
    }
  });

  test('AB-05/AB-06 — Remove from Block deletes booking + parq, customer survives', async ({ page }) => {
    const email = `ab05-${Date.now()}@test.example`;
    const block = await getBlockByRole('mon-current');

    // #56: capture blocks.booked baseline so we can verify it resyncs back
    // down after the removal (admin_remove_from_block deletes the booking
    // row, which fires trg_sync_block_booked_count same as any DELETE).
    const { rows: bookedBaseline } = await getPool().query(
      `SELECT booked FROM blocks WHERE id = $1`,
      [block.id]
    );
    const initialBooked = bookedBaseline[0].booked;

    // Create per-run customer
    const { data: custId, error: custErr } = await sb.rpc('upsert_customer', {
      p_first_name: 'Ab05',
      p_last_name: 'Removable',
      p_email: email,
      p_phone: '07700900505',
      p_customer_type: 'new'
    });
    expect(custErr, 'upsert_customer should not error').toBeNull();
    createdCustomerId = custId;

    // Create booking — book_if_available inserts as 'reserved'
    const { data: bookingId, error: bookErr } = await sb.rpc('book_if_available', {
      p_block_id: block.id,
      p_class_id: block.class_id,
      p_customer_id: createdCustomerId,
      p_amount_due: block.price || 60
    });
    expect(bookErr, 'book_if_available should not error').toBeNull();
    expect(bookingId).toBeTruthy();

    // Insert a parq row so AB-06 can verify it gets deleted on removal
    const today = new Date().toISOString().slice(0, 10);
    await getPool().query(
      `INSERT INTO parq (booking_id, customer_id, age, emergency_name, emergency_relationship,
         emergency_phone, q1_heart, q2_circulatory, q3_blood_pressure, q4_chest_pain,
         q5_joint, q6_dizziness, q7_pregnant, q8_doctor_advised, q9_spinal,
         q10_medication, q11_asthma, q12_other_reasons, print_name, sign_date)
       VALUES ($1, $2, '30', 'Em Contact', 'Friend', '07700000001',
         'No','No','No','No','No','No','No','No','No','No','No','No',
         'Ab05 Removable', $3)`,
      [bookingId, createdCustomerId, today]
    );

    // Verify parq row exists before removal
    const { rows: parqBefore } = await getPool().query(
      `SELECT id FROM parq WHERE booking_id = $1`,
      [bookingId]
    );
    expect(parqBefore.length, 'parq row should exist before removal').toBe(1);

    // Navigate and log in
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });
    await loginAsAdmin(page);

    const tbody = page.locator('#btbody');
    await expect(tbody.locator('tr', { hasText: 'Ab05 Removable' }).first()).toBeVisible({ timeout: 10000 });

    // Open RFB modal
    const row = tbody.locator('tr', { hasText: 'Ab05 Removable' }).first();
    await row.locator('button', { hasText: 'Remove from Block' }).click();
    await expect(page.locator('#rfb-overlay')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#rfb-sub')).toContainText('Ab05 Removable');

    // Step 1: 0 sessions attended (default) — click Next
    await page.locator('#rfb-footer button', { hasText: 'Next' }).click();

    // Step 1b: Has this client paid? → click "No — not paid"
    await expect(page.locator('#rfb-body')).toContainText('Has this client already paid', { timeout: 3000 });
    await page.locator('#rfb-body button', { hasText: /No.*not paid/i }).click();

    // Next button becomes enabled after selecting a paid option
    await page.locator('#rfb-footer button', { hasText: 'Next' }).click();

    // Step 2: Review — should show "No refund needed"
    await expect(page.locator('#rfb-body')).toContainText('No refund needed', { timeout: 3000 });
    await expect(page.locator('#rfb-body')).toContainText('Ab05 Removable');

    // Confirm Removal
    await page.locator('#rfb-footer button', { hasText: 'Confirm Removal' }).click();

    // Step 3: Success message shown
    await expect(page.locator('#rfb-body')).toContainText('removed from the block', { timeout: 8000 });

    // Close via "Done" button (step 3 footer)
    await page.locator('#rfb-footer button', { hasText: 'Done' }).click();
    await expect(page.locator('#rfb-overlay')).not.toBeVisible({ timeout: 3000 });

    // AB-05: Row no longer appears in the bookings table
    await expect(tbody.locator('tr', { hasText: 'Ab05 Removable' })).toHaveCount(0, { timeout: 8000 });

    // AB-06: Verify parq row deleted in DB
    const { rows: parqAfter } = await getPool().query(
      `SELECT id FROM parq WHERE booking_id = $1`,
      [bookingId]
    );
    expect(parqAfter.length, 'parq row should be deleted after removal').toBe(0);

    // AB-06: Verify customer record still exists
    const { rows: custAfter } = await getPool().query(
      `SELECT id FROM customers WHERE id = $1`,
      [createdCustomerId]
    );
    expect(custAfter.length, 'customer record should survive block removal').toBe(1);

    // #56: blocks.booked resynced back to baseline (orphan-check — proves
    // the RPC's DELETE actually fired the trigger, not just returned success)
    const { rows: blockAfter } = await getPool().query(
      `SELECT booked FROM blocks WHERE id = $1`,
      [block.id]
    );
    expect(blockAfter[0].booked, 'blocks.booked should resync after removal').toBe(initialBooked);

    // #56: cancellations row was written by the admin_remove_from_block RPC
    // (server-side insert now, not the old client-side insert+delete chain)
    const { rows: cancelRows } = await getPool().query(
      `SELECT class_name, venue, sessions_attended FROM cancellations WHERE customer_id = $1`,
      [createdCustomerId]
    );
    expect(cancelRows.length, 'cancellations row should be written by the RPC').toBe(1);
    expect(cancelRows[0].sessions_attended).toBe(0);
  });
});
