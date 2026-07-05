# LG Pilates Booking System — Test Plan

**Last updated:** 5 Jul 2026
**Total tests:** 239
**Test framework:** Playwright
**Test database:** `lg-pilates-test` (Supabase project `ngzfhamjuviwfwuncrjo`)

This document is generated from the live suite — do not edit by hand. Regenerate
after adding or removing tests:

```bash
cd tests-playwright
npm run test-plan
```

The full suite reseeds the test database automatically before running:

```bash
cd tests-playwright
npm test                 # full suite
npm run test:ui          # interactive UI runner — step through any test
npx playwright show-report   # video, trace and screenshots after a run
```

> Historical detail — the old Excel scenario tables, per-tab coverage tracker,
> build batches, and long-form per-test write-ups — now lives in
> `TEST-PLAN-HISTORY.md`.

---

## Smoke — 14 tests

| Spec file | Test |
|---|---|
| `smoke-01-anon-reads.spec.js` | anon can SELECT from classes and sees the 4 seed classes |
| `smoke-01-anon-reads.spec.js` | anon can SELECT from blocks and sees 11 seed blocks |
| `smoke-01-anon-reads.spec.js` | anon can SELECT from settings and sees bank details |
| `smoke-02-anon-rpcs.spec.js` | lookup_customer returns a known seed customer |
| `smoke-02-anon-rpcs.spec.js` | lookup_customer returns empty for unknown email |
| `smoke-02-anon-rpcs.spec.js` | check_priority_access returns TRUE for manual priority grant |
| `smoke-02-anon-rpcs.spec.js` | has_active_booking_on_block returns FALSE for a non-existent booking |
| `smoke-03-rls-enforcement.spec.js` | anon cannot SELECT from bookings |
| `smoke-03-rls-enforcement.spec.js` | anon cannot SELECT from customers |
| `smoke-03-rls-enforcement.spec.js` | anon cannot SELECT from cancellations |
| `smoke-03-rls-enforcement.spec.js` | anon cannot INSERT into bookings directly (grant blocks write) |
| `smoke-04-ui-page-loads.spec.js` | page loads and shows at least one class card |
| `smoke-04-ui-page-loads.spec.js` | page shows all three seeded class days |
| `smoke-04-ui-page-loads.spec.js` | TEST MODE banner is visible (proves env switch is active) |

## Client Booking (CB) — 35 tests

| Spec file | Test |
|---|---|
| `cb-01-new-client-happy-path.spec.js` | CB-01 / CB-12 — new client completes full 4-step booking and record lands in DB |
| `cb-01-new-client-happy-path.spec.js` | CB-21 — step indicator shows 4 pips for new client |
| `cb-01-new-client-happy-path.spec.js` | CB-28 — payment step shows "Step 4 of 4" for new client |
| `cb-01-new-client-happy-path.spec.js` | CB-04 — modal subtitle shows correct block |
| `cb-01-new-client-happy-path.spec.js` | CB-05 — payment reference shows name and class day |
| `cb-01-new-client-happy-path.spec.js` | CB-07 — capacity bar updates after booking |
| `cb-01-new-client-happy-path.spec.js` | CB-33 — PAR-Q record created for new client booking |
| `cb-02-parq-yes-shows-details.spec.js` | answering Yes to a PAR-Q question reveals the details textarea |
| `cb-03-returning-client-skips-parq.spec.js` | returning client jumps from Step 1 directly to Step 3 (Payment), skipping medical and emergency contact |
| `cb-06-required-fields-validation.spec.js` | empty Step 1 fields block advance and show validation errors |
| `cb-08-tcs-button-disabled-by-default.spec.js` | Reserve button starts disabled with hint visible at Step 3 entry |
| `cb-09-tcs-checkbox-enables-button.spec.js` | Ticking T&Cs enables Reserve button and hides hint |
| `cb-10-tcs-untick-disables-button.spec.js` | Unticking T&Cs returns button to disabled and reveals hint |
| `cb-11-tcs-resets-on-back-and-return.spec.js` | T&Cs checkbox is cleared when returning to Step 3 after Back |
| `cb-13-tcs-returning-client-completes-booking.spec.js` | Returning client books fri-upcoming after agreeing to T&Cs |
| `cb-14-step-indicator-on-open.spec.js` | opens with 4-pip layout, pip 1 active, pips 2-4 dim |
| `cb-15-step1-ticks-on-advance.spec.js` | pip 1 ticks, pip 2 activates, connector 1 done, modal scrolls top |
| `cb-16-step2-ticks-on-advance.spec.js` | pips 1 and 2 ticked, pip 3 active, connectors 1 and 2 done |
| `cb-16b-step3-ticks-on-advance.spec.js` | pips 1, 2 and 3 ticked, pip 4 active, all connectors done |
| `cb-17-back-from-payment.spec.js` | pip 4 dims, pip 3 reactivates, pips 1 and 2 keep ticks |
| `cb-18-returning-client-2step.spec.js` | pip 1 ticks, pip 2 (Payment) active, pips 3 and 4 hidden |
| `cb-19-returning-back-from-payment.spec.js` | returns to Step 1, pip 1 reactivates, layout still 2-step |
| `cb-20-modal-reopen-resets.spec.js` | reopened modal returns to step 1, all ticks cleared, 4-step layout |
| `cb-22-medical-step-layout.spec.js` | Step 2 shows banner, age, 12 questions, print name and declaration checkbox |
| `cb-23-age-validation.spec.js` | blank age blocks advance with "Age is required" validation |
| `cb-23-age-validation.spec.js` | age under 18 blocks advance with "at least 18" validation |
| `cb-24-declaration-required.spec.js` | un-ticked declaration blocks advance with validation toast |
| `cb-25-emergency-step-label.spec.js` | emergency contact step shows correct label, active pip 3, and only contact fields |
| `cb-26-emergency-phone-validation.spec.js` | short phone number triggers validation toast and blocks advance to payment |
| `cb-27-back-nav-emergency-to-details.spec.js` | back nav from emergency contact preserves data and updates pip state correctly |
| `cb-29-sticky-header.spec.js` | modal header stays visible after scrolling the medical form |
| `cb-30-medical-form-scrollable.spec.js` | all medical form content is reachable by scrolling the modal |
| `cb-31-duplicate-booking-already-booked-screen.spec.js` | returning client already booked on this block sees the already-booked screen |
| `cb-32-returning-client-not-on-block-welcome-back.spec.js` | returning client not yet on this block sees welcome-back message and proceeds to payment |
| `cb-34-rebook-after-success.spec.js` | modal opens cleanly after closing success screen from a prior booking |

## Priority Booking (PB) — 16 tests

| Spec file | Test |
|---|---|
| `pb-01-locked-window-not-open-yet.spec.js` | locked-window class card shows the disabled Not Open Yet button and 3-row info panel |
| `pb-02-priority-window-email-gate-shown.spec.js` | priority-window class card shows the email gate and Check My Priority button |
| `pb-04-priority-denied-ineligible-email.spec.js` | ineligible email entered into the priority gate is denied with the standard-open message |
| `pb-05-standard-window-direct-book.spec.js` | Friday card in the standard window shows a direct Book button and no priority gate |
| `pb-06-grant-manual-priority.spec.js` | grants Manual priority and the UI + DB both reflect the change |
| `pb-07-remove-manual-priority.spec.js` | removes Manual priority and the UI + DB both reflect the change |
| `pb-08-manual-priority-allows-early-access.spec.js` | client without a previous-block booking is denied access until admin grants Manual, then allowed |
| `pb-09-reserved-booking-priority-denied.spec.js` | client with only a reserved booking on the previous block is denied priority access |
| `pb-10-confirmed-booking-priority-granted.spec.js` | eligible client enters email in gate and proceeds through to a completed priority booking |
| `pb-x1-gate-input-validation.spec.js` | empty email: shows validation error, does not call RPC |
| `pb-x1-gate-input-validation.spec.js` | whitespace-only email: shows validation error, does not call RPC |
| `pb-x1-gate-input-validation.spec.js` | missing @ symbol: shows validation error, does not call RPC |
| `pb-x2-prefill-survives-close.spec.js` | email pre-fill persists when modal is closed and re-opened via gate |
| `pb-x3-class-isolation.spec.js` | Wed grant does not unlock priority on Mon or Fri |
| `pb-x4-cancelled-no-priority.spec.js` | cancelled status on previous block does not unlock priority |
| `pb-x5-grant-remove-cycle.spec.js` | grant unlocks gate, remove locks it again |

## Booking Windows (BW) — 3 tests

| Spec file | Test |
|---|---|
| `bw-01-only-one-block-no-next-section.spec.js` | Wednesday card has Book Current Block button and no .next-blk-toggle |
| `bw-02-current-block-session-dates-listed.spec.js` | Thursday card renders one date pill per session in chronological order |
| `bw-06-upcoming-becomes-active-on-start-date.spec.js` | Monday active block renders as current; upcoming block stays in next-block panel |

## Admin Bookings (AB) — 22 tests

| Spec file | Test |
|---|---|
| `ab-02-all-bookings-tab.spec.js` | AB-02 — All Bookings tab shows 7-column header and fixture booking rows |
| `ab-03-view-booking-details.spec.js` | AB-03 — View button opens detail overlay with booking and customer info |
| `ab-04-confirm-reserved-booking.spec.js` | AB-04 — Confirm button updates reserved booking to confirmed |
| `ab-05-06-remove-from-block.spec.js` | AB-05/AB-06 — Remove from Block deletes booking + parq, customer survives |
| `ab-07-delete-customer.spec.js` | AB-07 — Del Customer removes customer, booking, and parq from DB |
| `ab-08-09-rfb-zero-sessions.spec.js` | AB-08 — 0 sessions, not paid: no refund flow, cancellation record saved |
| `ab-08-09-rfb-zero-sessions.spec.js` | AB-09 — 0 sessions, client paid: full £60 refund shown and saved |
| `ab-10-by-class-tab.spec.js` | AB-10 — By Class tab groups blocks by class with Edit and Delete buttons |
| `ab-11-12-rfb-sessions-attended.spec.js` | AB-11 — 3 sessions attended: refund = 3 remaining × £10 = £30 |
| `ab-11-12-rfb-sessions-attended.spec.js` | AB-12 — refund override: calculated £40 overridden to £25, saved correctly |
| `ab-13-14-15-cancellations-tab.spec.js` | AB-13 — cancellation record appears in Cancellations tab after removal |
| `ab-13-14-15-cancellations-tab.spec.js` | AB-14 — Mark Refunded button present for owed refunds, absent for zero refunds |
| `ab-13-14-15-cancellations-tab.spec.js` | AB-15 — Mark Refunded: button disappears, amount turns green, DB updated |
| `ab-16-cancellations-csv-export.spec.js` | AB-16 — Export CSV downloads file with correct dated filename |
| `ab-17-18-dashboard-buttons.spec.js` | AB-17 — booking row shows correct action buttons, no stale Cancel/Refund |
| `ab-17-18-dashboard-buttons.spec.js` | AB-18 — sign-in button resets correctly on second sign-in after sign-out |
| `ab-19-20-21-missing-parq-banner.spec.js` | AB-19 — banner hidden when all new-client bookings have PAR-Q rows |
| `ab-19-20-21-missing-parq-banner.spec.js` | AB-20 — banner appears with singular wording when one PAR-Q is missing |
| `ab-19-20-21-missing-parq-banner.spec.js` | AB-21 — banner shows plural count; clicking highlights affected rows |
| `ab-22-parq-date-format.spec.js` | AB-22 — Declaration section shows "D MMM YYYY" date, not raw ISO |
| `ab-23-returning-client-parq-view.spec.js` | AB-23 — returning client booking shows PAR-Q from previous booking with badge |
| `ab-24-rfb-midblock-joiner.spec.js` | AB-24 — mid-block joiner paid £40: refund = £40 not £60 |

## Admin Classes (AC) — 26 tests

| Spec file | Test |
|---|---|
| `ac-01-add-new-class.spec.js` | new class appears in Upcoming Classes table after creation |
| `ac-02-add-block-to-class.spec.js` | block appears in By Class tab and class becomes visible on schedule |
| `ac-03-block-start-day-mismatch.spec.js` | wrong-day start date shows red error and block is not saved |
| `ac-04-edit-block.spec.js` | updated price and capacity shown in By Class tab after save |
| `ac-05-delete-block.spec.js` | block removed from accordion and class hidden on schedule after deletion |
| `ac-06-edit-class-slot.spec.js` | updated venue and time shown on public booking page after save |
| `ac-07-delete-class.spec.js` | class deleted — toast shown, row gone, class absent from schedule |
| `ac-08-class-hidden-no-blocks.spec.js` | class absent from public schedule after its only block is deleted |
| `ac-09-add-class-anon-rejected.spec.js` | anon INSERT on classes is rejected by RLS |
| `ac-10-edit-class-anon-rejected.spec.js` | anon UPDATE on classes is rejected by RLS |
| `ac-11-add-block-anon-rejected.spec.js` | anon INSERT on blocks is rejected by RLS |
| `ac-12-warning-banner-shows-time.spec.js` | red and yellow banners both show class name including day and time |
| `ac-13-add-block-modal-subtitle.spec.js` | modal subtitle includes class name, day, and time when opened from advisory banner |
| `ac-14-prefill-from-advisory.spec.js` | yellow advisory Add Block button prefills start date with end_date + 7 days |
| `ac-15-red-banner-no-prefill.spec.js` | red banner Add Block opens modal with empty start date field |
| `ac-16-prevent-overlap.spec.js` | start date overlapping existing block shows overlap error and does not save |
| `ac-17-prevent-same-day-start.spec.js` | start date equal to existing block end_date shows same-day error |
| `ac-18-edit-block-overlap.spec.js` | editing a block to overlap another block shows overlap error |
| `ac-19-20-21-22-auto-ampm.spec.js` | AC-19 — 24hr time (18:30) is converted to 6:30pm on blur |
| `ac-19-20-21-22-auto-ampm.spec.js` | AC-20 — bare hour:minute (9:45) gets am suffix added on blur |
| `ac-19-20-21-22-auto-ampm.spec.js` | AC-21 — already-formatted input (10:00am) is left unchanged on blur |
| `ac-19-20-21-22-auto-ampm.spec.js` | AC-22 — End Time field also converts 24hr (19:15 → 7:15pm) |
| `ac-23-delete-class-with-bookings.spec.js` | deleting a class with bookings and PAR-Qs shows success toast and removes class |
| `ac-24-block-validation.spec.js` | AC-24a — negative price is rejected with validation error |
| `ac-24-block-validation.spec.js` | AC-24b — zero capacity is rejected with validation error |
| `ac-24-block-validation.spec.js` | AC-24c — zero weeks is rejected with validation error |

## Admin Clients (ACL) — 2 tests

| Spec file | Test |
|---|---|
| `acl-01-clients-tab-lists-customers.spec.js` | Clients tab renders the customer table with all seeded fixture clients |
| `acl-02-priority-badges-display.spec.js` | overall Priority column shows Manual / Auto / Standard badges per client state |

## Schedule Display (SD) — 6 tests

| Spec file | Test |
|---|---|
| `sd-01-all-classes-load.spec.js` | grid renders one card per class with an active or upcoming block |
| `sd-02-filter-by-baildon.spec.js` | only Baildon classes shown and day filter buttons appear |
| `sd-03-filter-by-guiseley.spec.js` | only Guiseley classes shown |
| `sd-04-filter-by-day.spec.js` | Baildon + Monday shows only Baildon Monday classes |
| `sd-05-reset-all-classes.spec.js` | clicking All Classes after a filter restores full grid and hides day buttons |
| `sd-06-class-without-blocks-hidden.spec.js` | hiding a class's only visible block removes it from the grid |

## Settings & Export (SE) — 21 tests

| Spec file | Test |
|---|---|
| `se-01-save-bank-details.spec.js` | SE-01 — admin saves bank details and sees confirmation toast |
| `se-02-bank-details-payment-screen.spec.js` | SE-02 — bank details visible on payment step of booking modal |
| `se-03-bank-details-success-screen.spec.js` | SE-03 — bank details visible on success/confirmation screen |
| `se-04-export-classes-csv.spec.js` | SE-04 — Export Classes button downloads a classes CSV |
| `se-05-export-blocks-csv.spec.js` | SE-05 — Export Blocks button downloads a blocks CSV |
| `se-06-export-customers-csv.spec.js` | SE-06 — Export Customers button downloads a customers CSV |
| `se-07-export-bookings-csv.spec.js` | SE-07 — Export Bookings button downloads a bookings CSV |
| `se-08-export-everything.spec.js` | SE-08 — Export Everything downloads a full backup CSV with all 5 table sections |
| `se-09-csv-formula-injection.spec.js` | SE-09 — formula injection character is escaped with apostrophe in exported CSV |
| `se-10-notification-email-loads.spec.js` | SE-10 — notification email field is populated on dashboard load |
| `se-11-notification-email-saves.spec.js` | SE-11 — admin saves notification email and value persists to DB |
| `se-12-booking-reserved-email.spec.js` | Edge Function called with correct recipient, subject, and isTest flag |
| `se-13-booking-confirmed-email.spec.js` | Edge Function called with correct recipient, subject, isTest, and HTML on confirm |
| `se-14-admin-alert-email.spec.js` | Admin alert email sent on new-client reserve — correct payload and PAR-Q flag |
| `se-14-admin-alert-email.spec.js` | Admin alert email sent on returning-client reserve — no PAR-Q flag |
| `se-15-cancellation-emails.spec.js` | no email fires when a client is removed via RFB modal with sessions attended |
| `se-16-refund-emails.spec.js` | both refund emails fire when Louise marks a cancellation as refunded |
| `se-17-block-email.spec.js` | Email this block sends one email per client plus an admin confirmation copy |
| `se-18-payment-mode-card-visible.spec.js` | SE-18: payment mode card is visible on Settings page |
| `se-19-payment-mode-toggle-persists.spec.js` | SE-19: toggling payment mode to Stripe and back persists correctly |
| `se-20-stripe-pk-saves-reloads.spec.js` | SE-20: Stripe publishable key saves and reloads correctly |

## Edge Cases (EC) — 15 tests

| Spec file | Test |
|---|---|
| `ec-01-full-class-booking-prevented.spec.js` | a block with booked = cap shows Full badge and disabled book button |
| `ec-03-invalid-email-format.spec.js` | entering an invalid email shows a validation toast and the modal stays on Step 1 |
| `ec-04-block-wrong-day-rejected.spec.js` | picking a Friday date for a Wednesday class shows error and creates no block row |
| `ec-05-page-no-active-classes.spec.js` | hiding every active/upcoming block produces the "No classes available" empty state |
| `ec-06-long-text-in-booking-form.spec.js` | 100-char first name is capped at 50 chars by the input, booking completes, admin row renders |
| `ec-07-overbooking-race-condition.spec.js` | Reserve click after block fills during booking shows CLASS_FULL toast and creates no booking |
| `ec-08-duplicate-booking-server-side.spec.js` | book_if_available raises ALREADY_BOOKED for second attempt on same block |
| `ec-09-reserve-button-disabled-during-submission.spec.js` | Reserve button disables (text unchanged) after click |
| `ec-10-capacity-bar-resets-after-bulk-delete.spec.js` | bulk-delete then resync brings cap-txt to "0 of cap spots taken" |
| `ec-11-capacity-bar-updates-after-app-booking.spec.js` | booking via app increments capacity bar by 1 after reload |
| `ec-12-db-unique-index-rejects-duplicate.spec.js` | direct INSERT of duplicate (customer, block) fails with unique-violation |
| `ec-13-rpc-returns-already-booked.spec.js` | RPC returns ALREADY_BOOKED for a customer/block pair with existing booking |
| `ec-14-not-null-constraints.spec.js` | customers.email NOT NULL: INSERT without email fails with 23502 |
| `ec-14-not-null-constraints.spec.js` | classes.name NOT NULL: INSERT without name fails with 23502 |
| `ec-14-not-null-constraints.spec.js` | blocks.class_id NOT NULL: INSERT with NULL class_id fails with 23502 |

## Block Warnings (BLW) — 10 tests

| Spec file | Test |
|---|---|
| `blw-01-red-alert-no-block.spec.js` | red banner appears when all blocks for a class are hidden |
| `blw-02-yellow-advisory-no-next-block.spec.js` | yellow banner appears when class has active block but no upcoming block |
| `blw-03-both-banners.spec.js` | red and yellow banners both render when both conditions are present |
| `blw-04-add-block-button-opens-modal.spec.js` | Add Block button in red banner opens modal for the correct class |
| `blw-05-banner-disappears-after-add.spec.js` | banner row disappears after successfully adding a block |
| `blw-06-no-banners-all-covered.spec.js` | no warning banners shown when all classes have two or more visible blocks |
| `blw-07-yellow-advisory-prefills-date.spec.js` | Add Block in advisory banner prefills date = active block end + 7 days |
| `blw-08-class-name-and-time-in-row.spec.js` | warning row shows class name, day, time and venue for the affected class |
| `blw-09-pending-refund-warning.spec.js` | orange warning banner appears when a cancellation is awaiting a refund decision |
| `blw-09-pending-refund-warning.spec.js` | orange warning disappears after cancellation is marked as refunded |

## Security (SEC) — 24 tests

| Spec file | Test |
|---|---|
| `sec-01-send-email-relay-closed.spec.js` | anon key cannot send a raw arbitrary-recipient/HTML email |
| `sec-01-send-email-relay-closed.spec.js` | missing Authorization header is rejected on the raw path |
| `sec-01-send-email-relay-closed.spec.js` | public type path is reachable with the anon key but is bound to a real booking |
| `sec-02-anon-settings-read.spec.js` | SEC-02 — anon can SELECT settings rows directly |
| `sec-02-anon-settings-read.spec.js` | SEC-02 — bank details render on payment screen for anon user |
| `sec-03-checkout-price-tampering.spec.js` | a forged 1p amount_pence is ignored — pending row gets the real server-computed price |
| `sec-03-checkout-price-tampering.spec.js` | a block_id that does not belong to the given class_id is rejected |
| `sec-06-admin-dashboard-tour.spec.js` | SEC-06 — admin can sign in and reach the dashboard |
| `sec-06-admin-dashboard-tour.spec.js` | SEC-06 — all 4 dashboard tabs render their panels |
| `sec-06-admin-dashboard-tour.spec.js` | SEC-06 — below-tab sections (Upcoming Classes, Settings, Backup & Export) render |
| `sec-07-anon-grant-matrix.spec.js` | SEC-07 — anon grant matrix matches the documented spec |
| `sec-08-email-name-escaping.spec.js` | index.html sanitise() escapes angle brackets and quotes |
| `sec-08-email-name-escaping.spec.js` | index.html buildConfirmedEmailHtml escapes firstName |
| `sec-08-email-name-escaping.spec.js` | index.html buildCancelledAdminEmailHtml escapes firstName, lastName and email |
| `sec-08-email-name-escaping.spec.js` | index.html buildRefundClientEmailHtml escapes firstName |
| `sec-08-email-name-escaping.spec.js` | index.html buildRefundAdminEmailHtml escapes firstName, lastName and email |
| `sec-08-email-name-escaping.spec.js` | stripe-webhook mirror: buildConfirmedEmailHtml escapes firstName |
| `sec-08-email-name-escaping.spec.js` | stripe-webhook mirror: buildAdminAlertEmailHtml escapes firstName and lastName |
| `sec-09-book-rpc-price-tampering.spec.js` | a forged 1p amount_due is ignored — booking row gets the server-computed price |
| `sec-09-book-rpc-price-tampering.spec.js` | a forged class_id is rejected with CLASS_MISMATCH and no booking is created |
| `sec-10-send-email-one-shot.spec.js` | reserved_confirmation: first call sends, second call is refused with 429 |
| `sec-10-send-email-one-shot.spec.js` | new_booking_alert: first call sends, second call is refused with 429 |
| `sec-10-send-email-one-shot.spec.js` | a concurrent burst yields exactly one accepted send |
| `sec-11-admin-users-gate.spec.js` | SEC-11 — non-admin authenticated user gets zero rows / rejected writes |

## Stripe (ST) — 25 tests

| Spec file | Test |
|---|---|
| `st-01-stripe-toggle-visible.spec.js` | ST-01: payment mode toggle is visible in admin Settings |
| `st-02-save-bank-transfer.spec.js` | ST-02: save payment mode as bank transfer persists correctly |
| `st-03-save-stripe-mode.spec.js` | ST-03: save payment mode as Stripe with publishable key persists correctly |
| `st-04-pk-field-hidden-bank-transfer.spec.js` | ST-04: Stripe publishable key field hidden when bank transfer is selected |
| `st-05-pk-field-shown-stripe.spec.js` | ST-05: Stripe publishable key field shown when Stripe mode is selected |
| `st-06-invalid-pk-rejected.spec.js` | ST-06: invalid Stripe publishable key is rejected on save |
| `st-07-step4-bank-transfer-mode.spec.js` | bank transfer section visible, Stripe section hidden, Reserve button shown |
| `st-08-step4-stripe-mode.spec.js` | Stripe section visible, bank transfer section hidden, Proceed to Payment button shown |
| `st-16-stripe-badge-topbar.spec.js` | ST-16: STRIPE MODE badge visible in topbar when Stripe mode is active |
| `st-17-stripe-checkout-creates-pending-row.spec.js` | Proceed to Payment creates a pending_bookings row and redirects to Stripe, with no bookings row added |
| `st-18-stripe-cancel-redirect-preserves-pending.spec.js` | shows cancellation toast and leaves the pending_bookings row untouched |
| `st-19-webhook-success-confirms-booking.spec.js` | booking is confirmed with stripe_payment_intent_id and stripe_checkout_session_id populated |
| `st-20-webhook-success-saves-parq.spec.js` | parq row is created with correct field mapping and all 12 question answers |
| `st-21-client-confirmation-email-template.spec.js` | Sessions row shows past dates greyed and upcoming dates teal, with correct booking details |
| `st-22-admin-alert-email-template.spec.js` | subject mentions card payment and includes client name, class and venue |
| `st-22-admin-alert-email-template.spec.js` | new client: body shows client name, amount paid, and PAR-Q warning box |
| `st-22-admin-alert-email-template.spec.js` | returning client: body shows client name and amount paid, no PAR-Q warning box |
| `st-22-admin-alert-email-template.spec.js` | no dashboardUrl: dashboard link is omitted |
| `st-23-webhook-class-full-retains-pending.spec.js` | returns booking_failed_after_payment, pending row retained, no bookings row created |
| `st-24-webhook-already-booked-retains-pending.spec.js` | returns booking_failed_after_payment, pending row retained, existing booking untouched |
| `st-25-webhook-invalid-signature-rejected.spec.js` | missing stripe-signature header returns 400 and leaves pending row untouched |
| `st-25-webhook-invalid-signature-rejected.spec.js` | incorrect signature returns 400 and leaves pending row untouched |
| `st-26-webhook-duplicate-delivery.spec.js` | second delivery returns 200 with no booking_id, no duplicate booking created |
| `st-27-webhook-stale-timestamp-rejected.spec.js` | timestamp older than the 5-minute tolerance returns 400 and leaves pending row untouched |
| `st-27-webhook-stale-timestamp-rejected.spec.js` | fresh timestamp on the same payload is accepted (proves only stale events are rejected) |

## Refund Sync (RF) — 6 tests

| Spec file | Test |
|---|---|
| `rf-01-cancellation-preserves-stripe-intent.spec.js` | RF-01a — card booking: stripe_payment_intent_id preserved on cancellation |
| `rf-01-cancellation-preserves-stripe-intent.spec.js` | RF-01b — bank-transfer booking: cancellation intent is NULL |
| `rf-02-03-04-mark-refunded-stripe.spec.js` | RF-02a — card cancellation issues a real Stripe refund for the full amount |
| `rf-02-03-04-mark-refunded-stripe.spec.js` | RF-02b — refund equals the stored overridden amount, not the full price |
| `rf-02-03-04-mark-refunded-stripe.spec.js` | RF-03 — bank-transfer cancellation keeps the manual flow (no Stripe call) |
| `rf-02-03-04-mark-refunded-stripe.spec.js` | RF-04 — Stripe failure leaves the row unrefunded and surfaces an error |

## Catch-Up Swaps (CU) — 10 tests

| Spec file | Test |
|---|---|
| `cu-01-catchup-swaps.spec.js` | CU-01 — Catch-up swaps nav item is present and page loads with info text |
| `cu-01-catchup-swaps.spec.js` | CU-02 — Record a catch-up swap via UI and it appears in the list |
| `cu-01-catchup-swaps.spec.js` | CU-03 — record_catch_up_swap RPC rejects a swap at capacity; anon cannot call it |
| `cu-01-catchup-swaps.spec.js` | CU-04 — 3rd swap on a source block warns, offers Cancel/Save Anyway, and the DB still gates without the override flag |
| `cu-01-catchup-swaps.spec.js` | CU-05 — Delete a catch-up swap removes it from the list |
| `cu-01-catchup-swaps.spec.js` | CU-06 — Catch-up visitor appears in By Class accordion for the target block |
| `cu-01-catchup-swaps.spec.js` | CU-07 — Over-capacity warning appears in the top dashboard banner when a swap pushes attendance above cap |
| `cu-01-catchup-swaps.spec.js` | CU-08 — Class and week pickers show spaces left, mark full options FULL and disable them |
| `cu-01-catchup-swaps.spec.js` | CU-09 — Two saves into the last space: first succeeds, second is rejected by the DB |
| `cu-01-catchup-swaps.spec.js` | CU-10 — Modal uses plain labels and auto-selects the usual class for a single-block customer |

## Pricing / Prorata (PR) — 4 tests

| Spec file | Test |
|---|---|
| `pr-01-prorata-year-boundary.spec.js` | mid-block in January → prorated for the 2 remaining sessions, not full price |
| `pr-01-prorata-year-boundary.spec.js` | one session left in January → charge for exactly that session |
| `pr-01-prorata-year-boundary.spec.js` | before the block starts → full price, not prorated |
| `pr-01-prorata-year-boundary.spec.js` | after the block ends → zero remaining, full price fallback (never negative) |

---

## Fixture roles (the seeded test data)

Every test runs against pre-seeded blocks across 4 classes. Roles are stable,
block IDs are not — tests look up blocks by role, never by hardcoded ID
(`getBlockByRole(role)` in `helpers/fixture-lookup.js`).

| Role | Class | State | Purpose |
|---|---|---|---|
| `mon-past` | Mon Mixed Ability | Completed | Historical record; priority-source for returning customers |
| `mon-current` | Mon Mixed Ability | Active (mid-run) | Bookable current block; new-client happy paths |
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
