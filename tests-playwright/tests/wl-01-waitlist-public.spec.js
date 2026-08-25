// tests/wl-01-waitlist-public.spec.js
//
// WL (Waiting List) — public-site behaviour (#74).
//
//   WL-01  A full block offers the list; a block with real spaces does not
//   WL-02  Joining: RPC row written, blocks.wait bumped, queue position shown
//   WL-03  Joining twice with the same email is refused in plain English
//   WL-04  The reservation rule: a free seat stays hidden while anyone waits
//   WL-05  A valid ?offer= link prefills the booking form and locks the email
//   WL-06  A junk ?offer= link says so and leaves the page usable
//   WL-07  The token books past a full block, and consumes the hold
//
// Isolation
//   Every test runs against a class + block created by this file and deleted
//   in afterAll. The Playwright fixture blocks are deliberately untouched:
//   these specs mutate wait counts and booked counts, and #101 was a whole
//   session spent removing exactly this kind of cross-spec contamination.
//
// blocks.wait needs no manual resync — unlike blocks.booked, its trigger fires
// on direct INSERT/DELETE (see admin-db.js).

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const {
  getPool,
  setBlockBookedCount,
  deleteCustomerCascade,
  getCustomerByEmail,
  getCustomerById,
  getParqByCustomerId,
  clearWaitlistForBlock,
  getWaitlistRow,
  offerWaitlistRowDirect,
  getBlockWaitCount,
  resetPaymentMode
} = require('./helpers/admin-db');
const { fillStep2Medical, fillStep2Emergency, agreeAndReserve } = require('./helpers/booking-flow');

const APP_URL = process.env.TEST_APP_URL;

// Distinctive so a stray row is obvious in the test DB, and matched by the
// cleanup below rather than by id.
const WL_DAY = 'Sunday';
const WL_CLASS_NAME = 'Waitlist Spec Class';
const CAP = 12;

let classId = null;
let blockId = null;
const createdEmails = [];

function uniqueEmail(tag) {
  return `wl-${tag}-${Date.now()}@test.example`;
}

/** Finds this spec's own card, never a fixture one. */
function wlCard(page) {
  return page.locator('.card').filter({
    has: page.locator('.card-when-name', { hasText: WL_CLASS_NAME })
  }).first();
}

/** Seeds one person into the queue, then frees a seat.
 *
 *  Order matters: join_waitlist refuses while booked + waiting < cap, so the
 *  block must be full at the moment of joining. Freeing the seat afterwards
 *  reproduces the real sequence — class fills, queue forms, someone cancels —
 *  and leaves a seat that is physically empty but already spoken for.
 *
 *  Fails loudly on an RPC error: a silent no-op here would show up later as a
 *  confusing assertion failure somewhere else entirely.
 */
async function seedQueuedJoinerThenFreeASeat(page, { email, firstName, lastName, phone }) {
  await setBlockBookedCount(blockId, CAP);
  await page.goto(APP_PATH);
  const err = await page.evaluate(async ({ blockId, email, firstName, lastName, phone }) => {
    const res = await sb.rpc('join_waitlist', {
      p_block_id: blockId, p_first_name: firstName, p_last_name: lastName,
      p_email: email, p_phone: phone
    });
    return res.error ? (res.error.message || 'unknown') : null;
  }, { blockId, email, firstName, lastName, phone });
  expect(err, 'seeding the queue via join_waitlist should succeed').toBeNull();
  await setBlockBookedCount(blockId, CAP - 1);
}

test.describe('WL — waiting list, public site', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — WL specs require the app to be served.');

  test.beforeAll(async () => {
    const pool = getPool();
    const cls = await pool.query(
      `INSERT INTO classes (name, level, day, time, end_time, venue, loc)
       VALUES ($1, 'Mixed', $2, '11:00am', '12:00pm', 'Waitlist Spec Venue', 'Baildon')
       RETURNING id`,
      [WL_CLASS_NAME, WL_DAY]
    );
    classId = cls.rows[0].id;

    // Upcoming, so every session is still to come and prorata never kicks in —
    // the price shown stays the full block price and the card can never fall
    // into the "Booking Closed" branch mid-run.
    const blk = await pool.query(
      `INSERT INTO blocks (class_id, start_date, end_date, weeks, dates, price, cap, booked, wait, visible, status)
       VALUES ($1,
               (CURRENT_DATE + INTERVAL '7 days')::date,
               (CURRENT_DATE + INTERVAL '42 days')::date,
               6,
               ARRAY['1 Jan','8 Jan','15 Jan','22 Jan','29 Jan','5 Feb'],
               10, $2, 0, 0, true, 'upcoming')
       RETURNING id`,
      [classId, CAP]
    );
    blockId = blk.rows[0].id;
  });

  test.afterAll(async () => {
    const pool = getPool();
    for (const email of createdEmails) {
      const c = await getCustomerByEmail(email);
      if (c) await deleteCustomerCascade(c.id);
    }
    if (blockId != null) await clearWaitlistForBlock(blockId);
    if (classId != null) {
      // Explicit and ordered, same reason as admin_delete_class (session 66):
      // bookings has both a direct FK to classes and a cascade path via blocks.
      await pool.query(`DELETE FROM waitlist WHERE block_id IN (SELECT id FROM blocks WHERE class_id = $1)`, [classId]);
      await pool.query(`DELETE FROM bookings WHERE class_id = $1`, [classId]);
      await pool.query(`DELETE FROM blocks WHERE class_id = $1`, [classId]);
      await pool.query(`DELETE FROM classes WHERE id = $1`, [classId]);
    }
  });

  test.beforeEach(async ({ page }) => {
    // Every test starts from a known state: empty queue, no bookings.
    await clearWaitlistForBlock(blockId);
    await setBlockBookedCount(blockId, 0);

    await page.goto(APP_PATH);
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  // ── WL-01 ────────────────────────────────────────────────────────────────
  test('WL-01 — a full block offers the waiting list, a block with spaces does not', async ({ page }) => {
    const card = wlCard(page);
    await expect(card, 'expected the waitlist spec card').toBeVisible({ timeout: 10000 });

    // Empty and open: unchanged behaviour, and no waiting-list row at all.
    await expect(card.locator('button.book-btn').first()).toHaveText('Book Current Block');
    await expect(card.locator('.card-spaces-dot.wait')).toHaveCount(0);
    await expect(card.locator('.card-spaces-row').nth(1)).toContainText(`${CAP} spaces left`);

    // Now fill it physically.
    await setBlockBookedCount(blockId, CAP);
    await page.goto(APP_PATH);

    const fullCard = wlCard(page);
    await expect(fullCard.locator('.badge.b-full')).toHaveText('Full');
    const joinBtn = fullCard.locator('button.book-btn').first();
    await expect(joinBtn).toHaveText('Join Waiting List');
    await expect(joinBtn, 'the join button must be live, not the old dead one').toBeEnabled();
    await expect(joinBtn).toHaveClass(/wait/);
  });

  // ── WL-02 ────────────────────────────────────────────────────────────────
  test('WL-02 — joining writes the row, bumps blocks.wait and shows the queue position', async ({ page }) => {
    const email = uniqueEmail('join');
    createdEmails.push(email);

    await setBlockBookedCount(blockId, CAP);
    await page.goto(APP_PATH);

    await wlCard(page).locator('button.book-btn').first().click();
    await expect(page.locator('#wl-overlay.on')).toBeVisible();

    await page.locator('#wl-firstname').fill('Sarah');
    await page.locator('#wl-lastname').fill('Hughes');
    await page.locator('#wl-email').fill(email);
    await page.locator('#wl-phone').fill('07700900123');
    await page.locator('#wl-submit-btn').click();

    await expect(page.locator('#wl-success-view.on')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#wl-pos')).toHaveText('#1');

    const row = await getWaitlistRow(blockId, email);
    expect(row, 'a waitlist row should exist for the joiner').toBeTruthy();
    expect(row.status).toBe('waiting');

    // The display counter is trigger-maintained — prove the trigger ran.
    expect(await getBlockWaitCount(blockId)).toBe(1);

    // And the card behind the modal now reports the queue.
    await page.locator('#wl-success-view button.confirm-btn').click();
    await expect(wlCard(page).locator('.card-spaces-dot.wait')).toBeVisible();
    await expect(wlCard(page)).toContainText('1 person on the waiting list');
  });

  // ── WL-03 ────────────────────────────────────────────────────────────────
  test('WL-03 — joining twice with the same email is refused in plain English', async ({ page }) => {
    const email = uniqueEmail('dupe');
    createdEmails.push(email);

    await setBlockBookedCount(blockId, CAP);

    // Seed the first join through the RPC so the refusal under test is the
    // DB's own UNIQUE(block_id, customer_id), not a UI guard.
    await page.goto(APP_PATH);
    const seedErr = await page.evaluate(async ({ blockId, email }) => {
      const res = await sb.rpc('join_waitlist', {
        p_block_id: blockId, p_first_name: 'Sarah', p_last_name: 'Hughes',
        p_email: email, p_phone: '07700900123'
      });
      return res.error ? (res.error.message || 'unknown') : null;
    }, { blockId, email });
    expect(seedErr, 'the first join should succeed').toBeNull();

    await page.goto(APP_PATH);
    await wlCard(page).locator('button.book-btn').first().click();
    await page.locator('#wl-firstname').fill('Sarah');
    await page.locator('#wl-lastname').fill('Hughes');
    await page.locator('#wl-email').fill(email);
    await page.locator('#wl-phone').fill('07700900123');
    await page.locator('#wl-submit-btn').click();

    await expect(page.locator('#toastEl.on')).toContainText(
      "You're already on the waiting list for this block.",
      { timeout: 15000 }
    );
    // Still exactly one row — the refusal did not half-write anything.
    expect(await getBlockWaitCount(blockId)).toBe(1);
  });

  // ── WL-04 ────────────────────────────────────────────────────────────────
  test('WL-04 — a freed seat stays hidden from the public while anyone is waiting', async ({ page }) => {
    const email = uniqueEmail('reserve');
    createdEmails.push(email);

    // One seat physically free, one person already queueing for it.
    await seedQueuedJoinerThenFreeASeat(page, {
      email, firstName: 'Queue', lastName: 'Holder', phone: '07700900123'
    });

    await page.goto(APP_PATH);
    const card = wlCard(page);
    await expect(card, 'a seat is free but spoken for — the public must still see Full')
      .toContainText('Block full');
    await expect(card.locator('button.book-btn').first()).toHaveText('Join Waiting List');
    await expect(card).toContainText('1 person on the waiting list');

    // Remove the waiter and the same seat becomes public again.
    await clearWaitlistForBlock(blockId);
    await page.goto(APP_PATH);
    const freed = wlCard(page);
    await expect(freed).toContainText('1 space left');
    await expect(freed.locator('button.book-btn').first()).toHaveText('Book Current Block');
  });

  // ── WL-05 ────────────────────────────────────────────────────────────────
  test('WL-05 — a valid offer link prefills the booking form and locks the email', async ({ page }) => {
    const email = uniqueEmail('offer');
    createdEmails.push(email);

    await seedQueuedJoinerThenFreeASeat(page, {
      email, firstName: 'Olivia', lastName: 'Reed', phone: '07700900999'
    });

    const row = await getWaitlistRow(blockId, email);
    const token = await offerWaitlistRowDirect(row.id);
    expect(token, 'a hold should mint a token').toBeTruthy();

    await page.goto(`${APP_PATH}&offer=${token}`);
    await expect(page.locator('#overlay.on')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#wl-reserved-banner')).toBeVisible();
    await expect(page.locator('#b-firstname')).toHaveValue('Olivia');
    await expect(page.locator('#b-lastname')).toHaveValue('Reed');
    await expect(page.locator('#b-email')).toHaveValue(email);
    await expect(page.locator('#b-phone')).toHaveValue('07700900999');

    // The email is the identity the hold is bound to — it must not be editable.
    await expect(page.locator('#b-email')).toHaveAttribute('readonly', /.*/);

    // The token is a bearer credential for one held space: it must not survive
    // in the address bar for history or a copied link to leak.
    expect(page.url()).not.toContain('offer=');

    // Closing the modal must drop the offer, so the next normal open is normal.
    await page.locator('#overlay .mclose').click();
    expect(await page.evaluate(() => offerState)).toBeNull();
    await expect(page.locator('#wl-reserved-banner')).toBeHidden();
  });

  // ── WL-06 ────────────────────────────────────────────────────────────────
  test('WL-06 — a junk offer link says so and leaves the page usable', async ({ page }) => {
    await page.goto(`${APP_PATH}&offer=11111111-2222-3333-4444-555555555555`);

    await expect(page.locator('#toastEl.on')).toContainText(
      'That booking link is no longer valid.',
      { timeout: 15000 }
    );
    await expect(page.locator('#overlay.on')).toHaveCount(0);
    expect(page.url()).not.toContain('offer=');
    // The schedule still works — a dead link is not a dead page.
    await expect(wlCard(page).locator('button.book-btn').first()).toHaveText('Book Current Block');
  });

  // ── WL-07 ────────────────────────────────────────────────────────────────
  test('WL-07 — the offer token books past a full block and consumes the hold', async ({ page }) => {
    const email = uniqueEmail('book');
    createdEmails.push(email);

    await resetPaymentMode();          // bank transfer — no Stripe redirect
    await seedQueuedJoinerThenFreeASeat(page, {
      email, firstName: 'Nadia', lastName: 'Frost', phone: '07700900321'
    });

    const row = await getWaitlistRow(blockId, email);
    const token = await offerWaitlistRowDirect(row.id);

    await page.goto(`${APP_PATH}&offer=${token}`);
    await expect(page.locator('#wl-reserved-banner')).toBeVisible({ timeout: 15000 });

    // Every field is already filled by the offer link, and the email is
    // readonly, so this continues rather than retyping.
    await page.locator('#step-1 .step-btn').click();

    // She is a FIRST-TIME client who happens to have a customer row, because
    // join_waitlist created one when she joined the queue. The health form
    // must still be asked for. This assertion is the regression guard for the
    // review finding: the old "does an email exist" test skipped PAR-Q here,
    // and kept skipping it on every booking she made afterwards.
    await expect(
      page.locator('#step-2a'),
      'a waiting-list joiner with no PAR-Q on file must still be asked the health questions'
    ).toBeVisible({ timeout: 15000 });
    await fillStep2Medical(page, { age: 41, printName: 'Nadia Frost' });
    await fillStep2Emergency(page);
    await agreeAndReserve(page);

    await expect(page.locator('#success-view.on')).toBeVisible({ timeout: 20000 });

    const customer = await getCustomerByEmail(email);
    const { rows } = await getPool().query(
      `SELECT id, status FROM bookings WHERE block_id = $1 AND customer_id = $2`,
      [blockId, customer.id]
    );
    expect(rows.length, 'the held space should now be a real booking').toBe(1);
    expect(rows[0].status).toBe('reserved');

    const parq = await getParqByCustomerId(customer.id);
    expect(parq, 'the health form she filled in must actually be on file').toBeTruthy();

    // She must still read as a first-time client after this, her first booking.
    // Labelling her 'returning' here would permanently disarm the dashboard's
    // missing-PAR-Q warning, which only fires on customer_type = 'new'.
    const customerRow = await getCustomerById(customer.id);   // getCustomerByEmail omits customer_type
    expect(customerRow.customer_type, 'a first booking must not relabel her as returning').toBe('new');

    // The hold is consumed only after the booking exists, so it must be gone.
    expect(await getWaitlistRow(blockId, email)).toBeNull();
    expect(await getBlockWaitCount(blockId)).toBe(0);
  });
});
