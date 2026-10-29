-- ============================================================================
-- 073 — ochrana údajov z formulárov webov (danubra_web_submissions)
-- ============================================================================
-- Záznam formulára (059) drží kópiu všetkého, čo prišlo z punds.sk
-- a punds.eu — meno, telefón, e-mail, správu — plus odtlačok IP adresy
-- a prehliadač (user-agent). Slúži na dohľadanie, čo presne prišlo,
-- a na ochranu proti spamu. Doteraz sa nemazal nikdy, takže po žiadosti
-- o vymazanie (GDPR čl. 17) by osobné údaje zostali tu, aj keď sa
-- kandidát / dopyt vybavil.
--
-- Odteraz:
--   1. Lehota uchovania: po 90 dňoch od odoslania sa osobné údaje v zázname
--      anonymizujú. Údaj sám je vtedy už dávno v Kandidátoch alebo Dopytoch
--      (riadok má candidate_id / opportunity_id); záznam, pri ktorom sa
--      kandidát / dopyt nepodarilo založiť (chyba), mal 90 dní na ručné
--      dohľadanie. Ochrana proti spamu potrebuje odtlačok IP len 10 minút.
--      Lehotu môže admin zmeniť v danubra_settings.web.log_retention_days
--      (30–365 dní); bez nastavenia platí 90.
--      Spúšťa denný cron (danubra-cron-daily, service role).
--   2. Na žiadosť (admin): danubra_web_submissions_forget(e-mail, telefón)
--      anonymizuje hneď všetky záznamy daného človeka.
--
-- Anonymizácia = prepis, nie mazanie: riadok ostáva (dátum, web, formulár,
-- jazyk, stránka, spam, prepojenie na kandidáta / dopyt, druh chyby), takže
-- štatistika z webov (danubra_web_stats) sa nemení. Z payloadu ostanú len
-- polia bez osobných údajov (ponuka, profesia, téma, remeslá, počet, forma
-- spolupráce, jazyk, súhlas); meno, telefón, e-mail, firma, správa, miesto,
-- odtlačok IP a user-agent sa zahodia. Text chyby (môže obsahovať adresu
-- z SMTP) sa nahradí všeobecným.
--
-- Výnimka z pravidla „nič sa fyzicky nemaže" (066)? Nie — nič sa nemaže,
-- prepisujú sa len osobné údaje v protokole. To je zákonná povinnosť
-- (GDPR čl. 5 ods. 1 písm. c a e — minimalizácia a obmedzenie uchovania),
-- nie zmena pravidla.
--
-- POZOR: Kandidáti a Dopyty sa touto migráciou nemenia. Žiadosť o vymazanie
-- treba vybaviť aj tam (archivácia z 066 údaje NEvymaže, len skryje).
--
-- Len pridáva stĺpec, index a funkcie. Idempotentné. NEAPLIKOVANÉ — spustí
-- sa ručne v Supabase → SQL editor.
-- ============================================================================
set lock_timeout = '15s';

alter table danubra_web_submissions add column if not exists anonymized_at timestamptz;
comment on column danubra_web_submissions.anonymized_at is
  'Kedy sa osobné údaje v zázname anonymizovali (lehota alebo žiadosť). Riadok ostáva kvôli štatistike.';
create index if not exists danubra_web_submissions_anon_idx
  on danubra_web_submissions (created_at) where anonymized_at is null;


-- ── Lehota ──────────────────────────────────────────────────────────────────
-- 90 dní: dosť na vybavenie prihlášky aj na dohľadanie, čo prišlo, keď
-- založenie kandidáta / dopytu zlyhalo; nie viac, než treba.
create or replace function danubra_web_log_retention_days()
returns integer language sql stable security definer set search_path = public as $$
  select greatest(30, least(365, coalesce(
    (select (web ->> 'log_retention_days')::int
       from danubra_settings
      where (web ->> 'log_retention_days') ~ '^\d{1,4}$'
      order by created_at
      limit 1),
    90)));
$$;
comment on function danubra_web_log_retention_days() is
  'Po koľkých dňoch sa anonymizujú osobné údaje v danubra_web_submissions. '
  'danubra_settings.web.log_retention_days (30–365), inak 90.';


-- ── Čo z payloadu ostane ────────────────────────────────────────────────────
-- Zoznam povolených polí (nie zakázaných): pole, ktoré formulár pridá
-- neskôr, sa pri anonymizácii zahodí, kým ho sem niekto vedome nedopíše.
create or replace function danubra_web_payload_scrub(p jsonb)
returns jsonb language sql immutable set search_path = public as $$
  select coalesce(
           (select jsonb_object_agg(e.key, e.value)
              from jsonb_each(case when jsonb_typeof(p) = 'object' then p else '{}'::jsonb end) e
             where e.key in ('job', 'profession', 'topic', 'trades', 'headcount', 'model', 'lang', 'consent')),
           '{}'::jsonb)
         || '{"anonymized": true}'::jsonb;
$$;

-- Text chyby: druh ostáva (štatistika rozlišuje „invalid…" a ostatné),
-- znenie z SMTP / databázy môže obsahovať adresu alebo hodnotu z formulára.
create or replace function danubra_web_error_scrub(p text)
returns text language sql immutable set search_path = public as $$
  select case
    when p is null then null
    when p ~ '^invalid: [a-z,]*$' then p
    else 'chyba (text anonymizovaný)'
  end;
$$;


-- ── 1. Po lehote (denný cron) ───────────────────────────────────────────────
create or replace function danubra_web_submissions_anonymize()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_days int := danubra_web_log_retention_days();
  v_n int;
begin
  -- danubra_is_admin() je pravda aj pre service role (cron).
  if not danubra_is_admin() then
    raise exception using errcode = '42501',
      message = 'Anonymizovať záznamy z webov môže len administrátor alebo server.';
  end if;
  update danubra_web_submissions s
     set payload = danubra_web_payload_scrub(s.payload),
         ip_hash = null,
         user_agent = null,
         error = danubra_web_error_scrub(s.error),
         anonymized_at = now()
   where s.anonymized_at is null
     and s.created_at < now() - make_interval(days => v_days);
  get diagnostics v_n = row_count;
  return v_n;
end $$;
comment on function danubra_web_submissions_anonymize() is
  'Anonymizuje osobné údaje v danubra_web_submissions starších ako lehota '
  '(danubra_web_log_retention_days). Volá denný cron. Riadky ostávajú.';


-- ── 2. Na žiadosť (len admin) ───────────────────────────────────────────────
-- Podľa e-mailu (bez ohľadu na veľké písmená) alebo telefónu (porovnáva sa
-- posledných 9 číslic — +421 910 … a 0910 … je to isté číslo). Vráti počet
-- anonymizovaných záznamov. Do danubra_activities sa zapíše, že sa to stalo
-- a kto to urobil — bez e-mailu a telefónu (tie sa práve vymazávajú).
--   select danubra_web_submissions_forget('jan@example.sk', '+421 900 111 222');
create or replace function danubra_web_submissions_forget(p_email text default null, p_phone text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(nullif(btrim(coalesce(p_email, '')), ''));
  v_digits text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 9);
  v_n int;
begin
  if not danubra_is_admin() then
    raise exception using errcode = '42501',
      message = 'Údaje z webov na žiadosť môže vymazať len administrátor.';
  end if;
  if v_email is not null and v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception using errcode = '22023', message = 'E-mail nie je platný. Skontrolujte ho, prosím.';
  end if;
  if length(v_digits) < 7 then
    v_digits := null;
    if coalesce(p_phone, '') ~ '\d' then
      raise exception using errcode = '22023', message = 'Telefón musí mať aspoň 7 číslic.';
    end if;
  end if;
  if v_email is null and v_digits is null then
    raise exception using errcode = '22023', message = 'Zadajte e-mail alebo telefón človeka, ktorý žiada o vymazanie.';
  end if;

  update danubra_web_submissions s
     set payload = danubra_web_payload_scrub(s.payload),
         ip_hash = null,
         user_agent = null,
         error = danubra_web_error_scrub(s.error),
         anonymized_at = now()
   where s.anonymized_at is null
     and (   (v_email is not null and lower(btrim(coalesce(s.payload ->> 'email', ''))) = v_email)
          or (v_digits is not null
              and right(regexp_replace(coalesce(s.payload ->> 'phone', ''), '\D', '', 'g'), length(v_digits)) = v_digits));
  get diagnostics v_n = row_count;

  insert into danubra_activities (entity_type, entity_id, type, body, source, created_by)
  values ('web_submissions', null, 'system',
          format('Na žiadosť o vymazanie (GDPR) anonymizované záznamy formulárov z webov: %s.', v_n),
          'gdpr', auth.uid());
  return v_n;
end $$;
comment on function danubra_web_submissions_forget(text, text) is
  'Žiadosť o vymazanie: hneď anonymizuje záznamy v danubra_web_submissions podľa e-mailu alebo telefónu. '
  'Len admin. Kandidátov a Dopyty treba vybaviť zvlášť.';


-- ── Práva ───────────────────────────────────────────────────────────────────
-- Supabase dáva novým funkciám EXECUTE aj pre anon (pozri 069, časť 8).
revoke execute on function danubra_web_log_retention_days() from public, anon;
revoke execute on function danubra_web_payload_scrub(jsonb) from public, anon, authenticated;
revoke execute on function danubra_web_error_scrub(text) from public, anon, authenticated;
revoke execute on function danubra_web_submissions_anonymize() from public, anon;
revoke execute on function danubra_web_submissions_forget(text, text) from public, anon;
grant execute on function danubra_web_log_retention_days() to authenticated, service_role;
grant execute on function danubra_web_payload_scrub(jsonb) to service_role;
grant execute on function danubra_web_error_scrub(text) to service_role;
-- Prihlásený smie zavolať, funkcia sama pustí len admina.
grant execute on function danubra_web_submissions_anonymize() to authenticated, service_role;
grant execute on function danubra_web_submissions_forget(text, text) to authenticated, service_role;


-- ── Kontrola ────────────────────────────────────────────────────────────────
select
  danubra_web_log_retention_days() as lehota_dni,
  (select count(*) from danubra_web_submissions
    where anonymized_at is null and created_at < now() - make_interval(days => danubra_web_log_retention_days()))
    as caka_na_anonymizaciu,
  has_function_privilege('anon', 'danubra_web_submissions_forget(text, text)', 'execute') as anon_smie_vymazat;
