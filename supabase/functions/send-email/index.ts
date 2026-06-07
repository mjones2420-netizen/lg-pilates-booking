// supabase/functions/send-email/index.ts
// Sends transactional emails via Resend.
// In test mode (isTest: true) all recipients are redirected to delivered@resend.dev
// so no real emails are delivered during test runs.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const RESEND_API_URL = 'https://api.resend.com/emails';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { to, subject, html, isTest } = await req.json();

    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: to, subject, html' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('RESEND_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'RESEND_API_KEY secret is not set' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // In test mode, redirect all recipients to Resend's silent sink address
    const recipient = isTest ? 'delivered@resend.dev' : to;

    const payload = {
      from: 'LG Pilates <bookings@lg-pilates.co.uk>',
      to: [recipient],
      subject,
      html,
    };

    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Resend error:', data);
      return new Response(
        JSON.stringify({ error: data }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ id: data.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('send-email function error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
