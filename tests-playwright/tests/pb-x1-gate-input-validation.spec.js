// PB-X1 — Priority gate input validation
//
// What this proves: The priority gate rejects empty / whitespace-only / malformed
// emails client-side, surfacing a clear red error message and NOT calling the
// check_priority_access RPC. This protects the system from pointless RPC traffic
// and gives the user immediate, friendly feedback.
//
// Approach: drive the Monday card's priority gate (the only gate that renders in
// the current fixture — see context.txt), submit three invalid inputs, and
// assert validation behaviour for each.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { getBlockByRole } = require('./helpers/fixture-lookup');

test.describe('PB-X1 — Priority gate input validation', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    // TEST MODE banner must be visible — fail fast if we ever hit production.
    await expect(page.locator('#test-mode-banner.on')).toBeVisible();
  });

  // Helper: open the priority gate panel for mon-upcoming.
  // We click the toggle by its unique onclick attribute (tied to the block id)
  // rather than relying on card-level day text — more robust across UI tweaks.
  async function openMondayPriorityPanel(page) {
    const monUpcoming = await getBlockByRole('mon-upcoming');
    expect(monUpcoming).toBeTruthy();

    const toggle = page.locator(`[onclick="toggleNextBlk('nb-${monUpcoming.id}')"]`);
    await expect(toggle).toBeVisible();
    await toggle.click();

    const emailInput = page.locator(`#pemail-${monUpcoming.id}`);
    await expect(emailInput).toBeVisible();

    return { monUpcoming, emailInput };
  }

  test('empty email: shows validation error, does not call RPC', async ({ page }) => {
    const { monUpcoming } = await openMondayPriorityPanel(page);

    let rpcCalled = false;
    page.on('request', req => {
      if (req.url().includes('check_priority_access')) rpcCalled = true;
    });

    const checkBtn = page.locator(`#pcheck-${monUpcoming.id} button`, { hasText: /check my priority/i });
    await checkBtn.click();

    const msg = page.locator(`#pmsg-${monUpcoming.id}`);
    await expect(msg).toBeVisible();
    await expect(msg).toHaveText(/please enter a valid email address/i);

    await expect(page.locator('#overlay.on')).toHaveCount(0);

    await page.waitForTimeout(400);
    expect(rpcCalled).toBe(false);
  });

  test('whitespace-only email: shows validation error, does not call RPC', async ({ page }) => {
    const { monUpcoming, emailInput } = await openMondayPriorityPanel(page);

    let rpcCalled = false;
    page.on('request', req => {
      if (req.url().includes('check_priority_access')) rpcCalled = true;
    });

    await emailInput.fill('   ');

    const checkBtn = page.locator(`#pcheck-${monUpcoming.id} button`, { hasText: /check my priority/i });
    await checkBtn.click();

    const msg = page.locator(`#pmsg-${monUpcoming.id}`);
    await expect(msg).toBeVisible();
    await expect(msg).toHaveText(/please enter a valid email address/i);

    await expect(page.locator('#overlay.on')).toHaveCount(0);

    await page.waitForTimeout(400);
    expect(rpcCalled).toBe(false);
  });

  test('missing @ symbol: shows validation error, does not call RPC', async ({ page }) => {
    const { monUpcoming, emailInput } = await openMondayPriorityPanel(page);

    let rpcCalled = false;
    page.on('request', req => {
      if (req.url().includes('check_priority_access')) rpcCalled = true;
    });

    await emailInput.fill('notanemail');

    const checkBtn = page.locator(`#pcheck-${monUpcoming.id} button`, { hasText: /check my priority/i });
    await checkBtn.click();

    const msg = page.locator(`#pmsg-${monUpcoming.id}`);
    await expect(msg).toBeVisible();
    await expect(msg).toHaveText(/please enter a valid email address/i);

    await expect(page.locator('#overlay.on')).toHaveCount(0);

    await page.waitForTimeout(400);
    expect(rpcCalled).toBe(false);
  });
});
