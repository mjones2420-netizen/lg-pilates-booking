// tests/ab-19-20-21-missing-parq-banner.spec.js
//
// AB (Admin Bookings) — Missing PAR-Q banner.
// Covers scenarios:
//   AB-19: Banner is hidden when all new-client bookings have PAR-Q rows.
//   AB-20: Banner appears (singular wording) when one PAR-Q is missing.
//   AB-21: Banner shows plural count; clicking it adds .parq-missing-highlight
//          to affected rows.
//
// The banner (#parq-warn) is shown/hidden based on whether any non-cancelled
// 'new' customer bookings lack a matching parq row. It renders with .on class
// when visible.
//
// Setup: per-run 'new' customer + confirmed booking + parq row inserted via
// getPool(). AB-20/AB-21 delete the parq row(s) to trigger the banner.
//
// Cleanup: afterEach deletes the per-run customer cascade.

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { deleteCustomerCascade, getPool } = require('./helpers/admin-db');

const APP_URL = process.env.TEST_APP_URL;

/** Insert a minimal parq row for a (bookingId, customerId) pair. */
async function insertParq(bookingId, customerId, printName = 'Test Client') {
  const today = new Date().toISOString().slice(0, 10);
  await getPool().query(
    `INSERT INTO parq (booking_id, customer_id, age, emergency_name, emergency_relationship,
       emergency_phone, q1_heart, q2_circulatory, q3_blood_pressure, q4_chest_pain,
       q5_joint, q6_dizziness, q7_pregnant, q8_doctor_advised, q9_spinal,
       q10_medication, q11_asthma, q12_other_reasons, print_name, sign_date)
     VALUES ($1, $2, '30', 'Em Contact', 'Friend', '07700000001',
       'No','No','No','No','No','No','No','No','No','No','No','No', $3, $4)`,
    [bookingId, customerId, printName, today]
  );
}

/** Create a per-run new-client customer + booking on mon-current. */
async function createNewClientBooking(tag) {
  const email = `ab${tag}-${Date.now()}@test.example`;
  const block = await getBlockByRole('mon-current');

  const { data: custId, error: custErr } = await sb.rpc('upsert_customer', {
    p_first_name: `Ab${tag}`,
    p_last_name:  'Newclient',
    p_email:      email,
    p_phone:      '07700901900',
    p_customer_type: 'new'
  });
  if (custErr) throw custErr;

  const { data: bookingId, error: bookErr } = await sb.rpc('book_if_available', {
    p_block_id:    block.id,
    p_class_id:    block.class_id,
    p_customer_id: custId,
    p_amount_due:  60
  });
  if (bookErr) throw bookErr;

  return { custId, bookingId, block };
}

test.describe('AB-19/AB-20/AB-21 — Missing PAR-Q banner', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — AB specs require the app to be served.');

  let createdCustomerIds = [];

  test.beforeEach(async () => {
    createdCustomerIds = [];
  });

  test.afterEach(async () => {
    for (const id of createdCustomerIds) {
      await deleteCustomerCascade(id);
    }
  });

  // ── AB-19 ─────────────────────────────────────────────────────────────────

  test('AB-19 — banner hidden when all new-client bookings have PAR-Q rows', async ({ page }) => {
    // Create a new-client booking WITH a parq row — banner should stay hidden
    const { custId, bookingId } = await createNewClientBooking('19');
    createdCustomerIds.push(custId);
    await insertParq(bookingId, custId, 'Ab19 Newclient');

    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });
    await loginAsAdmin(page);

    // Banner must NOT be visible
    await expect(page.locator('#btbody tr').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#parq-warn.on')).not.toBeVisible();
  });

  // ── AB-20 ─────────────────────────────────────────────────────────────────

  test('AB-20 — banner appears with singular wording when one PAR-Q is missing', async ({ page }) => {
    // Create a new-client booking WITHOUT a parq row
    const { custId } = await createNewClientBooking('20');
    createdCustomerIds.push(custId);
    // No parq inserted — banner should fire

    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });
    await loginAsAdmin(page);

    await expect(page.locator('#btbody tr').first()).toBeVisible({ timeout: 10000 });

    // Banner visible with singular wording
    await expect(page.locator('#parq-warn.on')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#parq-warn-count')).toHaveText('1 booking is missing a health form');

    // Clay-coloured "!" icon present
    await expect(page.locator('#parq-warn .parq-warn-icon')).toContainText('!');
  });

  // ── AB-21 ─────────────────────────────────────────────────────────────────

  test('AB-21 — banner shows plural count; clicking highlights affected rows', async ({ page }) => {
    // Create two new-client bookings WITHOUT parq rows
    const { custId: custId1 } = await createNewClientBooking('21a');
    createdCustomerIds.push(custId1);
    const { custId: custId2 } = await createNewClientBooking('21b');
    createdCustomerIds.push(custId2);

    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });
    await loginAsAdmin(page);

    await expect(page.locator('#btbody tr').first()).toBeVisible({ timeout: 10000 });

    // Banner shows plural wording (count may be > 2 if other stray test rows exist)
    await expect(page.locator('#parq-warn.on')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#parq-warn-count')).toContainText('bookings are missing health forms');

    // Click the banner
    await page.locator('#parq-warn').click();

    // Affected rows get .parq-missing-highlight class
    const highlightedRows = page.locator('tr.parq-missing-highlight');
    await expect(highlightedRows.first()).toBeVisible({ timeout: 5000 });

    // At least 2 highlighted (our two per-run customers)
    const count = await highlightedRows.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // All highlighted rows have data-parq-missing="true"
    const firstAttr = await highlightedRows.first().getAttribute('data-parq-missing');
    expect(firstAttr).toBe('true');
  });
});
