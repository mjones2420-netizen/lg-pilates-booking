# LG PILATES BOOKING SYSTEM — CLAUDE CODE CONTEXT
Last updated: 22 Jun 2026 (session 52 — CU-07 over-cap warning spec, 212 tests)

> Full detail lives in context.txt at the repo root. Read it when you need
> schema specifics, full test fixture detail, session learnings, or the
> complete TO DO list. This file covers what you need for every session start.

---

## PROJECT OVERVIEW

Pilates class booking system for LG Pilates (Louise George). Baildon + Guiseley.
Single HTML file (`index.html`) on GitHub Pages. Backend: Supabase (Postgres).
Mark is the non-developer owner. Claude Code is the technical collaborator.

- Live URL: https://mjones2420-netizen.github.io/lg-pilates-booking/
- GitHub:   https://github.com/mjones2420-netizen/lg-pilates-booking
- Repo:     /Users/markjones/dev/lg-pilates-booking

**In Claude Code: read index.html directly from the repo. Never use a cached version.**

---

## SUPABASE PROJECTS

| | Project ID | URL |
|---|---|---|
| **Production** | `mrlooyixnlxzcfmvnqme` | https://mrlooyixnlxzcfmvnqme.supabase.co |
| **Test** | `ngzfhamjuviwfwuncrjo` | https://ngzfhamjuviwfwuncrjo.supabase.co |

MCP servers: `supabase-test` (locked to test project) and `supabase-prod` (locked to production).
Always use the correct scoped server — never run test queries against production.

Anon keys and full schema detail: see context.txt section 2 + section 4.

Test admin: `admin@lg-pilates-test.local` — password in `tests-playwright/.env.test`.

---

## SESSION START — RUN EVERY SESSION

**A. Confirm index.html is present** — check line count (~4,100+ lines after catch-up swaps).

**B. Time drift check** — run against `supabase-test` (project `ngzfhamjuviwfwuncrjo`):

```sql
SELECT
  id, class_id, status, start_date,
  (start_date - CURRENT_DATE) AS days_until_start,
  CASE
    WHEN status = 'active'   AND end_date < CURRENT_DATE + 1                  THEN 'about to complete'
    WHEN status = 'upcoming' AND (start_date - CURRENT_DATE) = 8              THEN 'about to leave priority window'
    WHEN status = 'upcoming' AND (start_date - CURRENT_DATE) = 15             THEN 'about to enter priority window'
    WHEN status = 'upcoming' AND (start_date - CURRENT_DATE) = 1              THEN 'about to become active'
    ELSE NULL
  END AS drift_warning
FROM blocks
WHERE status IN ('active','upcoming')
ORDER BY class_id, start_date;
```

Healthy: all `drift_warning` = NULL.

**C. State drift check** — run against `supabase-test`:

```sql
SELECT
  (SELECT COUNT(*) FROM customers
   WHERE email LIKE 'cb%-%@test.example'
      OR email LIKE 'pb%-%@test.example')               AS stray_test_customers,
  (SELECT COUNT(*) FROM blocks
   WHERE status IN ('active','upcoming')
     AND booked >= cap AND cap > 2)                     AS unexpectedly_full_blocks;
```

Healthy: stray_test_customers low single digits, unexpectedly_full_blocks = 0.

Report B + C as a single line near the top of the opening response.

If drift detected, remind Mark to run: `cd tests-playwright && npm run seed`

---

## WORKFLOW — NON-NEGOTIABLE RULES

1. **Mockup first** for any UI change — visual approval before editing index.html.
2. **One action per response** — stop and ask before acting on anything non-trivial.
3. **No git push until `npm test` is green** — including any new specs.
4. **New/changed functionality gets new Playwright specs in the same session.**
5. **TEST-PLAN.md is generated — never hand-edit it.** After adding or removing any test, run `cd tests-playwright && npm run test-plan` to regenerate it, in the same session as the test change. Long-form history lives in TEST-PLAN-HISTORY.md.
6. **GitHub Issues** is the single source of truth for the backlog. Consult open issues at session start (`gh issue list`). Create new issues for any newly identified item before session ends. Close issues when done. BACKLOG.md is kept for historical reference only — do not update it.
7. **SQL: confirm and explain before running anything against Supabase.**
8. **Never update documentation until tests are green** (hard rule).
9. **Plain English summary alongside any technical detail.**
10. **Do not propose and action in the same response** — state the plan, wait for sign-off, then act.

---

## RUNNING TESTS

```bash
# Terminal 1 — keep running
cd ~/dev/lg-pilates-booking
python3 -m http.server 8000

# Terminal 2
cd ~/dev/lg-pilates-booking/tests-playwright
npm test                   # full suite (reseeds DB automatically)
npm run test:ui            # interactive UI runner
npm run seed               # reseed test DB
npm run schema-check       # verify prod/test schema parity
npm run test-plan          # regenerate TEST-PLAN.md from the live suite (run after any test change)
```

In Claude Code: start the HTTP server in the background, then run `npm test` from `tests-playwright/`.

Current test count: **212 tests, all passing** (Session 52 / CU-07 over-cap warning added).

---

## KEY FILES

| File | Purpose |
|---|---|
| `index.html` | Single-file front end — all UI and client JS |
| `context.txt` | Full project context — read this for deep detail |
| `BACKLOG.md` | Historical reference only — backlog now managed in GitHub Issues |
| `TEST-PLAN.md` | Playwright coverage tracker — update with every test change |
| `PAYMENT-MODE-SPEC.md` | Stripe integration spec |
| `EMAIL-NOTIFICATIONS-SPEC.md` | Email spec |
| `tests-playwright/` | Playwright test suite |
| `tests-playwright/migrations/` | SQL migrations (01–12, 14) |
| `tests-playwright/tests/helpers/` | Shared test helpers |

---

## TECH STACK

- **Front end**: Single `index.html` — vanilla JS, CSS variables, no build step
- **Database**: Supabase (Postgres) — two projects (test + production)
- **Payments**: Stripe Checkout (Edge Functions: `stripe-checkout`, `stripe-webhook`)
- **Email**: Resend (`send-email` Edge Function) — sender `bookings@lg-pilates.co.uk`
- **Tests**: Playwright (`@playwright/test`) + direct pg (`admin-db.js`)
- **Hosting**: GitHub Pages (Netlify migration planned)
- **CI**: GitHub Actions (runs full suite on push)

---

## DATABASE — QUICK REFERENCE

Tables: `classes`, `blocks`, `bookings`, `customers`, `parq`, `settings`,
`cancellations`, `waitlist`, `pending_bookings`, `customer_class_priority`, `catch_up_swaps`

Key SECURITY DEFINER functions (called from JS, bypass RLS):
`lookup_customer`, `upsert_customer`, `book_if_available`,
`check_priority_access`, `has_active_booking_on_block`, `get_schema_fingerprint`

Stripe columns on `bookings`: `stripe_payment_intent_id`, `stripe_checkout_session_id` (both nullable).
`settings.payment_mode`: `'bank_transfer'` (default) or `'stripe'`.
Stripe secret key + webhook secret: Edge Function env vars only — never in DB or index.html.

Full schema, RLS policies, constraints, triggers: see context.txt section 4.

---

## PLAYWRIGHT TEST SUITE — QUICK REFERENCE

Location: `tests-playwright/tests/`
Helpers: `supabase.js` (anon sb client), `admin-db.js` (direct pg, bypasses RLS),
`fixture-lookup.js` (getBlockByRole — use this, never hardcode block IDs),
`admin-auth.js`, `booking-flow.js`, `app-url.js`

**Critical rules:**
- Block IDs regenerate on every reseed — always use `getBlockByRole(role)`
- Every CB/AB/PB spec's beforeEach must assert `#test-mode-banner.on` first
- `admin-db.js` required for writes to `settings`, `bookings`, `customers` (RLS blocks anon)
- After raw SQL on `bookings`, manually resync `blocks.booked` (trigger won't fire)
- `npm test` automatically reseeds before running

Test fixture roles (11 blocks): `mon-past`, `mon-current`, `mon-upcoming`, `mon-full`,
`wed-past`, `wed-upcoming`, `thu-current`, `thu-locked`,
`fri-old-past`, `fri-recent-past`, `fri-upcoming`

Full fixture detail, spec counts, coverage tracker: see `TEST-PLAN.md` and context.txt section 6.

---

## ADMIN DASHBOARD — QUICK REFERENCE

Sidebar navigation (9 pages):
`#dbnav-bookings`, `#dbnav-byclass`, `#dbnav-clients`, `#dbnav-cancellations`,
`#dbnav-catchup`, `#dbnav-classes`, `#dbnav-reports`, `#dbnav-settings`, `#dbnav-backup`

Page panels: `#dbpage-bookings`, `#dbpage-byclass`, etc.
`loginAsAdmin()` lands on All Bookings (`#dbnav-bookings.on`).
Navigate with `switchDashPage(name)`.

---

## CURRENT STATE & PRIORITIES

**Payment system (PM-1 to PM-6): COMPLETE**
- Stripe Checkout + webhook fully built and tested
- 204 Playwright tests passing
- Production `payment_mode` currently `'stripe'` (system not yet live — confirm before go-live)
- **Prod Stripe still on a TEST key (sk_test_)** — swap to live at go-live ([#30](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/30))

**Refund sync (T1-09): T1-09a + T1-09b shipped** — `stripe-refund` edge function (test+prod) issues real refunds from Mark Refunded, fail-safe (no flag flip on Stripe error). RF-01..04 specs. Prod data wiped to a clean slate 2026-06-19.

**#31 mid-block refund fix shipped** — `rfbCalcRefund()` now uses `amount_due` (actual prorata paid) as the refund base, not `blk.weeks × price`. AB-24 regression spec added.

**Catch-up swaps (session 51): COMPLETE (test + production)** — Louise can record when a customer swaps to attend a different block's session. Max 2 swaps per customer per source block. Capacity-gated. Shows catch-up visitors in By Class view with over-cap warning. Migration 14 applied to both test and production DBs. User guide PDF: `CATCH-UP-SWAPS-GUIDE.pdf`.
- `catch_up_swaps` table: SERIAL PK, INTEGER FKs to customers + blocks, DATE class_date, admin-only RLS (anon revoked)
- CU-01..07 Playwright specs — all 7 passing. CU-07 (session 52) verifies the red over-capacity warning banner appears in By Class when a swap pushes a block above cap (uses mon-full + direct DB insert to bypass the UI gate). `fixture-lookup.js` updated to SELECT `weeks`. `generate-test-plan.js` updated with CU group.
- BST gotcha: `blocks.dates[]` is display strings ("1 Jul") NOT ISO — always compute ISO from `start_date + 7-day intervals` using local date methods.

**Security review complete (2026-06-19/20)** — full audit of front end, edge functions, RLS, secrets, repo. Foundations solid (key separation, clean git history, anon cannot read PII, webhook HMAC-verified). 9 issues filed (#32–#40). Report: `~/.claude/plans/can-you-carry-out-adaptive-beacon.md`.
- **#32 HIGH** (pre-go-live): `stripe-checkout` trusts client `amount_pence` — price tampering / pay-what-you-want. Fix: recompute server-side from `block_id`.
- **#33 HIGH** (live now): `send-email` open relay — anon key passes `verify_jwt:true`. Fix: add real-admin check (pattern already in `stripe-refund`).

**Backlog now managed via GitHub Issues** — use `gh issue list` at session start.

**Next likely work (priority order):**
- [#33](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/33): Fix send-email open relay — HIGH, live now
- [#32](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/32): Fix checkout price tampering — HIGH, must fix before go-live
- [#30](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/30): Go-live — swap prod Stripe key test→live + live webhook secret
- [#28](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/28): T1-09b prod manual verify, then close
- [#29](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/29): T1-09c inbound refund webhook sync (deferred)
- [T1-04](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/4): Netlify migration + custom domain (`book.lg-pilates.co.uk`)

**Full backlog**: `gh issue list` or https://github.com/mjones2420-netizen/lg-pilates-booking/issues

---

## COMMUNICATION STYLE

- Lead with the headline — one or two sentences max before any detail
- Plain English before technical detail
- One action per response, then wait for confirmation
- Don't bury action requests at the end of long explanations
- When a file is ready: provide ready-to-copy git commands

---

## GIT COMMANDS (standard end-of-session pattern)

```bash
cd ~/dev/lg-pilates-booking
git status
git add index.html context.txt CLAUDE.md
git commit -m "Short commit title"
git push
```

Adjust `git add` to match what actually changed. Single-line commit messages only — no em-dashes or backticks (zsh quoting issues).

---

## KNOWN GOTCHAS (most important — full list in context.txt)

- `toISOString()` shifts local midnight dates in BST — use `getFullYear()`/`getMonth()`/`getDate()` instead
- Supabase JS `.update()` without `.select()` swallows errors silently
- `payment_mode` is NOT reset by reseed — migration 12 handles this now
- After raw SQL on `bookings`, run the manual `blocks.booked` resync query
- Test admin users must be created via Supabase dashboard, not raw SQL
- `stripe-webhook` uses `verify_jwt: false` — this is intentional; HMAC signature is the auth gate
- Edge Function parity (test vs prod) is NOT checked by `schema-check` — verify manually
- The admin dashboard has a sidebar (not tabs) — old `#tab-*` selectors no longer exist
- `.card-when-day` must contain the day name, not the class name
- Book button labels must be "Book Current Block" / "Book Next Block" (exact — booking-flow.js clicks by text)
