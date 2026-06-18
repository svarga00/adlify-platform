-- Master cold outreach template: cold_audit_v1
-- Založený na používateľovom Brevo-style HTML, prerobený na Adlify tokens +
-- enrichment-based personalizáciu (Outscraper analysis).
--
-- Tokens:
--   {{greeting}}              "Dobrý deň, Marek" alebo "Dobrý deň"
--   {{company}}               názov firmy
--   {{domain}}                doména
--   {{city_hook}}             " Bratislave" ak vieme mesto, inak ''
--   {{reviews_hook}}          "Všimol som si že máte 87 recenzií Google..."
--   {{tracking_hook}}         "Vidím že máte GTM nasadený..."
--   {{enrichment_hook}}       kombinácia reviews+tracking (alebo prázdne)
--   {{audit_request_url}}     CTA link s tokenom
--   {{unsubscribe_url}}       opt-out link
--   {{sender_name}}           "Štefan Varga"
--   {{sender_email_reply}}    "info@adlify.eu" (reply-to)
--   {{sender_phone}}          telefón
--   {{sender_domain_marketing}} "adlify-agency.online" (footer + sender from)
--
-- Subject randomization — 4 varianty cez template_variants v outreach_campaign_steps
-- (ak používaš A/B testing). Bez variantov scheduler vezme prvý subject_variants[0].

-- Tabuľka email_templates sa predpokladá z migrations 003+.
-- Idempotent INSERT.

INSERT INTO email_templates (slug, name, category, subject, html_content, plain_text, is_active, created_at, updated_at)
SELECT
  'cold_audit_v1',
  'Cold outreach — bezplatný audit (master)',
  'outreach',
  -- 4 subject varianty — random pick pri každom maile (cez _subject_variants splitter)
  'Viac zákazníkov pre {{company}} — audit zadarmo',
  $html$<!DOCTYPE html>
<html lang="sk" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>{{company}} — audit zadarmo</title>
  <style>
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    body { margin: 0; padding: 0; width: 100% !important; height: 100% !important; }
    @media screen and (max-width: 600px) {
      .email-container { width: 100% !important; }
      .px { padding-left: 26px !important; padding-right: 26px !important; }
      .h1 { font-size: 24px !important; line-height: 32px !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#f1f0ec;">

  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:#f1f0ec;">
    Bezplatný audit, návrh kampane a analýza pre {{company}} — bez záväzku.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f0ec;">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <table role="presentation" class="email-container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px; background-color:#ffffff; border-radius:16px; overflow:hidden;">

          <tr>
            <td class="px" style="padding:38px 48px 0 48px;" align="left">
              <img src="https://eidkljfaeqvvegiponwl.supabase.co/storage/v1/object/public/assets/brand/logo_url_1771774258989.png" alt="Adlify" width="132" style="display:block; width:132px; max-width:132px; height:auto;">
            </td>
          </tr>

          <tr>
            <td class="px" style="padding:24px 48px 0 48px;" align="left">
              <h1 class="h1" style="margin:0; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:28px; line-height:36px; font-weight:700; color:#141414; letter-spacing:-0.4px;">
                Viac zákazníkov pre {{company}}
              </h1>
            </td>
          </tr>

          <tr>
            <td class="px" style="padding:18px 48px 0 48px;" align="left">
              <p style="margin:0; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:16px; line-height:25px; color:#3d3d3d;">
                {{greeting}},
              </p>
              <p style="margin:14px 0 0 0; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:16px; line-height:25px; color:#3d3d3d;">
                som zo slovenskej marketingovej agentúry Adlify — spravujeme reklamné kampane na Google a Meta pre firmy ako je {{company}}. Žiadne sľuby o zázrakoch, len merateľné výsledky.
              </p>
              <p style="margin:14px 0 0 0; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:16px; line-height:25px; color:#3d3d3d;">
                {{enrichment_hook}} Pozrel som si {{domain}} a rád by som vám <strong style="color:#141414;">bezplatne</strong> pripravil:
              </p>
            </td>
          </tr>

          <tr>
            <td class="px" style="padding:18px 48px 0 48px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fdf3ee; border-radius:10px; border-left:3px solid #F26522;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:15px; line-height:24px; color:#141414;">
                      <strong>Audit</strong> vašej súčasnej online prezentácie a reklám
                    </p>
                    <p style="margin:10px 0 0 0; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:15px; line-height:24px; color:#141414;">
                      <strong>Návrh kampane</strong> na mieru pre {{industry}}{{city_hook}}
                    </p>
                    <p style="margin:10px 0 0 0; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:15px; line-height:24px; color:#141414;">
                      <strong>Analýzu</strong>, kde získať viac zákazníkov za menej peňazí
                    </p>
                    <p style="margin:14px 0 0 0; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:14px; line-height:22px; color:#7a7a7a;">
                      Nezáväzne a bez nákladov z vašej strany. Výsledky do 48 hodín.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="px" style="padding:28px 48px 0 48px;" align="center">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
                href="{{audit_request_url}}"
                style="height:54px; v-text-anchor:middle; width:270px;" arcsize="50%" fillcolor="#F26522" stroke="f">
                <w:anchorlock/>
                <center style="color:#ffffff; font-family:'Segoe UI',Arial,sans-serif; font-size:16px; font-weight:bold;">
                  Chcem bezplatný audit
                </center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-->
              <a href="{{audit_request_url}}" target="_blank"
                 style="display:inline-block; background-color:#F26522; color:#ffffff; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:16px; font-weight:700; text-decoration:none; padding:16px 42px; border-radius:30px;">
                Chcem bezplatný audit
              </a>
              <!--<![endif]-->
            </td>
          </tr>

          <tr>
            <td class="px" style="padding:16px 48px 0 48px;" align="center">
              <p style="margin:0; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:13px; line-height:20px; color:#7a7a7a;">
                Alebo jednoducho odpovedzte na tento e-mail slovom „áno" a ozveme sa.
              </p>
            </td>
          </tr>

          <tr>
            <td class="px" style="padding:22px 48px 0 48px;" align="left">
              <p style="margin:0; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:13px; line-height:20px; color:#7a7a7a;">
                Pre prvých klientov: setup zadarmo &nbsp;·&nbsp; bez viazanosti
              </p>
            </td>
          </tr>

          <tr>
            <td class="px" style="padding:28px 48px 36px 48px;" align="left">
              <p style="margin:0; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:16px; line-height:25px; color:#3d3d3d;">
                S pozdravom,<br>
                <strong style="color:#141414;">{{sender_name}}</strong><br>
                <span style="color:#7a7a7a; font-size:14px;">{{sender_title}}</span>
              </p>
            </td>
          </tr>

          <tr>
            <td style="background-color:#f7f7f5; border-top:1px solid #ececec;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="px" style="padding:24px 48px 28px 48px;" align="center">
                    <p style="margin:0; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:12px; line-height:19px; color:#9b9b9b;">
                      Adlify Agency &nbsp;·&nbsp; Marketingová agentúra &nbsp;·&nbsp;
                      <a href="https://{{sender_domain_main}}" target="_blank" style="color:#9b9b9b; text-decoration:none;">{{sender_domain_main}}</a>
                    </p>
                    <p style="margin:6px 0 0 0; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:12px; line-height:19px; color:#9b9b9b;">
                      <a href="mailto:{{sender_email_reply}}" style="color:#9b9b9b; text-decoration:none;">{{sender_email_reply}}</a>
                      &nbsp;·&nbsp; {{sender_phone}}
                    </p>
                    <p style="margin:12px 0 0 0; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:12px; line-height:19px; color:#9b9b9b;">
                      Tento email ste dostali, lebo sme {{domain}} identifikovali ako relevantný kontakt pre digitálny marketing.
                      <a href="{{unsubscribe_url}}" style="color:#9b9b9b; text-decoration:underline;">Odhlásiť z odberu</a>.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>$html$,
  -- Plain text fallback — multipart povinný pre dobrú deliverability
  $text${{greeting}},

som zo slovenskej marketingovej agentúry Adlify — spravujeme reklamné kampane na Google a Meta pre firmy ako je {{company}}. Žiadne sľuby o zázrakoch, len merateľné výsledky.

{{enrichment_hook}}

Pozrel som si {{domain}} a rád by som vám bezplatne pripravil:

  • Audit vašej súčasnej online prezentácie a reklám
  • Návrh kampane na mieru pre {{industry}}{{city_hook}}
  • Analýzu, kde získať viac zákazníkov za menej peňazí

Nezáväzne, bez nákladov z vašej strany. Výsledky do 48 hodín.

→ Chcem bezplatný audit: {{audit_request_url}}

Alebo jednoducho odpovedzte na tento e-mail slovom „áno" a ozveme sa.

Pre prvých klientov: setup zadarmo · bez viazanosti.

S pozdravom,
{{sender_name}}
{{sender_title}}

——
Adlify Agency · {{sender_domain_main}} · {{sender_email_reply}} · {{sender_phone}}
Odhlásiť z odberu: {{unsubscribe_url}}$text$,
  true,
  NOW(),
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE slug = 'cold_audit_v1');

-- Ak template už existuje (re-run), UPDATE namiesto skip — aby si dostal najnovšiu verziu
UPDATE email_templates
SET
  name = 'Cold outreach — bezplatný audit (master)',
  category = 'outreach',
  subject = 'Viac zákazníkov pre {{company}} — audit zadarmo',
  is_active = true,
  updated_at = NOW()
WHERE slug = 'cold_audit_v1';

-- Diagnostika
SELECT slug, name, category, is_active, length(html_content) AS html_chars, length(plain_text) AS text_chars
FROM email_templates
WHERE slug = 'cold_audit_v1';
