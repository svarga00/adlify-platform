// ============================================================================
// DANUBRA — návod k appke ako PDF a ťahák na jednu stranu A4
// ============================================================================
// Obsah je v lib/guide.js (DanubraGuide) — tu sa len skladá papier v podobe
// punds, rovnakou hlavičkou a pätou ako ostatné dokumenty. Nič sa tu
// nevymýšľa: čo nie je v návode, nie je ani na papieri.
// ============================================================================
(function () {
  const isNode = typeof module !== 'undefined' && module.exports;
  const P = () => (isNode ? require('./templates') : window.DanubraPapers);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const CSS = `
    .gd-toc { columns: 2; column-gap: 24px; margin: 6px 0 14px; padding: 0; list-style: none; font-size: 12.5px; }
    .gd-toc li { padding: 3px 0; break-inside: avoid; }
    .gd-toc b { color: #F07F1A; margin-right: 6px; }
    .gd-ch { margin-top: 18px; }
    .gd-ch > h2 { font-size: 17px; margin: 0 0 4px; }
    .gd-ch > h2 b { color: #F07F1A; margin-right: 6px; }
    .gd-lead { color: #4A5468; font-size: 12.5px; margin: 0 0 10px; }
    .gd-step { border-left: 3px solid #F07F1A; padding: 6px 0 6px 12px; margin: 0 0 10px; break-inside: avoid; }
    .gd-step h3 { font-size: 13.5px; margin: 0 0 3px; }
    .gd-step p { margin: 0 0 4px; font-size: 12.5px; }
    .gd-step ol { margin: 2px 0 4px 18px; padding: 0; font-size: 12.5px; }
    .gd-step li { margin: 1px 0; }
    .gd-tip { background: #FDF1E6; border-radius: 3px; padding: 5px 8px; font-size: 12px; margin-top: 4px; }
    .gd-ex { color: #6F7A92; font-size: 11.5px; font-style: italic; margin-top: 3px; }
    .gd-gl { display: grid; grid-template-columns: 150px 1fr; gap: 4px 12px; font-size: 12px; }
    .gd-gl dt { font-weight: 700; }
    .gd-gl dd { margin: 0; color: #4A5468; }
    .ch-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 6px; }
    .ch-box { border: 1px solid #D9DEE7; border-radius: 4px; padding: 10px 12px; break-inside: avoid; }
    .ch-box h2 { font-size: 14px; margin: 0 0 6px; display: flex; align-items: center; gap: 8px; }
    .ch-box h2 i { width: 9px; height: 9px; border-radius: 50%; background: #F07F1A; display: inline-block; }
    .ch-box.never h2 i { background: #C0392B; }
    .ch-box ul { margin: 0; padding-left: 16px; font-size: 12px; line-height: 1.5; }
    .ch-box li { margin: 2px 0; }
  `;

  const steps = (ch, ci) => (ch.steps || []).map((s, si) => `
    <div class="gd-step">
      <h3>${ci + 1}.${si + 1} ${esc(s.title)}</h3>
      ${s.what ? `<p>${esc(s.what)}</p>` : ''}
      ${(s.how || []).length ? `<ol>${s.how.map(h => `<li>${esc(h)}</li>`).join('')}</ol>` : ''}
      ${s.tip ? `<div class="gd-tip"><strong>Pozor:</strong> ${esc(s.tip)}</div>` : ''}
      ${s.example ? `<div class="gd-ex">Príklad: ${esc(s.example)}</div>` : ''}
    </div>`).join('');

  /** Celý návod ako dokument (viac strán A4). */
  function guidePdf({ guide, supplier } = {}) {
    const G = guide || {};
    const ch = G.CHAPTERS || [];
    const body = `
      ${P().header('Návod k appke', 'DANUBRA Hub', ['Pre kolegov v kancelárii'], supplier)}
      <div class="note info">Návod ide krok za krokom tak, ako ide práca: od dopytu nemeckej firmy
        po zaplatenú faktúru. Pri každom kroku je napísané, kam v appke kliknúť. Pri každom poli
        a tlačidle, pri ktorom môže byť pochybnosť, je v appke aj otáznik s vysvetlením.</div>
      <h2 class="ss-h">Obsah</h2>
      <ol class="gd-toc">${ch.map((c, i) => `<li><b>${i + 1}</b>${esc(c.title)}</li>`).join('')}
        ${(G.GLOSSARY || []).length ? `<li><b>${ch.length + 1}</b>Slovníček pojmov</li>` : ''}</ol>
      ${ch.map((c, i) => `<section class="gd-ch">
        <h2 class="ss-h"><b>${i + 1}</b>${esc(c.title)}</h2>
        ${c.lead ? `<p class="gd-lead">${esc(c.lead)}</p>` : ''}
        ${steps(c, i)}
      </section>`).join('')}
      ${(G.GLOSSARY || []).length ? `<section class="gd-ch"><h2 class="ss-h"><b>${ch.length + 1}</b>Slovníček pojmov</h2>
        <dl class="gd-gl">${G.GLOSSARY.map(g => `<dt>${esc(g.term)}</dt><dd>${esc(g.text)}</dd>`).join('')}</dl></section>` : ''}
      ${P().foot(supplier)}`;
    return P().shell('Návod k appke DANUBRA Hub', body, { css: CSS, editable: false });
  }

  /** Ťahák: jedna strana A4 — čo robiť každý deň, týždeň, mesiac a čo nikdy. */
  function cheatSheet({ guide, supplier } = {}) {
    const C = (guide && guide.CHEAT) || {};
    const box = (cls, title, list) => (list && list.length ? `<div class="ch-box ${cls}">
      <h2><i></i>${esc(title)}</h2><ul>${list.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '');
    const body = `
      ${P().header('Ťahák', 'DANUBRA Hub', ['Na jednu stranu — zaveste si ho'], supplier)}
      <div class="ch-grid">
        ${box('daily', 'Každý deň', C.daily)}
        ${box('weekly', 'Každý týždeň', C.weekly)}
        ${box('monthly', 'Každý mesiac', C.monthly)}
        ${box('never', 'Nikdy', C.never)}
      </div>
      <div class="note info" style="margin-top:12px">Keď si nie ste istí: kliknite na otáznik pri poli
        alebo tlačidle. Celý návod je v appke v menu Dnes → Návod.</div>
      ${P().foot(supplier)}`;
    return P().shell('Ťahák DANUBRA Hub', body, { css: CSS, editable: false });
  }

  const API = { guidePdf, cheatSheet };
  if (typeof window !== 'undefined') window.DanubraGuideDoc = API;
  if (isNode) module.exports = API;
})();
