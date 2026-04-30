// tests/cb-02-parq-yes-shows-details.spec.js
//
// CB (Client Booking) — CB-02: PAR-Q Yes answer reveals the details textarea.
//
// Excel scenario CB-02: "PAR-Q Yes answer shows details box"
//   Given: a new client reaches Step 2 (Medical)
//   When:  they answer "Yes" to any of the 12 PAR-Q questions
//   Then:  the "Please provide details" textarea (#parq-yes-section) appears
//
// Fixture role: mon-current (any bookable block works; we use Monday for
// consistency with other CB specs).

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const {
  openBookingModal,
  fillStep1,
  uniqueTestEmail
} = require('./helpers/booking-flow');

const APP_URL = process.env.TEST_APP_URL;

test.describe('CB-02 — PAR-Q Yes answer shows details box', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — CB specs require the app to be served.');

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.getByText(/Monday|Wednesday|Friday/).first()).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test('answering Yes to a PAR-Q question reveals the details textarea', async ({ page }) => {
    await openBookingModal(page, 'Monday', 'current');

    await fillStep1(page, {
      firstName: 'ParqYes',
      lastName:  'Tester',
      email:     uniqueTestEmail(2),
      phone:     '07700900002'
    });

    // Wait for Step 2 (Medical) to appear after the ~2.5s welcome delay
    await expect(page.locator('#step-2a')).toBeVisible({ timeout: 5000 });

    // The details textarea should be hidden on arrival (all answers default No)
    await expect(page.locator('#parq-yes-section')).toBeHidden();

    // Answer Yes to question 5 (Joint or movement problems) — any Yes should trigger it
    await page.locator('input[name="q5"][value="Yes"]').check();

    // Details textarea should now be visible
    await expect(page.locator('#parq-yes-section')).toBeVisible();
    // And the textarea within it should be the reachable input
    await expect(page.locator('#b-health-conditions')).toBeVisible();
  });
});
