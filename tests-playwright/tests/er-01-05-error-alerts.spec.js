// tests/er-01-05-error-alerts.spec.js
//
// #95 — customer-side errors are reported to Sentry (EU), with personal data
// scrubbed first. Reporting is OFF under ?env=test, so these specs never send
// anything: they check the off-switch, the scrubber and the reporting wiring
// (with a stand-in for the Sentry SDK), plus that the pinned SDK file still
// matches its integrity hash (a mismatch would silently disable alerts live).
// Read-only: no database state is created.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');

const APP_URL = process.env.TEST_APP_URL;

test.describe('Error alerts (ER)', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set');

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 10000 });
  });

  test('ER-01: test mode never loads Sentry or sends a report', async ({ page }) => {
    const sentryRequests = [];
    page.on('request', (r) => { if (/sentry/i.test(r.url())) sentryRequests.push(r.url()); });
    await page.reload();
    await expect(page.locator('#test-mode-banner.on')).toBeVisible({ timeout: 10000 });
    await page.evaluate(() => console.error('ER-01 deliberate error', new Error('boom')));
    await page.waitForTimeout(500);
    expect(sentryRequests).toEqual([]);
    const state = await page.evaluate(() => ({
      sdk: typeof window.Sentry,
      reporter: window.errorReporter,
      queued: window.pendingErrorReports.length,
    }));
    expect(state).toEqual({ sdk: 'undefined', reporter: null, queued: 0 });
  });

  test('ER-02: reporting is on for the live site only', async ({ page }) => {
    const r = await page.evaluate(() => ({
      live: errorReportingEnabled('mjones2420-netizen.github.io', false),
      futureLive: errorReportingEnabled('book.lg-pilates.co.uk', false),
      liveButTest: errorReportingEnabled('mjones2420-netizen.github.io', true),
      localhost: errorReportingEnabled('localhost', false),
      loopback: errorReportingEnabled('127.0.0.1', false),
      fromDisk: errorReportingEnabled('', false),
      lanAddress: errorReportingEnabled('192.168.1.20', false),
      netlifyPreview: errorReportingEnabled('deploy-preview-12--lg-booking.netlify.app', false),
    }));
    expect(r).toEqual({
      live: true, futureLive: true, liveButTest: false,
      localhost: false, loopback: false, fromDisk: false,
      lanAddress: false, netlifyPreview: false,
    });
  });

  test('ER-03: personal details are scrubbed before sending', async ({ page }) => {
    const out = await page.evaluate(() => scrubErrorEvent({
      message: 'Booking failed for jane.doe@example.com on 07700 900123',
      timestamp: 1731068000.0123456789,
      user: { email: 'jane.doe@example.com', ip_address: '1.2.3.4' },
      request: {
        url: 'https://mjones2420-netizen.github.io/lg-pilates-booking/?offer=3f2a9c1e-1111-4222-8333-444455556666',
        cookies: 'a=b',
        data: { email: 'jane.doe@example.com' },
      },
      exception: { values: [{ type: 'Error', value: 'customer +44 7700 900123 id 3f2a9c1e-1111-4222-8333-444455556666' }] },
      extra: { phone: '07700-900123', details: 'Failing row contains (Jane, Doe, knee injury)', hint: 'x' },
      breadcrumbs: [{ category: 'navigation', data: { from: '/lg-pilates-booking/?payment=success&session_id=cs_test_abc123' } },
        { category: 'fetch', data: { url: 'https://mrlooyixnlxzcfmvnqme.supabase.co/rest/v1/customers?email=eq.jane.doe%40example.com' } }],
    }));
    const text = JSON.stringify(out);
    expect(text).not.toContain('jane.doe');
    expect(text).not.toContain('7700');
    expect(text).not.toContain('3f2a9c1e');
    expect(text).not.toContain('offer=');
    expect(out.timestamp).toBe(1731068000.0123456789); // numbers untouched
    expect(out.user).toBeUndefined();
    expect(out.request.cookies).toBeUndefined();
    expect(out.request.data).toBeUndefined();
    expect(out.message).toBe('Booking failed for [email] on [number]');
    expect(out.request.url).toBe('https://mjones2420-netizen.github.io/lg-pilates-booking/?[removed]');
    expect(text).not.toContain('cs_test_abc123');
    expect(text).not.toContain('Jane');
    expect(out.extra).toEqual({ phone: '[number]' });
    expect(out.breadcrumbs[0].data.from).toBe('/lg-pilates-booking/?[removed]');
    expect(out.breadcrumbs[1].data.url).toBe('https://mrlooyixnlxzcfmvnqme.supabase.co/rest/v1/customers?[removed]');
    // A report that cannot be scrubbed is dropped, never sent raw.
    const circular = await page.evaluate(() => { const e = {}; e.self = e; return scrubErrorEvent(e); });
    expect(circular).toBeNull();
  });

  test('ER-04: caught errors queue until Sentry loads, then report once each', async ({ page }) => {
    const r = await page.evaluate(() => {
      const sent = [];
      const fake = {
        initOptions: null,
        init(o) { this.initOptions = o; },
        captureException(err, ctx) { sent.push({ kind: 'exception', msg: err.message, name: err.name, where: ctx.tags.where }); },
        captureMessage(m) { sent.push({ kind: 'message', msg: m }); },
      };
      installErrorCapture();
      console.error('Booking error:', new Error('network down'));
      console.error('Dashboard error:', { message: 'permission denied', code: '42501' });
      const queuedBeforeLoad = pendingErrorReports.length;
      attachErrorReporter(fake);
      console.error('Waitlist error:', new Error('after load'));
      console.error('plain message only');
      // A looping error stops being reported after MAX_ERROR_REPORTS per page.
      for (let i = 0; i < 30; i++) console.error('loop', new Error('again ' + i));
      const total = sent.length;
      sent.length = 4;
      return {
        queuedBeforeLoad,
        queuedAfter: pendingErrorReports.length,
        total,
        cap: MAX_ERROR_REPORTS,
        sent,
        dsnIsEu: /\.ingest\.de\.sentry\.io\//.test(fake.initOptions.dsn),
        pii: fake.initOptions.sendDefaultPii,
        scrubs: fake.initOptions.beforeSend === scrubErrorEvent,
      };
    });
    expect(r.queuedBeforeLoad).toBe(2);
    expect(r.queuedAfter).toBe(0);
    expect(r.total).toBe(r.cap);
    expect(r.sent).toEqual([
      { kind: 'exception', msg: 'network down', name: 'Error', where: 'Booking error:' },
      { kind: 'exception', msg: 'permission denied', name: 'Error 42501', where: 'Dashboard error:' },
      { kind: 'exception', msg: 'after load', name: 'Error', where: 'Waitlist error:' },
      { kind: 'message', msg: 'plain message only' },
    ]);
    expect(r.dsnIsEu).toBe(true);
    expect(r.pii).toBe(false);
    expect(r.scrubs).toBe(true);
  });

  test('ER-05: the pinned Sentry SDK still matches its integrity hash', async ({ page }) => {
    // Loads the file only (no init, no DSN), so nothing is sent to Sentry.
    const loaded = await page.evaluate(() => new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = SENTRY_SRC; s.integrity = SENTRY_SRI; s.crossOrigin = 'anonymous';
      s.onload = () => resolve(typeof window.Sentry.init === 'function');
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    }));
    expect(loaded).toBe(true);
  });
});
