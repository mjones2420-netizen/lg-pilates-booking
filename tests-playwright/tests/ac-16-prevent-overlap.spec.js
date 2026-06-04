// AC-16 — Prevent overlapping block dates
// Verifies that the Add Block form rejects a start date that falls within an existing
// block's date range. The error "#ab-err" should contain "These dates overlap with an
// existing block" and the block should NOT be saved.
//
// Setup: Uses the Monday Mixed fixture class (class_id=1) which already has mon-upcoming
// as an existing block. We enter a start date that falls inside mon-upcoming's date range.
// No DB state is created — the save is expected to fail before any INSERT.
//
// Per Session 30: insert the class via direct pg BEFORE page.goto so the app loads it.
// Monday class already exists in the fixture so we just use it directly.
// Use toLocalISO() pattern to avoid BST off-by-one from toISOString().

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { getBlockByRole } = require('./helpers/fixture-lookup');

// Local date-safe ISO string (avoids UTC conversion shifting date in BST)
function toLocalISO(d) {
  return d.getFullYear() + '-'
    + String(d.getMonth() + 1).padStart(2, '0') + '-'
    + String(d.getDate()).padStart(2, '0');
}

test.describe('AC-16 — Prevent overlapping block dates', () => {

  test('start date overlapping existing block shows overlap error and does not save', async ({ page }) => {
    // Get mon-upcoming to find a date within its range
    const monUpcoming = await getBlockByRole('mon-upcoming');

    // Pick a date inside mon-upcoming: start_date + 7 days (well within the 6-week block)
    const overlapDate = new Date(monUpcoming.start_date + 'T00:00:00');
    overlapDate.setDate(overlapDate.getDate() + 7);
    const overlapDateStr = toLocalISO(overlapDate);

    await page.goto(APP_PATH);
    expect(await page.locator('#test-mode-banner.on').isVisible()).toBe(true);

    await loginAsAdmin(page);

    // Find the Monday class row in #ctbody and click "+ Block"
    // Monday class is class_id=1; the row contains "Mixed Ability" and "Monday"
    const ctbody = page.locator('#ctbody');
    await expect(ctbody).toBeVisible();
    const mondayRow = ctbody.locator('tr', { hasText: 'Monday' }).first();
    await expect(mondayRow).toBeVisible();
    const addBlockBtn = mondayRow.locator('button', { hasText: '+ Block' });
    await addBlockBtn.click();

    const modal = page.locator('#add-block-overlay');
    await expect(modal).toBeVisible();

    // Enter the overlapping start date via evaluate to fire onchange atomically
    await page.evaluate((dateStr) => {
      const el = document.getElementById('ab-start');
      el.value = dateStr;
      el.dispatchEvent(new Event('change'));
    }, overlapDateStr);

    // Wait for day validation to confirm the date is accepted as a Monday
    const dateVal = page.locator('#ab-date-val');
    await expect(dateVal).toBeVisible();
    await expect(dateVal).toContainText('confirmed');

    // Fill in the remaining required fields
    await page.locator('#ab-weeks').selectOption('6');
    await page.locator('#ab-price').fill('60');
    await page.locator('#ab-cap').fill('12');

    // Attempt to save
    await page.locator('#ab-btn').click();

    // Overlap error should appear
    const errEl = page.locator('#ab-err');
    await expect(errEl).toBeVisible();
    await expect(errEl).toContainText('These dates overlap with an existing block');
    await expect(errEl).toContainText('Please choose dates that do not clash');

    // Modal should remain open — block was NOT saved
    await expect(modal).toBeVisible();
  });

});
