# LG Pilates — Release Plan
### New website + phased booking-system rollout

Last updated: 04 Jul 2026 · Written with Claude Code (session 62)

**The journey in one line:**
New website (customers email Louise, same as today) → private pilot of the booking system with a few trusted customers (bank transfer) → booking system for everyone (bank transfer) → Stripe card payments → cancel old GoDaddy hosting.

**Who does what:** each step is tagged **MARK** (you, usually in a dashboard), **CLAUDE** (done in a Claude Code session with your approval), or **LOUISE**.

**How to use this:** work top to bottom. Don't start a phase until the previous phase's **GATE** is met. Every phase has a **ROLLBACK** box — if something goes wrong, do that and you're back to safety.

---

## Key facts (checked 04 Jul 2026 — these answer your big questions)

- **Your email will NOT break.** lg-pilates.co.uk email is Microsoft 365, bought through GoDaddy but a completely separate product from the web hosting. As long as you keep (1) the domain registration, (2) the DNS settings, and (3) the Microsoft 365 subscription, email works forever — even after the web hosting is cancelled.
- **We are NOT moving DNS away from GoDaddy.** The domain's nameservers stay at GoDaddy. We only change two records (the ones that say "the website lives here") to point at Netlify. The email records are never touched. This also makes rollback trivial.
- **Stripe needs nothing removed for the bank-transfer phase.** When `payment_mode` is set to `bank_transfer`, the booking page never contacts Stripe at all — the Stripe keys just sit there unused. No secrets to delete.
- **"Hidden" means unlinked and invisible to Google, not password-protected.** Anyone with the exact URL could reach the booking site during the quiet/pilot phases. That's fine for our purposes — just don't post the URL anywhere public.
- Current DNS values (needed for rollback): website A record = `160.153.0.161`, `www` points at the main domain.

---

## Phase 0 — Pre-flight security (do once, before anything else)

| # | Who | Step |
|---|-----|------|
| 1 | MARK | **Disable public signups on BOTH Supabase projects** ([#43](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/43) — critical). Supabase dashboard → Authentication → Sign In / Providers → turn off "Allow new users to sign up". Do it on production AND test. |
| 2 | MARK + CLAUDE | Rotate the exposed Supabase access token and move it out of plaintext (known outstanding security TODO). |
| 3 | CLAUDE | Save a copy of the current lg-pilates.co.uk pages (especially the "how to book" wording) so nothing is lost when the old site goes. |
| 4 | MARK | Confirm you have logins for: Netlify (create free account if none), GoDaddy, Microsoft 365 admin. |

**GATE:** step 1 done on both projects. It's a 2-minute toggle and everything else waits for it.

---

## Phase 1 — New website live · booking still "email Louise"

The Astro website replaces lg-pilates.co.uk. Customers book exactly as they do today: they read the site and email Louise. No visible booking system.

### 1a. Get the site ready (Claude Code sessions in the website project)

| # | Who | Step |
|---|-----|------|
| 5 | CLAUDE | Add the Netlify adapter (`@astrojs/netlify`) to the Astro project. The site is built in "server" mode and won't run on Netlify without it. |
| 6 | CLAUDE | Build a **"How to Book" page** with the same instructions as the current site (email Louise). Mockup first for your approval. Make sure NO page links to the booking system yet. |
| 7 | CLAUDE + MARK | Put the website project into git and push it to the `lg-pilates-website` GitHub repo (it currently holds 3 old WordPress theme files — they stay safe in history). Confirm `.env` is git-ignored — it must never be uploaded. |

### 1b. Deploy to Netlify

| # | Who | Step |
|---|-----|------|
| 8 | MARK (Claude guiding) | Netlify → "Add new site" → "Import an existing project" → GitHub → pick the repo. Build command `npm run build`; the adapter handles the rest. |
| 9 | MARK | In Netlify → Site settings → Environment variables, add `PUBLIC_SANITY_PROJECT_ID` and `PUBLIC_SANITY_DATASET` (values from the project's local `.env`). Redeploy. |
| 10 | MARK (Claude guiding) | In Sanity's settings, add the new site's URL to the allowed (CORS) origins so the content editor at `/admin` works. |
| 11 | MARK + LOUISE | Test everything on the temporary `something.netlify.app` address: every page, the contact form, editing content via `/admin`, and on a phone. |

### 1c. Point the domain (GoDaddy DNS — nameservers do NOT change)

| # | Who | Step |
|---|-----|------|
| 12 | MARK | Netlify → Domain settings → add custom domain `lg-pilates.co.uk` (and `www.lg-pilates.co.uk`). |
| 13 | MARK | GoDaddy → DNS for lg-pilates.co.uk → change the `@` **A record** to `75.2.60.5`, and change `www` to a **CNAME** pointing at `your-site-name.netlify.app`. **Change nothing else** — the MX and TXT records are your email. |
| 14 | MARK | Wait for the change to spread (minutes to 48 hours). Then check: `https://lg-pilates.co.uk` and `https://www.lg-pilates.co.uk` both load the new site with a padlock (Netlify issues the SSL certificate automatically). **Send yourself a test email to and from the lg-pilates.co.uk address** to confirm mail is untouched. |

**GATE:** new site stable and Louise happy with it for 2–4 weeks. **Keep paying for GoDaddy hosting during this period** — it's your rollback.

> **ROLLBACK (Phase 1):** GoDaddy DNS → set the `@` A record back to `160.153.0.161` and `www` back to pointing at `@`. The old website returns within the hour. Email is never affected either way.

---

## Phase 1.5 — Booking system onto Netlify, still hidden (do during the Phase-1 quiet period)

Moves the booking system from GitHub Pages to its final home at `book.lg-pilates.co.uk`, so it's tested on its real address before any customer sees it.

| # | Who | Step |
|---|-----|------|
| 15 | CLAUDE + MARK | Create a second Netlify site from the booking-system repo. Add a "noindex" tag while hidden so Google ignores it. |
| 16 | MARK | GoDaddy DNS → add a **CNAME** record: `book` → the booking site's `.netlify.app` address. Add `book.lg-pilates.co.uk` as the custom domain in Netlify. |
| 17 | CLAUDE | Verify the deployed Supabase Edge Functions (test AND prod) really allow `book.lg-pilates.co.uk` — the repo copies do, but deployed versions must be spot-checked (lesson from #33/#42). Then smoke-test a booking flow on the new address. |
| 18 | — | Reminder: hidden = unlinked + no Google, **not** password-protected. Don't share the URL publicly. |

> **ROLLBACK (Phase 1.5):** nothing customer-facing changed — delete the `book` DNS record if needed and the old GitHub Pages address still works.

---

## Phase 2a — Private pilot · a few trusted customers · bank transfer

Louise hand-picks a small group to book through the system for real. Everyone else keeps emailing her — they never see the booking site.

**GATE before starting:** Phase 0 step 1 done · Louise's **real bank details entered** in admin Settings ([#3](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/3)) · Louise trained on the dashboard (marking payments received, and the catch-up swaps guide PDF).

| # | Who | Step |
|---|-----|------|
| 19 | MARK approves → CLAUDE | Flip production `payment_mode` from `stripe` to `bank_transfer` (one settings change, done together in a session). Stripe keys stay in place, simply unused. **This must happen before any pilot customer books** — their bookings are real: real classes, real bank transfers, real confirmation emails. |
| 20 | MARK + LOUISE | Do one full test booking yourselves first: book a class, check the confirmation email arrives with the right bank details, pay, and have Louise mark it paid in the dashboard. |
| 21 | LOUISE | Pick a handful of trusted regulars and send them the `book.lg-pilates.co.uk` link directly (email/WhatsApp). Ask them to book their next block through it and say what's confusing. |
| 22 | LOUISE | Process their bookings normally and collect feedback for 1–2 booking cycles. Claude fixes anything the pilot surfaces. |

**GATE:** pilot customers booked and paid successfully, feedback dealt with, Louise comfortable running the dashboard day-to-day.

> **ROLLBACK (Phase 2a):** message the pilot group to go back to emailing Louise. Honour any bookings already made. Nothing public changed — no deploy, no DNS, nothing to undo.

---

## Phase 2b — Full launch · booking system for everyone · bank transfer

| # | Who | Step |
|---|-----|------|
| 23 | CLAUDE | Update the website's "How to Book" page to send everyone to `book.lg-pilates.co.uk` (mockup first), and remove the "noindex" tag from the booking site. |

**GATE:** bookings flowing smoothly from the general public for an agreed period (suggest one full block cycle).

> **ROLLBACK (Phase 2b):** revert the "How to Book" page to the email-Louise wording (one small deploy) and re-hide the booking site. Honour existing bookings. No DNS or database changes needed.

---

## Phase 3 — Stripe card payments on

**GATE before starting:** you and Louise are happy with the bank-transfer experience, and the Stripe account is activated for live payments.

| # | Who | Step |
|---|-----|------|
| 24 | MARK | In the Stripe dashboard (live mode): copy the **live secret key**, and create a **live webhook endpoint** pointing at the production `stripe-webhook` function — copy its signing secret. |
| 25 | MARK approves → CLAUDE | Swap the production Edge Function secrets from the test key to the live key + live webhook secret ([#30](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/30)), and update the publishable key in Settings to the live `pk_live` one. |
| 26 | MARK approves → CLAUDE | Flip production `payment_mode` back to `stripe`. |
| 27 | MARK | Make one real low-value card booking yourself, then refund it from the dashboard — this proves checkout, the webhook, and the refund path all work live. |

> **ROLLBACK (Phase 3):** flip `payment_mode` back to `bank_transfer` — takes effect instantly, no deploy, no DNS. Refund any card payments already taken (via the dashboard, or manually in Stripe if needed).

---

## Phase 4 — Cancel GoDaddy hosting (only after Phase 1 has been stable 30+ days)

| # | Who | Step |
|---|-----|------|
| 28 | MARK (Claude guiding) | Check GoDaddy DNS for any other records still pointing at the old hosting IP (`160.153.0.161`). If any exist, work out what they were for before proceeding. |
| 29 | MARK | Cancel the **web hosting product only**. **KEEP: the domain registration, the DNS zone, and the Microsoft 365 email subscription.** Afterwards, send/receive a test email to confirm mail still works (it will — different product). |

⚠️ Note: once hosting is cancelled, the Phase-1 rollback (restoring the old site) is gone. Only do this when the new site has clearly stuck.

---

## Quick answers to the original questions

- **How do I get the Astro site onto Netlify?** Steps 5–11: add the Netlify adapter, push to GitHub, import into Netlify, set the two Sanity environment variables.
- **How do I point the domain?** Steps 12–14: two record changes in GoDaddy DNS. Nameservers and email records untouched.
- **What happens to GoDaddy hosting?** Keep paying for it as the rollback until the new site is proven (30+ days), then cancel hosting only — Phase 4.
- **Will GoDaddy email still work?** Yes. It's Microsoft 365, separate from hosting. Keep the domain, DNS, and M365 subscription and nothing changes.
- **Does Stripe need anything removed for bank-transfer mode?** No. `payment_mode = bank_transfer` means Stripe is never contacted. Keys sit unused until Phase 3.
- **What's the rollback?** Every phase has its own box above. The nuclear option at any point before Phase 4: restore the two DNS records → old website and email-Louise booking, exactly as today.
