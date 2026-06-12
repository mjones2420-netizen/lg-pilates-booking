// ac-03-block-start-day-mismatch.spec.js
//
// AC-03: Block start date must match class day
//
// Verifies that the Add Block modal rejects a start date whose day of the
// week does not match the class's scheduled day.
//
// Uses the Monday Mixed fixture class via the #ctbody row button.
// Date formatting note: toLocalISO() avoids BST-midnight UTC shift.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');

if (!process.env.TEST_APP_URL) {
  test.skip(true, 'TEST_APP_URL not set');
}

function toLocalISO(d) {
  return d.getFullYear() + '-'
    + String(d.getMonth() + 1).padStart(2, '0') + '-'
    + String(d.getDate()).padStart(2, '0');
}

// Returns a Wednesday at least 6 weeks out — wrong for a Monday class
function futureWednesday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const daysToWed = day <= 3 ? 3 - day : 10 - day;
  d.setDate(d.getDate() + daysToWed + 42);
  return toLocalISO(d);
}

test.describe('AC-03 — Block start date must match class day', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible();
    await loginAsAdmin(page);
  });

  test('wrong-day start date shows red error and block is not saved', async ({ page }) => {
    const wrongDate = futureWednesday();

    // Navigate to Classes page
    await page.locator('#dbnav-classes').click();
    await expect(page.locator('#dbnav-classes.on')).toBeVisible();

    const ctRow = page.locator('#ctbody tr').filter({ hasText: 'Mixed Ability' }).filter({ hasText: 'Monday' }).first();
    await expect(ctRow).toBeVisible({ timeout: 5000 });
    await ctRow.getByRole('button', { name: '+ Block' }).click();

    await expect(page.locator('#add-block-overlay.on')).toBeVisible();

    await page.locator('#ab-start').evaluate((el, val) => {
      el.value = val;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, wrongDate);

    const dateVal = page.locator('#ab-date-val');
    await expect(dateVal).toBeVisible();
    await expect(dateVal).toContainText('Wednesday');
    await expect(dateVal).toContainText('Please pick a Monday');

    await page.locator('#ab-price').fill('10');
    await page.locator('#ab-cap').fill('12');
    await page.locator('#ab-btn').click();

    await expect(page.locator('#ab-err')).toBeVisible();
    await expect(page.locator('#ab-err')).toContainText('Please fix the start date');
    await expect(page.locator('#add-block-overlay.on')).toBeVisible();
  });
});
