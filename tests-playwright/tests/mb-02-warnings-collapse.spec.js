// tests/mb-02-warnings-collapse.spec.js
//
// MB (Mobile Dashboard) — MB-02: the warnings banner can no longer starve the
// page below it.
//
// Scenario (issue #103, symptom 1 — the bug Mark hit on production):
//   Given: 12 classes trigger "active block but no next block" warnings
//   When:  the dashboard is opened on a phone
//   Then:  the banner shows as a one-line summary, the content pane below it
//          still has real height, the bookings table is reachable, and tapping
//          the summary expands the full list without swallowing the page.
//
// Mechanism:
//   renderBlockWarnings() emits a #dbwarn-summary header plus a collapsible
//   #dbwarn-body. .db-warnings is capped at 40dvh with overflow-y:auto in the
//   mobile query, so even fully expanded it cannot take the whole screen.
//
// Read-only spec — no DB writes, no cleanup.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');

const APP_URL = process.env.TEST_APP_URL;
const PHONE = { width: 390, height: 844 };

test.describe('MB-02 — Warnings banner collapses on mobile', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — MB specs require the app to be served.');
  test.use({ viewport: PHONE });

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner must be visible'
    ).toBeVisible({ timeout: 5000 });
  });

  test('MB-02 — banner starts collapsed, content stays reachable, tap expands it', async ({ page }) => {
    await loginAsAdmin(page);

    const btbody = page.locator('#btbody');
    await expect(btbody.locator('tr').first()).not.toContainText('Loading...', { timeout: 15000 });

    const summary = page.locator('#dbwarn-summary');
    const body = page.locator('#dbwarn-body');
    await expect(summary, 'the seeded fixture must produce at least one warning').toBeVisible({ timeout: 15000 });

    // Collapsed by default, and the summary states a count.
    await expect(body).toBeHidden();
    await expect(summary).toHaveAttribute('aria-expanded', 'false');
    await expect(summary).toContainText(/\d+ things? needs? attention/);

    // The content pane below has real height and the bookings table is on screen.
    const content = page.locator('#dbpage-bookings .db-content');
    const contentBox = await content.boundingBox();
    expect(contentBox, 'content pane should have a box').not.toBeNull();
    expect(contentBox.height, 'content pane must not be starved to zero height').toBeGreaterThan(200);
    await expect(btbody.locator('tr').first()).toBeVisible();

    // Expand: the full warning list appears...
    await summary.click();
    await expect(body).toBeVisible();
    await expect(summary).toHaveAttribute('aria-expanded', 'true');
    await expect(body.locator('.block-warning').first()).toBeVisible();

    // ...and the banner is still capped, so the content pane survives.
    const warnBox = await page.locator('.db-warnings').boundingBox();
    expect(warnBox.height, 'expanded banner must stay within its 40dvh cap')
      .toBeLessThanOrEqual(PHONE.height * 0.42);
    const contentAfter = await content.boundingBox();
    expect(contentAfter.height, 'content pane must keep real height while the banner is open')
      .toBeGreaterThan(100);

    // Collapse again.
    await summary.click();
    await expect(body).toBeHidden();
    await expect(summary).toHaveAttribute('aria-expanded', 'false');
  });
});
