// SE-14 — New booking admin alert email — Edge Function called on reserve
// Verifies that when a client completes a booking, the send-email Edge Function
// is called a second time with Louise's admin email as recipient, the correct
// subject, isTest: true, and HTML containing "New booking" and the client name.
// For new clients, also asserts the PAR-Q flag text is present.

const { test, expect } = require('@playwright/test');
const { APP_PATH_EMAIL } = require('./helpers/app-url');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { deleteCustomerCascade, deleteBookingsForCustomerOnBlock } = require('./helpers/admin-db');
const { sb } = require('./helpers/supabase');

// SE-14 uses APP_PATH_EMAIL (no ?noemail=1) so the email call is not suppressed.
// page.route() intercepts ALL calls to the Edge Function URL and captures each
// payload in order: call[0] = client reserved email, call[1] = admin alert.

const TEST_EMAIL = 'se14-new@test.example';
const TEST_FIRST = 'SeNew';
const TEST_LAST  = 'Fourteen';

test.describe('SE-14 — New booking admin alert email', () => {
  const createdCustomerIds = [];

  test.beforeEach(async () => {
    createdCustomerIds.length = 0;
  });

  test.afterEach(async () => {
    for (const id of createdCustomerIds) {
      await deleteCustomerCascade(id);
    }
    createdCustomerIds.length = 0;
  });

  test('Admin alert email sent on new-client reserve — correct payload and PAR-Q flag', async ({ page }) => {
    const block = await getBlockByRole('fri-upcoming');

    // Capture ALL Edge Function calls in order
    const capturedPayloads = [];
    await page.route('**/functions/v1/send-email', async route => {
      const body = route.request().postDataJSON();
      capturedPayloads.push(body);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'test-ok' }) });
    });

    // Promise that resolves when the second call (admin alert) is captured
    const adminEmailPromise = new Promise(resolve => {
      const interval = setInterval(() => {
        if (capturedPayloads.length >= 2) {
          clearInterval(interval);
          resolve(capturedPayloads[1]);
        }
      }, 100);
    });

    await page.goto(APP_PATH_EMAIL);
    await expect(page.locator('#test-mode-banner')).toHaveClass(/on/);

    // Open booking modal for fri-upcoming
    await page.locator('.card').first().waitFor({ state: 'visible', timeout: 10000 });
    await page.evaluate(({ classId, blockId }) => openModal(classId, blockId), {
      classId: block.class_id,
      blockId:  block.id
    });
    await expect(page.locator('#overlay')).toHaveClass(/on/);

    // Step 1 — fill new client details
    await page.fill('#b-firstname', TEST_FIRST);
    await page.fill('#b-lastname',  TEST_LAST);
    await page.fill('#b-email',     TEST_EMAIL);
    await page.fill('#b-phone',     '07700900014');
    await page.locator('button[onclick="goStep2()"]').click();

    // Step 2a — PAR-Q (age, print name, declaration — questions default to No)
    await page.fill('#b-age', '30');
    await page.fill('#b-print-name', TEST_FIRST + ' ' + TEST_LAST);
    await page.locator('#b-declaration').check();
    await page.locator('button[onclick="goStep2b()"]').click();

    // Step 2b — emergency contact details
    await page.fill('#b-emergency-name', 'Emergency Contact');
    await page.fill('#b-emergency-relationship', 'Spouse');
    await page.fill('#b-emergency-phone', '07700900015');
    await page.locator('button[onclick="goStep3()"]').click();

    // Step 3 — T&Cs + reserve
    await page.locator('#tcs-agree').check();
    const reserveBtn = page.locator('#reserve-btn');
    await expect(reserveBtn).not.toBeDisabled();
    await reserveBtn.click();

    // Wait for success view
    await expect(page.locator('#success-view')).toHaveClass(/on/, { timeout: 15000 });

    // Capture the customer id for cleanup (lookup by email)
    const { data: custRows } = await sb.rpc('lookup_customer', { p_email: TEST_EMAIL });
    if (custRows && custRows.length > 0) createdCustomerIds.push(custRows[0].id);

    // Wait for the admin alert payload
    const adminPayload = await Promise.race([
      adminEmailPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Admin email not received within 10s')), 10000))
    ]);

    // --- Assertions on the admin alert payload ---

    // Fetch admin email from settings to confirm recipient
    const { data: settingsRows } = await sb.from('settings').select('value').eq('key', 'admin_email').single();
    const adminEmail = settingsRows?.value || '';
    expect(adminEmail).toBeTruthy();
    expect(adminPayload.to).toBe(adminEmail);

    // Subject contains client name and venue
    expect(adminPayload.subject).toContain(TEST_FIRST);
    expect(adminPayload.subject).toContain(TEST_LAST);

    // isTest flag set correctly in test mode
    expect(adminPayload.isTest).toBe(true);

    // HTML contains "New booking" banner text
    expect(adminPayload.html).toContain('New booking');

    // HTML contains client name
    expect(adminPayload.html).toContain(TEST_FIRST);
    expect(adminPayload.html).toContain(TEST_LAST);

    // New client — PAR-Q flag present
    expect(adminPayload.html).toContain('PAR-Q health form has been submitted');

    // Dashboard link present
    expect(adminPayload.html).toContain('#dashboard');

    // Client type shown as "New client"
    expect(adminPayload.html).toContain('New client');
  });

  test('Admin alert email sent on returning-client reserve — no PAR-Q flag', async ({ page }) => {
    // returning-one@test.example is a fixture returning client (confirmed on mon-current)
    const block = await getBlockByRole('fri-upcoming');

    const capturedPayloads = [];
    await page.route('**/functions/v1/send-email', async route => {
      const body = route.request().postDataJSON();
      capturedPayloads.push(body);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'test-ok' }) });
    });

    const adminEmailPromise = new Promise(resolve => {
      const interval = setInterval(() => {
        if (capturedPayloads.length >= 2) {
          clearInterval(interval);
          resolve(capturedPayloads[1]);
        }
      }, 100);
    });

    await page.goto(APP_PATH_EMAIL);
    await expect(page.locator('#test-mode-banner')).toHaveClass(/on/);

    await page.locator('.card').first().waitFor({ state: 'visible', timeout: 10000 });
    await page.evaluate(({ classId, blockId }) => openModal(classId, blockId), {
      classId: block.class_id,
      blockId:  block.id
    });
    await expect(page.locator('#overlay')).toHaveClass(/on/);

    // Use fixture returning client so lookup_customer finds them and skips PAR-Q
    // returning-one@test.example has confirmed bookings in the fixture
    await page.fill('#b-firstname', 'Returning');
    await page.fill('#b-lastname',  'One');
    await page.fill('#b-email',     'returning-one@test.example');
    await page.fill('#b-phone',     '07700900016');
    await page.locator('button[onclick="goStep2()"]').click();

    // Returning client goes to step 3 (payment) directly — no PAR-Q steps
    await page.locator('#tcs-agree').check();
    const reserveBtn = page.locator('#reserve-btn');
    await expect(reserveBtn).not.toBeDisabled();
    await reserveBtn.click();

    await expect(page.locator('#success-view')).toHaveClass(/on/, { timeout: 15000 });

    // returning-one@test.example is a fixture customer — clean up only their booking on fri-upcoming
    const retBlock = await getBlockByRole('fri-upcoming');
    const { data: retCust } = await sb.rpc('lookup_customer', { p_email: 'returning-one@test.example' });
    if (retCust && retCust.length > 0) {
      await deleteBookingsForCustomerOnBlock(retCust[0].id, retBlock.id);
    }

    const adminPayload = await Promise.race([
      adminEmailPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Admin email not received within 10s')), 10000))
    ]);

    // PAR-Q flag must NOT be present for returning client
    expect(adminPayload.html).not.toContain('PAR-Q health form has been submitted');

    // Client type shown as "Returning client"
    expect(adminPayload.html).toContain('Returning client');

    // Core checks still pass
    expect(adminPayload.isTest).toBe(true);
    expect(adminPayload.html).toContain('New booking');
  });
});
