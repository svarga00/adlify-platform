// =====================================================
// ADLIFY - Email Sync (Netlify Function)
// netlify/functions/email-sync.js
// =====================================================

const Imap = require('imap');
const { simpleParser } = require('mailparser');
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
        const { accountId, folder = 'INBOX', limit = 50 } = body;

        if (!accountId) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ success: false, error: 'accountId is required' })
            };
        }

        // Načítaj account
        const { data: account, error: accError } = await supabase
            .from('email_accounts')
            .select('*')
            .eq('id', accountId)
            .single();

        if (accError || !account) {
            return {
                statusCode: 404,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ success: false, error: 'Account not found' })
            };
        }

        if (!account.imap_host || !account.imap_user || !account.imap_password) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ success: false, error: 'IMAP not configured' })
            };
        }

        console.log(`📬 Syncing ${account.email}, folder: ${folder}`);

        // Update status
        await supabase
            .from('email_accounts')
            .update({ sync_status: 'syncing' })
            .eq('id', accountId);

        // IMAP config
        const imapConfig = {
            user: account.imap_user,
            password: account.imap_password,
            host: account.imap_host,
            port: account.imap_port || 993,
            tls: account.imap_secure !== false,
            tlsOptions: { rejectUnauthorized: false },
            authTimeout: 10000,
            connTimeout: 15000
        };

        // Fetch emails
        const emails = await fetchEmails(imapConfig, folder, limit);
        
        console.log(`📧 Fetched ${emails.length} emails`);

        // Save to DB
        let newCount = 0;
        for (const email of emails) {
            const { error } = await supabase
                .from('emails')
                .upsert({
                    account_id: accountId,
                    message_id: email.messageId,
                    folder: folder,
                    from_address: email.from?.value?.[0]?.address || '',
                    from_name: email.from?.value?.[0]?.name || '',
                    to_addresses: email.to?.value || [],
                    cc_addresses: email.cc?.value || [],
                    subject: email.subject || '(Bez predmetu)',
                    body_text: (email.text || '').substring(0, 100000),
                    body_html: (email.html || '').substring(0, 500000),
                    snippet: (email.text || '').substring(0, 250).replace(/\s+/g, ' '),
                    date: email.date || new Date(),
                    has_attachments: (email.attachments || []).length > 0,
                    attachments: (email.attachments || []).map(a => ({
                        filename: a.filename,
                        size: a.size,
                        contentType: a.contentType
                    })),
                    is_read: email.flags?.includes('\\Seen') || false,
                    is_starred: email.flags?.includes('\\Flagged') || false,
                    received_at: new Date()
                }, {
                    onConflict: 'account_id,message_id',
                    ignoreDuplicates: false
                });

            if (!error) newCount++;
        }

        // Update status
        await supabase
            .from('email_accounts')
            .update({
                sync_status: 'success',
                last_sync_at: new Date().toISOString(),
                sync_error: null
            })
            .eq('id', accountId);

        console.log(`✅ Sync complete: ${newCount} new emails`);

        return {
            statusCode: 200,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({
                success: true,
                account: account.email,
                folder: folder,
                fetched: emails.length,
                new: newCount
            })
        };

    } catch (error) {
        console.error('❌ Sync error:', error);

        // Update error status
        try {
            const body = JSON.parse(event.body || '{}');
            if (body.accountId) {
                await supabase
                    .from('email_accounts')
                    .update({
                        sync_status: 'error',
                        sync_error: error.message
                    })
                    .eq('id', body.accountId);
            }
        } catch (e) {}

        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ success: false, error: error.message })
        };
    }
};

// =====================================================
// IMAP FETCH HELPER
// =====================================================

function fetchEmails(config, folder, limit) {
    return new Promise((resolve, reject) => {
        const imap = new Imap(config);
        const emails = [];

        imap.once('ready', () => {
            imap.openBox(folder, true, (err, box) => {
                if (err) {
                    imap.end();
                    return reject(err);
                }

                // Fetch last N messages
                const total = box.messages.total;
                const start = Math.max(1, total - limit + 1);
                const range = `${start}:${total}`;

                if (total === 0) {
                    imap.end();
                    return resolve([]);
                }

                const fetch = imap.seq.fetch(range, {
                    bodies: '',
                    struct: true
                });

                fetch.on('message', (msg) => {
                    let buffer = '';
                    let flags = [];

                    msg.on('body', (stream) => {
                        stream.on('data', (chunk) => {
                            buffer += chunk.toString('utf8');
                        });
                    });

                    msg.once('attributes', (attrs) => {
                        flags = attrs.flags || [];
                    });

                    msg.once('end', async () => {
                        try {
                            const parsed = await simpleParser(buffer);
                            parsed.flags = flags;
                            emails.push(parsed);
                        } catch (e) {
                            console.warn('Parse error:', e.message);
                        }
                    });
                });

                fetch.once('error', (err) => {
                    imap.end();
                    reject(err);
                });

                fetch.once('end', () => {
                    imap.end();
                });
            });
        });

        imap.once('error', reject);
        imap.once('end', () => resolve(emails));
        imap.connect();
    });
}
