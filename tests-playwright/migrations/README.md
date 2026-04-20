# Test Supabase — Migrations

These SQL files rebuild the `lg-pilates-test` Supabase project from scratch.
They are a record of what was applied, in order, during Session 6 (19 Apr 2026).

## Files

| # | File | What it does |
|---|------|--------------|
| 01 | `01_tables.sql` | Creates the 9 tables with columns, defaults, PKs, CHECK constraints, NOT NULL |
| 02 | `02_foreign_keys.sql` | Adds all 10 FK constraints with CASCADE behaviour |
| 03 | `03_indexes.sql` | Partial unique index on bookings |
| 04 | `04_functions.sql` | 6 PL/pgSQL functions (lookup, upsert, book, priority, active, sync) |
| 05 | `05_trigger.sql` | trg_sync_block_booked_count on bookings table |
| 06 | `06_rls_and_grants.sql` | RLS enabled, 25 policies, tightened anon grants |
| 07 | `07_seed_data.sql` | Deterministic test fixture (3 classes, 6 blocks, 3 customers, 4 bookings) |

## How to rebuild the test DB from scratch

If the test DB ever gets corrupted or you want to start over:

1. In the Supabase dashboard for `lg-pilates-test`:
   - **Database** → **Tables** → drop all tables manually, OR
   - Run: `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` (nuclear)
2. Apply each migration in order using **either**:
   - The Supabase SQL Editor (paste the file contents, run)
   - Or via the MCP `apply_migration` tool in a Claude session
3. Verify via: `SELECT COUNT(*) FROM classes;` → should return 3 after migration 07

## Re-seeding without dropping schema

If schema is fine but you want fresh seed data:

```sql
-- Wipe data only, preserve schema
TRUNCATE parq, cancellations, bookings, customer_class_priority,
         blocks, customers, classes, settings, waitlist RESTART IDENTITY CASCADE;

-- Then re-apply 07_seed_data.sql
```

## Keeping the test DB in sync with production

If production schema changes (new columns, new RPCs, altered constraints):

1. Apply the change to production first (as normal)
2. Add a new numbered migration (`08_...sql`) here mirroring the change
3. Apply it to the test project
4. Commit the new migration file

This gives a clear audit trail of every schema change that's landed on test.
