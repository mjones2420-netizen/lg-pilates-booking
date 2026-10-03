// tests/cb-35-notice-popup.spec.js
//
// CB (Client Booking) — CB-35 to CB-38: the notice pop-up (#116).
//
// Customer messages used to be a corner toast that vanished after 3 seconds,
// often before the customer had read it. They are now a pop-up the reader
// closes with OK, Escape or a tap on the backdrop.
//
//   CB-35  A real trigger (Stripe cancel return) shows the notice, focus lands
//          on OK, OK closes it and page scrolling comes back.
//   CB-36  Escape and a backdrop tap each close it.
//   CB-37  A notice raised over an open booking form closes on its own — the
//          form stays open, keeps its scroll lock, and Escape does not close it.
//   CB-38  Good news shows the green tick; a problem shows the info icon.
//
// Read-only: no customer, booking or settings rows are written.
// Admin success messages staying as corner toasts is covered by the existing
// admin specs that assert on #toastEl (AC-01, AB-04, SE-01 and others).

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { openBookingModal } = require('./helpers/booking-flow');

const APP_URL = process.env.TEST_APP_URL;

async function gotoAndCheckTestMode(page, path) {
  await page.goto(path);
  await expect(
    page.locator('#test-mode-banner.on'),
    'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
  ).toBeVisible({ timeout: 10000 });
}

// A corner of the dimmed backdrop, clear of the centred box and of the
// test-mode banner along the top.
async function tapBackdrop(page) {
  const vp = page.viewportSize();
  await page.mouse.click(5, vp.height - 5);
}

test.describe('CB-35 to CB-38 — customer notice pop-up (#116)', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — CB specs require the app to be served.');

  test('CB-35 — Stripe cancel return shows a notice that stays until OK is pressed', async ({ page }) => {
    await gotoAndCheckTestMode(page, APP_PATH + '&payment=cancelled');

    const notice = page.locator('#notice-overlay.on');
    await expect(notice).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#notice-msg')).toHaveText('Payment was not completed — you can try again.');
    await expect(page.locator('#notice-ok')).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');

    // Still there after the old toast would have gone.
    await page.waitForTimeout(3500);
    await expect(notice).toBeVisible();

    await page.locator('#notice-ok').click();
    await expect(page.locator('#notice-overlay.on')).toHaveCount(0);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  });

  test('CB-36 — Escape and a backdrop tap each close the notice', async ({ page }) => {
    await gotoAndCheckTestMode(page, APP_PATH);

    await page.evaluate(() => showNotice('Something went wrong. Please try again.'));
    await expect(page.locator('#notice-overlay.on')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#notice-overlay.on')).toHaveCount(0);

    await page.evaluate(() => showNotice('Something went wrong. Please try again.'));
    await expect(page.locator('#notice-overlay.on')).toBeVisible();
    // A tap on the box itself must NOT close it.
    await page.locator('#notice-msg').click();
    await expect(page.locator('#notice-overlay.on')).toBeVisible();
    await tapBackdrop(page);
    await expect(page.locator('#notice-overlay.on')).toHaveCount(0);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  });

  test('CB-37 — a notice over an open booking form leaves the form intact', async ({ page }) => {
    await gotoAndCheckTestMode(page, APP_PATH);
    await openBookingModal(page, 'Monday');
    await page.locator('#b-firstname').fill('Notice');

    await page.evaluate(() => showNotice('Something went wrong. Please try again.'));
    await expect(page.locator('#notice-overlay.on')).toBeVisible();

    // Escape closes only the notice, not the form underneath.
    await page.keyboard.press('Escape');
    await expect(page.locator('#notice-overlay.on')).toHaveCount(0);
    await expect(page.locator('#overlay.on')).toBeVisible();
    await expect(page.locator('#b-firstname')).toHaveValue('Notice');
    // The form still owns the scroll lock.
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');

    // Same via OK.
    await page.evaluate(() => showNotice('Something went wrong. Please try again.'));
    await page.locator('#notice-ok').click();
    await expect(page.locator('#overlay.on')).toBeVisible();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  });

  test('CB-38 — good news shows a green tick, a problem shows the info icon', async ({ page }) => {
    await gotoAndCheckTestMode(page, APP_PATH);

    await page.evaluate(() => showNotice('Good news — a space has just opened up. Close this and book it.', 'success'));
    await expect(page.locator('#notice-box')).toHaveClass(/notice-good/);
    await expect(page.locator('#notice-icon')).toHaveText('✓');
    await expect(page.locator('#notice-icon')).toBeVisible();

    // A second notice while one is open replaces it rather than stacking.
    await page.evaluate(() => showNotice('That booking link is no longer valid. Please contact Louise.'));
    await expect(page.locator('#notice-box')).not.toHaveClass(/notice-good/);
    await expect(page.locator('#notice-icon')).toHaveText('i');
    await expect(page.locator('#notice-msg')).toHaveText('That booking link is no longer valid. Please contact Louise.');
    await expect(page.locator('#notice-overlay.on')).toHaveCount(1);
  });
});
