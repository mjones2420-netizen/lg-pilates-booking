// tests/cb-22-medical-step-layout.spec.js
//
// CB (Client Booking) — CB-22: Medical step intro note + age + 12 questions + declaration.
//
// Excel scenario CB-22: "Medical step — intro note and age question appear at top"
//   Given: a new client has just advanced to Step 2 (Medical)
//   Then:  the health note banner is at the top,
//          the age field is directly below it,
//          12 Yes/No PAR-Q questions follow,
//          and the declaration + print name + checkbox are at the bottom.
//
// Fixture role: mon-current

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const {
  openBookingModal,
  fillStep1,
  uniqueTestEmail
} = require('./helpers/booking-flow');

const APP_URL = process.env.TEST_APP_URL;

test.describe('CB-22 — Medical step layout', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — CB specs require the app to be served.');

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.getByText(/Monday|Wednesday|Friday/).first()).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test('Step 2 shows banner, age, 12 questions, print name and declaration checkbox', async ({ page }) => {
    await openBookingModal(page, 'Monday', 'current');
    await fillStep1(page, {
      firstName: 'Layout',
      lastName:  'Checker',
      email:     uniqueTestEmail(22),
      phone:     '07700900022'
    });

    await expect(page.locator('#step-2a')).toBeVisible({ timeout: 5000 });

    // Age field is visible and empty on arrival
    await expect(page.locator('#b-age')).toBeVisible();
    await expect(page.locator('#b-age')).toHaveValue('');

    // All 12 PAR-Q questions are present. Each question has a radio set
    // named q1..q12; the No option is pre-selected by default.
    for (let i = 1; i <= 12; i++) {
      const noRadio = page.locator(`input[name="q${i}"][value="No"]`);
      const yesRadio = page.locator(`input[name="q${i}"][value="Yes"]`);
      await expect(noRadio).toBeVisible();
      await expect(yesRadio).toBeVisible();
      await expect(noRadio).toBeChecked();
    }

    // Declaration block at the bottom: print name input + checkbox
    await expect(page.locator('#b-print-name')).toBeVisible();
    await expect(page.locator('#b-declaration')).toBeVisible();
    await expect(page.locator('#b-declaration')).not.toBeChecked();

    // Continue button is present at the bottom of the step
    const continueBtn = page.locator('#step-2a .step-btn', { hasText: 'Continue' });
    await expect(continueBtn).toBeVisible();
  });
});
