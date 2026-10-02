// Training Hub Parts 3–4 screenshots — TEST env only, read-only.
// Opens pages and forms, never saves, sends or exports.
const path = require('path');
const REPO = '/Users/markjones/dev/lg-pilates-booking';
require(path.join(REPO, 'tests-playwright/node_modules/dotenv')).config({ path: path.join(REPO, 'tests-playwright/.env.test') });
const { chromium } = require(path.join(REPO, 'tests-playwright/node_modules/playwright'));
const OUT = path.join(__dirname, 'shots'); // run from docs/training-hub with the local server on :8000
const URL = 'http://localhost:8000/?env=test&noemail=1';

async function login(page) {
  await page.goto(URL);
  if (!(await page.locator('#test-mode-banner.on').isVisible())) throw new Error('TEST MODE banner missing — aborting');
  await page.locator('#pub-dashboard-link').click();
  await page.waitForSelector('#pg-dash-login.on, #pg-dashboard.on');
  if (await page.locator('#pg-dash-login.on').isVisible()) {
    await page.fill('#dash-email', process.env.TEST_ADMIN_EMAIL);
    await page.fill('#dash-password', process.env.TEST_ADMIN_PASSWORD);
    await page.click('#dash-login-btn');
  }
  await page.waitForSelector('#pg-dashboard.on');
  await page.waitForFunction(() => !document.querySelector('#btbody').textContent.includes('Loading'));
  await page.waitForTimeout(800);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  page.on('dialog', d => d.dismiss());
  const shot = async (name, loc) => {
    await loc.screenshot({ path: path.join(OUT, name + '.jpg'), type: 'jpeg', quality: 78 });
    console.log('saved', name);
  };
  await login(page);

  // 3.1 "no next block" warning + Classes page + Add Block form (not saved)
  // Warnings sit behind the orange bar at every width since #117 — open it.
  await page.locator('#dbwarn-summary').click();
  await page.waitForTimeout(300);
  await shot('p3-warning', page.locator('#block-warnings'));
  await page.evaluate(() => switchDashPage('classes'));
  await page.waitForTimeout(500);
  await shot('p3-classes', page.locator('#dbpage-classes'));
  await page.evaluate(() => {
    const c = classes[0];
    const last = blocks.filter(b => b.class_id === c.id).sort((a, b) => a.end_date < b.end_date ? 1 : -1)[0];
    const d = new Date(last.end_date + 'T00:00:00'); d.setDate(d.getDate() + 14);
    const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    openAddBlockModal(c.id, iso);
  });
  await page.waitForTimeout(300);
  await shot('p3-addblock', page.locator('#add-block-overlay .modal'));
  await page.evaluate(() => closeAddBlockModal());

  // 3.3 Email a block (form filled, not sent)
  await page.evaluate(() => switchDashPage('byclass'));
  await page.waitForTimeout(400);
  const blkId = await page.evaluate(() => { const b = bookings.find(x => !x.blockPast); return b && b.blockId; });
  if (blkId) {
    await page.evaluate(id => openBlockEmailModal(id), blkId);
    await page.fill('#blockemail-subject', 'Monday class moved to the small hall this week');
    await page.fill('#blockemail-message', 'Hi everyone,\n\nThis Monday only, we will be in the small hall at the back of the church. Same time as usual.\n\nSee you there,\nLouise');
    await shot('p3-blockemail', page.locator('#blockemail-overlay > *').first());
    await page.evaluate(() => closeBlockEmailModal());
  } else console.log('no current booking for block email');

  // 3.4 Reports, 3.5 Booking history
  await page.evaluate(() => switchDashPage('reports'));
  await page.waitForTimeout(900);
  await shot('p3-reports', page.locator('#dbpage-reports'));
  await page.evaluate(() => switchDashPage('history'));
  await page.waitForTimeout(400);
  await shot('p3-history', page.locator('#dbpage-history'));

  // 4.1/4.2 Settings, 4.3 Backup
  await page.evaluate(() => switchDashPage('settings'));
  await page.waitForTimeout(500);
  await shot('p4-settings', page.locator('#dbpage-settings'));
  await page.evaluate(() => switchDashPage('backup'));
  await page.waitForTimeout(300);
  await shot('p4-backup', page.locator('#dbpage-backup'));

  // 4.4 Phone: bottom menu + More sheet
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  phone.on('dialog', d => d.dismiss());
  await login(phone);
  await phone.addStyleTag({ content: '#test-mode-banner{display:none!important}' });
  await phone.screenshot({ path: path.join(OUT, 'p4-phone.jpg'), type: 'jpeg', quality: 70 });
  console.log('saved p4-phone');
  await phone.evaluate(() => toggleDashMore(true));
  await phone.waitForTimeout(400);
  await phone.screenshot({ path: path.join(OUT, 'p4-phone-more.jpg'), type: 'jpeg', quality: 70 });
  console.log('saved p4-phone-more');

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
