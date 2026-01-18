// =====================================================
// ADLIFY - Send Email (Netlify Function)
// netlify/functions/send-email.js
// =====================================================
// Podporuje: multi-account SMTP, podpisy, prílohy
// =====================================================

const nodemailer = require('nodemailer');
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
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            },
            body: ''
        };
    }

    try {
        const body = JSON.parse(event.body || '{}');
        const {
            accountId,           // ID emailového účtu (voliteľné)
            to,                  // Príjemca email
            toName,              // Meno príjemcu
            cc,                  // CC (voliteľné)
            bcc,                 // BCC (voliteľné)
            subject,             // Predmet
            htmlBody,            // HTML obsah
            textBody,            // Plain text (voliteľné)
            replyTo,             // Reply-To (voliteľné)
            attachments,         // Prílohy [{filename, content, contentType}]
            inReplyToId,         // ID emailu na ktorý odpovedáme
            leadId,              // Prepojenie na lead
            clientId,            // Prepojenie na klienta
            signatureId,         // ID podpisu na pridanie
            saveToSent = true    // Uložiť do Sent folder?
        } = body;

        // Validácia
        if (!to || !subject || !htmlBody) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({
                    success: false,
                    error: 'Missing required fields: to, subject, htmlBody'
                })
            };
        }

        // Načítaj email account
        let account;
        
        if (accountId) {
            const { data, error } = await supabase
                .from('email_accounts')
                .select('*')
                .eq('id', accountId)
                .eq('is_active', true)
                .single();
            
            if (error || !data) {
                return {
                    statusCode: 404,
                    headers: { 'Access-Control-Allow-Origin': '*' },
                    body: JSON.stringify({ success: false, error: 'Email account not found' })
                };
            }
            account = data;
        } else {
            // Default účet
            const { data, error } = await supabase
                .from('email_accounts')
                .select('*')
                .eq('is_default', true)
                .eq('is_active', true)
                .single();
            
            if (error || !data) {
                // Fallback na prvý aktívny
                const { data: firstAcc } = await supabase
                    .from('email_accounts')
                    .select('*')
                    .eq('is_active', true)
                    .limit(1)
                    .single();
                
                if (!firstAcc) {
                    // Fallback na ENV premenné
                    account = {
                        email: process.env.SMTP_USER || process.env.EMAIL_FROM,
                        smtp_host: process.env.SMTP_HOST,
                        smtp_port: parseInt(process.env.SMTP_PORT || '465'),
                        smtp_user: process.env.SMTP_USER,
                        smtp_password: process.env.SMTP_PASSWORD,
                        smtp_secure: process.env.SMTP_SECURE !== 'false',
                        display_name: process.env.EMAIL_FROM_NAME || 'Adlify'
                    };
                } else {
                    account = firstAcc;
                }
            } else {
                account = data;
            }
        }

        // Validácia SMTP
        if (!account.smtp_host || !account.smtp_user || !account.smtp_password) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({
                    success: false,
                    error: 'SMTP not configured for this account'
                })
            };
        }

        // Pridaj podpis ak je požadovaný
        let finalHtmlBody = htmlBody;
        if (signatureId) {
            const { data: signature } = await supabase
                .from('email_signatures')
                .select('html_content')
                .eq('id', signatureId)
                .single();
            
            if (signature?.html_content) {
                finalHtmlBody = htmlBody + '<br><br>' + signature.html_content;
            }
        }

        // Načítaj In-Reply-To header ak odpovedáme
        let inReplyToHeader = null;
        let referencesHeader = null;
        if (inReplyToId) {
            const { data: replyEmail } = await supabase
                .from('emails')
                .select('message_id, thread_id')
                .eq('id', inReplyToId)
                .single();
            
            if (replyEmail) {
                inReplyToHeader = replyEmail.message_id;
                referencesHeader = replyEmail.message_id;
            }
        }

        console.log(`📧 Sending email from ${account.email} to ${to}`);

        // SMTP transport
        const transporter = nodemailer.createTransport({
            host: account.smtp_host,
            port: account.smtp_port || 465,
            secure: account.smtp_secure !== false,
            auth: {
                user: account.smtp_user,
                pass: account.smtp_password
            },
            tls: {
                rejectUnauthorized: false
            }
        });

        // Priprav email
        const fromAddress = account.display_name 
            ? `"${account.display_name}" <${account.email}>`
            : account.email;

        const messageId = `<${Date.now()}.${Math.random().toString(36).substr(2, 9)}@${account.email.split('@')[1]}>`;

        const mailOptions = {
            from: fromAddress,
            to: toName ? `"${toName}" <${to}>` : to,
            subject: subject,
            html: finalHtmlBody,
            text: textBody || finalHtmlBody.replace(/<[^>]+>/g, ''),
            messageId: messageId,
            headers: {}
        };

        if (cc) mailOptions.cc = cc;
        if (bcc) mailOptions.bcc = bcc;
        if (replyTo) mailOptions.replyTo = replyTo;
        if (inReplyToHeader) {
            mailOptions.inReplyTo = inReplyToHeader;
            mailOptions.references = referencesHeader;
        }

        // Prílohy
        if (attachments && attachments.length > 0) {
            mailOptions.attachments = attachments.map(att => ({
                filename: att.filename,
                content: att.content,
                contentType: att.contentType,
                encoding: 'base64'
            }));
        }

        // Odošli
        const info = await transporter.sendMail(mailOptions);
        console.log('✅ Email sent:', info.messageId || messageId);

        // Ulož do DB ako odoslaný email
        if (saveToSent && account.id) {
            await supabase
                .from('emails')
                .insert({
                    account_id: account.id,
                    message_id: messageId,
                    folder: 'Sent',
                    from_address: account.email,
                    from_name: account.display_name || account.name,
                    to_addresses: [{ email: to, name: toName || '' }],
                    cc_addresses: cc ? [{ email: cc }] : [],
                    bcc_addresses: bcc ? [{ email: bcc }] : [],
                    subject: subject,
                    body_html: finalHtmlBody,
                    body_text: textBody || '',
                    snippet: (textBody || finalHtmlBody.replace(/<[^>]+>/g, '')).substring(0, 250),
                    date: new Date(),
                    is_sent: true,
                    is_read: true,
                    in_reply_to: inReplyToHeader,
                    thread_id: inReplyToHeader || messageId,
                    lead_id: leadId || null,
                    client_id: clientId || null,
                    has_attachments: (attachments || []).length > 0,
                    attachments: (attachments || []).map(a => ({
                        filename: a.filename,
                        contentType: a.contentType
                    }))
                });
        }

        return {
            statusCode: 200,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({
                success: true,
                messageId: messageId,
                from: account.email,
                to: to
            })
        };

    } catch (error) {
        console.error('❌ Send email error:', error);

        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({
                success: false,
                error: error.message || 'Failed to send email'
            })
        };
    }
};
