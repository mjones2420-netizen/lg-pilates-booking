// tests/cb-25-emergency-step-label.spec.js
//
// CB (Client Booking) — CB-25: Emergency contact step shows as Step 3 of 4.
//
// Excel scenario CB-25: "Emergency contact step — shows as Step 3 of 4"
//   Given: New client has progressed through Steps 1 and 2
//   When:  They complete the medical form and click Continue
//   Then:  Step 3 panel becomes visible with label "Step 3 of 4 — Enter emergency contact details",
//          pip 3 active, and only 3 fields visible (no medical questions).
//
// Fixture role: mon-current

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const {
  openBookingModal,
  fillStep1,
  fillStep2Medical,
  uniqueTestEmail
} = require('./helpers/booking-flow');

const APP_URL = process.env.TEST_APP_URL;

test.describe('CB-25 — Emergency contact step shows as Step 3 of 4', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — CB specs require the app to be served.');

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.getByText(/Monday|Wednesday|Friday/).first()).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test('emergency contact step shows correct label, active pip 3, and only contact fields', async ({ page }) => {
    await openBookingModal(page, 'Monday', 'current');

    await fillStep1(page, {
      firstName: 'Emma',
      lastName:  'Tester',
      email:     uniqueTestEmail(25),
      phone:     '07700900025'
    });

    await expect(page.locator('#step-2a')).toBeVisible({ timeout: 5000 });
    await fillStep2Medical(page, { printName: 'Emma Tester' });

    // Step 2b should now be visible — verify label, pip state and fields.
    await expect(page.locator('#step-2b')).toBeVisible();
    await expect(page.locator('#step-2b .step-label')).toContainText(/Step 3 of 4/);
    await expect(page.locator('#step-2b .step-label')).toContainText(/Enter emergency contact details/i);

    await expect(page.locator('#pip-3')).toHaveClass(/active/);
    await expect(page.locator('#pip-lbl-3')).toHaveText('Emergency contact');
    // Earlier pips should be marked done with a tick.
    await expect(page.locator('#pip-1')).toHaveClass(/done/);
    await expect(page.locator('#pip-2')).toHaveClass(/done/);
    await expect(page.locator('#pip-1')).toHaveText('\u2713');
    await expect(page.locator('#pip-2')).toHaveText('\u2713');

    // Exactly the three emergency contact fields are visible. Medical
    // questions (e.g. age field, PAR-Q radios) must NOT be visible.
    await expect(page.locator('#b-emergency-name')).toBeVisible();
    await expect(page.locator('#b-emergency-relationship')).toBeVisible();
    await expect(page.locator('#b-emergency-phone')).toBeVisible();

    await expect(page.locator('#b-age')).not.toBeVisible();
    await expect(page.locator('input[name="q1"][value="Yes"]')).not.toBeVisible();
    await expect(page.locator('#b-print-name')).not.toBeVisible();
  });
});
