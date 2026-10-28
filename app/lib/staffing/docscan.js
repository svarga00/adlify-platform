// ============================================================================
// DANUBRA — doklad z fotky: čo sa z neho prečíta a čo si treba overiť
// ============================================================================
// „Doklady k živnostníkom by bolo dobré, keby sa reálne nahrávali, a to by
// bola kontrola." Doklad (A1, občiansky, živnostenský list…) sa do appky
// odfotí alebo nahrá ako PDF. Model ho prečíta (netlify/functions/
// danubra-read-doc.js cez nástroj `TOOL`) a appka predvyplní druh, číslo
// a platnosť. Tu je všetko ostatné:
//
//   normalize    výstup modelu → čisté polia (dátumy RRRR-MM-DD, istota 0–1)
//   nameMatch    „NOVÁK JÁN" je Ján Novák — bez diakritiky a bez poradia slov
//   check        čo si má kolega overiť skôr, než doklad uloží
//   toFields     čo sa predvyplní do formulára
//
// Model sa mýli zriedka, ale mýli sa. Nič odtiaľto sa neuloží samo: údaje
// porovná so skenom kolega a jeho meno sa zapíše k dokladu (checked_by).
// To je tá kontrola — nie AI.
//
// Čisté funkcie, bez siete. Testy: node app/lib/staffing/docscan.test.js
// ============================================================================
(function () {
  /** Druhy dokladov, ktoré model smie vrátiť. Sedia s číselníkom worker_document. */
  const KINDS = ['a1', 'id_card', 'passport', 'trade_licence', 'contract', 'gdpr',
    'certificate', 'insurance', 'medical', 'other'];

  /** Názov druhu pre vetu („Vyzerá to ako pas, nie ako A1"). */
  const KIND_LABEL = {
    a1: 'formulár A1', id_card: 'občiansky preukaz', passport: 'pas',
    trade_licence: 'živnostenský list', contract: 'zmluva o dielo', gdpr: 'súhlas GDPR',
    certificate: 'doklad o odbornosti', insurance: 'poistenie', medical: 'zdravotná prehliadka',
    other: 'iný doklad',
  };

  /** Pod touto istotou sa pýta kontrola každého údaja. */
  const UNSURE_BELOW = 0.6;

  // ── Čo sa od modelu pýta ──────────────────────────────────────────────────
  const strOrNull = (description) => ({ type: ['string', 'null'], description });

  const TOOL = {
    name: 'doklad',
    description: 'Zapíše údaje prečítané z dokladu živnostníka (A1, občiansky, pas, živnostenský list, zmluva…).',
    input_schema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: KINDS,
          description: 'Druh dokladu: a1 = formulár A1 (Sociálna poisťovňa / ČSSZ / NEAK), id_card = občiansky preukaz, '
            + 'passport = cestovný pas, trade_licence = živnostenský list / výpis zo živnostenského registra, '
            + 'contract = zmluva o dielo, gdpr = súhlas so spracovaním osobných údajov, '
            + 'certificate = doklad o odbornosti / výučný list, insurance = poistenie zodpovednosti, '
            + 'medical = lekárska prehliadka, other = niečo iné' },
        reference: strOrNull('Číslo dokladu (číslo OP, pasu, A1, IČO pri živnostenskom liste, číslo zmluvy); null, ak nie je'),
        valid_from: strOrNull('Platí od ako RRRR-MM-DD (pri A1 pole „od", pri OP dátum vydania); null, ak nie je'),
        valid_to: strOrNull('Platí do ako RRRR-MM-DD; null, ak doklad koniec platnosti nemá alebo nie je čitateľný'),
        holder_name: strOrNull('Meno a priezvisko držiteľa tak, ako je na doklade; null, ak nie je'),
        issuer: strOrNull('Kto doklad vydal (napr. Sociálna poisťovňa, Okresný úrad Žilina); null, ak nie je'),
        confidence: { type: 'number', minimum: 0, maximum: 1,
          description: 'Ako veľmi si istý prečítanými údajmi, 0 až 1 (rozmazaná alebo orezaná fotka = nízko)' },
        notes: { type: 'string', description: 'Čo bolo nečitateľné alebo zvláštne, po slovensky; prázdne, ak nič' },
      },
      required: ['kind', 'confidence'],
    },
  };

  /** Zadanie pre model. Meno a očakávaný druh sú len na porovnanie. */
  function instructions({ workerName = '', expectedKind = '', today = '' } = {}) {
    const meno = String(workerName || '').trim().slice(0, 120);
    const druh = KINDS.includes(expectedKind) ? expectedKind : '';
    return [
      'Prečítaj priložený doklad a zapíš ho cez nástroj doklad.',
      '',
      'O čo ide: firma posiela živnostníkov zo Slovenska, Česka a Maďarska na stavby v Nemecku.',
      'Pred nasadením musí mať každý platné doklady. Kolega údaje po tebe skontroluje podľa toho istého skenu.',
      '',
      'PRAVIDLÁ',
      '- Prepisuj presne, čo je na doklade. Nič si nevymýšľaj a nič nedopočítavaj; čo nevidíš, daj null.',
      '- Dátumy vždy ako RRRR-MM-DD. Na dokladoch býva DD.MM.RRRR (napr. 03.02.2027 = 2027-02-03).',
      '- Pri A1 je platnosť v poli „od – do" (bod 2.1/2.2 alebo 5.1/5.2). Pri občianskom a pase je „platný do".',
      '- Živnostenský list zvyčajne koniec platnosti nemá: valid_to = null, valid_from = deň vzniku oprávnenia.',
      '- holder_name prepíš tak, ako je napísané (aj veľkými písmenami, aj v poradí priezvisko meno).',
      '- confidence zníž, keď je fotka rozmazaná, orezaná, odlesknutá alebo keď si číslo či dátum domýšľaš.',
      '- Do notes napíš po slovensky, čo bolo nečitateľné. Osobné údaje navyše (rodné číslo, adresu) nevypisuj.',
      meno ? `\nDoklad by mal patriť človeku „${meno}". Meno prepíš z dokladu, nie zo zadania.` : '',
      druh ? `Podľa appky by to mal byť: ${KIND_LABEL[druh]}. Keď je na papieri niečo iné, platí papier.` : '',
      today ? `Dnes je ${today}.` : '',
    ].filter((x) => x !== '').join('\n');
  }

  // ── Normalizácia ──────────────────────────────────────────────────────────
  const clean = (v, max) => {
    if (v == null) return null;
    const s = String(v).replace(/\s+/g, ' ').trim();
    if (!s || /^(null|none|n\/a|-|—)$/i.test(s)) return null;
    return s.slice(0, max);
  };

  function validYmd(y, m, d) {
    if (!(y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  /** „2027-02-03", „03.02.2027", „3. 2. 2027", „3/2/2027" → '2027-02-03'; inak null. */
  function parseDate(v) {
    const s = clean(v, 40);
    if (!s) return null;
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return validYmd(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{4})$/);
    if (m) return validYmd(+m[3], +m[2], +m[1]);
    return null;
  }

  /** Istota 0–1. Berie aj percentá a slová, ktoré model občas pošle. */
  function parseConfidence(v) {
    if (typeof v === 'string') {
      const w = v.trim().toLowerCase();
      if (['high', 'vysoká', 'vysoka'].includes(w)) return 0.9;
      if (['medium', 'stredná', 'stredna'].includes(w)) return 0.6;
      if (['low', 'nízka', 'nizka'].includes(w)) return 0.3;
    }
    let n = Number(v);
    if (!Number.isFinite(n)) return 0;
    if (n > 1 && n <= 100) n /= 100;
    return Math.max(0, Math.min(1, Math.round(n * 100) / 100));
  }

  /**
   * Výstup modelu → čisté polia. Nikdy nevyhadzuje: odpoveď modelu je cudzí vstup.
   * @returns {{ kind, reference, valid_from, valid_to, holder_name, issuer, confidence, notes }}
   */
  function normalize(raw) {
    const r = (raw && typeof raw === 'object') ? raw : {};
    const kind = String(r.kind || '').trim().toLowerCase();
    return {
      kind: KINDS.includes(kind) ? kind : 'other',
      reference: clean(r.reference, 80),
      valid_from: parseDate(r.valid_from),
      valid_to: parseDate(r.valid_to),
      holder_name: clean(r.holder_name, 120),
      issuer: clean(r.issuer, 160),
      confidence: parseConfidence(r.confidence),
      notes: clean(r.notes, 500) || '',
    };
  }

  // ── Meno na doklade vs. meno človeka ──────────────────────────────────────
  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z\s-]/g, ' ');
  const tokens = (s) => fold(s).split(/[\s-]+/).filter((t) => t.length >= 2);

  /** Levenshtein do 2 — na preklep v OCR („Novak" / „Nowak"). */
  function near(a, b) {
    if (a === b) return true;
    const tol = Math.min(a.length, b.length) >= 5 ? 1 : 0;
    if (!tol || Math.abs(a.length - b.length) > tol) return false;
    const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let diag = prev[0]; prev[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = prev[j];
        prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
        diag = tmp;
      }
    }
    return prev[b.length] <= tol;
  }

  /**
   * Sedí meno na doklade s menom človeka? Bez diakritiky, bez ohľadu na
   * veľké písmená a poradie slov („NOVÁK JÁN" = Ján Novák). Druhé krstné
   * meno navyše nevadí — každé slovo z kratšieho mena musí byť v dlhšom.
   *
   * @returns {{ state: 'match'|'mismatch'|'unknown', score: number }}
   *   unknown = jedno z mien chýba, nie je s čím porovnať
   */
  function nameMatch(docName, workerName) {
    const a = tokens(docName), b = tokens(workerName);
    if (!a.length || !b.length) return { state: 'unknown', score: 0 };
    const [short, long] = a.length <= b.length ? [a, b] : [b, a];
    const used = new Set();
    let hit = 0;
    for (const t of short) {
      const i = long.findIndex((u, k) => !used.has(k) && near(t, u));
      if (i >= 0) { used.add(i); hit++; }
    }
    const score = Math.round((hit / short.length) * 100) / 100;
    // Jedno slovo (len priezvisko) nestačí, keď človek má v appke celé meno.
    const enough = hit === short.length && (short.length >= 2 || long.length === 1);
    return { state: enough ? 'match' : 'mismatch', score };
  }

  // ── Čo si treba overiť ────────────────────────────────────────────────────
  const denSk = (d) => {
    const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${Number(m[3])}. ${Number(m[2])}. ${m[1]}` : '';
  };
  // Pas a občiansky sú pri nasadení to isté (documents.js, `alt`).
  const sameKind = (a, b) => a === b
    || (['id_card', 'passport'].includes(a) && ['id_card', 'passport'].includes(b));

  /**
   * Upozornenia k prečítanému dokladu, najdôležitejšie prvé.
   * @param {Object} read      výstup normalize()
   * @param {Object} o         { workerName, expectedKind, today }
   * @returns {Array<{ code, text, severity: 'bad'|'warn'|'info' }>}
   */
  function check(read, o = {}) {
    const r = read || {};
    const today = o.today || new Date().toISOString().slice(0, 10);
    const out = [];
    const add = (code, severity, text) => out.push({ code, severity, text });

    const nm = nameMatch(r.holder_name, o.workerName);
    if (nm.state === 'mismatch') {
      add('name_mismatch', 'bad', `Meno na doklade („${r.holder_name}") nesedí s menom človeka (${o.workerName}). `
        + 'Skontrolujte, či je to jeho doklad.');
    } else if (nm.state === 'unknown' && o.workerName) {
      add('name_unread', 'info', 'Meno na doklade sa nepodarilo prečítať — porovnajte ho so skenom sami.');
    }
    if (r.valid_to && r.valid_to < today) {
      add('expired', 'bad', `Doklad je už neplatný — platil do ${denSk(r.valid_to)}.`);
    } else if (r.valid_from && r.valid_from > today) {
      add('not_yet', 'warn', `Doklad ešte neplatí — platí až od ${denSk(r.valid_from)}.`);
    }
    if (r.valid_from && r.valid_to && r.valid_from > r.valid_to) {
      add('dates_swapped', 'warn', 'Dátum „od" je neskôr než dátum „do" — skontrolujte oba podľa skenu.');
    }
    if (o.expectedKind && KINDS.includes(o.expectedKind) && r.kind && r.kind !== 'other'
      && !sameKind(r.kind, o.expectedKind)) {
      add('kind_mismatch', 'warn', `Vyzerá to ako ${KIND_LABEL[r.kind]}, nie ${KIND_LABEL[o.expectedKind]}. `
        + 'Skontrolujte druh dokladu.');
    }
    if (!(Number(r.confidence) >= UNSURE_BELOW)) {          // chýbajúca istota nie je istota
      add('unsure', 'warn', 'AI si nie je istá, čo prečítala — skontrolujte každý údaj podľa skenu.');
    }
    if (['a1', 'id_card', 'passport'].includes(r.kind) && !r.valid_to) {
      add('no_valid_to', 'info', 'Dátum „platí do" sa nepodarilo prečítať — doplňte ho zo skenu.');
    }
    const ORDER = { bad: 0, warn: 1, info: 2 };
    return out.sort((x, y) => ORDER[x.severity] - ORDER[y.severity]);
  }

  /**
   * Čo sa predvyplní do formulára. Prázdne hodnoty sa nevracajú — formulár
   * nesmie prepísať to, čo kolega už napísal, prázdnym poľom.
   */
  function toFields(read) {
    const r = read || {};
    const out = {};
    if (r.kind && r.kind !== 'other') out.kind = r.kind;
    if (r.reference) out.reference = r.reference;
    if (r.valid_from) out.valid_from = r.valid_from;
    if (r.valid_to) out.valid_to = r.valid_to;
    return out;
  }

  /** Záznam do `ai_read` (jsonb): čo AI prečítala, kedy a s akými upozorneniami. */
  function record(read, o = {}) {
    if (!read) return null;
    return {
      ...normalize(read),
      model: o.model || null,
      read_at: o.at || new Date().toISOString(),
      warnings: (o.warnings || []).map((w) => w.code).filter(Boolean),
    };
  }

  const API = {
    TOOL, KINDS, KIND_LABEL, UNSURE_BELOW,
    instructions, normalize, parseDate, parseConfidence,
    nameMatch, check, toFields, record,
  };
  if (typeof window !== 'undefined') window.DanubraDocScan = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
