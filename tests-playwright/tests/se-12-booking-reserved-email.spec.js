// SE-12 — Booking reserved email: Edge Function called with correct payload
//
// What this proves:
//   When a client completes a booking, the send-email Edge Function is called
//   with the client's email address as recipient, the correct subject line,
//   and isTest: true (so no real email is sent in test mode).
//
// Approach:
//   page.route() intercepts the fetch to /functions/v1/send-email and captures
//   the JSON payload. The route then responds with a 200 OK so the booking
//   flow completes normally. Assertions run against the captured payload.
//
//   APP_PATH_EMAIL is used instead of APP_PATH — it omits the ?noemail=1 flag
//   so the email call is not suppressed and the intercept can capture it.
//
// Cleanup:
//   Per-run customer created via UI — deleted in afterEach via deleteCustomerCascade.

const { test, expect } = require('@playwright/test');
const { APP_PATH_EMAIL } = require('./helpers/app-url');
const { deleteCustomerCascade } = require('./helpers/admin-db');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { sb } = require('./helpers/supabase');

test.describe('SE-12 — Booking reserved email fires on reserve', () => {

  let createdCustomerId = null;
  const TS = Date.now();
  const EMAIL = `se12-${TS}@test.example`;
  const FIRST = 'SeTest';
  const LAST  = 'Twelve';

  test.beforeEach(async ({ page }) => {
    createdCustomerId = null;
    await page.goto(APP_PATH_EMAIL);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible();
  });

  test.afterEach(async () => {
    if (createdCustomerId) {
      await deleteCustomerCascade(createdCustomerId);
    }
  });

  test('Edge Function called with correct recipient, subject, and isTest flag', async ({ page }) => {
    const block = await getBlockByRole('fri-upcoming');

    // Intercept the Edge Function call — capture payload, return 200 OK
    let capturedPayload = null;
    await page.route('**/functions/v1/send-email', async route => {
      const body = route.request().postDataJSON();
      capturedPayload = body;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'test-intercepted' }) });
    });

    // Open booking modal for fri-upcoming
    await page.locator('.card').first().waitFor({ state: 'visible', timeout: 10000 });
    await page.evaluate(({ classId, blockId }) => openModal(classId, blockId), { classId: block.class_id, blockId: block.id });
    await expect(page.locator('#overlay.on')).toBeVisible();

    // Step 1 — fill new client details
    await page.locator('#b-firstname').fill(FIRST);
    await page.locator('#b-lastname').fill(LAST);
    await page.locator('#b-email').fill(EMAIL);
    await page.locator('#b-phone').fill('07700900000');
    await page.locator('button[onclick="goStep2()"]').click();

    // Step 2a — PAR-Q (age, health questions, declaration, print name)
    await expect(page.locator('#step-2a')).toBeVisible();
    await page.locator('#b-age').fill('30');
    await page.locator('#b-print-name').fill(FIRST + ' ' + LAST);
    await page.locator('#b-declaration').check();
    await page.locator('button[onclick="goStep2b()"]').click();

    // Step 2b — Emergency contact
    await expect(page.locator('#step-2b')).toBeVisible();
    await page.locator('#b-emergency-name').fill('Test Contact');
    await page.locator('#b-emergency-relationship').fill('Friend');
    await page.locator('#b-emergency-phone').fill('07700900001');
    await page.locator('button[onclick="goStep3()"]').click();

    // Step 3 — T&Cs + Reserve
    await expect(page.locator('#step-3')).toBeVisible({ timeout: 8000 });
    await page.locator('#tcs-agree').check();
    await page.locator('#reserve-btn').click();

    // Wait for success view
    await expect(page.locator('#success-view.on')).toBeVisible({ timeout: 15000 });

    // Assert Edge Function was called with correct payload
    expect(capturedPayload, 'send-email was not called').not.toBeNull();
    expect(capturedPayload.to).toBe(EMAIL);
    expect(capturedPayload.subject).toContain('reserved');
    expect(capturedPayload.isTest).toBe(true);
    expect(capturedPayload.html).toBeTruthy();
    expect(capturedPayload.html).toContain(FIRST);
    expect(capturedPayload.html).toContain('48 hours');

    // Capture customer ID for cleanup
    const lookup = await sb.rpc('lookup_customer', { p_email: EMAIL });
    expect(lookup.error).toBeNull();
    expect(lookup.data).not.toBeNull();
    createdCustomerId = lookup.data[0].id;
  });

});
