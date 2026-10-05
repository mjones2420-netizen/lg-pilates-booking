// tests/dp-07-anonymise-stale-parq.spec.js
//
// DP (Data Protection) — DP-07: the retention clear-down (#90).
//   Given: a client whose only class ended more than 12 months before "today"
//   When:  anonymise_stale_parq runs (faked date, limited to this client —
//          the test DB is shared, never run it globally)
//   Then:  health answers + emergency contact are NULL, anonymised_at is set,
//          sign_date and the customer / booking survive, a log row is written,
//          and a second run clears nothing more.
//
// Fixture role: fri-old-past. Self-cleaning.

const { test, expect } = require('@playwright/test');
const { runAnonymise, getAllParqByCustomerId, getDataProtectionLog, getCustomerById, getBookingById } = require('./helpers/admin-db');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { createDpCustomer, cleanupDpCustomer, shiftDate } = require('./helpers/dp-fixtures');

const APP_URL = process.env.TEST_APP_URL;
const HEALTH_FIELDS = ['age', 'q1_heart', 'q2_circulatory', 'q3_blood_pressure', 'q4_chest_pain', 'q5_joint',
  'q6_dizziness', 'q7_pregnant', 'q8_doctor_advised', 'q9_spinal', 'q10_medication', 'q11_asthma',
  'q12_other_reasons', 'yes_details', 'additional_notes', 'emergency_name', 'emergency_relationship',
  'emergency_phone', 'print_name'];

test.describe('DP-07 — Stale health forms are cleared', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — DP specs require .env.test populated.');

  let made = null;
  test.afterEach(async () => { if (made) await cleanupDpCustomer(made.customerId, made.email); made = null; });

  test('a form older than the retention period is cleared and logged; the rest survives', async () => {
    const past = await getBlockByRole('fri-old-past');
    made = await createDpCustomer({ tag: 'dp07', blocks: [past], lastName: 'Dp07' });
    const asOf = shiftDate(past.end_date, { months: 13 });

    // Just inside the window: nothing happens.
    expect(await runAnonymise({ customerId: made.customerId, asOf: shiftDate(past.end_date, { months: 11 }), months: 12 })).toBe(0);

    expect(await runAnonymise({ customerId: made.customerId, asOf, months: 12 })).toBe(1);

    const [parq] = await getAllParqByCustomerId(made.customerId);
    for (const f of HEALTH_FIELDS) expect(parq[f], `${f} should be cleared`).toBeNull();
    expect(parq.anonymised_at).toBeTruthy();
    expect(parq.sign_date).toBeTruthy();
    expect(Number(parq.booking_id)).toBe(Number(made.bookingIds[0]));

    expect(await getCustomerById(made.customerId)).toBeTruthy();
    expect(await getBookingById(made.bookingIds[0])).toBeTruthy();

    const log = await getDataProtectionLog(made.customerId);
    expect(log).toHaveLength(1);
    expect(log[0].action).toBe('auto_anonymise_parq');
    expect(log[0].parq_rows).toBe(1);

    // Idempotent: nothing left to clear, no new log row.
    expect(await runAnonymise({ customerId: made.customerId, asOf, months: 12 })).toBe(0);
    expect(await getDataProtectionLog(made.customerId)).toHaveLength(1);
  });
});
