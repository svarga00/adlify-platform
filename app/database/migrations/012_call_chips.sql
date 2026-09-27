-- ============================================================================
-- DANUBRA Hub — 012 — Zaškrtávacie polia namiesto známkovania
-- ============================================================================
-- Hodnotenie „0 až 3" na dvadsiatich otázkach sa pri živom hovore nedá stíhať.
-- Človek nehodnotí, človek si odškrtáva, čo zaznelo, a zvyšok si zapíše.
--
-- Preto polia (chips): krátke, klepnutím zapnuteľné tvrdenia so znamienkom.
--   plus    — dobré znamenie
--   minus   — zlé znamenie
--   flag    — varovanie, ktoré samo osebe rozhoduje
--   neutral — informácia bez hodnotenia
--
-- Skóre a verdikt vzniknú z toho, čo je zaškrtnuté. Žiadne známkovanie.
--
-- Polia sa učia:
--   - čo zaškrtávaš často pri danom remesle, ide nabudúce hore (use_count),
--   - vlastné pole si pridáš počas hovoru (source = 'manual'),
--   - z poznámok ich navrhne Claude (source = 'ai', active = false, kým
--     ich nepotvrdíš).
--
-- Otázky z migrácií 009 a 011 zostávajú — presúvajú sa z náborového toku do
-- príručky ako referencia, čo sa pýtať a čo chcem počuť.
--
-- Idempotentné.
-- ============================================================================

create table if not exists danubra_call_chips (
  id uuid primary key default gen_random_uuid(),
  trade_key text,                      -- null = platí pre všetky remeslá
  segment text not null,               -- intro | trade | verify | legal | logistics | money
  label text not null,                 -- krátke tvrdenie, 2–6 slov
  polarity text not null default 'neutral',
  weight int not null default 1,       -- 3 = rozhodujúce
  hint text,                           -- doplnková veta pre toho, kto sa pýta
  source text not null default 'seed', -- seed | manual | ai
  suggested_from text,                 -- pri AI: z ktorej poznámky návrh vznikol
  use_count int not null default 0,
  last_used_at timestamptz,
  active bool not null default true,   -- AI návrhy začínajú ako neaktívne
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);

do $$
begin
  alter table danubra_call_chips add constraint danubra_chip_polarity_chk
    check (polarity in ('plus','minus','flag','neutral'));
exception when duplicate_object then null;
end $$;

create unique index if not exists idx_dchip_uniq
  on danubra_call_chips (coalesce(trade_key, ''), segment, lower(label));
create index if not exists idx_dchip_lookup
  on danubra_call_chips (segment, trade_key, active, use_count desc);

comment on table danubra_call_chips is
  'Zaškrtávacie polia pre živý nábor. Nahrádzajú známkovanie otázok 0–3.';

-- ── Čo bolo pri kandidátovi zaškrtnuté ──────────────────────────────────────
create table if not exists danubra_candidate_chips (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references danubra_candidates on delete cascade,
  chip_id uuid not null references danubra_call_chips on delete cascade,
  -- text sa kopíruje, aby zápis dával zmysel aj keď sa pole neskôr premenuje
  label text,
  polarity text,
  weight int,
  segment text,
  checked_by uuid references auth.users,
  checked_at timestamptz not null default now(),
  unique (candidate_id, chip_id)
);
create index if not exists idx_dcchip_cand on danubra_candidate_chips(candidate_id);

comment on table danubra_candidate_chips is
  'Čo pri kandidátovi zaznelo. label a polarity sú odpísané, nech zápis prežije premenovanie poľa.';

-- ── Triggery a RLS ──────────────────────────────────────────────────────────
drop trigger if exists set_updated_at on danubra_call_chips;
create trigger set_updated_at before update on danubra_call_chips
  for each row execute function danubra_set_updated_at();

do $$
declare t text;
begin
  foreach t in array array['danubra_call_chips','danubra_candidate_chips'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists danubra_auth_all on %I', t);
    execute format($p$create policy danubra_auth_all on %I
      for all using (auth.role() = 'authenticated' or auth.role() = 'service_role')
      with check (auth.role() = 'authenticated' or auth.role() = 'service_role')$p$, t);
  end loop;
end $$;

-- ── Počítadlo použitia ──────────────────────────────────────────────────────
-- Aby sa nemuselo posielať zvlášť „inkrementuj" po každom klepnutí.
create or replace function danubra_chip_used(p_chip uuid)
returns void language sql security definer set search_path = public as $$
  update danubra_call_chips
  set use_count = use_count + 1, last_used_at = now()
  where id = p_chip;
$$;
grant execute on function danubra_chip_used(uuid) to authenticated, service_role;

-- ============================================================================
-- SEED — univerzálne polia
-- ============================================================================
insert into danubra_call_chips (trade_key, segment, label, polarity, weight, hint) values
-- úvod
(null,'intro','Má aktívnu živnosť','plus',3,'Overiteľné v zrsr.sk alebo rzp.cz.'),
(null,'intro','Živnosť si založí','neutral',1,'Trvá to; nesmie tlačiť na nástup skôr.'),
(null,'intro','Nemá a nechce živnosť','flag',3,'Bez nej sa nedá nasadiť.'),
(null,'intro','Je to partia','neutral',1,null),
(null,'intro','Má vlastné auto','plus',2,'Vie voziť partiu, šetrí dopravu.'),
(null,'intro','Vie po nemecky aspoň základ','plus',2,null),
(null,'intro','Nikto v partii nevie po nemecky','minus',2,'Treba k nim nemčinára alebo predáka.'),
(null,'intro','Má vlastné náradie','plus',2,null),
(null,'intro','Vie nastúpiť do dvoch týždňov','plus',2,null),
-- overenie
(null,'verify','Dal meno poliera aj číslo','plus',3,'Najsilnejší signál, že prax je pravá.'),
(null,'verify','Meno poliera si nepamätá','flag',3,'Najčastejší znak vymyslenej praxe.'),
(null,'verify','Vie opísať konkrétnu stavbu','plus',2,null),
(null,'verify','Prax opisuje len všeobecne','minus',2,null),
(null,'verify','Posiela fotky prác','plus',2,null),
(null,'verify','Fotky sľubuje, neposiela','flag',2,null),
(null,'verify','Posledné mesiace robil súvisle','plus',2,null),
(null,'verify','Diera v posledných mesiacoch','minus',2,'Opýtaj sa, čo robil medzitým.'),
(null,'verify','Vymenoval vlastné náradie','plus',2,'Kto ho má, hovorí o ňom rád.'),
(null,'verify','Zažil kontrolu zo Zollu','plus',1,'Znak, že v Nemecku naozaj bol.'),
(null,'verify','Mení odpovede','flag',3,'Raz živnosť má, raz nemá.'),
-- papiere
(null,'legal','Vie, čo je A1','plus',3,null),
(null,'legal','Tvrdí, že A1 netreba','flag',3,'Pri kontrole to stojí pokutu.'),
(null,'legal','Doklad platný viac než pol roka','plus',2,null),
(null,'legal','Doklad čoskoro končí','minus',2,'Vybavovanie trvá, rieš to hneď.'),
(null,'legal','Zdravotne bez obmedzení','plus',1,null),
(null,'legal','Zdravotné obmedzenie','minus',2,'Zisti, či zvládne výšky a bremená.'),
(null,'legal','Má odbory na to remeslo','plus',2,null),
-- logistika
(null,'logistics','Nastúpi dlhodobo, aspoň tri mesiace','plus',2,null),
(null,'logistics','Len na pár týždňov','minus',2,'Nábor sa nevyplatí.'),
(null,'logistics','Turnus 3+1 mu vyhovuje','plus',2,null),
(null,'logistics','Zdieľané ubytovanie je v poriadku','plus',2,null),
(null,'logistics','Trvá na vlastnej izbe','minus',1,'Pri našich maržiach to nevychádza.'),
(null,'logistics','Dopravu si vyrieši sám','plus',1,null),
(null,'logistics','Nemá ako sa dopraviť','minus',1,null),
(null,'logistics','Doma to má dohodnuté','plus',1,null),
-- peniaze
(null,'money','Sadzba sedí s ponukou','plus',3,null),
(null,'money','Chce výrazne viac','minus',2,'Zisti, či to má čím podložiť.'),
(null,'money','Päťdesiat hodín týždenne mu vyhovuje','plus',2,null),
(null,'money','Chce len osem hodín denne','minus',2,'Na nemeckej stavbe to nevyjde.'),
(null,'money','Pýtal zálohu vopred','flag',3,'Najčastejší vzorec pri ľuďoch, čo nedorazia.'),
(null,'money','Zálohu nepotrebuje','plus',1,null),
(null,'money','Peniaze ako prvá otázka','flag',2,null),
(null,'money','Má kolegu, ktorý by šiel tiež','plus',2,'Odporúčania sú najlacnejší kanál.')
on conflict do nothing;

-- ============================================================================
-- SEED — polia podľa remesla
-- ============================================================================
insert into danubra_call_chips (trade_key, segment, label, polarity, weight, hint) values
-- sadrokartón
('trockenbau','trade','Vie rozteč 625','plus',3,'Kto to robil, číslo povie okamžite.'),
('trockenbau','trade','Rozteč nevie alebo povedal 600','flag',3,null),
('trockenbau','trade','Pozná zelenú GKBI do vlhka','plus',2,null),
('trockenbau','trade','Nerozlišuje typy dosiek','minus',2,null),
('trockenbau','trade','Vie stupne Q2 a Q3','plus',2,'Preberá sa nimi práca.'),
('trockenbau','trade','Reálny výkon 25–35 m² denne','plus',2,null),
('trockenbau','trade','Sľubuje nereálny výkon','flag',2,'Nad 50 m² vo dvojici.'),
('trockenbau','trade','Robil podhľady a závesy','plus',1,null),
('trockenbau','trade','Vie presadzovať škáry','plus',1,null),
-- maliar
('maliar','trade','Vie poradie: penetrácia a dve vrstvy','plus',3,null),
('maliar','trade','Maľuje bez penetrácie','flag',3,'Na Q povrchu to presvitá.'),
('maliar','trade','Robil Airlessom, vie dýzy','plus',2,null),
('maliar','trade','Airless nikdy nerobil','minus',2,'Spomalí celú partiu.'),
('maliar','trade','Rozlišuje silikát a disperziu','plus',2,null),
('maliar','trade','Spozná nepripravený sadrokartón','plus',2,null),
('maliar','trade','Reálny výkon 150–250 m² denne','plus',1,null),
-- obkladač
('obkladac','trade','Vie hladidlo na veľkoformát','plus',3,'10–12 mm alebo buttering-floating.'),
('obkladac','trade','Na veľkoformát berie šestku','flag',3,'Vzniknú dutiny, dlažba praská.'),
('obkladac','trade','Rieši hydroizoláciu v sprche','plus',3,null),
('obkladac','trade','Hydroizoláciu považuje za zbytočnú','flag',3,'Najdrahšia reklamácia v remesle.'),
('obkladac','trade','Pozná oddeľovaciu rohož','plus',2,null),
('obkladac','trade','Vie o dilatácii a šírke škáry','plus',2,null),
('obkladac','trade','Reálny výkon 15–25 m² denne','plus',1,null),
-- murár
('murar','trade','Vie hrúbku škáry 1–3 mm','plus',3,'Tenkovrstvová malta.'),
('murar','trade','Muroval len na klasickú maltu','minus',2,null),
('murar','trade','Zakladá prvý rad laserom','plus',2,null),
('murar','trade','Robil strojovú omietku','plus',2,null),
('murar','trade','Vie o uložení prekladu','plus',2,null),
('murar','trade','Reálny výkon 6–12 m² denne','plus',1,null),
-- betonár
('betonar','trade','Vie krytie výstuže a dištančníky','plus',3,null),
('betonar','trade','O krytí výstuže nevie','flag',3,'Doska bude korodovať.'),
('betonar','trade','Pozná Doku alebo Peri menom','plus',2,null),
('betonar','trade','Vie o spínacích tyčiach','plus',2,null),
('betonar','trade','Vibrovanie berie vážne','plus',2,null),
('betonar','trade','Vie, čo s betónom v mraze','plus',1,null),
-- tesár
('tesar','trade','Pozná systémové debnenie menom','plus',3,null),
('tesar','trade','Systémové debnenie nikdy nerobil','minus',2,null),
('tesar','trade','Vie prenášať uhol na krokvu','plus',2,null),
('tesar','trade','Číta výkres','plus',2,null),
('tesar','trade','Prácu vo výške berie vážne','plus',2,null),
('tesar','trade','Istenie bagatelizuje','flag',3,'Riziko úrazu je naše.'),
-- zvárač
('zvarac','trade','Povedal číslo metódy aj polohy','plus',3,'135, 141, PA/PB/PF.'),
('zvarac','trade','Čísla z certifikátu nevie','flag',3,'Kto zváral v DE, pozná ich naspamäť.'),
('zvarac','trade','Certifikát je platný','plus',3,null),
('zvarac','trade','Certifikát po platnosti','flag',3,'Na stavbu ho nepustia.'),
('zvarac','trade','Vie, čo je WPS','plus',2,null),
('zvarac','trade','Vie prúd a drôt na plech','plus',2,null),
('zvarac','trade','Rieši deformáciu pri dlhom zvare','plus',2,null),
-- zámočník
('zamocnik','trade','Vie kotviť do betónu','plus',2,null),
('zamocnik','trade','Nespomenul vyčistenie vývrtu','minus',2,'Kotva nedrží ani polovicu.'),
('zamocnik','trade','Meria uhlopriečku pri lícovaní','plus',2,null),
('zamocnik','trade','Robil dielce na zinkovanie','plus',1,null),
-- elektrikár
('elektrikar','trade','Vie prierez 2,5 na šestnástku','plus',3,null),
('elektrikar','trade','Prierez vodiča nevie','flag',3,'Chyba, ktorá horí.'),
('elektrikar','trade','Pozná chránič 30 mA','plus',2,null),
('elektrikar','trade','Vie, čo patrí do rozvádzača','plus',2,null),
('elektrikar','trade','Vie, čo meria pri odovzdaní','plus',2,null),
('elektrikar','trade','Tvrdí, že §9 HwO netreba','flag',3,'Bez oznámenia nesmie na stavbu.'),
-- montážnik
('montaznik','trade','Osadzoval okná, vie kotvenie','plus',2,null),
('montaznik','trade','Okná len nosil','minus',2,null),
('montaznik','trade','Má prax z plošiny či lešenia','plus',2,null),
('montaznik','trade','Má vlastné aku náradie','plus',1,null),
-- pomocník
('pomocnik','trade','Robil s búracím kladivom','plus',1,null),
('pomocnik','trade','Za rok vystriedal veľa stavieb','flag',2,'U pomocných je fluktuácia hlavné riziko.'),
('pomocnik','trade','Má obuv S3, prilbu a rukavice','plus',2,null),
('pomocnik','trade','Čaká, že mu všetko kúpime','minus',1,'Dohodni sa hneď, ako to bude.')
on conflict do nothing;

-- Diagnostika
select coalesce(trade_key, 'univerzálne') as remeslo, segment, count(*) as poli
from danubra_call_chips group by 1, 2 order by 1, 2;
