// ============================================================================
// DANUBRA — export
// ============================================================================
// Dve cesty, každá na niečo iné:
//
//   CSV  — keď sa s číslami ide ďalej pracovať (účtovník, Excel, banka).
//   PDF  — keď sa má niečo poslať alebo založiť tak, ako to vyzerá.
//
// **PDF sa robí tlačou prehliadača, nie knižnicou.** Knižnica na PDF má
// v JavaScripte 300–800 kB a appka nemá ani jednu cudziu závislosť okrem
// klienta Supabase a Leafletu. Tlač do PDF vie každý prehliadač aj telefón,
// výsledok je vektorový, má vyhľadateľný text a rešpektuje naše štýly.
// Príloha zadarmo: čo vidíš na obrazovke, to je v súbore.
//
// CSV má dve veci, na ktorých sa to bežne pokazí:
//   * **Bodkočiarka, nie čiarka.** Slovenský a nemecký Excel berie ako
//     oddeľovač bodkočiarku; s čiarkou skončí celý riadok v jednej bunke.
//   * **BOM na začiatku.** Bez neho Excel prečíta „Ján" ako „JÃ¡n".
//
// Testy: node app/lib/export.test.js
// ============================================================================
(function () {
  /**
   * Jedna bunka CSV. Úvodzovky sa zdvojujú, zalomenie riadku zostáva
   * vnútri úvodzoviek.
   *
   * Hodnota, ktorá začína `=`, `+`, `-` alebo `@`, sa v Exceli vyhodnotí
   * ako vzorec — to je stará a stále funkčná cesta, ako cez CSV spustiť
   * niečo na cudzom počítači. Predradí sa apostrof, takže sa zobrazí ako
   * text.
   *
   * Výnimkou je samotné záporné číslo. `-300,00` nie je vzorec a s apostrofom
   * by z neho v Exceli bol text — s ktorým sa nedá počítať. A záporných čísel
   * je v exporte plno: výdaje, marža v mínuse, rozdiel v cash-flow.
   */
  const NUMERIC = /^-?\d{1,15}([.,]\d+)?$/;

  function cell(value) {
    if (value == null) return '';
    let s = String(value);
    if (/^[=+\-@\t\r]/.test(s) && !NUMERIC.test(s)) s = `'${s}`;
    if (/[";\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  /** Číslo pre slovenský Excel — desatinná čiarka, bez oddeľovača tisícov. */
  function num(value, digits = 2) {
    if (value == null || value === '') return '';
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    return n.toFixed(digits).replace('.', ',');
  }

  /** Suma v centoch → text pre Excel. */
  function money(cents, digits = 2) { return num((Number(cents) || 0) / 100, digits); }

  /**
   * Zostaví CSV.
   * @param {Array<Array>} rows  prvý riadok sú hlavičky
   */
  function csv(rows) {
    return (rows || []).map(r => (r || []).map(cell).join(';')).join('\r\n');
  }

  /** Bezpečný názov súboru — bez diakritiky, medzier a lomiek. */
  function filename(parts, ext = 'csv') {
    const base = (Array.isArray(parts) ? parts : [parts])
      .filter(Boolean).join('-')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-').replace(/^-|-$/g, '')
      .toLowerCase() || 'export';
    return `${base}.${ext}`;
  }

  /**
   * Stiahne CSV. BOM je tam kvôli Excelu — bez neho sa diakritika rozsype.
   * Robí sa to cez `Blob` a odkaz, takže nič nejde na server.
   */
  function download(rows, nameParts) {
    const text = '﻿' + csv(rows);
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename(nameParts, 'csv');
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Bez uvoľnenia by odkaz držal súbor v pamäti do zatvorenia karty.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return a.download;
  }

  /**
   * PDF cez tlač. Trieda na `<html>` povie štýlom, čo sa má vytlačiť —
   * zvyšok obrazovky (menu, tlačidlá, filtre) na papier nepatrí.
   */
  function printArea(cls) {
    const root = document.documentElement;
    const mark = cls || 'print-all';
    root.classList.add('printing', mark);
    const done = () => {
      root.classList.remove('printing', mark);
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    // Poistka pre prehliadače, ktoré `afterprint` nepošlú.
    setTimeout(done, 60000);
    window.print();
  }

  const API = { cell, num, money, csv, filename, download, printArea };
  if (typeof window !== 'undefined') window.DanubraExport = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
