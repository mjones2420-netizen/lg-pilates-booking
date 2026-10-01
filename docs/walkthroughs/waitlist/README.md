# Waiting-list walkthrough kit

A hands-on test of the waiting list on the LIVE booking system, run by Mark as a customer and as Louise.
First run: 01 Oct 2026 (#107), all 33 steps passed.

**Re-run it after any change to the waiting list, catch-up swaps, or the customer messages**, in particular after #116, #118 and #119 ship. Each of those tickets says which steps to update first.

## What's in this folder

| File | What it is |
|---|---|
| `script.md` | The 33-step script with the expected result for each step |
| `01-setup.sql` | Creates the two DEMO classes, dummy customers and bookings. Refuses to run if DEMO classes already exist. |
| `02-cancel-first-dummy.sql` | Step 12: cancels Demo One's booking |
| `03-cancel-second-dummy.sql` | Step 28: cancels Demo Two's booking |
| `04-teardown.sql` | Removes all demo data. Stops without deleting anything if a demo customer has a booking on a real class. |

Checklist page (tickboxes + notes, saves across devices; Claude can read the notes):
https://claude.ai/artifact/3C6n8VyNQUARvj62xFYTwQ. Use **Start a new run** at the bottom to clear the ticks first.

## How to run it

1. **Ask Claude to start a re-run.** Claude checks the script still matches the current screens (anything shipped since the last run) and updates `script.md` and the checklist page if needed.
2. **Setup:** Supabase dashboard → the **production** project (`mrlooyixnlxzcfmvnqme`) → SQL Editor → paste `01-setup.sql` → Run. Expect two DEMO rows: 2/3 and 1/3 booked.
3. **Work through the checklist.** At steps 12 and 28, paste the matching SQL file the same way.
4. **Teardown:** paste `04-teardown.sql`. Every count in the result must be 0.

## What a run costs and touches

- **Production database:** adds then removes demo rows only. Real classes, bookings and customers are untouched.
- **Real emails** from bookings@lg-pilates.co.uk to Mark's `mjones970+demoa/b/c@live.co.uk` addresses, plus Louise's new-booking and waiting-list alerts (~6 emails).
- **Stripe:** test-card payments only, while prod Stripe is on the test key (#30). **After the switch to the live Stripe key, step 2 and step 23 would take real money.** Before re-running after #30, decide how to handle payment: refund straight after, or switch the site to bank-transfer mode for the run.
- **Visible to the public:** the DEMO classes show on the live booking page between setup and teardown.

## Not tested by hand

Join limit (SEC-16), server-side phone/email check, and an offer link used with a different email (WL-16). The automated tests cover these.

## Why Mark runs the SQL, not Claude

Claude Code's safety check blocks Claude from writing to the production database. That fits Mark's rule that production writes are never automatic. Claude dry-runs each file on the test database first.
