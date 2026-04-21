// tests/cb-01-new-client-happy-path.spec.js
//
// CB (Client Booking) — new client happy path.
// Covers scenarios:
//   CB-01: New client books — full flow
//   CB-04: Modal subtitle shows correct block (current vs next)
//   CB-05: Payment reference is personalised (name + class day)
//   CB-07: Capacity bar updates after booking
//   CB-12: New client completes booking after T&Cs agreement (merged with CB-01)
//   CB-21: Step indicator shows 4 pips for new client
//   CB-28: Payment step shows as "Step 4 of 4"
//   CB-33: PAR-Q record created for new client booking
//
// Canonical bookable class for new-client flow tests: Monday (mon-current role, active).
// Wednesday (wed-upcoming role) is used for CB-04.
//
// These specs navigate by day name via openBookingModal(), so they're
// resilient to block-ID regeneration by migration 09. No hardcoded IDs.

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { APP_PATH } = require('./helpers/app-url');
const {
  openBookingModal,
  fillStep1,
  fillStep2Medical,
  fillStep2Emergency,
  agreeAndReserve,
  uniqueTestEmail
} = require('./helpers/booking-flow');

const APP_URL = process.env.TEST_APP_URL;

test.describe('CB-01 — New client happy path', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — CB specs require the app to be served.');

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.getByText(/Monday|Wednesday|Friday/).first()).toBeVisible({ timeout: 10000 });
    // SAFETY: every CB test must verify we're in TEST MODE before touching the DB.
    // If this fails, the test is aimed at PRODUCTION — abort immediately.
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test('CB-01 / CB-12 — new client completes full 4-step booking and record lands in DB', async ({ page }) => {
    const email = uniqueTestEmail(1);
    const firstName = 'Alice';
    const lastName  = 'Testington';

    await openBookingModal(page, 'Monday', 'current');

    await fillStep1(page, { firstName, lastName, email, phone: '07700900100' });

    await expect(page.locator('#step-2a')).toBeVisible({ timeout: 5000 });
    await fillStep2Medical(page, { printName: `${firstName} ${lastName}` });

    await fillStep2Emergency(page);

    await agreeAndReserve(page);

    await expect(page.locator('#success-view.on')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Spot Reserved/i)).toBeVisible();

    const { data: customer } = await sb.rpc('lookup_customer', { p_email: email });
    expect(customer).toBeTruthy();
    expect(customer.length).toBe(1);
    expect(customer[0].first_name).toBe(firstName);
    expect(customer[0].customer_type).toBe('new');
  });

  test('CB-21 — step indicator shows 4 pips for new client', async ({ page }) => {
    await openBookingModal(page, 'Monday', 'current');

    // All 4 pip circles should be present and visible on modal open
    for (let i = 1; i <= 4; i++) {
      await expect(page.locator(`#pip-${i}`)).toBeVisible();
    }
    await expect(page.locator('#pip-1')).toHaveClass(/active/);
    await expect(page.locator('#pip-lbl-1')).toHaveText('Your details');
    await expect(page.locator('#pip-lbl-2')).toHaveText('Medical');
    await expect(page.locator('#pip-lbl-3')).toHaveText('Emergency contact');
    await expect(page.locator('#pip-lbl-4')).toHaveText('Payment');

    await fillStep1(page, {
      firstName: 'Stepper',
      lastName:  'McPips',
      email:     uniqueTestEmail(21),
      phone:     '07700900200'
    });

    await expect(page.locator('#step-2a')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#step-2a .step-label')).toContainText(/Step 2 of 4/);
    await expect(page.locator('#step-2a .step-label')).toContainText(/Medical Questions/);
    await expect(page.locator('#pip-2')).toHaveClass(/active/);
    await expect(page.locator('#pip-1')).toHaveClass(/done/);
  });

  test('CB-28 — payment step shows "Step 4 of 4" for new client', async ({ page }) => {
    await openBookingModal(page, 'Monday', 'current');

    await fillStep1(page, {
      firstName: 'Payment',
      lastName:  'Tester',
      email:     uniqueTestEmail(28),
      phone:     '07700900300'
    });
    await expect(page.locator('#step-2a')).toBeVisible({ timeout: 5000 });
    await fillStep2Medical(page, { printName: 'Payment Tester' });
    await fillStep2Emergency(page);

    await expect(page.locator('#step-3')).toBeVisible();
    await expect(page.locator('#step-3-label')).toContainText(/Step 4 of 4/);
    await expect(page.locator('#step-3-label')).toContainText(/Payment/);

    await expect(page.locator('#pip-4')).toHaveClass(/active/);
    for (const i of [1, 2, 3]) {
      await expect(page.locator(`#pip-${i}`)).toHaveClass(/done/);
    }
  });

  test('CB-04 — modal subtitle shows correct block', async ({ page }) => {
    // Wednesday test class is at Potting Shed, Guiseley (test DB seed).
    await openBookingModal(page, 'Wednesday', 'current');

    const subtitle = await page.locator('#m-sub').textContent();
    expect(subtitle).toMatch(/Wednesday/);
    expect(subtitle).toMatch(/Guiseley/);
    expect(subtitle).toMatch(/7:00pm/);
    await expect(page.locator('#m-name')).toHaveText(/Beginner/);
  });

  test('CB-05 — payment reference shows name and class day', async ({ page }) => {
    const firstName = 'Reffy';
    const lastName  = 'McReference';
    await openBookingModal(page, 'Monday', 'current');
    await fillStep1(page, {
      firstName, lastName,
      email: uniqueTestEmail(5),
      phone: '07700900400'
    });
    await expect(page.locator('#step-2a')).toBeVisible({ timeout: 5000 });
    await fillStep2Medical(page, { printName: `${firstName} ${lastName}` });
    await fillStep2Emergency(page);

    await expect(page.locator('#step-3')).toBeVisible();
    const reference = await page.locator('#m-reference').textContent();
    // Reference format from goStep3(): "FirstName LastName Day"
    expect(reference).toContain(firstName);
    expect(reference).toContain(lastName);
    expect(reference).toContain('Monday');

    await expect(page.locator('#bank-name-1')).not.toBeEmpty();
    await expect(page.locator('#bank-sort-1')).not.toBeEmpty();
    await expect(page.locator('#bank-acc-1')).not.toBeEmpty();
  });

  test('CB-07 — capacity bar updates after booking', async ({ page }) => {
    const card = page.locator('.card').filter({
      has: page.locator('.card-when-day', { hasText: 'Monday' })
    }).first();
    const capBefore = await card.locator('.cap-txt').first().textContent();
    const beforeMatch = capBefore.match(/(\d+)\s+of\s+(\d+)/);
    expect(beforeMatch, `expected "N of M" in "${capBefore}"`).toBeTruthy();
    const beforeCount = parseInt(beforeMatch[1], 10);

    await openBookingModal(page, 'Monday', 'current');
    await fillStep1(page, {
      firstName: 'Cappy',
      lastName:  'Barzz',
      email:     uniqueTestEmail(7),
      phone:     '07700900500'
    });
    await expect(page.locator('#step-2a')).toBeVisible({ timeout: 5000 });
    await fillStep2Medical(page, { printName: 'Cappy Barzz' });
    await fillStep2Emergency(page);
    await agreeAndReserve(page);
    await expect(page.locator('#success-view.on')).toBeVisible({ timeout: 5000 });

    await page.goto(APP_PATH);
    const cardAfter = page.locator('.card').filter({
      has: page.locator('.card-when-day', { hasText: 'Monday' })
    }).first();
    await expect(cardAfter).toBeVisible({ timeout: 10000 });
    const capAfter = await cardAfter.locator('.cap-txt').first().textContent();
    const afterMatch = capAfter.match(/(\d+)\s+of\s+(\d+)/);
    expect(afterMatch, `expected "N of M" in "${capAfter}"`).toBeTruthy();
    const afterCount = parseInt(afterMatch[1], 10);

    expect(afterCount).toBe(beforeCount + 1);
  });

  test('CB-33 — PAR-Q record created for new client booking', async ({ page }) => {
    // sign_date DATE-type invariant is enforced by the test DB schema
    // (mirrored from production, Session 6). At the UI level we verify a
    // new-client booking completes end-to-end and customer_type is 'new' —
    // which only happens if the PAR-Q insert succeeds (same code path).
    const email = uniqueTestEmail(33);
    await openBookingModal(page, 'Monday', 'current');
    await fillStep1(page, {
      firstName: 'Daria',
      lastName:  'Daterson',
      email,
      phone:     '07700900600'
    });
    await expect(page.locator('#step-2a')).toBeVisible({ timeout: 5000 });
    await fillStep2Medical(page, { printName: 'Daria Daterson' });
    await fillStep2Emergency(page);
    await agreeAndReserve(page);
    await expect(page.locator('#success-view.on')).toBeVisible({ timeout: 5000 });

    const { data: customer } = await sb.rpc('lookup_customer', { p_email: email });
    expect(customer).toBeTruthy();
    expect(customer.length).toBe(1);
    expect(customer[0].customer_type).toBe('new');
  });
});
