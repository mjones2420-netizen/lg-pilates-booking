# LG PILATES BOOKING SYSTEM — CLAUDE CODE CONTEXT
Last updated: 18 Jun 2026 (Claude Code migration)

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

**A. Confirm index.html is present** — check line count (~4,023 lines).

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

Current test count: **198 tests, all passing** (Session 48 / T2-07 group block email built, T1-02 closed).

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
| `tests-playwright/migrations/` | SQL migrations (01–12) |
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
`cancellations`, `waitlist`, `pending_bookings`, `customer_class_priority`

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

Sidebar navigation (8 pages):
`#dbnav-bookings`, `#dbnav-byclass`, `#dbnav-clients`, `#dbnav-cancellations`,
`#dbnav-classes`, `#dbnav-reports`, `#dbnav-settings`, `#dbnav-backup`

Page panels: `#dbpage-bookings`, `#dbpage-byclass`, etc.
`loginAsAdmin()` lands on All Bookings (`#dbnav-bookings.on`).
Navigate with `switchDashPage(name)`.

---

## CURRENT STATE & PRIORITIES

**Payment system (PM-1 to PM-6): COMPLETE**
- Stripe Checkout + webhook fully built and tested
- 197 Playwright tests passing
- Production `payment_mode` currently `'stripe'` (system not yet live — confirm before go-live)

**Backlog now managed via GitHub Issues** — use `gh issue list` at session start.

**Next likely work:**
- [T1-04](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/4): Netlify migration + custom domain (`book.lg-pilates.co.uk`)
- [T1-06](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/6): Failed post-payment booking — client notification + correct screen
- [T2-07](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/25): Group block email built this session — verify in production (real send to a test block)

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
