-- ============================================================================
-- DANUBRA — zmluva má konečne to, čo zmluva mať musí
-- ============================================================================
-- Zmluva bola najchudobnejší záznam v appke: názov, odberateľ, druh, dva
-- dátumy, hodinová sadzba, splatnosť a predmet diela. Nič viac.
--
-- Chýbalo z nej presne to, čo pri nemeckej subdodávke rozhoduje:
--
--   • **Miesto plnenia.** Werkvertrag bez stavby je zmluva o ničom. Pri
--     kontrole je to prvá otázka.
--   • **Iná cena než hodinová.** Zmluva o dielo, ktorá má cenu za hodinu,
--     je sama o sebe signál skrytej Arbeitnehmerüberlassung — dielo sa platí
--     za dielo. Pevná cena alebo cena za jednotku (m², bm, kus) je to, čo
--     tú zmluvu drží. Appka doteraz vedela len sadzbu za hodinu.
--   • **Zádržné a záruka.** Sicherheitseinbehalt býva 5 % a drží sa aj rok
--     po odovzdaní; kto o ňom nevie, počíta s peniazmi, ktoré nepríde.
--   • **Zmluvná pokuta a výpovedná lehota.**
--   • **Kontakt na človeka**, ktorý zmluvu za odberateľa rieši.
--
-- Druhá vec: **dodatok sa nedal označiť za podpísaný.** Tabuľka má
-- `signed_at` aj `storage_path`, ale RLS mala len select a insert — takže
-- keď dodatok prišiel podpísaný, nebolo to kam zapísať. Append-only má
-- znamenať „história sa neprepisuje", nie „podpis sa nedá zaznamenať".
--
-- Idempotentné. Nič sa nemaže ani nepremenúva.
-- ============================================================================

-- ── Čo zmluve chýbalo ───────────────────────────────────────────────────────
alter table danubra_contracts add column if not exists site_name text;
alter table danubra_contracts add column if not exists site_city text;
alter table danubra_contracts add column if not exists site_address text;

alter table danubra_contracts add column if not exists price_model text default 'hourly';
alter table danubra_contracts add column if not exists fixed_price numeric;
alter table danubra_contracts add column if not exists unit_label text;
alter table danubra_contracts add column if not exists unit_price numeric;

alter table danubra_contracts add column if not exists retention_pct numeric;
alter table danubra_contracts add column if not exists warranty_months int;
alter table danubra_contracts add column if not exists penalty_note text;
alter table danubra_contracts add column if not exists notice_days int;

alter table danubra_contracts add column if not exists contact_name text;
alter table danubra_contracts add column if not exists contact_email text;
alter table danubra_contracts add column if not exists contact_phone text;

do $$
begin
  alter table danubra_contracts add constraint danubra_con_price_model_chk
    check (price_model in ('hourly', 'fixed', 'unit'));
exception when duplicate_object then null;
end $$;

-- Zádržné nad 10 % je v stavebníctve neobvyklé a býva to preklep (5 vs 50).
do $$
begin
  alter table danubra_contracts add constraint danubra_con_retention_chk
    check (retention_pct is null or (retention_pct >= 0 and retention_pct <= 20));
exception when duplicate_object then null;
end $$;

comment on column danubra_contracts.price_model is
  'hourly = za hodinu, fixed = pevná cena za dielo, unit = za jednotku. '
  'Hodinová cena v zmluve o dielo je jeden zo znakov skrytej '
  'Arbeitnehmerüberlassung — appka to pri hodinovej cene pripomenie.';
comment on column danubra_contracts.retention_pct is
  'Sicherheitseinbehalt v percentách. Odberateľ si ho zadrží do konca '
  'záruky — do výhľadu cash-flow teda tie peniaze nepatria hneď.';
comment on column danubra_contracts.warranty_months is
  'Gewährleistung v mesiacoch. Pri stavebných prácach podľa VOB/B býva 48, '
  'podľa BGB 60 mesiacov.';

-- ── Cenové modely do číselníka ──────────────────────────────────────────────
insert into danubra_enums (kind, key, label_sk, label_de, hint, sort_order) values
('price_model','fixed','Pevná cena za dielo','Pauschalpreis',
 'Najbezpečnejší tvar: dielo sa platí za dielo.',1),
('price_model','unit','Za jednotku','Einheitspreis',
 'Za m², bm alebo kus. Tiež dielo, len merateľné.',2),
('price_model','hourly','Za hodinu','Stundensatz',
 'Pri zmluve o dielo je to signál skrytej Arbeitnehmerüberlassung.',3)
on conflict (kind, key) do update set
  label_sk = excluded.label_sk, label_de = excluded.label_de,
  hint = excluded.hint, sort_order = excluded.sort_order;

-- ── Nové ceny sú dohodnuté podmienky, takže tiež cez dodatok ────────────────
-- Trigger z migrácie 016 chránil `date_to` a `charge_rate`. Pevná cena a cena
-- za jednotku sú to isté — dohodnutá odmena. Bez rozšírenia by stačilo
-- prepnúť cenový model a sadzbu prepísať bokom.
create or replace function danubra_contract_needs_amendment()
returns trigger
language plpgsql
as $$
declare
  f text;
  old_txt text;
  new_txt text;
begin
  foreach f in array array['date_to', 'charge_rate', 'fixed_price',
                           'unit_price', 'retention_pct']
  loop
    old_txt := coalesce(to_jsonb(old) ->> f, '');
    new_txt := coalesce(to_jsonb(new) ->> f, '');

    if old_txt is distinct from new_txt then
      -- Kým zmluva nie je podpísaná, niet čo chrániť — dohoda ešte nevznikla.
      if old.status in ('draft', 'sent') then
        continue;
      end if;
      if not exists (
        select 1 from danubra_contract_amendments a
        where a.contract_id = new.id
          and a.field = f
          and a.new_value = new_txt
      ) then
        raise exception
          'Zmena poľa % na podpísanej zmluve vyžaduje dodatok. Zapíš najprv riadok do danubra_contract_amendments (field=%, new_value=%).',
          f, f, new_txt
          using errcode = 'check_violation';
      end if;
    end if;
  end loop;
  return new;
end $$;

comment on function danubra_contract_needs_amendment() is
  'Na podpísanej zmluve sa dohodnuté podmienky neprepisujú — koniec '
  'platnosti, hodinová sadzba, pevná cena, cena za jednotku a zádržné '
  'sa menia dodatkom. Porovnáva sa cez to_jsonb, takže pridanie ďalšieho '
  'chráneného poľa je jeden riadok v zozname.';

-- ── Dodatok sa dá označiť za podpísaný ──────────────────────────────────────
-- Append-only znamená, že sa neprepisuje história: pole, pôvodná hodnota,
-- nová hodnota a dôvod. Podpis a sken histéria nie sú — sú to veci, ktoré sa
-- dozvieme až potom. Preto úzka politika plus trigger, ktorý zvyšok stráži.
create or replace function danubra_amendment_append_only()
returns trigger
language plpgsql
as $$
begin
  if new.contract_id     is distinct from old.contract_id
     or new.field        is distinct from old.field
     or new.old_value    is distinct from old.old_value
     or new.new_value    is distinct from old.new_value
     or new.reason       is distinct from old.reason
     or new.amendment_number is distinct from old.amendment_number
     or new.created_at   is distinct from old.created_at then
    raise exception
      'Dodatok sa neprepisuje. Meniť sa dá len dátum podpisu a sken; '
      'ostatné je dohodnutá história — oprava sa robí ďalším dodatkom.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists danubra_amendment_append_only_trg on danubra_contract_amendments;
create trigger danubra_amendment_append_only_trg
  before update on danubra_contract_amendments
  for each row execute function danubra_amendment_append_only();

drop policy if exists danubra_dca_update on danubra_contract_amendments;
create policy danubra_dca_update on danubra_contract_amendments
  for update using (auth.role() = 'authenticated' or auth.role() = 'service_role')
  with check (auth.role() = 'authenticated' or auth.role() = 'service_role');

-- ── A nemaže sa ani priamym spojením ────────────────────────────────────────
-- RLS nemá delete politiku, takže z appky sa dodatok zmazať nedá. Priame
-- spojenie do databázy (psql, nástroj na migrácie, servisný kľúč) ale RLS
-- obchádza — a práve na ňom mi to pri skúške prešlo.
--
-- Pri dodatku je to horšie než inde: je to dohodnutá zmena ceny alebo
-- termínu, teda presne ten papier, ktorý sa o dva roky hľadá pri spore.
-- Preto to drží trigger, nie len politika.
--
-- Vedľajší účinok je správny: zmluvu s dodatkami sa už nedá zmazať ani cez
-- `on delete cascade`. To je tá istá história, len z druhej strany.
create or replace function danubra_amendment_no_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Dodatok sa nemaže. Je to dohodnutá zmena podmienok — ak neplatí, '
    'zapíš ďalší dodatok, ktorý ju vracia späť.'
    using errcode = 'check_violation';
end $$;

drop trigger if exists danubra_amendment_no_delete_trg on danubra_contract_amendments;
create trigger danubra_amendment_no_delete_trg
  before delete on danubra_contract_amendments
  for each row execute function danubra_amendment_no_delete();

comment on table danubra_contract_amendments is
  'Dodatky k zmluve. Append-only, a drží to databáza, nie len RLS: mazať sa '
  'nedajú vôbec a z existujúceho riadku sa dá zmeniť len dátum podpisu '
  'a sken (danubra_amendment_append_only). História dohodnutých podmienok '
  'sa neprepisuje.';

-- ── Diagnostika ─────────────────────────────────────────────────────────────
select
  (select count(*) from danubra_contracts)                                  as zmluv,
  (select count(*) from danubra_contracts where storage_path is not null)   as so_skenom,
  (select count(*) from danubra_contracts where price_model <> 'hourly')    as necenove_hodinove,
  (select count(*) from danubra_contract_amendments where signed_at is not null) as podpisanych_dodatkov;
