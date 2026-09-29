// Training Hub screenshot capture — TEST env only, read-only.
// Opens admin pages and modals, screenshots them, cancels out. Never confirms.
const path = require('path');
const REPO = '/Users/markjones/dev/lg-pilates-booking';
require(path.join(REPO, 'tests-playwright/node_modules/dotenv')).config({ path: path.join(REPO, 'tests-playwright/.env.test') });
const { chromium } = require(path.join(REPO, 'tests-playwright/node_modules/playwright'));

const OUT = path.join(__dirname, 'shots'); // run from docs/training-hub with the local server on :8000
const URL = 'http://localhost:8000/?env=test&noemail=1';

(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 });
  page.on('dialog', d => d.dismiss()); // any confirm() = "Cancel"
  const shot = async (name, target) => {
    const opts = { path: path.join(OUT, name + '.jpg'), type: 'jpeg', quality: 78 };
    if (target) await page.locator(target).first().screenshot(opts); else await page.screenshot(opts);
    console.log('saved', name);
  };

  // Display-only: show the newest booking as "reserved" (unpaid bank transfer) so the
  // Confirm button appears. Rewrites the GET response in the browser; the DB is untouched.
  let flipped = false;
  await page.route(u => u.pathname.endsWith('/rest/v1/bookings') && (u.searchParams.get('select') || '').startsWith('id,status,amount_due'), async route => {
    if (route.request().method() !== 'GET') return route.continue();
    const res = await route.fetch();
    const rows = await res.json();
    if (Array.isArray(rows) && rows.length) {
      const r = rows.find(x => x.status === 'confirmed' && !x.stripe_payment_intent_id);
      if (r) { r.status = 'reserved'; flipped = true; }
    }
    route.fulfill({ response: res, json: rows });
  });

  await page.goto(URL);
  if (!(await page.locator('#test-mode-banner.on').isVisible())) throw new Error('TEST MODE banner missing — aborting');

  // Log in (test admin)
  await page.locator('#pub-dashboard-link').click();
  await page.waitForSelector('#pg-dash-login.on, #pg-dashboard.on');
  if (await page.locator('#pg-dash-login.on').isVisible()) {
    await page.fill('#dash-email', process.env.TEST_ADMIN_EMAIL);
    await page.fill('#dash-password', process.env.TEST_ADMIN_PASSWORD);
    await page.click('#dash-login-btn');
  }
  await page.waitForSelector('#dbpage-bookings.on');
  await page.waitForFunction(() => !document.querySelector('#btbody').textContent.includes('Loading'));
  await page.waitForTimeout(800);

  // 2.1 / 2.2 All bookings
  await shot('all-bookings');
  const info = await page.evaluate(() => ({
    reserved: bookings.filter(b => b.status === 'reserved' && !b.blockPast).length,
    total: bookings.length,
    waitlistType: typeof waitlistRows,
  }));
  console.log('info', JSON.stringify(info));

  // Display-only: dress the first row as an unpaid bank-transfer booking, using the
  // exact markup index.html renders for status "reserved" (pill + Confirm button).
  await page.evaluate(() => {
    const tr = document.querySelector('#btbody tr');
    const pill = tr.querySelector('.pill');
    pill.className = 'pill p-reserved'; pill.textContent = 'reserved';
    const view = [...tr.querySelectorAll('button')].find(b => b.textContent === 'View');
    const c = document.createElement('button'); c.className = 'act act-confirm'; c.textContent = 'Confirm';
    view.after(c);
  });
  await shot('all-bookings-reserved', '#dbpage-bookings');
  // Zoom on a reserved row (Confirm button)
  const resRow = page.locator('#btbody tr', { has: page.locator('.act-confirm') }).first();
  if (await resRow.count()) {
    await resRow.scrollIntoViewIfNeeded();
    await resRow.screenshot({ path: path.join(OUT, 'reserved-row.jpg'), type: 'jpeg', quality: 80 });
    console.log('saved reserved-row');
  }

  // 2.1 By class, first class expanded
  await page.evaluate(() => switchDashPage('byclass'));
  await page.waitForTimeout(500);
  await page.locator('#classes-accordion .class-group-header').first().click();
  await page.waitForTimeout(300);
  await shot('by-class', '#dbpage-byclass');

  // 2.3 Remove from block — steps 1 and 2, then Cancel
  await page.evaluate(() => switchDashPage('bookings'));
  await page.waitForTimeout(300);
  const confirmedRow = page.locator('#btbody tr', { hasText: 'confirmed' }).first();
  await confirmedRow.locator('button', { hasText: 'Remove from Block' }).click();
  await page.waitForSelector('#rfb-overlay', { state: 'visible' });
  await page.locator('#rfb-body button', { hasText: /^2$/ }).click();
  await shot('remove-step1', '#rfb-overlay > *');
  await page.locator('#rfb-footer button', { hasText: 'Next' }).click();
  await page.waitForTimeout(200);
  await shot('remove-step2', '#rfb-overlay > *');
  await page.evaluate(() => closeRfbModal());

  // 2.3 Cancellations
  await page.evaluate(() => switchDashPage('cancellations'));
  await page.waitForFunction(() => !document.querySelector('#cancellations-tbody').textContent.includes('Loading'));
  await page.waitForTimeout(300);
  await shot('cancellations', '#dbpage-cancellations');

  // 2.4 Catch-up page + filled modal, then close
  await page.evaluate(() => switchDashPage('catchup'));
  await page.waitForTimeout(800);
  await shot('catchup-page');
  await page.evaluate(() => openCatchUpModal());
  await page.waitForTimeout(200);
  const custVal = await page.locator('#cu-customer option').nth(1).getAttribute('value');
  await page.selectOption('#cu-customer', custVal);
  await page.dispatchEvent('#cu-customer', 'change');
  const srcVal = await page.locator('#cu-source-block option').first().getAttribute('value');
  const tgt = await page.locator('#cu-target-block option:not([disabled])').evaluateAll((os, src) =>
    os.map(o => o.value).filter(v => v && v !== src), srcVal);
  for (const t of tgt) {
    await page.selectOption('#cu-target-block', t);
    await page.dispatchEvent('#cu-target-block', 'change');
    if (!(await page.locator('#cu-date').inputValue())) continue;
    // Test-data quirk: some fixture blocks start on the wrong weekday. Pick one whose
    // weeks fall on the class's own day so the picture isn't confusing.
    const tDay = (await page.locator('#cu-target-block option:checked').textContent()).split(' ')[0];
    const dDay = (await page.locator('#cu-date option:checked').textContent()).split(' ')[0];
    if (tDay === dDay) break;
  }
  await page.fill('#cu-notes', 'Away on holiday that week');
  await shot('catchup-modal', '#catchup-overlay > *');
  await page.evaluate(() => closeCatchUpModal());

  // 2.5 Waiting lists — real data if any; otherwise render example rows on screen only (no DB write)
  await page.evaluate(() => switchDashPage('waitlist'));
  await page.waitForFunction(() => !document.querySelector('#waitlist-list').textContent.includes('Loading'));
  await page.waitForTimeout(300);
  const realRows = await page.evaluate(() => waitlistRows.length);
  console.log('real waitlist rows', realRows);
  if (realRows === 0) {
    await page.evaluate(() => {
      const full = blocks.find(b => !isBlockPast(b) && b.cap >= 8) || blocks.find(b => !isBlockPast(b));
      const now = Date.now(), day = 86400000;
      full.booked = full.cap - 1; // pretend one client has just cancelled → 1 seat free
      waitlistRows = [
        { id: -1, blockId: full.id, customerId: -1, status: 'waiting', joinedAt: new Date(now - 6 * day).toISOString(), name: 'Sarah Example', email: 'sarah@example.com', phone: '07700 900123' },
        { id: -2, blockId: full.id, customerId: -2, status: 'waiting', joinedAt: new Date(now - 2 * day).toISOString(), name: 'Priya Example', email: 'priya@example.com', phone: '' },
      ];
      renderWaitlistList();
    });
  }
  await shot('waitlist', '#dbpage-waitlist');

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
