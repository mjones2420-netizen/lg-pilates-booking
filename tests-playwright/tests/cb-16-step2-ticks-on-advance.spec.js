// CB-16 — Step indicator: Step 2 ticks on advance to Step 3 (Emergency contact)
//
// New client completes Step 1 + Step 2 (Medical) and reaches Step 3
// (Emergency contact). Verifies:
//   - Pips 1 and 2 both show ticks (.done)
//   - Pip 3 (Emergency contact) becomes .active
//   - Connectors 1 and 2 both .done
//   - Modal scrolls to top
//
// Note: the Excel scenario for CB-16 is out of date — it describes a 3-step
// flow advancing to Payment. The current 4-step flow advances Medical →
// Emergency contact, which is what this test verifies.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { openBookingModal, fillStep1, fillStep2Medical, uniqueTestEmail } = require('./helpers/booking-flow');

test.describe('CB-16 — Step 2 ticks on advance to Step 3', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible();
  });

  test('pips 1 and 2 ticked, pip 3 active, connectors 1 and 2 done', async ({ page }) => {
    await openBookingModal(page, 'Monday', 'current');

    await fillStep1(page, {
      firstName: 'Test',
      lastName:  'Client',
      email:     uniqueTestEmail(16),
      phone:     '07700900123'
    });
    await expect(page.locator('#step-2a')).toBeVisible({ timeout: 8000 });

    // Fill medical with all-clear answers and advance to Emergency contact
    await fillStep2Medical(page, { age: 34, printName: 'Test Client' });
    await expect(page.locator('#step-2b')).toBeVisible();

    // -- Pip 1: done, tick --
    await expect(page.locator('#pip-1')).toHaveClass(/done/);
    await expect(page.locator('#pip-1')).toHaveText('\u2713');

    // -- Pip 2: done, tick --
    await expect(page.locator('#pip-2')).toHaveClass(/done/);
    await expect(page.locator('#pip-2')).not.toHaveClass(/active/);
    await expect(page.locator('#pip-2')).toHaveText('\u2713');
    await expect(page.locator('#pip-lbl-2')).toHaveClass(/done/);

    // -- Pip 3: active, shows "3" --
    await expect(page.locator('#pip-3')).toHaveClass(/active/);
    await expect(page.locator('#pip-3')).not.toHaveClass(/done/);
    await expect(page.locator('#pip-3')).toHaveText('3');
    await expect(page.locator('#pip-lbl-3')).toHaveClass(/active/);

    // -- Pip 4: still dim --
    await expect(page.locator('#pip-4')).not.toHaveClass(/active/);
    await expect(page.locator('#pip-4')).not.toHaveClass(/done/);

    // -- Connectors 1 and 2 done; connector 3 not --
    await expect(page.locator('#conn-1')).toHaveClass(/done/);
    await expect(page.locator('#conn-2')).toHaveClass(/done/);
    await expect(page.locator('#conn-3')).not.toHaveClass(/done/);

    // -- Modal scrolled to top --
    await expect.poll(
      async () => await page.locator('.overlay.on .modal').evaluate(el => el.scrollTop),
      { timeout: 2000 }
    ).toBeLessThanOrEqual(2);
  });

});
