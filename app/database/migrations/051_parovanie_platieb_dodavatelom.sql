-- ============================================================================
-- DANUBRA — automatické párovanie platieb aj pre faktúry od dodávateľov
-- ============================================================================
-- Výdaj sa doteraz pároval len na faktúru od živnostníka, podľa IBAN-u
-- uloženého pri živnostníkovi. Faktúry nahraté z PDF majú IBAN aj variabilný
-- symbol priamo pri sebe a môžu byť od hocikoho (ubytovanie, palivo…).
--
-- Výdaj sa teraz spáruje, keď sedí suma a k tomu:
--   1. variabilný symbol faktúry, alebo
--   2. IBAN z faktúry, alebo
--   3. IBAN živnostníka (ako doteraz).
-- Stále len so schválenou alebo skontrolovanou faktúrou — neschválená sa
-- uhradenou neoznačí (danubra_bank_match_marks_paid). Čo si nie je isté,
-- zostane nespárované.
--
-- Príjmy sa párujú ako doteraz. Dáta sa nemenia. Idempotentné.
-- ============================================================================

create or replace function danubra_bank_automatch(p_batch text default null)
returns int
language plpgsql
security invoker
as $$
declare
  tx record;
  v_id uuid;
  v_count int := 0;
  v_iban text;
  v_vs text;
begin
  for tx in
    select * from danubra_bank_transactions
    where match_status = 'unmatched'
      and (p_batch is null or import_batch = p_batch)
    order by booked_at
  loop
    v_id := null;

    -- Príjem: variabilný symbol musí sedieť s číslom faktúry.
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

    -- Výdaj: suma a k tomu VS alebo IBAN (z faktúry, inak zo živnostníka).
    if tx.amount < 0 then
      v_iban := nullif(replace(upper(coalesce(tx.counterparty_iban, '')), ' ', ''), '');
      v_vs := nullif(ltrim(regexp_replace(coalesce(tx.variable_symbol, ''), '\D', '', 'g'), '0'), '');

      select bl.id into v_id
      from danubra_bills bl
      left join danubra_workers w on w.id = bl.worker_id
      where abs(bl.amount - abs(tx.amount)) <= 0.01
        and bl.status in ('approved', 'checked')
        and (
          (v_vs is not null and ltrim(regexp_replace(coalesce(bl.variable_symbol, ''), '\D', '', 'g'), '0') = v_vs)
          or (v_iban is not null and replace(upper(coalesce(bl.supplier_iban, '')), ' ', '') = v_iban)
          or (v_iban is not null and replace(upper(coalesce(w.bank_iban, '')), ' ', '') = v_iban)
        )
        and not exists (
          select 1 from danubra_bank_transactions b
          where b.matched_bill_id = bl.id and b.match_status <> 'ignored'
        )
      order by
        -- Najprv to, čo sedí na VS aj IBAN, potom najstaršia splatnosť.
        ((v_vs is not null and ltrim(regexp_replace(coalesce(bl.variable_symbol, ''), '\D', '', 'g'), '0') = v_vs)::int
         + (v_iban is not null and v_iban in (replace(upper(coalesce(bl.supplier_iban, '')), ' ', ''),
                                              replace(upper(coalesce(w.bank_iban, '')), ' ', '')))::int) desc,
        bl.due_date nulls last
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
  'Spáruje príjmy podľa variabilného symbolu a výdaje podľa sumy + VS alebo '
  'IBAN-u (z faktúry alebo zo živnostníka). Čo si nie je isté, nechá '
  'nespárované. Vracia počet spárovaných.';
