// ============================================================================
// DANUBRA — infolist na stavbu
// ============================================================================
// Živnostník dnes dostane adresu a dátum nástupu. Zvyšok sa rieši telefonátmi
// v nedeľu večer: kde presne sa hlásiť, o koľkej sa začína, za kým ísť, kde sú
// kľúče od ubytovania. Tie otázky sú zakaždým tie isté a odpovedá na ne vždy
// ten istý človek z hlavy.
//
// Infolist je jedna strana, ktorá na ne odpovedá vopred. Je **po slovensky**,
// lebo ju číta Slovák — ale adresy, názvy a vety, ktoré bude na mieste
// ukazovať Nemcom, sú po nemecky. Preklad adresy nikomu nepomôže; preložená
// veta „som subdodávateľ firmy X" pomôže veľmi.
//
// Dve veci, ktoré táto knižnica robí a ktoré sa ľahko zanedbajú:
//
//   1. **Povie, čo chýba.** Prázdny riadok na papieri vyzerá ako „netreba".
//      Keď údaj nie je vyplnený, infolist to napíše a appka to ukáže ešte
//      pred odoslaním — lepšie sa to dozvedieť v kancelárii než na stavbe.
//
//   2. **Nevymýšľa si.** Žiadne „bežne sa začína o siedmej". Buď to niekto
//      zapísal, alebo sa to človek musí opýtať — a infolist povie u koho.
//
// Nič sa tu nenačítava. Dostane hotové záznamy a vráti dáta; HTML skladá
// `templates.js`. Testy: node app/lib/documents/sitesheet.test.js
// ============================================================================
(function () {
  const txt = (v) => {
    const s = v == null ? '' : String(v).trim();
    return s && s !== '—' && s !== '-' ? s : '';
  };
  const day = (v) => (v ? String(v).slice(0, 10) : '');

  /**
   * Čo má na infoliste byť. Poradie je poradie, v akom sa to človek pýta —
   * najprv kam a kedy, až potom kde bude bývať a čo si zobrať.
   *
   * `must: true` znamená, že bez toho infolist nemá zmysel posielať.
   */
  const FIELDS = [
    { key: 'site', label: 'Adresa stavby', must: true,
      get: (x) => [txt(x.subcontract.site_address), txt(x.subcontract.site_postal_code),
        txt(x.subcontract.site_city)].filter(Boolean).join(', '),
      missing: 'Zákazka nemá adresu stavby.' },
    { key: 'start', label: 'Prvý deň', must: true,
      get: (x) => day(x.assignment.date_from) || day(x.subcontract.date_from),
      missing: 'Nasadenie nemá dátum nástupu.' },
    { key: 'time', label: 'Začiatok práce', must: true,
      get: (x) => txt(x.subcontract.work_start),
      missing: 'Nie je zapísané, o koľkej sa na tejto stavbe začína.' },
    { key: 'meeting', label: 'Kde sa hlásiť', must: true,
      get: (x) => txt(x.subcontract.meeting_point),
      missing: 'Nie je zapísané, kde presne sa má hlásiť — adresa veľkej stavby nestačí.' },
    { key: 'contact', label: 'Za kým ísť', must: true,
      get: (x) => [txt(x.subcontract.site_contact_name),
        txt(x.subcontract.site_contact_phone)].filter(Boolean).join(' · '),
      missing: 'Nie je zapísaný polier ani telefón naňho.' },
    { key: 'lodging', label: 'Ubytovanie', must: false,
      get: (x) => (x.lodging
        ? [txt(x.lodging.name), txt(x.lodging.address), txt(x.lodging.city)]
          .filter(Boolean).join(', ') : ''),
      missing: 'K zákazke nie je priradené ubytovanie.' },
    { key: 'keys', label: 'Kľúče', must: false,
      get: (x) => (x.lodging ? txt(x.lodging.keys_note) : ''),
      missing: 'Nie je zapísané, kde si vyzdvihne kľúče.' },
  ];

  /**
   * Čo je vyplnené a čo nie.
   * @returns {{ values:Object, missing:Array, blocking:Array, ready:boolean }}
   */
  function check(input) {
    const x = {
      worker: input.worker || {},
      assignment: input.assignment || {},
      subcontract: input.subcontract || {},
      partner: input.partner || null,
      lodging: input.lodging || null,
    };
    const values = {}, missing = [];
    for (const f of FIELDS) {
      let v = '';
      try { v = f.get(x) || ''; } catch { v = ''; }
      values[f.key] = v;
      if (!v) missing.push({ key: f.key, label: f.label, why: f.missing, must: !!f.must });
    }
    const blocking = missing.filter(m => m.must);
    return { values, missing, blocking, ready: blocking.length === 0 };
  }

  /** Veta pre appku — povie sa to ešte pred odoslaním, nie až na stavbe. */
  function sentence(state) {
    const s = state || check({});
    if (s.ready && !s.missing.length) return 'Infolist je kompletný.';
    if (s.ready) {
      const n = s.missing.length;
      // „2 údaje chýba" je to, čo vyjde, keď sa skloňuje podstatné meno
      // a zabudne sa na sloveso. Na doklade pre človeka to vyzerá ako chyba
      // appky — a potom sa neverí ani zvyšku.
      const co = n === 1 ? 'údaj chýba' : n < 5 ? 'údaje chýbajú' : 'údajov chýba';
      return `Infolist sa dá poslať. ${n} ${co}, ale bez ${n === 1 ? 'neho' : 'nich'} `
        + 'sa zaobíde.';
    }
    const n = s.blocking.length;
    return `Bez ${n === 1 ? 'jedného údaja' : `${n} údajov`} nemá zmysel infolist posielať: `
      + s.blocking.map(b => b.label.toLowerCase()).join(', ') + '.';
  }

  // ── Nemecké vety, ktoré bude na mieste potrebovať ──────────────────────────
  // Nie slovník. Štyri situácie, ktoré nastanú v prvý deň každému, kto
  // nevie po nemecky — a pri každej presne tá veta, ktorá ich vyrieši.
  function phrases({ supplier, partner, worker, trade } = {}) {
    const firma = (supplier && supplier.name) || '';
    const gu = (partner && partner.name) || '';
    return [
      { sk: 'Dobrý deň, volám sa …',
        de: `Guten Tag, ich heiße ${(worker && worker.full_name) || '…'}.` },
      { sk: 'Som subdodávateľ. Pracujem pre …',
        de: `Ich bin Subunternehmer${firma ? ` und arbeite für ${firma}` : ''}`
          + `${gu ? ` im Auftrag von ${gu}` : ''}.` },
      { sk: 'Hľadám poliera.', de: 'Ich suche den Polier.' },
      { sk: 'Tu je môj formulár A1 a živnostenský list.',
        de: 'Hier sind meine A1-Bescheinigung und mein Gewerbeschein.' },
      { sk: trade ? `Moje remeslo je ${trade}.` : 'Moje remeslo je …',
        de: trade ? `Mein Gewerk ist ${trade}.` : 'Mein Gewerk ist …' },
      { sk: 'Nerozumiem, môžete to zopakovať pomaly?',
        de: 'Ich verstehe nicht, können Sie das bitte langsam wiederholen?' },
    ];
  }

  /**
   * Čo si priniesť. Doklady sú prvé, lebo bez nich ho na stavbu nepustia —
   * a Zoll ich pýta priamo na mieste, nie v kancelárii.
   */
  const BRING = [
    { what: 'Formulár A1', why: 'Pýta ho nemecká finančná kontrola práce priamo na stavbe.' },
    { what: 'Živnostenský list', why: 'Dokazuje, že si subdodávateľ, nie zamestnanec.' },
    { what: 'Občiansky preukaz alebo pas', why: 'Bez dokladu totožnosti sa cez vrátnicu neprejde.' },
    { what: 'Pracovná obuv a prilba', why: 'Bez nich ťa na stavbu nepustia ani na minútu.' },
    { what: 'Reflexná vesta a rukavice', why: 'Na väčšine stavieb povinné.' },
    { what: 'Vlastné náradie', why: 'Ak nebolo dohodnuté inak.' },
  ];

  /** Odkaz na mapu. Súradnice majú prednosť — adresa sa dá zapísať nepresne. */
  function mapUrl(o = {}) {
    if (o.maps_url) return String(o.maps_url);
    if (o.lat != null && o.lng != null) {
      return `https://www.google.com/maps/search/?api=1&query=${o.lat},${o.lng}`;
    }
    const adr = [o.address || o.site_address, o.postal_code || o.site_postal_code,
      o.city || o.site_city].filter(Boolean).join(', ');
    return adr ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adr)}` : '';
  }

  const API = { FIELDS, BRING, check, sentence, phrases, mapUrl };
  if (typeof window !== 'undefined') window.DanubraSiteSheet = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
