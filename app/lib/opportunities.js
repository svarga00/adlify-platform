// ============================================================================
// DANUBRA — Možnosti: potenciálne zákazky, ktoré ešte nie sú zákazkami
// ============================================================================
// Reťazec v appke začínal ponukou alebo zákazkou. Lenže predtým príde telefonát
// alebo e-mail: „máme stavbu pri Mníchove, potrebujeme štyroch zváračov".
// Takáto vec žila v e-mailoch a v hlave toho, kto ju prijal — a keď z nej nič
// nebolo, nikde nezostalo, že vôbec bola.
//
// Prah je zámerne nízky: názov a čo potrebujú. Zapisovať to má každý z tímu,
// aj keď o zákazke nevie nič viac. Knižnica preto nehovorí „záznam je neúplný",
// ale **čo konkrétne doplniť ako prvé** — a v akom poradí to má zmysel.
//
// Overenie firmy je samostatná vec a drží sa pravidla, ktoré sa ľahko pokazí:
// **„register neodpovedal" nie je „firma neexistuje".** Prvé znamená skúsiť
// neskôr, druhé znamená nerobiť s nimi.
//
// Čisté funkcie, žiadny `window`, žiadny DB prístup.
// Testy: node app/lib/opportunities.test.js
// ============================================================================
(function () {
  const M = (typeof require !== 'undefined' && typeof module !== 'undefined')
    ? require('./money.js') : window.Money;

  /**
   * Stavy. Zámerne ich je päť a nie viac: každý ďalší stav je ďalšie
   * rozhodnutie, ktoré musí niekto spraviť, aby sa možnosť pohla.
   */
  const STATUS = [
    ['new', 'Nová', 'amber', 'Prišla a nikto ju ešte nepozrel.'],
    ['checking', 'Preverujeme', 'blue', 'Vieme o nej a zisťujeme, či to dáva zmysel.'],
    ['offer', 'Ponuka odišla', 'blue', 'Odberateľ má od nás cenu a termín.'],
    ['won', 'Vyhrali sme', 'green', 'Je z nej zákazka.'],
    ['lost', 'Stratená', 'gray', 'Nebolo z nej nič — a je zapísané prečo.'],
  ];
  const ZAVRETE = ['won', 'lost'];

  function status(key) { return STATUS.find(s => s[0] === key) || STATUS[0]; }
  function statusLabel(key) { return status(key)[1]; }

  /**
   * Čo možnosti chýba, v poradí, v akom to má zmysel dopĺňať.
   *
   * Nie je to validácia formulára — je to poradie práce. Firma bez USt-IdNr
   * sa nedá preveriť ani jej fakturovať v reverse charge, takže je prvá; čo
   * presne potrebujú, je druhé, pretože bez toho sa nedá povedať cena.
   */
  const CHYBA = [
    { key: 'company_name', title: 'názov firmy',
      why: 'Bez neho sa nedá zistiť, s kým máme do činenia.' },
    { key: 'company_vat', title: 'USt-IdNr firmy',
      why: 'Bez neho sa firma nedá preveriť v registri ani jej fakturovať '
        + 'v reverse charge podľa §13b.' },
    { key: 'contact_phone', title: 'telefón na kontakt',
      why: 'E-mail môže ležať tri dni. Telefón je to, čím sa dopyt pohne.' },
    { key: 'trade_key', title: 'remeslo',
      why: 'Bez neho sa nedá spraviť nábor ani povedať, koho hľadáme.' },
    { key: 'headcount', title: 'koľko ľudí',
      why: 'Od toho závisí, či to vôbec stíhame.' },
    { key: 'city', title: 'mesto',
      why: 'Od neho závisí ubytovanie, doprava a to, či na to máme ľudí blízko.' },
    { key: 'rate_client', title: 'čo sú ochotní platiť',
      why: 'Bez sadzby odberateľa sa nedá spočítať marža — a bez marže je '
        + 'rozhodnutie o zákazke dojem.' },
    { key: 'start_date', title: 'odkedy',
      why: 'Je to prvá otázka v každom telefonáte so živnostníkom.' },
  ];

  function prazdne(v) {
    return v === null || v === undefined || v === '' || Number.isNaN(v);
  }

  /** Čo konkrétne chýba. Vracia zoznam v poradí podľa `CHYBA`. */
  function missing(opp = {}) {
    return CHYBA.filter(f => prazdne(opp[f.key]));
  }

  /** Je firma preverená? A ak nie, prečo. */
  function verification(opp = {}) {
    const r = opp.verify_result;
    if (!r) {
      return { state: 'unchecked', label: 'Firma nepreverená',
        detail: opp.company_vat
          ? 'USt-IdNr je zadané, ale register sme sa ešte nepýtali.'
          : 'Bez USt-IdNr sa preveriť nedá.' };
    }
    // Toto je to miesto, ktoré sa ľahko pokazí: keď register neodpovie,
    // nesmie to vyzerať ako „firma neexistuje".
    if (r.unavailable) {
      return { state: 'unavailable', label: 'Register neodpovedal',
        detail: 'Nie je to to isté ako neplatné USt-IdNr. Skúste to neskôr — '
          + 'VIES býva mimo prevádzky aj niekoľko hodín.' };
    }
    if (r.valid === false) {
      return { state: 'invalid', label: 'USt-IdNr neplatné',
        detail: 'Register firmu s týmto číslom nepozná. Overte si číslo u nich — '
          + 'bez platného USt-IdNr sa nedá fakturovať v reverse charge.' };
    }
    if (r.valid === true) {
      return { state: 'valid', label: 'Firma preverená',
        detail: [r.name, r.address].filter(Boolean).join(' · ') || 'Register číslo pozná.' };
    }
    return { state: 'unchecked', label: 'Firma nepreverená',
      detail: 'Odpoveď registra sa nedá prečítať.' };
  }

  /**
   * Hodinová marža možnosti — podľa toho, čo sú ochotní platiť a čo by sme
   * dali živnostníkovi. Keď chýba jedno z dvoch, nevracia nulu, ale `null`:
   * nula vyzerá ako zmeraná hodnota.
   */
  function margin(opp = {}) {
    const client = M.toCents(opp.rate_client);
    const worker = M.toCents(opp.rate_worker);
    if (!client || !worker) return { perHour: null, pct: null };
    const diff = client - worker;
    return { perHour: diff, pct: Math.round((diff / client) * 1000) / 10 };
  }

  /**
   * Jedna vec, ktorá sa má spraviť teraz — cez všetky možnosti.
   *
   * Poradie je podľa toho, čo sa stane, keď sa tomu nikto nevenuje:
   *
   *   1. **nová možnosť** — niekto sa ozval a nikto mu neodpovedal. Toto horí:
   *      odberateľ volá viacerým.
   *   2. **nepreverená firma** pri možnosti, ktorú už riešime — robiť ponuku
   *      firme, ktorú register nepozná, je strata času.
   *   3. **chýbajúci údaj** — bez remesla a sadzby sa nedá ani nábor, ani cena.
   *   4. **ponuka odišla a je ticho** — treba sa pripomenúť.
   */
  function nowNext(opps = [], today) {
    const dnes = String(today || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const zive = (opps || []).filter(o => o && !ZAVRETE.includes(o.status));

    const nove = zive.filter(o => o.status === 'new');
    if (nove.length) {
      return {
        key: 'new', title: nove.length === 1 ? 'Ozvať sa na nový dopyt' : 'Ozvať sa na nové dopyty',
        what: `${nove.length} ${plural(nove.length, 'dopyt čaká', 'dopyty čakajú', 'dopytov čaká')} `
          + 'na prvú odpoveď.',
        why: 'Odberateľ, ktorý hľadá ľudí, sa pýta viacerých. Rozhoduje, kto sa ozve '
          + 'prvý — nie kto má lepšiu cenu.',
        hot: true, opp: najstarsia(nove), count: nove.length,
      };
    }

    const nepreverene = zive.filter(o => {
      const v = verification(o);
      return v.state !== 'valid' && !!o.company_vat;
    });
    if (nepreverene.length) {
      const neplatne = nepreverene.filter(o => verification(o).state === 'invalid');
      const prvy = neplatne[0] || najstarsia(nepreverene);
      return {
        key: 'verify',
        title: neplatne.length ? 'Firma s neplatným USt-IdNr' : 'Preveriť firmu v registri',
        what: neplatne.length
          ? `${neplatne.length} ${plural(neplatne.length, 'firma', 'firmy', 'firiem')} `
            + 'nie je v registri pod zadaným číslom.'
          : `${nepreverene.length} ${plural(nepreverene.length, 'firma', 'firmy', 'firiem')} `
            + 'ešte nebola preverená.',
        why: 'Bez platného USt-IdNr sa nedá fakturovať v reverse charge podľa §13b — '
          + 'a robiť ponuku firme, ktorú register nepozná, je strata času.',
        hot: neplatne.length > 0, opp: prvy, count: nepreverene.length,
      };
    }

    const sChybou = zive.map(o => ({ opp: o, chyba: missing(o) }))
      .filter(x => x.chyba.length);
    if (sChybou.length) {
      const prvy = sChybou[0];
      return {
        key: 'fill', title: `Doplniť ${prvy.chyba[0].title}`,
        what: `${prvy.opp.title}${sChybou.length > 1
          ? ` (a ${sChybou.length - 1} ${plural(sChybou.length - 1, 'ďalšia', 'ďalšie', 'ďalších')})` : ''}`,
        why: prvy.chyba[0].why,
        hot: false, opp: prvy.opp, count: sChybou.length,
      };
    }

    const ponuky = zive.filter(o => o.status === 'offer');
    if (ponuky.length) {
      return {
        key: 'followup', title: 'Pripomenúť sa k ponuke',
        what: `${ponuky.length} ${plural(ponuky.length, 'ponuka je', 'ponuky sú', 'ponúk je')} `
          + 'u odberateľa a je ticho.',
        why: 'Ticho neznamená nie. Znamená, že to má na stole niekto, kto má ďalších '
          + 'desať vecí.',
        hot: false, opp: najstarsia(ponuky), count: ponuky.length,
      };
    }

    return {
      key: 'ok', title: zive.length ? 'Všetky dopyty sú rozpracované' : 'Žiadne dopyty',
      what: zive.length
        ? `${zive.length} ${plural(zive.length, 'dopyt', 'dopyty', 'dopytov')} bez chýbajúcich údajov.`
        : 'Keď sa niekto ozve, zapíšte to sem — aj keď o tom viete málo.',
      why: 'Dopyt, ktorý nie je zapísaný, neexistuje. O pol roka sa tá istá firma '
        + 'ozve znova a bude dobré vedieť, čo bolo naposledy.',
      hot: false, opp: null, count: 0,
    };
  }

  /** Najstarší záznam — ten čaká najdlhšie. */
  function najstarsia(list) {
    return (list || []).slice().sort((a, b) =>
      String(a.created_at || '').localeCompare(String(b.created_at || '')))[0] || null;
  }

  /** Čísla do pruhu nad zoznamom. */
  function summary(opps = []) {
    const live = (opps || []).filter(o => o && !ZAVRETE.includes(o.status));
    const won = (opps || []).filter(o => o && o.status === 'won').length;
    const lost = (opps || []).filter(o => o && o.status === 'lost').length;
    const uzavrete = won + lost;
    return {
      live: live.length, won, lost,
      // Úspešnosť má zmysel až vtedy, keď je z čoho počítať. Nula pri nule
      // vyzerá ako zmeraná hodnota, a nie je.
      rate: uzavrete >= 3 ? Math.round((won / uzavrete) * 100) : null,
    };
  }

  function plural(n, one, few, many) {
    const a = Math.abs(n);
    if (a === 1) return one;
    if (a >= 2 && a <= 4) return few;
    return many;
  }

  // ── Z dopytu ďalej: ponuka a zákazka ──────────────────────────────────────
  // Dopyt nemá odberateľa ako záznam — má len názov firmy a USt-IdNr, ako ich
  // niekto zapísal z telefónu. Ponuka aj zákazka sa ale viažu na odberateľa
  // (`partner_id`). Preto sa ho tu skúsime nájsť: najprv podľa USt-IdNr
  // (to je jednoznačné), potom podľa názvu bez právnej formy. Keď nesedí nič,
  // vráti sa `null` — vymýšľať sa nesmie, radšej nech ho človek vyberie.

  function cisloDph(v) { return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function menoFirmy(v) {
    return String(v || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\b(gmbh|ag|kg|ohg|ug|mbh|co|e\.?k|s\.?r\.?o|a\.?s)\b/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }

  /** Odberateľ, ktorý zodpovedá firme z dopytu — alebo `null`. */
  function matchPartner(opp = {}, partners = []) {
    const list = (partners || []).filter(Boolean);
    const vat = cisloDph(opp.company_vat);
    if (vat) {
      const p = list.find(x => cisloDph(x.ust_idnr) === vat);
      if (p) return p;
    }
    const meno = menoFirmy(opp.company_name);
    if (!meno) return null;
    return list.find(x => menoFirmy(x.name) === meno) || null;
  }

  /**
   * Predvyplnenie novej ponuky z dopytu. Prenáša sa len to, čo v dopyte je —
   * prázdne pole ostane prázdne, nevymýšľa sa.
   */
  function toQuote(opp = {}, partnerId = null) {
    const ludia = Number(opp.headcount) || null;
    return {
      title: opp.title || null,
      // Väzba ponuky na dopyt (migrácia 074): pri dopyte je potom vidieť,
      // aká ponuka z neho vznikla, a pri ponuke odkaz späť.
      opportunity_id: opp.id || null,
      partner_id: partnerId || null,
      trade_key: opp.trade_key || null,
      headcount: ludia || 1,
      work_type: 'construction',
      site_city: opp.city || null,
      country: opp.country || 'DE',
      date_from: opp.start_date || null,
      charge_rate: opp.rate_client ?? null,
      worker_rate: opp.rate_worker ?? null,
      notes: opp.company_name && !partnerId
        ? `Z dopytu: ${opp.title || ''} (firma „${opp.company_name}" zatiaľ nie je medzi odberateľmi)`
        : (opp.title ? `Z dopytu: ${opp.title}` : null),
    };
  }

  /**
   * Predvyplnenie novej zákazky z dopytu. Väzba dopyt → zákazka sa neukladá
   * do zákazky, ale do dopytu (`danubra_opportunities.subcontract_id`) — podľa
   * nej krok 2 zákazky vie, koľko ľudí treba.
   *
   * Typ prác je stavebný: dopyty sú stavby, a prísnejší režim je bezpečnejší
   * omyl než mierny (dielňa by ticho vypustila A1, SOKA aj §48b).
   */
  function toSubcontract(opp = {}, partnerId = null) {
    return {
      title: opp.title || null,
      partner_id: partnerId || null,
      work_type: 'construction',
      trade: opp.trade_key || null,
      date_from: opp.start_date || null,
      site_city: opp.city || null,
      charge_rate: opp.rate_client ?? null,
      notes: opp.headcount
        ? `Z dopytu: ${opp.title || ''} — treba ${opp.headcount} ${plural(Number(opp.headcount), 'človeka', 'ľudí', 'ľudí')}`
        : (opp.title ? `Z dopytu: ${opp.title}` : null),
    };
  }

  const API = {
    STATUS, ZAVRETE, CHYBA,
    status, statusLabel, missing, verification, margin, nowNext, summary, plural,
    matchPartner, toQuote, toSubcontract,
  };
  if (typeof window !== 'undefined') window.DanubraOpp = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
