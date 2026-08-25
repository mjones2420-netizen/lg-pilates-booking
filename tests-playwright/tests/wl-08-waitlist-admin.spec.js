// tests/wl-08-waitlist-admin.spec.js
//
// WL (Waiting List) — admin dashboard page (#75).
//
//   WL-08  The page groups queues by block, in join order, with live counts
//   WL-09  Offer space: mints a hold, and the DB refuses a second one
//   WL-10  Release hold puts them back in the queue and kills the token
//   WL-14  Copy link puts the live booking link on the clipboard
//   WL-11  Remove deletes the entry and drops blocks.wait
//   WL-12  Entries on an ended block are counted but not listed
//
// Isolation
//   Same posture as wl-01: this file builds its own class + blocks and deletes
//   them in afterAll. The fixture blocks are left alone deliberately — these
//   tests move seat counts and queue lengths, which is exactly the
//   cross-spec contamination #101 was spent removing.
//
// Rows are seeded with direct SQL rather than join_waitlist because the RPC
// (correctly) refuses to queue anyone while the block still has room, and
// several of these cases need a queue on a block that has a seat free.
// blocks.wait needs no manual resync — its trigger fires on direct writes.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');
const {
  getPool,
  clearWaitlistForBlock,
  getWaitlistRow,
  getBlockWaitCount,
  getCustomerByEmail,
  deleteCustomerCascade
} = require('./helpers/admin-db');

const APP_URL = process.env.TEST_APP_URL;

const CLASS_NAME = 'Waitlist Admin Spec Class';
const ENDED_CLASS_NAME = 'Waitlist Admin Ended Class';
const CAP = 10;

let classId = null, endedClassId = null;
let blockId = null, endedBlockId = null;
const createdEmails = [];
let seedSeq = 0;   // Date.now() alone can collide across same-millisecond seeds

/** Puts one person in this block's queue and returns their waitlist row id. */
async function seedQueued(blockId, first, last, tag, status) {
  const pool = getPool();
  const email = `wladm-${tag}-${Date.now()}-${++seedSeq}@test.example`;
  createdEmails.push(email);
  const c = await pool.query(
    `INSERT INTO customers (first_name,last_name,email,phone,customer_type)
     VALUES ($1,$2,$3,'07700 900100','new') RETURNING id`,
    [first, last, email]
  );
  const w = await pool.query(
    `INSERT INTO waitlist (block_id, customer_id, status, offer_token, offered_at)
     VALUES ($1,$2,$3,
             CASE WHEN $3 = 'offered' THEN gen_random_uuid() ELSE NULL END,
             $4) RETURNING id`,
    // gen_random_uuid() above, never a literal: waitlist_offer_token_unique is
    // a partial UNIQUE index on non-null tokens, so a fixed value turns a
    // second offered seed into a raw constraint violation.
    [blockId, c.rows[0].id, status || 'waiting',
     status === 'offered' ? new Date() : null]
  );
  return { waitlistId: w.rows[0].id, customerId: c.rows[0].id, email, name: `${first} ${last}` };
}

async function setBooked(id, n) {
  await getPool().query(`UPDATE blocks SET booked = $1 WHERE id = $2`, [n, id]);
}

/** Lands on the Waiting lists page with its data loaded. */
async function openWaitlistPage(page) {
  await loginAsAdmin(page);
  await page.evaluate(() => switchDashPage('waitlist'));
  // The page fetches on entry; wait for the fetch to land rather than a timer.
  await page.waitForFunction(
    () => !document.querySelector('#waitlist-list').textContent.includes('Loading'),
    null, { timeout: 15000 }
  );
}

/** Every panel on the page whose heading is `name` (normally 0 or 1). */
function groupsTitled(page, name) {
  return page.locator('#dbpage-waitlist .class-group').filter({
    has: page.locator('.class-group-title', { hasText: name })
  });
}

/** This spec's own block panel, never a stray one. */
function ownGroup(page) {
  return groupsTitled(page, CLASS_NAME).first();
}

test.describe('WL — waiting lists, admin page', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — WL specs require the app to be served.');

  test.beforeAll(async () => {
    const pool = getPool();
    const cls = await pool.query(
      `INSERT INTO classes (name, level, day, time, end_time, venue, loc)
       VALUES ($1,'Mixed','Saturday','8:00am','9:00am','Waitlist Admin Venue','Baildon')
       RETURNING id`, [CLASS_NAME]);
    classId = cls.rows[0].id;

    const blk = await pool.query(
      `INSERT INTO blocks (class_id, start_date, end_date, weeks, dates, price, cap, booked, wait, visible, status)
       VALUES ($1,(CURRENT_DATE + INTERVAL '10 days')::date,(CURRENT_DATE + INTERVAL '45 days')::date,
               6, ARRAY['1 Jan','8 Jan','15 Jan','22 Jan','29 Jan','5 Feb'], 60, $2, $2, 0, true, 'upcoming')
       RETURNING id`, [classId, CAP]);
    blockId = blk.rows[0].id;

    // A block that finished last week — its queue must not clutter the page.
    const ecls = await pool.query(
      `INSERT INTO classes (name, level, day, time, end_time, venue, loc)
       VALUES ($1,'Mixed','Sunday','8:00am','9:00am','Waitlist Admin Venue','Baildon')
       RETURNING id`, [ENDED_CLASS_NAME]);
    endedClassId = ecls.rows[0].id;
    const eblk = await pool.query(
      `INSERT INTO blocks (class_id, start_date, end_date, weeks, dates, price, cap, booked, wait, visible, status)
       VALUES ($1,(CURRENT_DATE - INTERVAL '50 days')::date,(CURRENT_DATE - INTERVAL '8 days')::date,
               6, ARRAY['1 Jan','8 Jan','15 Jan','22 Jan','29 Jan','5 Feb'], 60, $2, $2, 0, true, 'active')
       RETURNING id`, [endedClassId, CAP]);
    endedBlockId = eblk.rows[0].id;
  });

  test.afterAll(async () => {
    const pool = getPool();
    for (const email of createdEmails) {
      const c = await getCustomerByEmail(email);
      if (c) await deleteCustomerCascade(c.id);
    }
    for (const id of [classId, endedClassId]) {
      if (id == null) continue;
      await pool.query(`DELETE FROM waitlist WHERE block_id IN (SELECT id FROM blocks WHERE class_id=$1)`, [id]);
      await pool.query(`DELETE FROM bookings WHERE class_id=$1`, [id]);
      await pool.query(`DELETE FROM blocks WHERE class_id=$1`, [id]);
      await pool.query(`DELETE FROM classes WHERE id=$1`, [id]);
    }
  });

  test.beforeEach(async ({ page }) => {
    await clearWaitlistForBlock(blockId);
    await clearWaitlistForBlock(endedBlockId);
    await setBooked(blockId, CAP);

    await page.goto(APP_PATH);
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
    // Every action on this page is behind a confirm().
    page.on('dialog', d => d.accept());
  });

  // ── WL-08 ────────────────────────────────────────────────────────────────
  test('WL-08 — queues are grouped by block, in join order, with live counts', async ({ page }) => {
    const a = await seedQueued(blockId, 'Anna', 'One', 'a');
    const b = await seedQueued(blockId, 'Bella', 'Two', 'b');
    await seedQueued(blockId, 'Cara', 'Three', 'c');

    await openWaitlistPage(page);
    const grp = ownGroup(page);
    await expect(grp).toBeVisible();

    // Join order, oldest first — the queue is the whole point of the page.
    const rows = grp.locator('tbody tr');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText(a.name);
    await expect(rows.nth(1)).toContainText(b.name);
    await expect(rows.nth(2)).toContainText('Cara Three');
    await expect(rows.nth(0)).toContainText(a.email);

    // Full block, nobody holding: no seat to offer, and it says why.
    await expect(grp).toContainText('No seat free');
    await expect(grp).toContainText(`${CAP} / ${CAP} booked`);
    await expect(grp).toContainText('3 waiting');
    await expect(grp.locator('.act-offer[disabled]')).toHaveCount(3);
    await expect(grp.locator('.wl-why')).toContainText('the block is full');
  });

  // ── WL-09 ────────────────────────────────────────────────────────────────
  test('WL-09 — Offer space mints a hold, and the DB refuses a second one', async ({ page }) => {
    const a = await seedQueued(blockId, 'Dawn', 'Four', 'd');
    const b = await seedQueued(blockId, 'Erin', 'Five', 'e');
    await setBooked(blockId, CAP - 1);              // one real seat free

    await openWaitlistPage(page);
    const grp = ownGroup(page);
    await expect(grp.locator('.act-offer:not([disabled])')).toHaveCount(2);

    await grp.locator('tbody tr').first().locator('.act-offer').click();
    await expect(grp.locator('tbody tr').first()).toContainText('Offered', { timeout: 15000 });

    const held = await getWaitlistRow(blockId, a.email);
    expect(held.status).toBe('offered');
    expect(held.offer_token, 'a hold must carry a token — it is the booking link').toBeTruthy();
    expect(held.offered_at).toBeTruthy();

    // The seat is now spoken for, so the next person cannot be offered it.
    await expect(grp).toContainText('No seat free');
    await expect(grp.locator('.act-offer[disabled]')).toHaveCount(1);
    await expect(grp.locator('.wl-why')).toContainText('a hold is using it');

    // And the greyed-out button is a courtesy, not the gate: the DB refuses
    // the same call made directly.
    const err = await page.evaluate(async (id) => {
      const res = await sb.rpc('offer_waitlist_space', { p_waitlist_id: id });
      return res.error ? (res.error.message || 'unknown') : null;
    }, b.waitlistId);
    expect(err, 'the DB must be the gate, not the disabled button').toContain('WL_NO_SPACE');

    const stillWaiting = await getWaitlistRow(blockId, b.email);
    expect(stillWaiting.status).toBe('waiting');
    expect(stillWaiting.offer_token).toBeNull();
  });

  // ── WL-10 ────────────────────────────────────────────────────────────────
  test('WL-10 — Release hold returns them to the queue and kills the token', async ({ page }) => {
    const a = await seedQueued(blockId, 'Fern', 'Six', 'f', 'offered');
    await setBooked(blockId, CAP - 1);

    await openWaitlistPage(page);
    const grp = ownGroup(page);
    const row = grp.locator('tbody tr').filter({ hasText: a.name }).first();
    await expect(row).toContainText('Offered');

    await row.locator('button', { hasText: 'Release hold' }).click();
    await expect(grp.locator('tbody tr').filter({ hasText: a.name }).first())
      .toContainText('Waiting', { timeout: 15000 });

    const released = await getWaitlistRow(blockId, a.email);
    expect(released.status).toBe('waiting');
    expect(released.offer_token, 'the emailed link must stop working').toBeNull();
    expect(released.offered_at).toBeNull();

    // The seat is free again, so it can be offered afresh.
    await expect(grp).toContainText('1 seat free');
    await expect(grp.locator('.act-offer:not([disabled])')).toHaveCount(1);
  });

  // ── WL-14 ────────────────────────────────────────────────────────────────
  test('WL-14 — Copy link puts the live booking link on the clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const a = await seedQueued(blockId, 'Jo', 'Ten', 'j', 'offered');
    await setBooked(blockId, CAP - 1);

    await openWaitlistPage(page);
    const grp = ownGroup(page);
    await grp.locator('tbody tr').filter({ hasText: a.name }).first()
      .locator('button', { hasText: 'Copy link' }).click();

    await expect(page.locator('#toastEl')).toContainText('copied', { timeout: 15000 });

    const copied = await page.evaluate(() => navigator.clipboard.readText());
    const row = await getWaitlistRow(blockId, a.email);
    // The real token, not a placeholder — this link is the customer's only
    // route past a full block.
    expect(copied).toContain(`offer=${row.offer_token}`);
    expect(copied).toContain('env=test');
  });

  // ── WL-11 ────────────────────────────────────────────────────────────────
  test('WL-11 — Remove deletes the entry and drops the block wait count', async ({ page }) => {
    const a = await seedQueued(blockId, 'Gina', 'Seven', 'g');
    await seedQueued(blockId, 'Hana', 'Eight', 'h');
    expect(await getBlockWaitCount(blockId)).toBe(2);

    await openWaitlistPage(page);
    const grp = ownGroup(page);
    await grp.locator('tbody tr').filter({ hasText: a.name }).first()
      .locator('.act-delete').click();

    await expect(grp.locator('tbody tr')).toHaveCount(1, { timeout: 15000 });
    await expect(grp).not.toContainText(a.name);
    expect(await getWaitlistRow(blockId, a.email)).toBeNull();
    // The trigger keeps the public reservation count honest.
    expect(await getBlockWaitCount(blockId)).toBe(1);
    // The client themselves is untouched — only their place in the queue went.
    expect(await getCustomerByEmail(a.email)).not.toBeNull();
  });

  // ── WL-12 ────────────────────────────────────────────────────────────────
  test('WL-12 — entries on an ended block are counted but not listed', async ({ page }) => {
    const ghost = await seedQueued(endedBlockId, 'Iris', 'Nine', 'i');

    await openWaitlistPage(page);

    // The ended block gets no panel of its own...
    await expect(page.locator('#dbpage-waitlist .class-group-title', { hasText: ENDED_CLASS_NAME }))
      .toHaveCount(0);
    await expect(page.locator('#dbpage-waitlist')).not.toContainText(ghost.name);
    // ...but it is accounted for rather than silently dropped.
    await expect(page.locator('#waitlist-list')).toContainText('blocks that have ended');
    // and the empty current block raises no panel either. Deliberately NOT
    // asserted against #waitlist-subtitle: that counts every block in the
    // database, so a queue seeded by any other spec would fail this for
    // reasons WL-12 is not testing.
    await expect(groupsTitled(page, CLASS_NAME)).toHaveCount(0);

    // The row is hidden from view, not deleted.
    expect(await getWaitlistRow(endedBlockId, ghost.email)).not.toBeNull();
  });
});
