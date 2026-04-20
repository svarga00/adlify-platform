// =====================================================
// ADLIFY — Send Booking Confirmation
// =====================================================
// Posle potvrdzovaci email klientovi + notifikaciu Stefanovi
// s .ics kalendar attachmentom.
// =====================================================

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function formatIcsDate(iso) {
  // ics format: YYYYMMDDTHHmmssZ
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth()+1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

function escapeIcs(s) {
  if (s == null) return '';
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function buildIcs(booking) {
  const startIso = booking.scheduled_at;
  const endIso = new Date(new Date(startIso).getTime() + (booking.duration_minutes || 15) * 60 * 1000).toISOString();
  const dtStart = formatIcsDate(startIso);
  const dtEnd = formatIcsDate(endIso);
  const dtStamp = formatIcsDate(new Date().toISOString());
  const uid = booking.ics_uid || `adlify-${booking.id}@adlify.eu`;
  const title = `Adlify · 15-min konzultácia${booking.contact_name ? ' — ' + booking.contact_name : ''}`;
  const desc = `Konzultácia cez Adlify. Kontakt: ${booking.contact_name || '-'}, ${booking.contact_email || '-'}, ${booking.contact_phone || '-'}.${booking.topic ? '\\n\\nTéma: ' + booking.topic : ''}`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Adlify//Bookings//SK',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcs(title)}`,
    `DESCRIPTION:${escapeIcs(desc)}`,
    'LOCATION:Telefonicky',
    `ORGANIZER;CN=Štefan Varga:mailto:info@adlify.eu`,
    `ATTENDEE;CN=${escapeIcs(booking.contact_name || 'Guest')};RSVP=TRUE:mailto:${booking.contact_email}`,
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Reminder',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

function formatHumanDate(iso) {
  return new Date(iso).toLocaleString('sk-SK', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

async function sendResend(payload) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY not set');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Resend failed: ${JSON.stringify(j)}`);
  return j;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: '' };
  }

  try {
    const { booking_id } = JSON.parse(event.body || '{}');
    if (!booking_id) {
      return { statusCode: 400, body: JSON.stringify({ error: 'booking_id required' }) };
    }

    const { data: booking, error } = await supabase
      .from('call_bookings')
      .select('*')
      .eq('id', booking_id)
      .single();

    if (error || !booking) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Booking not found' }) };
    }

    const humanDate = formatHumanDate(booking.scheduled_at);
    const ics = buildIcs(booking);
    const icsB64 = Buffer.from(ics, 'utf-8').toString('base64');
    const fromRaw = process.env.RESEND_FROM || 'Adlify <info@adlify.eu>';
    const notifyTo = process.env.BOOKINGS_NOTIFY_TO || 'info@adlify.eu';

    // =====================================================
    // 1. Klientovi — potvrdenie
    // =====================================================
    const clientHtml = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F7F5F1;font-family:-apple-system,Helvetica,Arial,sans-serif;color:#14120E;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F5F1;padding:32px 12px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:16px;border:1px solid #EAE6DE;overflow:hidden;">
  <tr><td style="padding:28px 32px 0;">
    <span style="display:inline-block;width:32px;height:32px;border-radius:8px;background:#F97316;color:#fff;font-weight:800;font-size:16px;line-height:32px;text-align:center;">A</span>
    <span style="display:inline-block;font-size:18px;font-weight:700;margin-left:10px;vertical-align:middle;">Adlify</span>
  </td></tr>
  <tr><td style="padding:24px 32px;">
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;letter-spacing:-0.5px;">Hovor potvrdený ✓</h1>
    <p style="margin:0 0 16px;font-size:16px;color:#3A352B;line-height:1.6;">${booking.contact_name ? 'Pán ' + booking.contact_name + ',' : 'Dobrý deň,'}</p>
    <p style="margin:0 0 16px;font-size:16px;color:#3A352B;line-height:1.6;">ďakujem za rezerváciu. Tešíme sa na rozhovor.</p>
    <div style="background:#F7F5F1;border:1px solid #EAE6DE;border-radius:12px;padding:20px;margin:20px 0;">
      <p style="margin:0 0 6px;font-size:13px;color:#948B7C;text-transform:uppercase;letter-spacing:0.5px;">Termín</p>
      <p style="margin:0 0 16px;font-size:18px;font-weight:600;">${humanDate}</p>
      <p style="margin:0 0 6px;font-size:13px;color:#948B7C;text-transform:uppercase;letter-spacing:0.5px;">Trvanie</p>
      <p style="margin:0 0 16px;font-size:15px;color:#3A352B;">${booking.duration_minutes || 15} minút (telefonicky)</p>
      ${booking.topic ? `<p style="margin:0 0 6px;font-size:13px;color:#948B7C;text-transform:uppercase;letter-spacing:0.5px;">Téma</p><p style="margin:0;font-size:15px;color:#3A352B;">${booking.topic.replace(/</g, '&lt;')}</p>` : ''}
    </div>
    <p style="margin:0 0 16px;font-size:14px;color:#6F6758;line-height:1.5;">
      Pozvánka do kalendára je v prílohe (.ics). Ak potrebujete termín presunúť, stačí odpovedať na tento email.
    </p>
    <p style="margin:20px 0 4px;font-size:15px;color:#3A352B;">S pozdravom,</p>
    <p style="margin:0 0 4px;font-size:16px;font-weight:600;">Štefan Varga</p>
    <p style="margin:0;font-size:13px;color:#6F6758;">Adlify · <a href="mailto:info@adlify.eu" style="color:#F97316;text-decoration:none;">info@adlify.eu</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

    await sendResend({
      from: fromRaw,
      to: booking.contact_email,
      subject: `Rezervácia potvrdená — ${humanDate}`,
      html: clientHtml,
      attachments: [{
        filename: 'adlify-meeting.ics',
        content: icsB64,
      }],
    });

    // =====================================================
    // 2. Stefanovi — notifikacia
    // =====================================================
    const notifyHtml = `<!DOCTYPE html><html><body style="font-family:-apple-system,Helvetica,Arial,sans-serif;padding:20px;">
<h2 style="color:#14120E;margin:0 0 16px;">🔔 Nová rezervácia hovoru</h2>
<table style="border-collapse:collapse;width:100%;max-width:560px;">
  <tr><td style="padding:8px 0;color:#6F6758;width:140px;">Termín:</td><td style="padding:8px 0;font-weight:600;">${humanDate}</td></tr>
  <tr><td style="padding:8px 0;color:#6F6758;">Meno:</td><td style="padding:8px 0;font-weight:600;">${booking.contact_name || '-'}</td></tr>
  <tr><td style="padding:8px 0;color:#6F6758;">Email:</td><td style="padding:8px 0;"><a href="mailto:${booking.contact_email}" style="color:#F97316;">${booking.contact_email || '-'}</a></td></tr>
  <tr><td style="padding:8px 0;color:#6F6758;">Telefón:</td><td style="padding:8px 0;"><a href="tel:${booking.contact_phone}" style="color:#F97316;">${booking.contact_phone || '-'}</a></td></tr>
  ${booking.topic ? `<tr><td style="padding:8px 0;color:#6F6758;vertical-align:top;">Téma:</td><td style="padding:8px 0;">${booking.topic.replace(/</g, '&lt;')}</td></tr>` : ''}
</table>
<p style="margin-top:20px;font-size:13px;color:#948B7C;">Lead ID: ${booking.lead_id || '-'} · Booking ID: ${booking.id}</p>
</body></html>`;

    await sendResend({
      from: fromRaw,
      to: notifyTo,
      subject: `🔔 Nová rezervácia — ${humanDate} — ${booking.contact_name || booking.contact_email}`,
      html: notifyHtml,
      attachments: [{
        filename: 'adlify-meeting.ics',
        content: icsB64,
      }],
    });

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ success: true }),
    };
  } catch (e) {
    console.error('send-booking-confirmation error:', e);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: String(e) }),
    };
  }
};
