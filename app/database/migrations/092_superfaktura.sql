-- ============================================================================
-- DANUBRA — 092 — SuperFaktúra: vystavenie, PDF, úhrady, dobropis
-- ============================================================================
-- Doplnenie k 018 (vydané faktúry) pre ostrý test integrácie v sandboxe.
--
--   1. Nastavenia SuperFaktúry (`danubra_settings.superfaktura`): jazyk,
--      bankový účet, číselný rad, spôsob úhrady, veta k reverse charge,
--      spôsob odoslania. Kľúče sem NEPATRIA — sú len v premenných prostredia
--      na serveri (SF_EMAIL, SF_API_KEY, SF_COMPANY_ID, SF_ENV).
--   2. Stav dokladu v SuperFaktúre pri faktúre: číslo, ktoré SuperFaktúra
--      zapísala, celková suma podľa nej, úhrada podľa nej, kontrola zhody
--      („nesúhlasí so SuperFaktúrou"), kľúč proti dvojitému vystaveniu.
--   3. Dobropis: `kind` = 'invoice' | 'credit_note', väzba na pôvodnú
--      faktúru a dôvod. Dobropis je bežný riadok faktúry so zápornou sumou —
--      ide tým istým schvaľovaním (návrh → čaká → schválený adminom →
--      vystavený v SuperFaktúre). Nič sa nemaže, pôvodná faktúra zostáva.
--   4. Odberateľ v SuperFaktúre: id klienta platí len pre to prostredie,
--      v ktorom vzniklo (sandbox a ostrý účet majú iný adresár).
--   5. Archív dokumentov: PDF zo SuperFaktúry sa ukladá k faktúre.
--
-- Dáta sa nemenia. Idempotentné.
-- ============================================================================

-- ── 1. Nastavenia ───────────────────────────────────────────────────────────
alter table danubra_settings add column if not exists superfaktura jsonb default '{}'::jsonb;

comment on column danubra_settings.superfaktura is
  'Mapovanie do SuperFaktúry: default_language (deu|slo|eng), bank_account_id, iban, swift, '
  'sequence_id, payment_type, due_days, use_own_number, reverse_charge_note, send_mode '
  '(sf|mail), cc, sync_daily. API kľúče sem nepatria — sú len v premenných prostredia.';

-- ── 2. Stav dokladu v SuperFaktúre ──────────────────────────────────────────
alter table danubra_invoices
  add column if not exists sf_number text,
  add column if not exists sf_total numeric,
  add column if not exists sf_status text,
  add column if not exists sf_paid_amount numeric,
  add column if not exists sf_paid_at timestamptz,
  add column if not exists sf_sent_at timestamptz,
  add column if not exists sf_check text,
  add column if not exists sf_check_note text,
  add column if not exists sf_idempotency_key text;

comment on column danubra_invoices.sf_number is
  'Číslo, ktoré je na doklade v SuperFaktúre. Zákonné číslo je invoice_number '
  '(prideľuje appka) — do SuperFaktúry ide ako invoice_no_formatted. Iné číslo = '
  'sf_check mismatch a faktúra sa cez SuperFaktúru neodošle.';
comment on column danubra_invoices.sf_total is
  'Celková suma dokladu podľa SuperFaktúry po vystavení. Musí sa rovnať total.';
comment on column danubra_invoices.sf_status is
  'Posledný stav podľa SuperFaktúry: issued | sent | partial | paid | overdue. '
  'Len informácia zo synchronizácie — stav faktúry v appke (status) sa podľa '
  'toho neprepisuje naslepo.';
comment on column danubra_invoices.sf_check is
  'ok | mismatch. mismatch = suma alebo číslo v SuperFaktúre nesedí s appkou. '
  'Taká faktúra sa neodošle, kým to niekto neskontroluje.';
comment on column danubra_invoices.sf_idempotency_key is
  'Kľúč pokusu o vystavenie (id faktúry + prostredie). Ide aj do internej poznámky '
  'dokladu v SuperFaktúre, aby sa po neistom pokuse dal doklad nájsť a nevznikol druhý.';

do $$
begin
  alter table danubra_invoices add constraint danubra_inv_sf_check_chk
    check (sf_check is null or sf_check in ('ok', 'mismatch'));
exception when duplicate_object then null;
end $$;

create unique index if not exists idx_dinv_sf_idem on danubra_invoices(sf_idempotency_key)
  where sf_idempotency_key is not null;

-- ── 3. Dobropis ─────────────────────────────────────────────────────────────
alter table danubra_invoices
  add column if not exists kind text not null default 'invoice',
  add column if not exists parent_invoice_id uuid references danubra_invoices,
  add column if not exists cancel_reason text;

do $$
begin
  alter table danubra_invoices add constraint danubra_inv_kind_chk
    check (kind in ('invoice', 'credit_note'));
exception when duplicate_object then null;
end $$;

-- Dobropis musí mať pôvodnú faktúru a dôvod (aspoň 10 znakov — „chyba" nestačí).
do $$
begin
  alter table danubra_invoices add constraint danubra_inv_credit_note_chk
    check (kind <> 'credit_note' or (parent_invoice_id is not null
      and length(btrim(coalesce(cancel_reason, ''))) >= 10));
exception when duplicate_object then null;
end $$;

comment on column danubra_invoices.kind is
  'invoice = faktúra, credit_note = dobropis (opravná faktúra so zápornou sumou). '
  'Dobropis ide tým istým schvaľovaním ako faktúra.';
comment on column danubra_invoices.parent_invoice_id is
  'Dobropis: ktorú faktúru opravuje. V SuperFaktúre je to parent_id dokladu typu cancel.';
comment on column danubra_invoices.cancel_reason is
  'Dobropis: prečo vznikol. Povinný, zapíše sa do histórie aj na doklad.';

create index if not exists idx_dinv_parent on danubra_invoices(parent_invoice_id)
  where parent_invoice_id is not null;

-- Jedna faktúra = najviac jeden živý dobropis. Druhý klik na „Stornovať
-- dobropisom" nesmie pripraviť druhý.
create unique index if not exists idx_dinv_one_credit_note on danubra_invoices(parent_invoice_id)
  where kind = 'credit_note' and status <> 'cancelled';

-- ── Schválenie: pravidlá aj pre dobropis ────────────────────────────────────
-- Rovnaká funkcia ako v 070. Pribudla vetva pre dobropis: suma je záporná
-- (nie „na nulu"), musí mať pôvodnú faktúru vystavenú v SuperFaktúre a nesmie
-- opravovať viac, než pôvodná faktúra fakturovala.
create or replace function danubra_invoice_approve_rules()
returns trigger language plpgsql as $$
declare
  v_ust text;
  v_per text;
  v_items numeric;
  v_n int;
  v_parent danubra_invoices;
begin
  if current_user in ('postgres', 'supabase_admin') then return new; end if;
  if new.status is not distinct from old.status or new.status <> 'approved'
     or new.partner_id is null then
    return new;
  end if;

  if coalesce(new.kind, 'invoice') = 'credit_note' then
    if coalesce(new.total, 0) >= 0 then
      raise exception 'Dobropis musí mať zápornú sumu.' using errcode = 'check_violation';
    end if;
    select * into v_parent from danubra_invoices where id = new.parent_invoice_id;
    if v_parent.id is null then
      raise exception 'Dobropis nemá pôvodnú faktúru.' using errcode = 'check_violation';
    end if;
    if v_parent.sf_invoice_id is null then
      raise exception 'Pôvodná faktúra nie je vystavená v SuperFaktúre — dobropis k nej nemá k čomu vzniknúť.'
        using errcode = 'check_violation';
    end if;
    if abs(new.total) > coalesce(v_parent.total, 0) then
      raise exception 'Dobropis (% €) je vyšší než pôvodná faktúra (% €).', abs(new.total), v_parent.total
        using errcode = 'check_violation';
    end if;
    if new.partner_id is distinct from v_parent.partner_id then
      raise exception 'Dobropis musí ísť tomu istému odberateľovi ako pôvodná faktúra.'
        using errcode = 'check_violation';
    end if;
  elsif coalesce(new.total, 0) <= 0 then
    raise exception 'Faktúra je na nulu — schváliť sa nedá.' using errcode = 'check_violation';
  end if;
  if btrim(coalesce(new.invoice_number, '')) = '' then
    raise exception 'Faktúra nemá číslo — schváliť sa nedá.' using errcode = 'check_violation';
  end if;
  if coalesce(new.vat_regime, '') <> 'reverse_charge' then
    raise exception 'Nemeckému odberateľovi fakturujeme len v režime reverse charge §13b. '
      'Zapnite odberateľovi reverse charge a uložte návrh znova.' using errcode = 'check_violation';
  end if;
  select ust_idnr into v_ust from danubra_partners where id = new.partner_id;
  if btrim(coalesce(v_ust, '')) = '' then
    raise exception 'Odberateľ nemá USt-IdNr — reverse charge §13b sa bez neho neuznáva. '
      'Doplňte ho na karte odberateľa.' using errcode = 'check_violation';
  end if;
  if new.period_id is not null then
    select status into v_per from danubra_periods where id = new.period_id;
    if v_per = 'open' then
      raise exception 'Obdobie tejto faktúry je otvorené — hodiny sa ešte môžu zmeniť. Uzavrite ho.'
        using errcode = 'check_violation';
    end if;
  end if;
  -- Voľná faktúra aj dobropis: súčet živých položiek musí byť suma faktúry.
  select count(*), coalesce(sum(round(coalesce(quantity, 0) * round(coalesce(unit_price, 0), 2), 2)), 0)
    into v_n, v_items
    from danubra_invoice_items where invoice_id = new.id and removed_at is null;
  if v_n > 0 and v_items <> round(new.total, 2) then
    raise exception 'Položky dávajú % €, faktúra % €. Otvorte „Upraviť návrh" a uložte znova.',
      v_items, round(new.total, 2) using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists danubra_invoice_approve_rules on danubra_invoices;
create trigger danubra_invoice_approve_rules before update on danubra_invoices
  for each row execute function danubra_invoice_approve_rules();

comment on function danubra_invoice_approve_rules() is
  'Schválenie faktúry odberateľovi: suma > 0, číslo, reverse charge §13b, USt-IdNr '
  'odberateľa, uzavreté obdobie a položky = suma. Dobropis: záporná suma, pôvodná '
  'faktúra vystavená v SuperFaktúre, nie viac než ona. Drží to databáza, nie okno.';

-- ── 4. Odberateľ v SuperFaktúre: v ktorom prostredí ─────────────────────────
alter table danubra_partners add column if not exists sf_client_env text;

comment on column danubra_partners.sf_client_env is
  'sandbox | production — v ktorom účte SuperFaktúry vzniklo sf_client_id. '
  'Id zo sandboxu sa v ostrom účte nepoužije (iný adresár).';

-- ── 5. Archív: PDF k faktúre ────────────────────────────────────────────────
alter table danubra_archive add column if not exists invoice_id uuid references danubra_invoices;
create index if not exists danubra_archive_invoice_idx on danubra_archive (invoice_id, created_at desc)
  where invoice_id is not null;

comment on column danubra_archive.invoice_id is
  'Vydaná faktúra, ku ktorej PDF patrí (napr. PDF stiahnuté zo SuperFaktúry).';

-- ── Diagnostika ─────────────────────────────────────────────────────────────
select kind, status, count(*) from danubra_invoices group by 1, 2 order by 1, 2;
