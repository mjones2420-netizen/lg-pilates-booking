// supabase/functions/send-email/index.ts
// Sends transactional emails via Resend.
//
// Security model (issue #33 — closes the previous open-relay hole):
//
//   PUBLIC types (fired during an anonymous booking, no login):
//     - reserved_confirmation : booking-reserved email to the customer
//     - new_booking_alert     : "new booking" alert to Louise
//   For these the caller supplies ONLY { type, booking_id }. The function
//   loads everything server-side (service role) and builds the HTML itself.
//   The recipient is derived from the data (customer email / settings admin
//   email) — never from the caller — and the body is a fixed template, so an
//   anon caller cannot choose the recipient or inject arbitrary HTML.
//   Each public email is one-shot per booking (#45): a timestamp stamp on
//   the bookings row is claimed atomically before sending, so repeat calls
//   (spam/harassment vector — booking ids are sequential) return 429.
//
//   ADMIN (raw) path — any other call:
//     Caller supplies { to, subject, html }. Requires a real authenticated
//     admin JWT (anon key is rejected). Only Louise can log in, so a verified
//     token implies admin. Used for the confirmed / block / cancellation /
//     refund emails, all triggered from the dashboard.
//
// In test mode (isTest: true) all recipients are redirected to
// delivered@resend.dev so no real emails are delivered during test runs.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_URL = 'https://api.resend.com/emails';
const DASHBOARD_URL = 'https://mjones2420-netizen.github.io/lg-pilates-booking/#dashboard';

const ALLOWED_ORIGINS = [
  'https://mjones2420-netizen.github.io',
  'https://book.lg-pilates.co.uk',
  'http://localhost:8000', // local dev + Playwright tests (#42)
];

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

function json(body: unknown, status: number, req: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

// Escape interpolated free-text (names, class/venue strings) so DB content can
// never break out of the template. Templates below are otherwise fixed.
function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Render the block-date "pills", greying out dates already in the past.
function datePills(blockDates: string[]): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const months: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };
  return (blockDates || []).map((d) => {
    const parts = String(d).split(' '); // e.g. ["5","May"]
    const dt = new Date(new Date().getFullYear(), months[parts[1]] || 0, parseInt(parts[0]) || 1);
    const past = dt < today;
    return past
      ? '<span style="display:inline-block;padding:3px 8px;border-radius:100px;font-size:11px;font-weight:500;margin:2px 3px 2px 0;background:#f0f0f0;color:#aaaaaa;border:1px solid #dddddd;">' + esc(d) + '</span>'
      : '<span style="display:inline-block;padding:3px 8px;border-radius:100px;font-size:11px;font-weight:500;margin:2px 3px 2px 0;background:#eef5f5;color:#2a6b6b;border:1px solid #cde0e0;">' + esc(d) + '</span>';
  }).join('');
}

interface EmailContext {
  firstName: string;
  lastName: string;
  className: string;
  venue: string;
  loc: string;
  day: string;
  time: string;
  endTime: string;
  blockDates: string[];
  amountDue: string;
  customerType: string;
  bankName: string;
  bankSortCode: string;
  bankAccountNo: string;
}

function buildReservedEmailHtml(o: EmailContext): string {
  const ref = esc(o.firstName + ' ' + o.lastName + ' ' + o.day);
  const pillsHtml = datePills(o.blockDates);
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f0f0f0;font-family:Arial,Helvetica,sans-serif;">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f0;padding:24px 0;">'
    + '<tr><td align="center">'
    + '<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">'
    + '<tr><td style="background:#1a2e2e;padding:28px 32px;text-align:center;">'
    + '<div style="color:#ffffff;font-size:22px;font-weight:600;letter-spacing:0.06em;font-family:Arial,Helvetica,sans-serif;margin-bottom:4px;">LG <span style="color:#b8d8d8;font-style:italic;">Pilates</span></div>'
    + '<div style="color:#8aabab;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;">Baildon &amp; Guiseley</div>'
    + '</td></tr>'
    + '<tr><td style="background:#fef3e8;border-left:4px solid #e07b4a;padding:18px 32px;">'
    + '<div style="font-size:15px;font-weight:600;color:#b35c2a;margin-bottom:6px;">Your spot is reserved &mdash; not yet confirmed</div>'
    + '<div style="font-size:13px;color:#7a4420;line-height:1.6;">To secure your place, please make a bank transfer within <strong>48 hours</strong>. Louise will send a confirmation email once payment has been received.</div>'
    + '</td></tr>'
    + '<tr><td style="padding:24px 32px;">'
    + '<p style="font-size:15px;margin:0 0 16px;color:#1a2e2e;">Hi ' + esc(o.firstName) + ',</p>'
    + '<div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#8aabab;margin-bottom:10px;">Booking summary</div>'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#eef5f5;border-radius:6px;padding:16px 20px;margin-bottom:20px;">'
    + '<tr><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;color:#4a6060;">Class</td><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;font-weight:600;color:#1a2e2e;text-align:right;">' + esc(o.className) + '</td></tr>'
    + '<tr><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;color:#4a6060;">Venue</td><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;font-weight:600;color:#1a2e2e;text-align:right;">' + esc(o.venue) + ', ' + esc(o.loc) + '</td></tr>'
    + '<tr><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;color:#4a6060;">Day &amp; time</td><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;font-weight:600;color:#1a2e2e;text-align:right;">' + esc(o.day) + ', ' + esc(o.time) + ' &ndash; ' + esc(o.endTime) + '</td></tr>'
    + (pillsHtml ? '<tr><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;color:#4a6060;vertical-align:top;padding-top:8px;">Sessions</td><td style="padding:6px 0;border-bottom:1px solid #cde0e0;text-align:right;">' + pillsHtml + '</td></tr>' : '')
    + '<tr><td style="padding:6px 0;font-size:13px;color:#4a6060;">Amount due</td><td style="padding:6px 0;font-size:15px;font-weight:600;color:#1a2e2e;text-align:right;">&pound;' + esc(o.amountDue) + '</td></tr>'
    + '</table>'
    + '<div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#8aabab;margin-bottom:10px;">How to pay</div>'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #cde0e0;border-radius:6px;padding:16px 20px;margin-bottom:20px;">'
    + (o.bankName ? '<tr><td style="padding:5px 0;border-bottom:1px solid #eef5f5;font-size:13px;color:#4a6060;">Bank</td><td style="padding:5px 0;border-bottom:1px solid #eef5f5;font-size:13px;font-weight:600;color:#1a2e2e;text-align:right;font-family:monospace;">' + esc(o.bankName) + '</td></tr>' : '')
    + '<tr><td style="padding:5px 0;border-bottom:1px solid #eef5f5;font-size:13px;color:#4a6060;">Sort code</td><td style="padding:5px 0;border-bottom:1px solid #eef5f5;font-size:13px;font-weight:600;color:#1a2e2e;text-align:right;font-family:monospace;">' + esc(o.bankSortCode) + '</td></tr>'
    + '<tr><td style="padding:5px 0;font-size:13px;color:#4a6060;">Account number</td><td style="padding:5px 0;font-size:13px;font-weight:600;color:#1a2e2e;text-align:right;font-family:monospace;">' + esc(o.bankAccountNo) + '</td></tr>'
    + '</table>'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#eef5f5;border-radius:4px;padding:8px 12px;margin-bottom:20px;">'
    + '<tr><td style="font-size:13px;color:#2a6b6b;">Payment reference: <strong style="color:#1a2e2e;">' + ref + '</strong></td></tr>'
    + '</table>'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#fff8f5;border:1px solid #f0c8aa;border-radius:6px;padding:12px 16px;margin-bottom:20px;">'
    + '<tr><td style="font-size:13px;color:#7a4420;line-height:1.6;"><strong style="color:#b35c2a;">Payment deadline:</strong> Please transfer within 48 hours to hold your spot. If payment is not received in time, your reservation may be released.</td></tr>'
    + '</table>'
    + '<div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#8aabab;margin-bottom:10px;">What to bring</div>'
    + '<p style="font-size:13px;color:#4a6060;line-height:1.7;margin:0 0 20px;">Please wear comfortable clothing suitable for movement. Bring a mat if you have one &mdash; mats are also available to borrow. Please arrive no more than 10 minutes before the session starts.</p>'
    + '</td></tr>'
    + '<tr><td style="background:#eef5f5;padding:16px 32px;text-align:center;">'
    + '<div style="font-size:11px;color:#8aabab;line-height:1.6;">Questions? Reply to this email or contact Louise at <a href="mailto:bookings@lg-pilates.co.uk" style="color:#3a8a8a;text-decoration:none;">bookings@lg-pilates.co.uk</a><br>LG Pilates &middot; Baildon &amp; Guiseley</div>'
    + '</td></tr>'
    + '</table>'
    + '</td></tr></table>'
    + '</body></html>';
}

function buildAdminAlertEmailHtml(o: EmailContext): string {
  const isNew = o.customerType === 'new';
  const pillsHtml = datePills(o.blockDates);
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f0f0f0;font-family:Arial,Helvetica,sans-serif;">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f0;padding:24px 0;">'
    + '<tr><td align="center">'
    + '<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">'
    + '<tr><td style="background:#1a2e2e;padding:28px 32px;text-align:center;">'
    + '<div style="color:#ffffff;font-size:22px;font-weight:600;letter-spacing:0.06em;font-family:Arial,Helvetica,sans-serif;margin-bottom:4px;">LG <span style="color:#b8d8d8;font-style:italic;">Pilates</span></div>'
    + '<div style="color:#8aabab;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;">Baildon &amp; Guiseley</div>'
    + '</td></tr>'
    + '<tr><td style="background:#e8f0fb;border-left:4px solid #3a6abf;padding:18px 32px;">'
    + '<div style="font-size:15px;font-weight:600;color:#1a3a7a;margin-bottom:6px;">New booking</div>'
    + '<div style="font-size:13px;color:#2a4a8a;line-height:1.6;">' + esc(o.firstName) + ' ' + esc(o.lastName) + ' (' + (isNew ? 'New client' : 'Returning client') + ') has made a new booking.</div>'
    + '</td></tr>'
    + '<tr><td style="padding:24px 32px;">'
    + '<div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#8aabab;margin-bottom:10px;">Booking details</div>'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#eef5f5;border-radius:6px;padding:16px 20px;margin-bottom:20px;">'
    + '<tr><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;color:#4a6060;">Client</td><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;font-weight:600;color:#1a2e2e;text-align:right;">' + esc(o.firstName) + ' ' + esc(o.lastName) + '</td></tr>'
    + '<tr><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;color:#4a6060;">Class</td><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;font-weight:600;color:#1a2e2e;text-align:right;">' + esc(o.className) + '</td></tr>'
    + '<tr><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;color:#4a6060;">Venue</td><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;font-weight:600;color:#1a2e2e;text-align:right;">' + esc(o.venue) + ', ' + esc(o.loc) + '</td></tr>'
    + '<tr><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;color:#4a6060;">Day &amp; time</td><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;font-weight:600;color:#1a2e2e;text-align:right;">' + esc(o.day) + ', ' + esc(o.time) + ' &ndash; ' + esc(o.endTime) + '</td></tr>'
    + (pillsHtml ? '<tr><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;color:#4a6060;vertical-align:top;padding-top:8px;">Sessions</td><td style="padding:6px 0;border-bottom:1px solid #cde0e0;text-align:right;">' + pillsHtml + '</td></tr>' : '')
    + '<tr><td style="padding:6px 0;border-bottom:1px solid #cde0e0;font-size:13px;color:#4a6060;">Amount due</td><td style="padding:6px 0;font-size:13px;font-weight:600;color:#1a2e2e;text-align:right;">&pound;' + esc(o.amountDue) + '</td></tr>'
    + '</table>'
    + (isNew ? '<table width="100%" cellpadding="0" cellspacing="0" style="background:#fff8e8;border-left:4px solid #e07b4a;border-radius:0 6px 6px 0;margin-bottom:20px;">'
      + '<tr><td style="padding:14px 18px;font-size:13px;color:#7a4010;">&#9888;&nbsp; A PAR-Q health form has been submitted with this booking. You can view it in the dashboard.</td></tr>'
      + '</table>' : '')
    + '<p style="font-size:13px;color:#4a6060;margin:0 0 8px;"><a href="' + DASHBOARD_URL + '" style="color:#3a8a8a;font-weight:600;text-decoration:none;">View full details in the dashboard &rarr;</a></p>'
    + '</td></tr>'
    + '<tr><td style="background:#eef5f5;padding:16px 32px;text-align:center;">'
    + '<div style="font-size:11px;color:#8aabab;line-height:1.6;">LG Pilates &middot; Baildon &amp; Guiseley</div>'
    + '</td></tr>'
    + '</table>'
    + '</td></tr></table>'
    + '</body></html>';
}

// Load a booking + its customer/block/class/settings and assemble the shared
// template context. Returns null if the booking can't be found.
async function loadBookingContext(
  admin: ReturnType<typeof createClient>,
  bookingId: string,
): Promise<{ ctx: EmailContext; customerEmail: string; adminEmail: string } | null> {
  const { data: booking, error: bErr } = await admin
    .from('bookings')
    .select('id, customer_id, block_id, class_id, amount_due')
    .eq('id', bookingId)
    .single();
  if (bErr || !booking) return null;

  const [{ data: customer }, { data: block }, { data: cls }, { data: settingsRows }] = await Promise.all([
    admin.from('customers').select('first_name, last_name, email, customer_type').eq('id', booking.customer_id).single(),
    admin.from('blocks').select('dates').eq('id', booking.block_id).single(),
    admin.from('classes').select('name, day, time, end_time, venue, loc').eq('id', booking.class_id).single(),
    admin.from('settings').select('key, value'),
  ]);

  const s: Record<string, string> = {};
  (settingsRows || []).forEach((r: { key: string; value: string }) => { s[r.key] = r.value; });

  const ctx: EmailContext = {
    firstName: customer?.first_name || '',
    lastName: customer?.last_name || '',
    className: cls?.name || '',
    venue: cls?.venue || '',
    loc: cls?.loc || '',
    day: cls?.day || '',
    time: cls?.time || '',
    endTime: cls?.end_time || '',
    blockDates: block?.dates || [],
    amountDue: String(booking.amount_due ?? ''),
    customerType: customer?.customer_type || '',
    bankName: s.bank_name || '',
    bankSortCode: s.bank_sort_code || '',
    bankAccountNo: s.bank_account_no || '',
  };
  return { ctx, customerEmail: customer?.email || '', adminEmail: s.admin_email || '' };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }

  try {
    const apiKey = Deno.env.get('RESEND_API_KEY');
    if (!apiKey) {
      return json({ error: 'RESEND_API_KEY secret is not set' }, 500, req);
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseServiceKey) {
      return json({ error: 'Server not configured' }, 500, req);
    }

    const body = await req.json();
    const { type, booking_id, isTest } = body;

    let recipient: string;
    let subject: string;
    let html: string;
    // Set on the public path: clears the one-shot stamp if the send fails,
    // so a genuine retry after a Resend outage isn't locked out forever.
    let rollbackStamp: (() => Promise<void>) | null = null;

    if (type === 'reserved_confirmation' || type === 'new_booking_alert') {
      // --- PUBLIC path: no caller-supplied recipient or HTML ---
      if (!booking_id) {
        return json({ error: 'Missing booking_id' }, 400, req);
      }
      const admin = createClient(supabaseUrl, supabaseServiceKey);
      const loaded = await loadBookingContext(admin, booking_id);
      if (!loaded) {
        return json({ error: 'Booking not found' }, 404, req);
      }
      const { ctx, customerEmail, adminEmail } = loaded;

      if (type === 'reserved_confirmation') {
        if (!customerEmail) return json({ error: 'No customer email on booking' }, 400, req);
        recipient = customerEmail;
        subject = 'Your LG Pilates booking is reserved — ' + ctx.className;
        html = buildReservedEmailHtml(ctx);
      } else {
        // new_booking_alert — recipient is the configured admin address only
        if (!adminEmail) return json({ ok: true, skipped: 'no admin email configured' }, 200, req);
        recipient = adminEmail;
        subject = 'New booking — ' + ctx.firstName + ' ' + ctx.lastName + ', ' + ctx.day + ' ' + ctx.time + ', ' + ctx.venue;
        html = buildAdminAlertEmailHtml(ctx);
      }

      // One-shot guard (#45): each booking gets each public email exactly
      // once. Claim the stamp atomically BEFORE sending — the WHERE ... IS
      // NULL makes concurrent duplicate requests lose the race instead of
      // each passing a check-then-send gap. Runs after the recipient checks
      // above so an unsendable email never consumes the booking's one shot.
      const stampCol = type === 'reserved_confirmation'
        ? 'reserved_email_sent_at'
        : 'alert_email_sent_at';
      const { data: claimed, error: claimErr } = await admin
        .from('bookings')
        .update({ [stampCol]: new Date().toISOString() })
        .eq('id', booking_id)
        .is(stampCol, null)
        .select('id');
      if (claimErr) {
        console.error('send-email stamp claim error:', claimErr);
        return json({ error: 'Could not verify send status' }, 500, req);
      }
      if (!claimed || claimed.length === 0) {
        return json({ error: 'This email has already been sent for this booking' }, 429, req);
      }
      rollbackStamp = async () => {
        const { error: rbErr } = await admin
          .from('bookings')
          .update({ [stampCol]: null })
          .eq('id', booking_id);
        if (rbErr) console.error('send-email stamp rollback error:', rbErr);
      };
    } else {
      // --- ADMIN raw path: caller supplies {to,subject,html} ---
      // Trusted iff the bearer is EITHER the service-role key (internal
      // server-to-server caller, e.g. stripe-webhook) OR a real authenticated
      // admin JWT. The public anon key is rejected — that closes the open
      // relay (#33), since the anon key is embedded in the page.
      const authHeader = req.headers.get('Authorization') || '';
      const token = authHeader.replace(/^Bearer\s+/i, '');
      if (!token) {
        return json({ error: 'Unauthorized' }, 401, req);
      }
      if (token !== supabaseServiceKey) {
        const authClient = createClient(supabaseUrl, supabaseServiceKey);
        const { data: userData, error: userErr } = await authClient.auth.getUser(token);
        if (userErr || !userData?.user) {
          return json({ error: 'Unauthorized' }, 401, req);
        }
        const adminEmails = (Deno.env.get("ADMIN_EMAILS") || "").split(",").map(e => e.trim().toLowerCase());
        if (!adminEmails.includes((userData.user.email || "").toLowerCase())) {
          return json({ error: 'Forbidden' }, 403, req);
        }
      }

      const { to, subject: rawSubject, html: rawHtml } = body;
      if (!to || !rawSubject || !rawHtml) {
        return json({ error: 'Missing required fields: to, subject, html' }, 400, req);
      }
      recipient = to;
      subject = rawSubject;
      html = rawHtml;
    }

    // In test mode, redirect all recipients to Resend's silent sink address
    const finalRecipient = isTest ? 'delivered@resend.dev' : recipient;

    let response: Response;
    try {
      response = await fetch(RESEND_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'LG Pilates <bookings@lg-pilates.co.uk>',
          to: [finalRecipient],
          subject,
          html,
        }),
      });
    } catch (fetchErr) {
      if (rollbackStamp) await rollbackStamp();
      throw fetchErr;
    }

    const data = await response.json();
    if (!response.ok) {
      console.error('Resend error:', data);
      if (rollbackStamp) await rollbackStamp();
      return json({ error: data }, response.status, req);
    }
    return json({ id: data.id }, 200, req);

  } catch (err) {
    console.error('send-email function error:', err);
    return json({ error: 'Internal server error' }, 500, req);
  }
});
