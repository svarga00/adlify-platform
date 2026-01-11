// Netlify Function - Handle proposal response
// File: netlify/functions/proposal-response.js

const { createClient } = require('@supabase/supabase-js');

// Email notification helper
async function sendNotificationEmail(to, subject, htmlBody) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.warn('No RESEND_API_KEY, skipping email notification');
    return;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'Adlify <onboarding@resend.dev>',
        to: to,
        subject: subject,
        html: htmlBody
      })
    });

    const result = await response.json();
    console.log('📧 Notification email sent:', result);
    return result;
  } catch (err) {
    console.error('Email notification error:', err);
  }
}

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { token, action, message, contactName, contactEmail, contactPhone, subType, reason } = JSON.parse(event.body);

    if (!token || !action) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing token or action' }) };
    }

    // Initialize Supabase with service role key
    const supabase = createClient(
      process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
      process.env.SUPABASE_SERVICE_KEY
    );

    // Get proposal by token
    const { data: proposal, error: proposalError } = await supabase
      .from('proposals')
      .select('*, lead_id')
      .eq('token', token)
      .single();

    if (proposalError || !proposal) {
      console.error('Proposal not found:', proposalError);
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Proposal not found' }) };
    }

    const leadId = proposal.lead_id;
    const companyName = proposal.company_name || 'Neznámy';
    const notifyEmail = 'info@adlify.eu';

    if (action === 'interested') {
      // ===== MÁM ZÁUJEM - Konvertovať na klienta =====
      
      // 1. Aktualizovať lead status
      if (leadId) {
        await supabase
          .from('leads')
          .update({ 
            status: 'won',
            converted_at: new Date().toISOString()
          })
          .eq('id', leadId);
      }

      // 2. Aktualizovať proposal status
      await supabase
        .from('proposals')
        .update({ status: 'converted' })
        .eq('token', token);

      // 3. Vygenerovať onboarding token
      const onboardingToken = 'ob_' + Array.from({length: 24}, () => 
        'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]
      ).join('');

      // 4. Vytvoriť klienta s onboarding_token
      const { data: newClient, error: clientError } = await supabase
        .from('clients')
        .insert({
          company_name: companyName,
          domain: proposal.domain,
          email: contactEmail || null,
          phone: contactPhone || null,
          contact_person: contactName || null,
          status: 'active',
          onboarding_status: 'sent',
          onboarding_token: onboardingToken,
          source: 'proposal',
          lead_id: leadId,
          notes: `Konvertovaný z ponuky ${token}`
        })
        .select()
        .single();

      if (clientError) {
        console.error('Client creation error:', clientError);
      }

      // 4. Vytvoriť notifikáciu/ticket
      await supabase
        .from('tickets')
        .insert({
          title: `🎉 Nový klient: ${companyName}`,
          description: `Firma ${companyName} prejavila záujem o spoluprácu!\n\nKontakt: ${contactName || '-'}\nEmail: ${contactEmail || '-'}\nTelefón: ${contactPhone || '-'}`,
          priority: 'high',
          status: 'open',
          category: 'conversion',
          lead_id: leadId,
          client_id: newClient?.id
        });

      // 4b. Vytvoriť notifikáciu v DB (systémová - pre všetkých)
      await supabase
        .from('notifications')
        .insert({
          user_id: null, // systémová notifikácia
          type: 'conversion',
          title: `🎉 Nový klient: ${companyName}`,
          message: `${contactName || 'Niekto'} z firmy ${companyName} má záujem o spoluprácu!`,
          entity_type: 'client',
          entity_id: newClient?.id,
          action_url: '#clients'
        });

      // 5. Poslať email notifikáciu
      await sendNotificationEmail(
        notifyEmail,
        `🎉 NOVÝ KLIENT: ${companyName}`,
        `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #22c55e, #16a34a); color: white; padding: 20px; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0;">🎉 Máte nového klienta!</h1>
          </div>
          <div style="padding: 20px; background: #f8fafc; border-radius: 0 0 10px 10px;">
            <h2 style="color: #1e293b; margin-top: 0;">${companyName}</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #64748b;">Kontaktná osoba:</td>
                <td style="padding: 8px 0; font-weight: 600;">${contactName || '-'}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #64748b;">Email:</td>
                <td style="padding: 8px 0;"><a href="mailto:${contactEmail}" style="color: #f97316;">${contactEmail || '-'}</a></td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #64748b;">Telefón:</td>
                <td style="padding: 8px 0;"><a href="tel:${contactPhone}" style="color: #f97316;">${contactPhone || '-'}</a></td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #64748b;">Doména:</td>
                <td style="padding: 8px 0;">${proposal.domain || '-'}</td>
              </tr>
            </table>
            <div style="margin-top: 20px; padding: 15px; background: #dcfce7; border-radius: 8px;">
              <strong>✅ Akcie vykonané automaticky:</strong>
              <ul style="margin: 10px 0 0 0; padding-left: 20px;">
                <li>Lead označený ako "Vyhraný"</li>
                <li>Vytvorený nový klient</li>
                <li>Vytvorený ticket v systéme</li>
              </ul>
            </div>
            <div style="margin-top: 20px;">
              <a href="https://adlify-app.netlify.app/admin#tickets" style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #f97316, #ea580c); color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
                Otvoriť v Adlify →
              </a>
            </div>
          </div>
        </div>
        `
      );

      // 6. Poslať email KLIENTOVI s registračným linkom
      const registerUrl = `https://adlify-app.netlify.app/portal/register.html?t=${onboardingToken}`;
      
      if (contactEmail) {
        await sendNotificationEmail(
          contactEmail,
          `Vitajte v Adlify - Registrácia`,
          `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #f97316, #ec4899); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="margin: 0; font-size: 28px;">Vitajte v Adlify! 🚀</h1>
            </div>
            <div style="padding: 30px; background: #f8fafc; border-radius: 0 0 10px 10px;">
              <p style="font-size: 16px; color: #1e293b;">Dobrý deň ${contactName || ''},</p>
              <p style="color: #475569;">Ďakujeme za váš záujem o spoluprácu! Pre dokončenie registrácie a nastavenie vašej marketingovej kampane kliknite na tlačidlo nižšie:</p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${registerUrl}" style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #f97316, #ec4899); color: white; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 16px;">
                  Dokončiť registráciu →
                </a>
              </div>
              
              <p style="color: #64748b; font-size: 14px;">Alebo skopírujte tento odkaz do prehliadača:</p>
              <p style="color: #f97316; word-break: break-all; font-size: 14px;">${registerUrl}</p>
              
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
              
              <p style="color: #64748b; font-size: 14px; margin-bottom: 0;">
                S pozdravom,<br>
                <strong>Tím Adlify</strong><br>
                📧 info@adlify.eu | 🌐 adlify.eu
              </p>
            </div>
          </div>
          `
        );
        console.log('📧 Registration email sent to client:', contactEmail);
      }

      console.log('✅ Lead converted to client:', companyName);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true, 
          message: 'Ďakujeme za váš záujem! Na váš email sme poslali registračný odkaz.',
          clientId: newClient?.id,
          registerUrl: registerUrl
        })
      };

    } else if (action === 'question') {
      // ===== MÁM OTÁZKY - Vytvoriť ticket =====
      
      // 1. Aktualizovať proposal status
      await supabase
        .from('proposals')
        .update({ status: 'has_questions' })
        .eq('token', token);

      // 2. Vytvoriť ticket
      const { data: ticket, error: ticketError } = await supabase
        .from('tickets')
        .insert({
          title: `❓ Otázka od: ${companyName}`,
          description: `Firma ${companyName} má otázky k ponuke.\n\n📝 Správa:\n${message || '(bez správy)'}\n\nKontakt: ${contactName || '-'}\nEmail: ${contactEmail || '-'}\nTelefón: ${contactPhone || '-'}`,
          priority: 'medium',
          status: 'open',
          category: 'question',
          lead_id: leadId
        })
        .select()
        .single();

      if (ticketError) {
        console.error('Ticket creation error:', ticketError);
      }

      // 3. Aktualizovať lead
      if (leadId) {
        await supabase
          .from('leads')
          .update({ status: 'contacted' })
          .eq('id', leadId);
      }

      // 3b. Vytvoriť notifikáciu v DB (systémová - pre všetkých)
      await supabase
        .from('notifications')
        .insert({
          user_id: null, // systémová notifikácia
          type: 'question',
          title: `❓ Otázka od: ${companyName}`,
          message: message ? (message.length > 100 ? message.substring(0, 100) + '...' : message) : 'Nová otázka k ponuke',
          entity_type: 'ticket',
          entity_id: ticket?.id,
          action_url: '#tickets'
        });

      // 4. Poslať email notifikáciu
      await sendNotificationEmail(
        notifyEmail,
        `❓ Otázka od: ${companyName}`,
        `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #f97316, #ec4899); color: white; padding: 20px; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0;">❓ Nová otázka k ponuke</h1>
          </div>
          <div style="padding: 20px; background: #f8fafc; border-radius: 0 0 10px 10px;">
            <h2 style="color: #1e293b; margin-top: 0;">${companyName}</h2>
            
            <div style="background: white; padding: 15px; border-radius: 8px; border-left: 4px solid #f97316; margin-bottom: 20px;">
              <strong>📝 Otázka:</strong>
              <p style="margin: 10px 0 0 0; color: #334155;">${message || '(bez správy)'}</p>
            </div>
            
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #64748b;">Kontaktná osoba:</td>
                <td style="padding: 8px 0; font-weight: 600;">${contactName || '-'}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #64748b;">Email:</td>
                <td style="padding: 8px 0;"><a href="mailto:${contactEmail}" style="color: #f97316;">${contactEmail || '-'}</a></td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #64748b;">Telefón:</td>
                <td style="padding: 8px 0;"><a href="tel:${contactPhone}" style="color: #f97316;">${contactPhone || '-'}</a></td>
              </tr>
            </table>
            
            <div style="margin-top: 20px; display: flex; gap: 10px;">
              <a href="mailto:${contactEmail}?subject=Re: Otázka k ponuke - ${companyName}" style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #f97316, #ea580c); color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
                📧 Odpovedať
              </a>
              <a href="https://adlify-app.netlify.app/admin#tickets" style="display: inline-block; padding: 12px 24px; background: #e2e8f0; color: #475569; text-decoration: none; border-radius: 8px; font-weight: 600;">
                Otvoriť ticket →
              </a>
            </div>
          </div>
        </div>
        `
      );

      console.log('✅ Question ticket created for:', companyName);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true, 
          message: 'Ďakujeme za vašu otázku! Odpovieme vám čo najskôr.',
          ticketId: ticket?.id
        })
      };
    
    } else if (action === 'not_interested') {
      // ===== NEMÁM ZÁUJEM =====
      
      // 1. Aktualizovať proposal status
      await supabase
        .from('proposals')
        .update({ status: subType === 'later' ? 'postponed' : 'rejected' })
        .eq('token', token);

      // 2. Aktualizovať lead
      if (leadId) {
        const newStatus = subType === 'later' ? 'contacted' : 'lost';
        await supabase
          .from('leads')
          .update({ 
            status: newStatus,
            notes: reason ? `[Odmietnutie]: ${reason}` : null
          })
          .eq('id', leadId);
      }

      // 3. Vytvoriť notifikáciu v DB
      const notifTitle = subType === 'later' 
        ? `⏰ ${companyName} - osloviť neskôr`
        : `🚫 ${companyName} - nemá záujem`;
      
      await supabase
        .from('notifications')
        .insert({
          user_id: null,
          type: 'rejection',
          title: notifTitle,
          message: reason || (subType === 'later' ? 'Požiadal o kontakt neskôr' : 'Definitívne odmietol'),
          entity_type: 'lead',
          entity_id: leadId,
          action_url: '#leads'
        });

      // 4. Ak je to "neskôr", vytvor ticket pre follow-up
      if (subType === 'later') {
        await supabase
          .from('tickets')
          .insert({
            title: `⏰ Follow-up: ${companyName}`,
            description: `Klient požiadal o kontakt neskôr.\n\nDôvod: ${reason || '(neuvedený)'}\n\nOdporúčanie: Kontaktovať o 1-2 mesiace.`,
            priority: 'low',
            status: 'open',
            category: 'followup',
            lead_id: leadId
          });
      }

      console.log('✅ Not interested processed for:', companyName, subType);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true, 
          message: subType === 'later' ? 'Poznačili sme si to.' : 'Ďakujeme za spätnú väzbu.'
        })
      };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid action' }) };

  } catch (error) {
    console.error('Proposal response error:', error);
    return { 
      statusCode: 500, 
      headers, 
      body: JSON.stringify({ error: error.message }) 
    };
  }
};
