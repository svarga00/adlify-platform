// =====================================================
// ADLIFY - Send Email Netlify Function v3.1
// Používa Resend API (SMTP z US je blokované Webglobe)
// =====================================================

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
    // CORS
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: ''
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const {
            accountId,
            to,
            cc,
            bcc,
            subject,
            htmlBody,
            textBody,
            replyTo,
            inReplyToId,
            attachments,
            leadId,
            clientId
        } = JSON.parse(event.body || '{}');

        // Validácia
        if (!to || !subject) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'to and subject are required' })
            };
        }

        // Načítaj účet ak je špecifikovaný
        let fromEmail = process.env.RESEND_FROM || 'info@adlify.eu';
        let fromName = 'Adlify';
        
        // Ak RESEND_FROM obsahuje formát "Name <email>", parsuj ho
        const fromMatch = fromEmail.match(/^(.+?)\s*<(.+?)>$/);
        if (fromMatch) {
            fromName = fromMatch[1].trim();
            fromEmail = fromMatch[2].trim();
        }
        
        if (accountId) {
            const { data: account } = await supabase
                .from('email_accounts')
                .select('*')
                .eq('id', accountId)
                .single();
            
            if (account) {
                fromEmail = account.email;
                fromName = account.display_name || account.name || 'Adlify';
            }
        }

        console.log(`📤 Sending email from ${fromEmail} to ${to}`);

        // Odoslanie cez Resend API
        const resendResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: `${fromName} <${fromEmail}>`,
                to: Array.isArray(to) ? to : [to],
                cc: cc ? (Array.isArray(cc) ? cc : [cc]) : undefined,
                bcc: bcc ? (Array.isArray(bcc) ? bcc : [bcc]) : undefined,
                reply_to: replyTo || fromEmail,
                subject: subject,
                html: htmlBody || undefined,
                text: textBody || undefined,
                attachments: attachments ? attachments.map(a => ({
                    filename: a.filename,
                    content: a.content // base64
                })) : undefined
            })
        });

        const resendData = await resendResponse.json();

        if (!resendResponse.ok) {
            console.error('Resend error:', resendData);
            throw new Error(resendData.message || 'Resend API error');
        }

        console.log('✅ Email sent:', resendData.id);

        // Ulož email do databázy (Sent folder)
        const messageId = resendData.id || `resend-${Date.now()}`;
        
        try {
            await supabase.from('emails').insert({
                account_id: accountId,
                message_id: messageId,
                folder: 'Sent',
                from_address: fromEmail,
                from_name: fromName,
                to_addresses: Array.isArray(to) ? to.map(e => ({ email: e })) : [{ email: to }],
                cc_addresses: cc ? (Array.isArray(cc) ? cc.map(e => ({ email: e })) : [{ email: cc }]) : [],
                subject: subject,
                body_html: htmlBody,
                body_text: textBody,
                snippet: (textBody || '').substring(0, 200),
                date: new Date().toISOString(),
                is_read: true,
                is_sent: true,
                lead_id: leadId || null,
                client_id: clientId || null
            });
        } catch (dbErr) {
            console.error('DB save error (non-critical):', dbErr.message);
        }

        // Log - wrap in try/catch
        try {
            await supabase.from('email_sync_log').insert({
                account_id: accountId,
                folder: 'Sent',
                messages_fetched: 1,
                messages_new: 1,
                status: 'success'
            });
        } catch (logErr) {
            // Ignore log errors
        }

        return {
            statusCode: 200,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({
                success: true,
                messageId: messageId,
                from: fromEmail,
                to: to
            })
        };

    } catch (error) {
        console.error('❌ Send error:', error.message);

        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({
                success: false,
                error: error.message
            })
        };
    }
};
