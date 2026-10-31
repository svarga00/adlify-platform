// ============================================================================
// DANUBRA — „Idem volať": koho pýtať, čo povedať po nemecky, čo zistiť
// Spustenie:  node app/lib/marketing/callsheet.test.js
// ============================================================================
const CS = require('./callsheet.js');
const P = require('./pitch.js');

let passed = 0, failed = 0;
function ok(c, msg, extra) {
  if (c) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}${extra ? `\n    ${extra}` : ''}`); }
}
// Písmená, ktoré má slovenčina a nemčina nie (ä je v oboch), a bežné slovenské slová.
const SK = /[áčďéíĺľňóôŕšťúýž]|\b(sa|je|alebo|firma|ľudí|pre|ktor\w*)\b/i;
const SUP = { name: 'Partner und Service s. r. o.' };

console.log('Ťahák pre firmu so známym remeslom');
{
  const lead = { name: 'Müller Trockenbau GmbH', city: 'Augsburg', region: 'Bayern', trade: 'Trockenbau', contact_person: 'Herr Hans Müller', phone: '+49 171 2345678' };
  const s = CS.callsheet(lead, { supplier: SUP, caller: 'Štefan Varga' });
  ok(Array.isArray(s.script) && s.script.length >= 4 && s.script.every(x => x.title && x.sk && x.de), 'skript: kroky s nadpisom, pokynom (SK) a vetou (DE)');
  const de = s.script.map(x => x.de).join(' ');
  ok(de.includes(P.tradeVars({ lead }).remeslo) && /in Bayern/.test(de) && /Trockenbauer/.test(de), 'hák: nemecké remeslo a región firmy', de.slice(0, 300));
  ok(/Werkvertrag/.test(de) && /nach Stunden/.test(de) && /A1/.test(de) && /§ 48b/.test(de), 'ponuka: Werkvertrag, hodiny, A1, § 48b');
  ok(/15 Minuten/.test(de) && /Profile/.test(de), 'záver: profily alebo 15-minútový hovor');
  ok(/Herrn Müller/.test(s.script[0].de) && s.askFor.name === 'Herr Müller', 'pýtať si konateľa z Impressum (Herrn Müller sprechen)', s.script[0].de);
  ok(/Partner und Service aus der Slowakei/.test(s.script[0].de) && !/s\. r\. o/.test(s.script[0].de), 'úvod: meno firmy bez s. r. o.');
  // Meno volajúceho môže mať slovenské písmená — kontroluje sa zvyšok vety.
  const deNoName = [...s.script.map(x => x.de.replace('Štefan Varga', '')), ...s.objections.flatMap(o => [o.q, o.a])];
  ok(deNoName.every(t => !SK.test(t)), 'nemecké vety a námietky sú bez slovenčiny', deNoName.find(t => SK.test(t)));
  ok(/Sie/.test(de) && !/\b(du|dich|dir|dein)\b/i.test(de), 'vykanie (Sie)');
  ok(s.script.every(x => /[čšžťľáíéýúô]|\b(sa|je)\b/i.test(x.sk)), 'pokyny pre volajúceho sú po slovensky');
  ok(s.askFor.phone && s.askFor.phone.tel === 'tel:+491712345678', 'telefón s tel: odkazom');
}

console.log('\nNámietky');
{
  const s = CS.callsheet({ trade: 'Maler', city: 'München' }, { supplier: SUP });
  ok(s.objections.length >= 3 && s.objections.every(o => o.q && o.a), 'aspoň tri námietky s odpoveďou');
  const q = s.objections.map(o => o.q).join(' | ');
  ok(/eigenen Leuten/.test(q) && /Scheinselbst/.test(q) && /kostet|teuer/.test(q), 'vlastní ľudia, Scheinselbständigkeit, cena', q);
  const price = s.objections.find(o => /teuer|kostet/.test(o.q));
  ok(/Konditionen nennen wir Ihnen im Angebot/.test(price.a) && !/\d+\s*(€|EUR|Euro)/.test(s.objections.map(o => o.a).join(' ')), 'cena sa nevymýšľa — „Konditionen nennen wir im Angebot"');
  const own = CS.callsheet({ trade: 'Maler' }, { marketing: { presentation: { prices: 'Ab 38 € pro Stunde, je nach Gewerk.' } } });
  ok(/Ab 38 €/.test(own.objections.find(o => /teuer|kostet/.test(o.q)).a), 'cenu z Nastavení (marketing.presentation.prices) povie, keď je zadaná');
  ok(/Werkvertrag/.test(s.objections.find(o => /Scheinselbst/.test(o.q)).a), 'Scheinselbständigkeit: Werkvertrag a doklady');
}

console.log('\nBez remesla a bez konateľa');
{
  const s = CS.callsheet({ name: 'Bau GmbH' });
  ok(s.trade === 'bau' && /welche Gewerke/.test(s.script[1].de), 'všeobecný hák: spýtať sa, aké remeslá robia', s.script[1].de);
  ok(/Bauleiter alebo Inhaber/.test(s.askFor.hint) && /Inhaber oder dem Bauleiter/.test(s.script[0].de) && !s.askFor.name, 'koho pýtať: Bauleiter alebo Inhaber');
  ok(/in Ihrer Region/.test(s.script[1].de), 'bez regiónu „in Ihrer Region"');
  ok(s.askFor.phone === null, 'bez telefónu nič');
  ok(/Frau Huber/.test(CS.askFor({ contact_person: 'Frau Sabine Huber' }).de), 'žena: Frau Huber');
  const last = CS.askFor({}, [{ contact_name: 'Hans Müller', contact_role: 'Bauleiter', happened_at: '2026-10-29T10:00:00Z' }, { contact_name: 'Starý', happened_at: '2026-10-01T10:00:00Z' }]);
  ok(last.last && last.last.name === 'Hans Müller' && last.last.role === 'Bauleiter', 's kým sme hovorili naposledy');
}

console.log('\nDotazník po hovore');
{
  const keys = CS.QUESTIONS.map(q => q.key);
  ok(['right_person', 'subcontractors', 'trades', 'headcount', 'sites', 'staffed', 'interest', 'send', 'note'].every(k => keys.includes(k)), 'všetky otázky', keys.join(','));
  const tr = CS.QUESTIONS.find(q => q.key === 'trades');
  ok(tr.options.length === P.TRADES.length && tr.options.some(o => o[0] === 'Trockenbau') && tr.other, 'remeslá z pitch.js (nemecké názvy) + iné');
  ok(CS.QUESTIONS.find(q => q.key === 'interest').options.length === 5, 'záujem 1–5');
  ok(CS.QUESTIONS.find(q => q.key === 'headcount').with.options.map(o => o[1]).join() === 'hneď,o mesiac,na jar,po lete,budúci rok', 'odkedy: hneď, o mesiac, na jar, po lete, budúci rok');
}

console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
process.exit(failed ? 1 : 0);
