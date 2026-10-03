// ============================================================================
// DANUBRA — inzeráty a otázky do hovoru
// ============================================================================
// Hovor sa nezačína menom, ale otázkou **na ktorý inzerát voláte**. Od toho
// sa odvíja zvyšok: aké remeslo, do akého mesta, akú sadzbu sme sľúbili
// a na čo sa treba pýtať.
//
// Znie to ako detail, ale je to opačné poradie, než aké sa robí zvyčajne.
// Keď sa to nezistí, hovor sa začne otázkou „a čo vlastne hľadáte?" — pritom
// my sme toho človeka oslovili a my máme vedieť čím.
//
// Druhá polovica je o otázkach. Doteraz boli len na čítanie v Remeslách
// a do hovoru sa nedostali vôbec — pritom práve pri telefóne sú užitočné.
// Tu sa triedia tak, aby pri každej časti hovoru boli tie, ktoré k nej patria.
//
// Testy: node app/lib/recruiting/ads.test.js
// ============================================================================
(function () {
  const day = (s) => (s ? String(s).slice(0, 10) : null);
  const today0 = () => new Date().toISOString().slice(0, 10);

  /** Kde inzerát beží. Kanál rozhoduje o tom, čo sa dá čakať za ľudí. */
  const CHANNELS = [
    ['facebook', 'Facebook'],
    ['portal', 'Pracovný portál'],
    ['referral', 'Odporúčanie'],
    ['print', 'Tlač a letáky'],
    ['other', 'Iné'],
  ];

  function channelLabel(key) {
    const c = CHANNELS.find(x => x[0] === key);
    return c ? c[1] : (key || '—');
  }

  /**
   * Beží inzerát dnes? Vypnutý nebeží nikdy; termíny platia, keď sú zadané.
   * Inzerát bez termínov beží, kým ho niekto nevypne.
   */
  function isRunning(ad, today = today0()) {
    if (!ad || ad.active === false) return false;
    const t = day(today);
    if (day(ad.starts_on) && day(ad.starts_on) > t) return false;
    if (day(ad.ends_on) && day(ad.ends_on) < t) return false;
    return true;
  }

  /**
   * Inzeráty na výber v hovore. Bežiace hore, v rámci toho najnovšie —
   * človek volá skoro vždy na to, čo práve visí.
   *
   * Dobehnuté sa nevyhadzujú: ozvať sa môže aj o mesiac a treba vedieť,
   * čo čítal.
   */
  function forCall(ads, today = today0()) {
    return (ads || []).filter(Boolean)
      .map(a => ({ ...a, running: isRunning(a, today) }))
      .sort((a, b) =>
        (b.running ? 1 : 0) - (a.running ? 1 : 0) ||
        String(b.starts_on || b.created_at || '').localeCompare(String(a.starts_on || a.created_at || '')) ||
        String(a.title || '').localeCompare(String(b.title || ''), 'sk'));
  }

  /**
   * Čo sme v inzeráte sľúbili, ako vety. Sadzba je prvá — je to tá vec,
   * kvôli ktorej ľudia volajú a kvôli ktorej sa potom hádajú.
   */
  function promiseLines(ad) {
    if (!ad) return [];
    const out = [];
    if (ad.rate_offered) {
      out.push(`${String(ad.rate_offered).replace('.', ',')} €/h`);
    }
    for (const p of (ad.promise || [])) {
      if (p && String(p).trim()) out.push(String(p).trim());
    }
    return out;
  }

  /** Krátky popis inzerátu do zoznamu: kanál, mesto, sadzba. */
  function subtitle(ad) {
    if (!ad) return '';
    return [
      channelLabel(ad.channel),
      ad.channel_detail,
      ad.city,
      ad.rate_offered ? `${String(ad.rate_offered).replace('.', ',')} €/h` : null,
    ].filter(Boolean).join(' · ');
  }

  // ── Otázky ────────────────────────────────────────────────────────────────
  /**
   * Do ktorej časti hovoru otázka patrí. Keď to nie je zadané, odvodí sa
   * z druhu — inak by nová otázka spadla mimo hovoru a nikto by ju nevidel.
   */
  const KIND_SEGMENT = {
    knowledge: 'trade',
    hidden: 'verify',
    legal: 'legal',
    logistics: 'logistics',
    motivation: 'money',
  };

  function questionSegment(q) {
    if (!q) return 'trade';
    if (q.segment) return q.segment;
    return KIND_SEGMENT[q.kind] || 'trade';
  }

  /**
   * Otázky, ktoré na tento hovor sedia.
   *
   * Univerzálna otázka (bez remesla) platí vždy. Otázka k remeslu platí pri
   * tom remesle. Otázka k inzerátu platí len pri ňom — a zároveň má prednosť,
   * lebo je najkonkrétnejšia.
   */
  function questionsFor(o = {}) {
    const { questions = [], tradeKey = null, adId = null, phase = 'phone' } = o;
    return questions
      .filter(q => q && q.active !== false)
      .filter(q => !phase || !q.phase || q.phase === phase)
      .filter(q => {
        if (q.ad_id) return q.ad_id === adId;
        if (q.trade_key) return q.trade_key === tradeKey;
        return true;
      })
      .sort((a, b) =>
        (b.ad_id ? 1 : 0) - (a.ad_id ? 1 : 0) ||
        (b.trade_key ? 1 : 0) - (a.trade_key ? 1 : 0) ||
        (b.weight || 1) - (a.weight || 1) ||
        (a.sort_order || 0) - (b.sort_order || 0));
  }

  /**
   * Prilepí otázky k častiam hovoru. Segment, ktorý mal polia, ich má stále;
   * segment, ktorý mal len otázky, sa objaví tiež — inak by otázka bez
   * zaškrtávacieho poľa zmizla.
   *
   * @param {Array} segments z `DanubraChips.buildCallSegments`
   * @param {Array} questions už prefiltrované cez `questionsFor`
   * @param {Array} order  poradie segmentov (kľúče), keď treba doplniť chýbajúce
   */
  function withQuestions(segments, questions, order = []) {
    const bySeg = new Map();
    for (const q of (questions || [])) {
      const k = questionSegment(q);
      if (!bySeg.has(k)) bySeg.set(k, []);
      bySeg.get(k).push(q);
    }
    const out = (segments || []).map(s => ({ ...s, questions: bySeg.get(s.key) || [] }));
    const have = new Set(out.map(s => s.key));

    // Segment, ktorý má otázky, ale žiadne polia, treba doplniť — a na to
    // miesto, kam v hovore patrí, nie na koniec.
    const extra = [...bySeg.keys()].filter(k => !have.has(k));
    for (const k of extra) {
      const at = order.indexOf(k);
      const seg = { key: k, title: k, lead: '', chips: [], questions: bySeg.get(k) };
      if (at < 0) { out.push(seg); continue; }
      const before = out.findIndex(s => order.indexOf(s.key) > at);
      if (before < 0) out.push(seg); else out.splice(before, 0, seg);
    }
    return out;
  }

  /**
   * Ako sa inzerátu darí. `responded` je to, čo sa dá porovnávať medzi
   * inzerátmi — počet ľudí je závislý od toho, ako dlho bežal.
   */
  function performance(row) {
    const c = Number(row && row.candidates) || 0;
    const hired = Number(row && row.hired) || 0;
    const contacted = Number(row && row.contacted) || 0;
    return {
      candidates: c, contacted, hired,
      // Koľkým z tých, čo sa ozvali, sme sa stihli ozvať späť. Cieľ je všetkým.
      contactRate: c ? Math.round((contacted / c) * 100) : null,
      hireRate: c ? Math.round((hired / c) * 100) : null,
    };
  }


  /**
   * Odkiaľ ľudia naozaj prišli.
   *
   * Doteraz sa to zoskupovalo podľa `source` na kandidátovi — voľného poľa,
   * ktoré hovor nikdy nevyplnil, takže na obrazovke stálo „Iné: 2" a nedalo
   * sa z toho nič prečítať. Pritom hovor sa začína otázkou, **na ktorý
   * inzerát voláte**, a `ad_id` zapisuje.
   *
   * Zoskupuje sa teda podľa inzerátu. Kto prišiel inak (odporúčanie, cez
   * známeho), spadne pod svoj kanál — ale zvlášť, aby bolo vidieť, koľko
   * ľudí appka nevie priradiť.
   *
   * Zoradené podľa **nastúpených**, nie podľa počtu ozvaní. Inzerát, na
   * ktorý sa ozve tridsať ľudí a nikto nenastúpi, nie je lepší než ten,
   * z ktorého prídu dvaja a obaja robia.
   *
   * @returns {Array} [{ key, label, sub, kind, total, contacted, placed, hireRate }]
   */
  function funnel(candidates, ads, { placedStatus = 'placed' } = {}) {
    const byId = new Map((ads || []).filter(Boolean).map(a => [a.id, a]));
    const rows = new Map();

    const add = (key, label, sub, kind, c) => {
      if (!rows.has(key)) {
        rows.set(key, { key, label, sub, kind, total: 0, contacted: 0, placed: 0 });
      }
      const r = rows.get(key);
      r.total += 1;
      if (c.first_contact_at) r.contacted += 1;
      if (c.status === placedStatus) r.placed += 1;
    };

    for (const c of (candidates || [])) {
      if (!c) continue;
      const ad = c.ad_id ? byId.get(c.ad_id) : null;
      if (ad) {
        add(`ad:${ad.id}`, ad.title || 'Inzerát bez názvu',
          channelLabel(ad.channel), 'ad', c);
      } else {
        // Bez inzerátu: aspoň kanál. „Neuvedený" je tiež odpoveď — a je to
        // tá, pri ktorej treba zbystriť, lebo z nej sa nedá nič vyhodnotiť.
        const k = c.source || 'unknown';
        add(`src:${k}`, k === 'unknown' ? 'Bez inzerátu' : channelLabel(k),
          k === 'unknown' ? 'nevieme, odkiaľ prišli' : 'mimo inzerátov', 'source', c);
      }
    }

    return [...rows.values()]
      .map(r => ({
        ...r,
        hireRate: r.total ? Math.round((r.placed / r.total) * 100) : null,
        contactRate: r.total ? Math.round((r.contacted / r.total) * 100) : null,
      }))
      .sort((a, b) => b.placed - a.placed || b.total - a.total
        || String(a.label).localeCompare(String(b.label), 'sk'));
  }

  /** Jedna veta pod graf — nie preto, aby tam niečo bolo, ale aby sa to dalo čítať. */
  function funnelSentence(rows) {
    const r = rows || [];
    if (!r.length) return '';
    const bez = r.find(x => x.key === 'src:unknown');
    const najlepsi = r.find(x => x.kind === 'ad' && x.placed > 0);
    if (najlepsi) {
      return `Najviac ľudí nastúpilo z inzerátu „${najlepsi.label}" — ${
        najlepsi.placed} z ${najlepsi.total}.`
        + (bez ? ` Pri ${bez.total} ${
          bez.total === 1 ? 'človeku' : 'ľuďoch'} nevieme, odkiaľ prišli.` : '');
    }
    if (bez && bez.total === r.reduce((s, x) => s + x.total, 0)) {
      return 'Pri nikom zatiaľ nevieme, z ktorého inzerátu prišiel — '
        + 'väzba vzniká pri hovore, keď sa vyberie inzerát.';
    }
    return 'Zatiaľ nikto nenastúpil, takže sa inzeráty ešte nedajú porovnať.';
  }

  const API = {
    CHANNELS, channelLabel, isRunning, forCall, promiseLines, subtitle,
    KIND_SEGMENT, questionSegment, questionsFor, withQuestions, performance,
    funnel, funnelSentence,
  };
  if (typeof window !== 'undefined') window.DanubraAds = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
