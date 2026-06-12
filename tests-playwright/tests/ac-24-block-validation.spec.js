// AC-24 — Block validation — rejects negative / zero price, cap, weeks
// Verifies that the Add Block form rejects invalid numeric inputs before saving.
// Three sub-tests: price = -5, capacity = 0, weeks = 0.
// Each attempt shows the inline error in #ab-err and keeps the modal open.
// Error text: "Please enter a valid start date, weeks (min 1), price (non-negative), and capacity (min 1)."
//
// Uses the Monday fixture class (class_id=1) with a valid start date far in the future
// (won't overlap existing blocks). No DB state is created — validation fires before INSERT.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { getBlockByRole } = require('./helpers/fixture-lookup');

function toLocalISO(d) {
  return d.getFullYear() + '-'
    + String(d.getMonth() + 1).padStart(2, '0') + '-'
    + String(d.getDate()).padStart(2, '0');
}

// Next Monday on or after a given date
function nextMonday(fromDate) {
  const d = new Date(fromDate);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  return d;
}

test.describe('AC-24 — Block validation rejects negative/zero price, cap, weeks', () => {

  // A Monday date far enough out to avoid overlap with any fixture block
  let validStartDate;

  test.beforeAll(async () => {
    // Use a Monday ~180 days out — safely beyond all fixture blocks
    validStartDate = toLocalISO(nextMonday(new Date(Date.now() + 180 * 86400000)));
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    expect(await page.locator('#test-mode-banner.on').isVisible()).toBe(true);
    await loginAsAdmin(page);

    // Navigate to Classes page
    await page.locator('#dbnav-classes').click();
    await expect(page.locator('#dbnav-classes.on')).toBeVisible();

    // Open Add Block for Monday class via ctbody
    const ctbody = page.locator('#ctbody');
    await expect(ctbody).toBeVisible();
    const mondayRow = ctbody.locator('tr', { hasText: 'Monday' }).first();
    await mondayRow.locator('button', { hasText: '+ Block' }).click();
    await expect(page.locator('#add-block-overlay')).toBeVisible();

    // Set the valid start date (passes day-of-week check)
    await page.evaluate((dateStr) => {
      const el = document.getElementById('ab-start');
      el.value = dateStr;
      el.dispatchEvent(new Event('change'));
    }, validStartDate);
    await expect(page.locator('#ab-date-val')).toContainText('confirmed');
  });

  test('AC-24a — negative price is rejected with validation error', async ({ page }) => {
    await page.locator('#ab-weeks').selectOption('6');
    await page.locator('#ab-price').fill('-5');
    await page.locator('#ab-cap').fill('12');
    await page.locator('#ab-btn').click();

    const errEl = page.locator('#ab-err');
    await expect(errEl).toBeVisible();
    await expect(errEl).toContainText('price (non-negative)');
    await expect(page.locator('#add-block-overlay')).toBeVisible();
  });

  test('AC-24b — zero capacity is rejected with validation error', async ({ page }) => {
    await page.locator('#ab-weeks').selectOption('6');
    await page.locator('#ab-price').fill('60');
    await page.locator('#ab-cap').fill('0');
    await page.locator('#ab-btn').click();

    const errEl = page.locator('#ab-err');
    await expect(errEl).toBeVisible();
    await expect(errEl).toContainText('capacity (min 1)');
    await expect(page.locator('#add-block-overlay')).toBeVisible();
  });

  test('AC-24c — zero weeks is rejected with validation error', async ({ page }) => {
    // weeks is a <select> — we need to inject 0 as a value via evaluate
    await page.evaluate(() => {
      const sel = document.getElementById('ab-weeks');
      const opt = document.createElement('option');
      opt.value = '0'; opt.text = '0';
      sel.appendChild(opt);
      sel.value = '0';
    });
    await page.locator('#ab-price').fill('60');
    await page.locator('#ab-cap').fill('12');
    await page.locator('#ab-btn').click();

    const errEl = page.locator('#ab-err');
    await expect(errEl).toBeVisible();
    await expect(errEl).toContainText('weeks (min 1)');
    await expect(page.locator('#add-block-overlay')).toBeVisible();
  });

});
