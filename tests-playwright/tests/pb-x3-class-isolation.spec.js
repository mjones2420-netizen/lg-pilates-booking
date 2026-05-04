// PB-X3 — Per-class priority isolation
//
// What this proves: A manual priority grant for one class does NOT leak into
// other classes for the same customer. This is a core business rule — Louise
// grants priority per class, not per client. If isolation fails, granting
// priority to one client on the Wednesday class would silently unlock every
// other class for them too.
//
// Approach: RPC-driven rather than UI-driven. The priority gate UI only renders
// on the Monday card in the current fixture (Wed has no active block, so no
// gate UI), so a UI-only isolation test isn't possible without fixture changes.
// check_priority_access is the function the UI calls — asserting it directly
// for the same customer across three classes proves the business rule cleanly.
//
// Steps:
//   - Create a fresh customer
//   - Grant manual priority on the Wednesday class only (via direct pg)
//   - Call check_priority_access for an upcoming block on each of Wed / Mon / Fri
//   - Wed must be true; Mon and Fri must be false
//   - afterEach removes the manual grant

const { test, expect } = require('@playwright/test');
const { sb } = require('./helpers/supabase');
const { grantManualPriority, removeManualPriority } = require('./helpers/admin-db');
const { getBlocksByRoles } = require('./helpers/fixture-lookup');

const WED_CLASS_ID = 2;  // Wednesday Beginner — stable across reseeds
const MON_CLASS_ID = 1;  // Monday Mixed Ability
const FRI_CLASS_ID = 3;  // Friday Intermediate

test.describe('PB-X3 — Per-class priority isolation', () => {

  let customerId = null;

  test.afterEach(async () => {
    if (customerId) {
      // Clean up the manual grant so a re-run starts fresh
      await removeManualPriority(customerId, WED_CLASS_ID);
    }
  });

  test('Wed grant does not unlock priority on Mon or Fri', async () => {
    const ts = Date.now();
    const email = `pbx3-${ts}@test.example`;

    // Create the customer via the existing SECURITY DEFINER RPC (anon-allowed)
    const { data: newId, error: upsertErr } = await sb.rpc('upsert_customer', {
      p_first_name: 'PBX3',
      p_last_name: 'Isolation',
      p_email: email,
      p_phone: '07000000000',
      p_customer_type: 'returning'
    });
    expect(upsertErr).toBeNull();
    expect(newId).toBeTruthy();
    customerId = newId;

    // Grant manual priority for Wednesday class ONLY, via direct pg (admin-only table)
    await grantManualPriority(customerId, WED_CLASS_ID);

    // Look up upcoming blocks for all three classes
    const { 'wed-upcoming': wedUp, 'mon-upcoming': monUp, 'fri-upcoming': friUp } =
      await getBlocksByRoles(['wed-upcoming', 'mon-upcoming', 'fri-upcoming']);
    expect(wedUp).toBeTruthy();
    expect(monUp).toBeTruthy();
    expect(friUp).toBeTruthy();

    // The actual assertion: check_priority_access against each class's upcoming block
    const { data: wedAccess, error: wedErr } = await sb.rpc('check_priority_access', {
      p_email: email, p_block_id: wedUp.id
    });
    expect(wedErr).toBeNull();
    expect(wedAccess).toBe(true);  // Granted on Wed → access allowed

    const { data: monAccess, error: monErr } = await sb.rpc('check_priority_access', {
      p_email: email, p_block_id: monUp.id
    });
    expect(monErr).toBeNull();
    expect(monAccess).toBe(false);  // No grant on Mon → access denied

    const { data: friAccess, error: friErr } = await sb.rpc('check_priority_access', {
      p_email: email, p_block_id: friUp.id
    });
    expect(friErr).toBeNull();
    expect(friAccess).toBe(false);  // No grant on Fri → access denied
  });
});
