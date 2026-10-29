// ============================================================================
// DANUBRA — podklady k náboru na pozadí
// ============================================================================
// Texty do šiestich kanálov a otázky do telefonátu sa píšu minútu aj dve.
// Bežná funkcia na Netlify skončí skôr a prehliadač dostane 504 — podklady sa
// nepripravia a nikto nevie prečo. Stalo sa to pri prvom ostrom dopyte.
//
// Funkcia s príponou `-background` beží na pozadí až pätnásť minút. Netlify
// prehliadaču hneď odpovie 202 („prijaté") a výsledok sa zapíše do náboru
// (`analysis._job`). Appka sa každých pár sekúnd pozrie, či je hotovo
// (`Kit.runAnalysis`).
//
// Samotná analýza je v `danubra-analyze-brief.js` — jedna, nie dve kópie.
// ============================================================================
const { run, setJob, guard } = require('./danubra-analyze-brief.js');

exports.handler = async (event) => {
  let planId = null, job = null, regen = false;
  try {
    ({ planId, job, regen } = JSON.parse(event.body || '{}'));
  } catch { return; }
  if (!planId || !job) return;
  // Platený model + zápis do náboru — len prihlásený člen appky.
  // Kto nie je člen, nesmie do náboru zapísať ani chybu.
  const g = await guard.check(event);
  if (!g.ok) return;

  const started_at = new Date().toISOString();
  await setJob(planId, { id: job, status: 'running', started_at });
  try {
    const out = await run(planId, { regen: !!regen });
    await setJob(planId, { id: job, status: 'done', started_at,
      finished_at: new Date().toISOString(), ...out });
  } catch (e) {
    await setJob(planId, { id: job, status: 'error', started_at,
      finished_at: new Date().toISOString(), error: String((e && e.message) || e) });
  }
};
