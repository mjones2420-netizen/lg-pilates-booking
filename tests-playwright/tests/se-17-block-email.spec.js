// SE-17 — Group block email — Edge Function called once per client + admin copy
// Verifies that the "Email this block" modal on the By Class page sends one
// send-email call per client on the block (personalised "Hi [first name],",
// single recipient per call for privacy) plus a confirmation copy to Louise.
//
// Uses APP_PATH_EMAIL (no ?noemail=1) so the email calls are not suppressed.
// page.route() intercepts ALL calls to the Edge Function and captures each
// payload. Client emails come first, the admin copy is the final call.

const { test, expect } = require('@playwright/test');
const { APP_PATH_EMAIL } = require('./helpers/app-url');
const { loginAsAdmin } = require('./helpers/admin-auth');
const { sb } = require('./helpers/supabase');
const { getPool } = require('./helpers/admin-db');

const APP_URL = process.env.TEST_APP_URL;

test.describe('SE-17 — Group block email', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — SE-17 requires the app to be served.');

  test('Email this block sends one email per client plus an admin confirmation copy', async ({ page }) => {
    const SUBJECT = 'Venue car park closed Saturday';
    const MESSAGE = 'The car park will be closed this Saturday. Please use on-street parking.';

    // Capture ALL Edge Function calls in order
    const capturedPayloads = [];
    await page.route('**/functions/v1/send-email', async route => {
      capturedPayloads.push(route.request().postDataJSON());
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'test-ok' }) });
    });

    // Auto-accept the "Send to N clients?" confirm dialog
    page.on('dialog', dialog => dialog.accept());

    await page.goto(APP_PATH_EMAIL);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 5000 });
    await loginAsAdmin(page);

    // Go to By Class and expand the Monday group (fixture has bookings on mon-current)
    await page.locator('#dbnav-byclass').click();
    await expect(page.locator('#dbnav-byclass.on')).toBeVisible();

    const accordion = page.locator('#classes-accordion');
    const monGroup = accordion.locator('.class-group').filter({
      has: page.locator('.class-group-title', { hasText: /Monday/i })
    }).first();
    await expect(monGroup).toBeVisible({ timeout: 8000 });
    await monGroup.locator('.class-group-header').click();

    // Click the first "Email Block" button (only shows on blocks with bookings)
    const emailBtn = monGroup.locator('button', { hasText: 'Email Block' }).first();
    await expect(emailBtn).toBeVisible({ timeout: 5000 });
    await emailBtn.click();

    // Modal open — read the recipient count it computed
    await expect(page.locator('#blockemail-overlay')).toBeVisible();
    const recipientCount = await page.evaluate(() => _blockEmailRecipients.length);
    expect(recipientCount).toBeGreaterThan(0);

    // Fill subject + message and send
    await page.fill('#blockemail-subject', SUBJECT);
    await page.fill('#blockemail-message', MESSAGE);
    await page.locator('#blockemail-send').click();

    // Wait for all client emails + 1 admin copy
    const expectedTotal = recipientCount + 1;
    await expect.poll(() => capturedPayloads.length, { timeout: 15000 }).toBe(expectedTotal);

    const clientPayloads = capturedPayloads.slice(0, recipientCount);
    const adminPayload = capturedPayloads[recipientCount];

    // --- Privacy + content checks on each client email ---
    const seenRecipients = new Set();
    for (const p of clientPayloads) {
      // Single recipient per call — no shared addresses
      expect(typeof p.to).toBe('string');
      expect(p.to).not.toContain(',');
      seenRecipients.add(p.to);
      // isTest flag set in test mode
      expect(p.isTest).toBe(true);
      // Louise's subject used verbatim
      expect(p.subject).toBe(SUBJECT);
      // Personalised greeting + her message present
      expect(p.html).toContain('Hi ');
      expect(p.html).toContain('Please use on-street parking');
    }
    // Recipients are unique (deduped)
    expect(seenRecipients.size).toBe(recipientCount);

    // --- Admin confirmation copy ---
    // admin_email is hidden from the anon role by RLS (#38, migration 24), so
    // read it via the service-role pool (bypasses RLS) rather than the anon sb.
    const { rows: settingsRows } = await getPool().query(
      `SELECT value FROM settings WHERE key = 'admin_email'`
    );
    const adminEmail = settingsRows[0]?.value || '';
    expect(adminEmail).toBeTruthy();
    expect(adminPayload.to).toBe(adminEmail);
    expect(adminPayload.subject).toContain('Copy:');
    expect(adminPayload.html).toContain('Block email sent');
    expect(adminPayload.html).toContain(SUBJECT);

    // Toast confirms the send
    await expect(page.locator('#toastEl')).toContainText(/Sent to \d+ of \d+ client/);
  });
});
