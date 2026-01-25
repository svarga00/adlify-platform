// =====================================================
// ADLIFY - Email Sync Netlify Function v3.1
// Synchronizuje všetky zložky, resetuje is_deleted
// =====================================================

const { createClient } = require('@supabase/supabase-js');
const Imap = require('imap');
const { simpleParser } = require('mailparser');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const FOLDER_MAPPINGS = {
    'INBOX': 'INBOX',
    'Sent': ['Sent', 'INBOX.Sent', 'Sent Messages', 'Sent Items', 'Odoslané', 'INBOX.Odoslane'],
    'Trash': ['Trash', 'INBOX.Trash', 'Deleted Messages', 'Deleted Items', 'Kôš', 'INBOX.Trash', 'Deleted'],
    'Drafts': ['Drafts', 'INBOX.Drafts', 'Draft', 'Koncepty', 'INBOX.Drafts'],
    'Spam': ['Spam', 'INBOX.Spam', 'Junk', 'Junk E-mail', 'INBOX.Junk']
};

exports.handler = async (event) => {
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
        const { accountId, folder = 'ALL', limit = 50 } = JSON.parse(event.body || '{}');

        if (!accountId) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'accountId is required' })
            };
        }

        const { data: account, error: accError } = await supabase
            .from('email_accounts')
            .select('*')
            .eq('id', accountId)
            .single();

        if (accError || !account) {
            return {
                statusCode: 404,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Account not found' })
            };
        }

        console.log(`📬 Syncing ${account.email}`);

        await supabase
            .from('email_accounts')
            .update({ sync_status: 'syncing' })
            .eq('id', accountId);

        let results = {};
        let totalFetched = 0;
        let totalNew = 0;

        if (folder === 'ALL') {
            const availableFolders = await listImapFolders(account);
            console.log('Available folders:', availableFolders);

            const foldersToSync = mapFolders(availableFolders);
            console.log('Folders to sync:', foldersToSync);

            for (const [localName, remoteName] of Object.entries(foldersToSync)) {
                try {
                    console.log(`Syncing: ${remoteName} -> ${localName}`);
                    const result = await syncWithTimeout(account, remoteName, localName, limit, 20000);
                    results[localName] = result;
                    totalFetched += result.fetched;
                    totalNew += result.newCount;
                } catch (err) {
                    console.error(`Error syncing ${remoteName}:`, err.message);
                    results[localName] = { error: err.message };
                }
            }
        } else {
            const result = await syncWithTimeout(account, folder, folder, limit, 25000);
            results[folder] = result;
            totalFetched = result.fetched;
            totalNew = result.newCount;
        }

        await supabase
            .from('email_accounts')
            .update({
                sync_status: 'success',
                last_sync_at: new Date().toISOString()
            })
            .eq('id', accountId);

        try {
            await supabase.from('email_sync_log').insert({
                account_id: accountId,
                folder: folder,
                messages_fetched: totalFetched,
                messages_new: totalNew,
                status: 'success'
            });
        } catch (e) {}

        return {
            statusCode: 200,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({
                success: true,
                account: account.email,
                fetched: totalFetched,
                new: totalNew,
                folders: results
            })
        };

    } catch (error) {
        console.error('❌ Sync error:', error.message);

        try {
            const { accountId } = JSON.parse(event.body || '{}');
            if (accountId) {
                await supabase
                    .from('email_accounts')
                    .update({ sync_status: 'error' })
                    .eq('id', accountId);
            }
        } catch (e) {}

        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ success: false, error: error.message })
        };
    }
};

function listImapFolders(account) {
    return new Promise((resolve, reject) => {
        const imap = new Imap({
            user: account.imap_user || account.email,
            password: account.imap_password,
            host: account.imap_host,
            port: account.imap_port || 993,
            tls: true,
            tlsOptions: { rejectUnauthorized: false },
            connTimeout: 10000,
            authTimeout: 10000
        });

        imap.once('error', reject);
        
        imap.once('ready', () => {
            imap.getBoxes((err, boxes) => {
                imap.end();
                if (err) reject(err);
                else resolve(extractFolderNames(boxes));
            });
        });

        imap.connect();
    });
}

function extractFolderNames(boxes, prefix = '') {
    let folders = [];
    for (const [name, box] of Object.entries(boxes)) {
        const fullName = prefix ? `${prefix}${box.delimiter || '.'}${name}` : name;
        folders.push(fullName);
        if (box.children) {
            folders = folders.concat(extractFolderNames(box.children, fullName));
        }
    }
    return folders;
}

function mapFolders(availableFolders) {
    const result = {};
    
    if (availableFolders.includes('INBOX')) {
        result['INBOX'] = 'INBOX';
    }

    for (const name of FOLDER_MAPPINGS.Sent) {
        if (availableFolders.includes(name)) {
            result['Sent'] = name;
            break;
        }
    }

    for (const name of FOLDER_MAPPINGS.Trash) {
        if (availableFolders.includes(name)) {
            result['Trash'] = name;
            break;
        }
    }

    for (const name of FOLDER_MAPPINGS.Drafts) {
        if (availableFolders.includes(name)) {
            result['Drafts'] = name;
            break;
        }
    }

    return result;
}

function syncWithTimeout(account, remoteFolder, localFolder, limit, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`Timeout syncing ${remoteFolder}`));
        }, timeoutMs);

        syncImap(account, remoteFolder, localFolder, limit)
            .then(result => {
                clearTimeout(timeout);
                resolve(result);
            })
            .catch(err => {
                clearTimeout(timeout);
                reject(err);
            });
    });
}

function syncImap(account, remoteFolder, localFolder, limit) {
    return new Promise((resolve, reject) => {
        let resolved = false;
        const emails = [];

        const imap = new Imap({
            user: account.imap_user || account.email,
            password: account.imap_password,
            host: account.imap_host,
            port: account.imap_port || 993,
            tls: true,
            tlsOptions: { rejectUnauthorized: false },
            connTimeout: 10000,
            authTimeout: 10000
        });

        const finish = (error, result) => {
            if (resolved) return;
            resolved = true;
            try { imap.end(); } catch (e) {}
            if (error) reject(error);
            else resolve(result);
        };

        imap.once('error', (err) => finish(err));

        imap.once('ready', () => {
            imap.openBox(remoteFolder, true, (err, box) => {
                if (err) {
                    finish(err);
                    return;
                }

                console.log(`${remoteFolder}: ${box.messages.total} messages`);

                if (box.messages.total === 0) {
                    finish(null, { fetched: 0, newCount: 0 });
                    return;
                }

                const start = Math.max(1, box.messages.total - limit + 1);
                const range = `${start}:${box.messages.total}`;

                const fetch = imap.seq.fetch(range, {
                    bodies: '',
                    struct: true
                });

                let pending = 0;

                fetch.on('message', (msg, seqno) => {
                    pending++;
                    let buffer = '';

                    msg.on('body', (stream) => {
                        stream.on('data', (chunk) => {
                            buffer += chunk.toString('utf8');
                        });
                    });

                    msg.once('end', async () => {
                        try {
                            const parsed = await simpleParser(buffer);
                            
                            emails.push({
                                account_id: account.id,
                                message_id: parsed.messageId || `gen-${Date.now()}-${seqno}`,
                                uid: seqno,
                                folder: localFolder,
                                from_address: parsed.from?.value?.[0]?.address || '',
                                from_name: parsed.from?.value?.[0]?.name || '',
                                to_addresses: parsed.to?.value || [],
                                cc_addresses: parsed.cc?.value || [],
                                subject: parsed.subject || '',
                                date: parsed.date || new Date(),
                                body_text: parsed.text || '',
                                body_html: parsed.html || '',
                                snippet: (parsed.text || '').substring(0, 200),
                                has_attachments: (parsed.attachments?.length || 0) > 0,
                                attachments: (parsed.attachments || []).map(a => ({
                                    filename: a.filename,
                                    contentType: a.contentType,
                                    size: a.size
                                })),
                                is_read: false,
                                is_starred: false,
                                is_deleted: false  // VŽDY false pri sync!
                            });
                        } catch (parseErr) {
                            console.error('Parse error:', parseErr.message);
                        }
                        pending--;
                    });
                });

                fetch.once('error', (err) => finish(err));

                fetch.once('end', () => {
                    const checkDone = setInterval(async () => {
                        if (pending === 0) {
                            clearInterval(checkDone);
                            
                            let newCount = 0;
                            for (const email of emails) {
                                try {
                                    // Upsert s explicitným resetom is_deleted na false
                                    const { error } = await supabase
                                        .from('emails')
                                        .upsert(email, { 
                                            onConflict: 'account_id,message_id'
                                        });
                                    if (!error) newCount++;
                                } catch (e) {}
                            }
                            
                            console.log(`${localFolder}: saved ${newCount}/${emails.length}`);
                            finish(null, { fetched: emails.length, newCount });
                        }
                    }, 100);
                    
                    setTimeout(() => {
                        clearInterval(checkDone);
                        if (!resolved) finish(null, { fetched: emails.length, newCount: 0 });
                    }, 15000);
                });
            });
        });

        imap.connect();
    });
}
