// CB-15 — Step indicator: Step 1 ticks on advance (new client)
//
// New client fills Step 1 and clicks Continue. Verifies:
//   - Pip 1 changes from "1" to "✓", gets .done class
//   - Pip 2 (Medical) becomes .active, shows "2"
//   - Connector 1 gets .done
//   - Modal scrolls to top

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { openBookingModal, fillStep1, uniqueTestEmail } = require('./helpers/booking-flow');

test.describe('CB-15 — Step 1 ticks on advance (new client)', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible();
  });

  test('pip 1 ticks, pip 2 activates, connector 1 done, modal scrolls top', async ({ page }) => {
    await openBookingModal(page, 'Monday', 'current');

    // Pre-flight: confirm initial state
    await expect(page.locator('#pip-1')).toHaveClass(/active/);
    await expect(page.locator('#pip-2')).not.toHaveClass(/active/);

    // Fill step 1 with a fresh unique email and continue
    await fillStep1(page, {
      firstName: 'Test',
      lastName:  'Client',
      email:     uniqueTestEmail(15),
      phone:     '07700900123'
    });

    // goStep2() in index.html has a 2.5s setTimeout before showing step-2a.
    // We wait for step-2a to be visible — that's the signal the transition completed.
    await expect(page.locator('#step-2a')).toBeVisible({ timeout: 8000 });

    // -- Pip 1: now done, shows tick --
    await expect(page.locator('#pip-1')).toHaveClass(/done/);
    await expect(page.locator('#pip-1')).not.toHaveClass(/active/);
    await expect(page.locator('#pip-1')).toHaveText('\u2713'); // ✓
    await expect(page.locator('#pip-lbl-1')).toHaveClass(/done/);

    // -- Pip 2: now active, still shows "2" (not a tick yet) --
    await expect(page.locator('#pip-2')).toHaveClass(/active/);
    await expect(page.locator('#pip-2')).not.toHaveClass(/done/);
    await expect(page.locator('#pip-2')).toHaveText('2');
    await expect(page.locator('#pip-lbl-2')).toHaveClass(/active/);

    // -- Connector 1 marked done --
    await expect(page.locator('#conn-1')).toHaveClass(/done/);

    // -- Pips 3 and 4 still dim --
    await expect(page.locator('#pip-3')).not.toHaveClass(/active/);
    await expect(page.locator('#pip-3')).not.toHaveClass(/done/);
    await expect(page.locator('#pip-4')).not.toHaveClass(/active/);
    await expect(page.locator('#pip-4')).not.toHaveClass(/done/);

    // -- Modal scrolled to top.
    // scrollModalTop() uses smooth scroll, so allow a short polling window.
    // We expect scrollTop === 0 within 1s.
    await expect.poll(
      async () => await page.locator('.overlay.on .modal').evaluate(el => el.scrollTop),
      { timeout: 2000 }
    ).toBeLessThanOrEqual(2);
  });

});
