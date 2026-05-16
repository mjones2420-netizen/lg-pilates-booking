// tests/sec-06-admin-dashboard-tour.spec.js
//
// SEC (Security) — Admin sign-in promotes session and unlocks full dashboard.
// Covers scenario:
//   SEC-06: Admin sign-in promotes session → full dashboard access
//
// Security framing:
//   The Item-20 grant tightening reduced anon privileges to a minimum, but
//   the authenticated role must retain full table access so Louise's
//   dashboard continues to work end-to-end. This spec confirms:
//
//     1. Admin can sign in with valid credentials via the dashboard login UI
//     2. After login, all 4 dashboard tabs render their panels
//     3. The 3 below-tab sections (Upcoming Classes, Settings, Backup & Export)
//        all render their headings and primary controls
//
// What a fail would mean:
//   - Tab content fails to load: authenticated role grants regressed (e.g.
//     a missing SELECT on customers, bookings, classes etc.)
//   - Below-tab sections missing: dashboard HTML regression (unlikely from
//     a grant change, but caught here as a side benefit)
//
// State management:
//   This spec only signs in, navigates tabs, then signs out. No DB writes
//   are performed, so no afterEach cleanup is needed.
//
// Note on scope:
//   The Excel scenario also mentions trying CRUD actions (confirm a booking,
//   add/edit/delete a class, view a PAR-Q, toggle per-class priority). Those
//   are individually large specs that belong in the upcoming Admin Bookings,
//   Admin Classes, and Admin Clients batches — they're already covered by
//   PB-06, PB-07, PB-08, and PB-X5 for per-class priority. This spec
//   intentionally stops at "every tab is reachable and renders" as the
//   security-framed assertion.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin, signOutAdmin } = require('./helpers/admin-auth');

const APP_URL = process.env.TEST_APP_URL;
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;

test.describe('SEC-06 — Admin sign-in unlocks full dashboard', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — SEC specs require the app to be served.');
  test.skip(!ADMIN_PASSWORD, 'TEST_ADMIN_PASSWORD not set — admin specs require admin credentials.');

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.getByText(/Monday|Wednesday|Friday/).first()).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test('SEC-06 — admin can sign in and reach the dashboard', async ({ page }) => {
    await loginAsAdmin(page);

    // loginAsAdmin already asserts #pg-dashboard.on and #tab-bookings.on.
    // Sign-out button should also be visible to confirm authenticated state.
    await expect(page.locator('#nb-signout')).toBeVisible();

    await signOutAdmin(page);
  });

  test('SEC-06 — all 4 dashboard tabs render their panels', async ({ page }) => {
    await loginAsAdmin(page);

    // All Bookings — the default tab. Already verified by loginAsAdmin
    // (asserts #tab-bookings.on). Confirm the panel itself is visible.
    await expect(page.locator('#tab-panel-bookings')).toBeVisible();

    // By Class
    await page.locator('#tab-classes').click();
    await expect(page.locator('#tab-classes.on')).toBeVisible();
    await expect(page.locator('#tab-panel-classes')).toBeVisible();
    await expect(page.locator('#classes-accordion')).toBeAttached();

    // Clients — renderCustomersTab() runs async; wait for at least one row to render.
    await page.locator('#tab-customers').click();
    await expect(page.locator('#tab-customers.on')).toBeVisible();
    await expect(page.locator('#tab-panel-customers')).toBeVisible();
    await expect(page.locator('tr[id^="cust-row-"]').first()).toBeVisible({ timeout: 10000 });

    // Cancellations — renderCancellationsTab() runs async; wait for the
    // loading row to be replaced with either content or "No cancellations yet."
    await page.locator('#tab-cancellations').click();
    await expect(page.locator('#tab-cancellations.on')).toBeVisible();
    await expect(page.locator('#tab-panel-cancellations')).toBeVisible();
    await expect(page.locator('#cancellations-tbody')).not.toContainText(/Loading\.\.\./, { timeout: 10000 });

    await signOutAdmin(page);
  });

  test('SEC-06 — below-tab sections (Upcoming Classes, Settings, Backup & Export) render', async ({ page }) => {
    await loginAsAdmin(page);

    // Upcoming Classes section — heading + table tbody
    await expect(page.getByText(/Upcoming Classes/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /\+ Add New Class/i })).toBeVisible();
    await expect(page.locator('#ctbody')).toBeAttached();

    // Settings section — heading + the three bank detail inputs + Save button
    await expect(page.getByText(/^Settings$/).first()).toBeVisible();
    await expect(page.locator('#setting-bank-name')).toBeVisible();
    await expect(page.locator('#setting-bank-sort')).toBeVisible();
    await expect(page.locator('#setting-bank-acc')).toBeVisible();
    await expect(page.getByRole('button', { name: /Save Bank Details/i })).toBeVisible();

    // Backup & Export section — heading + at least one export button
    await expect(page.getByText(/Backup & Export/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Export Classes/i })).toBeVisible();

    await signOutAdmin(page);
  });
});
