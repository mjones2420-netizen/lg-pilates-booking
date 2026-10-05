// tests/dp-08-active-customers-protected.spec.js
//
// DP (Data Protection) — DP-08: the clear-down never touches a client who
// is still active (#90). Each case would otherwise be stale (old booking,
// old form) and is protected by exactly one thing:
//   - a booking on a block that ends inside the retention window
//   - being on a waiting list
//   - a card payment in progress (pending_bookings row for their email)
//   - a health form submitted inside the window
//
// Fixture roles: fri-old-past, mon-current, wed-past. Self-cleaning.

const { test, expect } = require('@playwright/test');
const { runAnonymise, getAllParqByCustomerId, getPool, insertPendingBooking } = require('./helpers/admin-db');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { createDpCustomer, cleanupDpCustomer, shiftDate } = require('./helpers/dp-fixtures');

const APP_URL = process.env.TEST_APP_URL;

test.describe('DP-08 — Active clients are never cleared', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — DP specs require .env.test populated.');

  let made = null;
  test.afterEach(async () => { if (made) await cleanupDpCustomer(made.customerId, made.email); made = null; });

  async function expectUntouched(customerId, asOf, months) {
    expect(await runAnonymise({ customerId, asOf, months })).toBe(0);
    const rows = await getAllParqByCustomerId(customerId);
    expect(rows[0].anonymised_at).toBeNull();
    expect(rows[0].emergency_name).toBe('Sam Contact');
  }

  test('a booking on a block ending inside the window protects them', async () => {
    const past = await getBlockByRole('fri-old-past');
    const current = await getBlockByRole('mon-current');
    made = await createDpCustomer({ tag: 'dp08a', blocks: [past, current], lastName: 'Dp08' });
    // Cutoff = mon-current's end date: the current booking is inside, the old one outside.
    await expectUntouched(made.customerId, shiftDate(current.end_date, { months: 6 }), 6);
  });

  test('being on a waiting list protects them', async () => {
    const past = await getBlockByRole('fri-old-past');
    const wedPast = await getBlockByRole('wed-past');
    made = await createDpCustomer({ tag: 'dp08b', blocks: [past], lastName: 'Dp08' });
    await getPool().query(`INSERT INTO waitlist (block_id, customer_id) VALUES ($1, $2)`, [wedPast.id, made.customerId]);
    await expectUntouched(made.customerId, shiftDate(past.end_date, { months: 13 }), 12);
  });

  test('a card payment in progress protects them', async () => {
    const past = await getBlockByRole('fri-old-past');
    made = await createDpCustomer({ tag: 'dp08c', blocks: [past], lastName: 'Dp08' });
    await insertPendingBooking({
      classId: past.class_id, blockId: past.id, firstName: 'Data', lastName: 'Dp08', email: made.email,
      phone: '07700900908', customerType: 'returning', amountPence: 6000,
    });
    await expectUntouched(made.customerId, shiftDate(past.end_date, { months: 13 }), 12);
  });

  test('a health form submitted inside the window protects them', async () => {
    const past = await getBlockByRole('fri-old-past');
    const asOf = shiftDate(past.end_date, { months: 13 });
    made = await createDpCustomer({
      tag: 'dp08d', blocks: [past], lastName: 'Dp08', parqCreatedAt: shiftDate(asOf, { months: -1 }),
    });
    await expectUntouched(made.customerId, asOf, 12);
  });
});
