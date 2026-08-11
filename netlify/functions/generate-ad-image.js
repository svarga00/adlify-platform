// Vygeneruje obrázok pre jednu reklamu cez Google Gemini 3 Pro Image
// (Nano Banana 2). Vstup: { ad_id }. Načíta ad.image_prompt + brand kontext,
// pošle do Gemini API, výstup base64 PNG nahrá do Supabase Storage a uloží
// URL do ads.image_url.
//
// Cena: ~$0.04-0.10 per obrázok (Nano Banana 2).
// Latencia: 8-15s typicky, max ~25s. Beží synchrónne v normal function
// (Netlify limit 26s), user vidí spinner.
//
// Env vars:
// - GEMINI_API_KEY — z aistudio.google.com
// - SUPABASE_URL, SUPABASE_SERVICE_KEY — pre admin upload do Storage

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Gemini 3 Pro Image (Nano Banana 2)
const GEMINI_MODEL = 'gemini-3-pro-image-preview';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Missing GEMINI_API_KEY env var' }) };
  }

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Bad JSON' }) }; }

  const { ad_id } = payload;
  if (!ad_id) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing ad_id' }) };

  try {
    console.log('[gen-image] start ad', ad_id);

    // 1. Načítaj ad + kontext (brand farby majú vplyv na prompt)
    const { data: ad, error: adErr } = await supabase
      .from('ads').select('*').eq('id', ad_id).single();
    if (adErr || !ad) throw new Error('Reklama nenájdená');
    if (!ad.image_prompt || ad.image_prompt.trim().length < 20) {
      throw new Error('Reklama nemá image_prompt — najprv ho vygeneruj.');
    }

    const { data: ag } = await supabase.from('ad_groups')
      .select('campaign_id').eq('id', ad.ad_group_id).maybeSingle();
    const { data: campaign } = ag?.campaign_id
      ? await supabase.from('campaigns').select('project_id').eq('id', ag.campaign_id).maybeSingle()
      : { data: null };
    const projectId = campaign?.project_id;
    const { data: project } = projectId
      ? await supabase.from('campaign_projects').select('client_id').eq('id', projectId).maybeSingle()
      : { data: null };
    const { data: client } = project?.client_id
      ? await supabase.from('clients').select('brand_colors').eq('id', project.client_id).maybeSingle()
      : { data: null };

    const brandColors = Array.isArray(client?.brand_colors) ? client.brand_colors : [];
    const overlay = ad.image_text_overlay || {};
    const aspect = ad.image_aspect_ratio || '1:1';

    // 2. Postav finálny prompt — image_prompt z DB + reinforcement brand farieb
    const finalPrompt = [
      ad.image_prompt.trim(),
      brandColors.length > 0
        ? `\n\nIMPORTANT brand color palette to use prominently: ${brandColors.join(', ')}.`
        : '',
      overlay.headline
        ? `\nText overlay (must be clearly readable in image): headline "${overlay.headline}"${overlay.cta ? `, CTA button "${overlay.cta}"` : ''}.`
        : '',
      `\nAspect ratio: ${aspect}. High quality, advertising-grade visual.`,
    ].join('');

    console.log('[gen-image] prompt length:', finalPrompt.length);

    // 3. Volaj Gemini API
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
    const t0 = Date.now();
    const r = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: finalPrompt }] }],
        generationConfig: {
          responseModalities: ['IMAGE'],
          imageConfig: { aspectRatio: aspect },
        },
      }),
    });

    const j = await r.json();
    console.log('[gen-image] gemini status', r.status, 'in', Date.now() - t0, 'ms');

    if (!r.ok) {
      const msg = j?.error?.message || `Gemini API ${r.status}`;
      throw new Error('Gemini: ' + msg);
    }

    // Nájdi inlineData v candidates → parts
    const parts = j?.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find(p => p?.inlineData?.data);
    if (!imagePart) {
      // Niekedy Gemini vráti text dôvod (safety filter atď.)
      const reason = parts.find(p => p?.text)?.text || 'no image in response';
      throw new Error('Gemini nevrátil obrázok: ' + reason.slice(0, 200));
    }
    const mimeType = imagePart.inlineData.mimeType || 'image/png';
    const base64 = imagePart.inlineData.data;
    const buffer = Buffer.from(base64, 'base64');
    console.log('[gen-image] image bytes:', buffer.length);

    // 4. Upload do Supabase Storage
    const ext = mimeType.includes('jpeg') ? 'jpg' : mimeType.includes('webp') ? 'webp' : 'png';
    const ts = Date.now();
    const path = `ad-creatives/${projectId || 'unknown'}/${ad_id}-gen-${ts}.${ext}`;
    const { error: upErr } = await supabase.storage.from('assets')
      .upload(path, buffer, { cacheControl: '3600', upsert: false, contentType: mimeType });
    if (upErr) throw new Error('Storage upload: ' + upErr.message);

    const { data: urlData } = supabase.storage.from('assets').getPublicUrl(path);
    const publicUrl = urlData.publicUrl;
    console.log('[gen-image] uploaded:', publicUrl);

    // 5. Update DB
    const { error: updErr } = await supabase.from('ads').update({
      image_url: publicUrl,
      image_status: 'generated',
      updated_at: new Date().toISOString(),
    }).eq('id', ad_id);
    if (updErr) throw new Error('DB update: ' + updErr.message);

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        image_url: publicUrl,
        image_status: 'generated',
      }),
    };
  } catch (err) {
    console.error('[gen-image] error:', err);
    return {
      statusCode: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: err.message }),
    };
  }
};
