// tests/ec-04-block-wrong-day-rejected.spec.js
//
// EC (Edge Cases) — EC-04: Adding a block with a start date on the wrong day
// is rejected — neither the form advances nor a database row is inserted.
//
// Excel scenario EC-04: "Block with wrong day is rejected"
//   Given: Admin is logged in and clicks "+ Block" on a Wednesday class
//   When:  They pick a Friday as the start date and click Save
//   Then:  - Inline error shows "<date> is a Friday. Please pick a Wednesday."
//          - No new block row is created in the database
//
// Mechanism (front-end):
//   validateAbDate() in index.html (line ~2129) computes the day-of-week
//   from the chosen date and compares to the class's `day` column. On
//   mismatch, it writes a red warning into #ab-date-val and returns false.
//   saveNewBlock() (line ~2146) calls validateAbDate() before any DB write
//   and returns early if it fails, setting #ab-err.
//
// Wednesday is class_id=2 in the fixture. We pick a date in the far
// future that is a Friday, well outside any existing block dates so we
// could rule out the overlap-validation branch firing first if the day
// check ever regressed.
//
// Admin login required. Database state read-only assertion via the shared
// anon `sb` client (anon has SELECT on blocks).

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { sb } = require('./helpers/supabase');

const APP_URL = process.env.TEST_APP_URL;
const WED_CLASS_ID = 2;

/**
 * Returns the next Friday at least `minDaysAhead` days from today, in
 * YYYY-MM-DD format. Used so the test date is always far enough in the
 * future to be outside any seeded block range.
 */
function nextFridayFarFuture(minDaysAhead = 200) {
  const d = new Date();
  d.setDate(d.getDate() + minDaysAhead);
  // Walk forward to the next Friday (day 5)
  while (d.getDay() !== 5) {
    d.setDate(d.getDate() + 1);
  }
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

test.describe('EC-04 — Block with wrong day is rejected', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — EC specs require the app to be served.');

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test('picking a Friday date for a Wednesday class shows error and creates no block row', async ({ page }) => {
    await loginAsAdmin(page);

    // Baseline: count of blocks for the Wednesday class BEFORE the test action.
    const { data: beforeData, error: beforeErr } = await sb
      .from('blocks')
      .select('id')
      .eq('class_id', WED_CLASS_ID);
    expect(beforeErr).toBeNull();
    const blocksBefore = beforeData.length;

    // Open the Add Block modal for the Wednesday class. The Upcoming Classes
    // table renders + Block buttons with onclick="openAddBlockModal(<id>)";
    // call the function directly via evaluate so we don't depend on the
    // tbody having rendered or the button being uniquely visible.
    await page.evaluate((classId) => {
      window.openAddBlockModal(classId);
    }, WED_CLASS_ID);

    // Modal should now be visible.
    await expect(page.locator('#add-block-overlay.on')).toBeVisible({ timeout: 3000 });

    // Fill in a Friday date.
    const fridayDate = nextFridayFarFuture(200);
    await page.locator('#ab-start').fill(fridayDate);

    // The onchange handler runs validateAbDate() automatically. Assert the
    // inline warning appears with the expected mismatch message.
    const dateValEl = page.locator('#ab-date-val');
    await expect(dateValEl).toBeVisible({ timeout: 3000 });
    await expect(dateValEl).toContainText(/is a Friday/i);
    await expect(dateValEl).toContainText(/Please pick a Wednesday/i);

    // Fill in the other required fields so the only blocking validation is
    // the day mismatch — this rules out "saveNewBlock failed because price
    // was missing" giving a false positive.
    await page.locator('#ab-weeks').selectOption('6');
    await page.locator('#ab-price').fill('10');
    await page.locator('#ab-cap').fill('12');

    // Click Save (Add Block) — should be rejected by validateAbDate().
    await page.locator('#ab-btn').click();

    // The error banner inside the modal should now also be visible with a
    // "fix the start date" message — confirming saveNewBlock short-circuited.
    const abErr = page.locator('#ab-err');
    await expect(abErr).toBeVisible({ timeout: 2000 });
    await expect(abErr).toContainText(/start date/i);

    // The modal should still be open (no save happened).
    await expect(page.locator('#add-block-overlay.on')).toBeVisible();

    // Direct DB assertion: block count for class 2 is unchanged.
    const { data: afterData, error: afterErr } = await sb
      .from('blocks')
      .select('id')
      .eq('class_id', WED_CLASS_ID);
    expect(afterErr).toBeNull();
    expect(afterData.length).toBe(blocksBefore);
  });
});
