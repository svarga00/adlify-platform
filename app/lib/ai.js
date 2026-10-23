// ============================================================================
// DANUBRA — odpoveď modelu: ako sa z nej dostane to, čo sme pýtali
// ============================================================================
// Všetky štyri serverové funkcie, ktoré sa pýtajú modelu, mali tú istú chybu
// a ani jedna preto nefungovala:
//
//   tool_choice: { type: 'tool', name: '…' }
//   → „tool_choice: type "tool" and "any" are not supported for this model"
//
// Vynútiť si nástroj sa pri tomto modeli nedá. Keď sa to nedá vynútiť, treba
// počítať s tým, že model odpovie **textom** — a vtedy sa z neho má dať
// odpoveď aj tak vytiahnuť, nie spadnúť.
//
// Táto knižnica je to jediné miesto, kde je napísané, ako sa odpoveď číta.
// Bez nej by sa to opravilo na štyroch miestach a piate by sa zabudlo —
// presne tak, ako to bolo doteraz.
//
// Čisté funkcie, žiadne volanie siete. Sieť je vo funkciách; tu sú pravidlá.
// Testy: node app/lib/ai.test.js
// ============================================================================
(function () {
  /**
   * Telo požiadavky. Zámerne **bez `tool_choice`**: tento model ho v tvare
   * „tool" ani „any" neprijme a celé volanie zlyhá skôr, než sa model na
   * zadanie vôbec pozrie.
   *
   * Namiesto vynútenia sa modelu v texte povie, že odpoveď má poslať cez
   * nástroj. V praxi to stačí; keby raz nie, `pickTool` to podchytí.
   */
  function body({ model, tool, prompt, maxTokens = 8000, docs = null }) {
    if (!model) throw new Error('Chýba model');
    if (!tool || !tool.name) throw new Error('Chýba nástroj');
    const text = `${prompt}\n\nODPOVEDZ CEZ NÁSTROJ ${tool.name}. `
      + 'Nepíš nič pred ním ani za ním.';
    return {
      model,
      max_tokens: maxTokens,
      tools: [tool],
      messages: [{
        role: 'user',
        // Prílohy (PDF, fotka) idú pred zadanie — model si ich najprv prečíta.
        content: Array.isArray(docs) && docs.length
          ? [...docs, { type: 'text', text }] : text,
      }],
    };
  }

  /**
   * Príloha pre model zo súboru v base64: PDF ako dokument, fotka ako
   * obrázok. Iný typ → null (model by ho neprečítal).
   */
  function attachment(base64, mediaType) {
    const t = String(mediaType || '').toLowerCase();
    if (!base64) return null;
    if (t === 'application/pdf') {
      return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } };
    }
    if (['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(t)) {
      return { type: 'image', source: { type: 'base64', media_type: t, data: base64 } };
    }
    return null;
  }

  /**
   * Čo model vrátil. Hľadá sa v tomto poradí:
   *
   *   1. **použitý nástroj** — tak to má vyzerať a takmer vždy aj vyzerá,
   *   2. **JSON v texte** — model niekedy odpovie textom, v ktorom je ten istý
   *      objekt (často v bloku ```json). Zahodiť ho preto, že neprišiel
   *      správnou cestou, by bola škoda: obsah je v poriadku.
   *
   * Keď nie je ani jedno, vráti `null` — volajúci povie zrozumiteľnú chybu.
   * Nikdy nevyhadzuje výnimku: odpoveď modelu je cudzí vstup.
   */
  function pickTool(data, name) {
    const content = (data && Array.isArray(data.content)) ? data.content : [];

    const use = content.find(c => c && c.type === 'tool_use'
      && (!name || c.name === name) && c.input && typeof c.input === 'object');
    if (use) return use.input;

    for (const c of content) {
      if (!c || c.type !== 'text' || typeof c.text !== 'string') continue;
      const json = najdiJson(c.text);
      if (json) return json;
    }
    return null;
  }

  /**
   * Prvý objekt JSON v texte. Berie sa blok ```json, inak sa hľadá od prvej
   * zloženej zátvorky a páruje sa — `JSON.parse` na celý text by zlyhal na
   * vete, ktorú model napísal okolo.
   */
  function najdiJson(text) {
    const blok = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const kandidati = [];
    if (blok) kandidati.push(blok[1]);
    const zac = text.indexOf('{');
    if (zac >= 0) {
      let hlbka = 0, vReťazci = false, escape = false;
      for (let i = zac; i < text.length; i++) {
        const ch = text[i];
        if (escape) { escape = false; continue; }
        if (ch === '\\') { escape = true; continue; }
        if (ch === '"') { vReťazci = !vReťazci; continue; }
        if (vReťazci) continue;
        if (ch === '{') hlbka++;
        else if (ch === '}') {
          hlbka--;
          if (hlbka === 0) { kandidati.push(text.slice(zac, i + 1)); break; }
        }
      }
    }
    for (const k of kandidati) {
      try {
        const v = JSON.parse(k);
        if (v && typeof v === 'object' && !Array.isArray(v)) return v;
      } catch { /* skúsi sa ďalší */ }
    }
    return null;
  }

  /**
   * Chyba z odpovede API, povedaná tak, aby sa z nej dalo niečo spraviť.
   * „Analýza zlyhala (400)" nikomu nepovie, že vypršal kredit.
   */
  function errorText(data, status, co) {
    const m = data && data.error && data.error.message;
    if (m) return m;
    if (status === 401 || status === 403) return 'Kľúč k modelu neplatí alebo nemá právo.';
    if (status === 429) return 'Model je práve zahltený — skús o chvíľu.';
    if (status >= 500) return 'Model má výpadok — skús o chvíľu.';
    // Pozor na skloňovanie: „Analýza zlyhalo" je nezmysel. `co` je preto
    // nálepka pred vetou, nie podmet v nej.
    return `${co ? co + ' — ' : ''}volanie modelu zlyhalo (${status}).`;
  }

  /**
   * Prečíta streamovanú odpoveď (SSE) a poskladá z nej celú správu — tú istú,
   * akú by vrátilo volanie bez streamu. Stream sa používa pri dlhých
   * volaniach (hľadanie na webe trvá minúty), aby spojenie nespadlo na čakaní
   * na prvú odpoveď.
   *
   * @param {AsyncIterable<Uint8Array>|ReadableStream} stream telo odpovede
   * @returns {Promise<Object>} { content, stop_reason, usage, model }
   */
  async function readStream(stream) {
    const msg = { content: [], stop_reason: null, usage: {}, model: null };
    const partial = new Map();
    let buf = '';
    const dec = new TextDecoder();
    const handle = (ev) => {
      if (!ev || !ev.type) return;
      if (ev.type === 'message_start' && ev.message) {
        msg.model = ev.message.model; msg.usage = ev.message.usage || {}; msg.id = ev.message.id;
      } else if (ev.type === 'content_block_start') {
        msg.content[ev.index] = { ...ev.content_block };
      } else if (ev.type === 'content_block_delta') {
        const b = msg.content[ev.index]; const d = ev.delta || {};
        if (!b) return;
        if (d.type === 'text_delta') b.text = (b.text || '') + d.text;
        else if (d.type === 'input_json_delta') partial.set(ev.index, (partial.get(ev.index) || '') + d.partial_json);
        else if (d.type === 'thinking_delta') b.thinking = (b.thinking || '') + d.thinking;
        else if (d.type === 'signature_delta') b.signature = (b.signature || '') + d.signature;
        else if (d.type === 'citations_delta' && d.citation) (b.citations = b.citations || []).push(d.citation);
      } else if (ev.type === 'content_block_stop') {
        const b = msg.content[ev.index];
        if (b && partial.has(ev.index)) {
          const raw = partial.get(ev.index);
          try { b.input = raw ? JSON.parse(raw) : {}; } catch { b.input = najdiJson(raw) || {}; }
          partial.delete(ev.index);
        }
      } else if (ev.type === 'message_delta') {
        if (ev.delta && ev.delta.stop_reason) msg.stop_reason = ev.delta.stop_reason;
        if (ev.delta && ev.delta.stop_details) msg.stop_details = ev.delta.stop_details;
        if (ev.usage) msg.usage = { ...msg.usage, ...ev.usage };
      } else if (ev.type === 'error') {
        msg.error = ev.error || { message: 'chyba v streame' };
      }
    };
    const feed = (text) => {
      buf += text;
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
        const data = chunk.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('');
        if (!data || data === '[DONE]') continue;
        try { handle(JSON.parse(data)); } catch { /* neúplná udalosť sa preskočí */ }
      }
    };
    if (stream && typeof stream.getReader === 'function') {
      const r = stream.getReader();
      for (;;) { const { value, done } = await r.read(); if (done) break; feed(dec.decode(value, { stream: true })); }
    } else {
      for await (const part of stream) feed(typeof part === 'string' ? part : dec.decode(part, { stream: true }));
    }
    feed('\n\n');
    msg.content = msg.content.filter(Boolean);
    return msg;
  }

  const API = { body, attachment, pickTool, najdiJson, errorText, readStream };
  if (typeof window !== 'undefined') window.DanubraAi = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
