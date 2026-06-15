# LG Pilates — Payment Mode Feature Spec
**Status:** ✅ Build complete (PM-1 to PM-6) — see Implementation Status below for outstanding items
**Date:** 12 Jun 2026 (original spec) — updated 15 Jun 2026
**Author:** Mark Jones / Claude

---

## 1. Overview

This document scopes the full design, build, and test plan for adding a **payment mode feature flag** to the LG Pilates booking system. The flag allows Louise to switch between two payment methods:

- **Bank Transfer** — the current method. Clients are shown Louise's bank details after booking and pay manually. Louise confirms receipt via the admin dashboard.
- **Stripe Checkout** — a future method. Clients are redirected to a Stripe-hosted payment page after booking. Payment is confirmed automatically. No manual action from Louise.

At launch, the system will run in bank transfer mode. Stripe will be built as a follow-on integration, slotting into a branch point already prepared by this feature.

---

## 1a. Implementation Status (as of Session 45)

**Build complete.** Both payment modes work end-to-end and are covered by 23 automated tests (ST-01 to ST-26, plus SE-18 to SE-20). Louise can switch between them from the admin Settings page. For the normal case — someone pays and everything goes through — both modes are fully working and verified.

**What was actually built, vs this spec's original plan:**
- The Stripe Checkout Edge Function is named `stripe-checkout` (this spec originally proposed `create-checkout-session`). It writes a `pending_bookings` row (not a real `bookings` row) and redirects to Stripe — the real booking is only created once `stripe-webhook` confirms payment. This `pending_bookings` table/approach wasn't in the original design (added during PM-3).
- `stripe-webhook` handles `checkout.session.completed` only. The originally-planned `checkout.session.expired` handler (Session PM-4 scope) was not built — abandoned `pending_bookings` rows instead expire via `expires_at` (2 hours), with cleanup currently manual (see Outstanding, T3-07).
- Section 9.2's original ST-09 to ST-18 scenario list described a design that changed during PM-3 (e.g. ST-11's "deletes reserved booking" assumed a real booking existed before redirect — it doesn't). The actual PM-6 Playwright session built ST-17 to ST-26 against the as-built `pending_bookings`/webhook design. See section 9.2 below for the current mapping.
- `stripe-webhook` has no local source file — it was deployed directly to Supabase via MCP and exists only on the test/production projects (see AUDIT ITEMS in context.txt).

**Outstanding items** (none are launch-blockers — see full detail in BACKLOG.md and context.txt section 8a):
1. **Client notification gap (BACKLOG T1-06, new this session)** — if a card payment succeeds but the booking can't be placed (class fills in the gap before the webhook runs), the client gets no email and may have already seen a "Booking confirmed" success screen. Needs design review, not just a quick fix.
2. Swap Stripe test keys for live keys before go-live (separate checklist, webhook secret also changes).
3. Switch `bookings@lg-pilates.co.uk` forwarding from Mark's inbox to Louise's.
4. Decide production `payment_mode` before go-live — currently set to `stripe` (deliberate, set in Session 45 while the system isn't yet public).
5. Create migration files for `pending_bookings`, the Stripe ID columns on `bookings`, and the `stripe-checkout`/`stripe-webhook` Edge Functions (existing AUDIT ITEM — applied directly via MCP, no file on disk).
6. Netlify migration (T1-04) is now unblocked.

---

## 2. Goals

- Allow Louise to switch payment mode from the admin Settings page without any code change
- Preserve the existing bank transfer flow exactly — no regressions
- Build the Stripe integration so it is fully interchangeable with bank transfer
- Ensure the email notification workflow adapts correctly to each mode
- Full automated test coverage for both modes
- No impact to clients — the switch is invisible to them; they simply see a different payment step

---

## 3. Scope Boundaries

**In scope:**
- `payment_mode` setting in the `settings` table
- Admin Settings page toggle (bank transfer / Stripe)
- Booking modal payment step branching
- Stripe Checkout integration (Sessions, webhooks, redirect handling)
- Email workflow adaptation for Stripe mode
- Full Playwright test coverage for both modes
- Test DB fixture updates
- Context.txt, BACKLOG.md, TEST-PLAN.md updates

**Out of scope:**
- Stripe refunds via API (refund flow remains manual in Stripe dashboard for now — revisit post-launch)
- Waitlist payment (waitlist feature not yet built)
- Subscription/recurring payments (blocks only — one-off payments per block)
- Multi-currency (GBP only)

---

## 4. Database Changes

### 4.1 Settings table

Add a new row to the existing `settings` table:

| key | value |
|-----|-------|
| `payment_mode` | `bank_transfer` (default) |
| `stripe_publishable_key` | *(Stripe publishable key — set by Mark in Supabase dashboard)* |
| `stripe_webhook_secret` | *(Stripe webhook secret — set in Edge Function env vars, NOT in settings table)* |

> **Note:** `stripe_publishable_key` is safe to store in the `settings` table (it is a public key, not a secret). The secret key and webhook secret must **never** be stored in the `settings` table — they belong in Supabase Edge Function environment variables only.

No schema changes required — the `settings` table already supports arbitrary key/value rows.

### 4.2 Bookings table

Add one new column:

```sql
ALTER TABLE bookings ADD COLUMN stripe_payment_intent_id TEXT;
ALTER TABLE bookings ADD COLUMN stripe_checkout_session_id TEXT;
```

These are nullable. In bank transfer mode they remain NULL. In Stripe mode they are populated when the Stripe Checkout session is created.

### 4.3 New Supabase Edge Function

A new Edge Function `create-checkout-session` will be needed alongside the existing `send-email` function. See Section 7.

---

## 5. Admin Settings Page — Payment Mode Toggle

### 5.1 UI

A new card is added to the Settings page (after the existing bank details card and notification email card):

**Card title:** Payment Method

**Content:**
- Radio button group: `Bank Transfer` / `Card Payments (Stripe)`
- When `Bank Transfer` is selected: a note confirming clients will be shown bank details and asked to pay manually
- When `Card Payments (Stripe)` is selected: a Stripe publishable key input field appears (for Louise/Mark to configure)
- Save button

**Stripe publishable key field:**
- Only visible when Stripe mode is selected
- Masked input (password type) — shows/hides via toggle
- Placeholder: `pk_live_...` or `pk_test_...`
- Validation: must start with `pk_` before saving

### 5.2 Behaviour

- On load: reads `payment_mode` and `stripe_publishable_key` from `settings` table
- On save: upserts both values
- Switching from Stripe → Bank Transfer does not delete the publishable key (so it doesn't need re-entering)
- No confirmation dialog needed for the switch — it takes effect on the next booking attempt

### 5.3 Visual indicator

When Stripe mode is active, a small amber badge `STRIPE MODE` appears in the admin topbar alongside (or replacing) the existing test-mode banner logic. This helps Louise know at a glance which mode is live.

---

## 6. Booking Flow Changes

### 6.1 Current flow (bank transfer)

```
Step 1: Your details →
Step 2: Health questionnaire (PAR-Q) →
Step 3: Terms & Conditions →
Step 4: Payment (bank details shown, booking reserved)
```

After Step 4, booking status = `reserved`. Louise manually confirms payment.

### 6.2 Stripe flow

```
Step 1: Your details →
Step 2: Health questionnaire (PAR-Q) →
Step 3: Terms & Conditions →
Step 4: Payment (Stripe Checkout redirect)
  → [Stripe hosted payment page — card / Apple Pay / Google Pay]
  → Success redirect back to booking system
  → Booking auto-confirmed
```

After Stripe payment, booking status = `confirmed` immediately.

### 6.3 Implementation detail — Step 4 branch

At the point where Step 4 renders, the app reads `payment_mode` (already loaded from settings on page init):

- `bank_transfer` → existing bank details view renders, booking status set to `reserved`
- `stripe` → "Proceed to Payment" button renders, clicking it:
  1. Calls the `create-checkout-session` Edge Function
  2. Edge Function creates a Stripe Checkout Session and returns a URL
  3. App redirects client to Stripe's hosted page
  4. On success, Stripe redirects to `?payment=success&session_id=...`
  5. App detects this on load, calls Edge Function to verify session, sets booking to `confirmed`
  6. Success view shown

### 6.4 Stripe redirect URLs

- Success: `https://mjones2420-netizen.github.io/lg-pilates-booking/?payment=success&session_id={CHECKOUT_SESSION_ID}`
- Cancel: `https://mjones2420-netizen.github.io/lg-pilates-booking/?payment=cancelled`

> **Note:** These URLs will need updating when the system moves to Netlify (`book.lg-pilates.co.uk`). This is a one-line config change in the Edge Function.

### 6.5 Stripe payment cancel handling

If the client cancels on the Stripe page and returns to the booking system:
- `?payment=cancelled` is detected on load
- A toast is shown: "Payment was cancelled. Your booking has not been confirmed."
- The `reserved` booking created before the redirect is **deleted** (not cancelled — it was never paid)
- Client is returned to the schedule

### 6.6 Booking status flow comparison

| Event | Bank Transfer | Stripe |
|-------|--------------|--------|
| Client completes Step 4 | `reserved` | `reserved` (pre-redirect) |
| Payment received/confirmed | `confirmed` (Louise clicks) | `confirmed` (auto, webhook) |
| Client cancels payment | n/a | booking deleted |
| Louise cancels | `cancelled` / `refund-pending` | `cancelled` / refund in Stripe dashboard |

---

## 7. Stripe Edge Functions

### 7.1 `create-checkout-session`

**Trigger:** Called from the browser when client reaches Step 4 in Stripe mode  
**Input:**
```json
{
  "booking_id": 123,
  "block_id": 45,
  "amount_pence": 7200,
  "customer_email": "client@example.com",
  "class_name": "Mixed Ability",
  "block_dates": "6 Apr – 11 May 2026"
}
```
**Action:**
- Creates a Stripe Checkout Session (mode: `payment`)
- Sets success and cancel URLs
- Stores `stripe_checkout_session_id` on the booking row
- Returns the Checkout Session URL

**Environment variables required (set in Supabase Edge Function config):**
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

### 7.2 `stripe-webhook`

**Trigger:** Called by Stripe when a payment event fires  
**Events handled:**
- `checkout.session.completed` → set booking status to `confirmed`, fire confirmation emails
- `checkout.session.expired` → delete the `reserved` booking

**Security:** Stripe webhook signature verified using `STRIPE_WEBHOOK_SECRET` before any DB action is taken.

> **Note:** The webhook is the authoritative confirmation signal — not the success redirect. The redirect provides a good UX experience but must never be the sole trigger for confirming a booking, as it can be bypassed or fail silently.

---

## 8. Email Workflow Changes

### 8.1 Bank transfer mode — no change

All 6 existing email triggers remain exactly as built:

| Trigger | Event | Recipient |
|---------|-------|-----------|
| 1 | Booking reserved | Client |
| 2 | Booking confirmed (Louise clicks) | Client |
| 3 | Cancellation notice | Client |
| 4 | Refund confirmed | Client |
| 5 | New reservation alert | Louise |
| 6 | Admin cancellation alert | Louise |

### 8.2 Stripe mode — modified triggers

| Trigger | Event | Recipient | Change |
|---------|-------|-----------|--------|
| 1 | Booking reserved | Client | **Suppressed** — client goes straight to Stripe, no "reserved" email needed |
| 2 | Booking confirmed | Client | **Fires on webhook** — not Louise's manual click |
| 3 | Cancellation notice | Client | No change |
| 4 | Refund confirmed | Client | No change (refund processed in Stripe dashboard, Louise marks refunded) |
| 5 | New reservation alert | Louise | **Suppressed** — replaced by trigger 5S below |
| 5S | Payment confirmed alert | Louise | **New** — fires on webhook, no manual action needed |
| 6 | Admin cancellation alert | Louise | No change |

### 8.3 New email template — Trigger 5S (Stripe mode)

**To:** Louise  
**Subject:** New booking confirmed — [Class Name]  
**Content:** Same as current trigger 5 alert but:
- Removes "manual payment confirmation needed" instruction
- Adds "Payment received via Stripe" confirmation
- Removes bank transfer reference
- PAR-Q flag for new clients retained

### 8.4 Implementation

Email triggers are already gated by the `sendBookingEmail()` function. In Stripe mode:
- `sendBookingEmail('reserved', ...)` checks `payment_mode` — if `stripe`, returns early (suppressed)
- `sendBookingEmail('confirmed', ...)` is called from the webhook handler instead of from `confirmBookingAdmin()`
- Louise's alert (trigger 5S) is also called from the webhook handler

No existing email code is deleted — all bank transfer triggers remain. Stripe mode adds suppression gates and new webhook-triggered calls.

---

## 9. Test Coverage Plan

### 9.1 Existing tests

All 169 existing tests continue to run against bank transfer mode. No changes to existing specs.

`payment_mode` defaults to `bank_transfer` in the test fixture (new row in `07_seed_data.sql` or migration 12).

### 9.2 New test suites

#### ST (Stripe) suite — Stripe-specific scenarios

**As built (23 tests, 19 spec files) — see TEST-PLAN.md Stripe Coverage Tracker for full detail:**

| ID | Scenario | Status |
|----|----------|-------|
| ST-01 | Stripe mode toggle visible in admin Settings | ✅ PM-1 |
| ST-02 | Save payment mode — bank transfer | ✅ PM-1 |
| ST-03 | Save payment mode — Stripe | ✅ PM-1 |
| ST-04 | Stripe publishable key field hidden in bank transfer mode | ✅ PM-1 |
| ST-05 | Stripe publishable key field shown in Stripe mode | ✅ PM-1 |
| ST-06 | Invalid publishable key rejected (doesn't start with pk_) | ✅ PM-1 |
| ST-07 | Booking modal Step 4 shows bank details in bank transfer mode | ✅ PM-2 |
| ST-08 | Booking modal Step 4 shows "Proceed to Payment" in Stripe mode | ✅ PM-2 |
| ST-16 | STRIPE MODE badge visible in admin topbar when Stripe active | ✅ PM-1 |
| ST-17 | Stripe checkout creates pending_bookings row, no real booking, redirects to Stripe | ✅ PM-6 |
| ST-18 | Cancel redirect shows toast, pending_bookings row left untouched | ✅ PM-6 |
| ST-19 | Webhook success: booking confirmed with both Stripe IDs | ✅ PM-6 |
| ST-20 | Webhook success: PAR-Q saved for new client (all 12 questions) | ✅ PM-6 |
| ST-21 | Client confirmation email template — Sessions date pills (template check) | ✅ PM-6 |
| ST-22 | Admin alert email — subject, amount, PAR-Q warning (template check, 4 tests) | ✅ PM-6 |
| ST-23 | Webhook failure (CLASS_FULL): pending row retained, no booking created | ✅ PM-6 |
| ST-24 | Webhook failure (ALREADY_BOOKED): pending row retained, existing booking untouched | ✅ PM-6 |
| ST-25 | Invalid/missing webhook signature rejected (2 tests) | ✅ PM-6 |
| ST-26 | Duplicate webhook delivery handled gracefully | ✅ PM-6 |

**ST-09 to ST-15 (original plan, not built as such):** these IDs remain as open placeholders in TEST-PLAN.md. ST-10/ST-11 described a "real booking created before redirect" design superseded by the `pending_bookings` approach — effectively covered by ST-17/18/19 instead. ST-12 (reserved-email suppression in Stripe mode), ST-15 (bank-transfer regression check), and ST-09 (front-end redirect-fires assertion) remain genuinely open if wanted in a future session.

**Why ST-13/ST-14 (confirmed/admin emails via webhook) became template checks (ST-21/22) rather than intercepted integration tests:** `stripe-webhook` calls `send-email` server-to-server — Playwright's `page.route()` can only intercept requests from the browser page it controls, so the originally-planned interception approach doesn't work for webhook-triggered emails. ST-19/20 prove the webhook completes successfully (200, correct DB state) when these emails fire; ST-21/22 separately verify the email template/content logic using copies of the builder functions (see `tests/helpers/email-templates.js` — flagged as a drift risk if the templates change again without updating this helper).

#### SE suite additions (Settings & Export)

2–3 new SE specs covering the new Settings card:
- SE-18: Payment mode card visible on Settings page
- SE-19: Toggle between bank transfer and Stripe persists correctly
- SE-20: Stripe publishable key saves and reloads correctly

### 9.3 Test DB fixture additions

- New `payment_mode = 'bank_transfer'` row in `settings` seed
- New migration (12) to add `stripe_payment_intent_id` and `stripe_checkout_session_id` columns to `bookings`
- `npm run seed` extended to apply migration 12

### 9.4 Stripe test mode in Playwright

Stripe provides test mode with dummy card numbers (`4242 4242 4242 4242`). Playwright can interact with Stripe's hosted Checkout page in test mode.

Required additions to `.env.test`:
- `STRIPE_TEST_PUBLISHABLE_KEY`
- `STRIPE_TEST_SECRET_KEY`
- `STRIPE_TEST_WEBHOOK_SECRET`

For webhook tests: Stripe CLI (`stripe listen`) can forward webhook events to a local endpoint during development. CI will use Stripe's test webhook simulation.

---

## 10. Security Considerations

| Risk | Mitigation |
|------|-----------|
| Stripe secret key exposed in frontend | Secret key lives only in Edge Function env vars, never in `settings` table or `index.html` |
| Webhook spoofing | All webhook events verified using Stripe signature before any DB action |
| Booking confirmed without payment | Webhook is authoritative — success redirect alone never confirms a booking |
| Client manipulates session_id in URL | Edge Function verifies session status with Stripe API before confirming |
| Stripe publishable key in settings table | Publishable keys are intentionally public — safe to store. Documented clearly in code. |
| Reserved booking left orphaned after Stripe cancel | Cancel redirect + `checkout.session.expired` webhook both trigger cleanup |

---

## 11. Build Sessions — Actual Outcomes (✅ all complete)

### Session PM-1: Feature flag foundation ✅
**Built as planned.** `payment_mode` and `stripe_publishable_key` added to settings, admin Settings page Payment Method card, `PAYMENT_MODE` constant on app init, STRIPE MODE topbar badge. ST-01 to ST-06, ST-16, SE-18 to SE-20.

---

### Session PM-2: Booking modal branch ✅
**Built as planned.** Step 4 branches on `PAYMENT_MODE` — bank transfer path unchanged, Stripe path shows explainer + "Proceed to Payment" button (placeholder `initiateStripeCheckout()` at this stage). ST-07, ST-08.

---

### Session PM-3: Stripe Checkout integration ✅
**Built with one design change from the original plan:** instead of creating a real `bookings` row before redirecting, `confirmBooking()` writes a `pending_bookings` row (new table, both DBs) and the `stripe-checkout` Edge Function returns the Stripe Checkout URL. The real booking is only created by the webhook (PM-4) once payment is confirmed — avoids ever having an unpaid "reserved" booking sitting in the system. Success redirect shows a full overlay (`#stripe-success-overlay`); cancel redirect (`?payment=cancelled`) shows a toast and leaves the `pending_bookings` row untouched (covered later by ST-18).

---

### Session PM-4: Stripe webhook ✅
**Built with one change from the original plan:** `stripe-webhook` handles `checkout.session.completed` only — the planned `checkout.session.expired` handler wasn't built; abandoned `pending_bookings` rows instead rely on `expires_at` (2 hours), cleanup currently manual (BACKLOG T3-07). On success: upserts customer, calls `book_if_available`, sets `status='confirmed'` with both Stripe IDs, saves PAR-Q for new clients, sends trigger 2 (client confirmation) + trigger 5S (admin alert) emails, deletes the `pending_bookings` row. On `CLASS_FULL`/`ALREADY_BOOKED` (payment succeeded but booking couldn't be placed): sends an admin failure alert, leaves the `pending_bookings` row for manual review — see Implementation Status item 1 re: the client-side gap in this path.

---

### Session PM-5: Production webhook + email polish ✅
`stripe-webhook` deployed to production (v3), production Stripe webhook endpoint + secret configured, end-to-end verified (booking 227). Client confirmation email updated to show individual session date pills instead of a date range (applied in `index.html` and both webhook deployments). Fixed a `payment_mode` reseed bug (migration 12).

---

### Session PM-6: Playwright coverage for the Stripe flow ✅
**Different scope from the original plan** (which envisaged "end-to-end review + production prep" including live key swap and Netlify migration — those are now Outstanding items, see Implementation Status above, not part of PM-6). What was actually built: 10 new spec files (ST-17 to ST-26, 14 tests) covering `pending_bookings` creation, cancel-redirect handling, webhook success (booking confirmation + PAR-Q), webhook failure paths (`CLASS_FULL`/`ALREADY_BOOKED`), email template content checks, signature verification, and duplicate-delivery handling. New test helpers: `stripe-webhook.js` (signs and posts fake Stripe events directly to the webhook — no real Stripe contact for ST-19 to ST-26) and `email-templates.js` (template-fidelity checks for email content). TEST-PLAN.md, context.txt, and BACKLOG.md updated. Also: cleared 4 leftover `pending_bookings` rows from production, identified and logged the client-notification gap (T1-06).

---

## 12. Dependencies & Pre-requisites

| Item | Required by | Notes |
|------|------------|-------|
| Stripe account created | Session PM-3 | Free to create; test mode available immediately |
| Stripe test API keys | Session PM-3 | Publishable + secret keys from Stripe dashboard |
| Stripe webhook secret | Session PM-4 | Generated when webhook endpoint registered |
| Stripe CLI | Session PM-4 | For local webhook forwarding during development |
| Netlify migration | Session PM-6 | Redirect URLs need updating post-migration |
| `.env.test` additions | Session PM-3 | `STRIPE_TEST_PUBLISHABLE_KEY`, `STRIPE_TEST_SECRET_KEY`, `STRIPE_TEST_WEBHOOK_SECRET` |

---

## 13. BACKLOG.md Updates

On adoption of this spec, BACKLOG.md should be updated:
- Move "Payment mode feature flag" from conceptual to Tier 1 active
- Add Sessions PM-1 through PM-6 as sub-items
- Note Stripe account pre-requisite against PM-3

---

## 14. Open Questions

| # | Question | Status |
|---|----------|--------|
| 1 | Will Louise manage Stripe herself or will Mark handle it? | ✅ Resolved — Mark's Stripe account |
| 2 | What currency symbol / price format should Stripe Checkout display? | ✅ Resolved — GBP, £ |
| 3 | Should refunds eventually be processed via Stripe API, or remain manual? | Open — post-launch |
| 4 | Will the Netlify migration complete before or after Stripe goes live? | ✅ Resolved — Stripe (PM-6) complete first; Netlify now unblocked |
| 5 | Does Louise want email receipts from Stripe in addition to the system emails? | Open — revisit before go-live |

---

*This spec's build phase (PM-1 to PM-6) is complete as of Session 45. Remaining work is tracked in BACKLOG.md (T1-06 client-notification gap, plus pre-launch housekeeping) and context.txt section 8a.*
