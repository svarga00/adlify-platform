// ============================================================================
// DANUBRA — správy
// ============================================================================
// Tri veci, a **dve z nich fungujú hneď**:
//
//   1. **Interná komunikácia pri zázname** — poznámka k živnostníkovi,
//      k zákazke, k faktúre, ktorú vidia kolegovia. Žiadny kľúč netreba.
//   2. **Evidencia toho, čo sme poslali a čo prišlo** — aj keď to odišlo
//      odinakiaľ. Zapíše sa to sem a je to pri zázname.
//   3. **Samotné odosielanie** — čaká na kľúč poskytovateľa. Kým ho niet,
//      správa sa zaradí do frontu a **neodíde**.
//
// Tá tretia vec je dôvod, prečo je tu `canSend()`. Appka nikdy nepovie
// „odoslané", keď sa neodoslalo — to je horšie než keby sa o to ani
// nepokúsila, lebo človek na to spoľahne a nedovolá sa.
//
// Testy: node app/lib/messaging.test.js
// ============================================================================
(function () {
  /** Čo sa dá doplniť do šablóny. Názvy sú po slovensky, píše ich človek. */
  const PLACEHOLDERS = [
    ['meno', 'meno človeka alebo firmy'],
    ['mesto', 'mesto stavby'],
    ['zakazka', 'názov zákazky'],
    ['remeslo', 'remeslo'],
    ['sadzba', 'sadzba €/h'],
    ['nastup', 'dátum nástupu'],
    ['pocet', 'počet ľudí'],
    ['doklad', 'názov dokladu'],
    ['datum', 'dátum'],
    ['obdobie', 'obdobie'],
    ['hodiny', 'počet hodín'],
    ['faktura', 'číslo faktúry'],
    ['suma', 'suma'],
    ['splatnost', 'dátum splatnosti'],
    ['tyzden', 'číslo týždňa (KW)'],
    ['kedy', 'kedy sa ozveme'],
  ];

  const RE = /\{\{\s*([a-zA-Z_]+)\s*\}\}/g;

  /**
   * Doplní zástupné miesta.
   *
   * Nevyplnené **nezmizne** — zostane v texte označené. Prázdne miesto by sa
   * prehliadlo a odišla by veta „sadzba  €/h"; takto je vidieť, čo chýba.
   *
   * @returns {{ text, missing: string[] }}
   */
  function fill(text, ctx = {}) {
    const missing = [];
    const out = String(text == null ? '' : text).replace(RE, (whole, key) => {
      const v = ctx[key];
      if (v === undefined || v === null || v === '') {
        if (!missing.includes(key)) missing.push(key);
        return whole;
      }
      return String(v);
    });
    return { text: out, missing };
  }

  /** Zástupné miesta, ktoré text používa. */
  function usedIn(text) {
    const out = [];
    String(text == null ? '' : text).replace(RE, (w, k) => {
      if (!out.includes(k)) out.push(k);
      return w;
    });
    return out;
  }

  /** Šablóna s doplnenými údajmi — predmet aj telo naraz. */
  function preview(template, ctx = {}) {
    if (!template) return { subject: '', body: '', missing: [] };
    const s = fill(template.subject || '', ctx);
    const b = fill(template.body || '', ctx);
    return {
      subject: s.text,
      body: b.text,
      missing: [...new Set([...s.missing, ...b.missing])],
    };
  }

  /** Šablóny, ktoré na daný záznam sedia. */
  function templatesFor(templates, { audience, channel = 'email' } = {}) {
    return (templates || [])
      .filter(t => t && t.active !== false)
      .filter(t => !channel || !t.channel || t.channel === channel)
      .filter(t => !audience || !t.audience || t.audience === audience)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) ||
        String(a.title || '').localeCompare(String(b.title || ''), 'sk'));
  }

  // ── Odosielanie ───────────────────────────────────────────────────────────
  /**
   * Smie sa to vôbec odoslať? Vracia dôvod, nie len `false` — človek má
   * vedieť, čo chýba, a nie hádať, prečo je tlačidlo šedé.
   */
  function canSend(cfg = {}) {
    if (!cfg.provider) {
      // Bez nadpisu „odosielanie nie je zapnuté" — ten si doplní obrazovka.
      // Keby bol aj tu, veta by sa zopakovala dvakrát za sebou.
      return { ok: false, reason: 'Chýba poskytovateľ a kľúč. Správa sa uloží '
        + 'do frontu a odíde, keď sa to nastaví.' };
    }
    if (!cfg.from) {
      return { ok: false, reason: 'Chýba adresa odosielateľa v Nastaveniach.' };
    }
    return { ok: true, reason: '' };
  }

  /** Dá sa táto konkrétna správa poslať? */
  function validate(msg = {}) {
    const problems = [];
    if (!String(msg.body || '').trim()) problems.push('Správa je prázdna.');
    if (msg.channel === 'email') {
      if (!String(msg.to_email || '').trim()) problems.push('Chýba adresa príjemcu.');
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(msg.to_email).trim())) {
        problems.push('Adresa príjemcu nevyzerá ako e-mail.');
      }
      if (!String(msg.subject || '').trim()) problems.push('Chýba predmet.');
    }
    if ((msg.channel === 'sms' || msg.channel === 'whatsapp')
        && !String(msg.to_phone || '').trim()) {
      problems.push('Chýba telefónne číslo.');
    }
    // Nevyplnené zástupné miesto by odišlo tak, ako je.
    const left = usedIn(`${msg.subject || ''} ${msg.body || ''}`);
    if (left.length) problems.push(`Nevyplnené: ${left.map(k => `{{${k}}}`).join(', ')}.`);
    return { ok: problems.length === 0, problems };
  }

  /** Stav správy po slovensky a vo farbe. */
  const STATUS = {
    draft: ['Koncept', 'gray'],
    queued: ['Čaká na odoslanie', 'amber'],
    sent: ['Odoslané', 'green'],
    failed: ['Neodoslané', 'red'],
    received: ['Prišlo', 'blue'],
    note: ['Poznámka', 'gray'],
  };
  function statusLabel(s) { return (STATUS[s] || [s || '—', 'gray'])[0]; }
  function statusKind(s) { return (STATUS[s] || ['', 'gray'])[1]; }

  /** Koľko správ čaká vo fronte a koľko sa nepodarilo odoslať. */
  function queueCounts(messages) {
    const m = (messages || []).filter(Boolean);
    return {
      queued: m.filter(x => x.status === 'queued').length,
      failed: m.filter(x => x.status === 'failed').length,
    };
  }

  /**
   * Vlákna s posledným riadkom a počtom správ. Zoradené podľa toho, kedy sa
   * v nich naposledy niečo dialo — nie podľa založenia.
   */
  function threadList(threads, messages) {
    const byThread = new Map();
    for (const m of (messages || [])) {
      if (!m || !m.thread_id) continue;
      if (!byThread.has(m.thread_id)) byThread.set(m.thread_id, []);
      byThread.get(m.thread_id).push(m);
    }
    return (threads || []).filter(Boolean).map(t => {
      const msgs = (byThread.get(t.id) || [])
        .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
      const last = msgs[msgs.length - 1] || null;
      return {
        ...t,
        messages: msgs,
        count: msgs.length,
        last,
        preview: last ? String(last.body || '').replace(/\s+/g, ' ').slice(0, 120) : '',
        waiting: msgs.some(x => x.status === 'queued'),
        failed: msgs.some(x => x.status === 'failed'),
      };
    }).sort((a, b) =>
      String(b.last_at || (b.last && b.last.created_at) || '')
        .localeCompare(String(a.last_at || (a.last && a.last.created_at) || '')));
  }

  const API = {
    PLACEHOLDERS, STATUS,
    fill, usedIn, preview, templatesFor,
    canSend, validate, statusLabel, statusKind, queueCounts, threadList,
  };
  if (typeof window !== 'undefined') window.DanubraMsg = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
