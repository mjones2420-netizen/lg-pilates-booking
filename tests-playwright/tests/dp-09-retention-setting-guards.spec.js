// tests/dp-09-retention-setting-guards.spec.js
//
// DP (Data Protection) — DP-09: the clear-down is OFF unless
// settings.parq_retention_months holds a sensible number (#90).
//   missing / non-numeric / below the 6-month floor → clears nothing
//   '12' (positive control) → clears the stale form
// The setting is global, so it is always removed again (afterEach) — left
// behind, the nightly 03:20 job on TEST would start clearing fixture forms.
//
// Fixture role: fri-old-past. Self-cleaning.

const { test, expect } = require('@playwright/test');
const { runAnonymise, setSetting, deleteSetting } = require('./helpers/admin-db');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { createDpCustomer, cleanupDpCustomer, shiftDate } = require('./helpers/dp-fixtures');

const APP_URL = process.env.TEST_APP_URL;
const KEY = 'parq_retention_months';

test.describe('DP-09 — Retention setting guards', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — DP specs require .env.test populated.');

  let made = null;
  test.afterEach(async () => {
    await deleteSetting(KEY);
    if (made) await cleanupDpCustomer(made.customerId, made.email);
    made = null;
  });

  test('missing, junk or too-small settings do nothing; 12 clears', async () => {
    const past = await getBlockByRole('fri-old-past');
    made = await createDpCustomer({ tag: 'dp09', blocks: [past], lastName: 'Dp09' });
    const asOf = shiftDate(past.end_date, { months: 25 });

    await deleteSetting(KEY);
    expect(await runAnonymise({ customerId: made.customerId, asOf }), 'no setting → off').toBe(0);

    for (const bad of ['abc', '', '1', '5', '-12']) {
      await setSetting(KEY, bad);
      expect(await runAnonymise({ customerId: made.customerId, asOf }), `setting "${bad}" must do nothing`).toBe(0);
    }

    await setSetting(KEY, '12');
    expect(await runAnonymise({ customerId: made.customerId, asOf }), 'setting "12" clears').toBe(1);
  });
});
