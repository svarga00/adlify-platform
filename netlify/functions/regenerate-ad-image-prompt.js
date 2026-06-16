// Micro-regenerate len image_prompt + image_style_notes pre jednu reklamu.
// Žiadne Claude calls pre strategy/google/meta — len 1 short call s
// aktuálnym stavom reklamy (headlines/desc/overlay/format/brand).
//
// POST { ad_id, project_id }
// Vracia: { success: true, image_prompt: "...", image_style_notes: "..." }
//
// Cena: ~$0.01 per call (Sonnet 4.6, ~2000 input + 300 output tokens)
// vs ~$0.50 za celé pregenerovanie projektu.

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

const fmt = (v) => v == null || v === '' ? '—' : (typeof v === 'object' ? JSON.stringify(v) : String(v));

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Bad JSON' }) }; }

  const { ad_id, project_id } = payload;
  if (!ad_id) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing ad_id' }) };

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Missing ANTHROPIC_API_KEY' }) };

  try {
    // Načítaj ad + jej ad_group + campaign + projekt + klienta s brand
    const { data: ad, error: adErr } = await supabase.from('ads').select('*').eq('id', ad_id).single();
    if (adErr || !ad) throw new Error('Reklama nenájdená');

    const { data: ag } = await supabase.from('ad_groups').select('*').eq('id', ad.ad_group_id).maybeSingle();
    const { data: campaign } = ag?.campaign_id
      ? await supabase.from('campaigns').select('*').eq('id', ag.campaign_id).maybeSingle()
      : { data: null };
    const projectId = project_id || campaign?.project_id;
    const { data: project } = projectId
      ? await supabase.from('campaign_projects').select('*').eq('id', projectId).maybeSingle()
      : { data: null };
    const { data: client } = project?.client_id
      ? await supabase.from('clients').select('company_name, industry, website, brand_colors, brand_font, brand_voice_notes').eq('id', project.client_id).maybeSingle()
      : { data: null };

    // Onboarding pre context
    let onboarding = null;
    if (project?.client_id) {
      const { data: oRow } = await supabase.from('onboarding_responses').select('data').eq('client_id', project.client_id).order('updated_at', { ascending: false }).limit(1).maybeSingle();
      onboarding = oRow?.data || {};
    }

    const overlay = ad.image_text_overlay || {};
    const brandColors = Array.isArray(client?.brand_colors) ? client.brand_colors : [];

    const prompt = `Si senior creative director pre marketingovú agentúru Adlify. Vyrobíš SAMOSTATNÝ image prompt pre jednu reklamu — žiadne kampaňové stratégie, len 1 obrázkový prompt.

## KONTEXT REKLAMY
- Klient: ${fmt(client?.company_name)} (${fmt(client?.industry || onboarding?.company_industry)})
- Web: ${fmt(client?.website || onboarding?.company_website)}
- Kampaň: ${fmt(campaign?.name)} (${fmt(campaign?.platform)}, typ ${fmt(campaign?.campaign_type)})
- Ad group: ${fmt(ag?.name)} — ${fmt(ag?.theme)}
- Variant: ${fmt(ad.variant_label)} ${ad.variant_hook ? `(hook: ${ad.variant_hook})` : ''}

## HEADLINES (čo má reklama predať)
${(ad.headlines || []).slice(0, 5).map(h => `- ${h}`).join('\n') || '—'}

## DESCRIPTIONS
${(ad.descriptions || []).slice(0, 3).map(d => `- ${d}`).join('\n') || '—'}

## TEXT OVERLAY (čo bude NA obrázku — admin upravil)
- Hook: ${fmt(overlay.headline)}
- CTA: ${fmt(overlay.cta)}
- Pozícia: ${fmt(overlay.position)} — copy_space TU musí byť v image_prompte
- Farba textu: ${fmt(overlay.color)}

## FORMAT & ASPECT
- Format: ${fmt(ad.image_format)}
- Aspect ratio: ${fmt(ad.image_aspect_ratio)}

## BRAND
${brandColors.length > 0 ? `- Brand farby (POVINNE v color palette): ${brandColors.join(', ')}` : '- Brand farby: nedefinované, použij univerzálne'}
- Tón: ${fmt(onboarding?.brand_tone_of_voice)}
- Štýl reklám: ${fmt(onboarding?.preferred_ad_style)}
${client?.brand_voice_notes ? `- Brand voice notes: ${client.brand_voice_notes}` : ''}

## USP klienta (cituj v MOOD/atmosfére obrazku)
${(onboarding?.unique_selling_points || []).map(u => `- ${u}`).join('\n') || '—'}

## ÚLOHA
Vyrob 60-100 slovný EN image prompt pre ${ad.image_format || 'photo'} (aspect ${ad.image_aspect_ratio || '1:1'}) ktorý INCLUDES TEXT OVERLAY priamo v obrázku — Nano Banana 2 generuje text v obrázku dobre, takže ho začleni do prompt-u.

1. Scéna podporujúca HEADLINES vyššie
2. EXPLICIT TEXT v obrázku:
   ${overlay.headline ? `- Headline text "${overlay.headline}" pozícia ${overlay.position || 'top-right'}, ${overlay.color || 'white'} farba, bold sans-serif font` : ''}
   ${overlay.cta ? `- CTA text "${overlay.cta}" bottom-center na pill button (kontrastná farba)` : ''}
3. Brand farby v color palette ${brandColors.length > 0 ? `(POVINNE: ${brandColors.join(', ')})` : '(univerzálne)'}
4. Štýl ${ad.image_format || 'photo'} — photo = realistic photography, illustration = vector/flat clean, 3d_render = stylized 3D, minimal_banner = abstract geometric, cinematic = movie-like dramatic, lifestyle = natural everyday situation
5. POVINNÉ na konci: "no logos, no watermarks, no people faces clearly visible, --ar ${ad.image_aspect_ratio || '1:1'}"
6. NEUVÁDZAJ "no text" — text je súčasť obrázka

Format prompt-u: [ŠTÝL]: ... [SCÉNA]: ... [SUBJEKT]: ... [TEXT OVERLAY]: bold sans-serif "${overlay.headline || 'HEADLINE'}" ${overlay.position || 'top-right'}, plus pill "${overlay.cta || 'CTA'}" bottom-center ... [KOMPOZÍCIA]: rule of thirds + text-friendly background area ... [LIGHTING]: ... [KAMERA] (pre photo): shot on Canon EOS R5 50mm f/1.8 shallow DOF ... [PALETA]: ${brandColors.length > 0 ? brandColors.join(' + ') + ' (brand)' : '2-3 dominantné farby'} ... [MOOD]: ... + negatívne na konci.

Vráť LEN JSON v tomto formáte:
{
  "image_prompt": "Professional advertising photography, ...",
  "image_style_notes": "SK krátky tip pre dizajnéra na úpravy (color grading, light leak, atď.)"
}

LEN JSON, žiadny text okolo, žiadne markdown fence.`;

    console.log('[regen-image-prompt] calling Claude for ad', ad_id);
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const j = await r.json();
    if (j.error) throw new Error('Claude API: ' + j.error.message);
    const text = j.content?.[0]?.text || '';
    console.log('[regen-image-prompt] response length:', text.length);

    // Parse JSON (tolerantne — môže byť obalené)
    let doc;
    try { doc = JSON.parse(text); }
    catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('Nepodarilo sa parsovať Claude odpoveď');
      doc = JSON.parse(m[0]);
    }

    if (!doc.image_prompt) throw new Error('Claude nevrátil image_prompt');

    // Update DB
    const updates = {
      image_prompt: doc.image_prompt,
      updated_at: new Date().toISOString(),
    };
    if (doc.image_style_notes) updates.image_style_notes = doc.image_style_notes;

    const { error: updErr } = await supabase.from('ads').update(updates).eq('id', ad_id);
    if (updErr) throw updErr;

    console.log('[regen-image-prompt] ✓ updated ad', ad_id);

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        image_prompt: doc.image_prompt,
        image_style_notes: doc.image_style_notes || null,
      }),
    };
  } catch (err) {
    console.error('[regen-image-prompt] error:', err);
    return {
      statusCode: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: err.message }),
    };
  }
};
