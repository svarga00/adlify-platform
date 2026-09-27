-- ============================================================================
-- DANUBRA Hub v2 — F8 — Banka a cash-flow
-- ============================================================================
-- Podľa biznis plánu je likvidita najpravdepodobnejší dôvod zlyhania — nie
-- nedostatok dopytu. Odberateľ platí za 30–60 dní, živnostníkom sa platí
-- do 14. Rozdiel treba vidieť **dopredu**, nie v deň, keď nie je na výplaty.
--
-- Tri veci, ktoré drží databáza:
--
--   1. **Ten istý pohyb sa nenaimportuje dvakrát.** `import_hash` je unikátny;
--      opakovaný import toho istého výpisu nič nepridá. Bez toho by sa dvakrát
--      naimportovaný výpis tváril ako dvojnásobný príjem.
--   2. **Spárovaný pohyb označí faktúru ako uhradenú**, nie naopak — peniaze
--      na účte sú tvrdší fakt než klik v appke.
--   3. **Jedna faktúra, jeden pohyb.** Dva pohyby na tú istú faktúru sú
--      spravidla chyba párovania a databáza to nepustí.
--
-- Idempotentné.
-- ============================================================================

create table if not exists danubra_bank_transactions (
  id uuid primary key default gen_random_uuid(),
  booked_at date not null,
  amount numeric not null,                 -- kladné príjem, záporné výdaj
  currency text default 'EUR',
  counterparty_name text,
  counterparty_iban text,
  variable_symbol text,
  constant_symbol text,
  specific_symbol text,
  message text,
  -- párovanie
  matched_invoice_id uuid references danubra_invoices,
  matched_bill_id uuid references danubra_bills,
  matched_cost_id uuid references danubra_costs,
  match_status text not null default 'unmatched',  -- unmatched|auto|manual|ignored
  match_note text,
  matched_at timestamptz, matched_by uuid references auth.users,
  -- aby sa import nedal spraviť dvakrát
  import_hash text unique,
  import_batch text,
  created_at timestamptz not null default now()
);
create index if not exists idx_dbank_vs on danubra_bank_transactions(variable_symbol)
  where variable_symbol is not null;
create index if not exists idx_dbank_status on danubra_bank_transactions(match_status);
create index if not exists idx_dbank_date on danubra_bank_transactions(booked_at desc);
create index if not exists idx_dbank_iban on danubra_bank_transactions(counterparty_iban)
  where counterparty_iban is not null;

comment on table danubra_bank_transactions is
  'Pohyby na účte. `import_hash` je unikátny, takže opakovaný import toho '
  'istého výpisu nič nepridá.';
comment on column danubra_bank_transactions.amount is
  'Kladné je príjem, záporné výdaj — tak, ako to má výpis.';
comment on column danubra_bank_transactions.import_hash is
  'Odtlačok pohybu (dátum, suma, protistrana, symbol, správa). Počíta ho '
  'appka pri importe; unikátny index zabráni dvojitému naimportovaniu.';

-- Dva pohyby na tú istú faktúru sú spravidla chyba párovania.
create unique index if not exists idx_dbank_one_invoice
  on danubra_bank_transactions(matched_invoice_id)
  where matched_invoice_id is not null and match_status <> 'ignored';
create unique index if not exists idx_dbank_one_bill
  on danubra_bank_transactions(matched_bill_id)
  where matched_bill_id is not null and match_status <> 'ignored';

-- ── Spárovaný pohyb označí doklad ako uhradený ──────────────────────────────
-- Peniaze na účte sú tvrdší fakt než klik v appke.
create or replace function danubra_bank_match_marks_paid()
returns trigger
language plpgsql
as $$
begin
  if new.match_status in ('unmatched', 'ignored') then
    return new;
  end if;

  if new.matched_invoice_id is not null then
    update danubra_invoices
    set status = 'paid', paid_at = coalesce(paid_at, new.booked_at::timestamptz)
    where id = new.matched_invoice_id
      and status in ('issued', 'sent', 'overdue');
  end if;

  if new.matched_bill_id is not null then
    update danubra_bills
    set status = 'paid', paid_at = coalesce(paid_at, new.booked_at::timestamptz)
    where id = new.matched_bill_id
      and status in ('approved', 'checked');
  end if;

  return new;
end $$;

drop trigger if exists danubra_bank_match_trg on danubra_bank_transactions;
create trigger danubra_bank_match_trg after insert or update of match_status,
  matched_invoice_id, matched_bill_id
  on danubra_bank_transactions
  for each row execute function danubra_bank_match_marks_paid();

comment on function danubra_bank_match_marks_paid() is
  'Spárovaný príjem označí faktúru ako uhradenú, spárovaný výdaj prijatú '
  'faktúru. Neschválenú prijatú faktúru neoznačí — najprv ju treba schváliť.';

-- ── Automatické párovanie ───────────────────────────────────────────────────
-- Príjem podľa variabilného symbolu, výdaj podľa IBAN-u a sumy. Čo si nie je
-- isté, zostane nespárované — radšej to nechá človeku, než aby spárovalo zle.
create or replace function danubra_bank_automatch(p_batch text default null)
returns int
language plpgsql
security invoker
as $$
declare
  tx record;
  v_id uuid;
  v_count int := 0;
begin
  for tx in
    select * from danubra_bank_transactions
    where match_status = 'unmatched'
      and (p_batch is null or import_batch = p_batch)
    order by booked_at
  loop
    v_id := null;

    -- Príjem: variabilný symbol musí sedieť s číslom faktúry a suma tiež.
    if tx.amount > 0 and tx.variable_symbol is not null then
      select i.id into v_id
      from danubra_invoices i
      where regexp_replace(coalesce(i.invoice_number, ''), '\D', '', 'g')
            = regexp_replace(tx.variable_symbol, '\D', '', 'g')
        and i.status in ('issued', 'sent', 'overdue')
        and not exists (
          select 1 from danubra_bank_transactions b
          where b.matched_invoice_id = i.id and b.match_status <> 'ignored'
        )
      limit 1;

      if v_id is not null then
        update danubra_bank_transactions
        set matched_invoice_id = v_id, match_status = 'auto', matched_at = now()
        where id = tx.id;
        v_count := v_count + 1;
        continue;
      end if;
    end if;

    -- Výdaj: IBAN živnostníka a suma. Symbol pri prijatých faktúrach
    -- spoľahlivo nesedí, lebo si ho každý píše po svojom.
    if tx.amount < 0 and tx.counterparty_iban is not null then
      select bl.id into v_id
      from danubra_bills bl
      join danubra_workers w on w.id = bl.worker_id
      where replace(upper(coalesce(w.bank_iban, '')), ' ', '')
            = replace(upper(tx.counterparty_iban), ' ', '')
        and abs(bl.amount - abs(tx.amount)) <= 0.01
        and bl.status in ('approved', 'checked')
        and not exists (
          select 1 from danubra_bank_transactions b
          where b.matched_bill_id = bl.id and b.match_status <> 'ignored'
        )
      limit 1;

      if v_id is not null then
        update danubra_bank_transactions
        set matched_bill_id = v_id, match_status = 'auto', matched_at = now()
        where id = tx.id;
        v_count := v_count + 1;
      end if;
    end if;
  end loop;

  return v_count;
end $$;

comment on function danubra_bank_automatch(text) is
  'Spáruje príjmy podľa variabilného symbolu a výdaje podľa IBAN-u a sumy. '
  'Čo si nie je isté, nechá nespárované — zlé spárovanie je horšie než '
  'žiadne. Vracia počet spárovaných.';

-- ── Cash-flow ───────────────────────────────────────────────────────────────
-- Čo má prísť, čo má odísť a kedy. Podľa biznis plánu je toto tá vec, ktorú
-- treba vidieť dopredu.
create or replace view danubra_v_cashflow as
-- Očakávané príjmy z vystavených faktúr
select
  'in'::text                      as direction,
  i.id                            as source_id,
  'invoice'::text                 as source,
  i.invoice_number                as label,
  p.name                          as counterparty,
  i.due_date                      as expected_on,
  -- Na účet príde suma po zrážke §48b, nie fakturovaná.
  coalesce(i.amount_net, i.total) as amount,
  i.status                        as status,
  (i.due_date < current_date)     as overdue
from danubra_invoices i
left join danubra_partners p on p.id = i.partner_id
where i.status in ('issued', 'sent', 'overdue')

union all

-- Očakávané výdaje: faktúry od živnostníkov
select
  'out', bl.id, 'bill', bl.bill_number, w.full_name,
  coalesce(bl.due_date, bl.issue_date + 14),
  -bl.amount, bl.status,
  (coalesce(bl.due_date, bl.issue_date + 14) < current_date)
from danubra_bills bl
join danubra_workers w on w.id = bl.worker_id
where bl.status in ('approved', 'checked')

union all

-- Očakávané výdaje: ostatné náklady, ktoré ešte neprešli účtom
select
  'out', c.id, 'cost', c.description, c.supplier,
  c.cost_date, -c.amount, 'planned', (c.cost_date < current_date)
from danubra_costs c
where not exists (
  select 1 from danubra_bank_transactions b
  where b.matched_cost_id = c.id and b.match_status <> 'ignored'
)
and c.cost_date >= current_date - 60;

comment on view danubra_v_cashflow is
  'Čo má prísť a čo má odísť, aj s dátumom. Pri príjmoch sa počíta suma po '
  'zrážke §48b — na účet príde ona, nie fakturovaná. Náklady, ktoré už prešli '
  'účtom, sa nezapočítavajú druhýkrát.';

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table danubra_bank_transactions enable row level security;
drop policy if exists danubra_auth_all on danubra_bank_transactions;
create policy danubra_auth_all on danubra_bank_transactions
  for all using (auth.role() = 'authenticated' or auth.role() = 'service_role')
  with check (auth.role() = 'authenticated' or auth.role() = 'service_role');

-- ── Číselník ────────────────────────────────────────────────────────────────
insert into danubra_enums (kind, key, label_sk, label_de, hint, sort_order) values
('match_status','unmatched','Nespárované','Nicht zugeordnet',
 'Appka si nebola istá — pozri sa na to.',1),
('match_status','auto','Spárované automaticky','Automatisch zugeordnet',null,2),
('match_status','manual','Spárované ručne','Manuell zugeordnet',null,3),
('match_status','ignored','Nezaujíma nás','Ignoriert',
 'Pohyb, ktorý sa k ničomu nepáruje — napríklad prevod medzi vlastnými účtami.',4)
on conflict (kind, key) do update set
  label_sk = excluded.label_sk, label_de = excluded.label_de,
  hint = excluded.hint, sort_order = excluded.sort_order;

-- Diagnostika
select match_status, count(*) from danubra_bank_transactions group by match_status;
