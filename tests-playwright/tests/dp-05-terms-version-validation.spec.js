// tests/dp-05-terms-version-validation.spec.js
//
// DP (Data Protection) — DP-05: the booking and health-form RPCs reject an
// unknown version, but still accept a missing one (#90/#91).
//   - book_if_available with a bogus p_terms_version → TERMS_VERSION_UNKNOWN
//   - book_if_available with no version → succeeds, terms columns stay NULL
//     (rollout safety: the old front end may be live between the prod
//     migration and the index.html push — a follow-up makes it required)
//   - insert_parq with a bogus consent / declaration version → CONSENT_VERSION_UNKNOWN
// Called as anon, exactly like the public page.
//
// Fixture role: fri-upcoming. Self-cleaning.

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { getBookingById } = require('./helpers/admin-db');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const { createDpCustomer, cleanupDpCustomer } = require('./helpers/dp-fixtures');

const APP_URL = process.env.TEST_APP_URL;

function parqArgs(bookingId, customerId, extra = {}) {
  return {
    p_booking_id: bookingId, p_customer_id: customerId, p_age: '30',
    p_q1_heart: 'No', p_q2_circulatory: 'No', p_q3_blood_pressure: 'No', p_q4_chest_pain: 'No',
    p_q5_joint: 'No', p_q6_dizziness: 'No', p_q7_pregnant: 'No', p_q8_doctor_advised: 'No',
    p_q9_spinal: 'No', p_q10_medication: 'No', p_q11_asthma: 'No', p_q12_other_reasons: 'No',
    p_yes_details: '', p_additional_notes: '', p_emergency_name: 'E', p_emergency_relationship: 'R',
    p_emergency_phone: '07700900905', p_print_name: 'Dp Five', p_sign_date: '2026-10-05',
    ...extra,
  };
}

test.describe('DP-05 — Version validation on the booking and health-form RPCs', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — DP specs require .env.test populated.');

  let made = null;
  test.afterEach(async () => {
    if (made) await cleanupDpCustomer(made.customerId, made.email);
    made = null;
  });

  test('unknown versions are rejected; a missing version is still accepted', async () => {
    const blk = await getBlockByRole('fri-upcoming');
    made = await createDpCustomer({ tag: 'dp05', blocks: [], withParq: false, lastName: 'Dp05' });

    const bad = await sb.rpc('book_if_available', {
      p_block_id: blk.id, p_class_id: blk.class_id, p_customer_id: made.customerId,
      p_amount_due: 1, p_terms_version: 'tcs-bogus',
    });
    expect(bad.error, 'a bogus terms version must be rejected').not.toBeNull();
    expect(bad.error.message).toContain('TERMS_VERSION_UNKNOWN');

    const ok = await sb.rpc('book_if_available', {
      p_block_id: blk.id, p_class_id: blk.class_id, p_customer_id: made.customerId, p_amount_due: 1,
    });
    expect(ok.error, 'no version must still book (rollout safety)').toBeNull();
    const booking = await getBookingById(ok.data);
    expect(booking.terms_version).toBeNull();
    expect(booking.terms_accepted_at).toBeNull();

    for (const extra of [{ p_health_consent_version: 'consent-bogus' }, { p_declaration_version: 'tcs-2026-10' }]) {
      const res = await sb.rpc('insert_parq', parqArgs(ok.data, made.customerId, extra));
      expect(res.error, `insert_parq must reject ${JSON.stringify(extra)}`).not.toBeNull();
      expect(res.error.message).toContain('CONSENT_VERSION_UNKNOWN');
    }
  });
});
