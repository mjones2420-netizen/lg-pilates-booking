# LG PILATES BOOKING SYSTEM — CLAUDE CODE CONTEXT
Last updated: 05 Jul 2026 (session 68 — #53 server-side email templates fixed and closed (targeted scope), commit ee91c39, deployed test+prod)

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

Current test count: **237 tests, all passing** (Session 68 — #53 reworked ST-21/ST-22/SEC-08 into real server-side checks; net -2 from 239).

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

**Next likely work (priority order):**
- **Release execution: start at [#70](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/70) → Phase 0 ([#63](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/63))** — #43 (public signup) is now DONE (2026-07-04, same session as #55/#56): Mark disabled "Allow new users to sign up" on both test and production, verified via `GET /auth/v1/settings` (`disable_signup: true` on both). Next step in Phase 0 is token rotation.
- [#30](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/30): Stripe go-live key swap — now scheduled as release Phase 3 (#68)
- [#28](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/28): T1-09b prod manual verify, then close
- Remaining security from session 59: #44, #47, #48, #49 (#45/#46 fixed session 61, #52 fixed session 67, #55/#56 fixed session 66)
- Remaining security (older): #35 (needs Pro), #37 (Edge Function drift docs), #38 (settings world-readable)
- Bugs: #50 (Revenue MTD £0), #51 (false success toasts)
- [#29](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/29): T1-09c inbound refund webhook sync (deferred)
- [T1-04](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/4): Netlify migration + custom domain — now scheduled as release Phase 1.5 (#65)
- **#53 DONE (session 68, targeted)**: confirmed + card-payment-alert templates moved server-side, killing the cross-file duplication that caused #39. Block/cancel/refund emails left on the raw admin path by design (single copies, no drift). If ever wanted, moving those too is optional future work (would need server loaders for the cancellation-row-based refund emails + a rethink of the block-email batch loop UX).

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
