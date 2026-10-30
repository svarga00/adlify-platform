-- ============================================================================
-- 083 — šablóny oslovenia, na ktoré nemecká remeselná firma odpíše
-- ============================================================================
-- Pôvodné šablóny (078) začínali „wir sind {nasa_firma}, ein Nachunternehmer
-- aus der Slowakei…" a pýtali sa „Zusätzliche Fachkräfte für {firma}?" —
-- všeobecný studený e-mail o nás, na ktorý nikto neodpovedá. Do {remeslo}
-- navyše išiel slovenský text z hľadania („maliarstvo, omietky").
--
-- Nové texty (rovnaké sú predvolené v app/lib/marketing/outreach.js):
--   * predmet konkrétny a miestny, bez otáznika:
--     „Maler für Ihre Baustellen in Ingolstadt"
--   * prvá veta o firme (remeslo v nemčine z pitch.js, mesto), nie o nás
--   * tri krátke odseky, do 110 slov, jedna konkrétna ponuka (Werkvertrag,
--     Abrechnung nach Stunden, A1 a § 48b), výzva s dvoma možnosťami
--     (telefonát utorok/štvrtok dopoludnia, alebo odpoveď „Profile")
--   * {priloha} = veta o prílohe len vtedy, keď ide prezentácia PDF
--   * pripomenutie 50–70 slov: odkáže na dátum ({kedy} = „am 26.10.2026"),
--     pridá jeden nový fakt ({portfolio} z Nastavení, inak termín a doklady)
--
-- Nové premenné: {remeslo} {remeslo_kratke} {team} {region} {priloha} {kedy}
-- — dopĺňa ich appka a server (app/lib/marketing/outreach.js → vars).
--
-- Prepíšu sa štyri predvolené šablóny kanála 'outreach' (DE a EN, prvý
-- e-mail a pripomenutie). Keď niektorá chýba (zmazaná), doplní sa; vlastné
-- šablóny s inými kľúčmi (outreach_intro_2…) sa nemenia. Nič sa nemaže,
-- spustiť sa dá viackrát (unique (key, language, channel) z 001).
-- ============================================================================

insert into danubra_message_templates (key, title, language, channel, audience, subject, body, note, sort_order, active)
values
  ('outreach_intro', 'Oslovenie — prvý e-mail (DE)', 'de', 'outreach', 'lead',
   '{team} für Ihre Baustellen in {mesto|Ihrer Region}',
   E'{oslovenie}\n\nIhr Betrieb ist in {mesto|Ihrer Region} im Bereich {remeslo} tätig – und wenn die Auftragsbücher voll sind, fehlen auf der Baustelle meist nicht die Aufträge, sondern die Leute.\n\nGenau dafür stellen wir {team} aus der Slowakei: einzeln oder als eingespieltes Team, im Werkvertrag, abgerechnet nach Stunden. A1-Bescheinigung und Freistellung nach § 48b EStG liegen vor Projektstart vor; ein deutschsprachiger Ansprechpartner koordiniert Einsatz, Ersatz und Abrechnung.\n\n{portfolio}\n\n{priloha} Passt Ihnen ein kurzes Telefonat am Dienstag oder Donnerstag Vormittag? Oder antworten Sie einfach mit „Profile“ – dann schicke ich Ihnen zwei passende Teamprofile.\n\nMit freundlichen Grüßen',
   'Krok 1. Predmet miestny a konkrétny, prvá veta o firme, jedna ponuka, výzva s dvoma možnosťami (083).', 110, true),
  ('outreach_followup', 'Oslovenie — pripomenutie (DE)', 'de', 'outreach', 'lead',
   'Re: {predmet}',
   E'{oslovenie}\n\n{kedy} habe ich Ihnen {team} für Ihre Baustellen in {mesto|Ihrer Region} angeboten – vermutlich ist die E-Mail im Tagesgeschäft untergegangen.\n\nKurz als Ergänzung: {portfolio|Den Starttermin nennen wir Ihnen nach Ihrer Anfrage verbindlich; die Unterlagen (A1, § 48b) liegen komplett vor.}\n\nPasst Ihnen ein kurzes Telefonat am Dienstag oder Donnerstag Vormittag? Oder antworten Sie einfach mit „Profile“.\n\nMit freundlichen Grüßen',
   'Krok 2 a ďalší. Ide v tom istom vlákne (Re:), odkáže na dátum, pridá jeden nový fakt (083).', 120, true),
  ('outreach_intro', 'Oslovenie — prvý e-mail (EN)', 'en', 'outreach', 'lead',
   'Skilled {team} for your sites in {mesto|your region}',
   E'{oslovenie}\n\nYour company carries out {remeslo} in {mesto|your region} – and when the order books are full, what is usually missing on site is not work but reliable people.\n\nThat is exactly what we provide: {team} from Slovakia, individually or as an experienced team, under a contract for work and billed by the hour. A1 certificates and the § 48b EStG exemption are in place before the project starts; a German-speaking coordinator handles deployment, replacements and invoicing.\n\n{portfolio}\n\n{priloha} Would a short call on Tuesday or Thursday morning suit you? Or simply reply with "Profiles" and I will send you two suitable team profiles.\n\nKind regards',
   'Krok 1, po anglicky — len keď firma preukázateľne komunikuje po anglicky (083).', 130, true),
  ('outreach_followup', 'Oslovenie — pripomenutie (EN)', 'en', 'outreach', 'lead',
   'Re: {predmet}',
   E'{oslovenie}\n\n{kedy} I offered you {team} for your sites in {mesto|your region} – my e-mail has probably been buried in the daily business.\n\nOne addition: {portfolio|we confirm a binding start date once we have your request; the documents (A1, § 48b) are complete.}\n\nWould a short call on Tuesday or Thursday morning suit you? Or simply reply with "Profiles".\n\nKind regards',
   'Krok 2 a ďalší, po anglicky (083).', 140, true)
on conflict (key, language, channel) do update
  set title = excluded.title,
      subject = excluded.subject,
      body = excluded.body,
      note = excluded.note,
      audience = excluded.audience,
      sort_order = excluded.sort_order,
      active = true,
      updated_at = now();


-- ── Kontrola ────────────────────────────────────────────────────────────────
select key, language, active, subject
  from danubra_message_templates
 where channel = 'outreach' and key in ('outreach_intro', 'outreach_followup')
 order by language, sort_order;
