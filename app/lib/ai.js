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
  function body({ model, tool, prompt, maxTokens = 8000 }) {
    if (!model) throw new Error('Chýba model');
    if (!tool || !tool.name) throw new Error('Chýba nástroj');
    return {
      model,
      max_tokens: maxTokens,
      tools: [tool],
      messages: [{
        role: 'user',
        content: `${prompt}\n\nODPOVEDZ CEZ NÁSTROJ ${tool.name}. `
          + 'Nepíš nič pred ním ani za ním.',
      }],
    };
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

  const API = { body, pickTool, najdiJson, errorText };
  if (typeof window !== 'undefined') window.DanubraAi = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
