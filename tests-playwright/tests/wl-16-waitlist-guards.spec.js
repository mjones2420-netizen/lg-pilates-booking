// tests/wl-16-waitlist-guards.spec.js
//
// WL (Waiting List) — server-side guards that no UI spec reaches (#76).
//
//   WL-16  An offer link used by a different customer is refused, and the hold survives
//   WL-17  The "someone joined" alert to Louise is sent once per waitlist entry
//   WL-18  The "a space is yours" email is sent once per offer; release + re-offer allows a fresh one
//
// Why these matter
//   WL-16: the offer link is a bearer credential in an email. The booking
//   form locks the email field, but the DB is the real gate — a forwarded or
//   leaked link must be useless to anyone but the person it was offered to.
//   WL-17/18: send-email claims a one-shot stamp on the waitlist row before
//   sending (same pattern as SEC-10 for bookings), so a repeated click or a
//   scripted replay can't spam Louise or the customer.
//
// All email calls use isTest: true — on the test project that skips Resend
// entirely, so nothing is delivered to anyone.
//
// Isolation: own class + block (cap 2), deleted in afterAll — shared fixture
// blocks are never touched (#101). Serial, because the tests share one
// queued customer whose hold state they move through in order.

const { test, expect } = require('@playwright/test');
const { createClient } = require('@supabase/supabase-js');
const { sb } = require('./helpers/supabase');
const { getAdminJwt } = require('./helpers/admin-jwt');
const {
  getPool,
  setBlockBookedCount,
  deleteCustomerCascade,
  getCustomerByEmail,
  getWaitlistRow,
  setSetting,
} = require('./helpers/admin-db');

const SUPABASE_URL = process.env.TEST_SUPABASE_URL;
const ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY;

// Same baseline as SEC-10 / SE-10 / SE-11 — keep in sync with those specs.
const ORIG_ADMIN_EMAIL = 'mjones970@live.co.uk';

const CAP = 2;
const QUEUED_EMAIL = 'wl16-queued@test.example';
const OTHER_EMAIL = 'wl16-other@test.example';

let classId = null;
let blockId = null;
let waitlistId = null;

function sendEmail(body, bearer) {
  return fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearer}`,
    },
    body: JSON.stringify({ ...body, isTest: true }),
  });
}

/** A client that acts as the logged-in admin, for the admin-only RPCs. */
async function adminClient() {
  const jwt = await getAdminJwt();
  return {
    jwt,
    client: createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    }),
  };
}

test.describe('WL — waiting list server-side guards (#76)', () => {
  test.skip(!SUPABASE_URL || !ANON_KEY, 'TEST_SUPABASE_URL / TEST_SUPABASE_ANON_KEY not set');
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    const pool = getPool();
    const cls = await pool.query(
      `INSERT INTO classes (name, level, day, time, end_time, venue, loc)
       VALUES ('WL16 Guard Class', 'Mixed', 'Sunday', '8:00pm', '9:00pm', 'WL16 Venue', 'Baildon')
       RETURNING id`
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

    // Queue one person: join while full (join_waitlist refuses otherwise),
    // then free a seat so there is one to offer. Joined over pg — anon can't
    // call join_waitlist since #106, and the throttled function would spend
    // the per-IP budget.
    await setBlockBookedCount(blockId, CAP);
    await pool.query(
      'SELECT * FROM join_waitlist($1, $2, $3, $4, $5)',
      [blockId, 'Queued', 'Person', QUEUED_EMAIL, '07700900111']
    );
    await setBlockBookedCount(blockId, CAP - 1);
    waitlistId = (await getWaitlistRow(blockId, QUEUED_EMAIL)).id;

    await setSetting('admin_email', ORIG_ADMIN_EMAIL);
  });

  test.afterAll(async () => {
    const pool = getPool();
    for (const email of [QUEUED_EMAIL, OTHER_EMAIL]) {
      const c = await getCustomerByEmail(email);
      if (c) await deleteCustomerCascade(c.id);
    }
    if (classId != null) {
      await pool.query(`DELETE FROM waitlist WHERE block_id IN (SELECT id FROM blocks WHERE class_id = $1)`, [classId]);
      await pool.query(`DELETE FROM bookings WHERE class_id = $1`, [classId]);
      await pool.query(`DELETE FROM blocks WHERE class_id = $1`, [classId]);
      await pool.query(`DELETE FROM classes WHERE id = $1`, [classId]);
    }
    // Baseline state — restored, never deleted (smoke-01 asserts it).
    await setSetting('admin_email', ORIG_ADMIN_EMAIL);
  });

  // ── WL-16 ────────────────────────────────────────────────────────────────
  test('WL-16 — an offer link used by a different customer is refused, and the hold survives', async () => {
    const { client } = await adminClient();
    const { data: token, error: offerErr } = await client.rpc('offer_waitlist_space', { p_waitlist_id: waitlistId });
    expect(offerErr, 'the admin offer should succeed').toBeNull();
    expect(token).toBeTruthy();

    // Someone else — a real customer row, but not the person offered.
    const { data: otherId, error: upErr } = await sb.rpc('upsert_customer', {
      p_first_name: 'Other', p_last_name: 'Person', p_email: OTHER_EMAIL,
      p_phone: '07700900222', p_customer_type: 'new',
    });
    expect(upErr).toBeNull();

    const { error: bookErr } = await sb.rpc('book_if_available', {
      p_block_id: blockId, p_class_id: classId, p_customer_id: otherId,
      p_amount_due: 10, p_offer_token: token,
    });
    expect(bookErr, 'a stranger holding the link must not be able to book').not.toBeNull();
    expect(bookErr.message).toContain('WL_TOKEN_MISMATCH');

    // Nothing moved: no booking, and the real person's hold is still live.
    const { rows } = await getPool().query(
      'SELECT COUNT(*)::int AS n FROM bookings WHERE block_id = $1', [blockId]
    );
    expect(rows[0].n, 'no booking was written').toBe(0);
    const row = await getWaitlistRow(blockId, QUEUED_EMAIL);
    expect(row.status).toBe('offered');
    expect(row.offer_token).toBe(token);
  });

  // ── WL-17 ────────────────────────────────────────────────────────────────
  test('WL-17 — the join alert to Louise is sent once per waitlist entry', async () => {
    const first = await sendEmail({ type: 'waitlist_joined_alert', waitlist_id: waitlistId }, ANON_KEY);
    expect(first.status, 'the first alert goes out').toBe(200);

    const second = await sendEmail({ type: 'waitlist_joined_alert', waitlist_id: waitlistId }, ANON_KEY);
    expect(second.status, 'a repeat for the same entry is refused').toBe(429);
  });

  // ── WL-18 ────────────────────────────────────────────────────────────────
  test('WL-18 — the offer email is sent once per offer; release + re-offer allows a fresh one', async () => {
    const { jwt, client } = await adminClient();

    // In a full run WL-16 leaves a live, un-emailed offer. Run on its own
    // (-g "WL-18"), there's none yet — make one, so the test stands alone.
    if ((await getWaitlistRow(blockId, QUEUED_EMAIL)).status !== 'offered') {
      const { error: offerErr } = await client.rpc('offer_waitlist_space', { p_waitlist_id: waitlistId });
      expect(offerErr).toBeNull();
    }

    const first = await sendEmail({ type: 'waitlist_offer', waitlist_id: waitlistId }, jwt);
    expect(first.status, 'the first offer email goes out').toBe(200);

    const repeat = await sendEmail({ type: 'waitlist_offer', waitlist_id: waitlistId }, jwt);
    expect(repeat.status, 'a repeat for the same offer is refused').toBe(429);

    // Release, then offer again: a new token, so a new email is allowed.
    const { error: relErr } = await client.rpc('release_waitlist_hold', { p_waitlist_id: waitlistId });
    expect(relErr).toBeNull();
    const { error: reofferErr } = await client.rpc('offer_waitlist_space', { p_waitlist_id: waitlistId });
    expect(reofferErr).toBeNull();

    const fresh = await sendEmail({ type: 'waitlist_offer', waitlist_id: waitlistId }, jwt);
    expect(fresh.status, 'a re-offer gets its own email').toBe(200);
  });
});
