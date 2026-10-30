-- ============================================================================
-- 082 — logo a náhľad webu pri nových firmách
-- ============================================================================
-- „Nevidím favicony ani logá, nič. Obnovte prosím aj staré dáta."
--
--   danubra_leads   logo_url          najväčšia ikona z <head> webu firmy
--                                     (apple-touch-icon / icon), https
--                   og_image          obrázok webu (og:image / twitter:image)
--                   site_title        titulok webu (og:title, inak <title>)
--                   site_description  popis webu (og:description, inak
--                                     meta description) — „krátky popis
--                                     firmy" v detaile
--                   site_embeddable   smie sa web ukázať v okne appky
--                                     (iframe)? Server to zistí z hlavičiek
--                                     X-Frame-Options a CSP frame-ancestors;
--                                     null = ešte sa nezisťovalo
--                   site_checked_at   kedy appka naposledy čítala úvodnú
--                                     stránku (aj keď neodpovedala)
--
-- Plní ich:
--   * danubra-leads-from-urls-background pri ukladaní firiem z hľadania
--     (úvodnú stránku aj tak sťahuje kvôli Impressum),
--   * danubra-leads-sitemeta-background — „Obnoviť logá a náhľady" na
--     obrazovke Nové firmy: prejde firmy bez site_checked_at (alebo staršie
--     ako 30 dní) po malých dávkach. Zadarmo — len stiahnutie vlastného webu
--     firmy, žiadne kredity Outscraperu ani volania AI. Archivované firmy
--     vynechá. Popritom doplní súradnice firmám bez lat/lng (Nominatim,
--     z adresy) a raz súradnice kancelárie (Nastavenia → office_coords
--     v settings.supplier) — na „ako ďaleko je to od nás".
--
-- Stĺpce lat/lng v danubra_leads sú už od 057 (Outscraper ich plní od 079),
-- tu sa nepridávajú. Adresy sú len https a najviac 500 znakov — to stráži
-- aj databáza, nielen kód (app/lib/marketing/sitemeta.js).
--
-- Nič sa nemaže; stĺpce sa len pridávajú. Bez tejto migrácie appka beží ako
-- doteraz: v zozname iniciály a ikona webu cez službu, hľadanie ukladá firmy
-- bez týchto stĺpcov a „Obnoviť logá a náhľady" povie, že chýba 082.
-- ============================================================================

alter table danubra_leads
  add column if not exists logo_url text,
  add column if not exists og_image text,
  add column if not exists site_title text,
  add column if not exists site_description text,
  add column if not exists site_embeddable boolean,
  add column if not exists site_checked_at timestamptz;

alter table danubra_leads drop constraint if exists danubra_leads_logo_url_https;
alter table danubra_leads add constraint danubra_leads_logo_url_https
  check (logo_url is null or (logo_url ~ '^https://' and length(logo_url) <= 500));
alter table danubra_leads drop constraint if exists danubra_leads_og_image_https;
alter table danubra_leads add constraint danubra_leads_og_image_https
  check (og_image is null or (og_image ~ '^https://' and length(og_image) <= 500));
alter table danubra_leads drop constraint if exists danubra_leads_site_text_len;
alter table danubra_leads add constraint danubra_leads_site_text_len
  check ((site_title is null or length(site_title) <= 200) and (site_description is null or length(site_description) <= 400));

-- „Obnoviť logá a náhľady" hľadá firmy, ktoré ešte kontrolované neboli.
create index if not exists danubra_leads_site_checked_idx
  on public.danubra_leads (site_checked_at nulls first)
  where archived_at is null and website is not null;

comment on column danubra_leads.logo_url is
  'Logo / ikona webu firmy (najväčšia z <link rel=icon|apple-touch-icon>), absolútna https adresa. Zapisuje server (082).';
comment on column danubra_leads.og_image is
  'Obrázok webu firmy (og:image / twitter:image), https — veľký náhľad v detaile firmy.';
comment on column danubra_leads.site_title is
  'Titulok webu firmy (og:title, inak <title>), najviac 200 znakov.';
comment on column danubra_leads.site_description is
  'Popis webu firmy (og:description, inak meta description), najviac 400 znakov — krátky popis firmy v detaile.';
comment on column danubra_leads.site_embeddable is
  'Smie sa web ukázať v okne appky (iframe)? false = X-Frame-Options alebo CSP frame-ancestors to zakazuje, null = nezisťovalo sa.';
comment on column danubra_leads.site_checked_at is
  'Kedy appka naposledy čítala úvodnú stránku firmy kvôli logu a náhľadu (aj neúspešne). Null = ešte nikdy.';
