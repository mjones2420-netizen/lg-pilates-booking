# LG Pilates — Playwright Tests

Automated regression pack for the LG Pilates booking system. Tests run against a
**separate test Supabase project** (`lg-pilates-test`), not production.

## Quick start

### First-time setup (run once)

```bash
# 1. From the repo root, cd into the tests folder
cd tests-playwright

# 2. Install dependencies
npm install

# 3. Install the browsers Playwright needs
npx playwright install chromium

# 4. Create your local .env.test from the example template
cp .env.test.example .env.test

# 5. Open .env.test and paste the TEST project anon key where shown.
#    DO NOT paste production credentials. The safety check will refuse to run.
```

### Running tests

```bash
# Headless run (fast, no browser window)
npm test

# Headed run — watch a real Chrome window click through
npm run test:headed

# UI mode — step-by-step timeline with time-travel debugging (recommended)
npm run test:ui

# Re-open the last HTML report after a run
npm run report
```

## What's in here

```
tests-playwright/
├── package.json               # dependencies
├── playwright.config.js       # runs safety check before any test
├── .env.test.example          # template (COMMITTED)
├── .env.test                  # secrets (GITIGNORED — never commit)
├── .gitignore
└── tests/
    ├── safety-check.js        # refuses to run if prod creds detected
    ├── helpers/
    │   └── supabase.js        # shared anon client
    ├── smoke-01-anon-reads.spec.js      # classes/blocks/settings readable
    ├── smoke-02-anon-rpcs.spec.js       # lookup_customer / priority / has_active
    ├── smoke-03-rls-enforcement.spec.js # anon cannot read bookings/customers
    └── smoke-04-ui-page-loads.spec.js   # page renders classes (skipped if no app URL)
```

## Safety check

Before **every** run, `playwright.config.js` loads `.env.test` and calls
`assertNotProduction()`. That function blocks the run if:

- `TEST_SUPABASE_PROJECT_ID` is missing
- `TEST_SUPABASE_PROJECT_ID` equals the production project ID (`mrlooyixnlxzcfmvnqme`)
- `TEST_SUPABASE_URL` contains the production reference
- `TEST_SUPABASE_ANON_KEY` is missing
- The anon key JWT decodes to the production project `ref`

If any of these fire, **no tests will run** — the safety check throws before Playwright
touches anything. This is a deliberate guard against accidental prod hits.

## Seed data — what tests can assume

The test DB is seeded with a stable fixture of:

- **3 classes**: Mon (Mixed Ability), Wed (Beginner), Fri (Intermediate)
- **6 blocks**, computed relative to `CURRENT_DATE`:
  - `past`    — Mon class, ended ~50 days ago (has 2 confirmed bookings)
  - `current` — Mon class, running right now
  - `upcoming_standard` — Wed, starts in ~3 days (standard booking window)
  - `upcoming_priority` — Wed, starts in ~10 days (priority booking window)
  - `upcoming_locked`   — Fri, starts in ~26 days (locked window)
  - `full`              — Wed, cap 2, already at capacity
- **3 customers**: `returning-one@test.example`, `returning-two@test.example`,
  `admin-dummy@test.example` — all typed `returning`
- **4 bookings**: 2 confirmed on `past` (grant priority), 2 confirmed on `full`
- **1 manual priority grant**: `returning-one` on the Wednesday class
- **3 settings**: bank details placeholders

See `/migrations/07_seed_data.sql` for the full shape.

## Re-seeding

If the DB gets into a weird state, re-seed by running:

```sql
-- In the test project SQL editor
TRUNCATE parq, cancellations, bookings, customer_class_priority,
         blocks, customers, classes, settings, waitlist RESTART IDENTITY CASCADE;

-- Then re-apply migration 07 (copy from /migrations/07_seed_data.sql)
```

## Adding new tests

1. Write a `.spec.js` file in `tests/` — Playwright picks it up automatically
2. Run `npm run test:ui` to develop and debug interactively
3. When green, commit

For UI tests, the `TEST_APP_URL` env var points at a deployed or locally-served
copy of `index.html` wired to the TEST Supabase project. For RPC / DB tests, just
import the `sb` helper from `./helpers/supabase.js`.

## What's intentionally NOT done yet

- **GitHub Actions workflow** — deferred to the next Playwright session
- **Full CB / AB / PB scenario coverage** — smoke tests only for now; scenarios
  from `LG-Pilates-Test-Scenarios.xlsx` will be added incrementally
- **Admin dashboard tests** — require a test user in Supabase Auth; next session

## Gotchas

- **The test Supabase free tier auto-pauses after 7 days of inactivity.** If tests
  fail with connection errors, visit the test project dashboard once to wake it up.
- **The trigger `trg_sync_block_booked_count` doesn't fire on raw SQL inserts** —
  if you seed bookings via raw SQL, run the resync UPDATE at the bottom of migration
  07 to refresh `blocks.booked`.
- **Don't parallelise tests**. Workers are set to 1 by design — the single shared
  test DB makes parallel runs flaky. UI mode's "Run in parallel" toggle is ignored.
