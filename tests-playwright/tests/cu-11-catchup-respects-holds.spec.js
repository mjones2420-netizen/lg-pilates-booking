// tests/cu-11-catchup-respects-holds.spec.js
//
// CU (Catch-Up Swaps) — waiting-list holds count as taken seats (migration 31).
//
// Louise's rule (session 99): when a seat has been offered to someone on the
// waiting list and they haven't booked yet, that seat can't take a catch-up
// visitor, even for one week. The reverse — offering a hold onto a date a
// catch-up already occupies — is deliberately still allowed, and the
// dashboard's over-capacity warning is what tells Louise to move the catch-up.
//
//   CU-11  The DB refuses a catch-up into a held seat (CU_HELD); allowed once the hold is released
//   CU-12  The class picker shows a held seat as FULL
//   CU-14  The week picker counts held seats alongside that week's catch-ups
//   CU-15  A save that races a new hold is refused with the plain-English CU_HELD message
//   CU-13  A hold offered onto a date a catch-up already occupies triggers the over-capacity warning
//
// Isolation: own class with two blocks (a hidden source block and a visible
// target block, cap 2) and its own customers, all deleted in afterAll. The
// shared fixture blocks and the CU-01 file's swaps are never touched.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');
const {
  getPool,
  setBlockBookedCount,
  deleteCustomerCascade,
  getCustomerByEmail,
  getWaitlistRow,
  clearWaitlistForBlock,
} = require('./helpers/admin-db');

const APP_URL = process.env.TEST_APP_URL;

const CAP = 2;
const CLASS_NAME = 'CU11 Hold Class';
const VISITOR_EMAIL = 'cu11-visitor@test.example';
const QUEUED_EMAIL = 'cu11-queued@test.example';

let classId = null;
let sourceBlockId = null;
let targetBlockId = null;
let visitorId = null;
let futureDates = [];

/** ISO session dates from the target block, using local date parts (BST-safe). */
function isoDatesFrom(startIso, weeks) {
  const out = [];
  const start = new Date(startIso + 'T00:00:00');
  for (let i = 0; i < weeks; i++) {
    const d = new Date(start.getTime() + i * 7 * 24 * 60 * 60 * 1000);
    out.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
  }
  return out;
}

/** Queues one person on the target block and offers them a seat, leaving
 *  `bookedAfter` seats booked. Default: one seat short of full, with that
 *  last seat held. */
async function holdTheLastSeat(page, { cap = CAP, bookedAfter = CAP - 1 } = {}) {
  // join_waitlist only accepts joins onto a full block, so fill it, join,
  // then free the seat(s) the offer needs.
  await setBlockBookedCount(targetBlockId, cap);
  await getPool().query(
    'SELECT * FROM join_waitlist($1, $2, $3, $4, $5)',
    [targetBlockId, 'Queued', 'Person', QUEUED_EMAIL, '07700900333']
  );
  await setBlockBookedCount(targetBlockId, bookedAfter);
  const row = await getWaitlistRow(targetBlockId, QUEUED_EMAIL);
  const err = await page.evaluate(async (id) => {
    const { error } = await sb.rpc('offer_waitlist_space', { p_waitlist_id: id });
    return error ? error.message : null;
  }, row.id);
  expect(err, 'the admin offer should succeed').toBeNull();
  return row.id;
}

/** Logs in fresh and waits until the dashboard has loaded this spec's data. */
async function reloadDashboard(page, expectedHeld) {
  await page.reload();
  await loginAsAdmin(page);
  await page.waitForFunction(
    ({ blockId, held, visitor }) => window.heldByBlock && (window.heldByBlock[blockId] || 0) === held
      && Array.isArray(window.blocks) && window.blocks.some((b) => b.id === blockId)
      && Array.isArray(window.bookings) && window.bookings.some((b) => b.customerId === visitor),
    { blockId: targetBlockId, held: expectedHeld, visitor: visitorId },
    { timeout: 10000 }
  );
}

async function openRecordSwap(page) {
  await page.locator('#dbnav-catchup').click();
  await expect(page.locator('#dbpage-catchup.on')).toBeVisible({ timeout: 5000 });
  await page.locator('button', { hasText: '+ Record swap' }).click();
  await expect(page.locator('#catchup-overlay.on')).toBeVisible({ timeout: 5000 });
}

async function callSwapRpc(page, classDate) {
  return page.evaluate(async (args) => {
    const { data, error } = await sb.rpc('record_catch_up_swap', args);
    return { data, error: error ? error.message : null };
  }, {
    p_customer_id: visitorId, p_source_block_id: sourceBlockId,
    p_target_block_id: targetBlockId, p_class_date: classDate, p_notes: null,
  });
}

test.describe('CU — catch-up swaps respect waiting-list holds', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — CU specs require the app to be served.');

  test.beforeAll(async () => {
    const pool = getPool();
    const cls = await pool.query(
      `INSERT INTO classes (name, level, day, time, end_time, venue, loc)
       VALUES ($1, 'Mixed', 'Sunday', '6:00am', '7:00am', 'CU11 Venue', 'Baildon')
       RETURNING id`,
      [CLASS_NAME]
    );
    classId = cls.rows[0].id;

    // Source: the visitor's "usual" block. Hidden — it only needs to exist.
    const src = await pool.query(
      `INSERT INTO blocks (class_id, start_date, end_date, weeks, dates, price, cap, booked, wait, visible, status)
       VALUES ($1, CURRENT_DATE, (CURRENT_DATE + INTERVAL '35 days')::date, 6,
               ARRAY['a','b','c','d','e','f'], 10, 12, 0, 0, false, 'active')
       RETURNING id`,
      [classId]
    );
    sourceBlockId = src.rows[0].id;

    const tgt = await pool.query(
      `INSERT INTO blocks (class_id, start_date, end_date, weeks, dates, price, cap, booked, wait, visible, status)
       VALUES ($1, (CURRENT_DATE + INTERVAL '7 days')::date, (CURRENT_DATE + INTERVAL '42 days')::date, 6,
               ARRAY['1 Jan','8 Jan','15 Jan','22 Jan','29 Jan','5 Feb'], 10, $2, 0, 0, true, 'upcoming')
       RETURNING id, start_date`,
      [classId, CAP]
    );
    targetBlockId = tgt.rows[0].id;
    const s = tgt.rows[0].start_date;
    const startIso = s.getFullYear() + '-' + String(s.getMonth() + 1).padStart(2, '0') + '-' + String(s.getDate()).padStart(2, '0');
    futureDates = isoDatesFrom(startIso, 6);

    const cust = await pool.query(
      `INSERT INTO customers (first_name, last_name, email, phone, customer_type)
       VALUES ('Visiting', 'Client', $1, '07700900444', 'returning')
       RETURNING id`,
      [VISITOR_EMAIL]
    );
    visitorId = cust.rows[0].id;

    // The swap form only lists customers with a booking, and offers their
    // booked block as the "usual class".
    await pool.query(
      `INSERT INTO bookings (class_id, block_id, customer_id, status, amount_due)
       VALUES ($1, $2, $3, 'confirmed', 10)`,
      [classId, sourceBlockId, visitorId]
    );
  });

  test.afterAll(async () => {
    const pool = getPool();
    for (const email of [VISITOR_EMAIL, QUEUED_EMAIL]) {
      const c = await getCustomerByEmail(email);
      if (c) await deleteCustomerCascade(c.id);
    }
    if (classId != null) {
      await pool.query(`DELETE FROM catch_up_swaps WHERE target_block_id IN (SELECT id FROM blocks WHERE class_id = $1)
                                                    OR source_block_id IN (SELECT id FROM blocks WHERE class_id = $1)`, [classId]);
      await pool.query(`DELETE FROM waitlist WHERE block_id IN (SELECT id FROM blocks WHERE class_id = $1)`, [classId]);
      await pool.query(`DELETE FROM bookings WHERE class_id = $1`, [classId]);
      await pool.query(`DELETE FROM blocks WHERE class_id = $1`, [classId]);
      await pool.query(`DELETE FROM classes WHERE id = $1`, [classId]);
    }
  });

  test.beforeEach(async ({ page }) => {
    // Known start: no holds, no swaps, target one seat short of full.
    await clearWaitlistForBlock(targetBlockId);
    await getPool().query('DELETE FROM catch_up_swaps WHERE target_block_id = $1', [targetBlockId]);
    const q = await getCustomerByEmail(QUEUED_EMAIL);
    if (q) await deleteCustomerCascade(q.id);
    await getPool().query('UPDATE blocks SET cap = $2 WHERE id = $1', [targetBlockId, CAP]);
    await setBlockBookedCount(targetBlockId, CAP - 1);

    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });
    await loginAsAdmin(page);
  });

  // ── CU-11 ────────────────────────────────────────────────────────────────
  test('CU-11 — the DB refuses a catch-up into a held seat, and allows it once the hold is released', async ({ page }) => {
    const waitlistId = await holdTheLastSeat(page);

    const refused = await callSwapRpc(page, futureDates[1]);
    expect(refused.error).toContain('CU_HELD');
    const { rows } = await getPool().query('SELECT COUNT(*)::int AS n FROM catch_up_swaps WHERE target_block_id = $1', [targetBlockId]);
    expect(rows[0].n, 'no swap was written').toBe(0);

    const relErr = await page.evaluate(async (id) => {
      const { error } = await sb.rpc('release_waitlist_hold', { p_waitlist_id: id });
      return error ? error.message : null;
    }, waitlistId);
    expect(relErr).toBeNull();

    const allowed = await callSwapRpc(page, futureDates[1]);
    expect(allowed.error, 'with the hold released the seat is free again').toBeNull();
  });

  // ── CU-12 ────────────────────────────────────────────────────────────────
  test('CU-12 — the class picker shows a held seat as FULL', async ({ page }) => {
    await holdTheLastSeat(page);
    await reloadDashboard(page, 1);
    await openRecordSwap(page);

    // cap 2, booked 1, held 1 → no seat for a catch-up in any week.
    const opt = page.locator(`#cu-target-block option[value="${targetBlockId}"]`);
    await expect(opt).toContainText('FULL');
    await expect(opt).toBeDisabled();
  });

  // ── CU-14 ────────────────────────────────────────────────────────────────
  test('CU-14 — the week picker counts held seats alongside that week\'s catch-ups', async ({ page }) => {
    // cap 3, booked 1, one seat held → one seat left for catch-ups per week.
    await getPool().query('UPDATE blocks SET cap = 3 WHERE id = $1', [targetBlockId]);
    await holdTheLastSeat(page, { cap: 3, bookedAfter: 1 });
    // One catch-up already on week 2 uses that seat for that week only.
    await getPool().query(
      `INSERT INTO catch_up_swaps (customer_id, source_block_id, target_block_id, class_date)
       VALUES ($1, $2, $3, $4)`,
      [visitorId, sourceBlockId, targetBlockId, futureDates[1]]
    );
    await reloadDashboard(page, 1);
    await page.waitForFunction(
      (blockId) => Array.isArray(window.catchUpSwaps) && window.catchUpSwaps.some((s) => s.target_block_id === blockId),
      targetBlockId, { timeout: 5000 }
    );
    await openRecordSwap(page);

    await expect(page.locator(`#cu-target-block option[value="${targetBlockId}"]`)).toContainText('1 space');
    await page.locator('#cu-target-block').selectOption({ value: String(targetBlockId) });

    // Week 2: booked 1 + held 1 + catch-up 1 = 3 → FULL. Without the hold
    // counted it would wrongly show "1 space".
    const fullWeek = page.locator(`#cu-date option[value="${futureDates[1]}"]`);
    await expect(fullWeek).toContainText('FULL');
    await expect(fullWeek).toBeDisabled();
    const openWeek = page.locator(`#cu-date option[value="${futureDates[2]}"]`);
    await expect(openWeek).toContainText('1 space');
    await expect(openWeek).toBeEnabled();
  });

  // ── CU-15 ────────────────────────────────────────────────────────────────
  test('CU-15 — a save that races a new hold is refused with the CU_HELD message', async ({ page }) => {
    // The form is filled while the seat is still free…
    await reloadDashboard(page, 0);
    await openRecordSwap(page);
    await page.locator('#cu-customer').selectOption({ value: String(visitorId) });
    await expect(page.locator('#cu-source-block')).toHaveValue(String(sourceBlockId));
    await page.locator('#cu-target-block').selectOption({ value: String(targetBlockId) });
    await page.locator('#cu-date').selectOption({ value: futureDates[1] });

    // …then the seat is offered to the waiting list (e.g. from another tab),
    // so this page's picker is now out of date and only the DB knows.
    await holdTheLastSeat(page);

    await page.locator('#cu-btn').click();
    await expect(page.locator('#cu-err')).toContainText(
      'The free space in that class is being held for someone on the waiting list.',
      { timeout: 8000 }
    );
    const { rows } = await getPool().query('SELECT COUNT(*)::int AS n FROM catch_up_swaps WHERE target_block_id = $1', [targetBlockId]);
    expect(rows[0].n, 'no swap was written').toBe(0);
  });

  // ── CU-13 ────────────────────────────────────────────────────────────────
  test('CU-13 — a hold offered onto a date a catch-up already occupies triggers the over-capacity warning', async ({ page }) => {
    // The catch-up takes the last seat for one evening (allowed: no hold yet).
    const swap = await callSwapRpc(page, futureDates[1]);
    expect(swap.error).toBeNull();

    // Then Louise offers that seat for the whole block — still allowed.
    await holdTheLastSeat(page);

    await reloadDashboard(page, 1);
    const warnings = page.locator('#block-warnings');
    await expect(warnings).toContainText('catch-up swap that will exceed capacity', { timeout: 8000 });
    await expect(warnings).toContainText(CLASS_NAME);
  });
});
