// SE-15 — Cancellation emails (trigger #3)
// When Louise removes a client via the RFB modal, two Edge Function calls fire:
//   index 0 — client cancellation email
//   index 1 — Louise admin alert
// This spec drives the RFB flow with 2 sessions attended (refund > £0) and
// asserts both payloads are correct.

const { test, expect } = require('@playwright/test');
const { APP_PATH_EMAIL } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { sb } = require('./helpers/supabase');
const { deleteCustomerCascade, getPool } = require('./helpers/admin-db');

const TEST_EMAIL = 'se15-cancel@test.example';
const TEST_FIRST = 'Se15';
const TEST_LAST  = 'Cancel';

test.describe('SE-15 — Cancellation emails fired on Remove From Block', () => {
  let createdCustomerId = null;
  let createdBookingId  = null;
  let adminEmail        = null;
  let monCurrentBlock   = null;

  test.beforeEach(async () => {
    createdCustomerId = null;
    createdBookingId  = null;

    monCurrentBlock = await getBlockByRole('mon-current');

    // Read admin_email from settings so we can assert the recipient
    const { data } = await sb.from('settings').select('value').eq('key', 'admin_email').single();
    adminEmail = data ? data.value : null;

    // Create per-run customer
    const { data: custData, error: custErr } = await sb.rpc('upsert_customer', {
      p_first_name:    TEST_FIRST,
      p_last_name:     TEST_LAST,
      p_email:         TEST_EMAIL,
      p_phone:         '07700900015',
      p_customer_type: 'returning'
    });
    if (custErr) throw custErr;
    createdCustomerId = custData;

    // Create reserved booking on mon-current
    const { data: bookData, error: bookErr } = await sb.rpc('book_if_available', {
      p_block_id:    monCurrentBlock.id,
      p_class_id:    monCurrentBlock.class_id,
      p_customer_id: createdCustomerId,
      p_amount_due:  monCurrentBlock.price || 60
    });
    if (bookErr) throw bookErr;
    createdBookingId = bookData;

    // Set status to confirmed so the booking appears in the dashboard table
    const pool = getPool();
    await pool.query(
      `UPDATE bookings SET status = 'confirmed' WHERE id = $1`,
      [createdBookingId]
    );
  });

  test.afterEach(async () => {
    if (createdCustomerId) {
      await deleteCustomerCascade(createdCustomerId);
    }
  });

  test('client and Louise both receive cancellation emails when RFB modal is confirmed', async ({ page }) => {
    // Collect all Edge Function calls in order
    const capturedPayloads = [];
    let resolveSecondCall;
    const secondCallPromise = new Promise(resolve => { resolveSecondCall = resolve; });

    await page.route('**/functions/v1/send-email', async route => {
      const body = JSON.parse(route.request().postData() || '{}');
      capturedPayloads.push(body);
      if (capturedPayloads.length >= 2) resolveSecondCall();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'test-intercepted' }) });
    });

    // Navigate and log in
    await page.goto(APP_PATH_EMAIL);
    await expect(page.locator('#test-mode-banner')).toHaveClass(/on/);
    await loginAsAdmin(page);

    // Find the test customer row in the bookings table and open RFB modal
    const row = page.locator('#btbody tr', { hasText: `${TEST_FIRST} ${TEST_LAST}` });
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.locator('button', { hasText: 'Remove' }).click();

    // RFB Step 1 — select 2 sessions attended
    await expect(page.locator('#rfb-overlay')).toBeVisible();
    // Click the "2" sessions button
    await page.locator('#rfb-overlay button', { hasText: '2' }).click();
    await page.locator('#rfb-overlay button', { hasText: 'Next' }).click();

    // Step 2 — review screen (sessions > 0 skips Step 1b)
    await expect(page.locator('#rfb-overlay')).toContainText('Confirm Removal');
    await page.locator('#rfb-overlay button', { hasText: 'Confirm Removal' }).click();

    // Step 3 — success
    await expect(page.locator('#rfb-overlay')).toContainText('removed from the block', { timeout: 10000 });

    // Wait for both Edge Function calls to be intercepted
    await secondCallPromise;

    // ── Client email (index 0) ───────────────────────────────────────────────
    const clientPayload = capturedPayloads[0];
    expect(clientPayload.to).toBe(TEST_EMAIL);
    expect(clientPayload.subject).toContain('cancelled');
    expect(clientPayload.subject).toContain('Monday');
    expect(clientPayload.isTest).toBe(true);
    expect(clientPayload.html).toBeTruthy();
    expect(clientPayload.html).toContain(TEST_FIRST);
    // Refund breakdown present (2 sessions attended out of total, price per session)
    expect(clientPayload.html).toContain('Sessions attended');
    expect(clientPayload.html).toContain('Refund due');
    // No-refund copy must NOT appear
    expect(clientPayload.html).not.toContain('payment had not yet been received');

    // ── Louise admin alert (index 1) ─────────────────────────────────────────
    const adminPayload = capturedPayloads[1];
    if (adminEmail) {
      expect(adminPayload.to).toBe(adminEmail);
    }
    expect(adminPayload.subject).toContain('cancelled');
    expect(adminPayload.subject).toContain(TEST_FIRST);
    expect(adminPayload.subject).toContain(TEST_LAST);
    expect(adminPayload.isTest).toBe(true);
    expect(adminPayload.html).toBeTruthy();
    expect(adminPayload.html).toContain('Booking cancelled');
    expect(adminPayload.html).toContain(TEST_FIRST);
    expect(adminPayload.html).toContain(TEST_LAST);
    expect(adminPayload.html).toContain(TEST_EMAIL);
    expect(adminPayload.html).toContain('#dashboard');
    // Refund amount present in admin email
    expect(adminPayload.html).toContain('Refund amount');

    // Close modal
    await page.locator('#rfb-overlay button', { hasText: 'Done' }).click();
  });
});
