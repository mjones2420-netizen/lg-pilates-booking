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

// ─── SE-15 — No email fires on Remove From Block (refund > 0) ────────────────
// When Louise removes a client via the RFB modal with sessions attended > 0,
// no Edge Function calls fire. The client email fires later when Louise clicks
// Mark Refunded. Louise no longer receives an admin alert on cancellation.
// ─────────────────────────────────────────────────────────────────────────────

const TEST_EMAIL = 'se15-cancel@test.example';
const TEST_FIRST = 'SE15';
const TEST_LAST  = 'CancelTest';

test.describe('SE-15 — No email fires on Remove From Block (refund > 0)', () => {
  let createdCustomerId = null;

  test.beforeEach(async () => {
    createdCustomerId = null;

    const monCurrent = await getBlockByRole('mon-current');

    const { data: custData, error: custErr } = await sb.rpc('upsert_customer', {
      p_first_name:    TEST_FIRST,
      p_last_name:     TEST_LAST,
      p_email:         TEST_EMAIL,
      p_phone:         '07700000015',
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
  });

  test.afterEach(async () => {
    if (createdCustomerId) {
      await deleteCustomerCascade(createdCustomerId);
    }
  });

  test('no email fires when a client is removed via RFB modal with sessions attended', async ({ page }) => {
    let capturedPayloads = [];
    page.route('**/functions/v1/send-email', async route => {
      const body = route.request().postDataJSON();
      capturedPayloads.push(body);
      await route.fulfill({ status: 200, body: JSON.stringify({ ok: true }) });
    });

    await page.goto(APP_PATH_EMAIL);
    await expect(page.locator('#test-mode-banner')).toHaveClass(/on/);

    await loginAsAdmin(page);

    const btbody = page.locator('#btbody');
    const customerRow = btbody.locator('tr', { hasText: TEST_FIRST + ' ' + TEST_LAST });
    await expect(customerRow).toBeVisible({ timeout: 10000 });

    await customerRow.locator('button', { hasText: 'Remove' }).click();
    await expect(page.locator('#rfb-overlay')).toBeVisible();

    // Step 1 — select 2 sessions attended
    await page.locator('#rfb-overlay').locator('button', { hasText: '2' }).click();
    await page.locator('button[onclick="rfbGoNext()"]').click();

    // Step 2 — confirm removal
    await expect(page.locator('button[onclick="rfbConfirm()"]')).toBeVisible();
    await page.locator('button[onclick="rfbConfirm()"]').click();

    // Step 3 — success
    await expect(page.locator('#rfb-overlay')).toContainText('removed from the block', { timeout: 10000 });

    // Wait a moment to confirm no email fired
    await page.waitForTimeout(1500);
    expect(capturedPayloads).toHaveLength(0);

    await page.locator('#rfb-overlay').locator('button', { hasText: 'Done' }).click();
    await expect(page.locator('#rfb-overlay')).toBeHidden();
  });
});
