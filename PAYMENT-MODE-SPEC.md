# LG Pilates — Payment Mode Feature Spec
**Status:** Draft for review  
**Date:** 12 Jun 2026  
**Author:** Mark Jones / Claude  

---

## 1. Overview

This document scopes the full design, build, and test plan for adding a **payment mode feature flag** to the LG Pilates booking system. The flag allows Louise to switch between two payment methods:

- **Bank Transfer** — the current method. Clients are shown Louise's bank details after booking and pay manually. Louise confirms receipt via the admin dashboard.
- **Stripe Checkout** — a future method. Clients are redirected to a Stripe-hosted payment page after booking. Payment is confirmed automatically. No manual action from Louise.

At launch, the system will run in bank transfer mode. Stripe will be built as a follow-on integration, slotting into a branch point already prepared by this feature.

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

| ID | Scenario | Notes |
|----|----------|-------|
| ST-01 | Stripe mode toggle visible in admin Settings | UI check |
| ST-02 | Save payment mode — bank transfer | Settings persistence |
| ST-03 | Save payment mode — Stripe | Settings persistence + publishable key |
| ST-04 | Stripe publishable key field hidden in bank transfer mode | Conditional UI |
| ST-05 | Stripe publishable key field shown in Stripe mode | Conditional UI |
| ST-06 | Invalid publishable key rejected (doesn't start with pk_) | Validation |
| ST-07 | Booking modal Step 4 shows bank details in bank transfer mode | No regression |
| ST-08 | Booking modal Step 4 shows "Proceed to Payment" in Stripe mode | Branch |
| ST-09 | Stripe Checkout redirect fires on Step 4 button click | Integration |
| ST-10 | Success redirect sets booking to confirmed | Webhook/redirect |
| ST-11 | Cancel redirect shows toast and deletes reserved booking | Cancel handling |
| ST-12 | Reserved email suppressed in Stripe mode | Email suppression |
| ST-13 | Confirmed email fires on Stripe payment (webhook) | Email trigger |
| ST-14 | Louise alert fires on Stripe payment (webhook) | Email trigger |
| ST-15 | Bank transfer mode: all existing email triggers unaffected | Regression |
| ST-16 | STRIPE MODE badge visible in admin topbar when Stripe active | UI indicator |
| ST-17 | stripe_checkout_session_id stored on booking after redirect | DB integrity |
| ST-18 | Stripe mode: PAR-Q flag still included in Louise's alert email | Regression |

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

## 11. Build Sessions — Proposed Breakdown

### Session PM-1: Feature flag foundation
**Scope:**
- Add `payment_mode` to settings table seed
- Add `stripe_publishable_key` to settings table seed
- Admin Settings page: new Payment Method card with toggle + key field
- Read `payment_mode` on app init and store in a `PAYMENT_MODE` constant
- Admin topbar: STRIPE MODE badge when active
- New SE specs (SE-18, SE-19, SE-20) + ST-01 through ST-06, ST-16
- TEST-PLAN.md update, context.txt update

**No Stripe account or keys needed yet.**

---

### Session PM-2: Booking modal branch
**Scope:**
- Step 4 branch: bank transfer view vs Stripe "Proceed to Payment" button
- Bank transfer path: zero changes to existing behaviour
- Stripe path: button present, calls placeholder function (no Stripe yet)
- ST-07 and ST-08 specs
- TEST-PLAN.md update, context.txt update

**Still no Stripe account needed — Stripe button present but Stripe not wired.**

---

### Session PM-3: Stripe Checkout integration
**Pre-requisite:** Mark creates Stripe account, obtains test keys

**Scope:**
- `create-checkout-session` Edge Function
- Stripe JS library loaded conditionally (only in Stripe mode)
- Step 4 button wired to Edge Function → Checkout redirect
- Success redirect handling (`?payment=success`)
- Cancel redirect handling (`?payment=cancelled`)
- `stripe_checkout_session_id` stored on booking
- Migration 12 applied to both prod and test
- ST-09, ST-10, ST-11, ST-17 specs
- TEST-PLAN.md update, context.txt update

---

### Session PM-4: Stripe webhook
**Scope:**
- `stripe-webhook` Edge Function
- `checkout.session.completed` handler → booking confirmed
- `checkout.session.expired` handler → booking deleted
- Webhook signature verification
- Stripe CLI setup for local webhook testing
- ST-10 (webhook path), ST-11 (expired path)
- TEST-PLAN.md update, context.txt update

---

### Session PM-5: Email workflow — Stripe mode
**Scope:**
- Suppress trigger 1 (reserved email) in Stripe mode
- Move trigger 2 (confirmed email) to webhook handler
- Suppress trigger 5 (Louise reservation alert) in Stripe mode
- New trigger 5S (Louise payment confirmed alert) — new email template
- ST-12, ST-13, ST-14, ST-15, ST-18 specs
- EMAIL-NOTIFICATIONS-SPEC.md update
- TEST-PLAN.md update, context.txt update

---

### Session PM-6: End-to-end review + production prep
**Scope:**
- Full end-to-end manual walkthrough of both payment modes
- Stripe test mode run-through with real dummy card on test environment
- Switch to Stripe live keys for production
- Update Stripe redirect URLs to Netlify domain (if migration complete)
- Schema-check prod vs test
- Any spec fixes or gaps identified in review
- BACKLOG.md updated
- context.txt final update for this feature

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

| # | Question | Decision needed by |
|---|----------|--------------------|
| 1 | Will Louise manage Stripe herself or will Mark handle it? | Before PM-3 |
| 2 | What currency symbol / price format should Stripe Checkout display? | Before PM-3 |
| 3 | Should refunds eventually be processed via Stripe API, or remain manual? | Post-launch |
| 4 | Will the Netlify migration complete before or after Stripe goes live? | Affects PM-6 redirect URLs |
| 5 | Does Louise want email receipts from Stripe in addition to the system emails? | Before PM-5 |

---

*This spec is a living document. Update it at the end of each PM session to reflect decisions made and any scope changes.*
