-- ============================================================================
-- 055 — položky faktúry: úprava návrhu bez mazania
-- ============================================================================
-- Návrh faktúry sa dá pred schválením upraviť (položky, dátumy). Položka,
-- ktorú človek z návrhu vyhodí, sa nemaže — dostane `removed_at` a do súčtu,
-- dokumentu ani do SuperFaktúry už nejde.
--
-- Po schválení sa položky meniť nesmú: vystavený doklad sa nemení.
-- ============================================================================

alter table danubra_invoice_items add column if not exists removed_at timestamptz;

create or replace function danubra_invoice_items_guard()
returns trigger language plpgsql as $$
declare st text;
begin
  if current_user in ('postgres', 'supabase_admin') then return coalesce(new, old); end if;
  select status into st from danubra_invoices where id = coalesce(new.invoice_id, old.invoice_id);
  if st is not null and st not in ('draft', 'pending_approval', 'draft_pending_approval') then
    raise exception 'Položky faktúry sa po schválení nemenia (faktúra je „%").', st
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists danubra_invoice_items_guard on danubra_invoice_items;
create trigger danubra_invoice_items_guard before insert or update or delete on danubra_invoice_items
  for each row execute function danubra_invoice_items_guard();

-- Schválená faktúra: suma, odberateľ a dátumy sa už nemenia (mení sa len
-- stav — vystavenie, odoslanie, úhrada). Oprava schválenej faktúry je dobropis.
create or replace function danubra_invoice_locked_guard()
returns trigger language plpgsql as $$
begin
  if current_user in ('postgres', 'supabase_admin') then return new; end if;
  if old.status in ('approved', 'issued', 'sent', 'paid', 'overdue')
     and (new.total is distinct from old.total
       or new.amount_net is distinct from old.amount_net
       or new.withholding_amount is distinct from old.withholding_amount
       or new.partner_id is distinct from old.partner_id
       or new.issue_date is distinct from old.issue_date
       or new.delivery_date is distinct from old.delivery_date) then
    raise exception 'Schválená faktúra sa nemení (je „%"). Opravuje sa dobropisom.', old.status
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists danubra_invoice_locked_guard on danubra_invoices;
create trigger danubra_invoice_locked_guard before update on danubra_invoices
  for each row execute function danubra_invoice_locked_guard();
