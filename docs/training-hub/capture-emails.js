// Training Hub reference R.1 screenshots (#120) — every email the system sends.
// PURELY LOCAL: no server, no database, no Edge Function, no Resend. All network
// requests from the browser are blocked. Nothing is ever sent.
//
// Faithful, not redrawn: the real email-building functions are read straight out
// of the source files (send-email, stripe-webhook, index.html), TypeScript types
// are stripped with Node's built-in stripper, and they are run with made-up data.
// If a template changes, re-run this and rebuild:  node capture-emails.js && node build.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const { stripTypeScriptTypes } = require('module'); // Node 22.13+
const REPO = '/Users/markjones/dev/lg-pilates-booking';
const { chromium } = require(path.join(REPO, 'tests-playwright/node_modules/playwright'));
const OUT = path.join(__dirname, 'shots');

// --- Pull named top-level functions/consts out of a source file -------------
function extract(src, name) {
  const fnAt = src.search(new RegExp('^(async\\s+)?function\\s+' + name + '\\s*\\(', 'm'));
  const constAt = src.search(new RegExp('^const\\s+' + name + '\\s*=', 'm'));
  if (fnAt < 0 && constAt < 0) throw new Error('Not found in source: ' + name);
  if (constAt >= 0 && fnAt < 0) return src.slice(constAt, src.indexOf(';', constAt) + 1);
  let i = src.indexOf('(', fnAt), depth = 0;
  for (; i < src.length; i++) { if (src[i] === '(') depth++; else if (src[i] === ')' && --depth === 0) break; }
  i = src.indexOf('{', i); depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(fnAt, j + 1);
  }
  throw new Error('Unbalanced braces: ' + name);
}
function load(file, names, isTs) {
  let src = fs.readFileSync(path.join(REPO, file), 'utf8');
  if (isTs) src = stripTypeScriptTypes(src, { mode: 'strip' });
  const code = names.map(n => extract(src, n)).join('\n') + '\n({' + names.join(',') + '})';
  return vm.runInNewContext(code, { URL, URLSearchParams, Date, String, Number, parseInt, parseFloat });
}
// Multiline ALLOWED_ORIGINS array: grab it whole.
function loadSendEmail() {
  const file = 'supabase/functions/send-email/index.ts';
  const src = stripTypeScriptTypes(fs.readFileSync(path.join(REPO, file), 'utf8'), { mode: 'strip' });
  const origins = src.slice(src.indexOf('const ALLOWED_ORIGINS'), src.indexOf('];', src.indexOf('const ALLOWED_ORIGINS')) + 2);
  const names = ['DASHBOARD_URL', 'DEFAULT_APP_URL', 'esc', 'datePills', 'buildReservedEmailHtml', 'buildConfirmedEmailHtml',
    'buildAdminAlertEmailHtml', 'buildOfferLink', 'buildWaitlistJoinedAlertHtml', 'buildWaitlistOfferHtml'];
  const code = origins + '\n' + names.map(n => extract(src, n)).join('\n') + '\n({' + names.join(',') + '})';
  return vm.runInNewContext(code, { URL, URLSearchParams, Date, String, Number, parseInt });
}

const se = loadSendEmail();
const wh = load('supabase/functions/stripe-webhook/index.ts',
  ['esc', 'failureReasonText', 'buildPaymentFailedAdminEmailHtml', 'buildPaymentFailedClientEmailHtml', 'buildRefundConfirmedClientEmailHtml'], true);
const ix = load('index.html',
  ['sanitise', 'plainTextToEmailHtml', 'buildBlockEmailHtml', 'buildBlockEmailAdminCopyHtml', 'buildRefundClientEmailHtml'], false);

// --- Made-up but realistic data (no real client, no real bank details) ------
// Upcoming Monday block, so the date pills render in their normal (not greyed) colour.
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const firstMon = new Date(); firstMon.setHours(0, 0, 0, 0);
do firstMon.setDate(firstMon.getDate() + 1); while (firstMon.getDay() !== 1);
const blockDates = Array.from({ length: 6 }, (_, i) => {
  const d = new Date(firstMon); d.setDate(d.getDate() + i * 7); return d.getDate() + ' ' + months[d.getMonth()];
});
const cls = { className: 'Mixed Ability', venue: 'Baildon Moravian Church', loc: 'Baildon', day: 'Monday', time: '9:45am', endTime: '10:30am' };
const booking = {
  ...cls, firstName: 'Sarah', lastName: 'Thompson', blockDates, amountDue: '60', customerType: 'new',
  bankName: 'Example Bank', bankSortCode: '12-34-56', bankAccountNo: '12345678',
};
const waitlist = { ...cls, firstName: 'Sarah', lastName: 'Thompson', blockDates, status: 'offered', offerToken: 'x', queuePosition: 2 };
const removal = {
  ...cls, firstName: 'Sarah', lastName: 'Thompson', email: 'sarah.thompson@example.com', blockDates,
  sessionsAttended: 2, totalSessions: 6, pricePerSession: 10, refundAmount: 40,
};
const blockMsgText = 'This Monday only, we will be in the small hall at the back of the church. Same time as usual.\n\nSee you there,\nLouise';
const blockMsg = ix.plainTextToEmailHtml(blockMsgText);
const offerLink = se.buildOfferLink(undefined, '7f3c9a2e5b1d4e8f9a0b6c2d3e4f5a6b', false);

const EMAILS = [
  ['email-reserved', se.buildReservedEmailHtml(booking)],
  ['email-new-booking', se.buildAdminAlertEmailHtml(booking, false)],
  ['email-confirmed', se.buildConfirmedEmailHtml(booking)],
  ['email-card-alert', se.buildAdminAlertEmailHtml({ ...booking, customerType: 'returning' }, true)],
  ['email-waitlist-alert', se.buildWaitlistJoinedAlertHtml(waitlist)],
  ['email-waitlist-offer', se.buildWaitlistOfferHtml(waitlist, offerLink)],
  ['email-cancelled', ix.buildRefundClientEmailHtml({ ...removal, refundAmount: 0 })],
  ['email-refund', ix.buildRefundClientEmailHtml(removal)],
  ['email-block', ix.buildBlockEmailHtml({ firstName: 'Sarah', messageHtml: blockMsg })],
  ['email-block-copy', ix.buildBlockEmailAdminCopyHtml({ ...cls, count: 11, subject: 'Monday class moved to the small hall this week', messageHtml: blockMsg })],
  ['email-stripe-refund', wh.buildRefundConfirmedClientEmailHtml({ firstName: 'Sarah', className: cls.className, venue: cls.venue, loc: cls.loc, refundAmount: 40 })],
  ['email-payfail-client', wh.buildPaymentFailedClientEmailHtml({ firstName: 'Sarah', className: cls.className, day: cls.day, time: cls.time, reason: 'CLASS_FULL' })],
  ['email-payfail-alert', wh.buildPaymentFailedAdminEmailHtml({
    ...cls, firstName: 'Sarah', lastName: 'Thompson', email: 'sarah.thompson@example.com', phone: '07700 900123',
    amountDue: 60, reason: 'CLASS_FULL', pendingId: '3b8e1c42-9d7a-4f10-b2c5-6e0a9f4d1c77',
  })],
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 600, height: 400 }, deviceScaleFactor: 2 });
  await page.route('**/*', r => r.abort()); // belt and braces: nothing leaves this machine
  for (const [name, html] of EMAILS) {
    await page.setContent(html, { waitUntil: 'load' });
    await page.screenshot({ path: path.join(OUT, name + '.jpg'), type: 'jpeg', quality: 72, fullPage: true });
    console.log('saved', name);
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
