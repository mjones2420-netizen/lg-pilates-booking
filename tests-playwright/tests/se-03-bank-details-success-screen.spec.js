// SE-03 — Bank details appear on success/confirmation screen
// After a full returning-client booking completes, the success view shows bank
// details so the client knows where to send payment. Asserts bank-name-2,
// bank-sort-2, bank-acc-2 on #success-view.
// Uses returning-one on fri-upcoming. Self-cleaning afterEach removes the booking.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { deleteBookingsForCustomerOnBlock } = require('./helpers/admin-db');
const { Pool } = require('pg');

const BANK = { name: 'SE03 Bank Name', sort: '22-33-44', acc: '55667788' };
const ORIG = { name: 'Test Bank', sort: '01-02-03', acc: '12345678' };

const RETURNING_EMAIL = 'returning-one@test.example';

let pool;
let createdBooking = null;

test.beforeAll(() => {
  pool = new Pool({ connectionString: process.env.TEST_SUPABASE_DB_URL });
});

test.afterAll(async () => {
  await pool.end();
});

test.beforeEach(async () => {
  createdBooking = null;
  await pool.query(`
    INSERT INTO settings (key, value)
    VALUES ('bank_name', $1), ('bank_sort_code', $2), ('bank_account_no', $3)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `, [BANK.name, BANK.sort, BANK.acc]);
});

test.afterEach(async () => {
  if (createdBooking) {
    await deleteBookingsForCustomerOnBlock(createdBooking.customerId, createdBooking.blockId);
    createdBooking = null;
  }
  await pool.query(`
    INSERT INTO settings (key, value)
    VALUES ('bank_name', $1), ('bank_sort_code', $2), ('bank_account_no', $3)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `, [ORIG.name, ORIG.sort, ORIG.acc]);
});

test('SE-03 — bank details visible on success/confirmation screen', async ({ page }) => {
  test.skip(!process.env.TEST_APP_URL, 'TEST_APP_URL not set');

  const friBlock = await getBlockByRole('fri-upcoming');

  await page.goto(APP_PATH);
  await expect(page.locator('#test-mode-banner.on')).toBeVisible();

  // Open modal via JS — avoids button-text matching issues on upcoming-as-current cards
  
  await page.locator('.card').first().waitFor({ state: 'visible', timeout: 10000 });
  await page.evaluate(({ classId, blockId }) => openModal(classId, blockId), {
    classId: friBlock.class_id,
    blockId: friBlock.id,
  });

  await expect(page.locator('#overlay.on')).toBeVisible();
  await expect(page.locator('#step-1')).toBeVisible();

  // Returning client — fill all Step 1 fields (goStep2 validates all 4 before lookup)
  await page.locator('#b-firstname').fill('Returning');
  await page.locator('#b-lastname').fill('One');
  await page.locator('#b-email').fill(RETURNING_EMAIL);
  await page.locator('#b-phone').fill('07700900001');
  await page.locator('button[onclick="goStep2()"]').click();
  await expect(page.locator('#step-3')).toBeVisible({ timeout: 5000 });

  // Track customer for cleanup
  const { rows } = await pool.query(
    `SELECT id FROM customers WHERE email = $1`, [RETURNING_EMAIL]
  );
  createdBooking = { customerId: rows[0].id, blockId: friBlock.id };

  // Agree to T&Cs and Reserve
  await page.locator('#tcs-agree').check();
  await expect(page.locator('#reserve-btn')).toBeEnabled();
  await page.locator('#reserve-btn').click();

  // Success view appears
  await expect(page.locator('#success-view.on')).toBeVisible({ timeout: 8000 });

  // Bank details on success screen
  await expect(page.locator('#bank-name-2')).toHaveText(BANK.name);
  await expect(page.locator('#bank-sort-2')).toHaveText(BANK.sort);
  await expect(page.locator('#bank-acc-2')).toHaveText(BANK.acc);
});
