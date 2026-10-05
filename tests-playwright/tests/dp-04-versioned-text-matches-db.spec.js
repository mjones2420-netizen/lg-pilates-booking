// tests/dp-04-versioned-text-matches-db.spec.js
//
// DP (Data Protection) — DP-04: the wording customers see matches the stored
// version (#91). If someone edits the T&Cs, the PAR-Q declaration or the
// consent box without adding a new terms_versions row and bumping the
// constant, the record would claim people agreed to words they never saw.
// This spec is the tripwire for that.
//
// Normalisation must match migration 34: textContent, whitespace collapsed, trimmed.
// No fixture role. No DB writes.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { getTermsVersion } = require('./helpers/admin-db');

const APP_URL = process.env.TEST_APP_URL;

test.describe('DP-04 — On-page wording matches the stored versions', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — DP specs require the app to be served.');

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.getByText(/Monday|Wednesday|Friday/).first()).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test('T&Cs, declaration and consent text each equal their terms_versions row', async ({ page }) => {
    const onPage = await page.evaluate(() => {
      const norm = (id) => document.getElementById(id).textContent.replace(/\s+/g, ' ').trim();
      return [
        { version: TERMS_VERSION, kind: 'booking_terms', text: norm('tcs-text') },
        { version: PARQ_DECLARATION_VERSION, kind: 'parq_declaration', text: norm('parq-declaration-text') },
        { version: HEALTH_CONSENT_VERSION, kind: 'health_consent', text: norm('health-consent-text') },
      ];
    });

    for (const item of onPage) {
      const row = await getTermsVersion(item.version);
      expect(row, `terms_versions row "${item.version}" must exist — add a migration row when the wording changes`).not.toBeNull();
      expect(row.kind).toBe(item.kind);
      expect(item.text, `on-page text for ${item.version} has drifted from the stored wording — bump the version`).toBe(row.body);
    }
  });
});
