// CB-16b — Step indicator: Step 3 ticks on advance to Step 4 (Payment)
//
// New client completes Step 1, Step 2 (Medical) and Step 3 (Emergency
// contact), reaching Step 4 (Payment). Verifies:
//   - Pips 1, 2 and 3 all show ticks (.done)
//   - Pip 4 (Payment) becomes .active
//   - All three connectors .done
//   - Modal scrolls to top
//
// This test was added to fill the gap left by CB-16 in the Excel scenarios,
// which described a 3-step flow advancing to Payment. In the current 4-step
// flow, this advance is its own transition worth covering.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const {
  openBookingModal,
  fillStep1,
  fillStep2Medical,
  fillStep2Emergency,
  uniqueTestEmail
} = require('./helpers/booking-flow');

test.describe('CB-16b — Step 3 ticks on advance to Step 4', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible();
  });

  test('pips 1, 2 and 3 ticked, pip 4 active, all connectors done', async ({ page }) => {
    await openBookingModal(page, 'Monday', 'current');

    await fillStep1(page, {
      firstName: 'Test',
      lastName:  'Client',
      email:     uniqueTestEmail(16),
      phone:     '07700900123'
    });
    await expect(page.locator('#step-2a')).toBeVisible({ timeout: 8000 });

    await fillStep2Medical(page, { age: 34, printName: 'Test Client' });
    await expect(page.locator('#step-2b')).toBeVisible();

    await fillStep2Emergency(page, {
      name: 'Jane Doe',
      relationship: 'Spouse',
      phone: '07700900456'
    });
    await expect(page.locator('#step-3')).toBeVisible();

    // -- Pips 1, 2 and 3 all done with ticks --
    for (const n of [1, 2, 3]) {
      await expect(page.locator(`#pip-${n}`)).toHaveClass(/done/);
      await expect(page.locator(`#pip-${n}`)).not.toHaveClass(/active/);
      await expect(page.locator(`#pip-${n}`)).toHaveText('\u2713');
      await expect(page.locator(`#pip-lbl-${n}`)).toHaveClass(/done/);
    }

    // -- Pip 4 active --
    await expect(page.locator('#pip-4')).toHaveClass(/active/);
    await expect(page.locator('#pip-4')).not.toHaveClass(/done/);
    await expect(page.locator('#pip-4')).toHaveText('4');
    await expect(page.locator('#pip-lbl-4')).toHaveClass(/active/);

    // -- All three connectors done --
    await expect(page.locator('#conn-1')).toHaveClass(/done/);
    await expect(page.locator('#conn-2')).toHaveClass(/done/);
    await expect(page.locator('#conn-3')).toHaveClass(/done/);

    // -- Modal scrolled to top --
    await expect.poll(
      async () => await page.locator('.overlay.on .modal').evaluate(el => el.scrollTop),
      { timeout: 2000 }
    ).toBeLessThanOrEqual(2);
  });

});
