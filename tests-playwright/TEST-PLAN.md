# LG Pilates Booking System — Test Plan

**Last updated:** 15 May 2026
**Total tests:** 72 (14 smoke + 34 CB + 16 PB + 6 SD + 2 ACL)
**Test framework:** Playwright
**Test database:** `lg-pilates-test` (Supabase project `ngzfhamjuviwfwuncrjo`)

---

## Coverage Tracker — Summary

The table below summarises the state of every Excel test-scenarios tab. "Removed" counts scenarios that were either flagged as duplicates of existing automated tests (during the 10 May 2026 sense-check) or marked as housekeeping rather than real tests. Removed scenarios are red-filled in `LG_Pilates_Test_Scenarios.xlsx` so they don't get picked up in future batches.

| Excel Tab | Total in Excel | Removed | Genuine total | Automated | Outstanding |
|---|---:|---:|---:|---:|---:|
| Client Booking (CB) | 33 | 0 | 33 | 33 | 0 |
| Priority Booking (PB) | 10 | 0 | 10 | 10 | 0 |
| Booking Windows (BW) | 7 | 4 | 3 | 0 | 3 |
| Admin Bookings (AB) | 22 | 0 | 22 | 0 | 22 |
| Admin Classes (AC) | 24 | 0 | 24 | 0 | 24 |
| Admin Clients (ACL) | 4 | 2 | 2 | 2 | 0 |
| Schedule Display (SD) | 6 | 0 | 6 | 6 | 0 |
| Settings & Export (SE) | 9 | 0 | 9 | 0 | 9 |
| Edge Cases (EC) | 14 | 1 | 13 | 0 | 13 |
| Block Warnings (BLW) | 8 | 0 | 8 | 0 | 8 |
| Security (SEC) | 7 | 3 | 4 | 0 | 4 |
| **Totals** | **144** | **10** | **134** | **51** | **83** |

> **PB also includes 5 gap-analysis tests** (PB-X1 to PB-X5, totalling 7 individual test cases) that aren't in the Excel sheet. They're listed in the Priority Booking per-tab table below for completeness.

> **Naming note (10 May 2026):** The "Block Warnings" tab IDs were renamed from `BW-` to `BLW-` to avoid collision with the "Booking Windows" tab. References to BLW-01 to BLW-08 in this document refer to the Block Warnings dashboard banners, not the booking-window UI states.

---

## Coverage Tracker — Per-tab detail

Each table below lists every scenario in that Excel tab with its current status and (for outstanding scenarios) the suggested batch. Status legend:

- ✅ **Automated** — full Playwright coverage exists
- 🔁 **Duplicate of [X]** — covered by an existing automated test; red-filled in Excel; no new spec needed
- 🚮 **Housekeeping** — not a real test scenario; red-filled in Excel
- ⬜ **Outstanding** — yet to be automated; suggested batch column shows planned grouping

### Client Booking (CB) — Complete ✅

| ID | Scenario | Status |
|---|---|---|
| CB-01 | New client books — full flow | ✅ cb-01.spec.js |
| CB-02 | PAR-Q Yes answer shows details box | ✅ cb-02.spec.js |
| CB-03 | Returning client skips PAR-Q | ✅ cb-03.spec.js |
| CB-04 | Booking modal subtitle shows correct block | ✅ cb-04.spec.js |
| CB-05 | Payment reference is personalised | ✅ cb-05.spec.js |
| CB-06 | Required fields validation | ✅ cb-06.spec.js |
| CB-07 | Capacity bar updates after booking | ✅ cb-07.spec.js |
| CB-08 | T&Cs — Reserve button disabled by default | ✅ cb-08.spec.js |
| CB-09 | T&Cs — Checkbox activates Reserve button | ✅ cb-09.spec.js |
| CB-10 | T&Cs — Unticking checkbox disables button again | ✅ cb-10.spec.js |
| CB-11 | T&Cs — Checkbox resets on Back and Return | ✅ cb-11.spec.js |
| CB-12 | T&Cs — New client completes booking after agreeing | ✅ Covered by cb-01.spec.js |
| CB-13 | T&Cs — Returning client completes booking after agreeing | ✅ cb-13.spec.js |
| CB-14 | Step indicator — shows correct state on modal open | ✅ cb-14.spec.js |
| CB-15 | Step indicator — Step 1 ticks on advance to Step 2 | ✅ cb-15.spec.js |
| CB-16 | Step indicator — Step 2 ticks on advance to Step 3 | ✅ cb-16.spec.js |
| CB-16b | Step indicator — Step 3 ticks on advance to Step 4 | ✅ cb-16b.spec.js |
| CB-17 | Step indicator — Back from Payment reactivates Step 3 | ✅ cb-17.spec.js |
| CB-18 | Step indicator — Returning client shows 2-step layout | ✅ cb-18.spec.js |
| CB-19 | Step indicator — Returning client Back from Payment | ✅ cb-19.spec.js |
| CB-20 | Step indicator — resets cleanly when modal closed/reopened | ✅ cb-20.spec.js |
| CB-21 | 4-step flow — new client sees all 4 steps | ✅ cb-21.spec.js |
| CB-22 | Medical step — intro note and age question appear | ✅ cb-22.spec.js |
| CB-23 | Medical step — age validation fires on Continue | ✅ cb-23.spec.js |
| CB-24 | Medical step — declaration must be signed | ✅ cb-24.spec.js |
| CB-25 | Emergency contact step — shows as Step 3 of 4 | ✅ cb-25.spec.js |
| CB-26 | Emergency contact step — phone validation | ✅ cb-26.spec.js |
| CB-27 | Back navigation — Emergency → Medical → Your details | ✅ cb-27.spec.js |
| CB-28 | Payment step shows as Step 4 of 4 for new clients | ✅ cb-28.spec.js |
| CB-29 | Sticky header stays visible while scrolling medical | ✅ cb-29.spec.js |
| CB-30 | Medical form is scrollable — all content reachable | ✅ cb-30.spec.js |
| CB-31 | Duplicate booking caught at step 1 | ✅ cb-31.spec.js |
| CB-32 | Returning client NOT on this block — welcome-back flow | ✅ cb-32.spec.js |
| CB-33 | PAR-Q sign_date stored as proper DATE type | ✅ cb-33.spec.js (strengthened Session 20 — direct parq row assertion) |

### Priority Booking (PB) — Complete ✅

Excel scenarios:

| ID | Scenario | Status |
|---|---|---|
| PB-01 | Next block locked — more than 14 days away | ✅ pb-01.spec.js |
| PB-02 | Priority window — email gate shown | ✅ pb-02.spec.js |
| PB-03 | Priority granted — eligible client | ✅ Covered by pb-10.spec.js |
| PB-04 | Priority denied — ineligible client | ✅ pb-04.spec.js |
| PB-05 | Standard window — everyone can book | ✅ pb-05.spec.js |
| PB-06 | Grant manual priority in admin (per-class) | ✅ pb-06.spec.js |
| PB-07 | Remove manual priority in admin (per-class) | ✅ pb-07.spec.js |
| PB-08 | Manually granted priority allows early access | ✅ pb-08.spec.js |
| PB-09 | Reserved booking does NOT grant priority access | ✅ pb-09.spec.js |
| PB-10 | Confirmed booking DOES grant priority access | ✅ pb-10.spec.js |

Gap-analysis tests (not in Excel; added in PB Batch 3):

| ID | Scenario | Status |
|---|---|---|
| PB-X1 | Priority gate input validation (3 sub-tests) | ✅ pb-x1.spec.js |
| PB-X2 | Email pre-fill survives modal close/reopen | ✅ pb-x2.spec.js |
| PB-X3 | Per-class priority isolation (RPC-driven) | ✅ pb-x3.spec.js |
| PB-X4 | Cancelled previous-block booking does not grant priority | ✅ pb-x4.spec.js |
| PB-X5 | Manual priority grant/remove cycle via admin panel | ✅ pb-x5.spec.js |

### Booking Windows (BW)

| ID | Scenario | Status | Suggested Batch |
|---|---|---|---|
| BW-01 | Only current block shown (no next block) | ⬜ Outstanding | Batch 9 |
| BW-02 | Current block session dates are listed | ⬜ Outstanding | Batch 9 |
| BW-03 | Next block >14 days — locked state | 🔁 Duplicate of PB-01 | — |
| BW-04 | Next block 8-14 days — priority window | 🔁 Duplicate of PB-02 | — |
| BW-05 | Next block 0-7 days — standard open | 🔁 Duplicate of PB-05 | — |
| BW-06 | Next block becomes active (start date = today) | ⬜ Outstanding | Batch 9 |
| BW-07 | Reset all test dates when done | 🚮 Housekeeping (not a real test) | — |

### Admin Bookings (AB)

| ID | Scenario | Status | Suggested Batch |
|---|---|---|---|
| AB-01 | Admin can log in | ⬜ Outstanding | Batch 15 |
| AB-02 | All Bookings tab loads correctly | ⬜ Outstanding | Batch 15 |
| AB-03 | View booking details | ⬜ Outstanding | Batch 15 |
| AB-04 | Confirm a reserved booking | ⬜ Outstanding | Batch 15 |
| AB-05 | Cancel a booking | ⬜ Outstanding | Batch 15 |
| AB-06 | Remove from Block — booking + health form deleted, customer kept | ⬜ Outstanding | Batch 15 |
| AB-07 | Permanently Delete Customer — all data removed | ⬜ Outstanding | Batch 15 |
| AB-08 | Remove from Block — 0 sessions attended, client has not paid | ⬜ Outstanding | Batch 16 |
| AB-09 | Remove from Block — 0 sessions attended, client has paid | ⬜ Outstanding | Batch 16 |
| AB-10 | By Class tab groups bookings by block | ⬜ Outstanding | Batch 16 |
| AB-11 | Remove from Block — sessions attended, refund calculated | ⬜ Outstanding | Batch 16 |
| AB-12 | Remove from Block — refund override changes saved amount | ⬜ Outstanding | Batch 16 |
| AB-13 | Cancellations report — all removals appear in table | ⬜ Outstanding | Batch 16 |
| AB-14 | Mark Refunded — button appears for unrefunded records | ⬜ Outstanding | Batch 16 |
| AB-15 | Mark Refunded — clicking button updates record | ⬜ Outstanding | Batch 16 |
| AB-16 | Cancellations report — CSV export downloads correctly | ⬜ Outstanding | Batch 17 |
| AB-17 | Del Customer button — still present alongside Remove from Block | ⬜ Outstanding | Batch 17 |
| AB-18 | Sign-in button resets correctly on subsequent sign-in | ⬜ Outstanding | Batch 17 |
| AB-19 | Missing PAR-Q banner — hidden when all PAR-Qs present | ⬜ Outstanding | Batch 17 |
| AB-20 | Missing PAR-Q banner — appears when a PAR-Q is missing | ⬜ Outstanding | Batch 17 |
| AB-21 | Missing PAR-Q banner — plural count + click-to-scroll highlight | ⬜ Outstanding | Batch 17 |
| AB-22 | Admin PAR-Q view renders friendly date format | ⬜ Outstanding | Batch 17 |

### Admin Classes (AC)

| ID | Scenario | Status | Suggested Batch |
|---|---|---|---|
| AC-01 | Add a new class | ⬜ Outstanding | Batch 18 |
| AC-02 | Add a block to a class | ⬜ Outstanding | Batch 18 |
| AC-03 | Block start date must match class day | ⬜ Outstanding | Batch 18 |
| AC-04 | Edit a block | ⬜ Outstanding | Batch 18 |
| AC-05 | Delete a block | ⬜ Outstanding | Batch 18 |
| AC-06 | Edit a class slot | ⬜ Outstanding | Batch 18 |
| AC-07 | Delete a class | ⬜ Outstanding | Batch 18 |
| AC-08 | Class hidden when it has no blocks | ⬜ Outstanding | Batch 18 |
| AC-09 | Add class rejected when not logged in | ⬜ Outstanding | Batch 19 |
| AC-10 | Edit class rejected when not logged in | ⬜ Outstanding | Batch 19 |
| AC-11 | Add block rejected when not logged in | ⬜ Outstanding | Batch 19 |
| AC-12 | Warning banner shows class time in name | ⬜ Outstanding | Batch 19 |
| AC-13 | Add block modal subtitle shows class time | ⬜ Outstanding | Batch 19 |
| AC-14 | Auto start date prefill from advisory warning | ⬜ Outstanding | Batch 19 |
| AC-15 | Red warning banner — Add Block does NOT prefill date | ⬜ Outstanding | Batch 19 |
| AC-16 | Prevent overlapping block dates | ⬜ Outstanding | Batch 19 |
| AC-17 | Prevent new block starting on same day existing block ends | ⬜ Outstanding | Batch 20 |
| AC-18 | Edit block — overlap validation also applies | ⬜ Outstanding | Batch 20 |
| AC-19 | Auto am/pm — 24hr time converted on blur | ⬜ Outstanding | Batch 20 |
| AC-20 | Auto am/pm — bare hour and minute input | ⬜ Outstanding | Batch 20 |
| AC-21 | Auto am/pm — already formatted input left unchanged | ⬜ Outstanding | Batch 20 |
| AC-22 | Auto am/pm applies to End Time field as well | ⬜ Outstanding | Batch 20 |
| AC-23 | Delete class with bookings + PAR-Qs — completes cleanly | ⬜ Outstanding | Batch 20 |
| AC-24 | Block validation — rejects negative / zero price, cap, weeks | ⬜ Outstanding | Batch 20 |

### Admin Clients (ACL) — Complete ✅

| ID | Scenario | Status | Suggested Batch |
|---|---|---|---|
| ACL-01 | Clients tab lists all customers | ✅ acl-01.spec.js | Batch 8 |
| ACL-02 | Priority badges display correctly | ✅ acl-02.spec.js | Batch 8 |
| ACL-03 | Grant priority to a standard client | 🔁 Duplicate of PB-06 | — |
| ACL-04 | Remove priority from a client | 🔁 Duplicate of PB-07 | — |

> **Excel wording note (15 May 2026):** ACL-01 and ACL-02 originally referenced the deprecated global `customers.priority` column and a two-state "Priority/Standard" badge model. The live UI uses per-class priority via `customer_class_priority` and renders a three-state overall badge: "Manual priority", "Auto priority", or "Standard". The automated specs test the live behaviour; the Excel wording should be updated in line with this at end of session.

### Schedule Display (SD) — Complete ✅

| ID | Scenario | Status | Suggested Batch |
|---|---|---|---|
| SD-01 | All classes load on page open | ✅ Automated | Batch 7 |
| SD-02 | Filter by Baildon | ✅ Automated | Batch 7 |
| SD-03 | Filter by Guiseley | ✅ Automated | Batch 7 |
| SD-04 | Filter by day within a location | ✅ Automated | Batch 7 |
| SD-05 | Reset to All Classes | ✅ Automated | Batch 7 |
| SD-06 | Class without blocks is hidden | ✅ Automated | Batch 7 |

### Settings & Export (SE)

| ID | Scenario | Status | Suggested Batch |
|---|---|---|---|
| SE-01 | Save bank details | ⬜ Outstanding | Batch 14 |
| SE-02 | Bank details appear on booking payment screen | ⬜ Outstanding | Batch 14 |
| SE-03 | Bank details appear on success/confirmation screen | ⬜ Outstanding | Batch 14 |
| SE-04 | Export Classes CSV | ⬜ Outstanding | Batch 14 |
| SE-05 | Export Blocks CSV | ⬜ Outstanding | Batch 14 |
| SE-06 | Export Customers CSV | ⬜ Outstanding | Batch 14 |
| SE-07 | Export Bookings CSV | ⬜ Outstanding | Batch 14 |
| SE-08 | Export Everything — full backup | ⬜ Outstanding | Batch 14 |
| SE-09 | CSV export — formula injection protection | ⬜ Outstanding | Batch 14 |

### Edge Cases (EC)

| ID | Scenario | Status | Suggested Batch |
|---|---|---|---|
| EC-01 | Booking a full class is prevented | ⬜ Outstanding | Batch 11 |
| EC-02 | Duplicate booking — same email, same block | 🔁 Duplicate of CB-31 | — |
| EC-03 | Invalid email format | ⬜ Outstanding | Batch 11 |
| EC-04 | Block with wrong day is rejected | ⬜ Outstanding | Batch 11 |
| EC-05 | Page loads with no active classes | ⬜ Outstanding | Batch 11 |
| EC-06 | Very long text in booking form | ⬜ Outstanding | Batch 11 |
| EC-07 | Overbooking prevented — class fills during booking | ⬜ Outstanding | Batch 11 |
| EC-08 | Duplicate booking same block — server-side rejection | ⬜ Outstanding | Batch 12 |
| EC-09 | Reserve button disabled during submission | ⬜ Outstanding | Batch 12 |
| EC-10 | Capacity bar resets when bookings are bulk-deleted via SQL | ⬜ Outstanding | Batch 12 |
| EC-11 | Capacity bar updates automatically when a booking is made | ⬜ Outstanding | Batch 12 |
| EC-12 | DB-level duplicate booking protection — direct SQL insert rejected | ⬜ Outstanding | Batch 12 |
| EC-13 | book_if_available RPC returns ALREADY_BOOKED on duplicate | ⬜ Outstanding | Batch 12 |
| EC-14 | DB refuses rows with NULL on critical columns | ⬜ Outstanding | Batch 12 |

### Block Warnings (BLW)

| ID | Scenario | Status | Suggested Batch |
|---|---|---|---|
| BLW-01 | Red alert — class with no block at all | ⬜ Outstanding | Batch 13 |
| BLW-02 | Yellow advisory — active block but no next block | ⬜ Outstanding | Batch 13 |
| BLW-03 | Both banners show when both conditions exist | ⬜ Outstanding | Batch 13 |
| BLW-04 | + Add Block button opens correct modal | ⬜ Outstanding | Batch 13 |
| BLW-05 | Banner disappears after block is added | ⬜ Outstanding | Batch 13 |
| BLW-06 | No banners shown when all classes are covered | ⬜ Outstanding | Batch 13 |
| BLW-07 | Yellow advisory — Add Block prefills date automatically | ⬜ Outstanding | Batch 13 |
| BLW-08 | Class and time both shown in warning banner row | ⬜ Outstanding | Batch 13 |

### Security (SEC)

| ID | Scenario | Status | Suggested Batch |
|---|---|---|---|
| SEC-01 | Public schedule loads without sign-in | 🔁 Duplicate of smoke-04 + smoke-01 | — |
| SEC-02 | Bank details visible on payment screen without sign-in | ⬜ Outstanding | Batch 10 |
| SEC-03 | New-client full booking works end-to-end (anon RPC writes) | ⬜ Outstanding | Batch 10 |
| SEC-04 | Anon cannot directly read customer data | 🔁 Duplicate of smoke-03.2 | — |
| SEC-05 | Anon cannot directly read bookings | 🔁 Duplicate of smoke-03.1 | — |
| SEC-06 | Admin sign-in promotes session → full dashboard access | ⬜ Outstanding | Batch 10 |
| SEC-07 | Grant matrix matches context.txt spec (one-off verification) | ⬜ Outstanding | Batch 10 |

---

## Suggested Batches

| Batch | Scope | Count | Notes |
|---|---|---:|---|
| Batch 6 ✅ | Test infrastructure (self-cleaning afterEach + CB-33 strengthening) | ~11 specs | NOT from Excel — existing tests being upgraded. Adds afterEach cleanup to CB-01, CB-03, CB-13, CB-32, PB-09, PB-10. CB-33 strengthened Session 20 with direct `parq` row assertion after `.select()` fix landed in index.html. CB-02, CB-31 left as-is (create no state). |
| Batch 7 ✅ | Schedule Display | 6 | UI filter tests; SD-01 to SD-05 are pure UI, SD-06 hides wed-upcoming via `visible=false` with self-cleaning afterEach (restored to original value regardless of pass/fail). |
| Batch 8 ✅ | Admin Clients (remaining) | 2 | Customers tab layout + three-state priority badge rendering (Manual / Auto / Standard). Excel wording updated to match the live UI. |
| Batch 9 | Booking Windows (remaining) | 3 | Card-state UI tests not covered by PB. |
| Batch 10 | Security (remaining) | 4 | Two UI checks + admin tour + grant-matrix audit. |
| Batch 11 | Edge Cases (part 1) | 6 | Validation + boundary tests. |
| Batch 12 | Edge Cases (part 2) | 7 | Capacity + DB-level integrity tests. |
| Batch 13 | Block Warnings | 8 | Dashboard banner regressions. Needs admin login. |
| Batch 14 | Settings & Export | 9 | Bank details + CSV export tests. Needs admin login. |
| Batch 15 | Admin Bookings (part 1) | 7 | Login + table + booking lifecycle. |
| Batch 16 | Admin Bookings (part 2) | 8 | Refund flows + cancellations report. |
| Batch 17 | Admin Bookings (part 3) | 7 | CSV export + Missing PAR-Q banner. |
| Batch 18 | Admin Classes (part 1) | 8 | CRUD on classes + blocks. |
| Batch 19 | Admin Classes (part 2) | 8 | Auth gates + overlap validation. |
| Batch 20 | Admin Classes (part 3) | 8 | Time formatting + delete-cascade tests. |

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

Every test runs against 11 pre-seeded blocks across 4 classes (Migration 09 base + Migration 11 Thursday class). Roles are stable, block IDs are not — so tests look up blocks by role, not ID.

| Role | Class | State | Purpose |
|---|---|---|---|
| `mon-past` | Mon Mixed Ability | Completed | Historical record; priority-source for returning customers |
| `mon-current` | Mon Mixed Ability | Active (mid-run) | Bookable "current" block; used for new-client happy paths |
| `mon-upcoming` | Mon Mixed Ability | Upcoming (~13 days out) | Priority-window testing |
| `mon-full` | Mon Mixed Ability | Upcoming, cap=2, fully booked | Capacity-limit testing |
| `wed-past` | Wed Beginner | Completed | Priority-source for Wed customers |
| `wed-upcoming` | Wed Beginner | Upcoming (~8 days out) | Priority-window + manual priority grant |
| `thu-current` | Thu Mixed Ability | Active (mid-run) | Anchor for the Thursday card so a nextBlk panel renders |
| `thu-locked` | Thu Mixed Ability | Upcoming (~30 days out) | Locked-window UI testing (PB-01) |
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
3. Reads the parq row directly via `getParqByCustomerId` (admin-db helper, direct Postgres)

**What the test verifies:**
- The customer exists with `customer_type='new'`
- A parq row exists for that customer
- parq.customer_id matches the booked customer
- parq.booking_id is populated (linked to the booking)
- parq.print_name matches the name entered in the form
- parq.sign_date is populated
- parq.q1_heart = 'No' and parq.q12_other_reasons = 'No' (the values entered in the form)

**What a fail would mean:**
New clients would be booking without their health questionnaire being saved. Compliance risk for Louise and a safety concern for classes.

> **Strengthened (Session 20):** Originally verified PAR-Q creation indirectly via `customer_type='new'`. Strengthening was attempted Session 19 but parked — the parq insert was returning a silent 401 in the test environment due to an unnecessary `.select()` on the front-end's insert call (anon has INSERT but not SELECT on parq, so PostgREST's RETURNING was being rejected). Session 20 fixed the `.select()` call in index.html, which also removed a silent error from production, and the direct parq row assertion now passes cleanly.

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
- Self-cleaning handles any previous-run booking state automatically

**Fixture role used:** `fri-upcoming` + the seeded customer `returning-two@test.example`

**Steps the test performs:**
1. Looks up the customer via the `lookup_customer` RPC
2. Self-cleaning pre-flight: calls `has_active_booking_on_block` — if a booking exists from a previous run, deletes it via `deleteBookingsForCustomerOnBlock` (admin-db helper) and re-verifies it's gone. The test then runs end-to-end every time without needing a reseed.
3. Opens the Friday booking modal and fills Step 1 with the returning customer's email
4. Waits for the app to detect the returning customer and jump straight to Step 3
5. Verifies the Step 3 default state (checkbox unticked, button disabled)
6. Ticks the T&Cs and clicks Reserve
7. Waits for the success view to appear
8. Calls `has_active_booking_on_block` again to confirm the booking now exists

**What the test verifies:**
- The customer is found and the lookup RPC works
- After self-cleaning, the pre-booking RPC returns `false` (no existing booking)
- Step 3 appears within 8 seconds (allowing for the 2.5s setTimeout in `goStep2()`)
- The success view is shown after Reserve is clicked
- The post-booking RPC returns `true` (booking now exists)

**What a fail would mean:**
The returning-customer fast track is broken. Existing customers would either be forced through the full new-client flow (a major UX regression) or be unable to complete a booking at all.

> **Self-cleaning (Session 18):** This test now deletes any leftover booking on entry rather than skipping. The test is fully re-runnable without a reseed. The previous `test.skip` pattern was replaced because cascading skips across the suite (CB-13 → CB-32 → PB-10 etc.) made the green suite hide real coverage gaps.

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

### CB-25 — Emergency contact step shows as Step 3 of 4

**What this proves:** When a new client finishes the medical questions, they're handed off to a clean, focused emergency-contact screen — clearly labelled as Step 3 of 4, with only the three contact fields visible. This guards against the medical questions accidentally bleeding into the emergency step, which would feel cluttered and confusing.

**Preconditions:**
- Monday current block is bookable
- A new client (no prior bookings) is being created in this test

**Fixture role used:** `mon-current`

**Steps the test performs:**
1. Opens the modal on Monday's current block
2. Fills in Step 1 (your details) with a unique test email
3. Completes Step 2 (medical) with a clear PAR-Q and signed declaration
4. Inspects the resulting Step 3 (emergency contact) panel

**What the test verifies:**
- Step label reads "Step 3 of 4 — Emergency Contact"
- Pip 3 is `.active` and labelled "Emergency contact"
- Pips 1 and 2 show ticks (✓), confirming they're marked done
- All three emergency contact fields are visible (name, relationship, phone)
- Medical-step fields (age input, PAR-Q radios, print name) are NOT visible — the previous step is fully hidden, not just scrolled past

**What a fail would mean:**
Steps could overlap visually, or the emergency contact step could appear with the wrong label/pip state. Real clients would either be confused about where they are in the flow, or might accidentally leave fields blank because the previous step's content distracted them.

---

### CB-26 — Emergency contact phone validation fires on Continue

**What this proves:** A too-short emergency phone is caught before the booking is reserved. Louise needs a real, reachable number on the emergency contact — without this guard, a typo or partial entry could silently make it through to the database.

**Preconditions:**
- Monday current block is bookable
- New client has reached Step 3 (emergency contact)

**Fixture role used:** `mon-current`

**Steps the test performs:**
1. Opens the modal on Monday and progresses through Steps 1 and 2
2. On Step 3, fills in a name and relationship
3. Enters "12345" as the emergency phone (too short)
4. Clicks Continue

**What the test verifies:**
- Validation toast appears at the top of the page
- Toast text contains "Emergency contact phone must be 11 digits"
- The form does NOT advance: Step 3 panel is still visible, Step 4 (Payment) is not visible
- Pip 4 (Payment) does not become `.active`

**What a fail would mean:**
The booking system would accept incomplete emergency phone numbers. If Louise ever needed to reach a client's emergency contact during a class, she could be left with an unusable number — a real safety issue, not just a data quality one.

---

### CB-27 — Back navigation from Emergency Contact preserves data

**What this proves:** Clicking Back works correctly through every step of the new-client flow. Pip indicators reset properly, the modal scrolls to the top so the back-stepped screen is visible immediately, and previously entered data is preserved so the client doesn't have to re-type anything.

**Preconditions:**
- Monday current block is bookable
- New client is being walked through the full flow

**Fixture role used:** `mon-current`

**Steps the test performs:**
1. Opens the modal and fills Step 1 with name, email, phone
2. Fills Step 2 with age 42, print name, ticked declaration
3. On Step 3 (emergency contact), scrolls the modal down to simulate a long form
4. Clicks Back to return to Step 2
5. Scrolls down again, then clicks Back to return to Step 1

**What the test verifies:**
- Back from Step 3 → Step 2 (Medical) with pip 2 `.active`, pip 1 still `.done`, pips 3 and 4 not `.active`
- Modal scrolls back to top after each Back click (smooth scroll, polled briefly)
- Medical-step data preserved: age "42", print name, declaration still ticked
- Back from Step 2 → Step 1 (Your details) with pip 1 `.active`, pips 2-4 not `.active`
- Step 1 data preserved: first name, last name, email, phone

**What a fail would mean:**
A real client second-guessing their answers and clicking Back would lose what they'd typed and have to start over. The pip indicator could lie about which step they're on. Or the modal could remain scrolled mid-page after Back, hiding the panel header and confusing the client about which step they're now editing.

---

### CB-03 — Returning client skips PAR-Q

**What this proves:** Returning clients don't have to fill in the medical form or emergency contact every time. The system recognises an existing email and jumps straight to the payment step. This is the core convenience that distinguishes a returning client's experience from a new one.

**Preconditions:**
- A returning customer (`returning-two@test.example`) exists in the test DB and has at least one previous booking
- That customer is NOT yet booked on the Monday current block (self-cleaning handles previous-run state)

**Fixture role used:** `mon-current` (block) plus `returning-two@test.example` (existing customer)

**Steps the test performs:**
1. Self-cleaning pre-flight: looks up `returning-two`, checks for an existing booking on `mon-current`, and if found deletes it via `deleteBookingsForCustomerOnBlock` (admin-db helper). The test runs end-to-end every time without needing a reseed.
2. Opens the booking modal on Monday's current block
3. Fills Step 1 with the returning client's existing details
4. Waits for the welcome-back message and 2.5s transition
5. Verifies the modal goes straight to Step 3 (Payment) without showing Step 2 (Medical) or Step 2b (Emergency contact)
6. Completes the booking via T&Cs + Reserve to confirm end-to-end

**What the test verifies:**
- Welcome-back message contains "Welcome back" and "skip the health form"
- Step 3 (Payment) is visible after the transition
- Step 2a (Medical) and Step 2b (Emergency Contact) panels are NOT visible
- Step label reads "Step 2 of 2 — Payment" (returning-client 2-step layout)
- The booking completes successfully through Reserve My Spot

**What a fail would mean:**
Either returning clients would be forced to re-fill the medical form every block (bad UX, complaints) or the system would lose track of who's a returning customer entirely. Both would push clients away from rebooking.

> **Self-cleaning (Session 18):** Replaces the previous `test.skip` pattern. See CB-13 note for the rationale.

---

### CB-31 — Duplicate booking caught at Step 1

**What this proves:** A returning client trying to re-book a class they're already on is caught immediately, before being walked through the full flow only to fail at the very end. They get a clear "you're already booked" screen showing exactly which booking the system has on record.

**Preconditions:**
- A returning customer (`returning-one@test.example`) exists in the test DB
- That customer IS currently booked on the Monday active block (mon-current)

**Fixture role used:** `mon-current` (block) plus `returning-one@test.example` (existing customer)

**Steps the test performs:**
1. Opens the booking modal on Monday's current block
2. Fills Step 1 with the already-booked customer's details
3. Waits for the "Checking your bookings..." message and 1.2s transition
4. Inspects the resulting already-booked screen
5. Clicks the Close button

**What the test verifies:**
- The "Welcome back! Checking your bookings..." message appears first
- After the brief delay, the already-booked view becomes visible
- All Step 1, 2a, 2b, 3 panels are hidden
- The view contains the "already booked" title and tick icon
- Block details are populated: Class, When, Venue, and Block range rows are all shown
- The class name "Mixed Ability" and day "Monday" appear in the details
- A Close button is visible
- The step progress pip indicator is dimmed (opacity less than 1)
- Clicking Close hides the modal overlay

**What a fail would mean:**
A client could fill in the entire booking form and only discover the duplicate at the very end (or worse, end up with two bookings, two payments, and a refund problem). The early-detection screen is what spares them — and Louise — that messy outcome.

---

### CB-32 — Returning client NOT on this block — welcome-back flow continues normally

**What this proves:** The duplicate-detection check from CB-31 doesn't false-positive. A returning client who is genuinely not on this particular block — even if they have other bookings elsewhere — should see the normal welcome-back flow and reach payment, not the already-booked screen.

**Preconditions:**
- A returning customer (`returning-one@test.example`) exists in the test DB with previous bookings on other classes/blocks
- That customer is NOT currently booked on the Friday upcoming block (self-cleaning handles previous-run state)

**Fixture role used:** `fri-upcoming` (block) plus `returning-one@test.example` (existing customer)

> Customer choice matters here. CB-13 already books `returning-two` onto `fri-upcoming`, so re-using `returning-two` would cause CB-32 to skip after CB-13 ran. `returning-one` + `fri-upcoming` is a unique combination across the CB suite.

**Steps the test performs:**
1. Self-cleaning pre-flight: looks up `returning-one`, checks for an existing booking on `fri-upcoming`, and if found deletes it via `deleteBookingsForCustomerOnBlock`. The test runs end-to-end every time without needing a reseed.
2. Opens the booking modal on Friday's current block
3. Fills Step 1 with the returning customer's existing details
4. Waits for the welcome-back message
5. Verifies the modal advances to Step 3 (Payment), NOT the already-booked screen
6. Completes the booking via T&Cs + Reserve

**What the test verifies:**
- Welcome-back message contains "Welcome back" and "skip the health form"
- Step 3 (Payment) is visible after the transition
- Already-booked view is NOT visible (the regression check)
- Reserve button is reachable
- The booking completes successfully through Reserve My Spot

**What a fail would mean:**
A returning client trying to book a new class would be wrongly told they're already booked — blocking a real booking and a real payment. This is the regression check that proves the early-detection logic only fires when it should.

> **Self-cleaning (Session 18):** Replaces the previous `test.skip` pattern. See CB-13 note for the rationale.

---

# Priority Booking (PB) — Batch 1

*These tests cover the priority-booking gate UI in three booking windows (locked / priority / standard) plus the granted-vs-denied paths through the priority RPC.*

---

### PB-01 — Locked window: Not Open Yet panel + 3-row info

**What this proves:** When a class's next block is more than 14 days away, the booking page must NOT let any visitor — priority or otherwise — book it. The visitor sees a clear info panel with three dated rows (when priority opens, when standard opens, and when the block actually starts) plus a disabled "Not Open Yet" button. This protects the booking window business rule and gives clients a predictable timeline.

**Preconditions:**
- Migration 11 has been applied (Thursday class with active block + locked-window block)
- The `thu-locked` block is upcoming and more than 14 days away (>14 days out)
- The Thursday class card is visible on the booking page

**Fixture role used:** `thu-locked`

**Steps the test performs:**
1. Looks up the `thu-locked` block and verifies it really is more than 14 days away (sanity check on the fixture)
2. Locates the Thursday class card and clicks the next-block toggle to expand it
3. Inspects the next-block panel

**What the test verifies:**
- The disabled "Not Open Yet" button is visible inside the next-block panel
- The `.priority-info` panel is visible and contains all four labels: "Not open yet", "Priority booking opens", "Standard booking opens", "Block starts"
- No email gate (`#pcheck-{blockId}`) is rendered for this block
- No "Book Next Block" button is rendered for this block

**What a fail would mean:**
Either a visitor could book a block far too early (breaking the booking-window business rule), or the dates panel wouldn't render and clients would be left wondering when they can book. Both undermine the system's value as a structured booking gate.

> **Why a separate Thursday class?** The original Mon/Wed/Fri fixture from Migration 09 has no class with both an active block AND a >14-days-out next block — every class's nextBlk is either in the priority window or the standard window, or has no nextBlk. Migration 11 adds the Thursday class purely to render this UI state.

---

### PB-02 — Priority window: email gate shown, no direct Book button

**What this proves:** When a class's next block is in the priority window (8-14 days away), the booking page must show an email-gate flow — not a direct Book button. This is the gate that lets returning priority clients book early while keeping new visitors out until the standard window.

**Preconditions:**
- The `mon-upcoming` block is upcoming and 8-14 days away
- The Monday class card is visible on the booking page

**Fixture role used:** `mon-upcoming`

**Steps the test performs:**
1. Looks up the `mon-upcoming` block and verifies it really is 8-14 days away
2. Locates the Monday class card and clicks the next-block toggle
3. Inspects the next-block panel

**What the test verifies:**
- The `.priority-info` headline reads "Priority booking is open"
- The panel includes "Standard booking opens" and "Block starts" rows
- The email gate (`#pcheck-{blockId}`) is visible
- The email input (`#pemail-{blockId}`) is visible with a relevant placeholder
- The "Check My Priority" button is visible
- No direct "Book Next Block" button appears
- No "Not Open Yet" disabled button appears

**What a fail would mean:**
Either the priority gate would not appear and any visitor could book in the priority window (defeating the point of priority access), or the gate would render incorrectly and priority clients couldn't get in.

---

### PB-04 — Priority denied for ineligible email

**What this proves:** A visitor who isn't eligible for priority access (no manual grant, no confirmed previous-block booking) is cleanly denied at the gate, told when standard booking opens, and not allowed past the gate. This protects the priority window from being opened up to standard clients.

**Preconditions:**
- The `mon-upcoming` block is in the priority window
- A fresh ineligible email (no record in the customers table) is used

**Fixture role used:** `mon-upcoming`

**Steps the test performs:**
1. Generates a fresh `pb04-{timestamp}@test.example` email — guaranteed not to exist in the customers table
2. Locates the Monday card, expands the next-block toggle
3. Enters the ineligible email in the priority gate
4. Clicks Check My Priority

**What the test verifies:**
- The deny message renders inside `#pmsg-{blockId}`
- The message contains "don't have priority booking"
- The message contains "Standard booking opens" with the date
- The booking modal does NOT open (`#overlay.on` is not visible)
- The email gate stays in place

**What a fail would mean:**
Either an ineligible client would be wrongly granted priority (breaking the business rule), or the deny message wouldn't render and clients would be left with no feedback as to why nothing happened — both bad for trust and for Louise's pricing model.

---

### PB-05 — Standard window: direct Book button, no gate

**What this proves:** Once the next block reaches the standard window (0-7 days away), the priority gate disappears and any visitor can book directly. This is the "everyone is welcome now" state — opposite of PB-01's locked state and PB-02's email-gated state.

**Preconditions:**
- The `fri-upcoming` block is 0-7 days away
- The Friday class card is visible on the booking page

**Fixture role used:** `fri-upcoming`

**Steps the test performs:**
1. Looks up `fri-upcoming` and verifies it really is 0-7 days away
2. Locates the Friday class card
3. Inspects the visible Book button on the card

**What the test verifies:**
- A direct "Book Current Block" or "Book Next Block" button is visible and enabled
- No email gate (`#pcheck-{blockId}`) is rendered for this block
- No "Not Open Yet" disabled button is rendered
- No "Check My Priority" button is rendered

**What a fail would mean:**
Either the priority gate would persist past the priority window (preventing new clients from booking and losing Louise revenue), or some other UI state would render incorrectly leaving the card unbookable.

---

### PB-06 — Admin grants Manual priority via per-class panel

**What this proves:** Louise can give a specific client priority access on a specific class from the admin dashboard — and the change actually lands in the database, persists across page reloads, and updates every relevant badge in the UI. This is the foundation of the per-class manual priority system: without it Louise would have no way to grant priority outside the automatic "confirmed-on-previous-block" rule.

**Preconditions:**
- An admin user exists in the test Supabase project (`admin@lg-pilates-test.local`) with credentials in `.env.test` (`TEST_ADMIN_EMAIL`, `TEST_ADMIN_PASSWORD`)
- `returning-two@test.example` is a seed customer with a confirmed booking on `fri-recent-past` (so the Friday class appears in their per-class panel with an Auto badge)
- No existing manual grant on the (returning-two, Friday) pair (cleaned by `beforeEach` if leftover from a prior run)

**Fixture role used:** No block role — the test operates on customer + class IDs looked up dynamically.

**Steps the test performs:**
1. Logs in as admin via the dashboard login form
2. Opens the Clients tab and waits for the customer table to render
3. Expands the per-class panel for `returning-two`
4. Confirms the starting state: Grant button visible, Auto badge visible
5. Clicks Grant
6. Re-expands the panel after the table re-renders
7. Confirms the new state: Remove button visible, Manual badge visible, overall row badge shows "Manual priority"
8. Verifies via direct Postgres that a row exists in `customer_class_priority`
9. Reloads the page, logs in again, confirms the grant survived

**What the test verifies:**
- The per-class action button changes from Grant to Remove after the click
- The per-class status badge changes from Auto to Manual
- The overall customer-row badge updates to "Manual priority"
- A row exists in `customer_class_priority` after the click
- The grant persists across a full page reload + re-login

**What a fail would mean:**
Either Louise's Grant button doesn't actually save anything (so manual priority would silently not work), or the UI lies to her about the new state (badge says Manual but the DB has no row), or the grant is lost on reload (so a refresh would silently revoke priority she just granted). Any of these would break Louise's trust in the admin tool.

> **DB access note:** The `customer_class_priority` table has no anon grants by design (admin-only). All test fixture writes/reads on it use the new `tests/helpers/admin-db.js` helper, which opens a direct Postgres connection via `TEST_SUPABASE_DB_URL` and bypasses RLS for fixture purposes only.

---

### PB-07 — Admin removes Manual priority via per-class panel

**What this proves:** Louise can take Manual priority away from a client just as cleanly as she granted it. When she removes a Manual grant from someone who also has a confirmed booking on a previous block of that class, the badge correctly falls back to Auto priority (not Standard) — which means the per-class fall-through logic between Manual and Auto is wired up correctly.

**Preconditions:**
- An admin user exists in the test Supabase project with credentials in `.env.test`
- `returning-one@test.example` has a Manual priority grant on the Wednesday class (seeded by migration 09)
- `returning-one` is also confirmed on `wed-past`, so removing Manual should leave them with Auto priority on Wednesday
- If a previous run left the seed grant missing, `beforeEach` re-inserts it before the test runs

**Fixture role used:** No block role — the test operates on customer + class IDs looked up dynamically.

**Steps the test performs:**
1. Logs in as admin via the dashboard login form
2. Opens the Clients tab and expands the per-class panel for `returning-one`
3. Confirms the starting state: Remove button visible, Manual badge visible
4. Clicks Remove
5. Re-expands the panel after the table re-renders
6. Confirms the new state: Grant button visible, Auto badge visible (because of the confirmed booking on wed-past)
7. Verifies via direct Postgres that the row no longer exists in `customer_class_priority`
8. afterEach restores the seed grant so smoke-02 and other specs that rely on it stay valid

**What the test verifies:**
- The per-class action button changes from Remove to Grant after the click
- The per-class status badge changes from Manual to Auto (NOT Standard) — proving the Auto fall-through path
- The row no longer exists in `customer_class_priority`

**What a fail would mean:**
Either Louise's Remove button doesn't actually delete anything (so revoked priority would still apply), or the badge gets stuck at Manual after removal (so she can't tell what state the client is in), or the badge falls all the way to Standard ignoring the Auto priority that should still apply (so a client confirmed on the previous block would lose their automatic priority access). Any of these break the per-class priority model Louise relies on.

> **Self-cleaning note:** This test deletes a fixture-seeded row in the test body. The afterEach hook re-inserts it via the admin-db helper, so smoke-02's invariant ("returning-one has manual priority on Wednesday") is preserved between specs and across the suite.

---

### PB-08 — Manually granted priority allows early access

**What this proves:** A client who's been given Manual priority by Louise gets through the priority gate even though they didn't book the previous block — which is exactly the use case Louise needs Manual priority for (e.g. a long-standing client who skipped a block but should still get early access).

**Preconditions:**
- An admin user exists in the test Supabase project with credentials in `.env.test`
- `mon-upcoming` is in the priority window (8-14 days away)
- `returning-two@test.example` has confirmed bookings on `mon-past` and `mon-full` but NOT on `mon-current` — so without a manual grant the priority RPC denies them
- No existing manual grant on the (returning-two, Monday) pair (cleared by `beforeEach`)

**Fixture role used:** `mon-upcoming` plus `returning-two@test.example`.

**Steps the test performs:**
1. Verifies `mon-upcoming` is in the priority window
2. **Baseline (no grant):** opens the Monday card's next-block toggle, enters returning-two's email, clicks Check My Priority — expects denied (no "Priority confirmed" message, no modal)
3. **Admin grants Manual priority:** logs in as admin, opens Clients tab, expands returning-two's per-class panel, clicks Grant on the Monday class
4. **Admin signs out** — returns to schedule view (note: schedule does NOT re-render on sign-out, so the priority panel from step 2 is still open)
5. **With grant in place:** refills the email field on the (still open) priority panel, clicks Check My Priority again
6. Confirms the gate now grants access: "Priority confirmed!" message, booking modal opens with email pre-filled
7. afterEach removes the manual grant via direct Postgres

**What the test verifies:**
- Without a manual grant, the gate denies returning-two on `mon-upcoming`
- After the admin grants Manual on the Monday class, the same gate grants access
- The booking modal opens with the email pre-filled
- The flip from denied → allowed is purely caused by the Manual grant — nothing else in the fixture changed

**What a fail would mean:**
Either Manual priority granted in the admin panel doesn't actually unlock the gate for the client (so Louise's grant would be cosmetic only — they still couldn't book), or the gate would let returning-two through without a grant (which would mean the priority rules are broken altogether). Either failure breaks the headline use case for Manual priority.

> **Excel scenario note:** The original Excel scenario referenced the Wednesday class. The current test fixture's Wednesday card has no active block, so the priority gate UI does not render on it. This test was implemented against the Monday class instead — see the PB-08 note in the Coverage Tracker section. The Excel was updated in Session 17 to match.

> **Implementation note:** `signOut()` calls `show("schedule")` which only unhides the existing schedule DOM — it does not re-render. The priority panel toggled open at step 2 is therefore still open after sign-out. Clicking the toggle a second time would close it, so the spec deliberately skips that re-toggle.

---

### PB-09 — Reserved booking on previous block: priority denied

**What this proves:** Only `confirmed` bookings on the previous block grant priority access — `reserved` (still awaiting payment) does not. This protects Louise from priority access being given to clients who haven't actually paid for their previous block.

**Preconditions:**
- The `mon-upcoming` block is in the priority window (8-14 days away)
- A test customer is created and given a `reserved` booking on `mon-current` (the actual previous block per the priority RPC's logic)

**Fixture role used:** `mon-upcoming` (gate target) and `mon-current` (where the reserved booking is created)

**Steps the test performs:**
1. Looks up `mon-current` and `mon-upcoming` and verifies the priority-window state
2. Creates a fresh customer via `upsert_customer` RPC (`pb09-{timestamp}@test.example`)
3. Creates a reserved booking on `mon-current` via `book_if_available` RPC (this RPC always inserts as `reserved` status)
4. Reloads the booking page so the priority gate sees the new state
5. Locates the Monday card, expands the next-block toggle
6. Enters the reserved-booking customer's email in the priority gate
7. Clicks Check My Priority

**What the test verifies:**
- The deny message renders inside `#pmsg-{blockId}`
- The message contains "don't have priority booking"
- The message contains "Standard booking opens"
- The booking modal does NOT open

**What a fail would mean:**
A client who reserved but never paid for the previous block could jump the queue and book the next block during priority access — undermining the entire reason the priority window exists (rewarding clients who paid through to confirmed status).

---

### PB-10 — Confirmed booking on previous block: priority granted

**What this proves:** A client with a `confirmed` booking on the previous block of a class gets priority access during the 8-14-day window — the booking modal opens with their email pre-filled and they can complete the booking through to a successful Reserve. This is the positive path that priority access is built around.

**Preconditions:**
- The `mon-upcoming` block is in the priority window (8-14 days away)
- `returning-one@test.example` is confirmed on `mon-current` (the actual previous block — seeded by migration 09)
- `returning-one` is NOT yet booked on `mon-upcoming` (self-cleaning handles previous-run state)

**Fixture role used:** `mon-upcoming` plus `returning-one@test.example`

**Steps the test performs:**
1. Looks up `mon-upcoming` and verifies the priority-window state
2. Self-cleaning pre-flight: if `returning-one` already has a booking on `mon-upcoming` (e.g. left over from a previous PB-10 run), deletes it via `deleteBookingsForCustomerOnBlock`. The test runs end-to-end every time without needing a reseed.
3. Locates the Monday card, expands the next-block toggle
4. Enters the eligible email in the priority gate
5. Clicks Check My Priority
6. Waits for the "Priority confirmed!" message and the 1.2s delay before the modal opens
7. Confirms the modal opens with email pre-filled
8. Submits Step 1 with the eligible client's details
9. Waits for the welcome-back transition to Step 3 (Payment)
10. Agrees to T&Cs and clicks Reserve
11. Verifies the success view appears
12. Verifies via the database RPC that the booking row now exists

**What the test verifies:**
- The "Priority confirmed!" message appears in `#pmsg-{blockId}`
- The booking modal opens (`#overlay.on` visible)
- The email field is pre-filled with the eligible email
- After Step 1, the modal goes to Step 3 (Payment) — welcome-back flow
- The already-booked view is NOT shown
- After Reserve, the success view appears
- A booking row exists for this customer/block pair after the test (confirmed via `has_active_booking_on_block` RPC)

**What a fail would mean:**
Either an eligible priority client would be denied access (blocking a valid early booking and frustrating a paying client), or the modal would fail to pre-fill the email (forcing the client to retype), or the booking wouldn't actually be saved at the end. Any of these would break the headline benefit Louise offers her returning clients.

> **Note on PB-03 coverage:** PB-10 also covers PB-03 ("Priority granted — eligible client"). PB-03 is the simpler positive-path assertion; PB-10 adds the confirmed-vs-reserved distinction by being paired with PB-09. To avoid a redundant spec, PB-03 is marked ✅ covered by PB-10 in the tracker — the same pattern used for CB-12 covered by CB-01.

---

# PB Batch 3 — Gap-analysis tests (Session 18)

These tests cover real-world edge cases not in the Excel scenarios sheet. They were identified during the Session 16 sense-check as worth automating for production confidence.

### PB-X1 — Priority gate input validation

**What this proves:** The priority gate rejects empty, whitespace-only, and malformed (no `@`) emails client-side with a clear validation message, and does NOT make a wasted `check_priority_access` RPC call. This protects Louise from pointless RPC traffic and gives the user immediate, friendly feedback rather than a confusing deny message.

**Preconditions:**
- The Monday card's priority gate is rendered (Monday is the only class in the current fixture with both an active current block and an upcoming block in the priority window — see PB-08 note)

**Fixture role used:** `mon-upcoming` (the gate target)

**Steps the test performs (three sub-tests):**
1. Opens the Monday card's next-block panel via its toggle
2. **Empty email:** clicks Check My Priority with the input still empty
3. **Whitespace-only:** fills the input with `   ` and clicks Check My Priority
4. **Missing `@`:** fills the input with `notanemail` and clicks Check My Priority
5. Each sub-test attaches a `request` listener to the page and asserts no `check_priority_access` URL is hit

**What the test verifies:**
- The validation message renders inside `#pmsg-{blockId}` with the text "Please enter a valid email address."
- The booking modal does NOT open (`#overlay.on` has count 0)
- The `check_priority_access` RPC is never called (caught via network listener with a 400ms grace window)

**What a fail would mean:**
A user typing a typo or leaving the field blank would either get a confusing server-side denial, or the gate would silently fail without telling them what went wrong. Either is a poor user experience and could leave clients thinking the system is broken.

---

### PB-X2 — Email pre-fill on priority grant survives modal close/reopen

**What this proves:** When an eligible client gets through the priority gate, their email is pre-filled on Step 1 of the booking modal. If the client closes the modal mid-flow and re-triggers the gate, the email pre-fill behaviour is consistent — they don't have to retype. PB-10 verifies the pre-fill happens on the initial grant; PB-X2 extends that to the close/reopen round-trip.

**Preconditions:**
- The `mon-upcoming` block is in the priority window
- `returning-one@test.example` is confirmed on `mon-current` (priority-eligible)

**Fixture role used:** `mon-upcoming` plus `returning-one@test.example`

**Steps the test performs:**
1. Self-cleaning pre-flight: deletes any existing `returning-one` booking on `mon-upcoming` (PB-10 runs before PB-X2 alphabetically and books returning-one on the same block)
2. Opens the Monday card's next-block panel
3. Submits the eligible email through the priority gate
4. Asserts the modal opens with email pre-filled
5. Closes the modal via the `.mclose` button
6. Re-fills the gate input (the gate is just a text field, doesn't restore previous text)
7. Re-triggers the gate

**What the test verifies:**
- First gate flow: priority confirmed message renders, modal opens, `#b-email` is pre-filled with the eligible email
- After close: `#overlay.on` has count 0
- Second gate flow: priority confirmed message renders again, modal opens again, `#b-email` is pre-filled again

**What a fail would mean:**
A returning client who accidentally closes the modal mid-flow would be forced to retype their email, hitting the gate from scratch. While not catastrophic, it would create unnecessary friction at the exact moment they're trying to complete a paid booking.

---

### PB-X3 — Per-class priority isolation

**What this proves:** A manual priority grant for one class does NOT leak into other classes for the same customer. This is a core business rule — Louise grants priority per class, not per client. If isolation failed, granting Wednesday priority to one client would silently unlock every other class for them.

**Preconditions:**
- A fresh customer is created in the test
- Manual priority is granted on the Wednesday class only (via direct pg)

**Fixture roles used:** `wed-upcoming`, `mon-upcoming`, `fri-upcoming` (the upcoming blocks for each class)

**Steps the test performs:**
1. Creates a fresh customer via `upsert_customer` RPC (`pbx3-{timestamp}@test.example`)
2. Grants manual priority on the Wednesday class only via `grantManualPriority` (admin-db helper)
3. Calls `check_priority_access` RPC for the same customer against `wed-upcoming`, `mon-upcoming`, and `fri-upcoming`
4. Removes the manual grant in `afterEach` cleanup

**What the test verifies:**
- `check_priority_access` returns `true` for `wed-upcoming` (granted)
- `check_priority_access` returns `false` for `mon-upcoming` (not granted)
- `check_priority_access` returns `false` for `fri-upcoming` (not granted)

**What a fail would mean:**
Granting one client manual priority on a single class would unlock priority access for them across every class. This would silently inflate the priority window's effective participant count and damage Louise's ability to control who gets early access.

> **Note on RPC vs UI testing:** PB-X3 is RPC-driven rather than UI-driven. The priority gate UI only renders on the Monday card in the current fixture (Wed has no active block, Fri has no priority-window upcoming block), so a UI-only isolation test isn't possible without fixture changes. The RPC assertion proves the business rule directly — the gate UI is a thin wrapper around this RPC.

---

### PB-X4 — Cancelled previous-block booking does not grant priority

**What this proves:** A `cancelled` booking on the previous block does NOT count as priority-eligible. The `check_priority_access` RPC only treats `confirmed` as eligible. PB-09 covers the `reserved` case; PB-X4 covers `cancelled`. Together they prove the RPC's status filter is strict.

**Preconditions:**
- The `mon-upcoming` block is in the priority window
- A test customer is created and given a booking on `mon-current` that is then flipped to `cancelled` status

**Fixture role used:** `mon-current` (where the cancelled booking is created) and `mon-upcoming` (gate target)

**Steps the test performs:**
1. Creates a fresh customer via `upsert_customer` RPC (`pbx4-{timestamp}@test.example`)
2. Creates a booking on `mon-current` via `book_if_available` (status `reserved`)
3. Flips status to `cancelled` via `setBookingStatus` (admin-db helper, direct pg)
4. Resyncs `blocks.booked` via `resyncBlockBookedCount` (status changes don't trigger the sync)
5. Reloads the booking page so the gate sees the new state
6. Submits the customer's email to the priority gate on Monday

**What the test verifies:**
- The deny message renders inside `#pmsg-{blockId}`
- The message contains "don't have priority booking"
- The message contains "Standard booking opens"
- The booking modal does NOT open
- `afterEach` cleanup deletes the per-run customer + their booking via `deleteCustomerCascade`

**What a fail would mean:**
A client who cancelled their previous block could still claim priority for the next one — an exploit that would let people "save their spot" via cancellation while bypassing the rule that priority rewards continuous attendance.

---

### PB-X5 — Manual priority grant/remove cycle via admin panel

**What this proves:** A full round-trip through the admin panel — granting manual priority unlocks the gate for a client, and removing it locks them back out. End-to-end UI test driving both the admin Clients tab and the client-facing gate. Confirms that admin grant/remove buttons produce the same effect as a seed-time priority grant.

**Preconditions:**
- The `mon-upcoming` block is in the priority window
- `returning-two@test.example` is confirmed on `mon-past` and `mon-full` but NOT on `mon-current` (so without a manual grant, denied for `mon-upcoming`)

**Fixture role used:** `mon-upcoming` plus `returning-two@test.example`

**Steps the test performs (7 phases):**
1. **Baseline:** opens the Monday card priority gate, submits returning-two's email, asserts denial message
2. **Admin grants:** logs in as admin, opens Clients tab, expands returning-two's per-class panel, clicks Grant on Monday class
3. **Admin signs out:** returns to schedule view
4. **Gate now allows:** re-fills the email and re-triggers the gate; asserts priority confirmed + modal opens with email pre-filled
5. **Admin removes:** closes the modal, reloads the page (full reload required to reset dashboard tab state for second login), logs in again, clicks Remove on Monday
6. **Admin signs out** again
7. **Gate denies again:** re-opens the priority panel, submits the email, asserts the original denial message

**What the test verifies:**
- Phase 1: denial message contains "don't have priority booking", modal does not open
- Phase 2: Grant button flips to Remove (after waiting for the toast and the re-rendered button to appear in the DOM — `toggleClassPriority` is fire-and-forget async)
- Phase 4: priority confirmed message appears, `#overlay.on` becomes visible, `#b-email` is pre-filled
- Phase 5: Remove button flips back to Grant
- Phase 7: original denial behaviour restored
- `afterEach` cleanup removes any leftover grant via direct pg (belt-and-braces)

**What a fail would mean:**
The admin grant/remove buttons would be cosmetic — they'd appear to work but the underlying priority logic wouldn't reflect the change. Louise could grant priority to a client who then couldn't book, or remove priority from someone who could still claim it. Either is a serious operational bug.

---

### SD-01 — All classes load on page open

**What this proves:** The public booking page renders one card for every class that has at least one active or upcoming block, with no filter applied by default. This is the baseline schedule view every visitor sees on first load.

**Fixture role used:** None directly — queries the DB for the set of class IDs with `status IN ('active','upcoming')` and asserts the grid count matches.

**Steps the test performs:**
1. Loads the booking page with `?env=test`
2. Asserts the TEST MODE banner is visible
3. Queries the test DB for the count of distinct class IDs with active or upcoming blocks
4. Asserts `#fb-all` is in the `.on` state on page load (default selection)
5. Asserts `#grid .card` has exactly that count
6. Asserts no `.no-filter-msg` empty-state is present

**What a fail would mean:**
Either the grid renders too few cards (classes silently missing — visitors can't see classes they should be able to book) or too many (classes without bookable blocks showing up — visitors click cards that lead nowhere).

---

### SD-02 — Filter by Baildon

**What this proves:** Clicking the Baildon location pill filters the grid to only Baildon classes AND reveals the day filter buttons row (the day buttons only appear after a location is selected).

**Fixture role used:** None directly — queries the DB for the Baildon class count.

**Steps the test performs:**
1. Loads the booking page
2. Queries the DB for the count of distinct Baildon class IDs with active/upcoming blocks
3. Clicks `#fg-baildon-card`
4. Asserts the Baildon pill is `.on` and `#fb-all` is no longer `.on`
5. Asserts `#filter-days-wrap` has the `.on` class (the visibility toggle)
6. Asserts at least one day button is visible in `#filter-row`
7. Asserts `#grid .card` count matches the Baildon class count
8. Asserts every visible `.card-loc` contains "Baildon"

**What a fail would mean:**
The filter is broken — either it doesn't filter (Guiseley classes still show), the day row doesn't appear (visitors can't drill down to a specific day), or the wrong classes are shown.

---

### SD-03 — Filter by Guiseley

**What this proves:** Same as SD-02 but for the Guiseley pill. Confirms the filter mechanism works symmetrically for both locations rather than being hardcoded for one.

**Fixture role used:** None directly — queries the DB for the Guiseley class count.

**Steps the test performs:**
1. Loads the booking page
2. Queries the DB for the count of distinct Guiseley class IDs with active/upcoming blocks
3. Clicks `#fg-guiseley-card`
4. Asserts the Guiseley pill is `.on` and `#fb-all` is no longer `.on`
5. Asserts `#grid .card` count matches the Guiseley class count
6. Asserts every visible `.card-loc` contains "Guiseley"

**What a fail would mean:**
Same as SD-02 — broken filter, but specifically for Guiseley. Catches the case where someone hardcodes "Baildon" somewhere by accident.

---

### SD-04 — Filter by day within a location

**What this proves:** After picking a location, clicking a day button further narrows the grid to just that day's classes at that location. Confirms the two-level filter (location then day) works end-to-end.

**Fixture role used:** None directly — uses Baildon + Monday (the fixture guarantees a Baildon Monday class: class 1, Mon Mixed at Baildon Moravian Church).

**Steps the test performs:**
1. Loads the booking page
2. Queries the DB for the count of distinct class IDs that are Baildon AND Monday with active/upcoming blocks
3. Clicks `#fg-baildon-card`, asserts day row is visible
4. Locates the Monday button inside `#filter-row` via `hasText`
5. Asserts the Monday button exists, then clicks it
6. Asserts the Monday button is now `.on`
7. Asserts `#grid .card` count matches the Baildon-Monday count
8. Asserts every visible `.card-loc` contains "Baildon" AND every `.card-when-day` reads "Monday"

**What a fail would mean:**
Day filter doesn't work — visitors trying to find their class for a specific day would see classes for other days too, leading to confusion.

---

### SD-05 — Reset to All Classes

**What this proves:** After applying a filter, clicking "All Classes" fully resets the view — all classes return AND the day filter row disappears. Confirms the reset is complete, not partial.

**Fixture role used:** None directly — queries the DB for the all-classes count.

**Steps the test performs:**
1. Loads the booking page
2. Queries the DB for the total count of distinct class IDs with active/upcoming blocks
3. Applies a Baildon filter first (so there's something to reset from), confirms day row is visible
4. Clicks `#fb-all`
5. Asserts `#fb-all` is `.on` again and the Baildon pill is no longer `.on`
6. Asserts `#filter-days-wrap` is no longer `.on` AND is hidden
7. Asserts `#grid .card` count is back to the full total

**What a fail would mean:**
Reset is broken — either the day row stays visible (UI clutter, stale state), the wrong classes show, or "All Classes" doesn't reactivate. A visitor who clicked into Baildon then changed their mind couldn't return to the full view cleanly.

---

### SD-06 — Class without blocks is hidden

**What this proves:** A class with no active or upcoming blocks does NOT appear on the public booking page. This is the front-line privacy rule that protects unreleased classes from being seen by visitors.

**Mechanism:** Temporarily flips `wed-upcoming`'s `visible` column to `false`. This is the actual lever the front-end uses to hide blocks — `getActiveBlock()` in index.html filters with `b.visible !== false` (status is not part of this filter). Wed is the only fixture class with a single visible block, so hiding it cleanly removes the class without affecting any other.

**Fixture role used:** `wed-upcoming` (its `visible` value is captured before the change and restored in `afterEach` regardless of pass/fail).

**Steps the test performs:**
1. Loads the booking page, baselines the visible class count
2. Reads the current `visible` value of `wed-upcoming` directly via the pg pool (fixture-lookup doesn't expose the column)
3. Captures the block ID and original `visible` value into describe-scope state BEFORE the UPDATE — this ordering guarantees `afterEach` can always restore even if the UPDATE itself fails
4. Runs `UPDATE blocks SET visible = false WHERE id = wed-upcoming.id` via the direct pg pool
5. Reloads the page so it re-fetches the blocks
6. Asserts `#grid .card` count is one less than baseline
7. Asserts no visible `.card-when-day` reads "Wednesday"

**Cleanup (`afterEach`):**
- Restores `wed-upcoming`'s `visible` column to its original value via the direct pg pool
- Runs unconditionally so a mid-test failure can't leave the fixture broken
- No `resyncBlockBookedCount` needed — booked count is unaffected by visibility changes

**What a fail would mean:**
A class with no active/upcoming blocks would still appear on the public page — visitors could click into a class that has nothing bookable, leading to dead ends and confusion. This is also the mechanism the "Block Warnings" dashboard banner relies on for its "X classes are not visible" diagnostic, so the front-end logic needs to stay in sync with that.

---

# Admin Clients (ACL) — Batch 8

### ACL-01 — Clients tab lists all customers

**What this proves:** When the admin logs in and opens the Clients tab, the customers table renders with the correct column structure and every seeded fixture customer appears in the body. This is the baseline view Louise relies on to find any client.

**Fixture roles used:** None directly — asserts against the three seeded customers `returning-one`, `returning-two`, and `admin-dummy` regardless of how many stray test customers also exist in the DB.

**Steps the test performs:**
1. Loads the booking page with `?env=test`
2. Asserts the TEST MODE banner is visible
3. Logs in as admin via `loginAsAdmin`
4. Clicks `#tab-customers` and asserts it gets the `.on` class
5. Waits for `#customers-tbody` to populate (initial `Loading...` placeholder replaced)
6. Asserts the header row has 6 `<th>` cells with text `Client | Email | Phone | Type | Priority | Actions`
7. For each of the three seeded customer emails, asserts a row exists with non-empty Client/Email/Type cells and that the Type cell reads `returning`
8. Asserts each seeded row contains a `.priority-badge` element in the Priority column
9. Signs out cleanly in `afterEach`

**What a fail would mean:**
The admin would either see a broken column layout (wrong headers, missing columns) or seeded customers wouldn't appear at all — which would mean Louise can't find clients she knows are in the system, or the table is rendering against a stale schema.

**Excel wording note:** The Excel scenario references a 5-column layout with a green/grey priority badge tied to the deprecated `customers.priority` column. The live UI has 6 columns and uses a three-state per-class badge model. The spec tests the live behaviour; the Excel will be updated to match.

---

### ACL-02 — Priority badges display correctly

**What this proves:** The overall Priority badge in the Clients tab correctly reflects all three priority states the system can render: Manual (when the customer has any row in `customer_class_priority`), Auto (when they have at least one confirmed booking but no manual grants), and Standard (when neither applies). Manual outranks Auto when both are present.

**Fixture roles used:**
- `returning-one` — has a seeded manual grant on the Wed class AND 3 confirmed bookings → should render as **Manual priority** (manual wins).
- `returning-two` — has 3 confirmed bookings and no manual grants → should render as **Auto priority**.
- A fresh per-run customer (no bookings, no grants) → should render as **Standard**.

**Steps the test performs:**
1. Loads the booking page with `?env=test` and asserts TEST MODE banner
2. Creates a per-run customer via `upsert_customer` RPC with no bookings or grants (Standard-state fixture)
3. Logs in as admin and opens the Clients tab
4. Waits for the customer table to finish loading
5. Locates the `returning-one@test.example` row and asserts its Priority cell badge contains the text `Manual priority`
6. Locates the `returning-two@test.example` row and asserts its Priority cell badge contains the text `Auto priority`
7. Locates the per-run customer's row and asserts its Priority cell badge has exact text `Standard` (no leading star)
8. `afterEach` deletes the per-run customer via `deleteCustomerCascade` and signs out

**Self-cleaning note:** The per-run customer ID is tracked at describe scope and assigned immediately after the `upsert_customer` call succeeds, so `afterEach` cleans it up regardless of where the rest of the test fails. The fixture customers (`returning-one`, `returning-two`) are read-only in this spec — their seeded state is what's under test.

**What a fail would mean:**
The visual signal Louise relies on to identify priority clients would be wrong: a Standard client might appear as Priority and get incorrectly favoured during a manual-priority audit, or a Manual-priority client might appear as Standard and lose the visibility Louise granted them.

**Excel wording note:** The Excel scenario lists only two badge states ("green Priority / grey Standard"). The live UI renders three states with manual > auto > standard precedence. The spec tests the live behaviour; the Excel will be updated to match.

---

# Appendix — What's NOT yet covered

The Coverage Tracker at the top of this document is the authoritative view of outstanding work. The summary table and per-tab tables give the full breakdown by Excel tab; the Suggested Batches table lays out the planned grouping for upcoming sessions.

**Outstanding totals:** 83 scenarios across 7 tabs (15 May 2026).

**Next session focus:** Batch 9 — Booking Windows (remaining BW scenarios). See the Suggested Batches table for full batch sequence.

> **Unblocked in Session 17:** The admin-login helper (`tests/helpers/admin-auth.js`) and direct-pg fixture helper (`tests/helpers/admin-db.js`) are reusable for the entire AB suite, all admin-driven Block Warnings / Settings / Admin Classes batches.

### Infrastructure backlog
- GitHub Actions CI (run tests automatically on every code push)
- Mobile Safari project for proper mobile coverage (currently CB-29/CB-30 use shrunken desktop viewports as a proxy)
- ~~Admin login helper~~ ✅ Added in Session 17 (`tests/helpers/admin-auth.js` + `tests/helpers/admin-db.js`)

---

## Glossary

- **Anon / anonymous user** — A website visitor who isn't logged in. The vast majority of users.
- **Authenticated user** — Louise, logged into the admin dashboard.
- **Block** — A specific date range of a class (e.g. "Monday Mixed Ability, 2 Feb – 9 Mar, 6 weeks").
- **CB / AB / PB** — Naming convention for test scenarios: Client Booking, Admin Booking, Priority Booking.
- **Fixture** — The seed data loaded into the test database at the start of a test run.
- **PAR-Q** — Physical Activity Readiness Questionnaire. The medical/emergency form new clients must complete.
- **Priority window** — 8-14 days before a block start date. Returning clients with priority can book early.
- **Standard window** — 0-7 days before a block start date. Open to all visitors.
- **Locked window** — More than 14 days before a block start date. Nobody can book yet.
- **RLS** — Row Level Security. The Postgres mechanism that controls which rows each user can see.
- **RPC** — Remote Procedure Call. A database function that runs with elevated permissions on behalf of a user.
- **Smoke test** — A fast, low-level test that checks basic infrastructure (can we read data? are permissions correct? does the page load?). These run quickly and fail fast if something foundational is wrong.
- **Trace** — Playwright's forensic recording of a test run, viewable with `npx playwright show-trace`.
