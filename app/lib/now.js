// ============================================================================
// DANUBRA — „čo spraviť teraz" pre obrazovky, ktoré vlastnú logiku nemali
// ============================================================================
// Na obrazovke bolo dvadsať čísel, pätnásť štítkov a tri farebné pruhy. Nič
// z toho nepovedalo, čo má človek spraviť. „Je tam na mňa veľa vecí, málo
// zvýraznených."
//
// Pravidlo appky je odvtedy jedno: **každá obrazovka v menu začína jednou
// vetou „čo teraz" a nič iné na nej nekričí.** Prehľad, Možnosti, Zákazka,
// Hodiny, Faktúry, Banka a Compliance si tú vetu počítajú samy — tu je zvyšok:
// Nábor, Živnostníci, Odberatelia, Remeslá a Nastavenia.
//
// Všetky funkcie vracajú ten istý tvar, aby sa dali vykresliť jedným
// komponentom (`Shell.now`):
//
//   { key, title, what, why, hot, count, id }
//
// `hot` neznamená „dôležité" — znamená **niekto na to čaká a plynie mu čas**.
// Keď horí všetko, nehorí nič.
//
// Čisté funkcie, žiadny `window`, žiadny DB prístup.
// Testy: node app/lib/now.test.js
// ============================================================================
(function () {
  const req = (typeof require !== 'undefined' && typeof module !== 'undefined');
  // Overenie firmy sa čítalo na dvoch miestach a to je presne to, čo sa
  // rozíde: „register neodpovedal" by sa na jednom z nich raz prečítalo ako
  // „firma neexistuje". Preto sa pravidlo nekopíruje, ale volá.
  const O = req ? require('./opportunities.js') : window.DanubraOpp;
  const M = req ? require('./money.js') : window.Money;

  const prazdne = (v) => v === null || v === undefined || String(v).trim() === '';
  const plural = (n, one, few, many) => O.plural(n, one, few, many);

  /** Nič nečaká. Všetky funkcie končia takto, aby obrazovka nikdy nebola bez vety. */
  function ok(title, what, why) {
    return { key: 'ok', title, what, why, hot: false, count: 0, id: null };
  }

  // ── Nastavenia: fakturačné údaje ─────────────────────────────────────────
  // Poradie nie je podľa formulára, ale podľa toho, čo sa stane, keď údaj
  // chýba. Prvé tri **zastavia dokument** (`Danubra.supplierReady`), ďalšie
  // dva ho len zhoršia.
  //
  // IČ DPH v zozname **nie je** zámerne: firma nie je platiteľom DPH a na
  // dokumentoch je k tomu veta. Vyžadovať ho by znamenalo, že appka navždy
  // hlási chybu, ktorá nie je chybou.
  const FIRMA = [
    { key: 'name', title: 'názov firmy', stop: true,
      why: 'Bez neho je to papier, na ktorom nie je napísané, kto ho posiela — '
        + 'a appka ho odberateľovi nepustí.' },
    { key: 'address', title: 'adresu firmy', stop: true,
      why: 'Na faktúre musí byť adresa dodávateľa. Bez nej dokument neodíde.' },
    { key: 'company_id', title: 'IČO', stop: true,
      why: 'Identifikuje firmu na každom doklade. Bez neho dokument neodíde.' },
    { key: 'iban', title: 'IBAN',
      why: 'Bez IBAN-u sa na faktúre nevykreslí QR platba a odberateľ prepisuje '
        + 'číslo účtu ručne — tam vznikajú chyby v platbách.' },
    { key: 'tax_number_de', title: 'Steuernummer (DE)',
      why: 'Výkaz hodín aj faktúra pre nemeckého odberateľa sa naň odvolávajú. '
        + 'Bez neho tam zostane prázdne miesto.' },
    { key: 'register', title: 'zápis v obchodnom registri',
      why: 'Súhlas GDPR aj rámcová zmluva musia povedať, kde je firma zapísaná — '
        + 'inak je to papier bez identifikácie toho, kto ho vydal.' },
  ];

  /** Čo doplniť v Nastaveniach. `supplier` je oddiel `supplier` z nastavení. */
  function firm(supplier = {}) {
    const chyba = FIRMA.filter(f => prazdne(supplier[f.key]));
    if (!chyba.length) {
      return ok('Fakturačné údaje sú vyplnené',
        'Dokumenty majú odkiaľ zobrať názov firmy, adresu, IČO aj IBAN.',
        'Keď sa niečo zmení, zmení sa to na všetkých dokumentoch naraz — '
          + 'nikde nie je zapečené.');
    }
    const prvy = chyba[0];
    const dalsie = chyba.length - 1;
    return {
      key: prvy.key,
      title: `Doplniť ${prvy.title}`,
      what: dalsie
        ? `Chýba aj ${dalsie} ${plural(dalsie, 'ďalší údaj', 'ďalšie údaje', 'ďalších údajov')}: `
          + chyba.slice(1).map(f => f.title).join(', ') + '.'
        : 'Je to posledný údaj, ktorý chýba.',
      why: prvy.why,
      hot: !!prvy.stop,
      count: chyba.length,
      id: null,
    };
  }

  // ── Odberatelia ───────────────────────────────────────────────────────────

  /**
   * Čo spraviť s odberateľmi. Všetko sa to točí okolo USt-IdNr: bez neho sa
   * nedá fakturovať v reverse charge podľa §13b a daň by sme zaplatili my.
   */
  function clients(partners = []) {
    const list = (partners || []).filter(Boolean);
    if (!list.length) {
      return ok('Žiadni odberatelia',
        'Keď sa z možnosti stane zákazka, odberateľ sa zapíše sem.',
        'Fakturuje sa odberateľovi, nie stavbe — preto má vlastnú kartu.');
    }

    const stav = (p) => O.verification({
      verify_result: p.vies_result, company_vat: p.ust_idnr,
    }).state;

    const neplatne = list.filter(p => stav(p) === 'invalid');
    if (neplatne.length) {
      return {
        key: 'invalid',
        title: `USt-IdNr neplatné — ${neplatne[0].name || 'odberateľ bez názvu'}`,
        what: `${neplatne.length} ${plural(neplatne.length, 'odberateľ', 'odberatelia', 'odberateľov')} `
          + `${plural(neplatne.length, 'má', 'majú', 'má')} číslo, ktoré register nepozná.`,
        why: 'Faktúra v reverse charge s neplatným USt-IdNr je naša daň, nie ich. '
          + 'Over si číslo u nich — nestačí ho prepísať.',
        hot: true, count: neplatne.length, id: neplatne[0].id,
      };
    }

    const bezCisla = list.filter(p => prazdne(p.ust_idnr));
    if (bezCisla.length) {
      return {
        key: 'vat',
        title: `Doplniť USt-IdNr — ${bezCisla[0].name || 'odberateľ bez názvu'}`,
        what: `${bezCisla.length} ${plural(bezCisla.length, 'odberateľ ho nemá', 'odberatelia ho nemajú', 'odberateľov ho nemá')} zapísané.`,
        why: 'Bez neho sa nedá fakturovať v reverse charge podľa §13b UStG — '
          + 'a firma sa nedá ani preveriť v registri.',
        hot: false, count: bezCisla.length, id: bezCisla[0].id,
      };
    }

    // Nedostupnosť registra sem patrí tiež — ale ako „skús neskôr",
    // nie ako chyba odberateľa.
    const nepreverene = list.filter(p => stav(p) !== 'valid');
    if (nepreverene.length) {
      const mimo = nepreverene.filter(p => stav(p) === 'unavailable').length;
      return {
        key: 'verify',
        title: `Preveriť firmu v registri — ${nepreverene[0].name || 'odberateľ bez názvu'}`,
        what: mimo === nepreverene.length
          ? `Register pri ${mimo} ${plural(mimo, 'odberateľovi', 'odberateľoch', 'odberateľoch')} neodpovedal.`
          : `${nepreverene.length} ${plural(nepreverene.length, 'odberateľ', 'odberatelia', 'odberateľov')} `
            + 'ešte nebol preverený.',
        why: mimo === nepreverene.length
          ? 'Neodpoveď registra nie je neplatné číslo. VIES býva mimo prevádzky '
            + 'aj niekoľko hodín — skús to neskôr.'
          : 'Overenie je jedno kliknutie a zostane zapísané s dátumom. Pri kontrole '
            + 'je to dôkaz, že sme si to pozreli.',
        hot: false, count: nepreverene.length, id: nepreverene[0].id,
      };
    }

    return ok('Odberatelia sú preverení',
      `${list.length} ${plural(list.length, 'firma má', 'firmy majú', 'firiem má')} platné USt-IdNr.`,
      'Preverenie si pamätá dátum. Keď odberateľ firmu zruší, ukáže sa to pri '
        + 'ďalšom overení — preto má zmysel ho pri dlhej zákazke zopakovať.');
  }

  // ── Živnostníci ───────────────────────────────────────────────────────────
  // Doklady a ich platnosti rieši Compliance. Tu ide o to, bez čoho sa
  // človeku **nedá zaplatiť a nedá sa s ním spojiť**.
  const NASADENY = ['deployed', 'ready'];

  function people({ workers = [], a1 = 0 } = {}) {
    const list = (workers || []).filter(w => w && w.status !== 'blacklist'
      && w.status !== 'inactive');

    // A1 je jediná vec, ktorá na tejto obrazovke naozaj horí: bez platného A1
    // sa nesmie vyslať a kontrola na stavbe to pokutuje firme, nie človeku.
    // Stav dokladov počíta modul (má ich načítané) — sem príde len počet.
    if (Number(a1) > 0) {
      const n = Number(a1);
      return {
        key: 'a1',
        title: 'Vyriešiť A1',
        what: `${n} ${plural(n, 'človek má', 'ľudia majú', 'ľudí má')} A1 po platnosti, `
          + 'pred koncom alebo vôbec nie.',
        why: 'Bez platného A1 sa nesmie vyslať. Pri kontrole na stavbe to padne '
          + 'na firmu, nie na človeka — a vybavenie trvá týždne.',
        hot: true, count: n, id: null,
      };
    }
    if (!list.length) {
      return ok('Žiadni živnostníci',
        'Kto prejde náborom, objaví sa tu s dokladmi a sadzbami.',
        'Kartotéka je to, z čoho sa skladá nasadenie na stavbu.');
    }

    const naStavbeBezIban = list.filter(w => w.status === 'deployed' && prazdne(w.bank_iban));
    if (naStavbeBezIban.length) {
      return {
        key: 'iban_hot',
        title: `Doplniť IBAN — ${naStavbeBezIban[0].full_name || 'bez mena'}`,
        what: `${naStavbeBezIban.length} ${plural(naStavbeBezIban.length, 'človek je', 'ľudia sú', 'ľudí je')} `
          + 'na stavbe a nemá kam dostať peniaze.',
        why: 'Na konci mesiaca príde jeho faktúra a nebude sa dať zaplatiť. '
          + 'Toto sa rieši dnes, nie vtedy.',
        hot: true, count: naStavbeBezIban.length, id: naStavbeBezIban[0].id,
      };
    }

    const bezIban = list.filter(w => NASADENY.includes(w.status) && prazdne(w.bank_iban));
    if (bezIban.length) {
      return {
        key: 'iban',
        title: `Doplniť IBAN — ${bezIban[0].full_name || 'bez mena'}`,
        what: `${bezIban.length} ${plural(bezIban.length, 'pripravený človek ho nemá', 'pripravení ľudia ho nemajú', 'pripravených ľudí ho nemá')} zapísaný.`,
        why: 'Bez IBAN-u sa mu nedá zaplatiť. Vypýtať si ho pri podpise je '
          + 'jednoduchšie než ho hľadať v deň platby.',
        hot: false, count: bezIban.length, id: bezIban[0].id,
      };
    }

    const bezTelefonu = list.filter(w => prazdne(w.phone));
    if (bezTelefonu.length) {
      return {
        key: 'phone',
        title: `Doplniť telefón — ${bezTelefonu[0].full_name || 'bez mena'}`,
        what: `${bezTelefonu.length} ${plural(bezTelefonu.length, 'človek', 'ľudia', 'ľudí')} `
          + `${plural(bezTelefonu.length, 'nemá', 'nemajú', 'nemá')} telefón.`,
        why: 'Keď na stavbe niečo je, rieši sa to telefónom. E-mail môže ležať tri dni.',
        hot: false, count: bezTelefonu.length, id: bezTelefonu[0].id,
      };
    }

    const bezRemesla = list.filter(w => prazdne(w.profession));
    if (bezRemesla.length) {
      return {
        key: 'trade',
        title: `Doplniť remeslo — ${bezRemesla[0].full_name || 'bez mena'}`,
        what: `${bezRemesla.length} ${plural(bezRemesla.length, 'človek', 'ľudia', 'ľudí')} `
          + `${plural(bezRemesla.length, 'nemá', 'nemajú', 'nemá')} zapísané, čo robí.`,
        why: 'Bez remesla ho appka neponúkne na zákazku, ktorá ho práve potrebuje — '
          + 'a nájde sa len tak, že si naň niekto spomenie.',
        hot: false, count: bezRemesla.length, id: bezRemesla[0].id,
      };
    }

    return ok('Kartotéka je v poriadku',
      `${list.length} ${plural(list.length, 'človek má', 'ľudia majú', 'ľudí má')} telefón, remeslo aj IBAN.`,
      'Platnosti dokladov sú zvlášť v Compliance — tam je vidieť, čo zastaví '
        + 'nasadenie na stavbu.');
  }

  // ── Nábor ─────────────────────────────────────────────────────────────────

  /**
   * Čo spraviť v nábore. Prvé je vždy človek, ktorý sa ozval a nikto mu
   * neodpovedal — to je jediná vec v nábore, ktorej plynie čas.
   */
  function plans({ plans = [], candidates = [] } = {}) {
    const p = (plans || []).filter(Boolean);
    const c = (candidates || []).filter(Boolean);

    const neozvali = c.filter(x => prazdne(x.first_contact_at)
      && !['hired', 'rejected', 'lost'].includes(x.status || '')
      && (x.outcome || '') === '');
    if (neozvali.length) {
      const prvy = starsi(neozvali, 'received_at');
      return {
        key: 'call',
        title: neozvali.length === 1 ? 'Zavolať kandidátovi' : 'Zavolať kandidátom',
        what: `${neozvali.length} ${plural(neozvali.length, 'človek sa ozval', 'ľudia sa ozvali', 'ľudí sa ozvalo')} `
          + 'a nikto s nimi ešte nehovoril.',
        why: 'Živnostník, ktorý hľadá prácu, volá na viac inzerátov. Rozhoduje, '
          + 'kto sa ozve prvý — nie kto platí viac.',
        hot: true, count: neozvali.length, id: prvy && prvy.id,
      };
    }

    if (!p.length) {
      return ok('Žiadny nábor nebeží',
        'Nábor začína zadaním: čo sa na stavbe robí, kde to je a koho treba.',
        'Zo zadania vzniknú podklady na inzeráty, otázky do hovoru aj polia '
          + 'náboru — ale len keď je napísané.');
    }

    const bezZadania = p.filter(x => prazdne(x.brief) && x.status !== 'closed');
    if (bezZadania.length) {
      return {
        key: 'brief',
        title: `Napísať zadanie — ${bezZadania[0].title || 'nábor bez názvu'}`,
        what: `${bezZadania.length} ${plural(bezZadania.length, 'nábor nemá', 'nábory nemajú', 'náborov nemá')} `
          + 'napísané, o čo na stavbe ide.',
        why: 'Zadanie je to, z čoho appka spraví podklady a otázky. Stačí tak, '
          + 'ako to povedal odberateľ do telefónu — učesať to vie sama.',
        hot: false, count: bezZadania.length, id: bezZadania[0].id,
      };
    }

    const bezAnalyzy = p.filter(x => !prazdne(x.brief) && prazdne(x.analyzed_at)
      && x.status !== 'closed');
    if (bezAnalyzy.length) {
      return {
        key: 'analyze',
        title: `Zanalyzovať zadanie — ${bezAnalyzy[0].title || 'nábor bez názvu'}`,
        what: `${bezAnalyzy.length} ${plural(bezAnalyzy.length, 'nábor má', 'nábory majú', 'náborov má')} `
          + 'zadanie, z ktorého ešte nič nevzniklo.',
        why: 'Z jedného zadania vzniknú texty na web, Bazoš aj Facebook, otázky '
          + 'do hovoru a chýbajúce polia náboru. Spustiť to je rozhodnutie '
          + 'človeka — appka to sama nerobí.',
        hot: false, count: bezAnalyzy.length, id: bezAnalyzy[0].id,
      };
    }

    const aktivne = p.filter(x => x.status !== 'closed');
    return ok(aktivne.length ? 'Nábor je rozpracovaný' : 'Žiadny nábor nebeží',
      aktivne.length
        ? `${aktivne.length} ${plural(aktivne.length, 'nábor má', 'nábory majú', 'náborov má')} `
          + 'zadanie aj analýzu a nikto nečaká na odpoveď.'
        : 'Všetky nábory sú uzavreté.',
      'Ďalší krok je na podkladoch: doplniť miesta označené [XX] a dať to von. '
        + 'Inzerát s [XX] nikto neberie vážne.');
  }

  /** Najstarší záznam podľa dátumového stĺpca — ten čaká najdlhšie. */
  function starsi(list, field) {
    return (list || []).slice().sort((a, b) =>
      String(a[field] || a.created_at || '').localeCompare(
        String(b[field] || b.created_at || '')))[0] || null;
  }

  // ── Remeslá a otázky ──────────────────────────────────────────────────────
  // Remeslo bez otázok znamená, že hovor s remeselníkom je improvizácia.
  // Overovacia otázka (`hidden`) je tá, pri ktorej kandidát nevie, že sa ňou
  // preveruje — bez nej sa nedá zistiť, či naozaj robil to, čo tvrdí.
  const OVEROVACIA = 'hidden';

  function trades({ trades = [], questions = [], chips = [] } = {}) {
    const t = (trades || []).filter(x => x && x.key);
    const q = (questions || []).filter(Boolean);
    const ch = (chips || []).filter(Boolean);
    if (!t.length) {
      return ok('Žiadne remeslá',
        'Remeslo je to, čo sa pýtame v hovore a čo hľadáme na stavbu.',
        'Bez remesiel sa nedá spraviť ani nábor, ani priradenie na zákazku.');
    }

    const aktivne = (key) => q.filter(x => x.trade_key === key && x.active !== false);

    const bezOtazok = t.filter(x => !aktivne(x.key).length);
    if (bezOtazok.length) {
      return {
        key: 'questions',
        title: `Doplniť otázky — ${bezOtazok[0].name_sk || bezOtazok[0].key}`,
        what: `${bezOtazok.length} ${plural(bezOtazok.length, 'remeslo nemá', 'remeslá nemajú', 'remesiel nemá')} `
          + 'ani jednu zapnutú otázku.',
        why: 'Bez otázok je hovor s remeselníkom improvizácia a každý ho vedie '
          + 'inak. Potom sa nedá porovnať, kto je lepší.',
        hot: false, count: bezOtazok.length, id: bezOtazok[0].key,
      };
    }

    // Otázky a polia z analýzy zadania (a zo zápisov z hovorov) sa ukladajú
    // vypnuté — niekto ich má prečítať a zapnúť. Keby sa zapínali samy,
    // v hovore by sa objavila otázka, ktorú nikto nevidel.
    const cakajuceQ = q.filter(x => x.active === false);
    const cakajuceCh = ch.filter(x => x.active === false);
    const caka = cakajuceQ.length + cakajuceCh.length;
    if (caka) {
      const co = [
        cakajuceQ.length ? `${cakajuceQ.length} ${plural(cakajuceQ.length, 'otázka', 'otázky', 'otázok')}` : '',
        cakajuceCh.length ? `${cakajuceCh.length} ${plural(cakajuceCh.length, 'pole', 'polia', 'polí')}` : '',
      ].filter(Boolean).join(' a ');
      return {
        key: 'pending',
        title: 'Prejsť, čo vzniklo samo',
        what: `${co} ${plural(caka, 'čaká', 'čakajú', 'čaká')} na zapnutie — `
          + 'vzniklo to z analýzy zadania a zo zápisov z hovorov.',
        why: 'Appka to nezapína sama. V hovore sa nemá objaviť otázka, ktorú '
          + 'nikto z nás nečítal.',
        hot: false, count: caka,
        id: (cakajuceQ[0] && cakajuceQ[0].trade_key) || null,
      };
    }

    const bezOverovacej = t.filter(x =>
      !aktivne(x.key).some(y => y.kind === OVEROVACIA));
    if (bezOverovacej.length) {
      return {
        key: 'hidden',
        title: `Doplniť overovaciu otázku — ${bezOverovacej[0].name_sk || bezOverovacej[0].key}`,
        what: `${bezOverovacej.length} ${plural(bezOverovacej.length, 'remeslo ju nemá', 'remeslá ju nemajú', 'remesiel ju nemá')}.`,
        why: 'Je to otázka, pri ktorej kandidát nevie, že sa ňou preveruje. Bez '
          + 'nej sa nedá zistiť, či naozaj robil to, čo tvrdí.',
        hot: false, count: bezOverovacej.length, id: bezOverovacej[0].key,
      };
    }

    return ok('Remeslá sú pripravené',
      `${t.length} ${plural(t.length, 'remeslo má', 'remeslá majú', 'remesiel má')} otázky `
        + 'vrátane overovacej.',
      'Otázky sa dajú kedykoľvek doplniť. Čo sa v hovore ukázalo ako dobrá '
        + 'otázka, patrí sem — inak sa to stratí.');
  }

  // ── Kde sú peniaze ────────────────────────────────────────────────────────
  // Obrazovka odpovedá na dve otázky naraz (kde stoja peniaze, koľko sa dá
  // minúť) a mala desať čísel bez toho, aby povedala, čo s tým.
  //
  // Poradie je podľa toho, čo sa stane, keď sa tomu nikto nevenuje: najprv
  // účet, ktorý nevyjde (to sú výplaty), potom cudzie peniaze, ktoré už mali
  // byť naše, až potom to, čo stojí na nás.
  const NASE = ['unbilled', 'toinvoice', 'approval'];

  function money({ stages = [], verdict = null } = {}) {
    const st = (stages || []).filter(Boolean);
    const najdi = (k) => st.find(s => s.key === k) || null;

    if (verdict && verdict.tone === 'bad') {
      return {
        key: 'cash', title: 'Účet nevyjde', what: verdict.text,
        why: 'Výplaty a faktúry od živnostníkov nepočkajú. Rieši sa to skôr — '
          + 'vyfakturovaním toho, čo je hotové, alebo odložením toho, čo počká.',
        hot: true, count: 1, id: null,
      };
    }

    const poSplatnosti = najdi('overdue');
    if (poSplatnosti && poSplatnosti.count) {
      return {
        key: 'overdue',
        title: 'Pripomenúť faktúry po splatnosti',
        what: `${poSplatnosti.count} ${plural(poSplatnosti.count, 'faktúra je', 'faktúry sú', 'faktúr je')} `
          + `po splatnosti — ${M.format(poSplatnosti.cents)}.`,
        why: 'Sú to naše peniaze u niekoho iného. Kto sa neozve, dostane zaplatené '
          + 'posledný — a nie preto, že by to niekto robil zle.',
        hot: true, count: poSplatnosti.count, id: null,
      };
    }

    const nase = st.filter(s => NASE.includes(s.key) && s.count)
      .sort((a, b) => b.cents - a.cents);
    if (nase.length) {
      const prvy = nase[0];
      return {
        key: prvy.key,
        title: prvy.todo || prvy.label,
        what: `${prvy.label} — ${M.format(prvy.cents)} `
          + `v ${prvy.count} ${plural(prvy.count, 'kroku', 'krokoch', 'krokoch')}.`,
        why: 'Toto sa dá pohnúť vlastnou rukou, bez toho, aby niekto iný čokoľvek '
          + 'spravil. Preto je to pred tým, na čo sa len čaká.',
        hot: false, count: prvy.count, id: null,
      };
    }

    if (verdict && verdict.tone === 'watch') {
      return {
        key: 'watch', title: 'Peniaze sú na hranici rezervy', what: verdict.text,
        why: 'Ešte to vyjde, ale bez priestoru. Veľký výdavok teraz znamená, '
          + 'že niečo iné počká.',
        hot: false, count: 1, id: null,
      };
    }

    return ok('Peniaze stoja v poriadku',
      verdict && verdict.text ? verdict.text : 'Nič nie je po splatnosti a nič nečaká na nás.',
      'Číslo „minúť sa dá" je najnižší bod výhľadu, nie zostatok na konci — '
        + 'preto sa naň dá spoľahnúť.');
  }

  /**
   * Najnaliehavejšia z viacerých viet — pre obrazovku, ktorá je zložená
   * z iných („Kde sú peniaze" = vydané, prijaté, banka).
   *
   * Horí pred nehorí, čokoľvek pred „nič nečaká". Keby sa brala prvá v poli,
   * poradie záložiek by rozhodovalo o tom, čo je naliehavé.
   */
  function pick(list = []) {
    const vety = (list || []).filter(Boolean);
    if (!vety.length) return null;
    return vety.find(n => n.hot)
      || vety.find(n => n.key !== 'ok')
      || vety[0];
  }

  const API = {
    firm, clients, people, plans, trades, money, pick,
    FIRMA, OVEROVACIA, NASADENY, NASE,
  };
  if (typeof window !== 'undefined') window.DanubraNow = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
