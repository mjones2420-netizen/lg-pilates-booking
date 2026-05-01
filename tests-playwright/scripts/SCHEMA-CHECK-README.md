# Schema check helper

Verifies that the test Supabase project's schema is identical to production.

## What it does

Calls `get_schema_fingerprint()` on both projects and compares the returned
hashes. The hash is a deterministic MD5 of all columns, constraints, indexes,
RLS policies, functions, triggers, and grants in the `public` schema. If the
hashes match, the schemas are structurally identical (down to the last column
type and policy definition).

The check ignores auto-generated constraint and index names (which differ
between projects by accident of when objects were created), so two schemas
with identical definitions but different auto-names will still match.

## Setup (one-time)

1. Apply `migrations/10_add_schema_fingerprint_function.sql` to **both**
   the production and test projects.
2. Add the production URL and anon key to `.env.test`:

   ```
   PROD_SUPABASE_URL=https://mrlooyixnlxzcfmvnqme.supabase.co
   PROD_SUPABASE_ANON_KEY=<production anon key>
   ```

   The anon key is already public (embedded in the live `index.html`),
   so this isn't a new secret.

## Running

```
cd ~/dev/lg-pilates-booking/tests-playwright
npm run schema-check
```

Exit codes:
- **0** — schemas identical
- **1** — schemas differ (drift detected)
- **2** — error talking to one or both projects

## When to run

- After applying any schema change to production (verify it landed in test too)
- At the start of a session if you suspect drift
- Before a release or deployment milestone
- Quarterly as a routine health check

## What if it reports drift?

Run the underlying snapshot query (the body of `get_schema_fingerprint`,
returning rows instead of the hash) against both projects in the Supabase SQL
editor and compare the outputs. The difference will tell you exactly which
object has changed.
