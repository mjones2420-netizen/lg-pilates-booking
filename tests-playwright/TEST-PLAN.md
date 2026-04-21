# LG Pilates Booking System — Test Plan

**Last updated:** 21 April 2026 (Session 10)
**Total tests:** 21 (all passing)
**Test framework:** Playwright
**Test database:** `lg-pilates-test` (Supabase project `ngzfhamjuviwfwuncrjo`)

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

---

# Appendix — What's NOT yet covered

The following scenarios are in the test plan but not yet automated. Listed in rough priority order for future sessions:

### Customer booking (CB-02 to CB-33, 25 scenarios remaining)
- **CB-02:** Returning customer books — 2-step flow (no PAR-Q repeat)
- **CB-06:** Customer tries to book a full block — blocked with friendly error
- **CB-08:** Standard customer tries to book during priority window — blocked
- **CB-09:** Priority customer can book during priority window
- **CB-10:** Customer tries to book outside any window (too early) — blocked
- **CB-31:** Customer tries to book a class they're already on — sees "already booked" screen
- Various validation scenarios (bad email, missing fields, invalid phone)
- Pro-rata pricing scenarios (partially-started blocks)

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
