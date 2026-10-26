-- 060 — nastavenia webov punds.sk / punds.eu (automatické e-maily)
--   web = { confirm: true, mailbox_sk: uuid, mailbox_eu: uuid, notify_sk: 'info@punds.sk', notify_eu: 'info@punds.eu' }
set lock_timeout = '15s';
alter table danubra_settings add column if not exists web jsonb not null default '{}'::jsonb;
