// @ts-check
const { test, expect } = require('@playwright/test');
const { APP_PATH_EMAIL } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { sb } = require('./helpers/supabase');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const {
  deleteCustomerCascade,
  setBookingStatus
} = require('./helpers/admin-db');

// ─── SE-16 — Refund confirmation emails ─────────────────────────────────────
// When Louise marks a cancellation as refunded in the Cancellations tab, both
// the client and Louise receive an email.
// Client (index 0): green "Your refund has been processed" email with breakdown.
// Louise (index 1): slate "Refund processed" alert with client details.
// ─────────────────────────────────────────────────────────────────────────────

const TEST_EMAIL  = 'se16-refund@test.example';
const TEST_FIRST  = 'SE16';
const TEST_LAST   = 'RefundTest';


test.describe('SE-16 — Refund confirmation emails', () => {
  let createdCustomerId = null;
  let adminEmail = null;

  test.beforeEach(async () => {
    createdCustomerId = null;

    const monCurrent = await getBlockByRole('mon-current');

    const { data: custData, error: custErr } = await sb.rpc('upsert_customer', {
      p_first_name:    TEST_FIRST,
      p_last_name:     TEST_LAST,
      p_email:         TEST_EMAIL,
      p_phone:         '07700000016',
      p_customer_type: 'returning'
    });
    expect(custErr).toBeNull();
    createdCustomerId = custData;

    const { data: bookingId, error: bookErr } = await sb.rpc('book_if_available', {
      p_block_id:    monCurrent.id,
      p_class_id:    monCurrent.class_id,
      p_customer_id: createdCustomerId,
      p_amount_due:  60
    });
    expect(bookErr).toBeNull();

    await setBookingStatus(bookingId, 'confirmed');

    // Read admin_email from settings so assertion matches actual DB value
    const { data: settingsData } = await sb.from('settings').select('value').eq('key', 'admin_email').single();
    adminEmail = settingsData?.value || null;
  });

  test.afterEach(async () => {
    if (createdCustomerId) {
      await deleteCustomerCascade(createdCustomerId);
    }
  });

  test('both refund emails fire when Louise marks a cancellation as refunded', async ({ page }) => {
    // ── Register intercept before navigation so RFB calls are also captured ─
    // We reset and re-register after the RFB flow to isolate the refund calls.
    let capturedPayloads = [];
    page.route('**/functions/v1/send-email', async route => {
      const body = route.request().postDataJSON();
      capturedPayloads.push(body);
      await route.fulfill({ status: 200, body: JSON.stringify({ ok: true }) });
    });

    await page.goto(APP_PATH_EMAIL);
    await expect(page.locator('#test-mode-banner')).toHaveClass(/on/);

    await loginAsAdmin(page);

    // ── Drive RFB flow to create a cancellation row ────────────────────────
    const btbody = page.locator('#btbody');
    const customerRow = btbody.locator('tr', { hasText: TEST_FIRST + ' ' + TEST_LAST });
    await expect(customerRow).toBeVisible({ timeout: 10000 });

    await customerRow.locator('button', { hasText: 'Remove' }).click();
    await expect(page.locator('#rfb-overlay')).toBeVisible();

    // Step 1 — select 2 sessions attended
    await page.locator('#rfb-overlay').locator('button', { hasText: '2' }).click();
    await page.locator('button[onclick="rfbGoNext()"]').click();

    // Step 2 — confirm removal (sessions > 0 skips step 1b)
    await expect(page.locator('button[onclick="rfbConfirm()"]')).toBeVisible();
    await page.locator('button[onclick="rfbConfirm()"]').click();

    // Step 3 — wait for success, close modal
    await expect(page.locator('#rfb-overlay')).toContainText('removed from the block', { timeout: 10000 });
    await page.locator('#rfb-overlay').locator('button', { hasText: 'Done' }).click();
    await expect(page.locator('#rfb-overlay')).toBeHidden();

    // ── Reset intercept to capture only the refund-confirmation calls ──────
    // The RFB flow above fired 2 calls (client cancel + admin cancel).
    // Unroute and re-register a fresh handler + Promise.
    await page.unroute('**/functions/v1/send-email');
    capturedPayloads = [];
    const refundCallsPromise = new Promise(resolve => {
      page.route('**/functions/v1/send-email', async route => {
        const body = route.request().postDataJSON();
        capturedPayloads.push(body);
        if (capturedPayloads.length >= 2) resolve();
        await route.fulfill({ status: 200, body: JSON.stringify({ ok: true }) });
      });
    });

    // ── Go to Cancellations tab and click Mark Refunded ────────────────────
    await page.locator('#tab-cancellations').click();
    await expect(page.locator('#tab-cancellations')).toHaveClass(/on/);

    const cancTbody = page.locator('#cancellations-tbody');
    const cancRow = cancTbody.locator('tr', { hasText: TEST_EMAIL }).filter({ has: page.locator('button', { hasText: 'Mark Refunded' }) });
    await expect(cancRow).toBeVisible({ timeout: 10000 });

    page.once('dialog', d => d.accept());
    await cancRow.locator('button', { hasText: 'Mark Refunded' }).click();

    // Wait for both refund email payloads to be captured
    await refundCallsPromise;

    // Toast confirms DB update succeeded
    await expect(page.locator('#toastEl')).toContainText('refunded', { timeout: 5000 });

    // ── Payload assertions ─────────────────────────────────────────────────
    expect(capturedPayloads).toHaveLength(2);

    // Client email (index 0)
    const clientPayload = capturedPayloads[0];
    expect(clientPayload.to).toBe(TEST_EMAIL);
    expect(clientPayload.subject).toMatch(/refund.*processed/i);
    expect(clientPayload.isTest).toBe(true);
    expect(clientPayload.html).toBeTruthy();
    expect(clientPayload.html).toContain(TEST_FIRST);
    expect(clientPayload.html).toContain('Refund paid');
    expect(clientPayload.html).toContain('Sessions attended');

    // Admin email (index 1)
    const adminPayload = capturedPayloads[1];
    expect(adminEmail).toBeTruthy();
    expect(adminPayload.to).toBe(adminEmail);
    expect(adminPayload.subject).toMatch(/refund processed/i);
    expect(adminPayload.subject).toContain(TEST_FIRST);
    expect(adminPayload.subject).toContain(TEST_LAST);
    expect(adminPayload.isTest).toBe(true);
    expect(adminPayload.html).toBeTruthy();
    expect(adminPayload.html).toContain('Refund processed');
    expect(adminPayload.html).toContain(TEST_FIRST);
    expect(adminPayload.html).toContain(TEST_LAST);
    expect(adminPayload.html).toContain(TEST_EMAIL);
    expect(adminPayload.html).toContain('#dashboard');
    expect(adminPayload.html).toContain('Refund amount');
  });
});
