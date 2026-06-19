// tests/rf-02-03-04-mark-refunded-stripe.spec.js
//
// RF (Refund sync) — Phase 2 / issue #28.
//
// "Mark Refunded" on a card-paid cancellation now issues the REAL Stripe refund
// (stripe-refund Edge Function) before flipping the refunded flag. On any Stripe
// failure the flag must NOT flip — the report can never show "refunded" when no
// money moved.
//
// Covers:
//   RF-02a: card cancellation, full refund — real Stripe refund issued for the
//           exact stored amount, flag flips, Stripe shows amount_refunded.
//   RF-02b: override variant — refund equals the stored (overridden) amount,
//           not the full block price.
//   RF-03:  bank-transfer cancellation (no intent) — manual flow unchanged,
//           no Stripe call, flag flips.
//   RF-04:  Stripe failure (bogus intent) — refund rejected, flag stays false,
//           error surfaced.
//
// Block: fri-upcoming (£10/session). Cancellation rows are inserted directly via
// pg (the Remove-from-Block UI is already covered by RF-01); this spec exercises
// only the Mark Refunded button + stripe-refund function.
//
// Cleanup: afterEach deletes the per-run customer cascade AND the cancellation
// rows this spec inserted directly (unlike real-flow audit rows, these are test
// artefacts and must not accumulate).

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { deleteCustomerCascade, getPool } = require('./helpers/admin-db');
const { createRefundablePaymentIntent, getAmountRefunded } = require('./helpers/stripe-test');

const APP_URL = process.env.TEST_APP_URL;
const HAS_STRIPE_KEY = !!process.env.TEST_STRIPE_SECRET_KEY;

// Insert a cancellation row directly and return its id. Mirrors the shape
// rfbConfirm() writes (see index.html ~3603).
async function insertCancellation({ customerId, block, firstName, lastName, email, refundAmount, intentId }) {
  const { rows } = await getPool().query(
    `INSERT INTO cancellations
       (customer_id, class_id, block_id, first_name, last_name, email, class_name,
        venue, block_start_date, block_end_date, sessions_attended, sessions_remaining,
        price_per_session, refund_amount, refunded, stripe_payment_intent_id, cancelled_at)
     VALUES ($1,$2,$3,$4,$5,$6,'Test Class','Baildon',$7,$8,3,3,10,$9,false,$10,now())
     RETURNING id`,
    [customerId, block.class_id, block.id, firstName, lastName, email,
     block.start_date || null, block.end_date || null, refundAmount, intentId]
  );
  return rows[0].id;
}

async function makeCustomer(firstName, lastName, email, phone) {
  const { data: custId, error } = await sb.rpc('upsert_customer', {
    p_first_name: firstName, p_last_name: lastName, p_email: email,
    p_phone: phone, p_customer_type: 'returning'
  });
  expect(error, 'upsert_customer should not error').toBeNull();
  return custId;
}

// Drive the Mark Refunded button for a given cancellation row (last name match).
// Auto-accepts the confirm() dialog.
async function clickMarkRefunded(page, lastName) {
  page.once('dialog', d => d.accept());
  const tbody = page.locator('#cancellations-tbody');
  const row = tbody.locator('tr', { hasText: lastName }).first();
  await expect(row).toBeVisible({ timeout: 10000 });
  await row.locator('button', { hasText: 'Mark Refunded' }).click();
}

test.describe('RF-02/03/04 — Mark Refunded issues real Stripe refund', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — RF specs require the app to be served.');

  let createdCustomerId = null;
  let insertedCancellationIds = [];

  test.beforeEach(async () => {
    createdCustomerId = null;
    insertedCancellationIds = [];
  });

  test.afterEach(async () => {
    for (const id of insertedCancellationIds) {
      await getPool().query('DELETE FROM cancellations WHERE id = $1', [id]);
    }
    if (createdCustomerId) await deleteCustomerCascade(createdCustomerId);
  });

  async function gotoAdminCancellations(page) {
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });
    await loginAsAdmin(page);
    await page.evaluate(() => switchDashPage('cancellations'));
  }

  // ── RF-02a — card, full refund ───────────────────────────────────────────────

  test('RF-02a — card cancellation issues a real Stripe refund for the full amount', async ({ page }) => {
    test.skip(!HAS_STRIPE_KEY, 'TEST_STRIPE_SECRET_KEY not set — RF-02 needs a real refundable charge.');

    const email = `rf02a-${Date.now()}@test.example`;
    const block = await getBlockByRole('fri-upcoming');
    createdCustomerId = await makeCustomer('Rf02a', 'CardFull', email, '07700930301');

    const intentId = await createRefundablePaymentIntent(3000); // £30
    const cid = await insertCancellation({
      customerId: createdCustomerId, block, firstName: 'Rf02a', lastName: 'CardFull',
      email, refundAmount: 30, intentId
    });
    insertedCancellationIds.push(cid);

    await gotoAdminCancellations(page);
    await clickMarkRefunded(page, 'CardFull');

    // Flag flips only after the real refund succeeds.
    await expect.poll(async () => {
      const { rows } = await getPool().query('SELECT refunded FROM cancellations WHERE id = $1', [cid]);
      return rows[0]?.refunded;
    }, { timeout: 15000 }).toBe(true);

    // Stripe shows the real refund for the exact amount.
    const refunded = await getAmountRefunded(intentId);
    expect(refunded).toBe(3000);
  });

  // ── RF-02b — override variant ────────────────────────────────────────────────

  test('RF-02b — refund equals the stored overridden amount, not the full price', async ({ page }) => {
    test.skip(!HAS_STRIPE_KEY, 'TEST_STRIPE_SECRET_KEY not set — RF-02 needs a real refundable charge.');

    const email = `rf02b-${Date.now()}@test.example`;
    const block = await getBlockByRole('fri-upcoming');
    createdCustomerId = await makeCustomer('Rf02b', 'CardOverride', email, '07700930302');

    const intentId = await createRefundablePaymentIntent(3000); // £30 charged
    const cid = await insertCancellation({
      customerId: createdCustomerId, block, firstName: 'Rf02b', lastName: 'CardOverride',
      email, refundAmount: 25, intentId // overridden down to £25
    });
    insertedCancellationIds.push(cid);

    await gotoAdminCancellations(page);
    await clickMarkRefunded(page, 'CardOverride');

    await expect.poll(async () => {
      const { rows } = await getPool().query('SELECT refunded FROM cancellations WHERE id = $1', [cid]);
      return rows[0]?.refunded;
    }, { timeout: 15000 }).toBe(true);

    const refunded = await getAmountRefunded(intentId);
    expect(refunded).toBe(2500); // £25, the overridden amount — not £30
  });

  // ── RF-03 — bank transfer, no Stripe call ────────────────────────────────────

  test('RF-03 — bank-transfer cancellation keeps the manual flow (no Stripe call)', async ({ page }) => {
    const email = `rf03-${Date.now()}@test.example`;
    const block = await getBlockByRole('fri-upcoming');
    createdCustomerId = await makeCustomer('Rf03', 'BankManual', email, '07700930303');

    const cid = await insertCancellation({
      customerId: createdCustomerId, block, firstName: 'Rf03', lastName: 'BankManual',
      email, refundAmount: 30, intentId: null // no payment intent → manual flow
    });
    insertedCancellationIds.push(cid);

    await gotoAdminCancellations(page);
    await clickMarkRefunded(page, 'BankManual');

    // No intent → guard skips Stripe entirely; flag flips immediately.
    await expect.poll(async () => {
      const { rows } = await getPool().query('SELECT refunded FROM cancellations WHERE id = $1', [cid]);
      return rows[0]?.refunded;
    }, { timeout: 8000 }).toBe(true);
  });

  // ── RF-04 — Stripe failure leaves the row pending ────────────────────────────

  test('RF-04 — Stripe failure leaves the row unrefunded and surfaces an error', async ({ page }) => {
    const email = `rf04-${Date.now()}@test.example`;
    const block = await getBlockByRole('fri-upcoming');
    createdCustomerId = await makeCustomer('Rf04', 'CardFail', email, '07700930304');

    // Bogus intent — Stripe rejects it, so the refund must fail.
    const cid = await insertCancellation({
      customerId: createdCustomerId, block, firstName: 'Rf04', lastName: 'CardFail',
      email, refundAmount: 30, intentId: `pi_test_nonexistent_${Date.now()}`
    });
    insertedCancellationIds.push(cid);

    await gotoAdminCancellations(page);
    await clickMarkRefunded(page, 'CardFail');

    // Error toast shown (auto-clears after 3s, so assert promptly).
    await expect(page.locator('#toastEl')).toContainText('Stripe refund failed', { timeout: 15000 });

    // Flag must remain false — no money moved.
    const { rows } = await getPool().query('SELECT refunded FROM cancellations WHERE id = $1', [cid]);
    expect(rows[0].refunded).toBe(false);
  });
});
