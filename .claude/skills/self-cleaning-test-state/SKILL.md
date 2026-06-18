---
name: self-cleaning-test-state
description: >
  Mark's pattern for making Playwright specs self-clean test DB state on EXIT (afterEach) so the test suite stays stable across multiple runs without needing reseeds. Apply this skill whenever a Playwright test creates, modifies, or relies on test data in the LG Pilates Supabase test DB — including any mention of "self-cleaning", "Option B", "afterEach cleanup", "test state accumulation", "CLASS_FULL failure", "reseed needed", or any task that adds or upgrades a spec that creates a customer or booking. This skill governs the cleanup pattern (afterEach with deleteCustomerCascade), how to track per-run state in describe scope, when to use entry-side vs exit-side cleanup, and what NOT to delete (cancellations rows). Always load this skill alongside the playwright-batch-workflow skill when adding tests that touch the bookings, customers, or parq tables. Do NOT apply this skill to read-only specs (smoke tests, RPC assertions, RLS checks) or to UI-only specs that don't create database state.
---

# Self-Cleaning Test State Skill — Mark's Personal Setup

## Context

The LG Pilates Playwright suite runs against an isolated Supabase test project (`ngzfhamjuviwfwuncrjo`). Many specs create customers and bookings during their run. Without cleanup, this state accumulates across runs and eventually breaks the suite.

The breaking point Mark already hit (Session 18): `mon-current` accumulated 13 stray bookings across multiple test runs and reached its capacity of 12. Every subsequent test trying to book Monday then failed with `CLASS_FULL`, including unrelated tests.

This skill captures the established pattern for preventing that.

---

## When this skill applies

Apply this skill whenever a spec:

- Creates a fresh customer via `upsert_customer` RPC (e.g. `cb01-{ts}@test.example`)
- Books a fixture customer onto a fixture block via `book_if_available` RPC
- Books any customer onto any block through the UI flow
- Modifies a booking's status via direct pg (e.g. flipping to `cancelled`)
- Grants manual priority via direct pg

Do NOT apply this skill to:

- Smoke tests that only read data
- Specs that only assert RPC return values without writing state
- UI-only specs that don't trigger any database write

---

## The pattern

### Track per-run state in describe scope

```javascript
test.describe('PB-X4 — Cancelled previous-block booking: priority denied', () => {

  // Track per-run state at describe scope so afterEach can always clean up,
  // regardless of where the test fails.
  let createdCustomerId = null;

  test.beforeEach(async ({ page }) => {
    createdCustomerId = null;  // reset before each test
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible();
  });

  test.afterEach(async () => {
    if (createdCustomerId) {
      await deleteCustomerCascade(createdCustomerId);
    }
  });

  test('cancelled status on previous block does not unlock priority', async () => {
    // ... create customer ...
    createdCustomerId = customerId;  // expose for cleanup
    // ... rest of test ...
  });
});
```

### Two cleanup helpers — pick the right one

Both live in `tests/helpers/admin-db.js`:

**`deleteCustomerCascade(customerId)`** — for fresh per-run customers
- Deletes all bookings for the customer (any status, including cancelled)
- Deletes the customer row
- Resyncs `blocks.booked` across all blocks
- Use this when the test creates a new customer with a unique timestamped email

**`deleteBookingsForCustomerOnBlock(customerId, blockId)`** — for fixture customers
- Deletes only non-cancelled bookings for that customer/block pair
- Resyncs `blocks.booked` for that single block
- Leaves the customer row intact (it's a seeded fixture customer)
- Use this when the test books a FIXTURE customer (returning-one, returning-two) onto a fixture block — you must NOT delete the fixture customer

---

## Entry-side vs exit-side cleanup — when to use which

### Exit-side (afterEach) — DEFAULT

**Use this whenever possible.** It keeps the test DB clean between runs.

```javascript
test.afterEach(async () => {
  if (createdCustomerId) {
    await deleteCustomerCascade(createdCustomerId);
  }
});
```

This is what every spec creating per-run customers should look like.

### Entry-side (pre-flight inside test)

**Use this for fixture customer/block pairs** where the customer must persist across runs.

Example: CB-13 books `returning-two` on `fri-upcoming`. We can't delete returning-two (it's a fixture customer), but we can delete the booking they made on a previous run.

```javascript
const { data: hasBooking } = await sb.rpc('has_active_booking_on_block', {
  p_customer_id: customerId, p_block_id: blockId
});
if (hasBooking === true) {
  await deleteBookingsForCustomerOnBlock(customerId, blockId);
  const { data: stillBooked } = await sb.rpc('has_active_booking_on_block', {
    p_customer_id: customerId, p_block_id: blockId
  });
  expect(stillBooked, 'cleanup failed — RPC still reports booking active').toBe(false);
}
```

Always verify the cleanup landed before continuing — a stale booking left behind would trip the duplicate-detection in the UI.

### Both — for specs that flip status to cancelled

If a spec creates a booking AND flips it to `cancelled` (PB-X4 is the canonical example), use **exit-side cleanup with `deleteCustomerCascade`**. The entry-side `deleteBookingsForCustomerOnBlock` would skip the cancelled booking and leave junk behind.

---

## What NOT to delete

The `cancellations` table contains **denormalised audit records** from the admin cancel-and-refund flow. These survive customer deletion by design — that's the whole point of denormalising the customer/class details into the cancellation row.

Routine test cleanup should NEVER touch `cancellations`. If a test creates a real cancellation through the admin flow, that's an audit record that should persist.

---

## Foreign key cascade order

This is fixed by the schema. The deletion order, when manual cleanup is required, is:

1. `parq` (cascades automatically via `parq.booking_id` ON DELETE CASCADE)
2. `cancellations` (rarely deleted — see above)
3. `bookings`
4. `customer_class_priority`
5. `customers`

`deleteCustomerCascade` already handles steps 3 → 5 in the right order. You should not need to write FK-aware deletion code outside that helper.

---

## Verification step at end of cleanup work

After applying self-cleaning to one or more specs:

1. Run the affected spec(s) **twice in a row** without a reseed:
   ```
   npm test -- --grep "CB-XX"
   npm test -- --grep "CB-XX"
   ```
2. Both runs should pass cleanly — no skips, no failures.
3. Check the test DB to confirm no orphan customer rows accumulated:
   ```sql
   SELECT COUNT(*) FROM customers
   WHERE email LIKE 'cb%-%@test.example' OR email LIKE 'pb%-%@test.example';
   ```
   Should return 0 (or the count of any in-flight tests).

If either step fails, the cleanup isn't reaching the afterEach — likely a test exit path (early return, thrown error before `createdCustomerId` was set) that bypasses the tracking variable.

---

## Common mistakes to avoid

- **Using `deleteBookingsForCustomerOnBlock` on a per-run customer.** This leaves the customer row behind, polluting the customers table. Use `deleteCustomerCascade` instead.
- **Setting `createdCustomerId` before the customer is actually created.** If the upsert RPC fails, you'll try to delete a non-existent ID. Always set the tracking variable AFTER the create call succeeds.
- **Forgetting to reset `createdCustomerId = null` in `beforeEach`.** If a previous test failed and left the variable set, the next test's afterEach might delete the wrong customer.
- **Using `test.skip(condition, ...)` as a substitute for cleanup.** This makes the suite green while hiding the fact that the test never actually ran. Self-cleaning should be the default; `test.skip` is reserved for genuine pre-conditions (e.g. a fixture missing entirely).
- **Deleting `cancellations` rows.** They're audit records. Don't.
- **Not resyncing `blocks.booked` after raw SQL changes.** The `trg_sync_block_booked_count` trigger only fires on app-level INSERT/DELETE, not on UPDATE or raw SQL. Both helper functions handle this internally — but if you write custom cleanup outside them, you must resync manually.

---

## Migration path: applying this skill to existing specs

Specs known to need this pattern (per Session 18 audit):

- CB-01, CB-02 — create per-run new customers
- CB-03 — books returning-two on mon-current (entry-side cleanup added Session 18)
- CB-07 — capacity test
- CB-13 — books returning-two on fri-upcoming (entry-side cleanup added Session 18)
- CB-31 — duplicate detection
- CB-32 — books returning-one on fri-upcoming (entry-side cleanup added Session 18)
- CB-33 — PAR-Q creation
- PB-09 — creates per-run customer + reserved booking
- PB-10 — books returning-one on mon-upcoming (entry-side cleanup added Session 18)
- PB-X4 — full afterEach cleanup added Session 18 (canonical example)

The CB and PB-09/10 specs that currently use entry-side cleanup work correctly but leave per-run state behind. Upgrading them to exit-side `afterEach` cleanup is the "Option B" rollout.

---

## Quick reference

| Situation | Helper to use | Where |
|---|---|---|
| Per-run customer (timestamped email) | `deleteCustomerCascade(id)` | afterEach |
| Fixture customer + fixture block | `deleteBookingsForCustomerOnBlock(custId, blockId)` | pre-flight inside test |
| Test creates a `cancelled` booking | `deleteCustomerCascade(id)` | afterEach |
| Test grants manual priority on a fixture customer | `removeManualPriority(custId, classId)` | afterEach |
| Test grants manual priority on a per-run customer | `deleteCustomerCascade(id)` | afterEach (cascades the grant) |
