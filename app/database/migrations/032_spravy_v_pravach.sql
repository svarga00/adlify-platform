-- ============================================================================
-- DANUBRA — Správy do práv
-- ============================================================================
-- Obrazovka Správy pribudla po migrácii 030, takže `danubra_can()` o nej
-- nevedela: koordinátor, náborár aj účtovníctvo by ju mali v menu, ale
-- databáza by im ju odmietla.
--
-- Chytil to test, ktorý porovnáva zoznam práv v appke so zoznamom v migrácii.
-- Preto ten test existuje — inak by to vyzeralo ako chyba appky.
-- ============================================================================
create or replace function danubra_can(p_key text)
returns bool language plpgsql stable security definer set search_path = public as $$
declare
  m danubra_members;
begin
  if auth.role() = 'service_role' or danubra_no_members() then return true; end if;
  select * into m from danubra_members where user_id = auth.uid() and active limit 1;
  if m.id is null then return false; end if;
  if m.role = 'admin' then return true; end if;

  if p_key in ('invoice.approve', 'deploy.override', 'members.manage',
               'settings.write', 'demo.purge') then
    return false;
  end if;

  if m.modules is not null and array_length(m.modules, 1) > 0 then
    return p_key = any(m.modules);
  end if;

  return case m.role
    when 'coordinator' then p_key in ('dashboard','tasks','messages','subcontracts','timesheets',
      'hoursheet','crews','workers','partners','quotes','contracts','accommodations',
      'compliance','costs','ads','hiring','candidates')
    when 'recruiter' then p_key in ('dashboard','tasks','messages','ads','hiring','candidates',
      'workers','crews','trades','recruiting')
    when 'accountant' then p_key in ('dashboard','messages','invoices','costs','bank','partners',
      'subcontracts','timesheets')
    else false
  end;
end $$;
