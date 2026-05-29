// tests/ab-04-confirm-reserved-booking.spec.js
//
// AB (Admin Bookings) — Confirm a reserved booking.
// Covers scenario:
//   AB-04: When a booking has status 'reserved', the Actions column shows a
//          Confirm button. Clicking it updates the booking to 'confirmed',
//          the Confirm button disappears, and the status pill updates.
//
// Setup: book_if_available always inserts as 'reserved'. We create a per-run
// customer + booking via the RPC directly (no UI flow), so the row lands in
// the admin table with a Confirm button ready to click.
//
// Cleanup: afterEach deletes the per-run customer (booking cascades).

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { deleteCustomerCascade } = require('./helpers/admin-db');

const APP_URL = process.env.TEST_APP_URL;

test.describe('AB-04 — Confirm a reserved booking', () => {
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

  test('AB-04 — Confirm button updates reserved booking to confirmed', async ({ page }) => {
    // Create a per-run customer and 'reserved' booking via RPC
    const email = `ab04-${Date.now()}@test.example`;
    const block = await getBlockByRole('mon-current');

    const { data: custData, error: custErr } = await sb.rpc('upsert_customer', {
      p_first_name: 'Ab04',
      p_last_name: 'Reserved',
      p_email: email,
      p_phone: '07700900400',
      p_customer_type: 'new'
    });
    expect(custErr, 'upsert_customer should not error').toBeNull();
    createdCustomerId = custData;

    const { data: bookingId, error: bookErr } = await sb.rpc('book_if_available', {
      p_block_id: block.id,
      p_class_id: block.class_id,
      p_customer_id: createdCustomerId,
      p_amount_due: block.price || 60
    });
    expect(bookErr, 'book_if_available should not error').toBeNull();
    expect(bookingId).toBeTruthy();

    // Navigate and log in
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });
    await loginAsAdmin(page);

    const tbody = page.locator('#btbody');
    await expect(tbody.locator('tr', { hasText: 'Ab04 Reserved' }).first()).toBeVisible({ timeout: 10000 });

    const row = tbody.locator('tr', { hasText: 'Ab04 Reserved' }).first();

    // Status pill should show 'reserved'
    await expect(row.locator('.pill')).toContainText('reserved');

    // Confirm button should be present (only appears for reserved bookings)
    const confirmBtn = row.locator('button.act-confirm', { hasText: 'Confirm' });
    await expect(confirmBtn).toBeVisible();

    // Click Confirm and wait for toast + re-render
    await confirmBtn.click();
    await expect(page.locator('#toastEl.on')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#toastEl')).toContainText('confirmed');

    // After re-render, row should show 'confirmed' pill and Confirm button gone
    await expect(tbody.locator('tr', { hasText: 'Ab04 Reserved' }).first()
      .locator('.pill')).toContainText('confirmed', { timeout: 8000 });
    await expect(
      tbody.locator('tr', { hasText: 'Ab04 Reserved' }).first()
        .locator('button.act-confirm')
    ).toHaveCount(0);
  });
});
