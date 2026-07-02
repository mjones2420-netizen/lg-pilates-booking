# LG PILATES BOOKING SYSTEM — CLAUDE CODE CONTEXT
Last updated: 02 Jul 2026 (session 59 — full system review, 20 issues filed, 224 tests)

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

Current test count: **224 tests, all passing** (Session 58 / SEC-08 added for #39 email escaping).

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
- Other security from the full review: [#44](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/44) (leftover anon INSERT on pending_bookings), [#45](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/45) (send-email public path allows unlimited re-sends), [#46](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/46) (book_if_available trusts client-supplied amount/customer_id), [#47](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/47) (trim lookup_customer columns, partial #35), [#48](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/48) (upsert_customer can be used to clobber any customer by email — needs a design decision), [#49](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/49) (expired pending_bookings/health data never cleaned up), [#52](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/52) (webhook: no replay-timestamp tolerance + duplicate-delivery false-alarm race).
- Bugs found: [#50](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/50) (Reports "Revenue MTD" always shows £0 — created_at never selected), [#51](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/51) (failed saves show success toasts — unchecked supabase errors).
- Refactor recommendations: [#53](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/53) (move all email building server-side, kills 3 duplicated template copies), [#54](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/54) (ISO dates as source of truth, kills the Dec–Jan prorata pricing bug), [#55](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/55) (real admin_users table instead of authenticated=admin), [#56](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/56) (transactional cascade-delete RPCs), [#57](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/57) (small housekeeping cleanups).
- **Catch-up swap feature review** (Mark found it fiddly / hard to avoid overbooking) — 5 issues filed: [#58](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/58) (show spaces/FULL in the class + date pickers — the big usability win), [#59](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/59) (move the capacity + max-2 checks into a DB RPC so overbooking-at-save becomes impossible; **keep** the over-cap warning banner — it's the only thing that catches a class drifting over capacity *after* a valid swap already exists, which a save-time check can't see), [#60](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/60) (plainer wording + auto-select the customer's home block), [#61](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/61) (confirm or drop the "max 2 swaps per block" rule with Louise), [#62](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/62) (consolidate two duplicated swap-loader code paths).

**Next likely work (priority order):**
- [#43](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/43): **Disable public signups on both Supabase projects** (dashboard toggle, Mark) — top priority, ahead of go-live
- [#30](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/30): Go-live — swap prod Stripe key test→live + live webhook secret
- [#28](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/28): T1-09b prod manual verify, then close
- Remaining security from session 59: #44–#49, #52 (see above)
- Remaining security (older): #35 (needs Pro), #37 (Edge Function drift docs), #38 (settings world-readable)
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
