// AC-13 — Add block modal subtitle shows class time
// Verifies that clicking "+ Add Block" from the yellow advisory banner opens the Add Block
// modal with a subtitle that includes the class name, day, and time.
// e.g. "Add a block to Mixed Ability — Monday 9:45am"
//
// Setup: Uses the clean fixture Wednesday class which is in the advisory state
// (class_id=2, 1 visible block). Clicks the "+ Add Block" button in its advisory banner row.
// No DB state is created.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');

test.describe('AC-13 — Add block modal subtitle shows class time', () => {

  test('modal subtitle includes class name, day, and time when opened from advisory banner', async ({ page }) => {
    await page.goto(APP_PATH);
    expect(await page.locator('#test-mode-banner.on').isVisible()).toBe(true);

    await loginAsAdmin(page);

    // Block warnings should be visible; yellow advisory should show for Wed (class_id=2)
    const warnings = page.locator('#block-warnings');
    await expect(warnings).toBeVisible();

    // Find the "+ Add Block" button in the advisory (yellow) banner.
    // The yellow banner is the one whose title contains "no next block".
    const yellowBanner = warnings.locator('.block-warning', {
      hasText: 'no next block'
    }).first();
    await expect(yellowBanner).toBeVisible();

    // Click the first "+ Add Block" button in the yellow banner
    const addBlockBtn = yellowBanner.locator('button', { hasText: '+ Add Block' }).first();
    await addBlockBtn.click();

    // Add Block modal should open
    const modal = page.locator('#add-block-overlay');
    await expect(modal).toBeVisible();

    // Subtitle should contain the class name plus day and time
    const sub = page.locator('#ab-sub');
    await expect(sub).toBeVisible();
    const subText = await sub.textContent();

    // Must follow the pattern: "Add a block to <Name> — <Day> <Time>"
    expect(subText).toMatch(/^Add a block to .+ \u2014 \w+ \d+:\d+(am|pm)$/);
  });

});
