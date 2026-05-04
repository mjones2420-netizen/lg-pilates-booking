// PB-X2 — Email pre-fill on priority grant survives modal close/reopen
//
// What this proves: When an eligible client gets through the priority gate,
// their email is pre-filled on Step 1 of the booking modal. If the client
// closes the modal mid-flow and re-triggers the gate (or any other open path),
// the email pre-fill behaviour is consistent — they don't have to retype.
//
// PB-10 verifies the pre-fill happens on the initial grant. PB-X2 extends that
// to assert the close/reopen round-trip.
//
// Self-cleaning: PB-10 runs before PB-X2 alphabetically and books returning-one
// on mon-upcoming. PB-X2's pre-flight deletes that booking via direct pg so the
// gate flow can run end-to-end. Same pattern as CB-13 (Session 18).

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { sb } = require('./helpers/supabase');
const { deleteBookingsForCustomerOnBlock } = require('./helpers/admin-db');

const ELIGIBLE_EMAIL = 'returning-one@test.example';

test.describe('PB-X2 — Email pre-fill survives close/reopen', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible();
  });

  test('email pre-fill persists when modal is closed and re-opened via gate', async ({ page }) => {
    const monUpcoming = await getBlockByRole('mon-upcoming');

    // Self-cleaning pre-flight: if a previous run (or PB-10 earlier in the
    // same suite — alphabetical order means PB-10 runs first and books
    // returning-one on mon-upcoming) left an active booking, delete it so
    // the priority gate flow can run end-to-end. PB-10 already proves the
    // booking path; PB-X2's job is asserting pre-fill behaviour, so removing
    // PB-10's booking here is safe.
    const { data: lookup } = await sb.rpc('lookup_customer', { p_email: ELIGIBLE_EMAIL });
    const customerId = lookup && lookup.length ? lookup[0].id : null;
    if (customerId) {
      const { data: alreadyBooked } = await sb.rpc('has_active_booking_on_block', {
        p_customer_id: customerId,
        p_block_id: monUpcoming.id
      });
      if (alreadyBooked === true) {
        await deleteBookingsForCustomerOnBlock(customerId, monUpcoming.id);
        const { data: stillBooked } = await sb.rpc('has_active_booking_on_block', {
          p_customer_id: customerId, p_block_id: monUpcoming.id
        });
        expect(stillBooked, 'cleanup failed — RPC still reports booking active').toBe(false);
      }
    }

    // -------- First gate flow: grant + verify pre-fill --------
    const toggle = page.locator(`[onclick="toggleNextBlk('nb-${monUpcoming.id}')"]`);
    await expect(toggle).toBeVisible();
    await toggle.click();

    const emailInput = page.locator(`#pemail-${monUpcoming.id}`);
    await expect(emailInput).toBeVisible();
    await emailInput.fill(ELIGIBLE_EMAIL);

    const checkBtn = page.locator(`#pcheck-${monUpcoming.id} button`, { hasText: /check my priority/i });
    await checkBtn.click();

    const msg = page.locator(`#pmsg-${monUpcoming.id}`);
    await expect(msg).toContainText(/priority confirmed/i);

    // Modal opens after the 1.2s delay
    await expect(page.locator('#overlay.on')).toBeVisible();
    const modalEmail = page.locator('#b-email');
    await expect(modalEmail).toHaveValue(ELIGIBLE_EMAIL);

    // -------- Close modal --------
    const closeBtn = page.locator('#overlay .mclose').first();
    await closeBtn.click();
    await expect(page.locator('#overlay.on')).toHaveCount(0);

    // -------- Re-open via gate: pre-fill must reappear --------
    // The next-block panel is still open, so the email input is still visible.
    // The gate input does not auto-restore previous text — refill and re-trigger.
    // The pre-fill on Step 1 of the modal must work again.
    await emailInput.fill(ELIGIBLE_EMAIL);
    await checkBtn.click();

    await expect(msg).toContainText(/priority confirmed/i);
    await expect(page.locator('#overlay.on')).toBeVisible();
    await expect(page.locator('#b-email')).toHaveValue(ELIGIBLE_EMAIL);
  });
});
