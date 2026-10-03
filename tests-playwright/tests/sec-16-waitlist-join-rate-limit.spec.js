// SEC-16 — join-waitlist-throttled rate-limits the public waiting-list join (#106)
//          and, since #110, only stores a request until the emailed link is clicked
//
// Every waitlist row takes a seat off public sale (migration 28's reservation
// rule) and emails Louise, so an unthrottled anon join_waitlist let a loop of
// fake emails lock a class out of public booking. Migrations 29 + 30 put a
// per-IP throttled Edge Function in front of it and revoke the direct anon
// EXECUTE — the #35 lesson: the revoke is the half that actually closes it.
//
// index.html always passes isTest:true on the test site, which bypasses the
// throttle (only where TEST_BYPASS_ENABLED is set — never on prod), so the
// rest of the suite can't trip it. This spec proves the real path by calling
// the function directly with isTest left off.
//
// Requires migrations 29 + 30 + 33 and join-waitlist-throttled deployed to test.
//
// Isolation: builds its own class + block (cap 2) and deletes it in afterAll,
// same as the WL specs — shared fixture blocks are never touched (#101). The
// waitlist_join bucket has no other consumer, so it is cleared outright.

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const {
  getPool,
  setBlockBookedCount,
  deleteCustomerCascade,
  getCustomerByEmail,
  getBlockWaitCount,
} = require('./helpers/admin-db');

const SUPABASE_URL = process.env.TEST_SUPABASE_URL;
const ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY;

const MAX_ATTEMPTS = 10;
const CAP = 2;
const EMAIL = 'sec16-join@test.example';

let classId = null;
let blockId = null;

function callJoin(fields, isTest, extraHeaders = {}) {
  const body = isTest === undefined ? fields : { ...fields, isTest };
  return fetch(`${SUPABASE_URL}/functions/v1/join-waitlist-throttled`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ANON_KEY}`,
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

test.describe('SEC-16 — join-waitlist-throttled rate limit (#106)', () => {
  test.skip(!SUPABASE_URL || !ANON_KEY, 'TEST_SUPABASE_URL / TEST_SUPABASE_ANON_KEY not set');
  // Serial: 16c and 16d both spend the one real-IP budget, so running them
  // side by side would make each other's counts wrong.
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    const pool = getPool();
    const cls = await pool.query(
      `INSERT INTO classes (name, level, day, time, end_time, venue, loc)
       VALUES ('Sec16 Throttle Class', 'Mixed', 'Sunday', '7:00am', '8:00am', 'Sec16 Venue', 'Baildon')
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
  });

  test.afterAll(async () => {
    const pool = getPool();
    const c = await getCustomerByEmail(EMAIL);
    if (c) await deleteCustomerCascade(c.id);
    if (classId != null) {
      await pool.query(`DELETE FROM waitlist WHERE block_id IN (SELECT id FROM blocks WHERE class_id = $1)`, [classId]);
      await pool.query(`DELETE FROM bookings WHERE class_id = $1`, [classId]);
      await pool.query(`DELETE FROM blocks WHERE class_id = $1`, [classId]);
      await pool.query(`DELETE FROM classes WHERE id = $1`, [classId]);
    }
  });

  // Cleared on entry as well as exit: an aborted run skips afterEach and would
  // otherwise leave this IP part-way through its budget for the next run.
  test.beforeEach(async () => {
    await getPool().query("DELETE FROM rate_limits WHERE bucket = 'waitlist_join'");
  });

  test.afterEach(async () => {
    await getPool().query("DELETE FROM rate_limits WHERE bucket = 'waitlist_join'");
  });

  test('SEC-16a — anon can no longer call join_waitlist directly', async () => {
    await setBlockBookedCount(blockId, CAP);
    const { error } = await sb.rpc('join_waitlist', {
      p_block_id: blockId, p_first_name: 'Sec', p_last_name: 'Sixteen',
      p_email: EMAIL, p_phone: '07700900123',
    });
    expect(error, 'the direct anon route must be refused').not.toBeNull();
    // Specifically a permission refusal — WL_NOT_FULL or any other coded error
    // would mean the door is still open and the test passed by accident.
    expect(error.message).toMatch(/permission denied/i);
    expect(await getBlockWaitCount(blockId), 'nothing was queued').toBe(0);
  });

  test('SEC-16b — the function stores a request (no token back) and passes WL_* refusals through', async () => {
    await setBlockBookedCount(blockId, CAP);
    const fields = {
      blockId, firstName: 'Sec', lastName: 'Sixteen', email: EMAIL, phone: '07700900123',
    };

    // #110: a join is only a REQUEST until the emailed link is clicked.
    const ok = await callJoin(fields, true);
    expect(ok.status).toBe(200);
    const okText = await ok.text();
    const okBody = JSON.parse(okText);
    expect(okBody.data.request_id).toBeGreaterThan(0);
    expect(okBody.data.is_resend).toBe(false);
    expect(await getBlockWaitCount(blockId), 'nothing queued before confirmation').toBe(0);

    // The confirmation token must never come back to the caller, or a script
    // could confirm without owning the inbox.
    const { rows } = await getPool().query(
      'SELECT token FROM waitlist_requests WHERE id = $1', [okBody.data.request_id]
    );
    expect(okText).not.toContain(rows[0].token);

    // Same details again: a resend of the same request, not a second one.
    const again = await callJoin(fields, true);
    expect(again.status).toBe(200);
    const againBody = await again.json();
    expect(againBody.data.request_id).toBe(okBody.data.request_id);
    expect(againBody.data.is_resend).toBe(true);

    // Confirm it as the email owner would, then the DB's own refusal applies.
    const { data: conf } = await sb.rpc('confirm_waitlist_request', { p_token: rows[0].token });
    expect(conf[0].outcome).toBe('joined');
    expect(await getBlockWaitCount(blockId)).toBe(1);

    const dupe = await callJoin(fields, true);
    expect(dupe.status).toBe(400);
    expect((await dupe.json()).error).toBe('WL_DUPLICATE');
  });

  test('SEC-16f — the practice copy (test project) gets the confirmation token back', async () => {
    // Only on the test project: the token comes back solely when the server
    // holds TEST_BYPASS_ENABLED, which production never has. (A call without
    // isTest is not made here — it would hand a real email to Resend.)
    await setBlockBookedCount(blockId, CAP);
    const email = 'sec16f-practice@test.example';
    const fields = { blockId, firstName: 'Sec', lastName: 'Practice', email, phone: '07700900123' };
    try {
      const noFlag = await callJoin(fields, true);
      expect((await noFlag.json()).data.practice_token, 'not without practiceLink').toBeUndefined();

      const practice = await callJoin({ ...fields, practiceLink: true }, true);
      const body = await practice.json();
      const { rows } = await getPool().query(
        'SELECT token FROM waitlist_requests WHERE id = $1', [body.data.request_id]
      );
      expect(body.data.practice_token).toBe(rows[0].token);
    } finally {
      await getPool().query('DELETE FROM waitlist_requests WHERE email = $1', [email]);
    }
  });

  test('SEC-16c — same IP is throttled after the limit; isTest bypasses it', async () => {
    // A real block with blank fields: each call is refused WL_MISSING_FIELDS
    // before anything is written, but only after the throttle has counted it
    // — exactly what a scripted attacker's calls would do.
    const blank = { blockId, firstName: '', lastName: '', email: '', phone: '' };
    let lastStatus;
    for (let i = 0; i < MAX_ATTEMPTS + 1; i++) {
      const res = await callJoin(blank);
      lastStatus = res.status;
      const body = await res.json();
      if (i < MAX_ATTEMPTS) {
        expect(res.status, `attempt ${i + 1} should be let through the throttle`).toBe(400);
        expect(body.error).toBe('WL_MISSING_FIELDS');
      } else {
        expect(body.error).toBe('WL_RATE_LIMITED');
      }
    }
    expect(lastStatus, 'attempt beyond the limit must be refused').toBe(429);

    const bypassed = await callJoin(blank, true);
    expect(bypassed.status, 'isTest calls skip the throttle').toBe(400);
  });

  test('SEC-16d — a caller-supplied X-Forwarded-For does not buy a fresh budget', async () => {
    // The throttle keys on X-Forwarded-For's first entry. That is only safe
    // because Supabase's gateway replaces the header rather than appending to
    // it (verified session 99). If that ever changes, a script inventing a new
    // address per call would never be limited — this test is the tripwire.
    const blank = { blockId, firstName: '', lastName: '', email: '', phone: '' };
    let lastStatus;
    for (let i = 0; i < MAX_ATTEMPTS + 1; i++) {
      const res = await callJoin(blank, undefined, { 'X-Forwarded-For': `203.0.113.${i + 1}` });
      lastStatus = res.status;
    }
    expect(lastStatus, 'invented addresses must still share the real IP budget').toBe(429);
  });

  test('SEC-16e — the function applies the browser field rules itself', async () => {
    // The Edge Function is the only public way in, so a direct caller must
    // not get past the checks submitWaitlist makes — join_waitlist alone only
    // checks block + email, and upsert_customer would write a junk phone
    // onto a real customer's row.
    await setBlockBookedCount(blockId, CAP);
    const base = { blockId, firstName: 'Sec', lastName: 'Sixteen', email: EMAIL, phone: '07700900123' };
    // 16b may already have queued EMAIL; compare against where we started.
    const waitBefore = await getBlockWaitCount(blockId);

    const badPhone = await callJoin({ ...base, phone: '0' }, true);
    expect(badPhone.status).toBe(400);
    expect((await badPhone.json()).error).toBe('WL_INVALID_FIELDS');

    const badEmail = await callJoin({ ...base, email: 'not-an-email' }, true);
    expect((await badEmail.json()).error).toBe('WL_INVALID_FIELDS');

    const noName = await callJoin({ ...base, firstName: '   ' }, true);
    expect((await noName.json()).error).toBe('WL_MISSING_FIELDS');

    expect(await getBlockWaitCount(blockId), 'nothing was queued').toBe(waitBefore);
  });
});
