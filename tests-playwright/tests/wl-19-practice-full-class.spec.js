// tests/wl-19-practice-full-class.spec.js
//
// WL-19 — The Training Hub's practice full class (migration 32, #114) shows
//         "Join Waiting List" on the public booking page.
//
// Lesson 2.5 of the Training Hub tells Louise to find a class with a Join
// Waiting List button on the practice copy. This guards that the reseed
// leaves one there: the class's CURRENT block is full (cap 2, 2 booked), so
// the card's main button is the waiting-list one, not "Book Current Block".
//
// Read-only: asserts on the fixture, changes nothing, so no cleanup.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { getBlockByRole } = require('./helpers/fixture-lookup');

const PRACTICE_CLASS_NAME = 'Practice – Full Class';

test.describe('WL-19 — Practice full class for the Training Hub', () => {
  test.skip(!process.env.TEST_APP_URL, 'TEST_APP_URL not set');

  test('WL-19 — practice full class card offers Join Waiting List', async ({ page }) => {
    const block = await getBlockByRole('practice-full');
    expect(block.cap, 'practice block has 2 seats').toBe(2);
    expect(block.booked, 'practice block is full after reseed').toBe(2);

    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });

    const card = page.locator('.card').filter({
      has: page.locator('.card-when-name', { hasText: PRACTICE_CLASS_NAME })
    });
    await expect(card).toHaveCount(1, { timeout: 10000 });
    await expect(card).toContainText('Block full');
    await expect(card.locator('.card-price-row .book-btn.wait', { hasText: 'Join Waiting List' })).toBeVisible();
    await expect(card.locator('.book-btn', { hasText: 'Book Current Block' })).toHaveCount(0);
  });
});
