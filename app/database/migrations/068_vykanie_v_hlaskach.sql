-- ============================================================================
-- DANUBRA — vykanie aj v hláškach z databázy
-- ============================================================================
-- Tri hlášky z databázy, ktoré appka ukazuje používateľovi, tykali
-- („otvor ho späť", „oprav to", „zapíš"). Firma vyká všade. Mení sa len
-- text hlášky, logika funkcií ostáva rovnaká (definícia sa vezme z databázy
-- a nahradí sa v nej len veta).
-- ============================================================================
do $x$
declare
  r record;
  v_def text;
  v_new text;
begin
  for r in
    select * from (values
      ('danubra_timesheet_period_frozen',
       'otvor ho späť alebo zapíš opravu do nasledujúceho obdobia',
       'otvorte ho späť alebo zapíšte opravu do nasledujúceho obdobia'),
      ('danubra_reopen_period',
       'oprav to dobropisom alebo v nasledujúcom období',
       'opravte to dobropisom alebo v nasledujúcom období'),
      ('danubra_amendment_no_delete',
       'zapíš ďalší dodatok, ktorý ju vracia späť',
       'zapíšte ďalší dodatok, ktorý ju vracia späť')
    ) as t(fn, stara, nova)
  loop
    for v_def in
      select pg_get_functiondef(p.oid) from pg_proc p
       where p.proname = r.fn and p.pronamespace = 'public'::regnamespace
    loop
      v_new := replace(v_def, r.stara, r.nova);
      if v_new <> v_def then
        execute v_new;
      end if;
    end loop;
  end loop;
end $x$;

-- ── Kontrola: nič z toho už netyká ─────────────────────────────────────────
select p.proname
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('danubra_timesheet_period_frozen', 'danubra_reopen_period', 'danubra_amendment_no_delete')
   and pg_get_functiondef(p.oid) ~ '(otvor ho späť|oprav to dobropisom|zapíš ďalší dodatok)';
