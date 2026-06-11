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
// When Louise marks a cancellation as refunded in the Cancellations tab, two
// Edge Function calls fire:
// Client (index 0): red banner (cancellation notice) + green refund box.
// Louise (index 1): slate "Refund processed" alert with client details.
// ─────────────────────────────────────────────────────────────────────────────

const TEST_EMAIL  = 'se16-refund@test.example';
const TEST_FIRST  = 'SE16';
const TEST_LAST   = 'RefundTest';

test.describe('SE-16 — Refund confirmation emails', () => {
  let createdCustomerId = null;
  let adminEmail        = null;

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

    const { data: settingsData } = await sb.from('settings').select('value').eq('key', 'admin_email').single();
    adminEmail = settingsData?.value || null;
  });

  test.afterEach(async () => {
    if (createdCustomerId) {
      await deleteCustomerCascade(createdCustomerId);
    }
  });

  test('both refund emails fire when Louise marks a cancellation as refunded', async ({ page }) => {
    // Register initial intercept — will capture RFB cancellation call too
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

    await page.locator('#rfb-overlay').locator('button', { hasText: '2' }).click();
    await page.locator('button[onclick="rfbGoNext()"]').click();

    await expect(page.locator('button[onclick="rfbConfirm()"]')).toBeVisible();
    await page.locator('button[onclick="rfbConfirm()"]').click();

    await expect(page.locator('#rfb-overlay')).toContainText('removed from the block', { timeout: 10000 });
    await page.locator('#rfb-overlay').locator('button', { hasText: 'Done' }).click();
    await expect(page.locator('#rfb-overlay')).toBeHidden();

    // ── Reset intercept — RFB fired 1 call (admin cancel alert).
    // Re-register so only the 2 refund-confirmation calls are captured. ─────
    capturedPayloads = [];
    let refundCallsResolveFn;
    const refundCallsPromise = new Promise(resolve => { refundCallsResolveFn = resolve; });
    await page.unroute('**/functions/v1/send-email');
    await page.route('**/functions/v1/send-email', async route => {
      const body = route.request().postDataJSON();
      capturedPayloads.push(body);
      if (capturedPayloads.length >= 2) refundCallsResolveFn();
      await route.fulfill({ status: 200, body: JSON.stringify({ ok: true }) });
    });

    // ── Go to Cancellations tab and click Mark Refunded ────────────────────
    await page.locator('#tab-cancellations').click();
    await expect(page.locator('#tab-cancellations')).toHaveClass(/on/);

    const cancTbody = page.locator('#cancellations-tbody');
    const cancRow = cancTbody.locator('tr', { hasText: TEST_EMAIL })
      .filter({ has: page.locator('button', { hasText: 'Mark Refunded' }) });
    await expect(cancRow).toBeVisible({ timeout: 10000 });

    page.once('dialog', d => d.accept());
    await cancRow.locator('button', { hasText: 'Mark Refunded' }).click();

    await refundCallsPromise;

    await expect(page.locator('#toastEl')).toContainText('refunded', { timeout: 5000 });

    // ── Payload assertions ─────────────────────────────────────────────────
    expect(capturedPayloads).toHaveLength(2);

    // Client email (index 0) — red banner + green refund box
    const clientPayload = capturedPayloads[0];
    expect(clientPayload.to).toBe(TEST_EMAIL);
    expect(clientPayload.subject).toMatch(/refund.*processed/i);
    expect(clientPayload.isTest).toBe(true);
    expect(clientPayload.html).toBeTruthy();
    expect(clientPayload.html).toContain("you've been removed from this block");
    expect(clientPayload.html).toContain('has been processed');
    expect(clientPayload.html).toContain('3');
    expect(clientPayload.html).toContain('working days');

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
