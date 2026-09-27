# LG PILATES BOOKING SYSTEM — CLAUDE CODE CONTEXT
Last updated: 27 Sep 2026 (session 99 — #106 waitlist join throttle live on prod)

> This file = rules + current snapshot + gotchas. Read on demand:
> - `context.txt` — full schema, fixtures, front-end detail
> - `SESSION-LOG.md` — what each session did and why (sessions 53 onward)
> - `RELEASE-PLAN.md` — the release plan
> - [Project board](https://github.com/users/mjones2420-netizen/projects/1) — backlog priority order

---

## PROJECT OVERVIEW

Pilates class booking system for LG Pilates (Louise George). Baildon + Guiseley.
Single HTML file (`index.html`) on GitHub Pages. Backend: Supabase (Postgres).
Mark is the non-developer owner. Claude Code is the technical collaborator.

- Live URL: https://mjones2420-netizen.github.io/lg-pilates-booking/
- GitHub:   https://github.com/mjones2420-netizen/lg-pilates-booking
- Repo:     /Users/markjones/dev/lg-pilates-booking

**Read index.html directly from the repo. Never use a cached version.**

---

## RELEASE — ONE PLAN, IT LIVES HERE

`RELEASE-PLAN.md` at this repo's root is the **single source of truth for the whole release** —
the new website AND the booking system. Tracked by issue #70 → phase issues #63–#69.

The website repo (`~/Claude Code/Pilates Website`) has no deploy ticket of its own. **Never open a
parallel deploy/release ticket in either repo** — update RELEASE-PLAN.md and the phase issue instead.
Ordinary website content or feature work still belongs on the website repo's own board.

When a release step's status changes, also update the published Launch Roadmap artifact (see memory).

---

## SUPABASE PROJECTS

| | Project ID | URL |
|---|---|---|
| **Production** | `mrlooyixnlxzcfmvnqme` | https://mrlooyixnlxzcfmvnqme.supabase.co |
| **Test** | `ngzfhamjuviwfwuncrjo` | https://ngzfhamjuviwfwuncrjo.supabase.co |

MCP servers: `supabase-test` (locked to test) and `supabase-prod` (locked to production).
Always use the correct scoped server — never run test queries against production.
Keys are the new `sb_publishable_...` format (legacy JWT anon keys disabled). Schema detail: context.txt section 4.

Test admin: `admin@lg-pilates-test.local` — password in `tests-playwright/.env.test`.

---

## SESSION START — RUN EVERY SESSION

**0. Verify supabase MCP tools loaded** — ToolSearch for "supabase". If none load, the token in
`~/.claude/settings.json` `"env"` is missing/expired — tell Mark immediately, don't silently skip B/C.

**A. Confirm index.html is present** — ~6,000 lines.

**B. Time drift check** — run against `supabase-test`:

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
(Skipping this once cost a session 36 phantom test failures from fixture date drift.)

**D. Check the backlog** — `gh issue list --limit 200`; the project board is the priority order.

---

## WORKFLOW — NON-NEGOTIABLE RULES

1. **Mockup first** for any UI change — visual approval before editing index.html. Prefer iterating in the real browser against the test DB over a static mockup (static mockups hide dead-CSS bugs).
2. **One action per response** — stop and ask before acting on anything non-trivial.
3. **No git push until `npm test` is green** — including any new specs.
4. **New/changed functionality gets new Playwright specs in the same session.**
5. **TEST-PLAN.md is generated — never hand-edit it.** After adding or removing any test, run `cd tests-playwright && npm run test-plan` in the same session. New spec prefix? Add a group to `generate-test-plan.js` (it hard-errors on ungrouped prefixes). Long-form history: TEST-PLAN-HISTORY.md.
6. **GitHub Issues** is the backlog. **The project board ("Booking System Backlog", project #1) is the priority order** — top to bottom, not issue number. **New issues go at the bottom of Todo** unless Mark re-ranks. Finished work: close the issue AND set it Done on the board (both). BACKLOG.md is historical only.
7. **SQL: confirm and explain before running anything against Supabase.** Production writes always need Mark's explicit OK.
8. **Never update documentation until tests are green** (hard rule).
9. **Order for any product-code change: code review → security review (if payments/auth/DB/Edge Functions) → tests → commit/push.** Not gated on a trigger word. A PreToolUse hook blocks test runs until `touch .claude/.review-marker` — run the touch in a **separate** Bash call (same-call touch is still blocked).
10. **Do not propose and action in the same response** — state the plan, wait for sign-off, then act.
11. **Session notes go in SESSION-LOG.md**, not here. Update this file only when a rule, gotcha, or the current-state snapshot changes.

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
npm run test-plan          # regenerate TEST-PLAN.md
```

In Claude Code: check port 8000 first (reuse, don't stack), start the server in the background, then `npm test`.
No `--retries` needed. Known occasional parallel flakes (pass isolated): CU-04, CU-08, EC-09, cb-18, cb-30, SEC-08 (transient 502).

---

## KEY FILES

| File | Purpose |
|---|---|
| `index.html` | Single-file front end — all UI and client JS |
| `context.txt` | Full project context — schema, fixtures, front-end detail |
| `SESSION-LOG.md` | Per-session history and reasoning |
| `RELEASE-PLAN.md` | Release plan (website + booking system) |
| `TEST-PLAN.md` | Generated Playwright coverage tracker — never hand-edit |
| `PAYMENT-MODE-SPEC.md` | Stripe integration spec |
| `EMAIL-NOTIFICATIONS-SPEC.md` | Email spec |
| `supabase/functions/` | Edge Function source (stripe-checkout, stripe-webhook, stripe-refund, send-email, lookup-customer-throttled, join-waitlist-throttled; shared code in `_shared/throttle.ts`) |
| `tests-playwright/migrations/` | SQL migrations (latest: 30_close_old_doors) |
| `tests-playwright/tests/helpers/` | Shared test helpers |
| `.claude/commands/deploy.md` | Deploy pipeline (local only, gitignored) |
| `docs/user-guides/` | User-guide PDF series (#105) |

---

## TECH STACK

- **Front end**: Single `index.html` — vanilla JS, CSS variables, no build step
- **Database**: Supabase (Postgres) — two projects (test + production), free tier (keep-alive workflow pings both every 3 days)
- **Payments**: Stripe Checkout (Edge Functions: `stripe-checkout`, `stripe-webhook`, `stripe-refund`)
- **Email**: Resend (`send-email` Edge Function) — sender `bookings@lg-pilates.co.uk`. Test mode never calls Resend.
- **Tests**: Playwright (`@playwright/test`) + direct pg (`admin-db.js`)
- **Hosting**: GitHub Pages (branch source). Move to Netlify at `book.lg-pilates.co.uk` = release Phase 1.5.
- **CI**: GitHub Actions (full suite on push)

---

## DATABASE — QUICK REFERENCE

Tables: `classes`, `blocks`, `bookings`, `customers`, `parq`, `settings`, `cancellations`,
`waitlist`, `pending_bookings`, `customer_class_priority`, `catch_up_swaps`, `admin_users`

Admin gate: `is_admin()` (checks `admin_users`) — RLS policies use it, not bare `authenticated`.

Key SECURITY DEFINER functions:
- Public (anon): `upsert_customer`, `book_if_available` (5-arg, `p_offer_token`), `check_priority_access`, `has_active_booking_on_block`, `insert_parq`, `get_offer_details`, `booking_confirmed_for_session`
- Admin only: `record_catch_up_swap`, `offer_waitlist_space`, `release_waitlist_hold`, `admin_delete_block/class/customer`, `admin_remove_from_block`
- Service role only: `lookup_customer` and `join_waitlist` (browser goes via the `lookup-customer-throttled` / `join-waitlist-throttled` Edge Functions), `check_rate_limit` (shared per-IP limiter, `rate_limits` table keyed by bucket + IP; IPv6 counted per /64)

Stripe columns on `bookings`: `stripe_payment_intent_id`, `stripe_checkout_session_id` (nullable).
`settings.payment_mode`: `'bank_transfer'` (default) or `'stripe'`. Anon can read only the public settings keys (not `admin_email`).
Stripe secret key + webhook secret: Edge Function env vars only — never in DB or index.html.

Full schema, RLS policies, constraints, triggers: context.txt section 4.

---

## PLAYWRIGHT TEST SUITE — QUICK REFERENCE

Location: `tests-playwright/tests/`
Helpers: `supabase.js` (anon client), `admin-db.js` (direct pg, bypasses RLS), `admin-jwt.js`,
`fixture-lookup.js` (getBlockByRole — never hardcode block IDs), `admin-auth.js`, `booking-flow.js`, `app-url.js`

**Critical rules:**
- Block IDs regenerate on every reseed — always use `getBlockByRole(role)`
- Every CB/AB/PB spec's beforeEach must assert `#test-mode-banner.on` first
- CB specs that reach the reserve button call `resetPaymentMode()` in beforeEach (payment_mode is one global row; ST specs flip it)
- `admin-db.js` required for writes to `settings`, `bookings`, `customers` (RLS blocks anon)
- Read customer phone/type via `getCustomerById`/`getCustomerByEmail` (pg) — `lookup_customer` is no longer anon-callable
- Staging a specific `amount_due`: book, then UPDATE via admin SQL (`book_if_available` ignores `p_amount_due`)
- `settings.admin_email = 'mjones970@live.co.uk'` is baseline state — restore it, never delete it
- Specs that move seat counts / queues build their own class+block and clean up (e.g. WL specs) — don't mutate shared fixture blocks
- `classes` and catch-up swaps are fetched once at page load — `page.reload()` after inserting them
- `npm test` automatically reseeds before running

Fixture roles (11 blocks): `mon-past`, `mon-current`, `mon-upcoming`, `mon-full`, `wed-past`,
`wed-upcoming`, `thu-current`, `thu-locked`, `fri-old-past`, `fri-recent-past`, `fri-upcoming`

---

## ADMIN DASHBOARD — QUICK REFERENCE

Sidebar pages: `bookings`, `history`, `byclass`, `clients`, `cancellations`, `catchup`, `waitlist`,
`classes`, `reports`, `settings`, `backup` → nav `#dbnav-<name>`, panel `#dbpage-<name>`.
`loginAsAdmin()` lands on All Bookings (`#dbnav-bookings.on`); it enters via the public footer link `#pub-dashboard-link`.
Navigate with `switchDashPage(name)`.
Below 940px: sidebar hidden, bottom nav (4 slots + More sheet listing every page), expandable-row tables. Same DOM, CSS-only swap.
Ended blocks (`isBlockPast`: end_date < today) show on Booking history only, not All Bookings / By Class.

---

## CURRENT STATE (snapshot — the board is the truth for priorities)

- **Tests**: 296, all passing (as of session 99).
- **Live on production**: full booking flow, Stripe payments + refund sync, catch-up swaps, Booking history, mobile dashboard, **waitlist** (#71–75, session 95).
- **Prod Edge Function versions**: send-email v15, stripe-checkout v10, stripe-webhook v11, lookup-customer-throttled v3, join-waitlist-throttled v1, stripe-refund v5.
- **Stripe on prod is still a TEST key** — swap at release Phase 3 ([#30](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/30)).
- **New website LIVE at lg-pilates.co.uk** (DNS cutover 12 Sep 2026). Phase 1 gate period (2–4 weeks) before Phase 1.5.
- **Open risks / follow-ups**:
  - [#110](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/110) — accepted limitation of the #106 throttle: one IP can still fill a class waiting list in ~an hour (10 joins/hr vs list cap = class size). Revisit before Phase 2b.
  - [#107](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/107) — Mark's hands-on waitlist walkthrough on prod.
  - Booking-system header links still point at `new-lg-website.netlify.app` (9 occurrences in index.html) — now the website is live, swap to `lg-pilates.co.uk`.
  - Louise to confirm: catch-up swaps ignore waitlist holds (one-line change if she disagrees).

---

## COMMUNICATION STYLE

- Lead with the headline — one or two sentences max before any detail
- Plain English before technical detail
- One action per response, then wait for confirmation
- When a file is ready: provide ready-to-copy git commands

---

## GIT COMMANDS (standard end-of-session pattern)

```bash
cd ~/dev/lg-pilates-booking
git status
git add index.html context.txt CLAUDE.md SESSION-LOG.md
git commit -m "Short commit title"
git push
```

Adjust `git add` to match what changed. Single-line commit messages — no em-dashes or backticks (zsh quoting).

---

## KNOWN GOTCHAS (full list in context.txt; history in SESSION-LOG.md)

**Deploying**
- **Rollout order: migration → test, deploy functions → test, `npm test`, commit/push, then prod in the same order** (migration → functions → push). Functions need their columns; the suite needs the deployed functions.
- **A git push does NOT redeploy Edge Functions.** Deploy explicitly: `supabase functions deploy <fn> --project-ref <ref> --use-api`. The CLI is **linked to PROD** — always pass `--project-ref ngzfhamjuviwfwuncrjo` for test.
- **Preserve each project's `verify_jwt`**: PROD stripe-checkout + lookup-customer-throttled + join-waitlist-throttled = `true`; send-email + stripe-webhook = `false` on both (pass `--no-verify-jwt`); TEST stripe-checkout = `false`. Webhook uses HMAC, not JWT — intentional.
- Functions importing `_shared/` deploy fine with the CLI (it uploads the shared file). Via MCP `deploy_edge_function`, pass files as `<fn>/index.ts` + `_shared/throttle.ts` with entrypoint `<fn>/index.ts`.
- If `supabase` exits 137 instantly (even `--version`), the binary is being killed by macOS — `brew reinstall supabase` fixes it (session 99).
- Edge Function test/prod parity is NOT checked by `schema-check` — verify manually (`supabase functions download` + diff).
- `TEST_BYPASS_ENABLED` secret exists on TEST only — it's what makes caller-supplied `isTest` safe. Never set it on prod.
- **CI green ≠ site deployed.** Confirm GitHub Pages by hashing the live page against `git show <sha>:index.html`. Stuck build: `POST /repos/{owner}/{repo}/pages/builds`.
- Code review reads diffs, it doesn't run the app — always run the full suite for shared-chrome changes (nav, layout).

**Database**
- Changing a function's params or return type = DROP + CREATE (never overload). **DROP wipes the grants** — re-GRANT/REVOKE explicitly and verify.
- Verify a hand-applied prod migration by comparing `md5(pg_get_functiondef(oid))` across test and prod.
- Cascade deletes: delete `waitlist`/`bookings` explicitly before `classes` (FK ordering isn't guaranteed).
- After raw SQL on `bookings`, manually resync `blocks.booked` (trigger won't fire).
- Supabase JS `.update()` without `.select()` swallows errors — always check `error`.
- One-shot sends / webhook idempotency: atomic `UPDATE ... WHERE x IS NULL/false RETURNING` claim before acting.
- `payment_mode` is NOT reset by reseed (migration 12 handles it).
- Test admin users must be created via the Supabase dashboard, not raw SQL.

**Front end**
- `toISOString()` shifts local midnight in BST — use `getFullYear()`/`getMonth()`/`getDate()`.
- `blocks.dates[]` are year-less display strings — compute dates from `start_date + i*7 days`.
- iOS: insets via `--safe-top`/`--safe-bottom` (needs `viewport-fit=cover`). A `padding:` shorthand in a media query resets the inset — restate it.
- `navigator.clipboard.writeText` after an `await` is refused by Safari. Never use `window.prompt`/`alert` (freezes automated browsers).
- `.card-when-day` must contain the day name, not the class name.
- Book button labels must be "Book Current Block" / "Book Next Block" (booking-flow.js clicks by text).
- Dashboard uses a sidebar, not tabs — old `#tab-*` selectors don't exist.
- Public vs admin pages share one `<nav>`; variants toggle via `body:has(#pg-schedule.on)`. Public palette is scoped by CSS variable overrides on `#pg-schedule`/`#overlay`.
