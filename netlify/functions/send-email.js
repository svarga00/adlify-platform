// Netlify Function - Send Email
// Supports: Resend (recommended) or SMTP
// File: netlify/functions/send-email.js

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };
  }

  try {
    const { to, toName, subject, htmlBody, textBody } = JSON.parse(event.body);

    if (!to || !subject || !htmlBody) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Missing required fields' }) };
    }

    console.log('📧 Sending email to:', to);

    // ===== OPTION 1: RESEND (recommended) =====
    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      console.log('Using Resend API');
      
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM || 'Adlify <onboarding@resend.dev>',
          to: [to],
          subject: subject,
          html: htmlBody,
        }),
      });

      const result = await res.json();
      
      if (res.ok) {
        console.log('✅ Email sent via Resend:', result.id);
        return { statusCode: 200, headers, body: JSON.stringify({ success: true, id: result.id }) };
      } else {
        console.error('❌ Resend error:', result);
        return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: result.message || 'Resend failed' }) };
      }
    }

    // ===== OPTION 2: SMTP (Nodemailer) =====
    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpPort = parseInt(process.env.SMTP_PORT || '587');

    if (!smtpHost || !smtpUser || !smtpPass) {
      console.error('❌ No email config found');
      return { 
        statusCode: 500, 
        headers, 
        body: JSON.stringify({ 
          success: false, 
          error: 'Email not configured. Add RESEND_API_KEY or SMTP_* variables.' 
        }) 
      };
    }

    console.log('Using SMTP:', smtpHost, ':', smtpPort);
    
    const nodemailer = require('nodemailer');
    
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
      tls: { rejectUnauthorized: false },
    });

    const info = await transporter.sendMail({
      from: `"Adlify" <${smtpUser}>`,
      to: to,
      subject: subject,
      html: htmlBody,
      text: textBody || htmlBody.replace(/<[^>]+>/g, ''),
    });

    console.log('✅ Email sent via SMTP:', info.messageId);
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, messageId: info.messageId }) };

  } catch (error) {
    console.error('❌ Error:', error.message);
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: error.message }) };
  }
};
