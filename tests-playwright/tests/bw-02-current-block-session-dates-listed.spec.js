// tests/bw-02-current-block-session-dates-listed.spec.js
//
// BW (Booking Windows) — Current block session dates are listed.
// Covers scenario:
//   BW-02: Current block session dates are listed
//
// What this proves: the card for an active block renders one date pill per
// entry in the block's dates[] array, in chronological order. Date pills
// are produced by buildCard() at index.html line 992-1001.
//
// Target: Thursday Mixed Ability. thu-current is the active block in the
// seeded fixture; using Thursday rather than Monday avoids any cross-test
// state risk from CB specs that book on Monday.
//
// The dates[] array on a block stores display-formatted strings like
// "6 Apr", "13 Apr", "20 Apr" — see calcBlockDates() in index.html and the
// blocks schema comment in context.txt.
//
// Read-only spec — no database state created. No afterEach needed.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { getBlocksByRoles } = require('./helpers/fixture-lookup');

const APP_URL = process.env.TEST_APP_URL;

// Mirror the month map used by buildCard() so we can parse "D MMM" strings.
const MONTH_INDEX = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
};

/** Convert a "D MMM" display string to a numeric ordinal for comparison. */
function parsePillDate(pillText) {
  const parts = pillText.trim().split(' ');
  if (parts.length < 2) return null;
  const day = parseInt(parts[0], 10);
  const mon = MONTH_INDEX[parts[1]];
  if (Number.isNaN(day) || mon === undefined) return null;
  // Year not stored — assume the current calendar year for ordering. All
  // dates in a single block span at most 12 weeks, so any month wrap is
  // detectable via a descending pair (handled by the chronological check).
  return mon * 100 + day;
}

test.describe('BW-02 — Current block session dates are listed on the card', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — BW specs require the app to be served.');

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test('Thursday card renders one date pill per session in chronological order', async ({ page }) => {
    const { 'thu-current': thuCurrent } = await getBlocksByRoles(['thu-current']);
    expect(thuCurrent, 'thu-current should resolve from fixture').toBeTruthy();
    const expectedDates = thuCurrent.dates || [];
    expect(expectedDates.length, 'thu-current should have a non-empty dates array').toBeGreaterThan(0);

    const card = page.locator('.card').filter({
      has: page.locator('.card-when-day', { hasText: 'Thursday' })
    }).first();
    await expect(card, 'expected a Thursday class card').toBeVisible({ timeout: 10000 });

    // Pills inside the current-block date strip. The next-block panel also
    // contains a .block-dates-pills div (line 1041 of index.html), so we
    // pick .first() to scope to the current block's pills only. Current
    // block always renders before the next-block panel in card markup.
    const pills = card.locator('.block-dates-pills').first().locator('.date-pill');
    await expect(pills).toHaveCount(expectedDates.length);

    // Each pill's text should match the corresponding entry in dates[],
    // preserving order.
    const pillTexts = await pills.allTextContents();
    const cleaned = pillTexts.map(t => t.trim());
    expect(cleaned).toEqual(expectedDates);

    // Independent chronological check — parse each pill as "D MMM" and
    // confirm strictly ascending order. Belt-and-braces against a future
    // bug where buildCard() reordered the pills but the dates[] array
    // happened to also be wrong.
    const ordinals = cleaned.map(parsePillDate);
    for (let i = 1; i < ordinals.length; i++) {
      const prev = ordinals[i - 1];
      const curr = ordinals[i];
      expect(prev, `pill "${cleaned[i - 1]}" should parse as a date`).not.toBeNull();
      expect(curr, `pill "${cleaned[i]}" should parse as a date`).not.toBeNull();
      expect(curr, `pill order broken: "${cleaned[i - 1]}" then "${cleaned[i]}"`).toBeGreaterThan(prev);
    }
  });
});
