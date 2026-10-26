-- 061 — grafický e-mailový podpis schránky (návrh 3a/3b)
--   signature_card = { enabled, name, role, phone, lang: 'sk'|'de', cta_label, cta_url, web }
-- Stĺpec sa smie čítať (ako ostatné okrem hesla), zapisuje len server.
set lock_timeout = '15s';
alter table danubra_mailboxes add column if not exists signature_card jsonb not null default '{}'::jsonb;
grant select (signature_card) on danubra_mailboxes to authenticated;
