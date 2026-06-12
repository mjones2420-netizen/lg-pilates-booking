// AC-17 — Prevent new block starting on same day existing block ends
// Verifies that entering a start date equal to an existing block's end_date shows the
// same-day error in #ab-err and does NOT save the block.
// Error text: "This block cannot start on DD MM YYYY — that is the same day an existing
// block ends. Please choose a later date."
//
// Setup: Uses the Monday Mixed fixture class (class_id=1). mon-upcoming has a known
// end_date — we use that as the conflicting start date.
// No DB state is created.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { getBlockByRole } = require('./helpers/fixture-lookup');

function toLocalISO(d) {
  return d.getFullYear() + '-'
    + String(d.getMonth() + 1).padStart(2, '0') + '-'
    + String(d.getDate()).padStart(2, '0');
}

test.describe('AC-17 — Prevent new block starting on same day existing block ends', () => {

  test('start date equal to existing block end_date shows same-day error', async ({ page }) => {
    const monUpcoming = await getBlockByRole('mon-upcoming');

    // The conflicting date is mon-upcoming's end_date
    const sameDayStr = monUpcoming.end_date; // already YYYY-MM-DD

    await page.goto(APP_PATH);
    expect(await page.locator('#test-mode-banner.on').isVisible()).toBe(true);

    await loginAsAdmin(page);

    // Navigate to Classes page
    await page.locator('#dbnav-classes').click();
    await expect(page.locator('#dbnav-classes.on')).toBeVisible();

    // Open Add Block for the Monday class via ctbody
    const ctbody = page.locator('#ctbody');
    await expect(ctbody).toBeVisible();
    const mondayRow = ctbody.locator('tr', { hasText: 'Monday' }).first();
    const addBlockBtn = mondayRow.locator('button', { hasText: '+ Block' });
    await addBlockBtn.click();

    const modal = page.locator('#add-block-overlay');
    await expect(modal).toBeVisible();

    // Enter the same-day start date
    await page.evaluate((dateStr) => {
      const el = document.getElementById('ab-start');
      el.value = dateStr;
      el.dispatchEvent(new Event('change'));
    }, sameDayStr);

    // Day validation should confirm it's a Monday (correct day)
    await expect(page.locator('#ab-date-val')).toBeVisible();
    await expect(page.locator('#ab-date-val')).toContainText('confirmed');

    // Fill remaining required fields
    await page.locator('#ab-weeks').selectOption('6');
    await page.locator('#ab-price').fill('60');
    await page.locator('#ab-cap').fill('12');

    // Attempt to save
    await page.locator('#ab-btn').click();

    // Same-day error should appear
    const errEl = page.locator('#ab-err');
    await expect(errEl).toBeVisible();
    await expect(errEl).toContainText('that is the same day an existing block ends');
    await expect(errEl).toContainText('Please choose a later date');

    // Modal stays open — block was NOT saved
    await expect(modal).toBeVisible();
  });

});
