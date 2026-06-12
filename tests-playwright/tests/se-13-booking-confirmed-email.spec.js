// SE-13 — Booking confirmed email: Edge Function called on admin confirm
//
// What this proves:
//   When Louise clicks Confirm on a reserved booking in the admin dashboard,
//   the send-email Edge Function is called with the client's email as recipient,
//   a subject containing the class time and venue, isTest: true, and HTML
//   containing "confirmed" and the client's first name.
//
// Approach:
//   A reserved booking is created via the RPC (book_if_available) before the
//   test navigates to the app. page.route() intercepts the fetch to
//   /functions/v1/send-email and captures the JSON payload, responding 200 OK.
//   The test logs in as admin, clicks Confirm on the booking, and asserts the
//   captured payload.
//
// Cleanup:
//   afterEach calls deleteCustomerCascade to remove the per-run customer and booking.

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { APP_PATH_EMAIL } = require('./helpers/app-url');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { deleteCustomerCascade } = require('./helpers/admin-db');

const TEST_EMAIL = 'se13-confirmed@test.example';
const TEST_FIRST = 'Selena';
const TEST_LAST  = 'Thirteen';

test.describe('SE-13 — Booking confirmed email fires on admin confirm', () => {
  let createdCustomerId = null;

  test.beforeEach(async () => {
    createdCustomerId = null;

    // Create a customer
    const { data: custId, error: custErr } = await sb.rpc('upsert_customer', {
      p_first_name: TEST_FIRST,
      p_last_name:  TEST_LAST,
      p_email:      TEST_EMAIL,
      p_phone:      '07700900013',
      p_customer_type: 'returning'
    });
    expect(custErr).toBeNull();
    createdCustomerId = custId;

    // Create a reserved booking on fri-upcoming
    const blk = await getBlockByRole('fri-upcoming');
    const { error: bookErr } = await sb.rpc('book_if_available', {
      p_block_id:   blk.id,
      p_class_id:   blk.class_id,
      p_customer_id: createdCustomerId,
      p_amount_due:  blk.price || 60
    });
    expect(bookErr).toBeNull();
  });

  test.afterEach(async () => {
    if (createdCustomerId) {
      await deleteCustomerCascade(createdCustomerId);
    }
  });

  test('Edge Function called with correct recipient, subject, isTest, and HTML on confirm', async ({ page }) => {
    // Intercept the Edge Function call before navigating
    let capturedPayload = null;
    let emailCaptured;
    const emailPromise = new Promise(resolve => { emailCaptured = resolve; });
    await page.route('**/functions/v1/send-email', async route => {
      const body = route.request().postDataJSON();
      capturedPayload = body;
      emailCaptured();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'test-intercept' }) });
    });

    // Navigate using APP_PATH_EMAIL (no ?noemail=1 suppression)
    await page.goto(APP_PATH_EMAIL);
    await expect(page.locator('#test-mode-banner')).toHaveClass(/on/);

    // Log in as admin
    await loginAsAdmin(page);
    await expect(page.locator('#dbnav-bookings')).toHaveClass(/on/);

    // Find the Confirm button for our test booking and click it
    const row = page.locator('#btbody tr', { hasText: TEST_FIRST + ' ' + TEST_LAST });
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.locator('button.act-confirm', { hasText: 'Confirm' }).click();

    // Wait for the Edge Function to be called (resolves when route intercept fires)
    await emailPromise;

    // Assert the Edge Function was called
    expect(capturedPayload).not.toBeNull();

    // Recipient must be the client's email
    expect(capturedPayload.to).toBe(TEST_EMAIL);

    // Subject must include the time and venue (not the class name)
    expect(capturedPayload.subject).toContain('confirmed');

    // isTest must be true — no real email sent in test mode
    expect(capturedPayload.isTest).toBe(true);

    // HTML must be present and contain the client's first name
    expect(capturedPayload.html).toBeTruthy();
    expect(capturedPayload.html).toContain(TEST_FIRST);

    // HTML must contain the confirmed banner text
    expect(capturedPayload.html).toContain('Payment received');
  });
});
