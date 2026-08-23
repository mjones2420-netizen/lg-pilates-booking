# LG PILATES BOOKING SYSTEM — CLAUDE CODE CONTEXT
Last updated: 23 Aug 2026 (session 92 — public pages reskinned + header matched to new website)

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

## RELEASE — ONE PLAN, IT LIVES HERE

`RELEASE-PLAN.md` at this repo's root is the **single source of truth for the whole release** —
the new website AND the booking system. Tracked by issue #70 → phase issues #63–#69.

The website repo (`~/Claude Code/Pilates Website`) has no deploy ticket of its own: its #22 was
folded into Phase 1 (#64) and closed on 07 Aug 2026, because the two had drifted apart and
disagreed on the Netlify environment variables. **Never open a parallel deploy/release ticket in
either repo** — update RELEASE-PLAN.md and the phase issue instead. Ordinary website content or
feature work still belongs on the website repo's own board.

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

**0. Verify supabase MCP tools loaded** — before relying on them for anything (drift checks, queries,
migrations), confirm `supabase-test`/`supabase-prod` tools actually registered this session (e.g. via
ToolSearch for "supabase"). If none load, the session's shell env is missing `SUPABASE_ACCESS_TOKEN`
(lives in `~/.zshenv` + `~/.zshrc` since session 86/#102) — tell Mark immediately rather than silently
skipping the drift checks below. Fix is restarting the session, not editing config, unless the token
itself has actually changed.

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
6. **GitHub Issues** is the single source of truth for what's in the backlog. Consult open issues at session start (`gh issue list --limit 200`). Create new issues for any newly identified item before session ends. **The GitHub Project board ("Booking System Backlog", project #1, https://github.com/users/mjones2420-netizen/projects/1) is the priority order** — top to bottom, not issue number. **New issues go at the bottom of the Todo column** — don't insert mid-priority without Mark explicitly re-ranking. When an issue's work finishes: close it on the Issues tab AND set it to Done on the project board (both, not just one). BACKLOG.md is kept for historical reference only — do not update it.
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

Current test count: **276 tests, all passing** — no `--retries=2` needed (#101 fixed session 78). Session 82 added MB-01..MB-07 (mobile dashboard, #103); session 83 added MB-08 (safe-area insets) + MB-09 (Classes dots); session 84 added SEC-15, removed 1 (smoke-02's two lookup_customer tests collapsed to one — see below); session 90 added RF-05 (dashboard-issued Stripe refund sync, #29). Session 92 touched no test *count* (helper/selector fixes only).

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
Below 940px (session 82, #103): sidebar is `display:none`, replaced by a bottom nav
(4 slots + More sheet listing all 10 pages) and expandable-row tables instead of
horizontal-scroll tables. Same DOM, same `switchDashPage(name)` — CSS-only swap.

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

**Security review (2026-06-19/20)** — full audit of front end, edge functions, RLS, secrets, repo. Foundations solid (key separation, clean git history, anon cannot read PII, webhook HMAC-verified). 9 issues filed (#32–#40). Report: `~/.claude/plans/can-you-carry-out-adaptive-beacon.md`.
- **#32 FIXED + CLOSED (session 55)**: `stripe-checkout` price tampering. Server now recomputes price from the block's own price/weeks/dates (`calcProrataPence()`, mirrors `index.html`'s `calcProrata()`), rejects mismatched class_id/block_id. SEC-03 spec. Deployed test+prod.
- **#33 FIXED + CLOSED**: `send-email` open relay. Server-side templating for public emails (`reserved_confirmation`, `new_booking_alert`); admin/internal raw path gated by admin JWT or service-role key. Deployed test+prod (session 54 test, session 55 prod). SEC-01 spec.

**Backlog now managed via GitHub Issues** — use `gh issue list` at session start.

**Session 53 (2026-06-22):** CORS hardening (#40 item 1) — Edge Functions (stripe-checkout, stripe-refund, send-email) now restrict to GitHub Pages + future custom domain. Also fixed stripe-checkout repo file: was stale old version (booking_id flow); corrected to pending_bookings flow matching the webhook. Item 2 (leaked-password toggle) blocked — Supabase Pro plan only. Item 3 (rate limiting) deferred.

**Session 54 (2026-06-23):** #33 send-email open relay fixed and verified on TEST. `index.html` reserved/alert sends now use `sendSystemEmail(type, booking_id)`; admin sends carry the admin JWT. `stripe-webhook` source committed to repo and switched to the service-role key for its send-email calls.

**Session 55 (2026-06-25):** #32 stripe-checkout price tampering fixed (server-side recompute, SEC-03 spec). Mid-session found + fixed #42: the session-53 CORS hardening had silently never been redeployed to test (repo/deploy drift, same pattern as #33) — `http://localhost:8000` wasn't in `ALLOWED_ORIGINS`, so every browser-driven Playwright test hitting stripe-checkout/send-email/stripe-refund from localhost was silently failing CORS (ST-17 specifically). Added localhost to all three functions' allowlists, deployed test then prod. Verified prod `stripe-webhook` was already running the #33 service-role-key fix (no drift there). 217/217 tests green, deployed to prod, pushed (`bcb03f9`), #32 and #42 closed.
- **Process lesson (same as #33):** an Edge Function commit does NOT reach the live function until explicitly redeployed via `deploy_edge_function` — git push alone does nothing. Confirm deploy status (test AND prod) any time an Edge Function source file changes.

**Session 56 (2026-06-25):** UI tweak — the catch-up swap over-capacity warning was buried inside the By Class accordion (had to expand the right class group to see it). Moved to the global `#block-warnings` banner at the top of every dashboard page, alongside the existing hidden-class / no-next-block / pending-refund warnings, with a "View By Class" jump button. Removed the now-redundant inline banner from `renderClassesView()`. CU-07 rewritten to assert on the top banner instead of the accordion body — required adding a page reload mid-test since catch-up swap data is fetched once at login, not live. 217/217 tests green (1 unrelated pre-existing flake on SE-14, confirmed flaky on rerun, not touched this session). Committed and pushed (`7c7d619`).

**Session 57 (2026-06-28):** Two security issues fixed.
- **#34 FIXED + CLOSED**: Anon direct-insert backdoors. Migration 15 — new `insert_parq()` SECURITY DEFINER RPC validates booking ownership before writing PAR-Q. index.html updated to call `supabase.rpc('insert_parq', ...)`. Dropped `public_create_booking`, `public_create_customer`, `public_insert_parq` RLS policies. Revoked `GRANT INSERT ON parq FROM anon`. SEC-07 spec updated (parq now in forbidden list). Applied test + prod. Pushed `eecb08d`.
- **#36 FIXED + CLOSED**: stripe-refund + send-email only checked `authenticated`, not admin. Added `ADMIN_EMAILS` secret (prod: `mjones970@live.co.uk`; test: adds `admin@lg-pilates-test.local`). Both functions now check `userData.user.email` against the allowlist after `getUser()`. Service-role key path in send-email bypassed (internal stripe-webhook caller). Deployed test + prod. Pushed `083661f`.
- **#35 DEFERRED**: `lookup_customer` email enumeration — no rate-limiting fix available without Supabase Pro (#19). Left open.

**Session 58 (2026-07-01):** #39 FIXED + CLOSED — email builders interpolated firstName/lastName/email/phone with no escaping (some builders called `sanitise()`, others didn't). Fixed 4 client-side builders in index.html (`buildConfirmedEmailHtml`, `buildCancelledAdminEmailHtml`, `buildRefundClientEmailHtml`, `buildRefundAdminEmailHtml`) to wrap those fields in `sanitise()`. `stripe-webhook` had no escape function at all — added `esc()` and applied it in all 3 of its builders (`buildConfirmedEmailHtml`, `buildAdminAlertEmailHtml`, `buildPaymentFailedAdminEmailHtml`). Also updated the stale JS mirror of these builders in `tests-playwright/tests/helpers/email-templates.js` (used by ST-21/ST-22) so it doesn't drift from the real deployed function. New SEC-08 spec (7 tests) proves an HTML-bearing name comes out escaped on both the client and webhook copies. 224/224 tests green. Deployed `stripe-webhook` to test then prod (version 6 both, `verify_jwt: false` preserved). Committed and pushed (`22de100`).

**Session 59 (2026-07-02):** Full system review (code quality, reliability, security — DB/payments/email) plus a focused review of the catch-up swap feature. No code changed this session — assessment only, 20 issues filed. Full findings report: `~/.claude/plans/can-you-do-a-expressive-origami.md` (session-local, not in repo).

- **[#43](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/43) CRITICAL, STILL OPEN — public signups are enabled on BOTH Supabase projects.** `disable_signup: false` while the DB treats any `authenticated` login as admin (full PII/medical/settings access). Fix is a 2-minute dashboard toggle (Auth → Sign In/Providers → turn off "Allow new users to sign up"), not code — Mark needs to flip it on both projects. **This is the #1 priority, ahead of #30 go-live.**
- Other security from the full review: [#44](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/44) (leftover anon INSERT on pending_bookings), [#45](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/45) (send-email public path allows unlimited re-sends), [#46](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/46) (book_if_available trusts client-supplied amount/customer_id), [#47](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/47) (trim lookup_customer columns, partial #35), [#48](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/48) (upsert_customer can be used to clobber any customer by email — needs a design decision), [#49](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/49) (expired pending_bookings/health data never cleaned up), [#52](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/52) (webhook: no replay-timestamp tolerance + duplicate-delivery false-alarm race) — **FIXED session 67**.
- Bugs found: [#50](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/50) (Reports "Revenue MTD" always shows £0 — created_at never selected), [#51](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/51) (failed saves show success toasts — unchecked supabase errors).
- Refactor recommendations: [#53](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/53) (move all email building server-side, kills 3 duplicated template copies), [#54](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/54) (ISO dates as source of truth, kills the Dec–Jan prorata pricing bug), [#55](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/55) (real admin_users table instead of authenticated=admin), [#56](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/56) (transactional cascade-delete RPCs), [#57](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/57) (small housekeeping cleanups).
- **Catch-up swap feature review** (Mark found it fiddly / hard to avoid overbooking) — 5 issues filed: [#58](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/58) (show spaces/FULL in the class + date pickers — the big usability win), [#59](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/59) (move the capacity + max-2 checks into a DB RPC so overbooking-at-save becomes impossible; **keep** the over-cap warning banner — it's the only thing that catches a class drifting over capacity *after* a valid swap already exists, which a save-time check can't see), [#60](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/60) (plainer wording + auto-select the customer's home block), [#61](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/61) (confirm or drop the "max 2 swaps per block" rule with Louise), [#62](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/62) (consolidate two duplicated swap-loader code paths).

**Session 60 (2026-07-02/03):** Catch-up swap overhaul — #58, #59, #60, #62 implemented; #61 left open (Louise decision).
- **#59**: New `record_catch_up_swap` SECURITY DEFINER RPC (migration 16) — locks the target block row + customer row, re-checks capacity-per-date and max-2-per-source-block inside the DB, RAISEs coded errors (CU_FULL / CU_LIMIT / etc.). Grant hygiene: REVOKE anon+PUBLIC, GRANT authenticated+service_role. `saveCatchUpSwap` now calls the RPC; browser pre-checks removed (reviewers flagged stale-cache false-rejects — the pickers give the instant feedback, the RPC is the sole gate). Over-cap banner kept as the drift monitor.
- **#58**: Class + week pickers show "— N spaces" / "— FULL"; full options disabled. Per-date spaces = cap − booked − swaps landing that date.
- **#60**: Modal relabelled ("Who's coming?", "Their usual class", "Which class are they joining?", "Which week?"); usual class auto-selects when the customer has exactly one block, placeholder forces a choice when several.
- **#62**: Both swap loaders share `mapSwapRows()` + new `dashCustomerMap` global — one name-resolution path.
- CU specs 7→10 (CU-01..CU-10): DB-gate rejection + anon permission-denied (CU-03), max-2 at UI+RPC level (CU-04), picker labels/disabled (CU-08), double-save race closed (CU-09), labels + auto-select (CU-10). 227/227 green, TEST-PLAN.md regenerated.
- Migration 16 applied to BOTH test and production (prod approved by Mark mid-session, applied before the push so the deployed index.html never called a missing RPC). Grants verified on both: authenticated + service_role only, no anon.

**Session 61 (2026-07-03):** Security #46 + #45 fixed and closed (commit `3c221b1`), applied to BOTH test and production.
- **#46 FIXED + CLOSED**: `book_if_available` trusted the client's `p_amount_due` and `p_class_id`. Migration 17 — the RPC now recomputes `amount_due` server-side from the block's own price/weeks/start_date (ISO date arithmetic, mirrors calcProrata without the Dec–Jan string bug), validates class_id against the block (`CLASS_MISMATCH`), writes the block's own class_id, and ignores `p_amount_due` (kept in the signature so index.html and stripe-webhook callers work unchanged). Anon EXECUTE preserved — it's the public booking path. NOTE: the customer_id-attach half of #46's title is NOT fixed here — that's the #48 design decision.
- **#45 FIXED + CLOSED**: send-email public path allowed unlimited re-sends per booking_id. Migration 18 adds `reserved_email_sent_at`/`alert_email_sent_at` to `bookings`; the function claims the stamp atomically (`UPDATE ... WHERE col IS NULL RETURNING`) BEFORE sending → repeat calls 429, concurrent burst yields exactly one send; stamp rolls back on Resend failure; claim runs after the recipient checks so an unsendable email never burns the one shot. Deployed v11 test / v12 prod, `verify_jwt: false` preserved. **Order matters: migrations before function deploy** (the function needs the columns).
- New specs: SEC-09 (forged 1p ignored; forged class_id rejected) + SEC-10 (one-shot both types; 3-way concurrent burst → exactly one 200).
- Fixture fallout worth remembering: AB-24/SE-15/SE-16 had staged prorata state by passing `p_amount_due` — the very hole being closed. They now stage `amount_due` via direct admin SQL UPDATE after booking. Any future spec needing a specific amount_due must do the same.
- Test-DB gotcha learned the hard way: `settings.admin_email = 'mjones970@live.co.uk'` is baseline persistent state (smoke-01 asserts it, SE-10/SE-11 restore it). Specs must RESTORE it, never delete — deleting it mid-run broke 3 unrelated specs.
- Prod writes via the supabase-prod MCP are blocked by the auto-mode permission classifier — Mark switches permission mode and approves each call. Expect this on every prod migration/deploy.

**Session 62 (2026-07-04):** RELEASE PLAN written — no code changed. `RELEASE-PLAN.md` at repo root (commit `41a02f0`): phased rollout of the new Astro/Sanity website + booking system. Phases: 0 pre-flight security (#43 + token rotation) → 1 new site live on Netlify, booking = email Louise → 1.5 booking system to Netlify at `book.lg-pilates.co.uk`, hidden (implements #4) → 2a private pilot with select customers on bank transfer (payment_mode flips BEFORE pilot — pilot bookings are real) → 2b full bank-transfer launch → 3 Stripe live (#30) → 4 cancel GoDaddy hosting. GitHub tracking: umbrella issue [#70](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/70) with native sub-issues #63–#69 (label `release`), each phase issue has step checkboxes, gates, rollback.
- Key facts verified via live DNS: email is Microsoft 365 via GoDaddy (separate from hosting — cancelling hosting cannot break it); nameservers stay at GoDaddy, only 2 records change; website rollback value = A record `160.153.0.161`. Bank-transfer mode needs NO Stripe changes (keys sit unused).
- New Astro site facts: lives at `~/Claude Code/Pilates Website`, NOT in git yet, needs `@astrojs/netlify` adapter (`output: 'server'`), no "How to Book" page yet; GitHub repo `lg-pilates-website` currently holds old WordPress theme files (will be reused).
- Deploy routine amended (`.claude/commands/deploy.md`, local only): new step 0 — docs/plan-only changes skip tests + code review + security review, straight to commit/push. Any code change = full pipeline.

**Session 63 (2026-07-04):** Waiting-list feature — planned, mocked up, backlogged. No code changed.
- Design settled via Q&A: full block → "Join Waiting List" button + public "N on waiting list" count; join = name/email/phone; Louise-driven enforced holds (no cron — she is the timer) via new admin **Waitlist** dashboard page (Offer space / Release hold / Remove); reservation rule (public spaces = cap − booked − everyone on the list, floor 0) so a freed space is invisible to the public while anyone's waiting; offer email carries a personal `?offer=TOKEN` link that opens the normal booking flow (prefilled, "reserved for you" banner) even though the block shows FULL, DB-validated so only that person can take it; list dies with the block.
- Full plan with 9 worked scenarios + per-test descriptions: `~/.claude/plans/wobbly-imagining-cherny.md` (session-local, not in repo).
- Mockup approved (all UI + both emails, real site styles): 4 review decisions confirmed — join button **amber**, waiting count **shown publicly**, offer email **asks booking within 24h** (wording only, no timer — Louise enforces via Release hold), queue position **shown** to joiner ("You're #3"). Decisions logged as a comment on [#71](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/71).
- GitHub: tracking issue [#71](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/71) + 5 native sub-issues in build order: [#72](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/72) migration **20** (renumbered in session 64 — 19 was taken by #61; table reshape, wait-count trigger, `join_waitlist`/`offer_waitlist_space`/`release_waitlist_hold`/`get_offer_details` RPCs, `book_if_available` v3 via DROP+CREATE with `p_offer_token` param — new signature, do NOT overload), [#73](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/73) edge functions (two new send-email public types + Stripe token pass-through), [#74](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/74) public site, [#75](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/75) admin page, [#76](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/76) WL-01..13 Playwright specs + TEST-PLAN regen.
- Reused existing scaffolding: the empty `waitlist` table (reshaped, not rebuilt) and the already-loaded-but-unused `blocks.wait` column (now trigger-maintained).
- Decision: catch-up swaps deliberately ignore waitlist holds — a hold reserves a whole block, a catch-up occupies one physical session date, so a held (empty) chair can still host a one-week catch-up visitor. Flagged for Louise to confirm later; one-line change if she disagrees.

**Session 64 (2026-07-04):** #61 fixed and closed (commit `39a8b3f`) — softened the catch-up swap max-2-per-source-block rule.
- Mockup-first: built and approved a 3-state mockup (normal save, 3rd-swap warning with Cancel/Save Anyway, confirmed toast) before touching index.html — added a Cancel button per Mark's call, not just the modal's X.
- Migration 19 — `record_catch_up_swap` gets a 6th param `p_allow_over_limit` (default false, DROP+CREATE since new param = new signature). Max-2 (`CU_LIMIT`) is now a soft warning the admin can override per save; capacity (`CU_FULL`) stays hard, never overridable. Applied to test then production, grants re-verified (authenticated + service_role only, no anon).
- index.html: modal gets a `#cu-warn` banner + Cancel/Save Anyway button row. `saveCatchUpSwap(overrideLimit)` shows the warning on first CU_LIMIT hit instead of failing; override retries with the flag set.
- Code review caught a real bug before commit: if the override attempt failed for any other reason (capacity filled in the interim, user changed the picker to the same block, network error), the warning banner and hidden Record Swap button never reset, leaving the modal stuck. Fixed by having `fail()` call `cancelCuOverride()` first; also deduped the catch block, which had copy-pasted `fail()`'s body instead of calling it.
- CU-04 rewritten to cover the full flow: warn → cancel → retry → override → DB still gates without the flag → DB allows with it. 232/232 green. Security review: no findings (flag only softens a business rule already gated to authenticated/admin; capacity check untouched; no new anon exposure).
- Bookkeeping: migration 19 was reserved for the waitlist feature (#72) — since this took it, waitlist is renumbered to migration 20 (noted on #72, and above).

**Session 65 (2026-07-04):** #57 housekeeping grab-bag fixed and closed (commit `1fa0335`). No DB/Edge Function changes, index.html only.
- Reports "Fill rate" relabelled to "Confirmed rate" — it was always measuring confirmed ÷ total bookings, not class fullness. No calculation change, no test referenced the old label.
- Block email send counter fixed: `sendBookingEmail` now returns true/false instead of swallowing the result; `sendBlockEmail` only increments `sent` on an actual success. The "Sent to N of N clients" toast can no longer overstate when an individual send silently fails.
- Dead code removed: `initiateStripeCheckout()`, `toggleHealthForm()`, the legacy `switchTab()` shim, and duplicate success-view/form-view reset lines in `openModal()`. Confirmed all four were unreferenced anywhere (index.html, tests) before deleting.
- Item 1 of #57 (missing `sanitise()` on the `cu-customer` dropdown) turned out to already be fixed — the session 60 catch-up overhaul (`a97e783`) rewrote that dropdown and added it. No change needed.
- 232/232 tests green (no new specs needed — no test asserted the old "Fill rate" label or exact toast wording). Code review: no findings. Security review skipped — no payments/auth/DB/Edge Function files touched.

**Session 66 (2026-07-04):** #55 (real admin DB gate) + #56 (transactional cascade-delete RPCs) fixed and closed (commit `c0ed69c`). Applied to test AND production.
- **#55**: Migration 20 — new `admin_users` table (RLS enabled, zero policies, reachable only via a SECURITY DEFINER `is_admin()` function) plus ~20 RLS policies rewritten from `USING (true)` to `USING (is_admin())` across classes/blocks/bookings/customers/parq/settings/cancellations/customer_class_priority/waitlist/catch_up_swaps/pending_bookings. Belt-and-braces on top of #43 (still not flipped) — even an accidental or future account gets nothing unless explicitly listed. New SEC-11 spec creates a real non-admin authenticated user (direct `auth.users`/`auth.identities` insert with bcrypt via pgcrypto — `client.auth.signUp` was rejected by this project's Auth email validation, both `@test.example` and `@example.com`) and proves it gets zero rows/rejected writes everywhere, and that the #56 RPCs reject it outright.
- **#56**: Migration 21 — `admin_delete_block`, `admin_delete_class`, `admin_delete_customer`, `admin_remove_from_block` SECURITY DEFINER RPCs, each admin-gated, each one transaction. index.html's `deleteBlock`/`deleteClass`/`deleteCustomer`/`rfbConfirm` now call these instead of chaining separate `sb.from().delete()` calls from the browser.
- **Real bug caught by the new tests before shipping**: `admin_delete_class` doing a bare `DELETE FROM classes` failed with an FK-ordering error — `bookings` has both a direct `NO ACTION` FK to `classes` and an indirect `CASCADE` path via `blocks`, and Postgres doesn't guarantee the cascade finishes before the direct FK is checked. Fixed by explicitly deleting `waitlist`/`bookings` before `classes`.
- **Code review caught two more before shipping**: `admin_delete_customer` was missing the same `waitlist` cleanup as the class case (same FK class); `admin_remove_from_block`'s first draft trusted a client-supplied name/email (split from a display string) instead of reading the customer row it already had the ID for — reworked to a 3-param signature (`p_booking_id, p_sessions_attended, p_refund_amount`) that joins `customers` server-side. Required `DROP FUNCTION` + recreate on both test and prod since the signature changed.
- Orphan-check assertions added to AB-05/06, AB-07, AC-05, AC-23 (parq/bookings cascade away with the parent row, `blocks.booked` resyncs via the existing trigger). New AC-05 fixture now includes a booking+parq to actually exercise the cascade.
- 233/233 tests green (1 unrelated pre-existing flake on CU-04, confirmed flaky on isolated rerun, not touched this session). Code review: 2 findings, both fixed before commit. Security review: no findings.
- **Process note**: production Supabase writes go through an explicit confirm-first gate (the auto-mode permission classifier blocks them outright without a visible confirmation in the transcript, on top of the CLAUDE.md "confirm before touching production" rule) — every migration and grant-fix in this session was applied to test first, confirmed with Mark, then applied to prod.
- **#43 FIXED + CLOSED same session (post-wrap-up)**: Mark disabled "Allow new users to sign up" in the dashboard (Auth → Sign In/Providers) on both test and production. Verified via `GET /auth/v1/settings` — `disable_signup: true` on both. Was the top-priority blocker on the release plan (Phase 0/#63); now unblocked. Combined with #55, both the front door (signup) and the back door (authenticated=admin assumption) are closed.

**Session 67 (2026-07-05):** #52 (webhook hardening) + #54 (ISO-date prorata) fixed and closed (commit `69038f0`). Deployed to test AND production. #53 deferred by Mark's decision.
- **#54**: `calcProrata` (index.html) and `calcProrataPence` (stripe-checkout) now derive session dates from `start_date + i*7 days` (local date parts, BST-safe) instead of parsing the year-less display strings in `blocks.dates[]`. The old heuristic (`if(dt<new Date(yr,0,1)) dt.setFullYear(yr+1)`) never fired, so a past "29 Dec" session viewed in January was read as *next* December → counted as still-to-come → a January joiner charged FULL price instead of prorated. `totalSessions` now returns `weeks` (== dates.length) not `dates.length`. `book_if_available` (migration 17) already used correct ISO arithmetic, so recorded amount_due was always right — the bug only hit the *displayed* price and the Stripe *charge* amount. New PR-01 spec (4 tests) uses Playwright `page.clock.setFixedTime` to freeze the browser clock in January and calls the real `window.calcProrata` — no DB writes. New generate-test-plan group "Pricing / Prorata (PR)".
- **#52**: stripe-webhook `verifyStripeSignature` now rejects events whose signed `t` is >300s from now (replay protection; checked before the HMAC compute, so a forged fresh timestamp still fails the signature — no bypass). Separately, the `pending_bookings` delete moved to AFTER the confirmed-status/stripe-ID update + PAR-Q but BEFORE the email sends, so a duplicate/retried delivery early-exits on the "row not found → already processed" path instead of racing into `book_if_available` → ALREADY_BOOKED → the false "payment taken but booking failed" admin alarm. New ST-27 spec (2 tests).
- **Code review caught a real bug in my own #52 edit before commit**: first draft deleted the pending row BEFORE the confirmed-status/stripe-ID update — a crash in that update would drop the idempotency key with the booking left unconfirmed, no Stripe IDs, no email, and the retry silently early-exits. Fixed by ordering the delete after the critical DB writes (still before the slow emails). Re-verified green.
- **Deploy method note**: used the Supabase CLI (`supabase functions deploy <fn> --project-ref <ref> --use-api`) to deploy edge functions from disk instead of pasting ~440-line files through the MCP `deploy_edge_function` tool — far less error-prone for large function bodies. **The CLI is linked to PROD** (`~/dev/lg-pilates-booking/supabase/.temp/project-ref` = `mrlooyixnlxzcfmvnqme`), so ALWAYS pass `--project-ref ngzfhamjuviwfwuncrjo` for test; a bare deploy hits prod. **verify_jwt drift**: stripe-checkout is `verify_jwt:true` on PROD but `false` on TEST — preserve each project's own setting on deploy (omit `--no-verify-jwt` for prod stripe-checkout; pass it for both webhooks). Prod now: stripe-checkout v9, stripe-webhook v7. Test: stripe-checkout v14, stripe-webhook v8.
- 239/239 tests green. Code review: 1 finding (fixed). Security review: no findings (replay check strengthens the signature gate; the rest is DB-write ordering with no new attack surface).

**Session 68 (2026-07-05):** #53 (server-side email templates) fixed and closed — TARGETED scope (Mark's call), commit ee91c39, deployed test AND prod.
- **Scope decision**: only the genuinely CROSS-FILE-duplicated templates moved server-side — the confirmed-booking email and the card-payment admin alert, which existed as hand-synced copies in index.html + stripe-webhook + a test mirror (the exact drift that caused #39). The block / cancellation / refund emails were deliberately LEFT on the raw admin-JWT path: each already lives in exactly one place (index.html only) so there's no drift to kill, and moving the block-email batch loop server-side would lose its live "Sending 3 of 12" progress + risk edge-function timeouts, while the refund emails build from the deleted `cancellations` row (not a booking id) so they'd need new loaders for zero anti-drift gain.
- **send-email**: new `confirmed_booking` + `card_payment_alert` typed paths — server loads the booking by id and builds the HTML itself (single source of truth). Auth via new `requireTrustedCaller` helper (service-role key OR allow-listed admin JWT; anon → 401, non-admin → 403 — stricter than the client-built path they replace). `buildAdminAlertEmailHtml` parameterised with `isPaid` (true = "via card payment"/"Amount paid", false = reserved-flow wording). Recipients stay server-derived — open relay (#33) stays closed.
- **stripe-webhook**: deleted its 2 duplicated builders (`buildConfirmedEmailHtml`, `buildAdminAlertEmailHtml`), now calls the typed paths with the service-role key via a new `sendTypedEmail` helper. `buildPaymentFailedAdminEmailHtml` (single copy, no counterpart) stays inline. Email ordering unchanged (pending-delete before emails, #52 intact).
- **index.html**: deleted `buildConfirmedEmailHtml`; `confirmBookingAdmin` now calls new `sendTypedEmail('confirmed_booking', bookingId)` with the admin JWT. `sendBookingEmail` retained for block/cancel/refund. Confirmed-email subject standardised to "Your LG Pilates booking is confirmed — {className}".
- **Test-observability win**: deleted the stale `helpers/email-templates.js` mirror (the "4th copy"). Added a **test-mode html echo** to send-email — on the AUTHENTICATED paths only (never the public/anon path, never prod: gated `isTest===true` + trusted caller), the 200 response echoes `{to, subject, html}`. ST-21/ST-22/SEC-08 now call the REAL deployed test function (via new `helpers/admin-jwt.js` → admin sign-in) and assert on genuine server output — closes the long-documented "template checks only test a copy" coverage gap. SE-13 rewritten to assert the new typed payload shape (like SE-12). SEC-08 dropped the 2 mirror tests + the deleted client builder, added 2 server-side escaping checks.
- Deploy method: Supabase CLI from disk (session 67 lesson). CLI linked to PROD, so `--project-ref ngzfhamjuviwfwuncrjo` for test; bare/`mrlooyixnlxzcfmvnqme` for prod. Both functions `verify_jwt:false` on both projects — preserved with `--no-verify-jwt`. Now: **test** send-email v15 / stripe-webhook v9; **prod** send-email v13 / stripe-webhook v8.
- 237/237 tests green. Code review: no findings. Security review: no findings (typed paths more locked down than what they replace; escaping preserved + now tested end-to-end; echo confined to authenticated+test).

**Session 69 (2026-07-05):** #44 + #47 + #48 customer-data hardening fixed and closed (migration 22, commit 2c78e84). Applied to test AND production. index.html unchanged (verified — callers only use lookup id/existence).
- **#47**: `lookup_customer` trimmed to `RETURNS TABLE(id integer, first_name text)` — last_name/phone/customer_type no longer leak to anon. Return-type change needs DROP + CREATE (CREATE OR REPLACE can't change the signature); the drop clears the anon grant so the migration re-REVOKEs from PUBLIC + re-GRANTs to anon. Free-tier slice of #35; the rate-limiting/enumeration half still needs Pro (#19) and stays open.
- **#48**: `upsert_customer` now name-locked / phone-open — on an existing email it NEVER overwrites first_name/last_name; refreshes phone + customer_type only. New email still inserts a fresh row (email is the identity match key; merging stays a manual admin job — Mark's decision). Accepted trade-off: anon can still change an existing customer's phone by email (a reduction from the prior name+phone+type clobber). New SEC-12 spec (2 tests) proves both halves.
- **#44**: dropped the legacy `anon_insert_pending_bookings` policy + revoked anon INSERT on pending_bookings (stripe-checkout writes it with the service-role key), and revoked the default PUBLIC/anon/authenticated EXECUTE on the `sync_block_booked_count()` trigger function. SEC-07 grant-matrix spec moved pending_bookings from expected-INSERT to the anon-forbidden list.
- **Spec fallout from #47**: smoke-02 + cb-01 read `last_name`/`customer_type` off the lookup result — both rewired. smoke-02 now asserts the exact trimmed key set `['first_name','id']`; cb-01 reads customer_type via a new `getCustomerById(id)` admin-db helper (SELECTs phone + customer_type, which lookup no longer returns). Any future spec needing customer_type/phone must read via pg, not lookup_customer.
- **Cross-file trace (clean)**: no Edge Function calls `lookup_customer`; send-email reads customers via a direct table SELECT (service role), unaffected by the shape change. stripe-webhook's `upsert_customer` call still works — in Stripe mode the customer is created client-side (index.html ~2150) BEFORE redirect, so name-lock drops nothing; brand-new emails still INSERT the full name. sync_block_booked_count is a trigger function (invoked internally, needs no EXECUTE grant on the invoker), so revoking authenticated can't break admin writes.
- **Process note (Mark flagged)**: ran the test-site suite during PLAN verification BEFORE the code/security reviews — wrong for a shipping change. Deploy order (code review → security review → tests) governs even during plan execution; plan-verification is not a licence to jump the reviews. Memory `feedback-review-before-tests` updated with this refinement.
- Deploy: migrations applied to test first (MCP), suite green (239/239), code review no findings, security review no findings, committed + pushed, then prod migration applied (confirm-first). `get_advisors(security)` on prod shows no regression (pending_bookings anon INSERT gone; all remaining lints pre-existing/expected). No Edge Function source changed → no redeploy needed.

**Session 70 (2026-07-05):** Three backlog items fixed + closed (commit 0d8ece7, test+prod), plus a process-enforcement hook (commit 631cb99).
- **#50 FIXED + CLOSED**: Reports "Revenue MTD" always showed £0 — `renderDashboard` never SELECTed `bookings.created_at`, so every booking looked date-less and none counted toward the month. Added `created_at` to the select and `createdAt:b.created_at` to the mapped booking (renderReportsPage already read `b.created_at||b.createdAt`). New RP-01 spec (freezes nothing — seeds a confirmed booking with amount_due=60, created_at defaults to now(), asserts Revenue MTD > £0). New generate-test-plan group "Reports (RP)".
- **#51 FIXED + CLOSED**: failed saves showed success toasts — Supabase `.update()/.upsert()` hands errors back quietly and the code never checked them, so a signed-out/expired session could "save" bank details or confirm a booking and see green while nothing persisted. Error-checked six write sites: saveSettings, savePaymentSettings, confirmBookingAdmin, saveNewClass (update branch), saveEditBlock, toggleClassPriority (both branches, distinct delErr/insErr var names). Delete chains were already covered by the session-66 admin RPCs. New SE-21 spec (signs out the browser sb client mid-page, calls saveSettings, asserts "Error saving settings." not "Settings saved!", and DB unchanged).
- **#49 FIXED + CLOSED**: expired pending_bookings (incl. PAR-Q health data) never deleted. DISCOVERY: a daily pg_cron job `cleanup-expired-pending-bookings` (03:00, `DELETE ... WHERE expires_at < NOW()`) was ALREADY LIVE on both test and prod from an earlier session — never captured as a migration, issue never closed (drift). Migration 23 versions it as a tracked idempotent `cron.schedule(...)` and adds the 1-day grace the issue recommended (`expires_at < NOW() - interval '1 day'`) so a slow/retried Stripe webhook can't race the delete. `cron.schedule` keys on jobname → updated the live job in place on both projects (verified single job, grace clause, active). pg_cron already installed on both (v1.6.4). Mark chose "migration + grace" from a 3-option decision.
- **Process: review-before-tests enforcement.** Twice this session (and once in session 69) I ran the full suite before the code/security reviews. Root cause: the pipeline order lives in `.claude/commands/deploy.md`, which only fires on a deploy trigger word — a plain "fix" request slips past it and I improvised the order. Fix (two layers): (1) a `PreToolUse` Bash hook `.claude/hooks/require-review-before-tests.sh` (registered in new committed `.claude/settings.json`) BLOCKS `npm test`/`playwright test` while PRODUCT files (index.html, migrations, supabase/functions) are changed-but-unreviewed; clears via `touch .claude/.review-marker` after reviews; spec/helper edits not gated. (2) deploy.md + global `~/.claude/CLAUDE.md` reworded: the order is NOT gated on a trigger word. **Activation caveat: a settings.json created mid-session isn't watched until `/hooks` is opened once or Claude Code restarts — Mark needs to do that to arm the hook.** deploy.md stays local-only (gitignored); the hook + settings.json + gitignore line are committed (631cb99).
- Verification: 241/241 green, code review no findings, security review no findings (`get_advisors(security)` on test unchanged by migration 23 — all lints pre-existing/expected). Deploy order this session (after Mark's correction): reviews → tests → commit/push → prod migration (confirm-first).

**Session 71 (2026-07-05):** Resend daily-quota exhaustion fixed — send-email test mode no longer calls Resend at all (commit c800a51, deployed test AND prod).
- **Cause:** Mark got a Resend "100% of daily quota (100 emails)" email despite the site not being live. Root cause was the TEST SUITE, not real traffic: send-email's test-mode branch only redirected the recipient to the `delivered@resend.dev` sink — it STILL called the Resend API (line 435/439), and sink sends count against the free-tier 100/day quota. One full `npm test` fires ~20-40 real Resend calls (SE-12..17, SEC-01/08/10, ST-19..22/26, booking-flow + webhook specs). A few suite runs in one day → 100. The test/prod Resend key is shared, so test runs eat prod's allowance — a real go-live risk (Phase 2), not just a test annoyance.
- **Fix:** `isTest === true` now short-circuits BEFORE the fetch and returns a synthetic `{ id: 'test-mode-no-send' }` plus the usual echo. The one-shot claim still runs first (SEC-10 200->429 intact), rollback-on-failure path untouched, `finalRecipient`/sink line removed. Prod (isTest falsey) is byte-identical. Verified every test caller passes `isTest:true`: browser sends `isTest:IS_TEST_ENV` (true under `?env=test`), direct admin-JWT specs pass `true`, webhook passes `metadata.is_test`→bool. So the fix spares 100% of suite quota burn.
- **Why tests still pass:** no spec reads Resend's `data.id` (the only Resend-sourced value); all assert on the server-built echo (`html/subject/to`) + status codes, which the mock preserves. New SE-22 asserts `body.id === 'test-mode-no-send'` (the sentinel only the skip-path returns) → proves Resend was skipped.
- **Sequencing note:** deploy-to-test had to run BEFORE `npm test` (like migrations) — otherwise the suite runs against the old quota-exhausted function and email specs fail on the throttle. Order this session: code review (no findings) → security review (no findings) → deploy test → npm test (242/242; CU-08 flaked in full run, green isolated) → commit/push → deploy prod (confirm-first).
- **Not done (optional):** separate Resend API key for test vs prod (option 2) — unnecessary now that test never calls Resend, but would fully isolate the two accounts if ever wanted. No issue filed.

**Session 72 (2026-07-06):** #38 fixed + closed (commit 703cf1d, migration 24 test+prod), plus #37 verified + closed and #35 downgraded — no new product bug work, one security hole closed.
- **#38 FIXED + CLOSED**: settings table was world-readable — `public_view_settings` was `FOR SELECT TO anon, authenticated USING (true)`, so anyone with the anon key read every row incl. `admin_email` (harvestable for phishing). Migration 24 makes the anon read **row-level**: anon SELECT limited to `key IN ('bank_name','bank_sort_code','bank_account_no','payment_mode','stripe_publishable_key')`; new `admin_view_settings` (`TO authenticated USING is_admin()`) gives a logged-in admin all rows. INSERT/UPDATE unchanged (is_admin(), migration 20). Bank details stay anon-readable by design (shown on the public bank-transfer screen); only `admin_email` moves behind the gate.
- **index.html**: the startup settings read runs as anon (so admin_email is now filtered out), and the admin dashboard REUSED that startup read — so `loadSettings()` was extracted and is re-called after admin login (`checkDashLogin` + `showDashboard` session branch) so admin_email repopulates the settings form + block-email admin copy. Also dropped the public `if(appSettings.adminEmail)` guard on the `new_booking_alert` send (line ~2255) — send-email gates on admin_email server-side (`skipped` when none), so Louise's alert still fires; the public page no longer needs the value.
- **Edge functions unaffected**: all settings reads in send-email (`loadBookingContext`) and stripe-webhook use the service-role key (bypasses RLS) — verified before shipping. No function redeploy needed.
- **Specs**: new SEC-13 (anon SELECT excludes admin_email + keeps public keys; authenticated admin CAN read admin_email — uses a dedicated signed-in client). **smoke-01** line 40 `toEqual` updated to drop admin_email from the expected anon key set (would otherwise fail). **se-17** line 90 rewired from an anon `sb` read of admin_email (now returns nothing) to a service-role `getPool()` read. 244/244 green. Code review + security review: no findings.
- Deploy order: reviews → drift-check test (no drift) → migration 24 test → npm test (244) → regen TEST-PLAN → commit/push (703cf1d, live front-end) → drift-check prod (no drift) → migration 24 prod (confirm-first). index.html works under BOTH old and new RLS, so pushing before the prod migration was the safe order (old live index.html would break under new prod RLS — no re-read, and its admin_email guard would kill public alerts).
- **#37 CLOSED** (Edge Function drift): verified by downloading live prod source (`supabase functions download --project-ref mrlooyixnlxzcfmvnqme --use-api`) and byte-diffing against the repo — stripe-checkout / stripe-webhook / send-email IDENTICAL; stripe-refund differs only by a code comment + trailing newline (repo slightly ahead, no behaviour drift). All 4 now tracked in git; CLI deploy-from-disk keeps them synced. Test-vs-prod parity remains a documented manual check (expected version gaps, not drift).
- **#35 DOWNGRADED** to "NICE TO HAVE" (retitled): the PII field-leak half was fixed session 69 (#47, lookup_customer trimmed to id+first_name); the remaining rate-limit/enumeration half is NOT blocked on Supabase Pro — free-plan options exist (edge function + throttle, Cloudflare Turnstile, or a DB counter table). Note added to the issue. Low real-world risk now; don't spend effort pre-launch.

**Session 73 (2026-07-07):** GitHub Project board built and adopted as the canonical backlog priority list. No code, DB, or test changes.
- Created "Booking System Backlog" (project #1, https://github.com/users/mjones2420-netizen/projects/1), linked to the repo (`gh project link`) so it shows under the repo's Projects tab.
- All 60 open issues added. Final board order top→bottom: misc/older backlog (bugs, chores, T1/T2/T3 items, go-live #30, security #35) → Waitlist (#71-76) → Release (#63-70) → Future Feature Upgrades (#80-100, bottom).
- Status field trimmed to just **Todo / Done** (removed the default "In Progress" option — Mark tracks in-progress via the session, not the board). All 60 items set to Todo.
- New workflow rule (also in section "WORKFLOW — NON-NEGOTIABLE RULES" item 6 above): closing an issue's work now means BOTH closing it on the Issues tab AND setting it Done on the board.
- Required a one-time `gh auth refresh -s project` (device-code flow, Mark approved on his phone since he was remote) to get the `project` OAuth scope — `gh` didn't have it before.
- Labels (Labels field already exists on the board, just not shown as a column by default) — Mark can toggle it on via the view's column settings in the browser; no CLI lever for that.

**Session 74 (2026-07-11):** New "Booking history" dashboard page — ended blocks hidden from All Bookings + By Class (commit 6441c05, index.html + specs only, NO DB/Edge Function/production changes). Mark's question ("when a block ends, should its customer details clear from the dashboard?") — confirmed nothing is automatic today, then built the hide-by-default behaviour he wanted.
- **Behaviour**: bookings whose block has ended (`end_date < today`) now render on a new view-only `#dbpage-history` page (own search box `filterHistoryTable`, View button only — no Confirm/Remove/Del) instead of `#btbody`; current/upcoming stay on All Bookings. `renderClassesView` filters ended blocks out entirely (By Class = current/upcoming only). Nothing deleted — display-only relocation. Cutoff = day AFTER end_date, no grace period.
- **New helper `isBlockPast(block)`** (index.html ~1259, after getNextBlock) — single date-driven cutoff (`end_date < local-midnight-today`, BST-safe via `+"T00:00:00"`+`setHours(0,0,0,0)`). blocks.status deliberately NOT consulted (it's never auto-updated). NOTE: pre-existing inline end_date comparisons (getActiveBlock, renderBlockWarnings, public schedule, catch-up pickers' `status==='active'` gate) were NOT migrated to it — flagged in review as drift risk, left as-is (out of scope). If isBlockPast's rule ever changes, those need revisiting.
- **renderDashboard** now builds two row strings (bhtml current / hhtml past) in one pass, both indexing the same global `bookings` array so `viewBooking(i)` etc. work from either table. New `setBookingTables()` mirrors loading/error states into BOTH tbodies (review fix — History was showing stale rows on error). All-bookings empty state now distinguishes "none at all" vs "all on past blocks — see Booking history".
- **PAR-Q missing-form banner** now skips past-block bookings (`!b.blockPast`) — a missing form on an ended block isn't actionable and its row lives in History where the scroll-to-highlight can't reach. Deliberate; flagged as removing the only audit signal for a never-collected form (low risk, noted for Louise).
- **By Class empty-state** reworded (Mark chose Option 2): "No current or upcoming blocks — see Booking history for past terms." (class with only-past blocks). Dead "archived" blkStatus branch removed (past blocks never reach that loop now — 2-state active/upcoming).
- **Mockup-first**: approved Artifact mockup (3 iterations: initial → View-only History rows after Mark caught the pointless "Remove from Block" on ended bookings → Option 2 wording baked in).
- **Decisions Mark confirmed**: History stays VIEW-ONLY (no self-serve late-refund/late-payment/customer-delete for past-only bookings — rare, would need Mark+Claude via DB); ended blocks can no longer be edited/deleted from the UI (Edit/Delete Block lived only in By Class) — ACCEPTED, they just accumulate invisibly (deleting one would wipe its history anyway).
- **Specs**: AB-25 (a: past bookings on History not All Bookings, view-only, data intact, View works; b: History search filters) + AB-26 (a: ended blocks don't render in By Class, badge counts non-past, no Archived badge; b: only-past class shows Option 2 empty state + working Add Block). ac-05 empty-state assertion updated ("No blocks yet"→"No current or upcoming blocks"). AB-26b creates its own class+block via pg (no fixture has an only-past class) and self-cleans in afterEach — needs `page.reload()` after the insert because `classes` is fetched once at page load. 248/248 green, TEST-PLAN regenerated (248 tests, 175 files).
- **Reports page deliberately untouched** — it shows lifetime totals by design; splitting past/current there would be a separate request.
- Code review (high effort): 10 findings — 5 fixed pre-commit (ac-05-not-a-finding-but-caught, stale History on error, misleading empty message, dead archived branch, over-promising "Nothing is deleted" banner softened to "when a block ends"), 5 accepted by Mark's decisions above. Security review skipped (display-only; no payments/auth/DB/Edge Function surface). No production Supabase changes this session.

**Session 75 (2026-07-12):** No code/DB-schema changes. Mark spotted a leftover real-looking booking on PROD (id 237, 19 Jun, confirmed, real Stripe payment intent under the still-test Stripe key) — his own manual test from the prod data wipe day, kept intentionally since he's using prod to visibly test things (test scenarios stay in the test DB as usual). Added 5 more customers + confirmed bookings + PAR-Q forms to prod block 57 (Intermediate, ends 13 Jul 2026 — tomorrow) via the same RPCs the live app uses (`upsert_customer`, `book_if_available`, `insert_parq`), so Mark can watch the new Booking History page (session 74) pick these up live once the block goes past. No Stripe checkout involved (booked directly as confirmed) — flagged to Mark before running that this skips PAR-Q/Stripe unless asked, he asked for PAR-Q to be added too. New customers: Amy Baker (169/238), Ben Carter (170/239), Chloe Davies (171/240), Daniel Evans (172/241), Ella Foster (173/242).

**Session 76 (2026-07-23):** Bug batch built + committed, but the Supabase access token was DEAD all session so nothing reached prod (test-DB migrations went via direct pg). Shipped to git + test: #79 (hardened flaky RP-01/CU-08, `4299fb6`), #5 (class-time DROPDOWN pickers Hour/Min/am-pm on Add/Edit Class — chosen over native `type=time` for desktop consistency, stored format unchanged "9:45am"; AC-01/AC-06 updated, AC-25 added, obsolete AC-19-22 removed; `ed7aef6`), #6a (post-payment screen polls new `booking_confirmed_for_session` RPC and shows an honest amber "payment received, place not secured" screen instead of a false Confirmed; graceful fallback where RPC absent; `46d56a4`). Migrations 25 (#78 case-insensitive email) + 26 (#6a RPC) applied to TEST only. #101 filed (suite flaky in parallel — payment_mode contamination + AC-08 + EC-07, all pass on retry; run `npm test -- --retries=2`). #77 closed (tracked in RELEASE-PLAN + #65).

**Session 77 (2026-07-23):** Token refreshed — finished the prod side of session 76. Applied **migration 25** (#78 — `lookup_customer`/`upsert_customer`/`check_priority_access` now match `LOWER(email)=LOWER(p_email)`; fixes the `Mjones970@live.co.uk` priority-refusal bug) and **migration 26** (#6a RPC) to PRODUCTION. Built + shipped **#6b** (commit `570eaad`): `stripe-webhook` now emails the CUSTOMER a "payment received, place not secured" message on post-payment booking failure (CLASS_FULL/ALREADY_BOOKED), alongside the existing admin alert — new `buildPaymentFailedClientEmailHtml`, recipient server-derived (off the open-relay path) + `esc()`'d, both sends non-fatal. New ST-29 spec (uses the naturally-full `mon-full` block — no block mutation, parallel-safe). Prod `stripe-webhook` now **v9** (`verify_jwt:false` preserved). 252 tests green (`--retries=2`), code + security review clean. #78 and #6 CLOSED + board Done. Filed **#102** (generic pre-go-live secret-storage/repo-visibility hardening — details in private memory, deliberately vague on the public repo).

**Session 78 (2026-08-03):** Backlog re-prioritized end to end, then 3 fixes shipped test+prod.
- **Backlog cleanup**: closed 3 stale/superseded issues (#4 Netlify migration → superseded by release #65; #11 waitlist-connect → superseded by #71-76; #8 Stripe refund umbrella → superseded by its own children #28/#29), all 54 remaining Todo items regrouped and reordered on the project board by priority (fix/harden-now → payments/go-live → waitlist → release → future features → older misc backlog last, per Mark's explicit call to push both release and future-feature work to the bottom). New standing rule: new issues always land at the bottom of Todo, never inserted mid-priority (CLAUDE.md rule 6 + memory updated).
- **#101 FIXED + CLOSED** (commit `21d506c`): flaky Playwright suite under parallel workers. Root cause 1 (highest value) — `settings.payment_mode` is a single global row; ST (Stripe) specs flip it to `'stripe'` mid-run while CB (bank-transfer) specs are mid-flow, leaving `#reserve-btn` stuck disabled. Fixed by having all 9 CB specs that reach the reserve button force `payment_mode='bank_transfer'` via `resetPaymentMode()` in `beforeEach`, before `page.goto()` — safe because `PAYMENT_MODE` is read into a JS global once at page load (index.html:1159) and never re-fetched live, so this can't re-open the race the other way onto ST specs (verified by reading the source, not assumed). Root cause 2 — AC-08's first click after admin login occasionally exceeded the 30s actionability timeout under load; added a `waitForLoadState('networkidle')` after login (verified no realtime/websocket connections exist that would make this hang). Root cause 3 — EC-07 rolled its own T&Cs-check-then-click instead of using the shared `agreeAndReserve()` helper, skipping its `toBeEnabled()` wait; added the same guard inline. Verified: the 18 affected tests × 3 repeats = 54/54 green, plus two full 252/252 clean runs with default parallel workers, no retries needed (previously needed `--retries=2`).
- **#19 FIXED + CLOSED** (commit `6c35ed5`): Mark chose not to pay for Supabase Pro. Added `.github/workflows/keep-alive.yml` — pings both test and prod every 3 days via the existing anon-permitted `lookup_customer` RPC (touches no data), keeping both free-tier projects inside the 7-day auto-pause window. First attempt used the bare REST API root (`/rest/v1/`) but that now 401s for anon-type keys on this gateway version (`UNAUTHORIZED_INVALID_API_KEY_TYPE`) — switched to the RPC call, verified 200 on both projects before shipping.
- **#20 FIXED + CLOSED** (commit `7a849e9`), then legacy keys manually disabled by Mark in the Supabase dashboard same session: migrated from the legacy JWT anon key to the new `sb_publishable_...` format. Updated in all 4 places the key existed: `index.html` (prod+test), `tests-playwright/.env.test` (local, gitignored), the two GitHub Actions repo secrets (`gh secret set`), and `keep-alive.yml`'s inline keys. **Caught a real risk during review before shipping**: prod's `stripe-checkout` Edge Function runs `verify_jwt:true` (test project is `false` — known drift since session 67), and anonymous customer checkout calls fall back to the anon/publishable key as their bearer token when no session exists (index.html ~2215) — tested directly against prod with a harmless empty-body request (400 inside the function, no Stripe/DB writes) and confirmed the gateway's JWT check accepts the new key format fine before it ever reached a real customer. Verified: 252/252 local suite green against the new keys (including ST specs that exercise stripe-checkout through the browser), clean CI run on the new GitHub secret, then — after Mark disabled the legacy keys in the dashboard — reconfirmed live: old key now 401s, new key still 200s, live GitHub Pages site still serves the new key.
- Test count unchanged at 252 (no specs added or removed this session, only existing beforeEach/assertions hardened).
- **Further backlog triage (same day, no code changes)**: 5 more issues closed, all via GitHub CLI only (no index.html/DB/Edge Function touched).
  - **#21** relabeled `chore`→`future-feature`, moved to below #100 on the board — leaked-password protection is Supabase Pro-gated (confirmed, matches the earlier #35/session-53 finding) and Mark isn't paying for Pro, so it's parked as a post-launch item rather than left as an active blocker.
  - **#24** (T1-11 client self-service "class switch") CLOSED as superseded by the already-built **catch-up swaps** feature (sessions 51/60/64) — same behaviour (single-session swap, capacity-gated via `record_catch_up_swap`, original booking untouched so it auto-resumes next week), just admin-recorded (Louise) rather than self-service, which resolves the open design question #24 had left unanswered.
  - **#10** (printable attendance register) CLOSED as duplicate, folded into **#86** (digital attendance/no-show tracking) — Mark confirmed printable isn't actually needed, the digital version covers the real requirement. Comment added on #86 noting it now owns the requirement solo.
  - **#16** (update 11 outdated demo videos) CLOSED — not worth re-recording when it's unclear Louise watches them; can reopen if she confirms she wants them.
  - **#17** (refresh user guide PDF) CLOSED — the PDF isn't actually being used, so no point keeping it in sync with releases.
  - All 5 set to Done on the project board (closed-but-not-built pattern, same as #4/#11/#8 earlier this session).

**Session 82 (2026-08-06):** #103 mobile dashboard built and shipped, then polished — two separate Claude sessions worked this in sequence on the same repo today.
- **#103 built (commit `cd9abe5`, 15:10)** — done in a different Claude session (desktop app, Opus 5) than this one. Makes the whole admin dashboard usable on a phone, index.html + specs only, no DB/Edge Function/production change. Three faults fixed: (1) the block-warnings banner had no height cap and starved the content pane to zero on production data — now collapses to one line and caps at 40dvh open; (2) bottom nav was clipped offscreen — `.db-layout`'s hardcoded top offset replaced with a measured one (`syncDashLayoutHeight` publishes `--db-top`); (3) every dashboard table now restyles below 940px into expandable rows (name + the one status you scan for, everything else one tap away). Also: More sheet now lists all ten pages (was 4 reachable, jumped to Settings). Breakpoint moved 700px→940px for dashboard rules only (covers iPhone landscape 844-932px); accepted side effect, a desktop window narrower than 940px now gets the mobile layout too. One DOM at every width — desktop `<table>` markup restyled, never replaced, so index-based handlers (`viewBooking(i)` etc.) keep working. New MB-01..MB-07 specs (14 tests, 390×844 + MB-07 as the desktop regression guard). Test count 252→266.
- **This session (commit `e04dd5a`, 16:55)** — Mark reviewed the shipped build via screenshots with red-line annotations and flagged three follow-ups, all fixed in `index.html`, real fixes not test-only overrides:
  - Sub-line wrap: `.m-sub` was truncating with an ellipsis (`white-space:nowrap`) — changed to wrap (`white-space:normal`).
  - By Class card gap: the CSS meant to add breathing room around the block card (`.class-group-body.on{padding:...}`) was **dead code** — `toggleClassGroup()` toggles the panel via inline `style.display`, never adds an `.on` class, so that rule never matched anything, in mobile or desktop. Two prior gap attempts (A/B) both looked identical to Mark for exactly this reason. Fixed by targeting the real element, `.class-group-body { padding:16px 16px 16px }`.
  - Classes page "Upcoming block" row: was only orange-highlighted (`m-warn`) when there was no next block (a warning state); now always orange, matching how the green "Active" row already always highlights when a block exists. The inline "Upcoming" badge pill was already set to auto-hide inside a highlighted cell (pre-existing CSS), so no new CSS was needed — just made the class assignment unconditional.
  - Debugging method worth remembering: iterated in the real browser against the test DB via throwaway Playwright scripts (`page.addStyleTag` + screenshots), not a static HTML mockup — caught the dead-CSS bug this way, which a static mockup would have hidden.
  - Code review: clean. Security review: skipped, no payments/auth/DB/Edge Function files touched. Tests: 266/266 green.
- **GitHub Pages deploy stuck — NOT our code.** Push succeeded and CI (Playwright Tests workflow) went green on GitHub too, but the "pages build and deployment" run has failed/been cancelled twice in a row (~16:22 and ~16:58) after the build step itself succeeded — cause is a live **GitHub-wide Major Outage** affecting both Actions and Pages (confirmed via githubstatus.com, ongoing as of the last check ~17:40 UTC). No workaround exists — Pages here runs through the same Actions pipeline that's degraded, branch-source or Actions-source makes no difference. Rerun triggered again before wrap-up; **site may still be on the pre-session version live** until either GitHub recovers or someone reruns it again. Run ID to check: `31117973868` (`gh run view 31117973868 --json status,conclusion` from the repo root).

**Next likely work — see the [project board](https://github.com/users/mjones2420-netizen/projects/1) for the live priority order (top to bottom = priority; this file is a snapshot, the board is truth).** Board order as of session 78: fix/harden-now items → payments/go-live prep → Waitlist (#71-76) → Release (#63-70) → Future Features (#80-100) → older T1/T2/T3 misc backlog (deliberately last). New issues always get added at the **bottom** of Todo, never inserted mid-priority.

**Session 83 (2026-08-07):** Recovered the stuck #103 deploy, then fixed two mobile faults Mark found on his phone (commit `a0b5ff4`). index.html + specs only — no DB, Edge Function, or production Supabase change. **#103 CLOSED + Done on the board.**
- **Stuck Pages deploy recovered.** Session 82's `e04dd5a` never went live: run `31117973868` sat in **queued** for ~26h with `jobs: []` (no runner ever claimed it), collateral from the GitHub-wide outage. Playwright CI on the same commit had passed, so the repo was fine. Once GitHub went green, `gh run cancel` reported the run already completed, so the retrigger was `POST /repos/{owner}/{repo}/pages/builds` (Pages here is **branch-source / `build_type: legacy`**, so the API build request is the lever — not a workflow rerun). Built in ~45s. Verified by SHA256-diffing the live page against `git show e04dd5a:index.html` — identical. **Lesson: "CI green" says nothing about Pages; confirm the live bytes, and prefer hashing the served page over grepping it** (two greps returned 0 against both live and local purely because the CSS spans lines inside a media query — nearly misread as a failed deploy).
- **iOS safe-area insets (Safari's floating URL bar covered the bottom nav).** Safari's bottom bar and the home indicator OVERLAY the page rather than shrinking the viewport, so `.db-layout`'s `100dvh` sizing never avoided them. Added `viewport-fit=cover` to the viewport meta — without it `env(safe-area-inset-*)` reports **0** and no other fix can work — then re-added each inset as padding on every screen-edge element: `nav` (top), `.db-bottom-nav` / `.db-more-sheet` / `.toast` (bottom), `.overlay` (both), and `showValidationToast`'s inline `top`.
  - Insets are funnelled through **`--safe-top` / `--safe-bottom`** custom properties rather than inlining `env()` everywhere. Two reasons: the TEST MODE banner can zero the top one in a single place, and **a test can force a non-zero value — `env()` cannot be simulated in a desktop browser**, so asserting the real path would otherwise be impossible.
  - `body.has-test-banner nav { --safe-top:0 }` is scoped **to nav deliberately**: the fixed banner already covers the notch and pads body past it, but overlays/modals still need the real inset. An earlier draft put it on `body` and silently disabled the inset for modals too — caught by the test.
  - **Gotcha that bit twice: a shorthand `padding:` in a media query resets the inset the base rule added.** Both `nav { padding:14px 18px }` and `.overlay { padding:10px }` (the ≤700px block) had to re-state it. Any future padding shorthand on an edge-anchored element must do the same.
- **Classes page status dots re-pointed (Mark's report).** They read green = active block, orange = **NO** upcoming block (a warning) — inverted against every other use of the colour, including the By Class eyebrow where `.m-dot.warn` labels "Upcoming block", and the expanded row directly beneath the dot whose "Upcoming block" cell is always orange (session 82). Now: green = active exists, orange = upcoming exists, no dot = empty slot. Nothing lost — the missing-next-block warning is already raised by `renderBlockWarnings`' "expiring" list.
- **New specs MB-08 (4) + MB-09 (2)**, 266→272. MB-08b pins the **zero-inset** computed padding to its exact pre-change values, so the inset work can't silently cost non-notch devices layout. MB-09 derives expected dots from each row's own Active/Upcoming cells rather than naming fixture classes, so it survives reseeds and block-date drift.
- Verified in a real browser at 390×844 against the test DB (session-82 method), not a static mockup. Code review: 1 finding, self-inflicted and fixed — `showValidationToast` is top-anchored and would have slid under the notch once `viewport-fit=cover` landed. Security review skipped (CSS + a display label; no payments/auth/DB/Edge Function surface). Local run 271/272, the one failure a transient **502** from the `send-email` Edge Function on SEC-08 that passed isolated; **CI on `a0b5ff4` went green on all 272**, confirming the flake. Unrelated either way — no email code was touched.
- **`.claude/launch.json` gitignored, not committed.** It appeared 3 Aug (session 78) as a tool side effect of starting the dev server, was never in git history, and nothing needs it — the `python3 -m http.server 8000` command it wraps is already in this file. Matches how the repo treats other Claude-generated local files (`settings.local.json`, `scheduled_tasks.lock` are both ignored). `.claude/settings.json` stays committed because it was deliberately authored to enforce the review-before-tests gate.
- **Not verified by me: the actual iPhone.** Chromium cannot produce a real `env()` value, so the fix is proven by forcing the variables to iPhone dimensions (59px top / 34px bottom). Mark confirms on his phone. If Safari's bar still overlaps, the fallback is a fixed floor on `--safe-bottom` — the plumbing is already in place, one line.

**Session 84 (2026-08-19):** #35 (lookup_customer email-enumeration hardening) fixed and closed. Migration 27 + new Edge Function `lookup-customer-throttled`, deployed test then prod. index.html + 24 test specs updated.
- **The fix**: a per-IP throttle (20 attempts / 15 min, atomic UPSERT — same "claim before acting" pattern as the #45 one-shot email stamps) now sits in front of `lookup_customer`. The browser's two lookup call sites (`goStep2`, `confirmBooking`) go through a new `lookupCustomerThrottled()` helper → the new Edge Function → the RPC, instead of calling `lookup_customer` directly.
- **Two real bugs caught before shipping, both by review (not by me first)**:
  1. My own first draft let the caller-supplied `isTest` flag alone bypass the entire throttle — since this endpoint is unauthenticated, anyone could just send `isTest:true` and defeat the fix. Fixed with a second gate: the bypass only fires when a `TEST_BYPASS_ENABLED` secret is ALSO set server-side, and that secret is only ever set on the TEST project — production has no such secret, so a spoofed `isTest:true` against prod is ignored.
  2. Code review caught that `lookup_customer`'s direct anon EXECUTE grant was never revoked — the new Edge Function was a second front door, but the original door stayed unlocked, so the fix did nothing against a direct RPC call. Closed by revoking anon EXECUTE on `lookup_customer` itself (grant now service_role only) — this was the bigger-than-planned part of the session, see below.
- **Scope decision (Mark's call, Option A over Option B)**: revoking the direct grant meant ~24 existing test files that used `lookup_customer` as a generic "does this customer exist" utility (unrelated to what they were testing) would break. Rewrote them to use the existing `getCustomerByEmail` pg helper instead — mechanical, no behaviour change. Rejected the alternative (build the throttle directly into `lookup_customer` itself, no Edge Function, zero test files touched) because proving it actually throttles would have needed a database-wide setting toggle with unreliable propagation timing to pooled connections — a new source of exactly the kind of test flakiness #101 spent a whole session killing. `smoke-02` and `sec-14-case-insensitive-email` — the two specs that were deliberately testing the *anon-facing* lookup path — were rewritten to hit the new Edge Function (or, for smoke-02, to assert the direct RPC now returns permission-denied) rather than the old direct RPC.
- **Session-start drift check skipped** (conversation didn't open with the usual ritual) — cost real time mid-session: a full-suite run threw 36 unrelated failures that turned out to be pure fixture date drift (blocks marked `upcoming` in the test DB with start dates up to 12 days in the past). `npm run seed` cleared it; confirmed via a clean 272/273 rerun (one isolated pre-existing timing flake, unrelated, passed in isolation) that none of it was caused by this session's changes.
- New spec: **SEC-15** (2 tests — functional correctness + the real burst-to-429 proof, isTest bypass proven separately). **smoke-02** dropped from 3 tests to 2 (its two `lookup_customer` positive-result tests collapsed into one permission-denied assertion, since that behaviour moved to SEC-15's coverage). Net **272→273**.
- Code review: 5 findings, all addressed (2 real security bugs above, 1 plausible/accepted-limitation note on X-Forwarded-For spoofability — documented, not fixed, matches the free-tier trade-off Mark already signed off on for this NICE-TO-HAVE issue — plus 2 process nits). Security review: self-conducted (small diff), found + fixed the isTest bypass before code review even ran. **#35 CLOSED + Done on the board.**

**Session 85 (2026-08-21):** Release Phase 0 step 3 + Phase 1b executed — no booking-system code changed, this session's work was all release/website-repo/Netlify. Progress recorded on issues [#63](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/63) and [#64](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/64) (both still Todo on the board — neither phase is fully finished).
- **Phase 0 step 3 (archive)**: crawled all 9 pages of the live lg-pilates.co.uk (home, about, 3 class-location pages, schedule, how-to-book, FAQs, T&Cs) and produced `docs/archive/LG Pilates - Old Website Archive.pdf` (+ source HTML) — full wording, image descriptions, the enquiry-form field list, and a site map. Not yet committed to git. One finding for Louise to confirm: the schedule page lists a Wednesday Guiseley class at "Aireborough RUFC in Nunroyd Park" not covered by either of the two Guiseley location pages.
- **Phase 1b (deploy to Netlify, still private)**: `lg-pilates-website` imported into Netlify (site `new-lg-website`, live at `new-lg-website.netlify.app`) — Mark first found and deleted an unrelated leftover Netlify project from before the GitHub-first decision. All 4 env vars added (`PUBLIC_SANITY_PROJECT_ID`/`PUBLIC_SANITY_DATASET` not secret, `SANITY_API_READ_TOKEN`/`RESEND_API_KEY` marked "Contains secret values" — the two `PUBLIC_*` ones must stay unmarked or Netlify's leak-scanner fails the build). Sanity CORS origin added, `/admin` confirmed working. Mark + Louise tested every page + `/admin` editing + phone. Both enquiry forms submitted and delivered (Resend's "sent → delivered" status lag on the dashboard is normal, not a bug). Verified live: security headers present (curl), Lighthouse 100/100/100/80 (accessibility/best-practices/SEO/performance).
- **Deliberately not done**: Phase 1c (DNS cutover) — explicit hold at Mark's instruction, `lg-pilates.co.uk` still serves the old WordPress site untouched. Mark also set the Sanity `robotsTxt` Site Setting to `Disallow: /` to keep the temporary netlify.app URL out of Google until cutover.
- **New artifact**: published a "LG Pilates Launch Roadmap" — a visual status view of every RELEASE-PLAN.md step (done/now/later), kept in sync as steps complete. URL + update instructions in memory ([[project-website-release]], [[feedback-release-roadmap-artifact]]). Mark asked for this to be treated as a standing habit — update it whenever a release step's status changes, same as the GitHub issue/board update.

**Immediate next**: Mark's own next moves — decide whether to commit the archive PDF, keep an eye on the Netlify preview for a couple of weeks per the Phase 1 gate, then give the go-ahead for the Phase 1c DNS cutover when ready. No booking-system backlog work was touched this session — check the [project board](https://github.com/users/mjones2420-netizen/projects/1) for that priority order when development resumes.

**Session 86 (2026-08-23, earlier session, not previously logged here):** #102 (pre-go-live secret hardening) closed. Supabase access token rotated, moved from `~/.claude/settings.json` plaintext into `~/.zshrc`; prod-write tools (`execute_sql`/`apply_migration`/`list_edge_functions`) removed from the local auto-allow list so prod actions always prompt. Verified working at the time. Repo-privacy item split out to new issue #104.

**Session 87 (2026-08-23):** Fixed a gap left by session 86 — no product code changed.
- **Bug found**: this session started with zero supabase MCP tools loaded (`ToolSearch` for "supabase" returned nothing) — the session-start drift checks (steps B/C) couldn't run at all, silently.
- **Root cause**: session 86 put the token export only in `~/.zshrc`, which zsh loads for interactive shells only. Whatever launched this session's shell didn't trigger that path, so `SUPABASE_ACCESS_TOKEN` was never set — MCP servers failed to authenticate on startup and registered no tools, with no visible error.
- **Fix**: added the same export line to `~/.zshenv` (read by every zsh shell, interactive or not — belt and braces alongside the existing `.zshrc` line). No token change, no settings.json change — same security posture as #102, just no longer dependent on shell startup type. File permissions locked 600.
- **Process fix**: added a new step 0 to this file's SESSION START section — verify supabase MCP tools actually loaded before relying on them for drift checks, and flag immediately rather than silently skipping if they haven't.
- **Not yet verified**: this session's own shell env was already fixed at launch, so the fix takes effect on the *next* new session, not this one. First session after this should confirm tools load and re-run the B/C drift checks that got skipped today.

**Session 88 (2026-08-23):** Confirmed session 87's fix worked — supabase MCP tools loaded correctly this session, no manual restart needed. Ran the B/C drift checks (skipped in session 87 while tools were down). Found one stale block: id 5197 (class 3) stuck `upcoming` with a start_date 2 days in the past — display formatting glitch in test fixture dates, no data-integrity risk. Ran `npm run seed` to refresh; re-ran drift check, confirmed clean (0 stray customers, 0 overbooked blocks, no unexpected drift warnings). No code, migration, or Edge Function changes. No git changes.

**Session 89 (2026-08-23):** Real fix for the supabase MCP tools failing to load — sessions 86/87's shell-file fix only covered non-interactive shells, not sessions launched from the Claude desktop app. No booking-system code, DB, or Edge Function changes.
- **Root cause found**: sessions started from the Claude desktop app never run zsh startup at all (confirmed via process tree — the app spawns `claude` directly, no shell in the ancestry), so `~/.zshenv`/`~/.zshrc` exports (session 86/87's fix) never reached those sessions' MCP servers. Terminal-launched sessions worked because those do run zsh. Mark hit this via a desktop-app-launched ("dispatch") session.
- **Considered and rejected**: a macOS LaunchAgent (`launchctl setenv`) to push the var to all GUI-launched processes — correctly blocked by the auto-mode classifier as a system-config change, and Mark preferred a simpler fix once the real root cause was clear.
- **Mark's call**: partial rollback of #102 (session 86) — restore the token to `~/.claude/settings.json`'s top-level `"env"` key (global, not project — not this repo, not committed to git), which Claude Code reads directly regardless of launch method. Explicitly kept the OTHER half of #102 (prod-write tools removed from auto-allow) — prod `execute_sql`/`apply_migration` still require confirmation, no regression there.
- Removed the now-redundant token exports from `~/.zshenv` (emptied) and `~/.zshrc` (line removed, rest of file untouched).
- **Not yet verified**: fix takes effect on the *next* new session only (this one's own env was already broken at launch). First session after this — whichever way it's launched — should confirm supabase MCP tools load, then resume the normal B/C drift checks.

**Session 90 (2026-08-23):** Confirmed session 89's fix worked — supabase MCP tools loaded fine at session start, B/C drift checks ran clean. #28 (T1-09b Stripe refund) verified working and closed — code + RF-01..04 specs + both edge function deploys already existed and matched the ticket, it had just never been closed on GitHub (a session-73 gap: the parent umbrella #8 was closed as "superseded by #28/#29" but nobody went back to close the children once they actually shipped). Closed #28, Done on board.
- **#29 (T1-09c) built and shipped** — `stripe-webhook` now also handles `charge.refunded` (previously only `checkout.session.completed`), syncing refunds issued directly in the Stripe dashboard (bypassing the in-app "Mark Refunded" flow, #28) back into `cancellations.refunded`/`refunded_at` and `bookings.refund_status` (a column that existed but had never been written to before this). Matched by `stripe_payment_intent_id`. Mark confirmed the extra scope: also send the client refund-confirmation email, since a dashboard-issued refund wouldn't otherwise notify the customer — new `buildRefundConfirmedClientEmailHtml`, a deliberately separate/simpler copy from index.html's `buildRefundClientEmailHtml` (different data shape at each call site; drift risk judged low relative to the cost of a shared server-side template for this one).
- No migration needed — `bookings.refund_status` and `cancellations.stripe_payment_intent_id`/`refunded`/`refunded_at` already existed, just unused for this path.
- **is_test problem solved via existing infra**: `charge.refunded` events carry none of our metadata (Stripe Checkout metadata lives on the session only, never copied to the PaymentIntent/Charge), so the usual `metadata.is_test` trick doesn't work here. Reused `TEST_BYPASS_ENABLED` (#35's throttle-bypass secret, already TEST-project-only) as a free project-scoped test/live signal instead of adding a new secret.
- **Code review caught 2 real bugs before shipping**: (1) the `cancellations`/`bookings` `.update()` calls had no error check — a silent DB failure would still email the customer "refund processed" and return success while the flag never flipped (the exact `.update()`-without-`.select()` gotcha already in this file's own known-gotchas list). Fixed by checking both errors and throwing (→ 500 → Stripe retries). (2) read-then-write on `cancellations.refunded` had no atomic claim, so a duplicate Stripe delivery (at-least-once) could race two requests past the "already refunded?" check and double-send the confirmation email. Fixed with an atomic `UPDATE ... WHERE refunded=false ... RETURNING`, same claim-before-act pattern #45 already uses for one-shot email sends. Ordered `bookings` update before the atomic claim (idempotent, safe to retry) so a booking-write failure never leaves `cancellations` falsely claimed. Also dropped 3 unused params (`day`/`time`/`endTime`) from the new email builder that were computed and threaded through but never rendered.
- Security review: no findings — the new handler only runs after the existing Stripe HMAC signature + replay-window check (unchanged), all writes parameterised, no new secrets or auth surface.
- New spec **RF-05** (3 tests: match+sync, idempotent resend, no-match no-op) — mirrors ST-19's pattern (sign and POST a fabricated event straight to the test project's `stripe-webhook`, Stripe itself never contacted). One self-caught bug in the test itself: `cancellation_id` comes back as a JSON number from the webhook but as a string from `pg` (bigint columns), fixed by comparing `Number(...)` on both sides. 276/276 green (cb-18 flake confirmed pre-existing/unrelated on isolated rerun — no code in this session touched index.html or the CB flow).
- Deployed to test via Supabase CLI (`--project-ref ngzfhamjuviwfwuncrjo --no-verify-jwt`, matching the project's existing `verify_jwt:false` setting) before running tests, per the established "migrations/functions before the suite that exercises them" lesson.
- **Manual step done by Mark, both Stripe accounts (same session)**: added `charge.refunded` to the subscribed events list on both `lg-pilates-test-webhook` and `lg-pilates-prod-webhook` in Stripe's dashboard (both currently live under Stripe Sandbox mode, since prod Supabase is still on a Stripe TEST key per #30 — no separate Live-mode endpoint exists yet). Confirmed via the endpoint list showing "2 events" on both.
- **Live end-to-end proof (post-deploy, real Stripe test-mode API, no fabricated webhook signature)**: issued a genuine refund directly via the Stripe API against a real test PaymentIntent — bypassing the app entirely, exactly as a dashboard refund would — and watched the DB. Stripe's own webhook delivery (not a simulated call) synced `cancellations.refunded`/`refunded_at` and `bookings.refund_status` within ~2 seconds, unprompted. Proves the whole pipeline (Stripe event → subscribed webhook → signature check → handler) works live on test, not just via RF-05's fabricated-signature specs. Throwaway verification script deleted after use, test data cleaned up.

**Session 91 (2026-08-23):** New user-guide PDF series kicked off — no booking-system code changed (except a colour-scheme sync into two already-built guide screenshots). Not a coding session; documentation/process only.
- **Why**: Mark said the system has grown large and complex enough that he can't remember what every feature does or how to use it — wants plain-English reference PDFs he can pull up instead of asking each time.
- **Format decided**: reused `docs/user-guide-template.html` (cover page, numbered sections, step walkthroughs, callouts, quick-reference table) — the same one already used for the website's email-notifications guide and `CATCH-UP-SWAPS-GUIDE.pdf`. Booking system's own sage-green accent used (not the website's mauve) to keep the two guide series visually distinct, per the template's own note.
- **Scope agreed**: 15 guides, one per feature area, tracked as a single checklist issue (Mark's call — not native sub-issues like Release/Waitlist) — [#105](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/105), added to the bottom of the project board Todo column per the standing rule.
- **Screenshot method established (applies to all future guides in this series)**: customer/public-facing screens captured from the LIVE GitHub Pages site (read-only browsing + opening the booking modal — never submitted there); admin/dashboard screens captured from a throwaway booking made on the TEST env, then deleted immediately after via direct SQL (`admin_delete_customer` RPC can't be called this way — it's gated to an authenticated admin session, so raw `DELETE` + a `blocks.booked` resync is used instead, matching the project's known raw-SQL gotcha).
- **Guide 1 built: Class Booking & Prorated Pricing** — `docs/user-guides/Class Booking and Prorated Pricing.pdf`, 5 screenshots (schedule, booking form, payment/prorate step, "Spot Reserved" confirmation, admin All-Bookings Confirm button). Checklist item 1 of 15 ticked on #105.
- **Mid-session discovery**: the public booking pages had been reskinned to a new mauve palette (`--pub-*` CSS vars) by commits `63cb124`/`ee2076f`, made and pushed earlier the same day by a **different** Claude Code session — not something done in this session, so full context/rationale wasn't available. Guide 1's 4 customer-facing screenshots were retaken to match; the admin dashboard screenshot was left as-is since that side wasn't reskinned (confirmed by inspection, still on the old green `--sage` vars). Worth a note to whoever ran that session, or checking `git log -- index.html` at the start of a future session, since two concurrent sessions editing the same file is a known repo pattern (also happened session 82).
- **Cross-device access**: PDFs are also copied to `~/Library/Mobile Documents/com~apple~CloudDocs/Booking System User Guides/` on Mark's Mac after each guide, so they sync to his other devices via iCloud. A symlink from the repo folder into iCloud Drive was considered and rejected — iCloud Drive only syncs real file content it holds inside its own folder tree, not links pointing elsewhere, so a shortcut would resolve only on this Mac and be a dead link everywhere else. The `docs/user-guides/` folder in the repo stays the git-tracked original; not yet committed to git (Mark's choice — asked to wait until more guides are done).
- **Next**: guide 2, Priority Booking Windows — not started, waiting on Mark to say go.

**Session 92 (2026-08-23):** Booking system's public pages brought visually in line with the new website — three separate ships, all colour/markup only, no DB/Edge Function changes. This is the "different Claude Code session" session 91's note refers to (63cb124/ee2076f were mine, made earlier the same day, concurrently with that session's PDF-guide work).
- **Ship 1 — colour + font reskin** (`63cb124`, `ee2076f`): public schedule page, booking modal, and Stripe outcome screens repointed from the old teal/orange palette to the new website's Dusty Mauve palette + Marcellus/Karla fonts. Scoped via CSS custom-property overrides on `#pg-schedule`/`#overlay`/the two Stripe overlays — the *same* variable names (`--sage`, `--charcoal` etc.) resolve differently depending on which DOM subtree you're in, so ~450 existing `var(--x)` usages needed zero edits; only the ~15 raw hex codes that bypassed those vars (mostly in the class-card CSS) needed converting. Admin dashboard untouched by design (Mark's call — public pages only, scoped explicitly). Mockup-approved via Artifact before touching `index.html`. Follow-up fix same day: past-session date pills (`.date-pill.past`) were still the old pink, which blended into the new mauve default pill colour — Mark caught this from a live screenshot; regreyed to `#ECE8E6`/`#9B9490` so they recede properly again.
- **Ship 2 — header/footer match to the website** (`f911f94`): Mark wanted the booking system's header to be visually identical to the new website's (so it doesn't read as "jumped to a different site"), including the logo. Read the website's actual `Nav.astro`/`Button.astro` source to copy exact values rather than eyeballing. Decisions, mostly Mark's own calls:
  - Logo, Home/Schedule/Locations/Contact nav links, and the mobile hamburger pattern all now match the website exactly. "Book a Block" pill dropped from the booking system's own header (redundant — you're already there).
  - **Schedule now links away** to the website's own `/schedule` page rather than staying on itself — Mark's clarification mid-session: the intended customer flow is website's schedule → "Book a Block" buttons (not yet wired, tracked separately) → booking system, so the booking system's nav should behave exactly like the website's, not specially self-reference.
  - Marketing links (Home/Schedule/Locations/Contact) point at the **temporary Netlify URL** (`new-lg-website.netlify.app`) for now, per Mark's choice — confirmed via curl that the real domain still serves the old WordPress site with completely different URL paths, so linking to production now would just 404. **Flagged follow-up: swap these 3 links to the production domain once the Phase 1c DNS cutover happens** (one-line change, already noted in the code).
  - **Dashboard moved out of the header into a small new footer** on the public page only — Mark's suggestion, agreed: it's an internal/admin entry point, not something that belongs next to customer-facing nav. Admin dashboard's own header is completely unchanged (still Schedule/Dashboard/Sign Out) — the two nav variants share one `<nav>` element and are shown/hidden by which page is active, same scoping trick as the colour reskin.
  - Both nav-content variants always exist in the DOM (JS keeps using plain `getElementById` regardless of visibility) — only `display` toggles, via the existing `body:has(#pg-schedule.on) ...` pattern.
- **Real regression caught by actually running the suite, not by review**: moving Dashboard out of the header broke the shared `loginAsAdmin()` Playwright helper (and 2 direct spec references) — they clicked the old `#nb-dashboard` button, which is now hidden on the schedule page where every test starts. Root cause only surfaced once tests ran (code review doesn't execute anything); first full run threw 220 failures, traced to a dead dev server (unrelated, restarted) *and* this real bug underneath it. Fixed by giving the new footer button a stable `id="pub-dashboard-link"` and repointing the helper + `ab-17-18`/`ac-08` specs at it. A third spot (`ac-23`, clicking `#nb-schedule` redundantly right after `signOutAdmin()`, which already lands back on the schedule page) was just dead code — deleted rather than repointed.
- **Two review-caught findings, both fixed pre-push**: `.site-footer-public` was left out of the palette-scoping selector, so the new footer would've rendered in the old teal colours; the mobile hamburger's open state wasn't reset on an internal page switch, so tapping Dashboard while the menu was open would leave it stuck over the admin view. Also: `.logo-public` had no default `display:none`, so the website-style logo link would've bled onto the admin dashboard too — caught by a second low-effort review pass before shipping.
- **Session takeaway worth remembering**: this is the second time this project has been bitten by "code review passed, so it must be fine" — code review reads a diff, it doesn't run the app. The `loginAsAdmin()` breakage was invisible to review because nothing in the diff *looked* wrong in isolation; only actually running the 276-test suite surfaced it. Always run the real suite before pushing a change that touches shared chrome (nav, layout wrappers) that tests depend on structurally, not just visually.
- 276/276 tests green (2 apparent failures on the full run — `cb-30` a pre-existing parallel-run flake, confirmed passing isolated and unrelated to this session's changes). Two code-review passes (medium + two low-effort follow-ups), no security review needed (CSS/markup + test-selector changes only, no payments/auth/DB/Edge Function surface). Pushed, CI green, live bytes verified against the pushed commit both times.

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
