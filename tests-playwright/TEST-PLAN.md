# LG Pilates Booking System — Test Plan

**Last updated:** 2 May 2026 (Session 13 — Batch 3 CB tests added)
**Total tests:** 42 (14 smoke + 28 CB)
**Test framework:** Playwright
**Test database:** `lg-pilates-test` (Supabase project `ngzfhamjuviwfwuncrjo`)

---

## Coverage Tracker — Client Booking (CB) scenarios

The 34 Client Booking scenarios from `LG-Pilates-Test-Scenarios.xlsx` are being automated in batches. This tracker shows what's done and what's outstanding.

CB-16b was added in Session 13 to cover the Step 3 → Step 4 advance — a transition not present in the old 3-step Excel scenarios but real in the current 4-step booking flow.

| Status | Scenarios |
|---|---|
| ✅ Automated | CB-01, CB-02, CB-04, CB-05, CB-06, CB-07, CB-08, CB-09, CB-10, CB-11, CB-12, CB-13, CB-14, CB-15, CB-16, CB-16b, CB-17, CB-18, CB-19, CB-20, CB-21, CB-22, CB-23, CB-24, CB-28, CB-29, CB-30, CB-33 (28 of 34) |
| ⬜ Not started | CB-03, CB-25, CB-26, CB-27, CB-31, CB-32 (6 of 34) |

**Batch plan for remaining CB work:**

- ~~**Batch 2 — T&Cs checkbox:** CB-08, CB-09, CB-10, CB-11, CB-13~~ ✅ Done (Session 12)
- ~~**Batch 3 — Step indicator behaviour:** CB-14, CB-15, CB-16, CB-16b, CB-17, CB-18, CB-19, CB-20~~ ✅ Done (Session 13)
- **Batch 4 — Emergency contact + back nav:** CB-25, CB-26, CB-27 (3 tests)
- **Batch 5 — Returning client flows:** CB-03, CB-31, CB-32 (3 tests)

**Other tabs (not started):** Priority Booking (15), Booking Windows (10), Admin Bookings (24), Admin Classes (26), Admin Clients (6), Schedule Display (8), Settings Export (11), Edge Cases (16), Block Warnings (11), Security (9).

Coverage trackers for those tabs will be added here as each area begins automation.

---

## How to use this document

This is a plain-English description of every automated test in the booking system. Each section describes:

- **What the test proves** — the business reason for having it
- **Preconditions** — what must be true in the test database before the test runs
- **Steps the test performs** — the actual actions, in order
- **What the test verifies** — the specific checks it makes to declare pass/fail
- **What a fail would mean** — what would be broken in the real system
- **Fixture role used** — which seeded test data the test relies on (where applicable)

### Watching a test run

In one terminal tab:
```bash
cd ~/dev/lg-pilates-booking
python3 -m http.server 8000
```

In a second tab:
```bash
cd ~/dev/lg-pilates-booking/tests-playwright
npm run test:ui
```

That opens Playwright's UI mode — click any test, hit the Watch button, and step through each action with screenshots.

### Reviewing evidence after a run

After running `npm test`:
```bash
npx playwright show-report
```

Every test now has a full video, trace, and step-by-step screenshots (not just failures — always on, since Session 10).

---

## Fixture roles (the seeded test data)

Every test runs against 9 pre-seeded blocks across 3 classes. Roles are stable, block IDs are not — so tests look up blocks by role, not ID.

| Role | Class | State | Purpose |
|---|---|---|---|
| `mon-past` | Mon Mixed Ability | Completed | Historical record; priority-source for returning customers |
| `mon-current` | Mon Mixed Ability | Active (mid-run) | Bookable "current" block; used for new-client happy paths |
| `mon-upcoming` | Mon Mixed Ability | Upcoming (~13 days out) | Priority-window testing |
| `mon-full` | Mon Mixed Ability | Upcoming, cap=2, fully booked | Capacity-limit testing |
| `wed-past` | Wed Beginner | Completed | Priority-source for Wed customers |
| `wed-upcoming` | Wed Beginner | Upcoming (~8 days out) | Priority-window + manual priority grant |
| `fri-old-past` | Fri Intermediate | Completed (older) | Historical record |
| `fri-recent-past` | Fri Intermediate | Just completed | Priority-source for Fri customers |
| `fri-upcoming` | Fri Intermediate | Upcoming (~3 days out) | Standard-window testing |

**Seeded customers:**
- `returning-one@test.example` — confirmed on Mon past, Mon current, Wed past; manual priority on Wed class
- `returning-two@test.example` — confirmed on Mon past, Fri recent past, Mon full
- `admin-dummy@test.example` — confirmed on Mon full (to fill cap-2)

---

# Smoke 01 — Anonymous reads

*These tests prove that a visitor without an account can see the public data they need (classes, blocks, bank details) but nothing private.*

---

### Smoke 01.1 — Anonymous users can see all 3 classes

**What this proves:** A visitor can see which classes are available without logging in. This is foundational — if this fails, nobody can see anything on the booking page.

**Preconditions:**
- Test database has the 3 seeded classes (Monday Mixed Ability, Wednesday Beginner, Friday Intermediate)

**Steps the test performs:**
1. As an anonymous user, asks the database for all classes

**What the test verifies:**
- The query succeeds without error
- Exactly 3 classes are returned
- The days returned are Monday, Wednesday, and Friday

**What a fail would mean:**
Something broke the anonymous read access to the `classes` table — either the row-level security policy, or the public grant, or the database itself. The public booking page would be empty.

---

### Smoke 01.2 — Anonymous users can see all 9 blocks

**What this proves:** A visitor can see all the scheduled blocks (date ranges) for each class. Without this, the booking page would show classes but no actual dates to book.

**Preconditions:**
- Migration 09 fixture is in place (9 blocks total)
- One block has cap=2 and is fully booked (`mon-full`)

**Steps the test performs:**
1. As an anonymous user, asks the database for all blocks

**What the test verifies:**
- The query succeeds without error
- Exactly 9 blocks are returned
- Exactly one block is at full capacity (the `mon-full` block)
- That full block has cap=2 and booked=2

**What a fail would mean:**
Either the block data is inaccessible (security misconfiguration) or the fixture has drifted (needs a reseed via `npm run seed`).

---

### Smoke 01.3 — Anonymous users can see bank details

**What this proves:** The payment reference screen needs to show bank details to customers. This confirms the settings table is correctly readable.

**Preconditions:**
- Settings table contains `bank_name`, `bank_sort_code`, and `bank_account_no` entries

**Steps the test performs:**
1. As an anonymous user, asks the database for all settings

**What the test verifies:**
- The query succeeds without error
- The three expected setting keys are present: `bank_name`, `bank_sort_code`, `bank_account_no`

**What a fail would mean:**
Bank details wouldn't appear on the payment screen. Customers would have no way to know where to send their payment.

---

# Smoke 02 — Anonymous database functions

*These tests prove the special database functions (RPCs) used by the booking flow work correctly for anonymous users. These bypass standard security rules to do specific, safe operations like looking up a customer or checking priority.*

---

### Smoke 02.1 — Can look up a known customer by email

**What this proves:** The "have you been here before?" email lookup on step 1 of the booking flow works correctly for returning customers.

**Preconditions:**
- `returning-one@test.example` exists in the customers table as a returning customer

**Steps the test performs:**
1. Calls the `lookup_customer` function with `returning-one@test.example`

**What the test verifies:**
- The function returns exactly one customer
- First name is "Returning", last name is "One"
- Customer type is `'returning'`

**What a fail would mean:**
Returning customers wouldn't be recognised when they type their email. They'd be forced through the full 4-step new-client flow instead of the fast 2-step returning flow.

---

### Smoke 02.2 — Lookup returns empty for unknown emails

**What this proves:** The lookup behaves correctly (returns nothing, rather than erroring) when the email isn't in the database — which is the case for every genuinely new customer.

**Preconditions:**
- `nobody@test.example` does NOT exist in the customers table

**Steps the test performs:**
1. Calls the `lookup_customer` function with `nobody@test.example`

**What the test verifies:**
- The function returns an empty list (not an error)

**What a fail would mean:**
The booking flow would crash or misbehave when a new customer entered their email for the first time.

---

### Smoke 02.3 — Priority access check returns TRUE for manual priority grants

**What this proves:** When Louise manually grants someone priority on a specific class (via the admin dashboard), that priority is correctly applied during the booking flow.

**Preconditions:**
- `returning-one@test.example` has a manual priority grant on the Wednesday class
- `wed-upcoming` block exists (currently in priority window)

**Fixture role used:** `wed-upcoming`

**Steps the test performs:**
1. Looks up the `wed-upcoming` block (using the new role-based helper)
2. Calls `check_priority_access` with `returning-one@test.example` and that block's ID

**What the test verifies:**
- The function returns `true`

**What a fail would mean:**
Customers with manual priority grants wouldn't be able to book during the priority window — they'd be forced to wait for standard window like everyone else. Louise's manual priority management would be broken.

---

### Smoke 02.4 — "Has active booking" check returns FALSE when there's no booking

**What this proves:** The duplicate-booking check on step 1 correctly identifies when a customer is NOT already booked on a block, so they can proceed with the booking.

**Preconditions:**
- `returning-one@test.example` has no booking on the `fri-upcoming` block

**Fixture role used:** `fri-upcoming`

**Steps the test performs:**
1. Looks up `returning-one@test.example`'s customer ID
2. Looks up the `fri-upcoming` block (using the role-based helper)
3. Calls `has_active_booking_on_block` with both IDs

**What the test verifies:**
- The function returns `false`

**What a fail would mean:**
Legitimate customers would be blocked from booking blocks they haven't booked yet — they'd get the "already booked" screen in error.

---

# Smoke 03 — Security (RLS / grants enforcement)

*These tests prove that the security rules are actually preventing anonymous users from seeing or modifying private data. This is the defensive flip side of Smoke 01 — it proves the stuff that should be blocked really is blocked.*

---

### Smoke 03.1 — Anonymous users cannot read the bookings table

**What this proves:** Customer booking information is not exposed to random website visitors. Only logged-in admins (Louise) can see bookings.

**Preconditions:**
- Test database has bookings in it (7 seeded bookings from migration 09)

**Steps the test performs:**
1. As an anonymous user, attempts to read the bookings table directly

**What the test verifies:**
- Either the query fails with an error, OR returns zero rows (both are acceptable "blocked" outcomes under Supabase's security model)
- NOT all 7 seeded bookings are returned (which would be a catastrophic data leak)

**What a fail would mean:**
Every customer's personal booking history would be exposed publicly. A serious privacy breach and likely GDPR violation.

---

### Smoke 03.2 — Anonymous users cannot read the customers table

**What this proves:** Customer contact details (names, emails, phone numbers) are not exposed to website visitors.

**Preconditions:**
- Test database has customers in it (3 seeded customers)

**Steps the test performs:**
1. As an anonymous user, attempts to read the customers table directly

**What the test verifies:**
- The query either errors or returns zero rows
- NOT all 3 seeded customers are returned

**What a fail would mean:**
Customer personal data would be publicly accessible. Serious privacy breach.

---

### Smoke 03.3 — Anonymous users cannot read the cancellations table

**What this proves:** Cancellation records (which contain full customer details for audit purposes) are private to Louise.

**Preconditions:**
- Cancellations table exists and is empty (fixture doesn't seed cancellations)

**Steps the test performs:**
1. As an anonymous user, attempts to read the cancellations table directly

**What the test verifies:**
- The query either errors or returns zero rows

**What a fail would mean:**
Historical cancellation records (which preserve customer details even after the customer record is deleted) would be exposed.

---

### Smoke 03.4 — Anonymous users cannot directly insert bookings

**What this proves:** A malicious user can't bypass the booking flow by inserting fake bookings directly into the database. All bookings must go through the `book_if_available` function which enforces capacity, duplicate checks, and priority rules.

**Preconditions:** None specific.

**Steps the test performs:**
1. As an anonymous user, attempts to insert a fake booking row directly into the bookings table

**What the test verifies:**
- The insert fails with a permission error

**What a fail would mean:**
An attacker could flood classes with fake bookings, bypass the capacity limit, or skip the PAR-Q requirement. The entire booking flow integrity would collapse.

---

# Smoke 04 — UI loads correctly

*These tests prove the booking page itself loads in a browser and the critical visible elements are present. The previous Smoke tests hit the database directly; these actually render the page.*

---

### Smoke 04.1 — Page loads and shows at least one class card

**What this proves:** The booking page actually loads without JavaScript errors and renders the class cards. Basic "is the site alive?" check.

**Preconditions:**
- Local server running at `http://localhost:8000`
- `index.html` includes the test-mode env switch
- Test database has at least one class

**Steps the test performs:**
1. Opens the booking page at `/?env=test`
2. Waits for a class card to become visible

**What the test verifies:**
- At least one class card is rendered

**What a fail would mean:**
The page has broken at a fundamental level — JavaScript error, missing connection to the database, or the local server isn't running.

---

### Smoke 04.2 — Page shows all three seeded class days

**What this proves:** All three classes (Monday, Wednesday, Friday) render correctly — not just one.

**Preconditions:**
- Test database has 3 classes with days Monday, Wednesday, Friday

**Steps the test performs:**
1. Opens the booking page
2. Searches the page content for each of "Monday", "Wednesday", "Friday"

**What the test verifies:**
- All three day names are visible on the page

**What a fail would mean:**
Some classes aren't rendering. Customers wouldn't see every class they could book.

---

### Smoke 04.3 — TEST MODE banner is visible

**What this proves:** When the site is loaded with `?env=test`, the test-mode banner is visible. This is a safety guardrail — every CB test relies on this banner being visible before touching the database.

**Preconditions:**
- URL includes `?env=test` query parameter
- `index.html` includes the banner element and env-switch logic

**Steps the test performs:**
1. Opens the booking page at `/?env=test`
2. Looks for the element `#test-mode-banner.on`

**What the test verifies:**
- The banner element is visible

**What a fail would mean:**
The test-mode switch is broken. Subsequent CB tests would either write to PRODUCTION (serious) or fail immediately (the correct protective behaviour).

---

# CB-01 — New client happy path

*These are the "real" tests — they don't just query the database, they actually simulate a customer going through the booking flow as a real human would, clicking buttons and typing in forms. All 7 tests in this file use the Monday current block as their target.*

---

### CB-01 / CB-12 — New customer completes full 4-step booking

**What this proves:** A brand-new customer can book a class end-to-end: click "Book", fill in all 4 steps (details, medical, emergency, payment), and have their booking correctly land in the database.

**Preconditions:**
- Monday current block is bookable (not full, not cancelled, not locked)
- The email used is unique (test generates a timestamped email)

**Fixture role used:** `mon-current`

**Steps the test performs:**
1. Opens the booking page
2. Verifies the TEST MODE banner is on (safety check)
3. Clicks "Book" on the Monday current block
4. Step 1: Types first name "Alice", last name "Testington", a unique email, and phone "07700900100"
5. Proceeds to step 2a
6. Step 2a: Ticks "No" on all 12 medical questions and types print name
7. Step 2b: Types emergency contact name, relationship, and phone
8. Step 3: Ticks the T&Cs checkbox and clicks "Reserve my spot"
9. Waits for the success screen

**What the test verifies:**
- The success screen appears with "Spot Reserved" text
- The customer now exists in the database with first name "Alice" and `customer_type='new'`

**What a fail would mean:**
The new-customer booking flow is broken. This is the most common path a real customer will take, so a fail here would block most new bookings.

---

### CB-21 — Step indicator shows 4 pips for new clients

**What this proves:** New clients see a 4-step progress indicator (Your details → Medical → Emergency → Payment), not the 2-step returning-client version.

**Preconditions:**
- Monday current block is bookable

**Fixture role used:** `mon-current`

**Steps the test performs:**
1. Clicks "Book" on Monday current
2. On step 1, checks all 4 step indicators (pips) are visible
3. Checks pip 1 is marked "active", and the labels read "Your details", "Medical", "Emergency contact", "Payment"
4. Fills in step 1 and advances
5. Checks the step 2 header says "Step 2 of 4" and "Medical Questions"
6. Checks pip 2 is now active and pip 1 is marked done

**What the test verifies:**
- All 4 pips render on step 1
- Labels match expected wording
- Pip states update correctly as the customer advances

**What a fail would mean:**
The step indicator is wrong for new clients. Could confuse customers about how much is left to do.

---

### CB-28 — Payment step shows "Step 4 of 4"

**What this proves:** When a new client reaches the final payment step, the header clearly indicates they're on the last step.

**Preconditions:**
- Monday current block is bookable

**Fixture role used:** `mon-current`

**Steps the test performs:**
1. Completes steps 1, 2a, and 2b of the booking flow for a new customer
2. Arrives at step 3 (payment)
3. Checks the step label reads "Step 4 of 4" and "Payment"
4. Checks pip 4 is now active, pips 1–3 are marked done

**What the test verifies:**
- Step 3 displays as "Step 4 of 4" in the UI
- The pip state reflects 3 done, 1 active

**What a fail would mean:**
New clients arriving at payment wouldn't know they're on the final step — might abandon the booking thinking there's more to do.

---

### CB-04 — Modal subtitle shows correct block details

**What this proves:** When a customer opens the booking modal, the subtitle shows the correct day, location, and time for the block they selected — not some other block.

**Preconditions:**
- Wednesday class exists (Beginner, Potting Shed, Guiseley, 7:00pm)
- Wednesday current or next block is bookable

**Fixture role used:** `wed-upcoming`

**Steps the test performs:**
1. Clicks "Book" on the Wednesday block
2. Reads the modal subtitle (`#m-sub`) and title (`#m-name`)

**What the test verifies:**
- Subtitle contains "Wednesday", "Guiseley", and "7:00pm"
- Title contains "Beginner"

**What a fail would mean:**
The modal shows wrong class details — a customer might accidentally book the wrong class thinking they're booking a different one.

---

### CB-05 — Payment reference is personalised

**What this proves:** On the payment step, the bank transfer reference shown to the customer is personalised with their name and class day — so Louise can identify who the payment is from when it arrives.

**Preconditions:**
- Monday current block is bookable

**Fixture role used:** `mon-current`

**Steps the test performs:**
1. Fills in steps 1, 2a, 2b for a new customer with first name "Reffy", last name "McReference"
2. Arrives at step 3 (payment)
3. Reads the payment reference text and bank detail fields

**What the test verifies:**
- Reference contains "Reffy", "McReference", and "Monday"
- Bank name, sort code, and account number fields are all populated (not empty)

**What a fail would mean:**
Customers would be given a generic reference (like "BOOKING123") and Louise wouldn't be able to match payments to customers — creating admin chaos.

---

### CB-07 — Capacity bar updates after booking

**What this proves:** After a booking completes, the class capacity counter ("3 of 12" → "4 of 12") updates on the booking page. This proves the database trigger that keeps `blocks.booked` in sync with the actual bookings is firing correctly.

**Preconditions:**
- Monday current block has seats available
- Monday card displays "N of M" capacity format

**Fixture role used:** `mon-current`

**Steps the test performs:**
1. Reads the Monday card's capacity count before booking (e.g. "3 of 12")
2. Completes a full new-client booking for the Monday block
3. Reloads the booking page
4. Reads the Monday card's capacity count again

**What the test verifies:**
- The count has increased by exactly 1

**What a fail would mean:**
Either the database trigger is broken (capacity counts drift from reality), or the page isn't refreshing block data correctly. Could lead to over-booking if the count stays stale.

---

### CB-33 — PAR-Q record created for new client booking

**What this proves:** When a new client completes a booking, their health questionnaire (PAR-Q) is correctly saved alongside the booking. This is a compliance-critical check — Louise is legally required to have signed PAR-Qs for every new client.

**Preconditions:**
- Monday current block is bookable
- Email is unique

**Fixture role used:** `mon-current`

**Steps the test performs:**
1. Completes full booking for a new customer named "Daria Daterson"
2. Looks up the customer in the database

**What the test verifies:**
- The customer exists with `customer_type='new'`
- (The customer_type being set to `'new'` only happens after the PAR-Q insert succeeds — same code path, so this indirectly verifies PAR-Q creation)

**What a fail would mean:**
New clients would be booking without their health questionnaire being saved. Compliance risk for Louise and a safety concern for classes.

> **Note (Session 11):** CB-33 currently verifies PAR-Q creation *indirectly* via the `customer_type='new'` check. A direct check against the `parq` table would be stronger — but anon can't SELECT from `parq` (by design), so this needs an authenticated test client first. Earmarked for when admin-login helpers are added.

---

### CB-02 — PAR-Q "Yes" answer reveals the details textarea

**What this proves:** When a new client answers "Yes" to any of the 12 medical questions, the "Please provide details" textarea appears so they can explain. Without this, answering Yes leaves them with no way to add context.

**Preconditions:**
- Monday current block is bookable

**Fixture role used:** `mon-current`

**Steps the test performs:**
1. Opens the booking modal as a new client and advances to Step 2 (Medical)
2. Checks that the details textarea is initially hidden
3. Answers "Yes" to question 5 (joint/movement problems)

**What the test verifies:**
- The `#parq-yes-section` container is hidden on arrival at Step 2
- After a single Yes answer, `#parq-yes-section` becomes visible
- The `#b-health-conditions` textarea inside it is visible and reachable

**What a fail would mean:**
A new client answers "Yes" to a health question and has no way to add detail — they'd be forced to either answer "No" (lie on their PAR-Q) or abandon the booking entirely. Compliance and UX issue.

---

### CB-06 — Required fields validation on Step 1

**What this proves:** Clicking Continue on Step 1 with nothing filled in doesn't advance the form and surfaces validation errors for the user. Without this, someone could skip the whole of Step 1 and proceed with an empty customer record.

**Preconditions:**
- Monday current block is bookable

**Fixture role used:** `mon-current`

**Steps the test performs:**
1. Opens the booking modal
2. Clicks Continue without entering any details

**What the test verifies:**
- The `#validation-toast` appears with errors for all four required fields (first name, last name, email, phone)
- Step 1 remains visible
- Step 2 (Medical) does NOT become visible

**What a fail would mean:**
Empty customer rows could be created in the database, or the booking flow could advance into Step 2 with no client details — leading to data integrity problems and confused admin views.

---

### CB-22 — Medical step layout

**What this proves:** When a new client reaches Step 2 (Medical), they see the expected form structure: age field at the top, 12 Yes/No questions with "No" pre-selected, and the declaration section at the bottom. This guards against the form being accidentally restructured in a way that hides critical fields.

**Preconditions:**
- Monday current block is bookable

**Fixture role used:** `mon-current`

**Steps the test performs:**
1. Advances a new client to Step 2
2. Inspects each element in turn

**What the test verifies:**
- The age input is visible and empty
- All 12 PAR-Q questions (q1–q12) are present, each with both Yes and No radio options
- The "No" radio is pre-checked for each question
- The print name input and declaration checkbox are visible at the bottom
- The declaration checkbox is un-checked by default
- The Continue button is visible

**What a fail would mean:**
One or more medical questions or the declaration would be missing or rearranged, leading to incomplete PAR-Qs or a booking flow that accidentally skips Step 2.

---

### CB-23 — Medical step age validation

**What this proves:** The age field enforces two rules: it must be filled, and the customer must be at least 18. Under-18s can't book Pilates classes (insurance requirement).

**Preconditions:**
- Monday current block is bookable

**Fixture role used:** `mon-current`

**Steps the test performs:**
*Covered by two `test()` blocks in the same spec:*

**Sub-case A — Blank age:**
1. Advances a new client to Step 2
2. Fills the declaration and print name but leaves age blank
3. Clicks Continue

**Sub-case B — Age under 18:**
1. Advances a new client to Step 2
2. Fills age = "17", plus declaration and print name
3. Clicks Continue

**What the test verifies:**
- Sub-case A: `#validation-toast` shows "Age is required" and Step 2 stays visible
- Sub-case B: `#validation-toast` shows "at least 18" and Step 2 stays visible
- Neither case advances to Step 2b (Emergency contact) or Step 3 (Payment)

**What a fail would mean:**
An under-18 could book a class, creating an insurance/liability issue. Or a customer could sidestep the age field entirely, leaving a mandatory safety field blank on their PAR-Q.

---

### CB-24 — Declaration must be ticked before advancing

**What this proves:** The declaration checkbox is mandatory — a new client cannot continue past Step 2 without agreeing to the PAR-Q declaration. This is a legal/safety requirement (acknowledgement of responsibility).

**Preconditions:**
- Monday current block is bookable

**Fixture role used:** `mon-current`

**Steps the test performs:**
1. Advances a new client to Step 2
2. Fills age, all-No answers, and print name
3. Leaves the `#b-declaration` checkbox un-ticked
4. Clicks Continue

**What the test verifies:**
- `#validation-toast` shows "agree to the declaration" error text
- Step 2 remains visible
- Step 2b (Emergency contact) and Step 3 (Payment) both remain hidden

**What a fail would mean:**
Clients could bypass the legal declaration, meaning Louise would not have a signed acknowledgement of risk on file. Real liability risk in the event of an incident.

---

### CB-29 — Sticky header stays visible while scrolling

**What this proves:** When the medical form is scrolled, the modal header (class name, venue, step progress pips) stays pinned at the top of the modal — it doesn't scroll away. Without this, on smaller screens the user loses track of which class they're booking and which step they're on.

**Preconditions:**
- Monday current block is bookable

**Fixture role used:** `mon-current`

**Steps the test performs:**
1. Advances a new client to Step 2
2. Shrinks the viewport to 480×700 so the medical form exceeds the visible area
3. Records the Y position of the `.mhead` element
4. Scrolls the `.modal` element to the bottom
5. Re-checks the `.mhead` position

**What the test verifies:**
- `.mhead` remains visible after scroll
- `.mhead` Y position has NOT moved off-screen (within 5px of its starting position)
- The declaration checkbox at the bottom of the form is now in the viewport

**What a fail would mean:**
The modal header would scroll out of view as the form scrolls — users would lose context of which class/step they're on. On mobile, this is a major UX regression.

> **Follow-up:** This test runs in a shrunken desktop viewport as a proxy for mobile. A dedicated Mobile Safari Playwright project would give true mobile coverage — tracked in context.txt as a follow-up.

---

### CB-30 — Medical form is fully scrollable end-to-end

**What this proves:** On narrow viewports, every part of the medical form is reachable — all 12 questions, the declaration, and the Continue button. If any of these are cut off below the viewport with no scroll path to them, the form becomes unusable on mobile.

**Preconditions:**
- Monday current block is bookable

**Fixture role used:** `mon-current`

**Steps the test performs:**
1. Shrinks the viewport to 480×700 before opening the modal
2. Advances a new client to Step 2
3. Uses Playwright's `scrollIntoViewIfNeeded()` to reach question 12, the declaration, and the Continue button
4. Confirms each is in the viewport after scrolling

**What the test verifies:**
- The age field (top) is visible immediately
- Question 12 (near bottom) is reachable by scrolling
- The declaration checkbox is reachable
- The Continue button is reachable

**What a fail would mean:**
Mobile users might be physically unable to complete the PAR-Q — they could answer the first few questions but not reach the Continue button. Silent failure mode where new bookings would just stop working on mobile.

> **Follow-up:** Like CB-29, this uses a shrunken desktop viewport. True mobile coverage is a separate item in context.txt.

---

### CB-08 — Reserve button is disabled by default at Step 3

**What this proves:** When a new client lands on Step 3 (the payment screen), the Reserve button starts disabled and the hint text is visible. The customer cannot accidentally submit a booking before agreeing to the Terms & Conditions.

**Preconditions:**
- Monday current block is bookable

**Fixture role used:** `mon-current`

**Steps the test performs:**
1. Drives a new client through Step 1, Step 2 (medical), and Step 2b (emergency contact) to reach Step 3
2. Inspects the initial state of the T&Cs checkbox, the Reserve button, and the hint text

**What the test verifies:**
- The `#tcs-agree` checkbox is unticked
- The `#reserve-btn` button is disabled
- The `#tcs-hint` text is visible and contains the "Please agree to the Terms" prompt

**What a fail would mean:**
A customer could submit a booking without agreeing to the T&Cs. Louise would have no record of consent, creating a legal/compliance issue if a dispute arose.

---

### CB-09 — Ticking T&Cs enables the Reserve button

**What this proves:** Ticking the T&Cs checkbox flips the Reserve button to enabled and hides the hint text. This is the positive case of the T&Cs gate — once the customer agrees, they can proceed.

**Preconditions:**
- Monday current block is bookable

**Fixture role used:** `mon-current`

**Steps the test performs:**
1. Drives a new client to Step 3
2. Confirms the starting disabled state
3. Ticks the `#tcs-agree` checkbox

**What the test verifies:**
- The checkbox is now ticked
- The Reserve button is enabled
- The hint text is hidden

**What a fail would mean:**
The customer ticks the T&Cs but the Reserve button stays disabled — they get stuck on the payment screen with no way to complete the booking.

---

### CB-10 — Unticking T&Cs disables the button again

**What this proves:** The T&Cs gate works in both directions. If a customer ticks the box and then unticks it (intentionally or by accident), the Reserve button returns to disabled and the hint text reappears. The gate doesn't just check the box once — it monitors continuously.

**Preconditions:**
- Monday current block is bookable

**Fixture role used:** `mon-current`

**Steps the test performs:**
1. Drives a new client to Step 3
2. Ticks the T&Cs checkbox and confirms the button is enabled
3. Unticks the checkbox

**What the test verifies:**
- The checkbox is now unticked
- The Reserve button is disabled again
- The hint text is visible again

**What a fail would mean:**
A customer could untick the T&Cs after ticking them and still submit the booking. The "I agree" record would be inconsistent with what they actually clicked.

---

### CB-11 — T&Cs checkbox resets on Back-and-Return navigation

**What this proves:** If a customer ticks the T&Cs, clicks Back to amend their emergency contact, then clicks Continue to return to Step 3, the checkbox is unticked and the Reserve button is disabled. The customer must explicitly re-agree — agreement does not persist across navigation.

This guards against a customer agreeing once early in the flow, then editing their details, and submitting under terms they may have read days earlier.

**Preconditions:**
- Monday current block is bookable

**Fixture role used:** `mon-current`

**Steps the test performs:**
1. Drives a new client to Step 3
2. Ticks the T&Cs checkbox to confirm we're starting from a "ticked" state
3. Clicks the Back button on Step 3, landing on Step 2b (Emergency Contact)
4. Clicks Continue from Step 2b to return to Step 3

**What the test verifies:**
- After returning, the `#tcs-agree` checkbox is unticked
- The Reserve button is disabled
- The hint text is visible

**What a fail would mean:**
A customer who navigates back and forth could submit a booking with stale T&Cs agreement state — undermining the audit trail of consent.

---

### CB-13 — Returning client completes booking after agreeing to T&Cs

**What this proves:** A returning customer can complete an end-to-end booking. They enter their email on Step 1, the app recognises them, skips both medical and emergency contact steps, lands on Step 3, ticks the T&Cs, clicks Reserve, and the booking is saved.

**Preconditions:**
- The Friday upcoming block (`fri-upcoming`) is bookable
- The customer `returning-two@test.example` exists in the fixture
- That customer has no existing active booking on `fri-upcoming` (otherwise the already-booked detection trips)

**Fixture role used:** `fri-upcoming` + the seeded customer `returning-two@test.example`

**Steps the test performs:**
1. Looks up the customer via the `lookup_customer` RPC
2. Pre-flight check: calls `has_active_booking_on_block` to confirm no existing booking — if one exists, the test is **skipped** (not failed) with a "run npm run seed" hint. This means the suite stays green when CB-13 has been run twice without reseeding in between.
3. Opens the Friday booking modal and fills Step 1 with the returning customer's email
4. Waits for the app to detect the returning customer and jump straight to Step 3
5. Verifies the Step 3 default state (checkbox unticked, button disabled)
6. Ticks the T&Cs and clicks Reserve
7. Waits for the success view to appear
8. Calls `has_active_booking_on_block` again to confirm the booking now exists

**What the test verifies:**
- The customer is found and the lookup RPC works
- The pre-booking RPC returns `false` (no existing booking)
- Step 3 appears within 8 seconds (allowing for the 2.5s setTimeout in `goStep2()`)
- The success view is shown after Reserve is clicked
- The post-booking RPC returns `true` (booking now exists)

**What a fail would mean:**
The returning-customer fast track is broken. Existing customers would either be forced through the full new-client flow (a major UX regression) or be unable to complete a booking at all.

> **Re-run note:** After a successful run, `returning-two@test.example` will have a booking on `fri-upcoming`. Re-running without reseeding causes CB-13 to be **skipped** (with a clear reason in the test report) rather than failing — so the suite stays green. Run `npm run seed` between full runs to reset and have CB-13 actually execute.

> **DB verification approach:** This test uses RPC functions (`lookup_customer`, `has_active_booking_on_block`) instead of direct SELECTs against `customers` or `bookings` — those tables are not readable by anon by design. The RPCs are the same channels the live app uses to read customer state.

---

# CB Batch 3 — Step indicator behaviour

*These tests focus on the 4-pip step indicator at the top of the booking modal. They verify the visual state (which pip is active, which is done, which is dim) at each transition and after navigation. The existing CB-21 and CB-28 cover some of the same ground bundled with other checks; the Batch 3 tests are atomic — each isolates one specific transition so failures point precisely at what broke.*

---

### CB-14 — Step indicator: shows correct state on modal open

**What this proves:** When a new visitor opens the booking modal, the step indicator starts in a clean initial state — pip 1 active, the other 3 dim, no ticks anywhere, all four labels reading correctly. This is the foundation for every other step-indicator behaviour.

**Preconditions:**
- Monday current block is bookable

**Fixture role used:** `mon-current`

**Steps the test performs:**
1. Opens the booking modal on the Monday class
2. Inspects the step indicator without entering any data

**What the test verifies:**
- All 4 pip wrappers and 3 connectors are visible
- Pip 1 has `.active`, shows "1", and pip-lbl-1 reads "Your details"
- Pips 2, 3, 4 are dim (no `.active`, no `.done`) and show their numbers
- Pip labels read "Medical", "Emergency contact", "Payment"
- No connector is `.done`

**What a fail would mean:**
The step indicator opens in a broken state — could mislead the customer about where they are in the booking flow.

---

### CB-15 — Step 1 ticks on advance to Step 2 (new client)

**What this proves:** When a new client fills Step 1 and clicks Continue, the indicator updates correctly: pip 1 changes from "1" to a tick, pip 2 becomes active, and the connector between them lights up. The modal also auto-scrolls to the top so the customer sees the new step header.

**Preconditions:**
- Monday current block is bookable

**Fixture role used:** `mon-current`

**Steps the test performs:**
1. Opens the booking modal on Monday
2. Fills Step 1 with a unique fresh email and clicks Continue
3. Waits for Step 2 (Medical) to appear

**What the test verifies:**
- Pip 1 has `.done`, no `.active`, and shows the tick character (✓)
- Pip 2 has `.active`, no `.done`, and still shows "2"
- Connector 1 has `.done`
- Pips 3 and 4 remain dim
- Modal `scrollTop` returns to 0 within 2 seconds (smooth scroll)

**What a fail would mean:**
The customer can't tell they've made progress. The pip layout looks "stuck on step 1" even though they've moved on.

---

### CB-16 — Step 2 ticks on advance to Step 3 (Emergency contact)

**What this proves:** A new client completing the medical step advances to Emergency contact, and the indicator reflects this — pip 2 now ticks, pip 3 becomes active. Steps 1 and 2 stay marked done with their connectors lit.

**Preconditions:**
- Monday current block is bookable

**Fixture role used:** `mon-current`

**Steps the test performs:**
1. Opens the booking modal and completes Step 1
2. Fills the medical form with all-clear answers (age 34, all No to PAR-Q, declaration ticked)
3. Clicks Continue to advance to Step 3 (Emergency contact)

**What the test verifies:**
- Pips 1 and 2 both `.done`, both showing ticks
- Pip 3 is `.active`, shows "3"
- Pip 4 still dim
- Connectors 1 and 2 `.done`; connector 3 not
- Modal scrolled to top

**What a fail would mean:**
The Medical→Emergency transition doesn't update the indicator. Customer sees stale state showing them stuck at Medical.

> **Note on Excel scenarios:** The Excel CB-16 was written for an old 3-step flow ("advance to Payment"). The current 4-step flow advances Medical → Emergency contact, which is what this test verifies. The Excel was updated in Session 13 to match.

---

### CB-16b — Step 3 ticks on advance to Step 4 (Payment)

**What this proves:** A new client completing the emergency contact step advances to Payment, with pip 3 ticking and pip 4 becoming active. All three connectors are now lit. This is the final forward transition before booking confirmation.

**Preconditions:**
- Monday current block is bookable

**Fixture role used:** `mon-current`

**Steps the test performs:**
1. Drives a new client through Step 1, Step 2 (Medical) and Step 3 (Emergency contact)
2. Clicks Continue from Emergency contact to reach Step 4 (Payment)

**What the test verifies:**
- Pips 1, 2, and 3 all `.done`, all showing ticks
- Pip 4 is `.active`, shows "4"
- All three connectors are `.done`
- Modal scrolled to top

**What a fail would mean:**
The customer reaches Payment but the indicator doesn't reflect that — looks like they still have a step to go.

> **Note:** CB-16b was added in Session 13 to fill a gap. The Excel scenarios skipped the Step 3 → Step 4 transition because they were written for a 3-step flow. CB-16b makes this transition official scenario coverage.

---

### CB-17 — Back from Payment reactivates Step 3 (Emergency contact)

**What this proves:** New clients can navigate backwards from Payment without losing earlier progress. Pip 4 dims, pip 3 reactivates, but pips 1 and 2 keep their ticks — the customer hasn't lost any earlier work, just stepped back.

**Preconditions:**
- Monday current block is bookable

**Fixture role used:** `mon-current`

**Steps the test performs:**
1. Drives a new client all the way to Step 4 (Payment)
2. Clicks the Back button

**What the test verifies:**
- Step 3 (Emergency contact) is visible again
- Pips 1 and 2 retain `.done` and ticks
- Pip 3 reactivates (`.active`, shows "3")
- Pip 4 dims (no `.active`, no `.done`)
- Connectors 1 and 2 stay `.done`; connector 3 is no longer `.done`
- Modal scrolled to top

**What a fail would mean:**
Backwards navigation corrupts the indicator state — customer sees something visually inconsistent (e.g. pip 4 stuck active, or earlier ticks lost).

---

### CB-18 — Returning client shows 2-step layout

**What this proves:** When a returning customer enters their email at Step 1, the system recognises them and switches to a streamlined 2-step layout. Pip wrappers 3 and 4 disappear, the label on pip 2 changes to "Payment", and the customer skips straight from Your details to Payment.

**Preconditions:**
- Wednesday upcoming block is open for booking
- `returning-two@test.example` exists as a returning customer (no Wed booking)

**Fixture role used:** `wed-upcoming`

**Steps the test performs:**
1. Opens the booking modal on Wednesday
2. Fills Step 1 with `returning-two@test.example` and clicks Continue
3. Waits for Step 3 (Payment) to be visible (returning-client fast track)

**What the test verifies:**
- Pip 1 has `.done` and shows a tick
- Pip 2 has `.active`, shows "2", and pip-lbl-2 reads "Payment" (not "Medical")
- Pip wrappers 3 and 4 are hidden (display:none)
- Connectors 2 and 3 are hidden
- Connector 1 is visible and `.done`

**What a fail would mean:**
The returning-customer fast track is broken visually. Either they see all 4 pips (looks like the new-client flow) or pip 2's label still reads "Medical" — both confusing.

---

### CB-19 — Returning client Back from Payment reactivates Step 1

**What this proves:** Returning customers can also step backwards from Payment, returning to Step 1 with the indicator updating correctly. Pip 1 reactivates, pip 2 dims, but the 2-step layout (with pip wrappers 3 and 4 hidden, pip-lbl-2 still reading "Payment") stays in place.

**Preconditions:**
- Wednesday upcoming block is open for booking
- `returning-two@test.example` exists as a returning customer (no Wed booking)

**Fixture role used:** `wed-upcoming`

**Steps the test performs:**
1. Opens the booking modal on Wednesday and completes Step 1 as returning-two
2. Lands on Payment in 2-step layout
3. Clicks Back

**What the test verifies:**
- Step 1 (Your details) is visible again
- Pip 1 reactivates (`.active`, shows "1")
- Pip 2 dims (no `.active`, no `.done`) but its label still reads "Payment"
- Pip wrappers 3 and 4 still hidden, connectors 2 and 3 still hidden
- Connector 1 is no longer `.done`
- Modal scrolled to top

**What a fail would mean:**
Backwards navigation in the 2-step flow either loses the returning-client transformation (showing all 4 pips again) or leaves stale state (e.g. pip 2 stuck active).

---

### CB-20 — Modal close & reopen resets state

**What this proves:** Closing and reopening the booking modal returns it to a clean initial state. No leftover ticks, no leftover "Payment" label on pip 2, the full 4-step layout is back. This guards against state leaking between modal sessions.

**Preconditions:**
- Monday current block is bookable

**Fixture role used:** `mon-current`

**Steps the test performs:**
1. Opens the modal and advances to Step 2 so pip 1 is `.done`
2. Closes the modal via the "x" button
3. Reopens the modal on the same class
4. Inspects the indicator state

**What the test verifies:**
- Pip 1 is `.active`, shows "1" (not a tick)
- Pips 2, 3, 4 are all dim and show their numbers
- Pip 2 label reads "Medical" (the new-client default — confirms full reset, not the "Payment" returning-client label)
- All 4 pip wrappers and 3 connectors are visible (4-step layout)
- No connectors are `.done`

**What a fail would mean:**
Modal state persists across open/close cycles. A returning customer's "Payment" label could stick around for a new visitor, or earlier ticks could appear stale — confusing the next user.

---

# Appendix — What's NOT yet covered

The Coverage Tracker at the top of this document is the authoritative view of outstanding work. The summary below describes the main areas remaining.

### Client Booking (CB) — 6 scenarios remaining
See the Coverage Tracker above. Grouped into 2 remaining batches by shared scaffold (emergency contact + returning-client flows).

### Admin bookings (AB)
- Louise adding/editing/cancelling bookings
- Missing PAR-Q banner behaviour
- Cancellation and refund flow
- CSV export of client data

### Priority booking (PB)
- Previous-block priority eligibility
- Manual per-class priority management
- Priority window timing rules

### Infrastructure
- GitHub Actions CI (run tests automatically on every code push)
- Mobile Safari project for proper mobile coverage (currently CB-29/CB-30 use shrunken desktop viewports as a proxy)

---

## Glossary

- **Anon / anonymous user** — A website visitor who isn't logged in. The vast majority of users.
- **Authenticated user** — Louise, logged into the admin dashboard.
- **Block** — A specific date range of a class (e.g. "Monday Mixed Ability, 2 Feb – 9 Mar, 6 weeks").
- **CB / AB / PB** — Naming convention for test scenarios: Client Booking, Admin Booking, Priority Booking.
- **Fixture** — The seed data loaded into the test database at the start of a test run.
- **PAR-Q** — Physical Activity Readiness Questionnaire. The medical/emergency form new clients must complete.
- **RLS** — Row Level Security. The Postgres mechanism that controls which rows each user can see.
- **RPC** — Remote Procedure Call. A database function that runs with elevated permissions on behalf of a user.
- **Smoke test** — A fast, low-level test that checks basic infrastructure (can we read data? are permissions correct? does the page load?). These run quickly and fail fast if something foundational is wrong.
- **Trace** — Playwright's forensic recording of a test run, viewable with `npx playwright show-trace`.
