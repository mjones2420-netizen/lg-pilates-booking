# LG Pilates Booking System — Feature & Task Backlog

Last updated: 12 Jun 2026

This document is the single source of truth for outstanding work on the LG Pilates booking system.
It is organised by priority tier. Items should be marked ✅ when complete and updated in `context.txt` at the same time.

---

## Priority Summary

| # | ID | Feature / Task | Description | Tier |
|---|---|---|---|---|
| 1 | T1-05 | [Fix class time input format](#t1-05--fix-class-time-input-to-use-native-time-picker) | Admin Add Class form accepts free text — switch to `<input type="time">` to enforce HH:MM | 🔴 Tier 1 |
| 2 | T1-01 | [Fix "Step 1 of 3" label](#t1-01--fix-step-1-of-3-label-bug-️) | Booking modal shows wrong step count — trivial one-line fix | 🔴 Tier 1 |
| 3 | T1-03 | [Bank details](#t1-03--replace-bank-details-placeholder-with-louises-real-details) | Louise to enter real bank details via admin Settings — no code needed | 🔴 Tier 1 |
| 4 | T1-04 | [Netlify migration + custom domain](#t1-04--hosting-migration-to-netlify--custom-domain) | Move to Netlify, private repo, `book.lg-pilates.co.uk` subdomain | 🔴 Tier 1 |
| 5 | T1-02 | [Email notifications](#t1-02--email-notifications-via-resend) | Booking confirmations to clients + new booking alerts to Louise via Resend | 🔴 Tier 1 |
| 6 | T3-04 | [Supabase Pro decision](#t3-04--supabase-pro-upgrade-decision) | Free tier auto-pauses after inactivity — decide whether to upgrade or add a keep-alive ping | 🔴 Tier 1* |
| 7 | T3-06 | [Leaked password protection](#t3-06--enable-leaked-password-protection-in-supabase-auth) | One toggle in Supabase Auth dashboard — protects Louise's admin account | 🔴 Tier 1* |
| 8 | T2-01 | [Class register](#t2-01--class-register-feature) | Printable/on-screen attendance register per block for Louise | 🟡 Tier 2 |
| 9 | T2-02 | [Waitlist](#t2-02--waitlist-feature) | Let clients join a waitlist when a block is full; notify on vacancy | 🟡 Tier 2 |
| 10 | T2-03 | [Honeypot anti-bot](#t2-03--honeypot-anti-bot-protection) | Hidden form field to block automated spam bookings | 🟡 Tier 2 |
| 11 | T2-04 | [Mobile Safari test coverage](#t2-04--mobile-safari-playwright-coverage) | Add real mobile browser to Playwright suite (currently desktop viewport only) | 🟡 Tier 2 |
| 12 | T2-05 | [Reports — monthly trend chart](#t2-05--reports-page-monthly-trend-chart) | Add bookings/revenue chart to Reports page — requires new Supabase query | 🟡 Tier 2 |
| 13 | T3-01 | [Demo file updates](#t3-01--demo-file-updates) | 11 demo files are outdated — rebuild after Netlify + email are stable | 🟢 Tier 3 |
| 14 | T3-02 | [User guide PDF update](#t3-02--user-guide-pdf-update) | Update Louise's user guide once email and Netlify are live | 🟢 Tier 3 |
| 15 | T3-05 | [Swap Supabase anon key](#t3-05--swap-supabase-anon-key-to-newer-publishable-key-format) | Migrate to newer publishable key format — do alongside Netlify migration | 🟢 Tier 3 |
| 16 | T3-03 | [File split](#t3-03--file-split) | Split `index.html` into separate CSS/JS/HTML files at a future milestone | 🟢 Tier 3 |
| 17 | T3-07 | [Pending bookings cleanup](#t3-07--scheduled-cleanup-of-expired-pending_bookings-rows) | Nightly scheduled function to delete expired pending_bookings rows from abandoned Stripe payments | 🟢 Tier 3 |

*T3-04 and T3-06 are listed as Tier 3 IDs but are urgent enough to act on before the system goes live with real clients.

---

## How to use this document

- **Work top-to-bottom within each tier** unless a dependency forces a different order (noted inline).
- **Tier 1** items are blockers or near-blockers for Louise going live with real clients confidently.
- **Tier 2** items improve the system meaningfully but the system works without them.
- **Tier 3** items are nice-to-have, housekeeping, or deferred until a natural milestone.
- When a task is picked up, upload the latest `index.html` before starting — standard session rule.

---

## Tier 1 — Fix now / essential for production confidence

### T1-05 · Fix class time input to use native time picker
**What:** The Add Class and Edit Class forms in the admin dashboard use plain text inputs for start and end time. This allows free-text entry like `6:30pm` or `9.45am` which gets saved to the database in the wrong format. The app expects `HH:MM` (24-hour).
**Why it matters:** Incorrectly formatted times could cause display or sorting issues on the public schedule. Louise already hit this when adding her first two classes manually.
**Effort:** Trivial — swap the time inputs to `<input type="time">`. The browser enforces `HH:MM` automatically; no typing, no format errors.
**Dependencies:** None.

---

### T1-01 · Fix "Step 1 of 3" label bug ✏️
**What:** Line 476 of `index.html` still reads "Step 1 of 3 — Your Details" — a leftover from the old 3-step booking flow. Lines 501, 558, 576 correctly say "Step 2 of 4", "Step 3 of 4", "Step 4 of 4". The pip indicator itself is correct; only this text label is wrong.
**Why it matters:** A client sees "Step 1 of 3" then "Step 2 of 4" — immediately confusing.
**Effort:** Trivial — single string change.
**Dependencies:** None.

---

### T1-02 · Email notifications via Resend
**What:** Send automated email confirmations to clients when they complete a booking, and notification emails to Louise when a new booking is made.
**Why it matters:** Currently no confirmation reaches the client after booking — Louise has to chase manually. This is the most-requested real-world gap.
**Effort:** Medium. Requires a Resend account, API key stored securely (environment variable or Supabase secret), and a serverless function or edge function to send the email at the point of booking confirmation.
**Dependencies:** T1-04 (Netlify migration) is recommended first — Netlify Functions are the natural home for the email trigger on a static site. Can be done on GitHub Pages with a separate edge function workaround, but Netlify is cleaner.
**Notes:**
- Booking confirmation email → client (booking details, class, dates, amount due, bank details).
- New booking notification → Louise (client name, class, block, amount due).
- Consider a PAR-Q reminder email if the PAR-Q has not been completed 24 hours before the first session.
- User guide (T3-02) should be updated once email is live.
- **Session 1 complete (7 Jun 2026):** `admin_email` in settings table, Notification Email field in Settings tab, `send-email` Edge Function deployed to both Supabase projects. Supabase CLI + Docker Desktop installed.
- **Session 2 complete (7 Jun 2026):** Booking reserved email (trigger #1) — `buildReservedEmailHtml()`, `sendBookingEmail()`, `IS_NO_EMAIL` flag, SE-12 spec. Verified in production.
- **Session 3 complete (8 Jun 2026):** Booking confirmed email (trigger #2) — `buildConfirmedEmailHtml()`, wired into `confirmBookingAdmin()`, SE-13 spec.
- **Session 4 complete (8 Jun 2026):** New booking admin alert (trigger #5) — `buildAdminAlertEmailHtml()`, SE-14 spec. SE-12 fixed with array intercept pattern.
- **Session 5 complete (8 Jun 2026):** Cancellation emails (trigger #3) — admin-only alert on RFB; client email deferred to Mark Refunded trigger. SE-15 spec.
- **Session 6 complete (11 Jun 2026):** Refund confirmation email (trigger #4) — `buildRefundClientEmailHtml()`, client email only (no admin alert). Zero-refund auto-send. SE-16 spec.
- **Session 7 complete (11 Jun 2026):** Full email wording review; session date pills in reserved and admin alert emails; pending refund warning in block warnings banner (BLW-09); admin cancel/refund alerts removed; CI paths filter narrowed.
- **Session 8 next (final review):** End-to-end production verification, mobile/desktop render check, forwarding to Louise's inbox. See `EMAIL-NOTIFICATIONS-SPEC.md`.

---

### T1-03 · Replace bank details placeholder with Louise's real details
**What:** The Settings → Bank Details section currently holds placeholder values. Louise's real bank name, sort code, and account number need to be entered.
**Why it matters:** Every booking confirmation shows the placeholder bank details — clients cannot pay.
**Effort:** Trivial — Louise logs into the admin dashboard and updates via Settings. No code change needed.
**Dependencies:** None. Louise can do this herself without a development session.
**Action:** Remind Louise to log in and update — this does not require a Claude session.

---

### T1-04 · Hosting migration to Netlify + custom domain
**What:** Move from GitHub Pages (public repo) to Netlify, with the custom subdomain `book.lg-pilates.co.uk`.
**Why it matters:** GitHub Pages requires a public repo, meaning `index.html` (which contains the Supabase anon key) is publicly readable. Netlify supports private repos. The custom domain also gives Louise a professional URL to share with clients.
**Effort:** Medium. Steps:
1. Make the GitHub repo private.
2. Connect Netlify to the repo.
3. Configure the custom subdomain via DNS.
4. Update `TEST_APP_URL` in `.env.test` if the live URL changes.
5. Swap the Supabase anon key to the newer publishable key format at the same time (T3-05).
**Dependencies:** None blocking, but do T3-05 (key swap) in the same session.
**Notes:** The `?env=test` switch and all existing Playwright tests should continue to work unchanged after migration — the app itself doesn't change, only where it's served from.

---

## Tier 2 — Important improvements, no hard blocker

### T2-01 · Class register feature
**What:** A printable or on-screen register for each class session — showing which clients are booked into a given block, with a checkbox column for Louise to mark attendance.
**Why it matters:** Louise currently has no in-app way to take a register. This is a core operational need for a live studio.
**Effort:** Medium-to-large. Requires a new admin view (likely under the By Class tab or as a modal from a block row), a filtered list of confirmed bookings for a given block, and either a print stylesheet or a CSV export. Consider whether attendance data should be persisted (new `attendance` table) or just used for printing.
**Dependencies:** None.
**Notes:**
- The simplest version is a printable HTML page per block — no new DB columns needed.
- A more complete version tracks attendance in the DB and feeds into refund calculations.
- Agree scope with Louise before starting.

---

### T2-02 · Waitlist feature
**What:** Connect the existing `waitlist` table to the booking flow. When a block is full, clients can join a waitlist. If a space opens (cancellation), the next person on the waitlist is notified.
**Why it matters:** The `waitlist` table already exists with RLS enabled. The booking flow shows "Class Full" but does nothing else. Louise loses clients who would have waited.
**Effort:** Medium-to-large. Requires:
- A "Join Waitlist" path in the booking modal when `booked >= cap`.
- A waitlist management view in the admin dashboard.
- Notification to the next waitlisted client when a cancellation creates a vacancy (depends on T1-02 email being in place).
**Dependencies:** T1-02 (email notifications) for automatic notification. The join/view part can be built independently.

---

### T2-03 · Honeypot anti-bot protection
**What:** Add a honeypot hidden field to the booking form to catch automated form submissions.
**Why it matters:** The public booking form currently has no bot protection. A spam booking fills a slot, wastes Louise's time, and skews the client list.
**Effort:** Small. A hidden input field that legitimate browsers leave blank — if it's populated on submission, the booking is silently rejected.
**Dependencies:** None.

---

### T2-04 · Mobile Safari Playwright coverage
**What:** Add a Mobile Safari Playwright project for genuine mobile browser test coverage. Currently CB-29 and CB-30 use a shrunken desktop viewport (480×700) rather than a real mobile browser engine.
**Why it matters:** Safari on iOS has known layout and scroll quirks that a desktop viewport doesn't catch. The booking modal has a documented scroll constraint (`.modal` must not be a flex container) that warrants real mobile testing.
**Effort:** Small. Add a `projects` entry in `playwright.config.js` for Mobile Safari using Playwright's built-in device descriptor.
**Dependencies:** None.
**Notes:** This is a test infrastructure item, not a product feature. But it directly protects the mobile booking experience which is likely the majority of real client traffic.

---

### T2-05 · Reports page — monthly trend chart
**What:** Add a bookings/revenue bar chart to the Reports page showing the last 6 months of activity. The static stats (active bookings, revenue MTD, fill rate, pending refunds, class capacity bars, client breakdown) are already live — the chart is the one remaining piece.
**Why it matters:** Gives Louise a quick visual on seasonal patterns — useful for planning when to add blocks and when to expect quieter periods.
**Effort:** Small-medium. Requires a new Supabase query grouping confirmed bookings and revenue by month, and a simple SVG/canvas bar chart rendered in the Reports page.
**Dependencies:** Admin dashboard redesign (complete). No schema changes needed.
**Notes:** This is Session C of the dashboard redesign plan (Sessions A and B complete). The chart query will read from the `bookings` table, grouping by `DATE_TRUNC('month', created_at)`.

---

## Tier 3 — Nice to have / housekeeping / milestone-gated

### T3-01 · Demo file updates
**What:** 11 standalone HTML demo files under `/demos/` are outdated — they pre-date per-class priority, pro-rata pricing, and the 4-step booking flow.
**Why it matters:** If Louise shares demo links, clients see an old version of the UI.
**Effort:** Medium. Each demo file needs to be rebuilt or regenerated from the current `index.html` with appropriate stub data.
**Dependencies:** No hard dependency, but sensible to do after T1-04 (Netlify) and T1-02 (email) are stable — otherwise demos will need updating again.

---

### T3-02 · User guide PDF update
**What:** The user guide PDF (for Louise) needs updating to reflect: per-class priority management, pro-rata pricing, the 4-step booking flow, email notifications (once T1-02 is live), and the Netlify URL (once T1-04 is live).
**Why it matters:** The guide is Louise's reference for running the system. It's currently out of date.
**Effort:** Small-to-medium depending on how much of the PDF needs rewriting.
**Dependencies:** T1-02 and T1-04 should be complete first — the guide should reflect the final live setup.

---

### T3-03 · File split
**What:** `index.html` is currently ~2,889 lines — everything in one file. Consider splitting CSS, JS, and HTML into separate files at the next major milestone.
**Why it matters:** Maintainability. A single 3,000-line file is harder to navigate and diff.
**Effort:** Medium. The split itself is straightforward but would require updating all Playwright selectors that reference the file path, and verifying the `?env=test` switch still works.
**Dependencies:** Do at a natural milestone — after Netlify migration and after email is live. Not before.
**Notes:** GitHub Actions CI and the test suite would need to be verified post-split.

---

### T3-04 · Supabase Pro upgrade decision
**What:** The production Supabase project is on the free tier, which auto-pauses after 7 days of inactivity. If Louise goes quiet for a week, the next booking attempt will fail while the project wakes up.
**Why it matters:** A live booking system cannot afford random cold-start failures.
**Effort:** None technical — this is a billing decision for Louise.
**Options:**
- Upgrade to Supabase Pro (~$25/month) — removes auto-pause.
- Set up a scheduled ping (cron job or Netlify scheduled function) to keep the project active — free workaround.
**Dependencies:** None. Can be decided independently of other work.
**Action:** Discuss with Louise. If she's actively using the system with real clients, Pro is the right call.

---

### T3-05 · Swap Supabase anon key to newer publishable key format
**What:** The current anon key in `index.html` uses the older JWT format. Supabase now issues shorter "publishable keys". The old key still works but the new format is preferred.
**Why it matters:** Security hygiene and future-proofing. Do at the Netlify migration milestone so the key swap and repo-privatisation happen together.
**Effort:** Trivial — swap one string in `index.html`, update `context.txt`.
**Dependencies:** T1-04 (Netlify migration). Do in the same session.

---

### T3-06 · Enable leaked password protection in Supabase Auth
**What:** Supabase Auth has a "Leaked password protection" toggle in the dashboard that checks passwords against known breach databases (HaveIBeenPwned). It's currently off.
**Why it matters:** Louise's admin password is the only thing protecting the booking data. If she reuses a compromised password, this catches it.
**Effort:** Zero code — a single manual toggle in the Supabase dashboard.
**Dependencies:** None.
**Action:** Louise (or Mark) enables this in the Supabase dashboard under Authentication → Settings. No code change needed.

### T3-07 · Scheduled cleanup of expired pending_bookings rows
**What:** The `pending_bookings` table holds temporary records created when a client starts a Stripe payment. Rows expire after 2 hours but Postgres does not auto-delete them — stale rows accumulate from abandoned payments.
**Why it matters:** Harmless in small volumes, but will grow indefinitely without cleanup. A nightly sweep keeps the table tidy.
**Effort:** Small — a Supabase scheduled Edge Function that runs nightly and deletes rows where `expires_at < NOW()`.
**Dependencies:** T1-04 (Netlify migration) — stable hosting is a natural prerequisite before adding scheduled functions. Stripe integration (PM-4+) must be live first.
**Action:** Create a `cleanup-pending-bookings` Edge Function and schedule it via Supabase's cron scheduler (available on Pro plan) or a Netlify scheduled function.

---

## Completed

| Item | Description | Completed |
|---|---|---|
| Admin dashboard redesign — Session A | Full sidebar layout replacing tabs: 8 pages, search filters, location grouping, block card styling, Reports static stats | Session 39 |
| Admin dashboard redesign — Session B | Playwright spec fixes for sidebar navigation (76 → 0 failures across admin suites) | Session 39 |
| Playwright test suite | All 133 genuine Excel scenarios automated (169 tests) | Session 39 |
| GitHub Actions CI | Auto-run on push | Session 32 |
| Email notifications — Session 1 | Settings email field + send-email Edge Function deployed to prod and test | Session 33 |
| Email notifications — Session 2 | Booking reserved email (trigger #1) — template, wiring, noemail flag, SE-12 spec | Session 34 |
| Email notifications — Session 3 | Booking confirmed email (trigger #2) — SE-13 spec | Session 35 |
| Email notifications — Session 4 | New booking admin alert (trigger #5) — SE-14 spec | Session 36 |
| Email notifications — Session 5 | Cancellation admin alert (trigger #3) — SE-15 spec | Session 37 |
| Email notifications — Session 6 | Refund confirmation email (trigger #4) — SE-16 spec | Session 37 |
| Email notifications — Session 7 | Full wording review, session pills, pending refund banner, CI paths fix — BLW-09 | Session 37 |
| Per-class priority | Replaced global `customers.priority` with `customer_class_priority` | Earlier |
| Pro-rata pricing | Sessions-remaining calculation on active blocks | Earlier |
| 4-step booking flow | New client flow extended from 3 to 4 steps | Earlier |
| Block warnings banner | Red/yellow advisories in admin dashboard | Earlier |
| PAR-Q health form | Collected during new-client booking | Earlier |
| Cancellations audit trail | Denormalised record + CSV export | Earlier |
| Test/prod env switch | `?env=test` URL parameter | Earlier |
| Schema parity check | `npm run schema-check` across both Supabase projects | Earlier |

---

*This backlog is maintained alongside `context.txt`. Update both when an item is completed or scoped changes.*
