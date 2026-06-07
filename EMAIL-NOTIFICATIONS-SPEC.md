# LG Pilates — Email Notifications Spec
**Status:** Session 2 complete — ready for Session 3  
**Last updated:** 7 Jun 2026

---

## What this feature does

When clients book a class, get cancelled, or receive a refund — they'll automatically receive a confirmation email. Louise will also receive alert emails when new bookings come in.

Emails are sent via **Resend** — a third-party email sending service. Think of it like a Royal Mail sorting office: we hand it a letter, it delivers it. We don't send directly from the website.

---

## Email triggers

These are the events that send an email automatically:

| # | Event | Who receives it |
|---|-------|----------------|
| 1 | Client reserves a booking | Client |
| 2 | Louise confirms a booking (manual, in the dashboard) | Client |
| 3 | Louise cancels a client (via Remove From Block) | Client + Louise |
| 4 | Louise marks a refund as paid (Cancellations tab) | Client + Louise |
| 5 | Any new booking is made | Louise only (includes PAR-Q flag for new clients) |

---

## Sender address

- **Sent from:** `bookings@lg-pilates.co.uk`
- **Replies go to:** `bookings@lg-pilates.co.uk`, which forwards to Mark's inbox (mjones970@live.co.uk) during testing — to be changed to Louise's email once live
- **Note:** When Louise replies to a client, it will show her personal email as the sender. This is acceptable for now.
- **Mailbox:** A GoDaddy Microsoft 365 Email Essentials mailbox exists at `bookings@lg-pilates.co.uk`. This is the "nice to have full mailbox" item from the original spec — purchased during pre-build setup.

---

## Louise's email address

- Stored in the **settings table** (existing database table)
- Editable via the **Settings tab** in the admin dashboard
- Used as the recipient for trigger #3, #4, and #5

---

## Test mode behaviour

- When the app is running in test mode (`?env=test`), the Edge Function is called with `isTest: true`
- The Edge Function redirects all recipients to `delivered@resend.dev` — Resend's silent sink address
- The email goes through Resend (visible in the Resend dashboard logs) but is never delivered to a real inbox
- Both Supabase projects use live Resend API keys — there is no separate test key type in Resend
- The `isTest` flag is set by `index.html` based on which Supabase project is active (`?env=test` = test project)
- **`?noemail=1` flag:** Adding this to the URL suppresses the email call entirely — nothing reaches the Edge Function or Resend. All Playwright specs use `APP_PATH` which includes this flag automatically, keeping the Resend dashboard log clean. SE-12 uses `APP_PATH_EMAIL` (without the flag) so its `page.route()` intercept can still assert the wiring.

---

## Architecture (plain English)

The booking system is a single HTML file — it runs in the user's browser. We can't store a secret API key in a file that anyone can view in their browser.

Instead, we use a **Supabase Edge Function** — a small piece of server-side code that lives securely on Supabase (the same service that runs the database). The HTML file calls the Edge Function, the Edge Function calls Resend, Resend sends the email. The API key never touches the browser.

```
Browser (index.html)
  → calls Supabase Edge Function (server-side, secure)
    → calls Resend API
      → email delivered to recipient
```

The Resend API key is stored as a **secret** on Supabase — not in the code, not in GitHub.

---

## Domain setup (one-time, before build)

Before any emails can be sent from `bookings@lg-pilates.co.uk`, the domain needs to be **verified with Resend**. This proves to email providers (Gmail, Hotmail, etc.) that Resend is authorised to send on behalf of `lg-pilates.co.uk`.

**What's involved:**
1. Log in to GoDaddy
2. Add a few DNS records that Resend provides (copy/paste job — no technical knowledge needed)
3. Resend verifies the domain (usually within minutes)
4. Set up email forwarding/mailbox on GoDaddy: `bookings@lg-pilates.co.uk`

This is a one-time setup step, done before Session 1 of the build.

---

## Build plan

The build is split across multiple sessions. Each session has a clear goal and a sign-off checkpoint before moving on.

---

### Pre-build: Domain & Resend setup ✅ COMPLETE

- [x] Verify `lg-pilates.co.uk` with Resend (DNS records via GoDaddy)
- [x] Set up GoDaddy Microsoft 365 mailbox at `bookings@lg-pilates.co.uk`, forwarding to Mark's inbox for testing
- [x] Create Resend account and get live + test API keys
- [x] Store API keys as Supabase secrets on both production and test projects

---

### Session 1 — Settings & Edge Function foundation ✅ COMPLETE

**Goal:** Louise's email is stored in the database, and a working Edge Function exists that can send a test email.

Steps:
1. ✅ Add `admin_email` key to the settings table (both production and test) — seeded with `mjones970@live.co.uk`
2. ✅ Add Louise's email field to the Settings tab in the admin dashboard (`#setting-admin-email`)
3. ✅ Create the Supabase Edge Function (`send-email`) — deployed to both prod and test projects
4. ✅ Test manually: production email delivered to `mjones970@live.co.uk`; test mode redirected to `delivered@resend.dev`

**Notes:**
- Supabase CLI (v2.105.0) and Docker Desktop installed on Mark's Mac during this session
- Edge Function lives at `supabase/functions/send-email/index.ts` in the repo
- `isTest` flag in the payload drives the `delivered@resend.dev` redirect — no separate Resend test key needed

---

### Session 2 — Booking reserved email (trigger #1) ✅ COMPLETE

**Goal:** Client receives a confirmation email when they complete a booking.

Steps:
1. ✅ Email template designed and approved (mockup reviewed by Mark)
2. ✅ `buildReservedEmailHtml()` helper built — table-based HTML email with LG Pilates branding, reserved alert banner, booking summary, bank details, 48-hour payment deadline, what to bring
3. ✅ `sendBookingEmail()` async helper wired into `confirmBooking()` as a non-fatal Step 4 (booking succeeds regardless of email outcome)
4. ✅ `appSettings` global added so bank details are available to the email builder at reserve time
5. ✅ `IS_NO_EMAIL` flag added (`?noemail=1`) — suppresses email call in test runs; `APP_PATH` in test helpers updated to include flag automatically; `APP_PATH_EMAIL` added for SE-12 only
6. ✅ SE-12 spec written — intercepts Edge Function call via `page.route()`, asserts correct recipient, subject, `isTest: true`, first name in HTML, "48 hours" in HTML
7. ✅ Tested in production — real email delivered to `mjones970@live.co.uk`, rendered correctly

**Notes:**
- Email template content: class name, venue, day/time, block date range, amount due, bank details, payment reference (`FirstName LastName Day`), 48-hour deadline, what to bring
- "What to bring" wording agreed: arrive no more than 10 minutes before the session starts
- `page.route()` intercept in SE-12 means CI runs never touch Resend — zero log noise
- `bookings@lg-pilates.co.uk` replies forward to Mark's inbox during testing

**Sign-off:** ✅ Complete — Session 3 next.

---

### Session 3 — Booking confirmed email (trigger #2)

**Goal:** Client receives an email when Louise manually confirms their booking in the dashboard.

Steps:
1. Identify where in the dashboard the "Confirm" action happens
2. Wire the Edge Function call into the confirm action
3. Decide on email content (different tone to the reserved email — this one is the "you're confirmed" message)
4. Test end-to-end

**Sign-off required before Session 4 begins.**

---

### Session 4 — New booking alert to Louise (trigger #5)

**Goal:** Louise receives an email whenever a client books, including a PAR-Q flag for new clients.

Steps:
1. Build the admin alert email template
2. Wire it into the Reserve button handler alongside the client email (trigger #1)
3. Include PAR-Q required flag (true for `customer_type = 'new'`)
4. Test end-to-end

**Sign-off required before Session 5 begins.**

---

### Session 5 — Cancellation emails (trigger #3)

**Goal:** Both the client and Louise receive an email when a client is removed via the Remove From Block modal.

Steps:
1. Identify the confirm step in the RFB modal where cancellation is finalised
2. Build the client cancellation email template (class, dates, refund amount if applicable)
3. Build the Louise cancellation alert template
4. Wire both Edge Function calls into the RFB confirm handler
5. Test end-to-end

**Sign-off required before Session 6 begins.**

---

### Session 6 — Refund confirmation emails (trigger #4)

**Goal:** Both the client and Louise receive an email when a refund is marked as paid.

Steps:
1. Identify the "Mark as Refunded" action in the Cancellations tab
2. Build the client refund confirmation email template
3. Build the Louise refund alert template
4. Wire both Edge Function calls into the refund action
5. Test end-to-end

**Sign-off required before final review.**

---

### Final review session

- End-to-end test of all 5 triggers in test mode
- End-to-end test of all 5 triggers in production mode (to a safe test address)
- Check all emails render correctly on mobile and desktop
- Check forwarding works (Louise receives admin alerts in her inbox)
- Sign off and go live

---

## Open decisions (to resolve before or during build)

- [x] "What to bring" section included — wording agreed Session 2 (arrive no more than 10 minutes before the session starts)
- [ ] Exact wording for remaining email templates (triggers #2–#5) — to be agreed with Louise before each session
- [ ] When to switch forwarding from Mark's inbox to Louise's personal email

---

## Future consideration — third-party payments (e.g. Stripe)

The current booking flow has a two-step process: client reserves a spot, Louise manually confirms once payment is received. This is why triggers #1 and #2 exist as separate emails.

When a payment tool like Stripe is added, this will change significantly:

- The reserved/confirmed split will collapse into a single paid booking
- Triggers #1 and #2 will be replaced by a single "payment successful" confirmation email
- Cancellations and refunds may be handled by the payment tool, changing or removing triggers #3 and #4
- The new booking alert to Louise (trigger #5) is likely to remain unchanged

**What this means for phase one:**

The Edge Function itself is payment-agnostic — it receives a payload and sends an email. The templates and the Function won't need rebuilding when Stripe arrives. Only the trigger points in index.html will need rewiring.

Triggers #1 and #2 should be treated as deliberately simple placeholders. Do not over-engineer the reserved/confirmed email templates — they will be redesigned when payments are introduced.

---

## Out of scope for MVP — future features

### Group email to all clients on a block

Louise will sometimes need to notify all clients booked onto a block at once (e.g. class cancelled, venue change). Rather than emailing clients individually, she should be able to send one message from the dashboard that goes to everyone on that block.

**Privacy requirement:** Each client must only see their own email address. Emails are sent individually to each client (one send per person), not as a group CC or BCC. This is standard practice for transactional email and is both more reliable and more professional.

**Where it lives:** A "Email this block" button in the admin dashboard (By Class tab or Bookings tab — to be decided at design time).

---

## Out of scope (for now)

- PAR-Q submission confirmation email (PAR-Q is submitted as part of booking — covered by the booking confirmation)
- Waitlist notification emails (waitlist feature not yet built)
- Email open/click tracking
- Unsubscribe links (not required for transactional emails under UK law)

---

## Automation testing approach

Playwright tests are written alongside the build — not all at the end.

**Per-session rule:**
- At the end of each build session, assess what can be meaningfully tested with Playwright
- Not every session will produce testable output (e.g. Edge Function internals can't be driven via the browser)
- Where tests can be written, they are written in the same session and run locally before any push
- TEST-PLAN.md is updated in the same session as any new test

**What is likely testable:**
- Settings tab — Louise's email field saves and displays correctly
- Booking flow — Edge Function is called at the Reserve step (can be verified via Resend test mode dashboard or a mock)
- Admin dashboard actions — confirm, cancel, refund actions trigger the correct calls
- Group email UI (future) — button exists, modal opens, sends correctly

**What is not directly testable via Playwright:**
- Actual email delivery (Resend handles this — we rely on Resend test mode to verify payloads)
- Edge Function internals (tested manually or via Supabase logs)

The call on what to test is made at the end of each session based on what was built.
