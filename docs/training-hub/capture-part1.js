// Training Hub Part 1 (client journey) screenshots — TEST env only, nothing submitted.
// Steps through the booking form by showing panels directly, so no customer lookup,
// booking, waitlist join or email ever happens.
const path = require('path');
const REPO = '/Users/markjones/dev/lg-pilates-booking';
const { chromium } = require(path.join(REPO, 'tests-playwright/node_modules/playwright'));
const OUT = path.join(__dirname, 'shots'); // run from docs/training-hub with the local server on :8000
const URL = 'http://localhost:8000/?env=test&noemail=1';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 2 });
  page.on('dialog', d => d.dismiss());
  const shot = async (name, target) => {
    const opts = { path: path.join(OUT, name + '.jpg'), type: 'jpeg', quality: 72 };
    if (target) await target.screenshot(opts); else await page.screenshot(opts);
    console.log('saved', name);
  };

  await page.goto(URL);
  if (!(await page.locator('#test-mode-banner.on').isVisible())) throw new Error('TEST MODE banner missing — aborting');
  await page.waitForSelector('#grid .card');
  await page.waitForTimeout(600);

  // 1.1 A bookable class card
  const bookCard = page.locator('#grid .card', { has: page.locator('button', { hasText: 'Book Current Block' }) }).first();
  await shot('p1-card', bookCard);

  // 1.2 Priority window: a card whose next block is in the priority window (or "not open yet")
  const pri = page.locator('#grid .card', { has: page.locator('.priority-check') }).first();
  const notYet = page.locator('#grid .card', { has: page.locator('.priority-info') }).first();
  const priCard = (await pri.count()) ? pri : notYet;
  if (await priCard.count()) {
    await priCard.locator('.next-blk-toggle').click();
    await page.waitForTimeout(300);
    await shot('p1-priority', priCard);
  } else console.log('no priority card in test data');

  // 1.5 Full class → Join Waiting List + form (opened, not submitted)
  // Display-only: make one class look full with 2 people waiting, then re-draw the cards.
  await page.evaluate(() => {
    const b = getActiveBlock(classes[0].id);
    b.booked = b.cap; b.wait = 2; renderGrid();
  });
  await page.waitForTimeout(300);
  const fullCard = page.locator('#grid .card', { has: page.locator('button', { hasText: 'Join Waiting List' }) }).first();
  if (await fullCard.count()) {
    await shot('p1-fullcard', fullCard);
    await fullCard.locator('button', { hasText: 'Join Waiting List' }).first().click();
    await page.waitForSelector('#wl-overlay.on, #wl-overlay[style*="flex"]', { timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(300);
    await page.fill('#wl-firstname', 'Sam'); await page.fill('#wl-lastname', 'Example');
    await page.fill('#wl-email', 'sam@example.com'); await page.fill('#wl-phone', '07700 900456');
    await shot('p1-waitlist-form', page.locator('#wl-overlay .modal'));
    await page.evaluate(() => closeWaitlistModal());
  } else console.log('no full card in test data');
  await page.reload();
  if (!(await page.locator('#test-mode-banner.on').isVisible())) throw new Error('TEST MODE banner missing — aborting');
  await page.waitForSelector('#grid .card');
  await page.waitForTimeout(600);
  // Banner verified above; hide it for pop-up shots so it doesn't cover the form title.
  await page.addStyleTag({ content: '#test-mode-banner{display:none!important}' });

  // 1.1 Booking form step 1
  await bookCard.locator('button', { hasText: 'Book Current Block' }).click();
  await page.waitForSelector('#step-1', { state: 'visible' });
  await page.fill('#b-firstname', 'Sam'); await page.fill('#b-lastname', 'Example');
  await page.fill('#b-email', 'sam@example.com'); await page.fill('#b-phone', '07700 900456');
  await shot('p1-step1', page.locator('#overlay .modal'));

  // 1.4 Health form (new customer) — shown directly, no lookup call
  await page.evaluate(() => {
    window._customerIsReturning = false;
    document.getElementById('step-1').style.display = 'none';
    document.getElementById('step-2a').style.display = 'block';
    updateStepIndicator(2, false);
  });
  await page.waitForTimeout(200);
  await page.locator('#overlay .modal').evaluate(m => { m.scrollTop = 0; const b = m.querySelector('.mbody'); if (b) b.scrollTop = 0; });
  await shot('p1-healthform', page.locator('#overlay .modal'));

  // 1.3 Payment step — fill the new-customer fields goStep3 validates, then show it
  await page.evaluate(() => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('b-emergency-name', 'Alex Example'); set('b-emergency-relationship', 'Partner'); set('b-emergency-phone', '07700 900789');
    goStep3();
  });
  await page.waitForTimeout(300);
  await page.check('#tcs-agree').catch(() => {});
  await page.evaluate(() => { const c = document.getElementById('tcs-agree'); if (c) c.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(200);
  await page.evaluate(() => scrollModalTop());
  await page.waitForTimeout(200);
  await shot('p1-payment-top', page.locator('#overlay .modal'));
  await page.evaluate(() => { const r = document.getElementById('reserve-btn'); r && r.scrollIntoView({ block: 'end' }); });
  await page.waitForTimeout(200);
  const mode = await page.evaluate(() => PAYMENT_MODE);
  console.log('payment mode', mode);
  await shot('p1-payment', page.locator('#overlay .modal'));

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
