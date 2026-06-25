// tests/cu-01-catchup-swaps.spec.js
//
// CU (Catch-Up Swaps) — admin feature that lets Louise record when a customer
// attends a different block's session for one week instead of their usual class.
//
// Covers:
//   CU-01: Catch-Up Swaps nav item is present and the page loads
//   CU-02: Record a swap successfully via the UI form
//   CU-03: Swap is blocked when the target session is already at capacity
//   CU-04: Swap is blocked when the customer already has 2 swaps on their source block
//   CU-05: Delete a catch-up swap
//   CU-06: Catch-up visitor appears in the By Class accordion with correct details
//   CU-07: Over-capacity warning appears in By Class when a swap pushes attendance above cap
//
// Fixture:
//   Customer "Returning One" (returning-one@test.example) has a confirmed
//   booking on mon-current (source block). We use mon-upcoming or wed-upcoming
//   as the target block.
//   mon-full is at capacity — used to test CU-03.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const {
  clearCatchUpSwaps,
  insertCatchUpSwap,
  countCatchUpSwaps,
  getCustomerByEmail,
  setBlockBookedCount,
  closePool,
} = require('./helpers/admin-db');

const APP_URL = process.env.TEST_APP_URL;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Mirrors onCuTargetBlockChange(): ISO dates from start_date + 7-day intervals.
 * Uses LOCAL date methods (not toISOString) to match the browser's computation
 * and avoid BST/UTC shift producing the wrong date.
 */
function getIsoSessionDates(block) {
  const dates = [];
  const start = new Date(block.start_date + 'T00:00:00');
  const weeks = block.weeks || 6;
  for (let i = 0; i < weeks; i++) {
    const d = new Date(start.getTime() + i * 7 * 24 * 60 * 60 * 1000);
    const iso = d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
    dates.push(iso);
  }
  return dates;
}

function getFutureIsoDates(block) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return getIsoSessionDates(block).filter(d => {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day) >= today;
  });
}

async function goToCatchUpPage(page) {
  await page.locator('#dbnav-catchup').click();
  await expect(page.locator('#dbnav-catchup.on')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#dbpage-catchup.on')).toBeVisible();
}

async function openRecordSwapModal(page) {
  await page.locator('button', { hasText: '+ Record swap' }).click();
  await expect(page.locator('#catchup-overlay.on')).toBeVisible({ timeout: 5000 });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('CU — Catch-Up Swaps', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — CU specs require the app to be served.');

  test.afterAll(async () => {
    await clearCatchUpSwaps();
    await closePool();
  });

  test.beforeEach(async ({ page }) => {
    await clearCatchUpSwaps();
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });
    await loginAsAdmin(page);
  });

  // ── CU-01: Nav item and page load ─────────────────────────────────────────

  test('CU-01 — Catch-up swaps nav item is present and page loads with info text', async ({ page }) => {
    await expect(page.locator('#dbnav-catchup')).toBeVisible();

    await goToCatchUpPage(page);

    // Info box visible
    await expect(page.locator('#catchup-list')).toContainText('Maximum 2 catch-up swaps per customer per block');

    // Empty state message when no swaps exist
    await expect(page.locator('#catchup-list')).toContainText('No upcoming catch-up swaps');

    // Record swap button in topbar
    await expect(page.locator('button', { hasText: '+ Record swap' })).toBeVisible();
  });

  // ── CU-02: Record a swap successfully ─────────────────────────────────────

  test('CU-02 — Record a catch-up swap via UI and it appears in the list', async ({ page }) => {
    const srcBlock = await getBlockByRole('mon-current');
    const tgtBlock = await getBlockByRole('wed-upcoming');
    const customer = await getCustomerByEmail('returning-one@test.example');

    const futureDates = getFutureIsoDates(tgtBlock);
    const classDate = futureDates[0];
    test.skip(!classDate, 'No future date on wed-upcoming — fixture may need reseeding');

    await goToCatchUpPage(page);
    await openRecordSwapModal(page);

    // Select customer by ID (robust against name changes by other tests)
    await page.locator('#cu-customer').selectOption({ value: String(customer.id) });

    // Source block dropdown should populate
    await expect(page.locator('#cu-source-block option').first()).not.toHaveText('Select customer first', { timeout: 3000 });
    await page.locator('#cu-source-block').selectOption({ value: String(srcBlock.id) });

    // Target block
    await page.locator('#cu-target-block').selectOption({ value: String(tgtBlock.id) });

    // Date dropdown should populate
    await expect(page.locator('#cu-date option').first()).not.toHaveText('Select block first', { timeout: 3000 });
    await page.locator('#cu-date').selectOption({ value: classDate });

    // Notes
    await page.locator('#cu-notes').fill('Holiday cover test');

    // Submit
    await page.locator('#cu-btn').click();

    // Modal should close and toast should appear
    await expect(page.locator('#catchup-overlay.on')).not.toBeVisible({ timeout: 5000 });
    await expect(page.locator('#toastEl')).toContainText('recorded', { timeout: 5000 });

    // Swap appears in the list (customer name may vary by DB state — check by notes)
    const list = page.locator('#catchup-list');
    await expect(list).toContainText('Holiday cover test', { timeout: 5000 });
    // Visiting class name should appear
    await expect(list).toContainText('Mixed Ability', { timeout: 5000 });
  });

  // ── CU-03: Blocked at capacity ────────────────────────────────────────────

  test('CU-03 — Swap blocked when target session is already at capacity', async ({ page }) => {
    const srcBlock = await getBlockByRole('mon-current');
    const tgtBlock = await getBlockByRole('mon-full');

    const futureDates = getFutureIsoDates(tgtBlock);
    const classDate = futureDates[0];
    test.skip(!classDate, 'No future date on mon-full — fixture may need reseeding');

    // mon-full is at capacity (booked >= cap) so any swap attempt should be blocked

    const customer = await getCustomerByEmail('returning-one@test.example');

    await goToCatchUpPage(page);
    await openRecordSwapModal(page);

    await page.locator('#cu-customer').selectOption({ value: String(customer.id) });
    await page.locator('#cu-source-block').selectOption({ value: String(srcBlock.id) });
    await page.locator('#cu-target-block').selectOption({ value: String(tgtBlock.id) });

    // Wait for date options to populate
    await expect(page.locator('#cu-date option').first()).not.toHaveText('Select block first', { timeout: 3000 });
    await page.locator('#cu-date').selectOption({ value: classDate });

    await page.locator('#cu-btn').click();

    // Error should appear — cap exceeded
    await expect(page.locator('#cu-err')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#cu-err')).toContainText('capacity');

    // Modal stays open, no swap recorded
    await expect(page.locator('#catchup-overlay.on')).toBeVisible();
  });

  // ── CU-04: Blocked at 2-swap limit ───────────────────────────────────────

  test('CU-04 — Swap blocked when customer already has 2 swaps on source block', async ({ page }) => {
    const srcBlock = await getBlockByRole('mon-current');
    const tgtBlock = await getBlockByRole('wed-upcoming');
    const customer = await getCustomerByEmail('returning-one@test.example');

    const futureDates = getFutureIsoDates(tgtBlock);
    test.skip(futureDates.length < 3, 'Need at least 3 future dates on wed-upcoming');

    // Pre-insert 2 swaps for this customer on mon-current
    await insertCatchUpSwap(customer.id, srcBlock.id, tgtBlock.id, futureDates[0]);
    await insertCatchUpSwap(customer.id, srcBlock.id, tgtBlock.id, futureDates[1]);

    await goToCatchUpPage(page);
    await openRecordSwapModal(page);

    await page.locator('#cu-customer').selectOption({ value: String(customer.id) });
    await page.locator('#cu-source-block').selectOption({ value: String(srcBlock.id) });
    await page.locator('#cu-target-block').selectOption({ value: String(tgtBlock.id) });

    await expect(page.locator('#cu-date option').first()).not.toHaveText('Select block first', { timeout: 3000 });
    await page.locator('#cu-date').selectOption({ value: futureDates[2] });

    await page.locator('#cu-btn').click();

    // Error: limit reached
    await expect(page.locator('#cu-err')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#cu-err')).toContainText('2 catch-up swaps');

    // Count in DB should still be 2
    const count = await countCatchUpSwaps(customer.id, srcBlock.id);
    expect(count).toBe(2);
  });

  // ── CU-05: Delete a catch-up swap ─────────────────────────────────────────

  test('CU-05 — Delete a catch-up swap removes it from the list', async ({ page }) => {
    const srcBlock = await getBlockByRole('mon-current');
    const tgtBlock = await getBlockByRole('wed-upcoming');
    const customer = await getCustomerByEmail('returning-one@test.example');

    const futureDates = getFutureIsoDates(tgtBlock);
    const classDate = futureDates[0];
    test.skip(!classDate, 'No future date on wed-upcoming');

    await insertCatchUpSwap(customer.id, srcBlock.id, tgtBlock.id, classDate, 'Delete me');

    await goToCatchUpPage(page);

    // Swap appears in list
    await expect(page.locator('#catchup-list')).toContainText('Delete me', { timeout: 5000 });

    // Click Remove button
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#catchup-list button', { hasText: 'Remove' }).first().click();

    // Toast confirms removal
    await expect(page.locator('#toastEl')).toContainText('removed', { timeout: 5000 });

    // List now shows empty state
    await expect(page.locator('#catchup-list')).toContainText('No upcoming catch-up swaps', { timeout: 5000 });
  });

  // ── CU-06: Appears in By Class view ───────────────────────────────────────

  test('CU-06 — Catch-up visitor appears in By Class accordion for the target block', async ({ page }) => {
    const srcBlock = await getBlockByRole('mon-current');
    const tgtBlock = await getBlockByRole('wed-upcoming');
    const customer = await getCustomerByEmail('returning-one@test.example');

    const futureDates = getFutureIsoDates(tgtBlock);
    const classDate = futureDates[0];
    test.skip(!classDate, 'No future date on wed-upcoming');

    await insertCatchUpSwap(customer.id, srcBlock.id, tgtBlock.id, classDate);

    // Navigate to By Class
    await page.locator('#dbnav-byclass').click();
    await expect(page.locator('#dbnav-byclass.on')).toBeVisible();

    const accordion = page.locator('#classes-accordion');
    await expect(accordion).toBeVisible({ timeout: 8000 });

    // Expand the Wednesday group (target block is wed-upcoming)
    const wedGroup = accordion.locator('.class-group').filter({
      has: page.locator('.class-group-title', { hasText: /Wednesday/i })
    }).first();
    await expect(wedGroup).toBeVisible({ timeout: 5000 });
    await wedGroup.locator('.class-group-header').click();

    const wedBody = wedGroup.locator('.class-group-body');
    await expect(wedBody).toBeVisible({ timeout: 5000 });

    // "Catch-Up Visitors" heading appears
    await expect(wedBody).toContainText('Catch-Up Visitors', { timeout: 5000 });

    // Customer name is listed — use current DB name (robust against upsert changes by other tests)
    const customerName = `${customer.first_name} ${customer.last_name}`;
    await expect(wedBody).toContainText(customerName);
  });

  // ── CU-07: Over-capacity warning at top of dashboard ───────────────────────

  test('CU-07 — Over-capacity warning appears in the top dashboard banner when a swap pushes attendance above cap', async ({ page }) => {
    // mon-full has cap=2, booked=2 (at capacity after reseed).
    // A direct DB insert bypasses the UI capacity gate (CU-03 tests that path separately).
    // With booked(2) + 1 swap on any future date > cap(2), the warning must fire.
    const srcBlock = await getBlockByRole('mon-current');
    const tgtBlock = await getBlockByRole('mon-full');
    const customer = await getCustomerByEmail('returning-one@test.example');

    const futureDates = getFutureIsoDates(tgtBlock);
    const classDate = futureDates[0];
    test.skip(!classDate, 'No future date on mon-full — fixture may need reseeding');

    await insertCatchUpSwap(customer.id, srcBlock.id, tgtBlock.id, classDate);

    // The dashboard fetches catch-up swaps once at login, so the top banner
    // needs a reload to pick up the freshly inserted swap. The session
    // persists in localStorage, so reload lands back on the dashboard.
    await page.reload();
    await loginAsAdmin(page);

    const warnings = page.locator('#block-warnings');
    await expect(warnings).toContainText('catch-up swap that will exceed capacity', { timeout: 8000 });
    await expect(warnings).toContainText('over capacity on:', { timeout: 5000 });

    // Button jumps straight to By Class
    await warnings.getByRole('button', { name: 'View By Class' }).click();
    await expect(page.locator('#dbnav-byclass.on')).toBeVisible();
  });
});
