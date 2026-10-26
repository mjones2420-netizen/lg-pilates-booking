// tests/ab-27-by-class-stays-open.spec.js
//
// AB (Admin Bookings) — By Class keeps opened classes open across a reload (#112).
// The dashboard reloads its data after login and after every admin action
// (Confirm, Remove, block edits...), and each reload redraws By Class. Before
// #112 the redraw closed every class Louise had opened — and an expand made
// before the first load finished snapped shut, which is how AC-08 flaked.
//
// This is a read-only spec — uses seeded fixture data, no DB writes.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');

const APP_URL = process.env.TEST_APP_URL;

test.describe('AB-27 — By Class keeps classes open', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — AB specs require the app to be served.');

  test('AB-27 — an opened class stays open when the dashboard reloads, and others stay closed', async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });
    await loginAsAdmin(page);
    await page.evaluate(() => dashLoadPromise); // first load done

    await page.locator('#dbnav-byclass').click();
    await expect(page.locator('#dbnav-byclass.on')).toBeVisible();

    const accordion = page.locator('#classes-accordion');
    const groupFor = (day) => accordion.locator('.class-group').filter({
      has: page.locator('.class-group-title', { hasText: new RegExp(day, 'i') })
    }).first();

    const monGroup = groupFor('Monday');
    await monGroup.locator('.class-group-header').click();
    await expect(monGroup.locator('.class-group-body')).toBeVisible();
    await expect(groupFor('Wednesday').locator('.class-group-body')).toBeHidden();

    // The same reload an admin action triggers.
    await page.evaluate(async () => { renderDashboard(); await dashLoadPromise; });

    await expect(monGroup.locator('.class-group-body')).toBeVisible();
    await expect(monGroup.locator('.class-group-body button', { hasText: 'Delete Block' }).first()).toBeVisible();
    await expect(groupFor('Wednesday').locator('.class-group-body')).toBeHidden();

    // Still closes normally afterwards.
    await monGroup.locator('.class-group-header').click();
    await expect(monGroup.locator('.class-group-body')).toBeHidden();
  });
});
