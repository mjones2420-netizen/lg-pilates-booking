// tests/helpers/email-templates.js
//
// TEMPLATE-FIDELITY HELPER — NOT A SOURCE OF TRUTH
//
// This file contains a COPY of buildConfirmedEmailHtml, taken from the
// stripe-webhook Edge Function (test project, v3, retrieved via Supabase
// MCP — there is no local source file for this function; see context.txt
// Session 43/44 "Edge Function parity" notes). Converted from TypeScript to
// plain JS (type annotations removed) — otherwise byte-for-byte identical to
// the deployed function body at time of writing.
//
// PURPOSE (ST-21):
// Checks that the email TEMPLATE itself renders the "Sessions" date-pills
// row correctly (the Session 44 change, replacing the old date-range row).
// This does NOT prove the deployed webhook calls this function with this
// data, or that send-email successfully delivers it — webhook-to-send-email
// is a server-to-server call that Playwright cannot intercept. ST-19/20
// prove the webhook completes successfully and that email-sending is
// non-fatal. Full end-to-end email-content verification is a documented
// coverage gap (see TEST-PLAN.md / BACKLOG.md).
//
// !! DRIFT WARNING !!
// This is now the FOURTH copy of buildConfirmedEmailHtml (alongside
// index.html, the test stripe-webhook deployment, and the production
// stripe-webhook deployment). If the email template changes again, THIS FILE
// must be updated too, or ST-21 will keep passing against stale logic.
// Flagged in BACKLOG.md as a candidate for consolidation into a single
// shared module.

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildConfirmedEmailHtml(opts) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const months = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
  const pillsHtml = (opts.blockDates || []).map((d) => {
    const parts = d.split(" ");
    const dt = new Date(new Date().getFullYear(), months[parts[1]] || 0, parseInt(parts[0]) || 1);
    const past = dt < today;
    return past
      ? `<span style="display:inline-block;padding:3px 8px;border-radius:100px;font-size:11px;font-weight:500;margin:2px 3px 2px 0;background:#f0f0f0;color:#aaaaaa;border:1px solid #dddddd;">${d}</span>`
      : `<span style="display:inline-block;padding:3px 8px;border-radius:100px;font-size:11px;font-weight:500;margin:2px 3px 2px 0;background:#eef5f5;color:#2a6b6b;border:1px solid #cde0e0;">${d}</span>`;
  }).join("");
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f0f0f0;font-family:Arial,Helvetica,sans-serif;">`
    + `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f0;padding:24px 0;">`
    + `<tr><td align="center">`
    + `<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">`
    + `<tr><td style="background:#1a2e2e;padding:28px 32px;text-align:center;">`
    + `<div style="color:#ffffff;font-size:22px;font-weight:600;letter-spacing:0.06em;font-family:Arial,Helvetica,sans-serif;margin-bottom:4px;">LG <span style="color:#b8d8d8;font-style:italic;">Pilates</span></div>`
    + `<div style="color:#8aabab;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;">Baildon &amp; Guiseley</div>`
    + `</td></tr>`
    + `<tr><td style="background:#e8f5e8;border-left:4px solid #3a8a6a;padding:18px 32px;">`
    + `<div style="font-size:15px;font-weight:600;color:#2a6a4a;margin-bottom:6px;">Booking confirmed</div>`
    + `<div style="font-size:13px;color:#2a5a3a;line-height:1.6;">Payment received, your booking is now confirmed. We look forward to seeing you.</div>`
    + `</td></tr>`
    + `<tr><td style="padding:24px 32px;">`
    + `<p style="font-size:15px;margin:0 0 16px;color:#1a2e2e;">Hi ${esc(opts.firstName)},</p>`
    + `<div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#8aabab;margin-bottom:10px;">Your booking</div>`
    + `<table width="100%" cellpadding="0" cellspacing="0" style="background:#eef5f5;border-radius:6px;padding:16px 20px;margin-bottom:20px;">`
    + `<tr><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;color:#4a6060;">Class</td><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;font-weight:600;color:#1a2e2e;text-align:right;">${opts.className}</td></tr>`
    + `<tr><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;color:#4a6060;">Venue</td><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;font-weight:600;color:#1a2e2e;text-align:right;">${opts.venue}, ${opts.loc}</td></tr>`
    + `<tr><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;color:#4a6060;">Day &amp; time</td><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;font-weight:600;color:#1a2e2e;text-align:right;">${opts.day}, ${opts.time} &ndash; ${opts.endTime}</td></tr>`
    + (pillsHtml ? `<tr><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;color:#4a6060;vertical-align:top;padding-top:8px;">Sessions</td><td style="padding:6px 0;border-bottom:1px solid #cde0e0;text-align:right;">${pillsHtml}</td></tr>` : "")
    + `</table>`
    + `<div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#8aabab;margin-bottom:10px;">What to bring</div>`
    + `<p style="font-size:13px;color:#4a6060;line-height:1.7;margin:0 0 20px;">Please wear comfortable clothing and bring a water bottle. Please arrive no more than 10 minutes before the session starts.</p>`
    + `</td></tr>`
    + `<tr><td style="background:#eef5f5;padding:16px 32px;text-align:center;">`
    + `<div style="font-size:11px;color:#8aabab;line-height:1.6;">Questions? Reply to this email or contact Louise at <a href="mailto:bookings@lg-pilates.co.uk" style="color:#3a8a8a;text-decoration:none;">bookings@lg-pilates.co.uk</a><br>LG Pilates &middot; Baildon &amp; Guiseley</div>`
    + `</td></tr>`
    + `</table></td></tr></table></body></html>`;
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/**
 * Formats a Date as "D MMM" — matches the format calcBlockDates() produces
 * in index.html and what buildConfirmedEmailHtml expects in blockDates.
 */
function formatDDMmm(date) {
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()]}`;
}

/**
 * COPY of buildAdminAlertEmailHtml from stripe-webhook (trigger 5S).
 * Same drift warning as buildConfirmedEmailHtml above — this is now a
 * 4th copy of this function.
 */
function buildAdminAlertEmailHtml(opts) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const isNew = opts.customerType === "new";
  const months = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
  const pillsHtml = (opts.blockDates || []).map((d) => {
    const parts = d.split(" ");
    const dt = new Date(new Date().getFullYear(), months[parts[1]] || 0, parseInt(parts[0]) || 1);
    const past = dt < today;
    return past
      ? `<span style="display:inline-block;padding:3px 8px;border-radius:100px;font-size:11px;font-weight:500;margin:2px 3px 2px 0;background:#f0f0f0;color:#aaaaaa;border:1px solid #dddddd;">${d}</span>`
      : `<span style="display:inline-block;padding:3px 8px;border-radius:100px;font-size:11px;font-weight:500;margin:2px 3px 2px 0;background:#eef5f5;color:#2a6b6b;border:1px solid #cde0e0;">${d}</span>`;
  }).join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f0f0f0;font-family:Arial,Helvetica,sans-serif;">`
    + `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f0;padding:24px 0;">`
    + `<tr><td align="center">`
    + `<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">`
    + `<tr><td style="background:#1a2e2e;padding:28px 32px;text-align:center;">`
    + `<div style="color:#ffffff;font-size:22px;font-weight:600;letter-spacing:0.06em;font-family:Arial,Helvetica,sans-serif;margin-bottom:4px;">LG <span style="color:#b8d8d8;font-style:italic;">Pilates</span></div>`
    + `<div style="color:#8aabab;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;">Baildon &amp; Guiseley</div>`
    + `</td></tr>`
    + `<tr><td style="background:#e8f0fb;border-left:4px solid #3a6abf;padding:18px 32px;">`
    + `<div style="font-size:15px;font-weight:600;color:#1a3a7a;margin-bottom:6px;">New booking</div>`
    + `<div style="font-size:13px;color:#2a4a8a;line-height:1.6;">${esc(opts.firstName)} ${esc(opts.lastName)} (${isNew ? "New client" : "Returning client"}) has made a new booking via card payment.</div>`
    + `</td></tr>`
    + `<tr><td style="padding:24px 32px;">`
    + `<div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#8aabab;margin-bottom:10px;">Booking details</div>`
    + `<table width="100%" cellpadding="0" cellspacing="0" style="background:#eef5f5;border-radius:6px;padding:16px 20px;margin-bottom:20px;">`
    + `<tr><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;color:#4a6060;">Client</td><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;font-weight:600;color:#1a2e2e;text-align:right;">${esc(opts.firstName)} ${esc(opts.lastName)}</td></tr>`
    + `<tr><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;color:#4a6060;">Class</td><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;font-weight:600;color:#1a2e2e;text-align:right;">${opts.className}</td></tr>`
    + `<tr><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;color:#4a6060;">Venue</td><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;font-weight:600;color:#1a2e2e;text-align:right;">${opts.venue}, ${opts.loc}</td></tr>`
    + `<tr><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;color:#4a6060;">Day &amp; time</td><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;font-weight:600;color:#1a2e2e;text-align:right;">${opts.day}, ${opts.time} &ndash; ${opts.endTime}</td></tr>`
    + (pillsHtml ? `<tr><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;color:#4a6060;vertical-align:top;padding-top:8px;">Sessions</td><td style="padding:6px 0;border-bottom:1px solid #cde0e0;text-align:right;">${pillsHtml}</td></tr>` : "")
    + `<tr><td style="padding:6px 0;font-size:13px;color:#4a6060;">Amount paid</td><td style="padding:6px 0;font-size:13px;font-weight:600;color:#1a2e2e;text-align:right;">&pound;${opts.amountDue}</td></tr>`
    + `</table>`
    + (isNew ? `<table width="100%" cellpadding="0" cellspacing="0" style="background:#fff8e8;border-left:4px solid #e07b4a;border-radius:0 6px 6px 0;margin-bottom:20px;">`
      + `<tr><td style="padding:14px 18px;font-size:13px;color:#7a4010;">&#9888;&nbsp; A PAR-Q health form has been submitted with this booking. You can view it in the dashboard.</td></tr>`
      + `</table>` : "")
    + (opts.dashboardUrl ? `<p style="font-size:13px;color:#4a6060;margin:0 0 8px;"><a href="${opts.dashboardUrl}" style="color:#3a8a8a;font-weight:600;text-decoration:none;">View full details in the dashboard &rarr;</a></p>` : "")
    + `</td></tr>`
    + `<tr><td style="background:#eef5f5;padding:16px 32px;text-align:center;">`
    + `<div style="font-size:11px;color:#8aabab;line-height:1.6;">LG Pilates &middot; Baildon &amp; Guiseley</div>`
    + `</td></tr>`
    + `</table></td></tr></table></body></html>`;
}

/**
 * COPY of the admin alert subject line construction from stripe-webhook's
 * serve() handler (trigger 5S). Same drift warning applies.
 */
function buildAdminAlertSubject({ firstName, lastName, day, time, venue }) {
  return `New booking (card payment) — ${firstName} ${lastName}, ${day} ${time}, ${venue}`;
}

module.exports = { buildConfirmedEmailHtml, buildAdminAlertEmailHtml, buildAdminAlertSubject, formatDDMmm };
