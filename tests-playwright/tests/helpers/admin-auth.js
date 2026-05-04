// tests/helpers/admin-auth.js
//
// Admin authentication helpers for tests that need to drive the admin
// dashboard UI (Clients tab, By Class tab, etc.).
//
// Auth model:
//   The admin login form lives at the #pg-dash-login page. The "Dashboard"
//   nav button calls showDashboard(), which checks for an existing session
//   and routes to either #pg-dashboard (logged in) or #pg-dash-login.
//
//   The login form posts to sb.auth.signInWithPassword, which writes the
//   session into localStorage on success. After that, show("dashboard")
//   reveals #pg-dashboard.
//
// Required env vars (in tests-playwright/.env.test):
//   - TEST_ADMIN_EMAIL    e.g. admin@lg-pilates-test.local
//   - TEST_ADMIN_PASSWORD the password set for that user
//
// Why this file does NOT use the shared `sb` client from supabase.js:
//   The shared `sb` client is anonymous-only (persistSession: false). The
//   admin login here happens entirely through the page's own Supabase client,
//   so the browser session lives in the page context, not in the test
//   process. That keeps the helper purely a UI driver — no parallel auth
//   state to reason about.

const { expect } = require('@playwright/test');

/**
 * Logs in to the admin dashboard via the UI.
 *
 * Pre-conditions:
 *   - page.goto(APP_PATH) has already run
 *   - The TEST MODE banner is visible (verified by the spec's beforeEach)
 *
 * Post-conditions:
 *   - #pg-dashboard.on is visible and the All Bookings tab is active
 */
async function loginAsAdmin(page) {
  const email = process.env.TEST_ADMIN_EMAIL;
  const password = process.env.TEST_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      '[admin-auth] TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD must be set in .env.test'
    );
  }

  // Click the Dashboard nav button — routes to either login or dashboard.
  await page.locator('#nb-dashboard').click();

  // Wait for either the login page or the dashboard to be visible.
  // showDashboard() runs an async getSession() before deciding, so a small
  // wait for the resolution is needed.
  await page.waitForFunction(
    () => document.querySelector('#pg-dash-login.on') || document.querySelector('#pg-dashboard.on'),
    null,
    { timeout: 5000 }
  );

  // If the login form is visible, fill it. Otherwise we already have a session.
  const loginVisible = await page.locator('#pg-dash-login.on').isVisible();
  if (loginVisible) {
    await page.locator('#dash-email').fill(email);
    await page.locator('#dash-password').fill(password);
    await page.locator('#dash-login-btn').click();
  }

  // Wait for the dashboard to render.
  await expect(page.locator('#pg-dashboard.on')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#tab-bookings.on')).toBeVisible();
}

/**
 * Navigates to the Clients tab on the admin dashboard and waits for the
 * customer table to render at least one row.
 *
 * Caller is responsible for already being logged in (call loginAsAdmin first).
 */
async function openClientsTab(page) {
  await expect(page.locator('#pg-dashboard.on')).toBeVisible();
  await page.locator('#tab-customers').click();
  await expect(page.locator('#tab-customers.on')).toBeVisible();
  // Wait for at least one customer row to render — renderCustomersTab fills
  // tbody asynchronously after several DB reads.
  await expect(page.locator('tr[id^="cust-row-"]').first()).toBeVisible({ timeout: 10000 });
}

/**
 * Expands the Per-class panel for a given customer row.
 *
 * Selectors used:
 *   - #cust-row-{custId}        — the main row
 *   - #cust-panel-{custId}      — the expandable panel row (initial display:none)
 *   - "Per-class" button text   — the toggle button inside the row
 */
async function expandPerClassPanel(page, customerId) {
  const row = page.locator(`#cust-row-${customerId}`);
  await expect(row, `customer row #cust-row-${customerId} should be visible`).toBeVisible();
  await row.getByRole('button', { name: /Per-class/i }).click();
  await expect(page.locator(`#cust-panel-${customerId}`)).toBeVisible();
}

/**
 * Returns the Grant or Remove button for a specific (customer, class) pair
 * inside an open Per-class panel.
 *
 * The buttons render with onclick="toggleClassPriority(custId, classId, true|false)"
 * so we can target them precisely via attribute selectors regardless of
 * surrounding markup.
 *
 * action: 'grant' | 'remove'
 *   'grant'  → onclick third arg is `false` (currently NOT granted, button shows "Grant")
 *   'remove' → onclick third arg is `true`  (currently granted, button shows "Remove")
 */
function classPriorityButton(page, customerId, classId, action) {
  const thirdArg = action === 'remove' ? 'true' : 'false';
  return page.locator(
    `button[onclick="toggleClassPriority(${customerId},${classId},${thirdArg})"]`
  );
}

/**
 * Returns the per-class status badge for a (customer, class) pair inside an
 * open Per-class panel. The badge sits in the same flex container as the
 * Grant/Remove button. We locate via the button's onclick pattern (which
 * we know is unique per (cust,class)) then walk up to the shared parent
 * and find the .priority-badge inside.
 */
function classPriorityBadge(page, customerId, classId) {
  // Match the button regardless of grant state (onclick may say true or false).
  // Then walk to the closest panel card (the white card for that class) and
  // pick its priority badge.
  return page
    .locator(`button[onclick^="toggleClassPriority(${customerId},${classId},"]`)
    .locator('xpath=ancestor::div[contains(@style,"background:white")][1]')
    .locator('.priority-badge');
}

/**
 * Signs out via the dashboard sign-out button. Returns to the schedule view.
 */
async function signOutAdmin(page) {
  await page.locator('#nb-signout').click();
  await expect(page.locator('#pg-schedule.on')).toBeVisible({ timeout: 5000 });
}

module.exports = {
  loginAsAdmin,
  openClientsTab,
  expandPerClassPanel,
  classPriorityButton,
  classPriorityBadge,
  signOutAdmin
};
