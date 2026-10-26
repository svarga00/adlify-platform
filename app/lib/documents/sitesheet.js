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
      missing: 'Nie je zapísané, za kým sa prvý deň hlásiť.' },
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
      // Nemeckú vetu nechávame, ako je — na nemeckej stavbe sa tomu človeku
      // naozaj hovorí Polier a je to slovo, ktoré tam živnostník bude slýchať.
      // Slovenská strana ho ale vysvetľuje, nepoužíva.
      { sk: 'Hľadám majstra, ktorý preberá prácu.', de: 'Ich suche den Polier.' },
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
    { what: 'Živnostenský list', why: 'Dokazuje, že ste subdodávateľ, nie zamestnanec.' },
    { what: 'Občiansky preukaz alebo pas', why: 'Bez dokladu totožnosti sa cez vrátnicu neprejde.' },
    { what: 'Pracovná obuv a prilba', why: 'Bez nich Vás na stavbu nepustia ani na minútu.' },
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

  // ── Kolegovia a kontaktná osoba ────────────────────────────────────────────
  // Prvá otázka na stavbe nie je „kde je brána", ale „koho sa tu môžem
  // spýtať". Kto ide s partiou, má ju. Kto ide sám, dostane pri nasadení
  // kontaktnú osobu — kolegu, ktorý tam už robí, alebo meno a telefón.

  /**
   * @param {Object} o
   *   assignment    nasadenie (worker_id, contact_worker_id, contact_name,
   *                 contact_phone, contact_note)
   *   crew          partia nasadenia { id, name, phone, leader_worker_id } alebo null
   *   crewMembers   členstvá { crew_id, worker_id, role, left_at }
   *   workers       ľudia (na mená a telefóny)
   *   contactWorker záznam kolegu z contact_worker_id, ak ho už máte načítaný
   *   today         'YYYY-MM-DD' — kto odišiel pred týmto dňom, už nie je v partii
   * @returns {{ crew:{name,phone}|null, people:Array<{name,phone,role,leader}>,
   *             contact:{name,phone,note}|null }}
   */
  function colleagues({ assignment, crew, crewMembers, workers, contactWorker, today } = {}) {
    const a = assignment || {};
    const dnes = day(today) || new Date().toISOString().slice(0, 10);
    const byId = new Map((workers || []).filter(Boolean).map(w => [w.id, w]));

    let partia = null;
    const people = [];
    if (crew) {
      partia = { name: txt(crew.name) || 'Partia', phone: txt(crew.phone) };
      const videl = new Set([a.worker_id]);
      for (const m of crewMembers || []) {
        if (!m || (m.crew_id && crew.id && m.crew_id !== crew.id)) continue;
        // Deň odchodu už do partie nepatrí (rovnako ako v staffing/crews.js).
        if (day(m.left_at) && day(m.left_at) <= dnes) continue;
        if (videl.has(m.worker_id)) continue;
        videl.add(m.worker_id);
        const w = byId.get(m.worker_id) || {};
        const name = txt(w.full_name) || txt(m.full_name);
        if (!name) continue;
        const leader = m.role === 'leader' || (!!crew.leader_worker_id && m.worker_id === crew.leader_worker_id);
        people.push({ name, phone: txt(w.phone) || txt(m.phone), role: leader ? 'predák' : 'člen partie', leader });
      }
      // Predák prvý — jemu sa volá, keď nikto iný nevie.
      people.sort((x, y) => (y.leader - x.leader) || x.name.localeCompare(y.name, 'sk'));
    }

    let contact = null;
    const cid = a.contact_worker_id;
    const cw = cid && cid !== a.worker_id
      ? ((contactWorker && (!contactWorker.id || contactWorker.id === cid)) ? contactWorker : byId.get(cid)) || null
      : null;
    const meno = (cw && txt(cw.full_name)) || txt(a.contact_name);
    const tel = (cw && txt(cw.phone)) || txt(a.contact_phone);
    if (meno || tel) contact = { name: meno || 'Kontaktná osoba', phone: tel, note: txt(a.contact_note) };

    return { crew: partia, people, contact };
  }

  // ── Ubytovanie ─────────────────────────────────────────────────────────────
  /** Adresa ubytovania: priradené ubytovanie zákazky, inak celý záznam. */
  const adresaByt = (x) => {
    const l = x.lodging || {}, acc = x.accommodation || {};
    if (txt(l.address)) return [txt(l.address), txt(l.city) || txt(acc.city)].filter(Boolean).join(', ');
    return [txt(acc.address), txt(acc.postal_code), txt(acc.city) || txt(l.city)].filter(Boolean).join(', ');
  };

  /**
   * Čo má byť na infoliste k ubytovaniu. Povinná je len adresa — zvyšok sa
   * dá doplniť telefonátom, ale ten telefonát má byť v kancelárii, nie
   * v nedeľu o desiatej pred zamknutými dverami.
   */
  const LODGING_FIELDS = [
    { key: 'address', label: 'Adresa ubytovania', must: true,
      get: adresaByt,
      missing: 'Ubytovanie nemá zapísanú adresu — bez nej ho nenájde ani navigácia.' },
    { key: 'from', label: 'Od kedy', must: false,
      get: (x) => day(x.stay && x.stay.date_from) || day(x.lodging && x.lodging.date_from),
      missing: 'Nie je zapísané, od kedy sa dá na ubytovanie nastúpiť — kto príde skôr, môže stáť pred zamknutými dverami.' },
    { key: 'access', label: 'Kľúče a vstup', must: false,
      get: (x) => {
        const l = x.lodging || {}, acc = x.accommodation || {};
        return [txt(l.keys_note), txt(acc.access_key_location),
          txt(acc.access_door_code) && `Kód dverí: ${txt(acc.access_door_code)}`,
          txt(acc.gate_code) && `Kód brány: ${txt(acc.gate_code)}`].filter(Boolean).join(' · ');
      },
      missing: 'Nie je zapísané, ako sa dostať dnu — kde sú kľúče alebo aký je kód. To je najčastejšia otázka v deň príchodu.' },
    { key: 'checkin', label: 'Príchod (check-in)', must: false,
      get: (x) => txt(x.accommodation && x.accommodation.checkin_info),
      missing: 'Nie je zapísané, ako prebieha príchod — od koľkej a u koho sa hlásiť.' },
  ];

  /**
   * Ako `check()`, ale pre ubytovanie.
   * @returns {{ values:Object, missing:Array, blocking:Array, ready:boolean }}
   *   values navyše: name, to (posledný deň), map (odkaz na mapu)
   */
  function checkLodging(input = {}) {
    const x = { lodging: input.lodging || null, accommodation: input.accommodation || null,
      stay: input.stay || null };
    const values = {}, missing = [];
    for (const f of LODGING_FIELDS) {
      let v = '';
      try { v = f.get(x) || ''; } catch { v = ''; }
      values[f.key] = v;
      if (!v) missing.push({ key: f.key, label: f.label, why: f.missing, must: !!f.must });
    }
    const l = x.lodging || {}, acc = x.accommodation || {};
    values.name = txt(l.name) || txt(acc.name);
    values.to = day(x.stay && x.stay.date_to) || day(l.date_to);
    values.map = (x.lodging && (l.maps_url || (l.lat != null && l.lng != null) || txt(l.address)))
      ? mapUrl(l) : (x.accommodation ? mapUrl(acc) : '');
    const blocking = missing.filter(m => m.must);
    return { values, missing, blocking, ready: blocking.length === 0 };
  }

  const API = { FIELDS, LODGING_FIELDS, BRING, check, checkLodging, sentence, phrases, mapUrl, colleagues };
  if (typeof window !== 'undefined') window.DanubraSiteSheet = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
