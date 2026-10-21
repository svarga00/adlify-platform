-- ============================================================================
-- DANUBRA — nová faktúra vzniká vždy ako návrh
-- ============================================================================
-- Tvrdé pravidlo: faktúra sa nikdy nevystaví ani neodošle bez schválenia
-- adminom. Prechody stavu strážia spúšťače pri `update` (018, 030). Pri
-- `insert` ale nestrážilo nič — faktúra „zo zákazky" tak vznikala rovno
-- ako vystavená a schvaľovanie sa obišlo.
--
-- Odteraz sa nová faktúra dá založiť len ako návrh. Vystaví sa až
-- schválením (update), ktoré smie spraviť len administrátor.
--
-- Dáta sa nemenia. Idempotentné.
-- ============================================================================

create or replace function danubra_invoice_insert_guard()
returns trigger language plpgsql as $$
begin
  -- Migrácie a vzorové dáta bežia ako vlastník databázy (SQL editor), nie
  -- cez appku ani cron. Tým sa nebráni — appka (authenticated) aj cron
  -- (service_role) sú strážené.
  if current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  if coalesce(new.status, 'draft_pending_approval')
     not in ('draft', 'pending_approval', 'draft_pending_approval') then
    raise exception
      'Nová faktúra vzniká len ako návrh (teraz „%"). Vystaví sa až po schválení adminom.',
      new.status using errcode = 'check_violation';
  end if;
  if new.approved_by is not null or new.approved_at is not null
     or new.sf_invoice_id is not null then
    raise exception 'Nová faktúra nemôže byť vopred schválená ani vystavená.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists danubra_invoice_insert_guard on danubra_invoices;
create trigger danubra_invoice_insert_guard before insert on danubra_invoices
  for each row execute function danubra_invoice_insert_guard();

comment on function danubra_invoice_insert_guard() is
  'Nová faktúra vzniká len ako návrh (draft / pending_approval / '
  'draft_pending_approval). Vystaviť ju smie len administrátor schválením.';
