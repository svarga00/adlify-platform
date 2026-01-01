// Netlify Function - Handle proposal response
// File: netlify/functions/proposal-response.js

const { createClient } = require('@supabase/supabase-js');

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

      // 3. Vytvoriť klienta
      const { data: newClient, error: clientError } = await supabase
        .from('clients')
        .insert({
          company_name: companyName,
          domain: proposal.domain,
          email: contactEmail || null,
          phone: contactPhone || null,
          contact_person: contactName || null,
          status: 'active',
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
          status: 'new',
          type: 'conversion',
          lead_id: leadId,
          client_id: newClient?.id
        });

      console.log('✅ Lead converted to client:', companyName);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true, 
          message: 'Ďakujeme za váš záujem! Čoskoro vás budeme kontaktovať.',
          clientId: newClient?.id
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
          status: 'new',
          type: 'question',
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
          .update({ 
            status: 'contacted',
            notes: supabase.sql`COALESCE(notes, '') || '\n\n[Otázka z ponuky]: ' || ${message || ''}`
          })
          .eq('id', leadId);
      }

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
