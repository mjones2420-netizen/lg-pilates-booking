// tests/mb-06-byclass-and-clients.spec.js
//
// MB (Mobile Dashboard) — MB-06: By Class and the Clients per-class panel.
//
// Scenario:
//   Given: the By Class page on a phone
//   When:  a class group is expanded
//   Then:  the block card shows its status as an eyebrow label, every booking
//          on the block is reachable by scrolling, and the block's own
//          Edit / Email / Delete buttons are reachable in the footer strip —
//          none of it clipped. (Clipping was one of the three layout faults
//          found while clicking the prototype: a flex child with
//          overflow:hidden gets squashed instead of making the page scroll.)
//
//   And:   on the Clients page, the Per-class priority panel still opens and
//          still offers Grant / Remove — it is the one row that must NOT
//          become an expandable card.
//
// Read-only spec — opens panels but changes no priority, no DB writes.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');

const APP_URL = process.env.TEST_APP_URL;
const PHONE = { width: 390, height: 844 };

test.describe('MB-06 — By Class and Clients on mobile', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — MB specs require the app to be served.');
  test.use({ viewport: PHONE });

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner must be visible'
    ).toBeVisible({ timeout: 5000 });
    await loginAsAdmin(page);
    await expect(page.locator('#btbody tr').first()).not.toContainText('Loading...', { timeout: 15000 });
  });

  test('MB-06a — block card, its bookings and its footer buttons are all reachable', async ({ page }) => {
    await page.locator('#dbbn-byclass').click();
    await expect(page.locator('#dbpage-byclass.on')).toBeVisible();

    const group = page.locator('#classes-accordion .class-group-header').first();
    await expect(group).toBeVisible({ timeout: 10000 });
    await group.click();

    // Status now reads as an eyebrow label above the card, not an inline pill.
    const eyebrow = page.locator('#classes-accordion .blk-eyebrow').first();
    await expect(eyebrow).toBeVisible();
    await expect(eyebrow).toContainText(/Active block|Upcoming block/i);
    await expect(page.locator('#classes-accordion .blk-badge-inline').first()).toBeHidden();

    // The block's own buttons live in the footer strip and are clickable —
    // i.e. inside the scrollable area, not clipped out of the layout.
    const footer = page.locator('#classes-accordion .blk-actions').first();
    await footer.scrollIntoViewIfNeeded();
    await expect(footer).toBeVisible();
    const editBtn = footer.getByRole('button', { name: 'Edit Block' });
    await expect(editBtn).toBeVisible();
    const box = await editBtn.boundingBox();
    expect(box, 'Edit Block button should have a box').not.toBeNull();
    expect(box.width, 'Edit Block button must not be clipped to zero width').toBeGreaterThan(20);

    // Every person on the block renders as a row and can be expanded.
    // Asserted, not guarded by an if: a fixture reshuffle that put an empty
    // class group first would otherwise skip this silently and still pass.
    const personRows = page.locator('#classes-accordion table:not(.m-flat) tbody tr');
    await expect(
      personRows.first(),
      'first class group must carry at least one booking for this check to mean anything'
    ).toBeVisible({ timeout: 10000 });

    const first = personRows.first();
    await first.scrollIntoViewIfNeeded();
    const emailCell = first.locator('td[data-label="Email"]');
    await expect(emailCell).toBeHidden();
    await first.locator('td').first().click();
    await expect(first).toHaveClass(/\bm-open\b/);
    await expect(emailCell).toBeVisible();
  });

  test('MB-06b — expanding a client reveals the per-class priority panel in one tap', async ({ page }) => {
    await page.locator('#dbbn-clients').click();
    await expect(page.locator('#dbpage-clients.on')).toBeVisible();

    // The "Per-class" button lives in the actions cell, which is detail on
    // mobile — so it is present but hidden until the row is expanded.
    const perClassBtn = page.locator('#customers-tbody button', { hasText: 'Per-class' }).first();
    await expect(perClassBtn).toBeAttached({ timeout: 15000 });
    await expect(perClassBtn).toBeHidden();

    const custId = await perClassBtn.evaluate(
      b => b.getAttribute('onclick').match(/toggleCustPriorityPanel\((\d+)\)/)[1]
    );
    const panel = page.locator(`#cust-panel-${custId}`);
    // The panel row keeps the m-plain marker — it is a panel, not a record, so
    // the mobile card styling and the row expander both skip it.
    await expect(panel).toHaveClass(/\bm-plain\b/);
    await expect(panel).toBeHidden();

    // One tap on the client row opens both the detail and the priority panel.
    const row = page.locator(`#cust-row-${custId}`);
    await row.locator('td').first().click();
    await expect(row).toHaveClass(/\bm-open\b/);
    await expect(panel).toBeVisible();
    await expect(
      panel.locator('button', { hasText: /Grant|Remove/ }).first()
    ).toBeVisible();

    // Collapsing the row puts the panel away again.
    await row.locator('td').first().click();
    await expect(row).not.toHaveClass(/\bm-open\b/);
    await expect(panel).toBeHidden();
  });
});
