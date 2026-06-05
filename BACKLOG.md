# LG Pilates Booking System — Feature & Task Backlog

Last updated: 5 Jun 2026

This document is the single source of truth for outstanding work on the LG Pilates booking system.
It is organised by priority tier. Items should be marked ✅ when complete and updated in `context.txt` at the same time.

---

## Priority Summary

| # | ID | Feature / Task | Description | Tier |
|---|---|---|---|---|
| 1 | T1-01 | [Fix "Step 1 of 3" label](#t1-01--fix-step-1-of-3-label-bug-️) | Booking modal shows wrong step count — trivial one-line fix | 🔴 Tier 1 |
| 2 | T1-03 | [Bank details](#t1-03--replace-bank-details-placeholder-with-louises-real-details) | Louise to enter real bank details via admin Settings — no code needed | 🔴 Tier 1 |
| 3 | T1-04 | [Netlify migration + custom domain](#t1-04--hosting-migration-to-netlify--custom-domain) | Move to Netlify, private repo, `book.lg-pilates.co.uk` subdomain | 🔴 Tier 1 |
| 4 | T1-02 | [Email notifications](#t1-02--email-notifications-via-resend) | Booking confirmations to clients + new booking alerts to Louise via Resend | 🔴 Tier 1 |
| 5 | T3-04 | [Supabase Pro decision](#t3-04--supabase-pro-upgrade-decision) | Free tier auto-pauses after inactivity — decide whether to upgrade or add a keep-alive ping | 🔴 Tier 1* |
| 6 | T3-06 | [Leaked password protection](#t3-06--enable-leaked-password-protection-in-supabase-auth) | One toggle in Supabase Auth dashboard — protects Louise's admin account | 🔴 Tier 1* |
| 7 | T2-01 | [Class register](#t2-01--class-register-feature) | Printable/on-screen attendance register per block for Louise | 🟡 Tier 2 |
| 8 | T2-02 | [Waitlist](#t2-02--waitlist-feature) | Let clients join a waitlist when a block is full; notify on vacancy | 🟡 Tier 2 |
| 9 | T2-03 | [Honeypot anti-bot](#t2-03--honeypot-anti-bot-protection) | Hidden form field to block automated spam bookings | 🟡 Tier 2 |
| 10 | T2-04 | [Mobile Safari test coverage](#t2-04--mobile-safari-playwright-coverage) | Add real mobile browser to Playwright suite (currently desktop viewport only) | 🟡 Tier 2 |
| 11 | T3-01 | [Demo file updates](#t3-01--demo-file-updates) | 11 demo files are outdated — rebuild after Netlify + email are stable | 🟢 Tier 3 |
| 12 | T3-02 | [User guide PDF update](#t3-02--user-guide-pdf-update) | Update Louise's user guide once email and Netlify are live | 🟢 Tier 3 |
| 13 | T3-05 | [Swap Supabase anon key](#t3-05--swap-supabase-anon-key-to-newer-publishable-key-format) | Migrate to newer publishable key format — do alongside Netlify migration | 🟢 Tier 3 |
| 14 | T3-03 | [File split](#t3-03--file-split) | Split `index.html` into separate CSS/JS/HTML files at a future milestone | 🟢 Tier 3 |

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

---

## Completed

| Item | Description | Completed |
|---|---|---|
| Playwright test suite | All 133 genuine Excel scenarios automated (159 tests) | Session 31 |
| GitHub Actions CI | Auto-run on push | Session 32 |
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
