// tests/cu-01-catchup-swaps.spec.js
//
// CU (Catch-Up Swaps) — admin feature that lets Louise record when a customer
// attends a different block's session for one week instead of their usual class.
//
// Since sessions 60 (#58/#59/#60/#62):
//   - The class and week pickers show spaces left ("— 3 spaces" / "— FULL")
//     and disable full options.
//   - The save goes through the record_catch_up_swap SECURITY DEFINER RPC,
//     which re-checks capacity and the max-2 rule inside the database with a
//     row lock, so racing saves cannot overbook. The browser pre-checks
//     remain as instant feedback only.
//   - The modal uses plain wording and auto-selects the customer's usual
//     class when they have exactly one current block.
//
// Covers:
//   CU-01: Catch-Up Swaps nav item is present and the page loads
//   CU-02: Record a swap successfully via the UI form
//   CU-03: DB RPC rejects a swap at capacity; anon cannot call the RPC
//   CU-04: Max-2-per-source-block enforced in the UI and in the DB
//   CU-05: Delete a catch-up swap
//   CU-06: Catch-up visitor appears in the By Class accordion with correct details
//   CU-07: Over-capacity warning banner catches drift (swap inserted past the gate)
//   CU-08: Class and week pickers show spaces left / FULL and disable full options
//   CU-09: Hard lock — duplicate saves into the last space cannot overbook
//   CU-10: Plain labels; usual class auto-selects for a single-block customer
//
// Fixture:
//   Customer "Returning One" (returning-one@test.example) has confirmed
//   bookings on mon-past, mon-current and wed-past (multi-block customer).
//   Customer "Admin Dummy" (admin-dummy@test.example) has exactly one
//   booking, on mon-full (single-block customer, used for auto-select).
//   mon-full is at capacity (cap 2, booked 2) — used for FULL/disabled and
//   drift tests. wed-upcoming (cap 12, booked 0) is the usual target.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { sb: sbAnon } = require('./helpers/supabase');
const {
  clearCatchUpSwaps,
  insertCatchUpSwap,
  countCatchUpSwaps,
  getCustomerByEmail,
  setBlockBookedCount,
  resyncBlockBookedCount,
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

/**
 * Calls the record_catch_up_swap RPC through the page's authenticated
 * Supabase client (admin session from loginAsAdmin). Returns
 * { data, error } with error flattened to its message string.
 */
async function callSwapRpc(page, args) {
  return page.evaluate(async (rpcArgs) => {
    const { data, error } = await sb.rpc('record_catch_up_swap', rpcArgs);
    return { data, error: error ? error.message : null };
  }, args);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('CU — Catch-Up Swaps', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — CU specs require the app to be served.');

  test.afterAll(async () => {
    await clearCatchUpSwaps();
    await resyncBlockBookedCount();
    await closePool();
  });

  test.beforeEach(async ({ page }) => {
    await clearCatchUpSwaps();
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });
    await loginAsAdmin(page);
  });

  // CU-08 and CU-09 tamper with blocks.booked — always restore the true count.
  test.afterEach(async () => {
    await resyncBlockBookedCount();
  });

  // ── CU-01: Nav item and page load ─────────────────────────────────────────

  test('CU-01 — Catch-up swaps nav item is present and page loads with info text', async ({ page }) => {
    await expect(page.locator('#dbnav-catchup')).toBeVisible();

    await goToCatchUpPage(page);

    // Info box visible
    await expect(page.locator('#catchup-list')).toContainText('Louise can override the usual 2-per-block guideline');

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

    // Returning One has several blocks — the usual-class picker should force
    // an explicit choice via a placeholder rather than silently picking one.
    await expect(page.locator('#cu-source-block option').first()).toHaveText(/Select their usual class/, { timeout: 3000 });
    await page.locator('#cu-source-block').selectOption({ value: String(srcBlock.id) });

    // Target block
    await page.locator('#cu-target-block').selectOption({ value: String(tgtBlock.id) });

    // Date dropdown should populate
    await expect(page.locator('#cu-date option').first()).not.toHaveText('Select class first', { timeout: 3000 });
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

  // ── CU-03: DB gate — capacity ─────────────────────────────────────────────

  test('CU-03 — record_catch_up_swap RPC rejects a swap at capacity; anon cannot call it', async ({ page }) => {
    const srcBlock = await getBlockByRole('mon-current');
    const tgtBlock = await getBlockByRole('mon-full');
    const customer = await getCustomerByEmail('returning-one@test.example');

    const futureDates = getFutureIsoDates(tgtBlock);
    const classDate = futureDates[0];
    test.skip(!classDate, 'No future date on mon-full — fixture may need reseeding');

    const rpcArgs = {
      p_customer_id: customer.id,
      p_source_block_id: srcBlock.id,
      p_target_block_id: tgtBlock.id,
      p_class_date: classDate,
      p_notes: null,
    };

    // mon-full is at capacity (booked >= cap): the DB itself must refuse,
    // regardless of anything the browser checked.
    const res = await callSwapRpc(page, rpcArgs);
    expect(res.error).toContain('CU_FULL');

    // No row inserted
    const count = await countCatchUpSwaps(customer.id, srcBlock.id);
    expect(count).toBe(0);

    // The RPC is SECURITY DEFINER, so grant hygiene is the gate: the anon
    // role must not be able to execute it at all (same payload as above).
    const { error: anonError } = await sbAnon.rpc('record_catch_up_swap', rpcArgs);
    expect(anonError).toBeTruthy();
    expect(anonError.message).toMatch(/permission denied|not allowed|denied/i);
  });

  // ── CU-04: Softened 2-swap limit — warning + override (issue #61) ────────

  test('CU-04 — 3rd swap on a source block warns, offers Cancel/Save Anyway, and the DB still gates without the override flag', async ({ page }) => {
    const srcBlock = await getBlockByRole('mon-current');
    const tgtBlock = await getBlockByRole('wed-upcoming');
    const customer = await getCustomerByEmail('returning-one@test.example');

    const futureDates = getFutureIsoDates(tgtBlock);
    test.skip(futureDates.length < 4, 'Need at least 4 future dates on wed-upcoming');

    // Pre-insert 2 swaps for this customer on mon-current
    await insertCatchUpSwap(customer.id, srcBlock.id, tgtBlock.id, futureDates[0]);
    await insertCatchUpSwap(customer.id, srcBlock.id, tgtBlock.id, futureDates[1]);

    await goToCatchUpPage(page);
    await openRecordSwapModal(page);

    await page.locator('#cu-customer').selectOption({ value: String(customer.id) });
    await page.locator('#cu-source-block').selectOption({ value: String(srcBlock.id) });
    await page.locator('#cu-target-block').selectOption({ value: String(tgtBlock.id) });

    await expect(page.locator('#cu-date option').first()).not.toHaveText('Select class first', { timeout: 3000 });
    await page.locator('#cu-date').selectOption({ value: futureDates[2] });

    await page.locator('#cu-btn').click();

    // Warning shown instead of a hard error; Cancel/Save Anyway offered
    await expect(page.locator('#cu-warn')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#cu-warn')).toContainText('2 catch-up swaps');
    await expect(page.locator('#cu-btn')).toBeHidden();
    await expect(page.locator('#cu-override-row')).toBeVisible();

    // Nothing saved yet
    expect(await countCatchUpSwaps(customer.id, srcBlock.id)).toBe(2);

    // Cancel dismisses the warning and restores the normal form (modal stays open)
    await page.locator('#cu-override-row button', { hasText: 'Cancel' }).click();
    await expect(page.locator('#cu-warn')).toBeHidden();
    await expect(page.locator('#cu-btn')).toBeVisible();
    await expect(page.locator('#catchup-overlay.on')).toBeVisible();

    // Retry and this time confirm the override
    await page.locator('#cu-btn').click();
    await expect(page.locator('#cu-override-row')).toBeVisible({ timeout: 3000 });
    await page.locator('#cu-override-row button', { hasText: 'Save Anyway' }).click();

    await expect(page.locator('#catchup-overlay.on')).not.toBeVisible({ timeout: 5000 });
    await expect(page.locator('#toastEl')).toContainText('override', { timeout: 5000 });
    expect(await countCatchUpSwaps(customer.id, srcBlock.id)).toBe(3);

    // The DB rule is still the real gate: without the override flag it still
    // raises CU_LIMIT; with it, it still allows a further swap.
    const blocked = await callSwapRpc(page, {
      p_customer_id: customer.id,
      p_source_block_id: srcBlock.id,
      p_target_block_id: tgtBlock.id,
      p_class_date: futureDates[3],
      p_notes: null,
    });
    expect(blocked.error).toContain('CU_LIMIT');
    expect(await countCatchUpSwaps(customer.id, srcBlock.id)).toBe(3);

    const allowed = await callSwapRpc(page, {
      p_customer_id: customer.id,
      p_source_block_id: srcBlock.id,
      p_target_block_id: tgtBlock.id,
      p_class_date: futureDates[3],
      p_notes: null,
      p_allow_over_limit: true,
    });
    expect(allowed.error).toBeNull();
    expect(await countCatchUpSwaps(customer.id, srcBlock.id)).toBe(4);
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

  // ── CU-07: Over-capacity DRIFT warning at top of dashboard ─────────────────

  test('CU-07 — Over-capacity warning appears in the top dashboard banner when a swap pushes attendance above cap', async ({ page }) => {
    // Drift scenario: the record_catch_up_swap RPC would refuse this swap,
    // but a block can still go over capacity AFTER a valid swap exists (more
    // bookings added later, cap reduced, or — as simulated here — a row that
    // bypassed the gate entirely via direct SQL). The banner is the only
    // thing that catches that, which is why it stays despite the DB lock.
    // mon-full has cap=2, booked=2: booked(2) + 1 swap > cap(2) → warning.
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

  // ── CU-08: Pickers show spaces / FULL ─────────────────────────────────────

  test('CU-08 — Class and week pickers show spaces left, mark full options FULL and disable them', async ({ page }) => {
    const srcBlock = await getBlockByRole('mon-current');
    const monFull = await getBlockByRole('mon-full');
    const wedUpcoming = await getBlockByRole('wed-upcoming');
    const customer = await getCustomerByEmail('returning-one@test.example');

    const futureDates = getFutureIsoDates(wedUpcoming);
    test.skip(futureDates.length < 2, 'Need at least 2 future dates on wed-upcoming');

    // Leave wed-upcoming one space short of full, then use that last space
    // on futureDates[0] with an existing swap: the class picker should show
    // "1 space", futureDates[0] should be FULL/disabled, futureDates[1] open.
    await setBlockBookedCount(wedUpcoming.id, wedUpcoming.cap - 1);
    await insertCatchUpSwap(customer.id, srcBlock.id, wedUpcoming.id, futureDates[0]);

    // Blocks + swaps are fetched at login — reload to pick up the DB changes
    await page.reload();
    await loginAsAdmin(page);

    await goToCatchUpPage(page);
    await openRecordSwapModal(page);

    // The week picker is built from the catchUpSwaps global, fetched async at
    // login + on the catch-up page render. If we select the class before that
    // fetch lands, the date options build WITHOUT the existing swap and never
    // rebuild (nothing re-triggers onCuTargetBlockChange) — the CU-08 CI flake
    // (#79). Wait for the swap data to be present before interacting. This is a
    // ready-state wait, not a weaker assertion.
    await page.waitForFunction(
      (blockId) => Array.isArray(window.catchUpSwaps)
        && window.catchUpSwaps.some((s) => s.target_block_id === blockId),
      wedUpcoming.id,
      { timeout: 5000 }
    );

    // Class picker: mon-full (booked >= cap) is FULL and disabled
    const monFullOpt = page.locator(`#cu-target-block option[value="${monFull.id}"]`);
    await expect(monFullOpt).toContainText('FULL');
    await expect(monFullOpt).toBeDisabled();

    // Class picker: wed-upcoming shows its single remaining space
    const wedOpt = page.locator(`#cu-target-block option[value="${wedUpcoming.id}"]`);
    await expect(wedOpt).toContainText('1 space');

    // Week picker: the date holding the existing swap is FULL and disabled,
    // the next date still shows a space
    await page.locator('#cu-target-block').selectOption({ value: String(wedUpcoming.id) });
    const fullDateOpt = page.locator(`#cu-date option[value="${futureDates[0]}"]`);
    await expect(fullDateOpt).toContainText('FULL');
    await expect(fullDateOpt).toBeDisabled();
    const openDateOpt = page.locator(`#cu-date option[value="${futureDates[1]}"]`);
    await expect(openDateOpt).toContainText('1 space');
    await expect(openDateOpt).toBeEnabled();
  });

  // ── CU-09: Hard lock — duplicate saves cannot overbook ────────────────────

  test('CU-09 — Two saves into the last space: first succeeds, second is rejected by the DB', async ({ page }) => {
    const srcOne = await getBlockByRole('mon-current');
    const srcTwo = await getBlockByRole('mon-past');
    const wedUpcoming = await getBlockByRole('wed-upcoming');
    const custOne = await getCustomerByEmail('returning-one@test.example');
    const custTwo = await getCustomerByEmail('returning-two@test.example');

    const futureDates = getFutureIsoDates(wedUpcoming);
    const classDate = futureDates[0];
    test.skip(!classDate, 'No future date on wed-upcoming');

    // Exactly one space left on the block
    await setBlockBookedCount(wedUpcoming.id, wedUpcoming.cap - 1);

    // This is the double-save race from issue #59, serialised: with the old
    // browser-only check, both saves would have seen "1 space" and both
    // inserted. The RPC locks the block row and counts existing swaps, so
    // the second save must fail whatever the browser believed.
    const first = await callSwapRpc(page, {
      p_customer_id: custOne.id,
      p_source_block_id: srcOne.id,
      p_target_block_id: wedUpcoming.id,
      p_class_date: classDate,
      p_notes: null,
    });
    expect(first.error).toBeNull();

    const second = await callSwapRpc(page, {
      p_customer_id: custTwo.id,
      p_source_block_id: srcTwo.id,
      p_target_block_id: wedUpcoming.id,
      p_class_date: classDate,
      p_notes: null,
    });
    expect(second.error).toContain('CU_FULL');

    // Exactly one row landed
    expect(await countCatchUpSwaps(custOne.id, srcOne.id)).toBe(1);
    expect(await countCatchUpSwaps(custTwo.id, srcTwo.id)).toBe(0);
  });

  // ── CU-10: Plain wording + usual class auto-selects ───────────────────────

  test('CU-10 — Modal uses plain labels and auto-selects the usual class for a single-block customer', async ({ page }) => {
    const monFull = await getBlockByRole('mon-full');
    // Admin Dummy's only booking is on mon-full
    const customer = await getCustomerByEmail('admin-dummy@test.example');

    await goToCatchUpPage(page);
    await openRecordSwapModal(page);

    // Plain-English labels (issue #60)
    const modal = page.locator('#catchup-overlay .modal');
    await expect(modal).toContainText("Who's coming?");
    await expect(modal).toContainText('Their usual class');
    await expect(modal).toContainText('Which class are they joining?');
    await expect(modal).toContainText('Which week?');

    // Single-block customer: usual class fills itself in, no placeholder
    await page.locator('#cu-customer').selectOption({ value: String(customer.id) });
    await expect(page.locator('#cu-source-block')).toHaveValue(String(monFull.id));
    await expect(page.locator('#cu-source-block option')).toHaveCount(1);
  });
});
