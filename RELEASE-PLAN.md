# LG Pilates — Release Plan
### New website + phased booking-system rollout

Last updated: 07 Aug 2026 · Written with Claude Code (session 62, revised session 84)

> **This is the single source of truth for the whole release — both the website and the booking system.**
> Tracked by [#70](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/70) → phase issues #63–#69.
> The website repo's deploy ticket (`lg-pilates-website` #22) has been folded into Phase 1 / [#64](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/64) and closed. Do not create parallel deploy tickets in either repo.

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
| 1 | MARK | ✅ **DONE (session 66).** Disable public signups on BOTH Supabase projects ([#43](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/43) — critical). Verified via `GET /auth/v1/settings`: `disable_signup: true` on prod and test. |
| 2 | MARK + CLAUDE | Rotate the exposed Supabase access token and move it out of plaintext — tracked as [#102](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/102). Not a blocker for Phase 1; **must be done before Phase 3 (Stripe live)**. |
| 3 | CLAUDE | Save a copy of the current lg-pilates.co.uk pages (especially the "how to book" wording) so nothing is lost when the old site goes. |
| 4 | MARK | Confirm you have logins for: Netlify (create free account if none), GoDaddy, Microsoft 365 admin. |

**GATE:** ✅ **MET.** Step 1 is done on both projects, which was the only hard gate. Steps 3–4 are quick housekeeping — do them alongside Phase 1.

---

## Phase 1 — New website live · booking still "email Louise"

The Astro website replaces lg-pilates.co.uk. Customers book exactly as they do today: they read the site and email Louise. No visible booking system.

### 1a. Get the site ready (Claude Code sessions in the website project) — ✅ ALL DONE

| # | Who | Step |
|---|-----|------|
| 5 | CLAUDE | ✅ **DONE** (website #36). Netlify adapter added — `astro.config.mjs` uses `@astrojs/netlify`. The site is `output: 'server'` and won't run on Netlify without it. |
| 6 | CLAUDE | ✅ **DONE** (website #35). "How to Book" page live at `/how-to-book-a-pilates-block` — email/enquiry-form instructions, no link to the booking system. Deliberately uses the old WordPress URL for SEO parity. |
| 7 | CLAUDE + MARK | ✅ **DONE.** Website project is in git and pushed to `lg-pilates-website`; `main` current at `761fde2`. `.env` is git-ignored. |
| 7a | CLAUDE | ✅ **DONE** (`da74a59`). `netlify.toml` at the repo root: `command = "npm run build"`, `publish = "dist"`, `NODE_VERSION = "24"`. **The Node pin matters** — `package.json` needs Node ≥22.12 and Netlify won't reliably honour `engines.node`; without the pin the first deploy can fail or silently build on the wrong Node. |

> **Security headers note:** they live in `src/middleware.ts`, **not** in `netlify.toml`'s `[[headers]]` block. `[[headers]]` never applies to server-rendered (SSR function) responses, which is every page on this site. Don't "helpfully" move them (website #43).

**Pre-cutover gate — SEO fields:** every SEO field built in website #41 is currently empty in Sanity (no meta descriptions, no default share image, no custom robots.txt). Nothing is broken — `resolveSeo()` falls back to hardcoded defaults — but whatever is live at cutover is what Google indexes and shows as the search snippet. Tracked as a website-repo issue; **must be closed before step 13.**

### 1b. Deploy to Netlify

| # | Who | Step |
|---|-----|------|
| 8 | MARK (Claude guiding) | Netlify → "Add new site" → "Import an existing project" → GitHub → pick `lg-pilates-website`. `netlify.toml` supplies the build settings; don't override them in the UI. |
| 9 | MARK | Netlify → Site settings → Environment variables. Add **all four** (values from the project's local `.env`), then redeploy: |
| | | • `PUBLIC_SANITY_PROJECT_ID` — missing = no content loads |
| | | • `PUBLIC_SANITY_DATASET` — missing = no content loads |
| | | • `SANITY_API_READ_TOKEN` — missing = drafts/private reads fail |
| | | • `RESEND_API_KEY` — **missing = both enquiry forms silently stop sending** (the `/api/send-enquiry` relay, website #40). Value = the `lg-pilates-website` sending-only key on the existing Resend account. |
| 10 | MARK (Claude guiding) | In Sanity's settings, add the new site's URL to the allowed (CORS) origins so the embedded content editor at `/admin` works. |
| 11 | MARK + LOUISE | Test everything on the temporary `something.netlify.app` address: every page, editing content via `/admin`, and on a phone. |
| 11a | CLAUDE + MARK | **Verify on the preview URL before touching DNS.** Actually submit both enquiry forms and confirm the emails arrive (not junk). Check the security headers are present on a real page response. Run Lighthouse against the Netlify URL — the local #21 run scored 86–92 on performance only because there was no CDN in front of it. |

### 1c. Point the domain (GoDaddy DNS — nameservers do NOT change)

⚠️ **Step 13 is the point of no return.** The moment DNS moves, `lg-pilates.co.uk` stops serving the old WordPress site. Everything up to here is invisible and reversible. Confirm with Mark immediately before running it — never unattended.

| # | Who | Step |
|---|-----|------|
| 12 | MARK | Netlify → Domain settings → add custom domain `lg-pilates.co.uk` (and `www.lg-pilates.co.uk`). |
| 13 | MARK | GoDaddy → DNS for lg-pilates.co.uk → change the `@` **A record** to `75.2.60.5`, and change `www` to a **CNAME** pointing at `your-site-name.netlify.app`. **Change nothing else** — the MX and TXT records are your email. |
| 14 | MARK | Wait for the change to spread (minutes to 48 hours). Then check: `https://lg-pilates.co.uk` and `https://www.lg-pilates.co.uk` both load the new site with a padlock (Netlify issues the SSL certificate automatically). **Send yourself a test email to and from the lg-pilates.co.uk address** to confirm mail is untouched. |
| 14a | MARK | Confirm `book.lg-pilates.co.uk` still resolves to the booking system after the apex cutover (it's a separate record and shouldn't move, but check). |

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
| 19 | CLAUDE | Update `DASHBOARD_URL` in `send-email` (test + prod) from the GitHub Pages address to `book.lg-pilates.co.uk`, then redeploy. Fixes the admin alert email's "View in dashboard" link ([#77](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/77)). |

> **ROLLBACK (Phase 1.5):** nothing customer-facing changed — delete the `book` DNS record if needed and the old GitHub Pages address still works.

---

## Phase 2a — Private pilot · a few trusted customers · bank transfer

Louise hand-picks a small group to book through the system for real. Everyone else keeps emailing her — they never see the booking site.

**GATE before starting:** Phase 0 step 1 done (✅ #43 closed) · Louise's **real bank details entered** in admin Settings ([#3](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/3)) · Louise trained on the dashboard (marking payments received, and the catch-up swaps guide PDF).

| # | Who | Step |
|---|-----|------|
| 20 | MARK approves → CLAUDE | Flip production `payment_mode` from `stripe` to `bank_transfer` (one settings change, done together in a session). Stripe keys stay in place, simply unused. **This must happen before any pilot customer books** — their bookings are real: real classes, real bank transfers, real confirmation emails. |
| 21 | MARK + LOUISE | Do one full test booking yourselves first: book a class, check the confirmation email arrives with the right bank details, pay, and have Louise mark it paid in the dashboard. |
| 22 | LOUISE | Pick a handful of trusted regulars and send them the `book.lg-pilates.co.uk` link directly (email/WhatsApp). Ask them to book their next block through it and say what's confusing. |
| 23 | LOUISE | Process their bookings normally and collect feedback for 1–2 booking cycles. Claude fixes anything the pilot surfaces. |

**GATE:** pilot customers booked and paid successfully, feedback dealt with, Louise comfortable running the dashboard day-to-day.

> **ROLLBACK (Phase 2a):** message the pilot group to go back to emailing Louise. Honour any bookings already made. Nothing public changed — no deploy, no DNS, nothing to undo.

---

## Phase 2b — Full launch · booking system for everyone · bank transfer

| # | Who | Step |
|---|-----|------|
| 24 | MARK (or CLAUDE) | **Point every Book button at the booking system — no code change, no deploy.** In Sanity Studio (`lg-pilates.co.uk/admin`) → Site Settings → set `bookingUrl` to `https://book.lg-pilates.co.uk` and publish. The website was built for this flip (website #35): `BOOK_URL` falls back to the internal How-to-Book page while the field is empty, and `getSiteChrome().bookExternal` makes the links open in a new tab once it's set. Live within seconds. |
| 25 | CLAUDE | Review the "How to Book" page copy so it reads correctly now that the buttons go to the booking system (the block-enquiry form can stay as a fallback — Mark's call at the time). |
| 26 | CLAUDE | Remove the `noindex` tag from the booking site so Google can find it. |

**GATE:** bookings flowing smoothly from the general public for an agreed period (suggest one full block cycle).

> **ROLLBACK (Phase 2b):** clear `siteSettings.bookingUrl` in Sanity and publish — every Book button reverts to the internal email-Louise page instantly. No deploy, no DNS, no database change. Re-hide the booking site if you want it invisible again. Honour existing bookings.

---

## Phase 3 — Stripe card payments on

**GATE before starting:** you and Louise are happy with the bank-transfer experience · the Stripe account is activated for live payments · secret hardening done ([#102](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/102) — Phase 0 step 2; do it before live card money moves).

| # | Who | Step |
|---|-----|------|
| 27 | MARK | In the Stripe dashboard (live mode): copy the **live secret key**, and create a **live webhook endpoint** pointing at the production `stripe-webhook` function — copy its signing secret. |
| 28 | MARK approves → CLAUDE | Swap the production Edge Function secrets from the test key to the live key + live webhook secret ([#30](https://github.com/mjones2420-netizen/lg-pilates-booking/issues/30)), and update the publishable key in Settings to the live `pk_live` one. |
| 29 | MARK approves → CLAUDE | Flip production `payment_mode` back to `stripe`. |
| 30 | MARK | Make one real low-value card booking yourself, then refund it from the dashboard — this proves checkout, the webhook, and the refund path all work live. |

> **ROLLBACK (Phase 3):** flip `payment_mode` back to `bank_transfer` — takes effect instantly, no deploy, no DNS. Refund any card payments already taken (via the dashboard, or manually in Stripe if needed).

---

## Phase 4 — Cancel GoDaddy hosting (only after Phase 1 has been stable 30+ days)

| # | Who | Step |
|---|-----|------|
| 31 | MARK (Claude guiding) | Check GoDaddy DNS for any other records still pointing at the old hosting IP (`160.153.0.161`). If any exist, work out what they were for before proceeding. |
| 32 | MARK | Cancel the **web hosting product only**. **KEEP: the domain registration, the DNS zone, and the Microsoft 365 email subscription.** Afterwards, send/receive a test email to confirm mail still works (it will — different product). |

⚠️ Note: once hosting is cancelled, the Phase-1 rollback (restoring the old site) is gone. Only do this when the new site has clearly stuck.

---

## Quick answers to the original questions

- **How do I get the Astro site onto Netlify?** Steps 5–11a. Steps 5–7a are already done; what's left is importing the repo into Netlify, setting the **four** environment variables, and testing on the preview URL.
- **How do I point the domain?** Steps 12–14a: two record changes in GoDaddy DNS. Nameservers and email records untouched.
- **How do customers get from the website to the booking system?** One Sanity field (`siteSettings.bookingUrl`) at Phase 2b, step 24. No code change, no deploy — and clearing the field is the rollback.
- **What happens to GoDaddy hosting?** Keep paying for it as the rollback until the new site is proven (30+ days), then cancel hosting only — Phase 4.
- **Will GoDaddy email still work?** Yes. It's Microsoft 365, separate from hosting. Keep the domain, DNS, and M365 subscription and nothing changes.
- **Does Stripe need anything removed for bank-transfer mode?** No. `payment_mode = bank_transfer` means Stripe is never contacted. Keys sit unused until Phase 3.
- **What's the rollback?** Every phase has its own box above. The nuclear option at any point before Phase 4: restore the two DNS records → old website and email-Louise booking, exactly as today.
