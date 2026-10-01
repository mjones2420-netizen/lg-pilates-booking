# Waiting list — hands-on walkthrough on production (#107)

Runs on the LIVE booking system. First run: 01 Oct 2026 (#107), all 33 steps passed.
Checklist page with tickboxes: see README.md.

Booking page:
https://mjones2420-netizen.github.io/lg-pilates-booking/

- Real emails send from bookings@lg-pilates.co.uk.
- Payments use Stripe TEST card `4242 4242 4242 4242`, any future expiry, any CVC, any postcode. No real money moves (prod Stripe is still on a test key, #30).
- Steps marked **[SQL]** are database changes on production. Mark pastes the named file from this folder into the Supabase SQL Editor (production project) and runs it.
- Steps marked **[You]** are done by you in a browser. Tick each one and note anything that looks different from the expected result.

## Before you start

Three email addresses you can read. Plus-addressing on your own inbox works:

| Name in script | Address | Used as |
|---|---|---|
| **Email A** | `mjones970+demoa@live.co.uk` | Books the last normal seat |
| **Email B** | `mjones970+demob@live.co.uk` | First on the waiting list, gets the offer |
| **Email C** | `mjones970+democ@live.co.uk` | Second on the waiting list, gets offered then released |

Phone for all three: any 11-digit mobile number, e.g. `07700 900123`.

Use two browser windows:
- **Customer window:** a private/incognito window. You're not signed in there.
- **Louise window:** a normal window, signed in to the dashboard.

---

## Part 0 — Setup [SQL: 01-setup.sql]

**S1.** Creates class **"DEMO – Waiting list test (please ignore)"**: capacity 3, current block running now, with 2 dummy customers already booked and paid. Result: 1 seat left.

**S2.** Creates class **"DEMO – Catch-up source (please ignore)"**: capacity 3, current block, with 1 dummy customer booked. This is only there so Part 4 can move someone into the first demo class for a catch-up.

Dummy customers use addresses at `@lg-pilates-demo.invalid`, a domain that can never receive mail, so nothing reaches a stranger.

---

## Part 1 — Normal booking still works [You, customer window]

| # | Do this | Expect |
|---|---|---|
| 1 | Open the live booking page. Find the DEMO waiting-list class. | Card shows **"1 space left"** and a **Book Current Block** button. |
| 2 | Book it as **Email A**. Pay with the test card. | Booking success screen. Booking confirmation email arrives at Email A. |
| 3 | Refresh the page. | Same card now shows **"Block full"** with a **Full** badge, and an amber **Join Waiting List** button. |

## Part 2 — Joining the waiting list [You, customer window]

| # | Do this | Expect |
|---|---|---|
| 4 | Click **Join Waiting List**. Join as **Email B**. | Success view showing position **#1**. Text: "We've let Louise know…". |
| 5 | Close it and look at the card. | Extra line: **"1 person on the waiting list"**. |
| 6 | Join again as **Email B**. | Message: **"You're already on the waiting list for this block."** |
| 7 | Join as **Email C**. | Position **#2**. Card now says **"2 people on the waiting list"**. |
| 8 | Try to join as **Email A** (who already has a seat). | Message: **"You've already got a place on this block."** |
| 9 | Open the join form, enter phone `123`, click Join. | Phone field goes red and nothing is sent. |

## Part 3 — Louise's view while full [You, Louise window]

| # | Do this | Expect |
|---|---|---|
| 10 | Dashboard → **Waiting lists**. | DEMO block listed. Badges: **No seat free**, **3 / 3 booked**, **2 waiting**. Email B is 1st, Email C is 2nd. |
| 11 | Look at the **Offer space** buttons. | Greyed out, with: "No free seat — the block is full and nobody has cancelled." |

## Part 4 — A seat frees up

| # | Who | Do this | Expect |
|---|---|---|---|
| 12 | **[SQL: 02-cancel-first-dummy.sql]** | Cancels Demo One's booking on the DEMO class (stands in for a real cancellation). | Result row: booked 2, cap 3, wait 2. |
| 13 | You, customer window | Refresh. | Card **still shows "Block full"** and Join Waiting List. The freed seat is reserved for the queue, not the public. |
| 14 | You, Louise window | Refresh Waiting lists. | **1 seat free**, **2 / 3 booked**. Offer space buttons are now active. |
| 15 | You, Louise window | **Catch-up swaps → + Record swap.** Customer: the dummy on the "Catch-up source" class. Target: the DEMO waiting-list class. Pick its **next upcoming date** and note it. (Demo Three is the customer on the Catch-up source class.) Save. | Swap saves. The DEMO class showed spaces, not FULL, because the seat is still free. |

## Part 5 — Louise offers the space [You, Louise window]

| # | Do this | Expect |
|---|---|---|
| 16 | Waiting lists → **Offer space** on **Email B**. Confirm. | Toast: **"Space offered and email sent."** Email B's row reads **Offered [date]**, "Email sent · Today". |
| 17 | Look at the badges and Email C's row. | **No seat free**, **1 held · 1 waiting**. Email C's Offer button is greyed: "a hold is using it. Release the hold first." |
| 18 | Go to the dashboard home (All Bookings). | Red warning: **"1 block has a catch-up swap that will exceed capacity"**, over capacity on the date from step 15. *(Reverse catch-up check.)* |
| 19 | **+ Record swap** again, same customer, target the DEMO class. Open the date list. | Every DEMO date shows **"— FULL"** and can't be picked. The held seat counts as taken. Cancel without saving. *(Forward catch-up check.)* |

## Part 6 — The offer email and link [You, Email B inbox + a NEW private window]

| # | Do this | Expect |
|---|---|---|
| 20 | Check Email B's inbox. | Email **"A space has come up — DEMO – Waiting list test…"** from bookings@lg-pilates.co.uk, with a booking link. |
| 21 | Open the link in a fresh private window. | Booking box opens on the DEMO class with Email B's details filled in. Banner: **"This space is reserved for you"**. Email field can't be edited. The address bar no longer shows `?offer=`. |
| 22 | Close the booking box, then refresh the page. | The booking box reopens with the reserved banner. A closed box or refresh doesn't lose the seat. |
| 23 | Complete the booking with the test card. | Success screen. Booking confirmation email to Email B. |
| 24 | Louise window: refresh Waiting lists. | Email B is gone. **3 / 3 booked**, **1 waiting** (Email C is now 1st). |
| 25 | Click the link in Email B's email again (new private window). | Message: **"That booking link is no longer valid. Please contact Louise."** *(Used link.)* |
| 26 | Copy the link, change the last character to something else, open it. | Same **"no longer valid"** message. *(Forged link.)* |
| 27 | Copy the link, delete the last 5 characters, open it. | **"That booking link is not complete…"** *(Truncated link.)* |

## Part 7 — Release and remove

| # | Who | Do this | Expect |
|---|---|---|---|
| 28 | **[SQL: 03-cancel-second-dummy.sql]** | Cancels Demo Two's booking. | Result row: booked 2, cap 3, wait 1. |
| 29 | You, Louise window | Refresh. Offer space to **Email C**. | "Space offered and email sent." Offer email arrives at Email C. |
| 30 | You, Louise window | **Release hold** on Email C. Confirm. | Toast **"Hold released."** Email C goes back to **Waiting**. Badge: **1 seat free**. |
| 31 | You, new private window | Open the link from Email C's email. | **"That booking link is no longer valid."** Releasing kills the link. |
| 32 | You, Louise window | **Remove** Email C. Confirm. | **"Removed from the waiting list."** DEMO block disappears from Waiting lists (nobody waiting). |
| 33 | You, customer window | Refresh. | DEMO card now shows **"1 space left"** and **Book Current Block**. With the queue empty, the seat goes back on public sale. |

## Part 8 — Teardown [SQL: 04-teardown.sql]

**T1.** Deletes both DEMO classes, the catch-up swap, the dummy customers, and the Email A/B/C customer records. The verify row must show all counts 0. If it says STOPPED, nothing was deleted.

Stripe test payments stay in the Stripe **test** dashboard. They're harmless and move no money.

---

## Not tested by hand, and why

| Check | Why it isn't in this walkthrough | Covered by |
|---|---|---|
| Join limit (10 per hour) | Testing it would lock your own connection out of joining for an hour. | Automated test SEC-16 |
| Server refuses bad phone/email | The browser applies the same rule first, so a normal user can't reach the server check. | Automated tests (WL / SEC) |
| Offer link used with a different email | The email box is locked on an offer link, so it can only be tried with developer tools. | Automated test WL-16 |

## Result

- [ ] All steps matched. Close #107 and #71.
- [ ] Differences found (list step numbers):
