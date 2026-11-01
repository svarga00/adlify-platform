-- ============================================================================
-- 087 — Remeslá firiem (Marketing)
-- ============================================================================
-- „Tu by som potreboval určiť remeslo, ale všade :)"
--
-- Firma (nová firma aj odkaz od kolegu) má jedno alebo viac remesiel ako
-- kľúče danubra_trades (trockenbau, maliar, omietkar…; „bau" = všeobecne).
-- Kľúče a názvy: app/lib/marketing/trades.js.
--
--   danubra_leads.trade_keys      null = automaticky (appka ich odhadne
--                                 z remesla od AI, kategórií Máp, webu);
--                                 vyplnené = určené (ručne alebo pri hľadaní)
--   danubra_lead_tips.trade_keys  čo kolega zaklikol vo formulári; pri
--                                 pridaní do Nových firiem sa prenesie
--
-- Nič sa nemaže. Idempotentné.
-- ============================================================================

alter table danubra_leads add column if not exists trade_keys text[];
alter table danubra_lead_tips add column if not exists trade_keys text[];

create index if not exists idx_dleads_trade_keys on danubra_leads using gin (trade_keys);
create index if not exists idx_dltips_trade_keys on danubra_lead_tips using gin (trade_keys);

comment on column danubra_leads.trade_keys is
  'Remeslá firmy — kľúče danubra_trades (app/lib/marketing/trades.js). null = automaticky z textu firmy; vyplnené = určené ručne alebo pri hľadaní. E-mail a prezentácia (pitch.js) ich berú pred odhadom.';
comment on column danubra_lead_tips.trade_keys is
  'Remeslá, ktoré kolega zaklikol vo formulári app/odkazy.html (overené proti vstavaným kľúčom). Pri pridaní do Nových firiem sa skopírujú do danubra_leads.trade_keys.';

notify pgrst, 'reload schema';
