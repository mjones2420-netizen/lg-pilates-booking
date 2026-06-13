/**
 * ST-07 — Booking modal Step 4: bank transfer mode
 *
 * Verifies that when payment_mode is 'bank_transfer' (the default), Step 4
 * of the booking modal shows the bank transfer section and Reserve button,
 * and hides the Stripe section and Proceed to Payment button.
 *
 * Uses direct pg (admin-db pattern) to set/restore payment_mode — the anon
 * sb client lacks UPDATE permission on the settings table (auth only).
 * No bookings are created. No customer cleanup required.
 */

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { getBlockByRole } = require('./helpers/fixture-lookup');

const { Pool } = require('pg');
require('dotenv').config({ path: '.env.test' });
const pool = new Pool({ connectionString: process.env.TEST_SUPABASE_DB_URL });

async function setPaymentMode(mode) {
  await pool.query(
    `INSERT INTO settings (key, value) VALUES ('payment_mode', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [mode]
  );
}

const RETURNING_EMAIL = 'returning-one@test.example';

test.describe('ST-07 — Step 4 shows bank details in bank transfer mode', () => {

  test.beforeEach(async ({ page }) => {
    await setPaymentMode('bank_transfer');
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible();
  });

  test.afterEach(async () => {
    await setPaymentMode('bank_transfer');
  });

  test('bank transfer section visible, Stripe section hidden, Reserve button shown', async ({ page }) => {
    const blk = await getBlockByRole('fri-upcoming');

    // Wait for schedule to render then open modal directly
    await expect(page.locator('.card').first()).toBeVisible();
    await page.evaluate(({ classId, blockId }) => {
      window.openModal(classId, blockId);
    }, { classId: blk.class_id, blockId: blk.id });

    await expect(page.locator('#step-1')).toBeVisible();

    // Fill Step 1 with returning client details
    await page.fill('#b-firstname', 'Test');
    await page.fill('#b-lastname', 'User');
    await page.fill('#b-email', RETURNING_EMAIL);
    await page.fill('#b-phone', '07700123456');
    await page.locator('#step-1 .step-btn').click();

    // Returning client auto-advances to Step 4 after 2.5s
    await expect(page.locator('#step-3')).toBeVisible({ timeout: 6000 });

    // Assert bank transfer section visible, Stripe section hidden
    await expect(page.locator('#step4-bank-section')).toBeVisible();
    await expect(page.locator('#step4-stripe-section')).toBeHidden();

    // Assert correct footer button
    await expect(page.locator('#reserve-btn')).toBeVisible();
    await expect(page.locator('#stripe-pay-btn')).toBeHidden();
  });
});
