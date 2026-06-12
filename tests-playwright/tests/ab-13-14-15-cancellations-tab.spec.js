// tests/ab-13-14-15-cancellations-tab.spec.js
//
// AB (Admin Bookings) — Cancellations tab and Mark Refunded flow.
// Covers scenarios:
//   AB-13: Cancellation record appears in table after removal (newest first).
//   AB-14: "Mark Refunded" button appears only for records with refund owed.
//   AB-15: Clicking "Mark Refunded" updates the record: button disappears,
//          amount turns green, "Refunded" label appears, DB updated.
//
// Setup: per-run customer removed via full RFB flow to produce a real
// cancellations row. AB-13 uses a zero-refund removal (not paid).
// AB-14/AB-15 use a paid removal to produce a refund_amount > 0 record.
//
// Cleanup: afterEach deletes the per-run customer cascade.
// Note: cancellations rows are NOT deleted by deleteCustomerCascade (they are
// denormalised audit records). The tests scope assertions to createdCustomerId
// so leftover rows from other tests don't interfere.

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { deleteCustomerCascade, setBookingStatus, getPool } = require('./helpers/admin-db');

const APP_URL = process.env.TEST_APP_URL;

/** Helper: run the RFB flow to completion, producing a cancellations row.
 *  opts.paid: true → select "Yes — paid", false → select "No — not paid"
 *  opts.sessions: number > 0 → select that session count (skips Step 1b)
 *  Default: 0 sessions, not paid → £0 refund.
 */
async function runRfbFlow(page, clientName, opts = {}) {
  const { paid = false, sessions = 0 } = opts;

  const tbody = page.locator('#btbody');
  await expect(tbody.locator('tr', { hasText: clientName }).first()).toBeVisible({ timeout: 10000 });
  const row = tbody.locator('tr', { hasText: clientName }).first();
  await row.locator('button', { hasText: 'Remove from Block' }).click();
  await expect(page.locator('#rfb-overlay')).toBeVisible({ timeout: 5000 });

  if (sessions > 0) {
    await page.locator('#rfb-body button', { hasText: String(sessions) }).click();
    await page.locator('#rfb-footer button', { hasText: 'Next' }).click();
  } else {
    // 0 sessions → Step 1b
    await page.locator('#rfb-footer button', { hasText: 'Next' }).click();
    await expect(page.locator('#rfb-body')).toContainText('Has this client already paid', { timeout: 3000 });
    if (paid) {
      await page.locator('#rfb-body button', { hasText: /Yes.*paid/i }).click();
    } else {
      await page.locator('#rfb-body button', { hasText: /No.*not paid/i }).click();
    }
    await page.locator('#rfb-footer button', { hasText: 'Next' }).click();
  }

  await expect(page.locator('#rfb-footer button', { hasText: 'Confirm Removal' })).toBeVisible({ timeout: 3000 });
  await page.locator('#rfb-footer button', { hasText: 'Confirm Removal' }).click();
  await expect(page.locator('#rfb-body')).toContainText('removed from the block', { timeout: 8000 });
  await page.locator('#rfb-footer button', { hasText: 'Done' }).click();
  await expect(page.locator('#rfb-overlay')).not.toBeVisible({ timeout: 3000 });
}

test.describe('AB-13/AB-14/AB-15 — Cancellations tab', () => {
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

  // ── AB-13 ─────────────────────────────────────────────────────────────────

  test('AB-13 — cancellation record appears in Cancellations tab after removal', async ({ page }) => {
    const email = `ab13-${Date.now()}@test.example`;
    const block = await getBlockByRole('fri-upcoming');

    const { data: custId, error: custErr } = await sb.rpc('upsert_customer', {
      p_first_name: 'Ab13',
      p_last_name:  'Cancelled',
      p_email:      email,
      p_phone:      '07700901301',
      p_customer_type: 'returning'
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

    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });
    await loginAsAdmin(page);

    // Run RFB: 0 sessions, not paid → £0 refund
    await runRfbFlow(page, 'Ab13 Cancelled', { paid: false, sessions: 0 });

    // Switch to Cancellations tab
    await page.locator('#dbnav-cancellations').click();
    await expect(page.locator('#dbnav-cancellations.on')).toBeVisible();

    const ctbody = page.locator('#cancellations-tbody');
    // Wait for the table to render (not loading state)
    await expect(ctbody.locator('tr', { hasText: 'Ab13 Cancelled' }).first()).toBeVisible({ timeout: 8000 });

    // The record should be the most recent — first row in tbody
    const firstRow = ctbody.locator('tr').first();
    await expect(firstRow).toContainText('Ab13 Cancelled');

    // Verify columns: Client, Class & Venue, Block Dates, Sessions Attended, Refund, Removed On, Actions
    const headerRow = page.locator('#cancellations-tbody').locator('xpath=ancestor::table[1]').locator('thead tr th');
    await expect(headerRow).toHaveCount(7);
  });

  // ── AB-14 ─────────────────────────────────────────────────────────────────

  test('AB-14 — Mark Refunded button present for owed refunds, absent for zero refunds', async ({ page }) => {
    const email = `ab14-${Date.now()}@test.example`;
    const block = await getBlockByRole('fri-upcoming');

    const { data: custId, error: custErr } = await sb.rpc('upsert_customer', {
      p_first_name: 'Ab14',
      p_last_name:  'Refundable',
      p_email:      email,
      p_phone:      '07700901401',
      p_customer_type: 'returning'
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
    await setBookingStatus(bookingId, 'confirmed');

    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });
    await loginAsAdmin(page);

    // Run RFB: 0 sessions, paid → £60 refund
    await runRfbFlow(page, 'Ab14 Refundable', { paid: true, sessions: 0 });

    await page.locator('#dbnav-cancellations').click();
    await expect(page.locator('#dbnav-cancellations.on')).toBeVisible();

    const ctbody = page.locator('#cancellations-tbody');
    await expect(ctbody.locator('tr', { hasText: 'Ab14 Refundable' }).first()).toBeVisible({ timeout: 8000 });

    const refundRow = ctbody.locator('tr', { hasText: 'Ab14 Refundable' }).first();

    // "Mark Refunded" button should be present (refund_amount > 0, not yet refunded)
    await expect(refundRow.locator('button', { hasText: 'Mark Refunded' })).toBeVisible();
  });

  // ── AB-15 ─────────────────────────────────────────────────────────────────

  test('AB-15 — Mark Refunded: button disappears, amount turns green, DB updated', async ({ page }) => {
    const email = `ab15-${Date.now()}@test.example`;
    const block = await getBlockByRole('fri-upcoming');

    const { data: custId, error: custErr } = await sb.rpc('upsert_customer', {
      p_first_name: 'Ab15',
      p_last_name:  'Markrefund',
      p_email:      email,
      p_phone:      '07700901501',
      p_customer_type: 'returning'
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
    await setBookingStatus(bookingId, 'confirmed');

    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });
    await loginAsAdmin(page);

    // Run RFB: 0 sessions, paid → £60 refund
    await runRfbFlow(page, 'Ab15 Markrefund', { paid: true, sessions: 0 });

    await page.locator('#dbnav-cancellations').click();
    await expect(page.locator('#dbnav-cancellations.on')).toBeVisible();

    const ctbody = page.locator('#cancellations-tbody');
    await expect(ctbody.locator('tr', { hasText: 'Ab15 Markrefund' }).first()).toBeVisible({ timeout: 8000 });

    const refundRow = ctbody.locator('tr', { hasText: 'Ab15 Markrefund' }).first();
    const markBtn = refundRow.locator('button', { hasText: 'Mark Refunded' });
    await expect(markBtn).toBeVisible();

    // Click Mark Refunded — requires window.confirm acceptance
    page.once('dialog', d => d.accept());
    await markBtn.click();

    // Button disappears after marking
    await expect(markBtn).not.toBeVisible({ timeout: 8000 });

    // Refund amount is now green (colour changes from clay to green)
    const refundCell = refundRow.locator('td').nth(4);
    await expect(refundCell.locator('span').first()).toHaveCSS('color', 'rgb(58, 138, 106)');

    // "Refunded" label appears
    await expect(refundCell).toContainText('Refunded');

    // DB: refunded = true, refunded_at populated
    const { rows } = await getPool().query(
      `SELECT refunded, refunded_at FROM cancellations WHERE customer_id = $1 ORDER BY id DESC LIMIT 1`,
      [createdCustomerId]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].refunded).toBe(true);
    expect(rows[0].refunded_at).not.toBeNull();
  });
});
