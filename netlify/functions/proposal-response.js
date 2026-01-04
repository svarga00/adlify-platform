// Netlify Function - Handle proposal response
// File: netlify/functions/proposal-response.js
// Version: 2.0 - s onboarding emailom a notifikáciami

const { createClient } = require('@supabase/supabase-js');

// Generate random token
function generateToken(length = 32) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < length; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

// Email helper
async function sendEmail(to, subject, htmlBody) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.warn('⚠️ No RESEND_API_KEY, skipping email');
    return null;
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
    console.log('📧 Email sent to:', to, result);
    return result;
  } catch (err) {
    console.error('❌ Email error:', err);
    return null;
  }
}

// Create notification helper
async function createNotification(supabase, data) {
  try {
    const { error } = await supabase
      .from('notifications')
      .insert({
        user_id: data.user_id || null,  // null = pre všetkých
        type: data.type || 'system',
        title: data.title,
        message: data.message,
        entity_type: data.entity_type,
        entity_id: data.entity_id,
        action_url: data.action_url
      });
    
    if (error) {
      console.error('⚠️ Notification error:', error);
    } else {
      console.log('🔔 Notification created:', data.title);
    }
  } catch (err) {
    console.error('❌ Notification creation failed:', err);
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
    const { token, action, message, contactName, contactEmail, contactPhone } = JSON.parse(event.body);
    console.log('📥 Request:', { token, action, contactEmail });

    if (!token || !action) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing token or action' }) };
    }

    // Initialize Supabase
    const supabase = createClient(
      process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
      process.env.SUPABASE_SERVICE_KEY
    );

    // Get proposal
    const { data: proposal, error: proposalError } = await supabase
      .from('proposals')
      .select('*, lead_id')
      .eq('token', token)
      .single();

    if (proposalError || !proposal) {
      console.error('❌ Proposal not found:', proposalError);
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Proposal not found' }) };
    }

    const leadId = proposal.lead_id;
    const companyName = proposal.company_name || 'Neznámy';
    const notifyEmail = 'info@adlify.eu';
    const baseUrl = 'https://adlify-app.netlify.app';

    // =========================================
    // ACTION: INTERESTED (Mám záujem)
    // =========================================
    if (action === 'interested') {
      console.log('🎯 Processing INTERESTED for:', companyName);
      
      // 1. Update lead status
      if (leadId) {
        const { error: leadError } = await supabase
          .from('leads')
          .update({ 
            status: 'won',
            converted_at: new Date().toISOString()
          })
          .eq('id', leadId);
        
        if (leadError) console.error('Lead update error:', leadError);
        else console.log('✅ Lead updated to won');
      }

      // 2. Update proposal status
      const { error: proposalUpdateError } = await supabase
        .from('proposals')
        .update({ status: 'converted' })
        .eq('token', token);
      
      if (proposalUpdateError) console.error('Proposal update error:', proposalUpdateError);
      else console.log('✅ Proposal updated to converted');

      // 3. Generate onboarding token
      const onboardingToken = generateToken(32);

      // 4. Create client
      let clientId = null;
      const clientData = {
        company_name: companyName,
        domain: proposal.domain,
        email: contactEmail || null,
        phone: contactPhone || null,
        contact_person: contactName || null,
        status: 'onboarding',
        source: 'proposal',
        lead_id: leadId,
        onboarding_token: onboardingToken,
        onboarding_status: 'pending',
        pipeline_stage: 'onboarding',
        notes: `Konvertovaný z ponuky ${token}`
      };

      const { data: newClient, error: clientError } = await supabase
        .from('clients')
        .insert(clientData)
        .select()
        .single();

      if (clientError) {
        console.error('Client creation error (trying fallback):', clientError);
        // Fallback - bez nových stĺpcov
        const { data: fallbackClient, error: fallbackError } = await supabase
          .from('clients')
          .insert({
            company_name: companyName,
            email: contactEmail || null,
            phone: contactPhone || null,
            contact_person: contactName || null,
            status: 'active',
            lead_id: leadId,
            notes: `Konvertovaný z ponuky ${token}\nOnboarding token: ${onboardingToken}`
          })
          .select()
          .single();
        
        if (fallbackError) {
          console.error('❌ Fallback client creation error:', fallbackError);
        } else {
          clientId = fallbackClient?.id;
          console.log('✅ Client created (fallback):', clientId);
        }
      } else {
        clientId = newClient?.id;
        console.log('✅ Client created:', clientId);
      }

      // 5. Create ticket (using 'subject' not 'title'!)
      const { error: ticketError } = await supabase
        .from('tickets')
        .insert({
          subject: `🎉 Nový klient: ${companyName}`,
          description: `Firma ${companyName} prejavila záujem o spoluprácu!\n\nKontakt: ${contactName || '-'}\nEmail: ${contactEmail || '-'}\nTelefón: ${contactPhone || '-'}`,
          priority: 'high',
          status: 'open',
          category: 'general',
          lead_id: leadId,
          client_id: clientId
        });

      if (ticketError) console.error('Ticket error:', ticketError);
      else console.log('✅ Ticket created');

      // 6. Create notification
      await createNotification(supabase, {
        type: 'client',
        title: `🎉 Nový klient: ${companyName}`,
        message: `${contactName || 'Klient'} prejavil záujem o spoluprácu`,
        entity_type: 'client',
        entity_id: clientId,
        action_url: `#clients?id=${clientId}`
      });

      // 7. Send internal notification email
      await sendEmail(
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
              <tr><td style="padding: 8px 0; color: #64748b;">Kontakt:</td><td style="padding: 8px 0; font-weight: 600;">${contactName || '-'}</td></tr>
              <tr><td style="padding: 8px 0; color: #64748b;">Email:</td><td style="padding: 8px 0;"><a href="mailto:${contactEmail}" style="color: #f97316;">${contactEmail || '-'}</a></td></tr>
              <tr><td style="padding: 8px 0; color: #64748b;">Telefón:</td><td style="padding: 8px 0;"><a href="tel:${contactPhone}" style="color: #f97316;">${contactPhone || '-'}</a></td></tr>
              <tr><td style="padding: 8px 0; color: #64748b;">Doména:</td><td style="padding: 8px 0;">${proposal.domain || '-'}</td></tr>
            </table>
            <div style="margin-top: 20px; padding: 15px; background: #dcfce7; border-radius: 8px;">
              <strong>✅ Automaticky vykonané:</strong>
              <ul style="margin: 10px 0 0 0; padding-left: 20px;">
                <li>Lead → Vyhraný</li>
                <li>Vytvorený klient</li>
                <li>Vytvorený ticket</li>
                <li>Odoslaný onboarding email</li>
              </ul>
            </div>
            <div style="margin-top: 20px;">
              <a href="${baseUrl}/admin#clients" style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #f97316, #ea580c); color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
                Otvoriť v Adlify →
              </a>
            </div>
          </div>
        </div>
        `
      );

      // 8. Send ONBOARDING EMAIL to client
      const onboardingUrl = `${baseUrl}/onboarding.html?t=${onboardingToken}`;
      
      if (contactEmail) {
        await sendEmail(
          contactEmail,
          `🚀 Vitajte v Adlify - Ďalšie kroky`,
          `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #f97316, #ec4899); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="margin: 0; font-size: 28px;">🚀 Vitajte v Adlify!</h1>
              <p style="margin: 10px 0 0 0; opacity: 0.9;">Tešíme sa na spoluprácu s ${companyName}</p>
            </div>
            
            <div style="padding: 30px; background: #ffffff;">
              <p style="color: #334155; font-size: 16px; line-height: 1.6;">
                Ahoj${contactName ? ' ' + contactName : ''},
              </p>
              <p style="color: #334155; font-size: 16px; line-height: 1.6;">
                Ďakujeme za váš záujem! Aby sme pre vás mohli pripraviť čo najlepšiu marketingovú stratégiu, potrebujeme od vás niekoľko informácií.
              </p>
              
              <div style="background: linear-gradient(135deg, #fef3e7, #fce7f3); padding: 20px; border-radius: 12px; margin: 25px 0;">
                <h3 style="color: #1e293b; margin: 0 0 15px 0;">📋 Čo bude nasledovať?</h3>
                <ol style="color: #475569; margin: 0; padding-left: 20px; line-height: 2;">
                  <li><strong>Vyplníte krátky dotazník</strong> (5 minút)</li>
                  <li>Pripravíme vám zálohovú faktúru</li>
                  <li>Po úhrade začneme na kampani</li>
                  <li>Pošleme vám návrh na schválenie</li>
                  <li>Spustíme kampaň!</li>
                </ol>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${onboardingUrl}" style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #f97316, #ea580c); color: white; text-decoration: none; border-radius: 30px; font-weight: 600; font-size: 18px; box-shadow: 0 4px 15px rgba(249,115,22,0.3);">
                  Vyplniť dotazník →
                </a>
              </div>
              
              <p style="color: #64748b; font-size: 14px; text-align: center;">
                Dotazník vám zaberie približne 5 minút
              </p>
            </div>
            
            <div style="padding: 20px 30px; background: #f8fafc; border-radius: 0 0 10px 10px;">
              <p style="color: #64748b; font-size: 14px; margin: 0;">
                Máte otázky? <a href="mailto:info@adlify.eu" style="color: #f97316;">info@adlify.eu</a> | <a href="tel:+421944184045" style="color: #f97316;">+421 944 184 045</a>
              </p>
            </div>
            
            <div style="text-align: center; padding: 20px;">
              <p style="color: #94a3b8; font-size: 12px;">© 2025 Adlify | <a href="https://adlify.eu" style="color: #f97316;">www.adlify.eu</a></p>
            </div>
          </div>
          `
        );
        console.log('📧 Onboarding email sent to:', contactEmail);
      }

      console.log('✅ INTERESTED flow completed for:', companyName);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true, 
          message: 'Ďakujeme za váš záujem!',
          clientId: clientId,
          redirectUrl: `${baseUrl}/thank-you.html`
        })
      };
    }

    // =========================================
    // ACTION: QUESTION (Mám otázky)
    // =========================================
    if (action === 'question') {
      console.log('❓ Processing QUESTION for:', companyName);
      
      // 1. Update proposal status
      await supabase
        .from('proposals')
        .update({ status: 'has_questions' })
        .eq('token', token);

      // 2. Create ticket (using 'subject' not 'title'!)
      const { data: ticket, error: ticketError } = await supabase
        .from('tickets')
        .insert({
          subject: `❓ Otázka od: ${companyName}`,
          description: `Firma ${companyName} má otázky k ponuke.\n\n📝 Správa:\n${message || '(bez správy)'}\n\nKontakt: ${contactName || '-'}\nEmail: ${contactEmail || '-'}\nTelefón: ${contactPhone || '-'}`,
          priority: 'medium',
          status: 'open',
          category: 'general',
          lead_id: leadId
        })
        .select()
        .single();

      if (ticketError) console.error('Ticket error:', ticketError);
      else console.log('✅ Question ticket created');

      // 3. Update lead status
      if (leadId) {
        await supabase
          .from('leads')
          .update({ status: 'contacted' })
          .eq('id', leadId);
      }

      // 4. Create notification
      await createNotification(supabase, {
        type: 'ticket',
        title: `❓ Otázka od: ${companyName}`,
        message: message ? message.substring(0, 100) : 'Nová otázka k ponuke',
        entity_type: 'ticket',
        entity_id: ticket?.id,
        action_url: `#tickets?id=${ticket?.id}`
      });

      // 5. Send notification email
      await sendEmail(
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
              <tr><td style="padding: 8px 0; color: #64748b;">Kontakt:</td><td style="font-weight: 600;">${contactName || '-'}</td></tr>
              <tr><td style="padding: 8px 0; color: #64748b;">Email:</td><td><a href="mailto:${contactEmail}" style="color: #f97316;">${contactEmail || '-'}</a></td></tr>
              <tr><td style="padding: 8px 0; color: #64748b;">Telefón:</td><td><a href="tel:${contactPhone}" style="color: #f97316;">${contactPhone || '-'}</a></td></tr>
            </table>
            
            <div style="margin-top: 20px;">
              <a href="mailto:${contactEmail}?subject=Re: Otázka k ponuke - ${companyName}" style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #f97316, #ea580c); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; margin-right: 10px;">
                📧 Odpovedať
              </a>
              <a href="${baseUrl}/admin#tickets" style="display: inline-block; padding: 12px 24px; background: #e2e8f0; color: #475569; text-decoration: none; border-radius: 8px; font-weight: 600;">
                Otvoriť ticket →
              </a>
            </div>
          </div>
        </div>
        `
      );

      console.log('✅ QUESTION flow completed for:', companyName);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true, 
          message: 'Ďakujeme za vašu otázku! Odpovieme vám čo najskôr.',
          ticketId: ticket?.id
        })
      };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid action' }) };

  } catch (error) {
    console.error('❌ Proposal response error:', error);
    return { 
      statusCode: 500, 
      headers, 
      body: JSON.stringify({ error: error.message }) 
    };
  }
};
