// tests/helpers/booking-flow.js
//
// Shared booking-modal actions used across the CB spec files.
//
// These helpers DO NOT make assertions — they just perform the UI actions.
// Each spec is responsible for its own expect() calls so failures point at
// the spec, not the helper.
//
// Timing notes:
//   - goStep2() in index.html has a 2.5s setTimeout before transitioning
//     to either Step 2 (new client) or Step 3 (returning).
//   - Already-booked detection adds an extra 1.2s delay before the view swaps.
//   - Helpers use explicit waitFor's so specs don't have to know the delays.

const { expect } = require('@playwright/test');

const DEFAULT_NEW_CLIENT = {
  firstName: 'Test',
  lastName:  'Client',
  // Email is ALWAYS overridden per-test with a unique timestamped value —
  // never use this default directly or specs will collide.
  email:     'override-me@test.example',
  phone:     '07700900123'
};

/**
 * Open the booking modal for the first visible class card matching `day`.
 * `day` is a string like "Monday", "Wednesday", "Friday" — matches the
 * `card-when-day` text rendered inside each class card.
 *
 * `which` is 'current' (default) or 'next' — picks Book Current Block or
 * the "Book Next Block" button inside the next-block panel.
 */
async function openBookingModal(page, day, which = 'current') {
  // Find the class card containing the day name
  const card = page.locator('.card').filter({ has: page.locator('.card-when-day', { hasText: day }) }).first();
  await expect(card, `expected a class card for ${day}`).toBeVisible({ timeout: 10000 });

  const btnLabel = which === 'next' ? 'Book Next Block' : 'Book Current Block';
  await card.getByRole('button', { name: btnLabel }).click();

  // Modal opens — wait for step 1 to be visible
  await expect(page.locator('#overlay.on')).toBeVisible();
  await expect(page.locator('#step-1')).toBeVisible();
}

/**
 * Fill Step 1 (Your Details) and click Continue.
 * Does NOT wait for the transition — the caller decides what to wait for
 * (new-client flow → step-2a visible, returning → step-3 visible,
 * already-booked → already-booked-view visible).
 */
async function fillStep1(page, details) {
  await page.locator('#b-firstname').fill(details.firstName);
  await page.locator('#b-lastname').fill(details.lastName);
  await page.locator('#b-email').fill(details.email);
  await page.locator('#b-phone').fill(details.phone);
  await page.locator('#step-1 .step-btn').click();
}

/**
 * Fill Step 2a (Medical Questions) for a NEW client with all-clear answers:
 * - Age set to the provided value (default 34)
 * - All 12 PAR-Q questions stay No (default on modal open)
 * - Print name filled
 * - Declaration checkbox ticked
 *
 * If `yesQuestions` is a non-empty array of 1-12, those questions get set to
 * Yes and the "please provide details" textarea is populated.
 */
async function fillStep2Medical(page, { age = 34, printName = 'Test Client', yesQuestions = [], yesDetails = 'Test details' } = {}) {
  await expect(page.locator('#step-2a')).toBeVisible();
  await page.locator('#b-age').fill(String(age));

  for (const qNum of yesQuestions) {
    await page.locator(`input[name="q${qNum}"][value="Yes"]`).check();
  }
  if (yesQuestions.length > 0) {
    await expect(page.locator('#parq-yes-section')).toBeVisible();
    await page.locator('#b-health-conditions').fill(yesDetails);
  }

  await page.locator('#b-print-name').fill(printName);
  await page.locator('#b-declaration').check();
  await page.locator('#step-2a .step-btn', { hasText: 'Continue' }).click();
}

/**
 * Fill Step 2b (Emergency Contact) and click Continue.
 */
async function fillStep2Emergency(page, { name = 'Jane Doe', relationship = 'Spouse', phone = '07700900456' } = {}) {
  await expect(page.locator('#step-2b')).toBeVisible();
  await page.locator('#b-emergency-name').fill(name);
  await page.locator('#b-emergency-relationship').fill(relationship);
  await page.locator('#b-emergency-phone').fill(phone);
  await page.locator('#step-2b .step-btn', { hasText: 'Continue' }).click();
}

/**
 * On the payment step, tick the T&Cs checkbox and click Reserve.
 * Waits for the step 3 panel to be visible first.
 */
async function agreeAndReserve(page) {
  await expect(page.locator('#step-3')).toBeVisible();
  await page.locator('#tcs-agree').check();
  await expect(page.locator('#reserve-btn')).toBeEnabled();
  await page.locator('#reserve-btn').click();
}

/**
 * Generate a unique test email for a spec.
 * Format: cb{specNumber}-{timestamp}@test.example
 *   e.g. cb01-1745000000000@test.example
 *
 * Using @test.example keeps test accounts easy to find and clean up.
 */
function uniqueTestEmail(specNumber) {
  return `cb${String(specNumber).padStart(2, '0')}-${Date.now()}@test.example`;
}

module.exports = {
  DEFAULT_NEW_CLIENT,
  openBookingModal,
  fillStep1,
  fillStep2Medical,
  fillStep2Emergency,
  agreeAndReserve,
  uniqueTestEmail
};
