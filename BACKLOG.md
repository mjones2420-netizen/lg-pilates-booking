# LG Pilates Booking System — Feature & Task Backlog

Last updated: 15 Jun 2026

Single source of truth for outstanding work. This is a flat checklist — no tiers, no priority ordering. Mark reviews and prioritises directly. Update `context.txt` when an item's status changes, and update this file at the end of any session where a new feature/task is identified.

| Status | ID | Feature | Summary |
|---|---|---|---|
| Not started | T1-01 | Fix "Step 1 of 3" label | Booking modal step-1 text still says "of 3" instead of "of 4" |
| Not started | T1-02 | Email notifications — final review | Sessions 1–7 complete; Session 8 (end-to-end production verification, mobile/desktop render check, forwarding to Louise's inbox) outstanding |
| Not started | T1-03 | Bank details | Louise to enter real bank details in admin Settings (no code) |
| Not started | T1-04 | Netlify migration + custom domain | Move to Netlify, private repo, `book.lg-pilates.co.uk` |
| Not started | T1-05 | Fix class time input | Switch Add/Edit Class time fields to `<input type="time">` |
| Not started | T1-06 | Failed post-payment booking — client notification + success screen | Client gets no email and sees false "confirmed" screen if Stripe payment succeeds but booking can't be placed (CLASS_FULL/ALREADY_BOOKED) |
| Not started | T1-07 | Refresh required after booking to book again | After a booking completes and user returns to schedule, "Book Now" no longer works until page is refreshed |
| Not started | T1-08 | Returning client PAR-Q not viewable in admin | Admin "View" for a returning client's booking shows no PAR-Q, even where one should exist |
| Not started | T1-09 | Stripe cancellation/refund sync | Investigate how Stripe handles cancellations and refunds, and how this should sync back to the booking system (bookings/cancellations tables, refund status) |
| Not started | T1-10 | Emergency contact section unclear in booking flow | Test users have updated their own details instead of an emergency contact — section needs clearer labelling/design so it's obvious it's for someone else |
| Not started | T3-04 | Supabase Pro decision | Free tier auto-pauses after inactivity — decide upgrade vs keep-alive ping |
| Not started | T3-06 | Leaked password protection | Enable toggle in Supabase Auth dashboard (no code) |
| Not started | T2-01 | Class register | Printable/on-screen attendance register per block |
| Not started | T2-02 | Waitlist | Connect existing `waitlist` table to booking flow + notifications |
| Not started | T2-03 | Honeypot anti-bot | Hidden field to silently reject bot submissions |
| Not started | T2-04 | Mobile Safari Playwright coverage | Real mobile browser project, not just shrunken desktop viewport |
| Not started | T2-05 | Reports — monthly trend chart | Bookings/revenue bar chart on Reports page |
| Not started | T2-06 | Investigate single-page booking flow | Consider whether the 4-step booking modal should be a single page instead |
| Not started | T3-01 | Demo file updates | 11 demo files outdated since priority/pro-rata/4-step redesign |
| Not started | T3-02 | User guide PDF update | Refresh once email + Netlify are live |
| Not started | T3-03 | File split | Split index.html into separate CSS/JS/HTML files |
| Not started | T3-05 | Swap Supabase anon key format | Migrate to newer publishable key (do with Netlify migration) |
| Not started | T3-07 | Scheduled cleanup of expired pending_bookings | Nightly sweep deleting rows where expires_at < NOW() |
