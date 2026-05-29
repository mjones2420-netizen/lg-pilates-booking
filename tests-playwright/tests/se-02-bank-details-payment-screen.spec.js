// SE-02 — Bank details appear on booking payment screen (Step 3 / "Step 2 of 2" for returning clients)
// Seeds known bank details, opens the booking modal via openModal() JS call for
// fri-upcoming, enters a returning client email, advances to the payment step,
// and asserts all three bank detail values are rendered from settings.
// Cleanup: afterEach restores original settings values.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { Pool } = require('pg');

const BANK = { name: 'SE02 Bank Name', sort: '11-22-33', acc: '99887766' };
const ORIG = { name: 'Test Bank', sort: '01-02-03', acc: '12345678' };

let pool;

test.beforeAll(() => {
  pool = new Pool({ connectionString: process.env.TEST_SUPABASE_DB_URL });
});

test.afterAll(async () => {
  await pool.end();
});

test.beforeEach(async () => {
  await pool.query(`
    INSERT INTO settings (key, value)
    VALUES ('bank_name', $1), ('bank_sort_code', $2), ('bank_account_no', $3)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `, [BANK.name, BANK.sort, BANK.acc]);
});

test.afterEach(async () => {
  await pool.query(`
    INSERT INTO settings (key, value)
    VALUES ('bank_name', $1), ('bank_sort_code', $2), ('bank_account_no', $3)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `, [ORIG.name, ORIG.sort, ORIG.acc]);
});

test('SE-02 — bank details visible on payment step of booking modal', async ({ page }) => {
  test.skip(!process.env.TEST_APP_URL, 'TEST_APP_URL not set');

  const friBlock = await getBlockByRole('fri-upcoming');

  await page.goto(APP_PATH);
  await expect(page.locator('#test-mode-banner.on')).toBeVisible();

  // Wait for schedule to render, then open modal via JS — more reliable than
  // button-click when the card uses a fallback "upcoming as current" layout
  
  await page.locator('.card').first().waitFor({ state: 'visible', timeout: 10000 });
  await page.evaluate(({ classId, blockId }) => openModal(classId, blockId), {
    classId: friBlock.class_id,
    blockId: friBlock.id,
  });

  await expect(page.locator('#overlay.on')).toBeVisible();
  await expect(page.locator('#step-1')).toBeVisible();

  // Fill all Step 1 fields — goStep2() validates all 4 before running the lookup
  await page.locator('#b-firstname').fill('Returning');
  await page.locator('#b-lastname').fill('One');
  await page.locator('#b-email').fill('returning-one@test.example');
  await page.locator('#b-phone').fill('07700900001');
  await page.locator('button[onclick="goStep2()"]').click();

  // Wait for payment step (returning client goes straight here)
  await expect(page.locator('#step-3')).toBeVisible({ timeout: 8000 });

  // Bank details rendered from settings
  await expect(page.locator('#bank-name-1')).toHaveText(BANK.name);
  await expect(page.locator('#bank-sort-1')).toHaveText(BANK.sort);
  await expect(page.locator('#bank-acc-1')).toHaveText(BANK.acc);
});
