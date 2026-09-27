-- ============================================================================
-- DANUBRA — fotka k človeku, logo k firme
-- ============================================================================
-- Zoznam mien sa číta. Zoznam tvárí sa pozerá. Pri dvadsiatich ľuďoch je to
-- rozdiel medzi hľadaním a nájdením.
--
-- Fotka je osobný údaj, takže ide do **privátneho** úložiska rovnako ako
-- doklady — von sa dostane len krátkodobo podpísaným odkazom.
--
-- Pri firme stačí adresa webu: logo sa z nej vie vytiahnuť bez toho, aby
-- ho niekto nahrával, a bez cudzej služby, ktorá by vedela, ktoré firmy si
-- pozeráme. Keď sa nenačíta, zostanú iniciály — nikdy prázdne miesto.
--
-- (V produkcii aplikované ako 028; číslo v repozitári nadväzuje na 026.)
-- ============================================================================
alter table danubra_workers add column if not exists photo_path text;
alter table danubra_candidates add column if not exists photo_path text;

comment on column danubra_workers.photo_path is
  'Cesta k fotke v privátnom buckete danubra-docs. Do stránky sa nikdy '
  'nedáva priamo — len podpísaná URL s krátkou platnosťou.';

alter table danubra_partners add column if not exists website text;
alter table danubra_partners add column if not exists logo_path text;

comment on column danubra_partners.website is
  'Adresa webu odberateľa. Slúži aj ako zdroj loga — favicon sa z domény '
  'odvodí, nahrávať ho netreba.';
comment on column danubra_partners.logo_path is
  'Ručne nahraté logo. Má prednosť pred faviconom z webu.';

alter table danubra_accommodations add column if not exists photo_path text;
