// @ts-check
const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { sb } = require('./helpers/supabase');
const { getBlockByRole } = require('./helpers/fixture-lookup');
const {
  deleteCustomerCascade,
  setBookingStatus,
  getPool
} = require('./helpers/admin-db');

// ─── BLW-09 — Pending refund warning banner ──────────────────────────────────
// When there are cancellations with refund_amount > 0 and refunded = false,
// an orange advisory banner appears in the block warnings section showing
// the count and a "View Cancellations" button.
// ─────────────────────────────────────────────────────────────────────────────

const TEST_EMAIL = 'blw09-refund@test.example';
const TEST_FIRST = 'BLW09';
const TEST_LAST  = 'RefundWarn';

test.describe('BLW-09 — Pending refund warning banner', () => {
  let createdCustomerId = null;
  let cancellationId    = null;

  test.beforeEach(async () => {
    createdCustomerId = null;
    cancellationId    = null;

    const monCurrent = await getBlockByRole('mon-current');

    const { data: custData, error: custErr } = await sb.rpc('upsert_customer', {
      p_first_name:    TEST_FIRST,
      p_last_name:     TEST_LAST,
      p_email:         TEST_EMAIL,
      p_phone:         '07700000019',
      p_customer_type: 'returning'
    });
    expect(custErr).toBeNull();
    createdCustomerId = custData;

    const { data: bookingId, error: bookErr } = await sb.rpc('book_if_available', {
      p_block_id:    monCurrent.id,
      p_class_id:    monCurrent.class_id,
      p_customer_id: createdCustomerId,
      p_amount_due:  60
    });
    expect(bookErr).toBeNull();
    await setBookingStatus(bookingId, 'confirmed');

    // Insert a cancellation row with refund_amount > 0 and refunded = false
    const pool = getPool();
    const result = await pool.query(`
      INSERT INTO cancellations (
        customer_id, class_id, block_id,
        first_name, last_name, email,
        class_name, venue, block_start_date, block_end_date,
        sessions_attended, sessions_remaining,
        price_per_session, refund_amount,
        refunded, cancelled_at
      ) VALUES (
        $1, $2, $3,
        $4, $5, $6,
        'Mixed Ability', 'Baildon Moravian Church',
        CURRENT_DATE - 7, CURRENT_DATE + 35,
        2, 4,
        10.00, 40.00,
        false, NOW()
      ) RETURNING id
    `, [createdCustomerId, monCurrent.class_id, monCurrent.id,
        TEST_FIRST, TEST_LAST, TEST_EMAIL]);
    cancellationId = result.rows[0].id;
  });

  test.afterEach(async () => {
    const pool = getPool();
    if (cancellationId) {
      await pool.query('DELETE FROM cancellations WHERE id = $1', [cancellationId]);
    }
    if (createdCustomerId) {
      await deleteCustomerCascade(createdCustomerId);
    }
  });

  test('orange warning banner appears when a cancellation is awaiting a refund decision', async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner')).toHaveClass(/on/);

    await loginAsAdmin(page);

    // Wait for block warnings to render (async DB call inside renderBlockWarnings)
    const warningBanner = page.locator('#block-warnings');
    await expect(warningBanner).toBeVisible({ timeout: 10000 });

    // Assert the orange refund warning is present
    await expect(warningBanner).toContainText('awaiting a refund decision', { timeout: 5000 });
    // Count will vary depending on stray rows — just assert the warning is present (checked above)

    // Assert View Cancellations button is present
    const viewBtn = warningBanner.locator('button', { hasText: 'View Cancellations' });
    await expect(viewBtn).toBeVisible();

    // Clicking View Cancellations switches to the Cancellations tab
    await viewBtn.click();
    await expect(page.locator('#dbnav-cancellations')).toHaveClass(/on/);
  });

  test('orange warning disappears after cancellation is marked as refunded', async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner')).toHaveClass(/on/);

    await loginAsAdmin(page);

    const warningBanner = page.locator('#block-warnings');
    await expect(warningBanner).toContainText('awaiting a refund decision', { timeout: 10000 });

    // Read the current count from the banner text
    const bannerText = await warningBanner.innerText();
    const countMatch = bannerText.match(/(\d+) cancellation/);
    const countBefore = countMatch ? parseInt(countMatch[1]) : 0;

    // Mark the cancellation as refunded via direct pg
    const pool = getPool();
    await pool.query(
      `UPDATE cancellations SET refunded = true, refunded_at = NOW() WHERE id = $1`,
      [cancellationId]
    );

    // Re-render the dashboard
    await page.evaluate(() => renderDashboard());

    // Count should have decreased by 1
    if (countBefore === 1) {
      // Was the only one — warning should disappear entirely
      await expect(warningBanner).not.toContainText('awaiting a refund decision', { timeout: 5000 });
    } else {
      // Other pending refunds remain — count should be one less
      const expectedCount = countBefore - 1;
      await expect(warningBanner).toContainText(expectedCount + ' cancellation', { timeout: 5000 });
    }
  });
});
