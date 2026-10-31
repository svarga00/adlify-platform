// ============================================================================
// DANUBRA — „Idem volať": koho pýtať, čo povedať (DE), čo zistiť
// ============================================================================
// „Na začiatku profilu by bolo dobré mať niečo ako ‚idem volať' a potom
// jednoduchý dotazník, čo sme sa z hovoru dozvedeli, keď nebol nahrávaný —
// aspoň v bodoch."
//
// Čisté funkcie pre panel v detaile firmy (js/components/lead-contacts.js):
//
//   callsheet(lead, { search, marketing, supplier, contacts, caller })
//     → { askFor, script, objections, questions }
//     askFor      koho si pýtať (konateľ z Impressum alebo „Bauleiter alebo
//                 Inhaber"), s kým sme hovorili naposledy, telefón
//     script      [{ title, sk, de }] — úvod, hák (remeslo + región), ponuka
//                 (Werkvertrag, hodiny, A1 / § 48b), zistenie potreby, záver
//                 (profily alebo 15-minútový hovor). `sk` je pokyn pre
//                 volajúceho, `de` veta na prečítanie (vykanie „Sie").
//   objections  [{ q, a, sk }] — časté námietky a vecné odpovede. Ceny sa
//                 nevymýšľajú: „Konditionen nennen wir Ihnen im Angebot".
//   questions   čo po hovore zistiť (dotazník „Čo sme sa dozvedeli") —
//                 otázky, možnosti a kľúče odpovedí; remeslá z pitch.js.
//
// Texty o nás berie z pitch.js (prevzaté z punds.eu a z Nastavení), takže
// hovor, e-mail a prezentácia hovoria to isté. Nič tu nenahráva ani nevolá.
//
// Testy: node app/lib/marketing/callsheet.test.js
// ============================================================================
(function () {
  const isNode = typeof require === 'function' && typeof module !== 'undefined';
  const P = isNode ? require('./pitch.js') : (typeof window !== 'undefined' ? window.DanubraPitch : null);
  const C = isNode ? require('./contacts.js') : (typeof window !== 'undefined' ? window.DanubraContacts : null);

  const clean = (v, n = 200) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);

  /** Krátke nemecké názvy remesiel na čipy (dlhé „Maler- und Lackierarbeiten" sa na tlačidlo nezmestí). */
  const SHORT = { trockenbau: 'Trockenbau', fliesen: 'Fliesen', maler: 'Maler', wdvs: 'WDVS / Putz', elektro: 'Elektro', schalung: 'Schalung',
    bewehrung: 'Bewehrung', maurer: 'Maurer', schweissen: 'Schweißen', metallbau: 'Metallbau', fenster: 'Fenster / Türen' };
  const tradeChips = () => (P ? P.TRADES : []).map(t => ({ key: t.key, label: SHORT[t.key] || t.label }));

  /**
   * Dotazník po hovore — otázky, na ktoré sa odpovedá klikaním (do 30 sekúnd).
   * Kľúče odpovedí sú tie, čo číta contacts.js (composeSummary, outcomeFromAnswers).
   */
  const QUESTIONS = [
    { key: 'right_person', label: 'Dovolali ste sa správnej osobe?', type: 'one', options: [['yes', 'áno'], ['no', 'nie']],
      sub: { when: 'no', fields: [['decider_name', 'Kto rozhoduje (meno)'], ['decider_role', 'Funkcia (Inhaber, Bauleiter…)']] } },
    { key: 'subcontractors', label: 'Berú subdodávateľov / cudzie partie?', type: 'one', options: [['yes', 'áno'], ['no', 'nie'], ['unknown', 'neviem']] },
    { key: 'trades', label: 'Ktoré remeslá potrebujú?', type: 'many', options: tradeChips().map(t => [t.label, t.label]), other: 'trades_other' },
    { key: 'headcount', label: 'Koľko ľudí a odkedy?', type: 'number', min: 1, max: 200, placeholder: 'počet',
      with: { key: 'when', options: [['now', 'hneď'], ['month', 'o mesiac'], ['spring', 'na jar'], ['after_summer', 'po lete'], ['next_year', 'budúci rok']] } },
    { key: 'sites', label: 'Kde sú stavby?', type: 'text', placeholder: 'mesto, región' },
    { key: 'staffed', label: 'Majú teraz dosť ľudí?', type: 'one', options: [['yes', 'áno'], ['no', 'nie'], ['seasonal', 'sezónne']] },
    { key: 'interest', label: 'Záujem', type: 'scale', options: [[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']], hint: '1 = žiadny, 5 = chcú ponuku' },
    { key: 'send', label: 'Čo im treba poslať?', type: 'many', options: [['profiles', 'profily partií'], ['presentation', 'prezentáciu'], ['prices', 'ceny / ponuku'], ['references', 'referencie'], ['none', 'nič']] },
    { key: 'callback_when', label: 'Kedy sa ozvať?', type: 'one', free: true, placeholder: 'alebo napíšte: „v marci", „nach Ostern"',
      options: [['o týždeň', 'o týždeň'], ['o 2 týždne', 'o 2 týždne'], ['o mesiac', 'o mesiac'], ['na jar', 'na jar'], ['po lete', 'po lete'], ['budúci rok', 'budúci rok']] },
    { key: 'note', label: 'Poznámka', type: 'textarea', placeholder: 'čo ešte zaznelo (nepovinné)' },
  ];

  /** Koho si pýtať: konateľ z Impressum („Herr Müller"), inak Bauleiter alebo Inhaber; s kým sme hovorili naposledy. */
  function askFor(lead = {}, contacts = []) {
    const p = P ? P.person(lead.contact_person) : null;
    const name = p ? (p.gender === 'm' ? `Herr ${p.last}` : p.gender === 'f' ? `Frau ${p.last}` : p.full) : '';
    const last = (contacts || []).filter(c => c && !c.archived_at && !c.corrects_id && c.contact_name)
      .sort((a, b) => String(b.happened_at || '').localeCompare(String(a.happened_at || '')))[0] || null;
    const ph = C ? C.phoneLinks(lead.phone) : null;
    return {
      name, role: name ? 'konateľ (z Impressum)' : '',
      hint: name ? `Pýtajte si ${name} — ak nie je k dispozícii, Bauleiter alebo Inhaber.` : 'Pýtajte si Bauleiter alebo Inhaber (Geschäftsführer).',
      last: last ? { name: last.contact_name, role: last.contact_role || '', at: last.happened_at } : null,
      phone: ph ? { tel: ph.tel, display: ph.display, mobile: ph.mobile } : null,
      de: name ? `Könnte ich bitte ${p.gender === 'f' ? 'Frau' : 'Herrn'} ${p.last} sprechen?` : 'Könnte ich bitte mit dem Inhaber oder dem Bauleiter sprechen?',
    };
  }

  /**
   * Celý ťahák k hovoru.
   * @param {Object} lead   riadok danubra_leads
   * @param {Object} o      { search, marketing (danubra_settings.marketing), supplier (danubra_settings.supplier), contacts, caller }
   */
  function callsheet(lead = {}, { search = null, marketing = null, supplier = null, contacts = [], caller = '' } = {}) {
    const pitch = P ? P.pitch({ lead, search, marketing }) : null;
    const T = pitch ? pitch.texts : { prices: 'Konditionen nennen wir Ihnen im Angebot.', languages: '' };
    const team = pitch ? pitch.trade.team : 'Handwerker-Teams';
    const generic = !pitch || pitch.trade.key === 'bau';
    const remeslo = pitch ? pitch.words.remeslo : 'Bau und Ausbau';
    const regionPhrase = pitch && pitch.region.phrase ? pitch.region.phrase : 'in Ihrer Region';
    const firma = clean((supplier && supplier.name) || 'Partner und Service', 80).replace(/\s+s\.\s?r\.\s?o\.?$/i, '');
    const who = clean(caller, 80);
    const ask = askFor(lead, contacts);

    const script = [
      { title: 'Úvod', sk: 'Predstavte seba a firmu jednou vetou a vypýtajte si kompetentnú osobu. Hovorte pomaly, meno firmy zopakujte.',
        de: `${who ? `Guten Tag, mein Name ist ${who}, ich rufe von ${firma} aus der Slowakei an.` : `Guten Tag, hier ist ${firma} aus der Slowakei.`} ${ask.de}` },
      { title: 'Prečo voláme', sk: generic ? 'Remeslo firmy nevieme — povedzte všeobecne, že dávame remeselníkov na stavby, a spýtajte sa, čo robia.'
        : 'Povedzte, že vieme, čo robia a kde — a že práve pre toto remeslo máme ľudí.',
        de: generic ? `Wir vermitteln erfahrene Handwerker und eingespielte Teams aus der Slowakei an Baufirmen in Deutschland. Darf ich fragen, welche Gewerke Sie ${regionPhrase} ausführen?`
          : `Ich habe gesehen, dass Sie ${remeslo} ${regionPhrase} ausführen. Genau dafür vermitteln wir erfahrene ${team} aus der Slowakei – einzeln oder als eingespieltes Team.` },
      { title: 'Ponuka', sk: 'Stručne: Werkvertrag, hodiny, doklady pred nástupom, ubytovanie riešime my. Nesľubujte ceny ani počty ľudí, ktoré nie sú v Nastaveniach.',
        de: 'Die Zusammenarbeit läuft als Werkvertrag mit Abrechnung nach Stunden und Stundennachweis. A1-Bescheinigung, Gewerbe, Steuernummer und Freistellungsbescheinigung nach § 48b EStG liegen vor Projektstart vor. Unterkunft und Anreise organisieren wir.' },
      { title: 'Zistiť potrebu', sk: 'Tu počúvajte: koľko ľudí, odkedy, kde — presne to, čo potom vyplníte do dotazníka.',
        de: `Haben Sie aktuell oder in den nächsten Monaten Bedarf an ${team}? Wie viele Leute, ab wann und auf welcher Baustelle?` },
      { title: 'Záver', sk: 'Dohodnite jeden konkrétny krok: poslať profily, alebo 15-minútový hovor. Vypýtajte si e-mail a meno.',
        de: `Darf ich Ihnen die Profile unserer ${team} per E-Mail schicken? Oder passt Ihnen ein kurzes Telefonat von 15 Minuten in den nächsten Tagen besser? An welche E-Mail-Adresse darf ich das schicken?` },
    ];

    const objections = [
      { q: 'Wir arbeiten nur mit eigenen Leuten.', sk: 'Nespochybňujte, ponúknite podklady „na neskôr".',
        a: 'Das verstehe ich. Viele unserer Kunden haben einen festen Stamm und holen uns dazu, wenn Termine drücken oder ein Projekt größer ist als geplant. Darf ich Ihnen unsere Unterlagen schicken, damit Sie uns kennen, wenn es einmal eng wird?' },
      { q: 'Ist das nicht Scheinselbständigkeit?', sk: 'Vecne: Werkvertrag, vlastná živnosť, A1, § 48b — doklady pred nástupom.',
        a: 'Nein. Wir arbeiten als Nachunternehmer auf Werkvertragsbasis. Unsere Handwerker haben ein eigenes Gewerbe, A1-Bescheinigung, Steuernummer und Freistellungsbescheinigung nach § 48b EStG. Die Unterlagen liegen vor Projektstart komplett vor.' },
      { q: 'Was kostet das? / Das ist zu teuer.', sk: 'Cenu do telefónu nehovorte — podmienky sú v ponuke. Vypýtajte si remeslo, miesto, obdobie a počet ľudí.',
        a: `${T.prices} Dafür brauche ich nur: Gewerk, Ort, Zeitraum und Anzahl der Personen.` },
      { q: 'Sprechen die Leute Deutsch?', sk: 'Koordinácia po nemecky cez jedného človeka; na stavbe slovensky, česky, maďarsky.',
        a: 'Die Koordination läuft auf Deutsch über einen festen Ansprechpartner. Auf der Baustelle wird Slowakisch, Tschechisch und Ungarisch gesprochen; der Vorarbeiter versteht Ihre Anweisungen.' },
      { q: 'Schicken Sie mir einfach etwas per E-Mail.', sk: 'Súhlaste, ale hneď si dohodnite, kedy zavoláte znova.',
        a: 'Gerne. An welche Adresse darf ich es schicken? Und wann darf ich mich telefonisch melden, um Ihre Fragen zu beantworten?' },
    ];

    return { askFor: ask, script, objections, questions: QUESTIONS, trade: pitch ? pitch.trade.key : 'bau', team, firma };
  }

  const API = { callsheet, askFor, QUESTIONS, tradeChips, SHORT };
  if (typeof window !== 'undefined') window.DanubraCallsheet = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
