// tests/wl-23-waitlist-email-confirm.spec.js
//
// WL (Waiting List) — email confirmation before a join counts (#110, option C).
//
// Filling in the join form only stores a REQUEST (request_waitlist_join) and
// emails a link. The link (?wl_confirm=TOKEN → confirm_waitlist_request) is
// what puts someone on the list, re-checking everything at that moment.
// WL-02 (wl-01 spec) covers the happy path end to end in the browser.
//
//   WL-23  A request is invisible: no row, no customer, no seat held, and the
//          public cannot read requests or create one without the throttle
//   WL-24  Clicking the link twice is harmless: one row, "already" message
//   WL-25  An expired link says so and queues nothing
//   WL-26  A seat freed meanwhile: "a space is free" → OK opens the booking box
//   WL-27  The list filled meanwhile: plain-English refusal, nothing queued
//   WL-28  Resends reuse the same link, keep the first details, stop after three
//   WL-29  Confirming never rewrites an existing customer's name or phone
//   WL-30  Practice copy (test project): a button stands in for the email
//          (Training Hub lesson 1.5); never given out without the test secret
//
// Isolation: own class + block (cap 2), deleted in afterAll — requests go with
// the block (ON DELETE CASCADE). Requests are created over pg rather than the
// throttled Edge Function so the suite's per-IP budget is never spent.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { sb } = require('./helpers/supabase');
const {
  getPool,
  setBlockBookedCount,
  deleteCustomerCascade,
  getCustomerByEmail,
  getCustomerById,
  clearWaitlistForBlock,
  getWaitlistRequest,
  getWaitlistRow,
  getBlockWaitCount,
  resetPaymentMode
} = require('./helpers/admin-db');

const APP_URL = process.env.TEST_APP_URL;
const CLASS_NAME = 'Waitlist Confirm Spec Class';
const CAP = 2;

let classId = null;
let blockId = null;
const createdEmails = [];

function uniqueEmail(tag) {
  const e = `wlc-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.example`;
  createdEmails.push(e);
  return e;
}

/** request_waitlist_join over pg. Returns {request_id, is_resend}. */
async function requestJoin(email, { firstName = 'Rita', lastName = 'Request', phone = '07700900123' } = {}) {
  const { rows } = await getPool().query(
    'SELECT * FROM request_waitlist_join($1, $2, $3, $4, $5)',
    [blockId, firstName, lastName, email, phone]
  );
  return rows[0];
}

async function joinDirect(email) {
  await getPool().query(
    'SELECT * FROM join_waitlist($1, $2, $3, $4, $5)',
    [blockId, 'Queue', 'Filler', email, '07700900123']
  );
}

async function gotoConfirm(page, token) {
  await page.goto(`${APP_PATH}&wl_confirm=${token}`);
  await expect(
    page.locator('#test-mode-banner.on'),
    'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
  ).toBeVisible({ timeout: 10000 });
}

test.describe('WL — waiting list email confirmation (#110)', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — WL specs require the app to be served.');

  test.beforeAll(async () => {
    const pool = getPool();
    const cls = await pool.query(
      `INSERT INTO classes (name, level, day, time, end_time, venue, loc)
       VALUES ($1, 'Mixed', 'Saturday', '9:00am', '10:00am', 'Confirm Spec Venue', 'Baildon')
       RETURNING id`,
      [CLASS_NAME]
    );
    classId = cls.rows[0].id;
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
    if (blockId != null) await clearWaitlistForBlock(blockId);
    for (const email of createdEmails) {
      const c = await getCustomerByEmail(email);
      if (c) await deleteCustomerCascade(c.id);
    }
    if (classId != null) {
      await pool.query(`DELETE FROM waitlist WHERE block_id IN (SELECT id FROM blocks WHERE class_id = $1)`, [classId]);
      await pool.query(`DELETE FROM bookings WHERE class_id = $1`, [classId]);
      await pool.query(`DELETE FROM blocks WHERE class_id = $1`, [classId]);
      await pool.query(`DELETE FROM classes WHERE id = $1`, [classId]);
    }
  });

  test.beforeEach(async () => {
    await clearWaitlistForBlock(blockId);
    await setBlockBookedCount(blockId, CAP);   // full: the only state you can join from
  });

  // ── WL-23 ────────────────────────────────────────────────────────────────
  test('WL-23 — a request is invisible until confirmed, and the public cannot reach requests', async () => {
    const email = uniqueEmail('invisible');
    const r = await requestJoin(email);
    expect(r.is_resend).toBe(false);

    expect(await getWaitlistRow(blockId, email), 'no waitlist row yet').toBeNull();
    expect(await getCustomerByEmail(email), 'no customer created yet').toBeNull();
    expect(await getBlockWaitCount(blockId), 'no seat held').toBe(0);

    // The table and the request function are server-only.
    const read = await sb.from('waitlist_requests').select('token');
    expect(read.error, 'anon must not read requests (they hold the tokens)').not.toBeNull();
    const direct = await sb.rpc('request_waitlist_join', {
      p_block_id: blockId, p_first_name: 'A', p_last_name: 'B', p_email: uniqueEmail('anon'), p_phone: '07700900123',
    });
    expect(direct.error, 'anon must go through the throttled function').not.toBeNull();
    expect(direct.error.message).toMatch(/permission denied/i);
  });

  // ── WL-24 ────────────────────────────────────────────────────────────────
  test('WL-24 — clicking the link twice is harmless', async ({ page }) => {
    const email = uniqueEmail('twice');
    await requestJoin(email);
    const req = await getWaitlistRequest(blockId, email);

    const first = await sb.rpc('confirm_waitlist_request', { p_token: req.token });
    expect(first.data[0].outcome).toBe('joined');
    expect(first.data[0].queue_position).toBe(1);

    await gotoConfirm(page, req.token);
    await expect(page.locator('#notice-overlay.on #notice-msg'))
      .toHaveText("You're already on the waiting list — you're number 1 in the queue.", { timeout: 15000 });
    await expect(page.locator('#notice-box')).toHaveClass(/notice-good/);
    expect(await getBlockWaitCount(blockId), 'still exactly one place').toBe(1);
  });

  // ── WL-25 ────────────────────────────────────────────────────────────────
  test('WL-25 — an expired link says so and queues nothing', async ({ page }) => {
    const email = uniqueEmail('expired');
    await requestJoin(email);
    await getPool().query(
      `UPDATE waitlist_requests SET expires_at = now() - interval '1 hour' WHERE block_id = $1 AND email = $2`,
      [blockId, email]
    );
    const req = await getWaitlistRequest(blockId, email);

    await gotoConfirm(page, req.token);
    await expect(page.locator('#notice-overlay.on #notice-msg'))
      .toContainText('That link has expired.', { timeout: 15000 });
    expect(await getWaitlistRow(blockId, email)).toBeNull();
    expect(await getBlockWaitCount(blockId)).toBe(0);
  });

  // ── WL-26 ────────────────────────────────────────────────────────────────
  test('WL-26 — a seat freed meanwhile points them at booking instead', async ({ page }) => {
    await resetPaymentMode();
    const email = uniqueEmail('freed');
    await requestJoin(email);
    const req = await getWaitlistRequest(blockId, email);

    // Someone cancels before the link is clicked, and nobody is queued.
    await setBlockBookedCount(blockId, CAP - 1);

    await gotoConfirm(page, req.token);
    await expect(page.locator('#notice-overlay.on #notice-msg'))
      .toContainText("Good news — a space has opened up, so you don't need the waiting list.", { timeout: 15000 });
    await expect(page.locator('#notice-box')).toHaveClass(/notice-good/);

    await page.locator('#notice-ok').click();
    await expect(page.locator('#overlay.on'), 'OK opens the booking box for that block').toBeVisible();

    expect(await getWaitlistRow(blockId, email), 'not queued — there is a free seat').toBeNull();
    const after = await getWaitlistRequest(blockId, email);
    expect(after.confirmed_at, 'left unconfirmed so the link still works if it fills again').toBeNull();
  });

  // ── WL-27 ────────────────────────────────────────────────────────────────
  test('WL-27 — a list that filled meanwhile is refused in plain English', async ({ page }) => {
    const email = uniqueEmail('late');
    await requestJoin(email);
    const req = await getWaitlistRequest(blockId, email);

    // Two others join first: the list is now as long as the class (cap 2).
    await joinDirect(uniqueEmail('fill1'));
    await joinDirect(uniqueEmail('fill2'));
    expect(await getBlockWaitCount(blockId)).toBe(CAP);

    await gotoConfirm(page, req.token);
    await expect(page.locator('#notice-overlay.on #notice-msg'))
      .toContainText('the waiting list filled up before you confirmed', { timeout: 15000 });
    expect(await getWaitlistRow(blockId, email)).toBeNull();
    expect(await getBlockWaitCount(blockId)).toBe(CAP);
  });

  // ── WL-28 ────────────────────────────────────────────────────────────────
  test('WL-28 — resends reuse the same link, keep the first details and stop after three', async () => {
    const email = uniqueEmail('resend');
    const first = await requestJoin(email);
    const token = (await getWaitlistRequest(blockId, email)).token;

    for (let i = 2; i <= 4; i++) {
      // Different details each time: a resend must not be able to swap them.
      const again = await requestJoin(email, { firstName: 'Swapped', lastName: 'Details', phone: '07700900999' });
      expect(again.request_id, 'same request, not a new one').toBe(first.request_id);
      expect(again.is_resend).toBe(true);
    }
    const req = await getWaitlistRequest(blockId, email);
    expect(req.send_count).toBe(4);
    expect(req.token, 'the link in the first email still works').toBe(token);
    const { rows } = await getPool().query(
      'SELECT first_name, phone FROM waitlist_requests WHERE id = $1', [first.request_id]
    );
    expect(rows[0].first_name, 'first details kept').toBe('Rita');
    expect(rows[0].phone).toBe('07700900123');

    await expect(requestJoin(email)).rejects.toThrow(/WL_RESEND_LIMIT/);
  });

  // ── WL-29 ────────────────────────────────────────────────────────────────
  test('WL-29 — confirming never rewrites an existing customer', async ({ page }) => {
    const email = uniqueEmail('existing');
    await getPool().query(
      `SELECT upsert_customer('Real', 'Owner', $1, '07700900111', 'returning')`, [email]
    );

    // Someone else fills in the form with this email and different details.
    await requestJoin(email, { firstName: 'Fake', lastName: 'Name', phone: '07700900999' });
    const req = await getWaitlistRequest(blockId, email);

    await gotoConfirm(page, req.token);
    await expect(page.locator('#wl-success-view.on')).toBeVisible({ timeout: 15000 });

    const c = await getCustomerById((await getCustomerByEmail(email)).id);
    expect(c.first_name).toBe('Real');
    expect(c.last_name).toBe('Owner');
    expect(c.phone, 'phone untouched by the request').toBe('07700900111');
    expect(c.customer_type, 'still returning').toBe('returning');
    expect(await getWaitlistRow(blockId, email)).toBeTruthy();
  });

  // ── WL-30 ────────────────────────────────────────────────────────────────
  test('WL-30 — the practice copy shows a confirmation-link button instead of an email', async ({ page }) => {
    const email = uniqueEmail('practice');
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 10000 });

    const card = page.locator('.card').filter({ has: page.locator('.card-when-name', { hasText: CLASS_NAME }) }).first();
    await card.locator('button.book-btn').first().click();
    await page.locator('#wl-firstname').fill('Practice');
    await page.locator('#wl-lastname').fill('Louise');
    await page.locator('#wl-email').fill(email);
    await page.locator('#wl-phone').fill('07700900123');
    await page.locator('#wl-submit-btn').click();

    await expect(page.locator('#wl-check-view.on')).toBeVisible({ timeout: 15000 });
    const link = page.locator('#wl-practice-link');
    await expect(link).toBeVisible();
    const req = await getWaitlistRequest(blockId, email);
    expect(await link.getAttribute('href')).toContain(`wl_confirm=${req.token}`);

    await link.click();
    await expect(page.locator('#wl-success-view.on')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#wl-pos')).toHaveText('#1');
    expect(await getWaitlistRow(blockId, email)).toBeTruthy();
  });
});
