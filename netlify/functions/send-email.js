// Netlify Function - Send Email via SMTP
// File: netlify/functions/send-email.js

const nodemailer = require('nodemailer');

exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, error: 'Method not allowed' }),
    };
  }

  try {
    const { to, toName, subject, htmlBody, textBody, leadId, attachments } = JSON.parse(event.body);

    if (!to || !subject || !htmlBody) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Missing required fields' }),
      };
    }

    // SMTP Configuration - Webglobe
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.webglobe.sk',
      port: parseInt(process.env.SMTP_PORT || '465'),
      secure: true, // SSL
      auth: {
        user: process.env.SMTP_USER || 'info@adlify.eu',
        pass: process.env.SMTP_PASS,
      },
    });

    // Prepare email
    const mailOptions = {
      from: `"Adlify" <${process.env.SMTP_USER || 'info@adlify.eu'}>`,
      to: toName ? `"${toName}" <${to}>` : to,
      subject: subject,
      text: textBody || htmlBody.replace(/<[^>]+>/g, ''),
      html: htmlBody,
    };

    // Add attachments if present
    if (attachments && attachments.length > 0) {
      mailOptions.attachments = attachments.map(att => ({
        filename: att.filename,
        content: Buffer.from(att.content, 'base64'),
        contentType: att.contentType || 'application/pdf',
      }));
    }

    // Send email
    await transporter.sendMail(mailOptions);

    console.log(`Email sent to ${to}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: 'Email sent successfully' }),
    };

  } catch (error) {
    console.error('Send email error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: error.message }),
    };
  }
};
