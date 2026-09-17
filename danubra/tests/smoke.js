// ============================================================================
// DANUBRA — smoke test rozhrania
// Spustenie:  node danubra/tests/smoke.js
// ============================================================================
// Načíta všetky skripty z index.html v stubovanom DOM a overí, že sa appka
// poskladá: moduly sa zaregistrujú, pohľady existujú, knižnice sú na svete.
// Nenahrádza jednotkové testy — chytá to, čo ony nevidia: preklep v názve
// súboru, chýbajúci <script>, výnimku pri načítaní modulu.
// ============================================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const listeners = {};
const el = () => ({
  innerHTML: '', style: {}, hidden: false, textContent: '', value: '',
  addEventListener() {}, appendChild() {}, remove() {}, focus() {},
  querySelector() { return null; }, querySelectorAll() { return []; },
  classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  dataset: {},
});

const sandbox = {
  window: {},
  document: {
    addEventListener(ev, cb) { listeners[ev] = cb; },
    getElementById() { return el(); },
    querySelector() { return el(); },
    querySelectorAll() { return []; },
    createElement() { return el(); },
    body: { appendChild() {}, style: {} },
  },
  location: { hash: '' }, navigator: {},
  addEventListener() {}, removeEventListener() {},
  prompt() { return null; }, confirm() { return true; },
  setTimeout() {}, clearTimeout() {}, console, TextEncoder,
  supabase: {
    createClient() {
      return {
        auth: {
          getUser: async () => ({ data: { user: null } }),
          onAuthStateChange() {}, signInWithPassword: async () => ({}), signOut: async () => ({}),
        },
        rpc: async () => ({}),
        from() {
          return {
            select() { return this; }, eq() { return this; }, order() { return this; },
            limit() { return this; }, in() { return this; }, or() { return this; },
            maybeSingle: async () => ({ data: null }), single: async () => ({ data: null }),
            insert() { return this; }, update() { return this; },
            upsert: async () => ({ error: null }), delete() { return this; },
          };
        },
        storage: { from() { return { upload: async () => ({}), createSignedUrl: async () => ({}), remove: async () => ({}) }; } },
      };
    },
  },
};
sandbox.window = sandbox;
sandbox.self = sandbox;
vm.createContext(sandbox);

// Zoznam súborov berieme z index.html, nech test nikdy nezaostane za appkou.
// `vendor/` vynechávame zámerne: je to cudzí kód, ktorý v tomto stubovanom
// prostredí nemá skutočné `fetch` ani `URL` a spadol by na tom. Že sa naozaj
// načíta a funguje, overuje browser.test.js v ozajstnom prehliadači.
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const files = [...html.matchAll(/<script src="\.\/([^"]+)"><\/script>/g)]
  .map(m => m[1])
  .filter(f => !f.startsWith('vendor/'));

let loaded = 0;
const failures = [];
for (const f of files) {
  try {
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox, { filename: f });
    loaded++;
  } catch (e) {
    failures.push(`${f} — ${e.message}`);
  }
}
try { listeners.DOMContentLoaded && listeners.DOMContentLoaded(); } catch { /* init bez DOM */ }

const D = sandbox.Danubra;
const checks = [];
const t = (name, ok) => checks.push([name, !!ok]);

t(`načítalo sa všetkých ${files.length} súborov`, loaded === files.length && !failures.length);
t('Danubra existuje', D);
t('router má pohľady', D && Object.keys(D.views).length >= 20);

// každá položka navigácie musí mať svoj pohľad, inak vedie do prázdna
const missing = D ? D.allNav().map(n => n[0]).filter(k => !D.views[k]) : ['(bez Danubra)'];
t(`každá položka menu má pohľad${missing.length ? ' — chýba: ' + missing.join(', ') : ''}`, !missing.length);

for (const [name, obj] of [
  ['Guide', sandbox.Guide], ['Cand', sandbox.Cand], ['CandProc', sandbox.CandProc],
  ['Hire', sandbox.Hire], ['Trades', sandbox.Trades], ['Wrk', sandbox.Wrk], ['Sub', sandbox.Sub],
]) t(`modul ${name}`, obj);

for (const [name, obj] of [
  ['DanubraChips', sandbox.DanubraChips], ['DanubraProcess', sandbox.DanubraProcess],
  ['DanubraScreening', sandbox.DanubraScreening], ['DanubraQR', sandbox.DanubraQR],
  ['DanubraCompliance', sandbox.DanubraCompliance], ['DanubraMargin', sandbox.DanubraMargin],
]) t(`knižnica ${name}`, obj);

t('ikony fungujú', sandbox.Icon && sandbox.Icon('check', 14).startsWith('<svg'));
t('mega menu sa poskladá', D && D.megaHtml().includes('mega-col'));
// Názvy agend sa v mega menu objavia len vtedy, keď je ich viac než jedna —
// pri jedinej je delenie podľa agend zbytočné.
if (D) {
  const restoreA = { ...D.modules };
  D.modules = { ...D.modules, accommodation: true };
  const html = D.megaHtml();
  t('pri dvoch agendách ich mega menu obe ukáže',
    D.visibleAreas().every(a => html.includes(a[1])));
  D.modules = restoreA;
}
// na mobile sa bočný panel neotvára, takže toto musí byť v mega menu
t('mega menu má odhlásenie', D && D.megaHtml().includes('Odhlásiť sa'));

// Mega menu má byť zrozumiteľné aj tomu, kto appku nepostavil. Každá položka
// preto potrebuje jednu vetu o tom, čo sa pod názvom skrýva.
const noHint = D ? D.allNav().map(n => n[0]).filter(k => !D.hintOf(k)) : ['(bez Danubra)'];
t(`každá obrazovka má vysvetlenie${noHint.length ? ' — chýba: ' + noHint.join(', ') : ''}`,
  !noHint.length);
t('vysvetlenia sa ukážu v mega menu',
  D && D.megaHtml().includes(D.hintOf('workers')));
// Pri jedinej agende sa mega menu delí podľa skupín, nie podľa agend —
// inak by sa DATABÁZA a SYSTÉM rozpadli medzi „Nábor a stavby" a „Spoločné"
// a nikto by nevedel, kde čo hľadať.
if (D) {
  const restoreM = { ...D.modules };
  D.modules = { recruiting: true, contracts: true, finance: true, accommodation: false };
  const html = D.megaHtml();
  const groups = D.navGroups.map(g => g[0]);
  t('pri jedinej agende sa menu delí podľa skupín',
    groups.every(g => html.includes(`<span>${g}</span>`)));
  t('a nie podľa agend', !html.includes('Spoločné'));
  // Každá viditeľná obrazovka musí byť v menu práve raz.
  const dupes = D.visibleNav().map(n => n[1])
    .filter(label => (html.split(`<b>${label}</b>`).length - 1) !== 1);
  t(`každá obrazovka je v mega menu práve raz${dupes.length ? ' — problém: ' + dupes.join(', ') : ''}`,
    !dupes.length);
  D.modules = restoreM;
}

// ── Moduly: archivovaná agenda musí zmiznúť, nie sa len zneprístupniť ──────
if (D) {
  const restore = { ...D.modules };
  const area = D.area;

  // Stav podľa migrácie 013: ubytovanie vypnuté.
  D.modules = { recruiting: true, contracts: true, finance: true, accommodation: false };
  D.area = 'staffing';
  t('vypnutá agenda zmizne z prepínača', D.visibleAreas().length === 1);
  t('pri jedinej agende sa prepínač nekreslí', !D.megaHtml().includes('mega-area'));

  const hidden = ['inquiries', 'offers', 'orders', 'active', 'clients'];
  t('obchodná časť ubytovania nie je v navigácii',
    hidden.every(k => !D.visibleNav().some(n => n[0] === k)));
  t('archivovanú obrazovku nepustí ani odkaz',
    hidden.every(k => !D.routeAvailable(k)));
  t('mega menu neukazuje archivované obrazovky',
    !D.megaHtml().includes('Dopyty') && !D.megaHtml().includes('Aktívne pobyty'));

  // R4: databáza ubytovaní zostáva — ubytovanie je náklad zákazky.
  t('databáza ubytovaní zostáva dostupná (R4)', D.routeAvailable('accommodations'));
  t('databáza ubytovaní je v navigácii (R4)',
    D.visibleNav().some(n => n[0] === 'accommodations'));
  t('zákazky, hodiny a faktúry zostávajú',
    ['subcontracts', 'timesheets', 'invoices', 'candidates'].every(k => D.routeAvailable(k)));

  // Zapnuté ubytovanie musí vrátiť presne to, čo bolo v v1.
  D.modules = { ...D.modules, accommodation: true };
  t('zapnutie príznaku vráti agendu', D.visibleAreas().length === 2);
  t('zapnutie príznaku vráti obchodné obrazovky',
    hidden.every(k => D.routeAvailable(k)));

  // Vypnutie financií je iná os než agenda — nesmie zhodiť zvyšok.
  D.modules = { recruiting: true, contracts: true, finance: false, accommodation: false };
  t('vypnuté financie skryjú faktúry', !D.routeAvailable('invoices'));
  t('vypnuté financie nezhodia nábor', D.routeAvailable('candidates'));

  // Nastavenia sa nesmú dať vypnúť — inak by sa modul nedal zapnúť späť.
  D.modules = { recruiting: false, contracts: false, finance: false, accommodation: false };
  t('nastavenia zostanú dostupné vždy', D.routeAvailable('settings'));
  t('dashboard zostane dostupný vždy', D.routeAvailable('dashboard'));
  t('neznámy kľúč nie je obrazovka', !D.routeAvailable('nieco-co-neexistuje'));

  D.modules = restore; D.area = area;
}

// ── Peniaze a číselníky ────────────────────────────────────────────────────
t('knižnica Money je načítaná', sandbox.Money);
t('Money počíta v centoch',
  sandbox.Money && sandbox.Money.add(sandbox.Money.toCents('0,1'), sandbox.Money.toCents('0,2')) === 30);
t('knižnica Enums je načítaná', sandbox.Enums);
t('Enums majú jednotky aj bez databázy',
  sandbox.Enums && sandbox.Enums.label('unit', 'h') === 'hodina');

// ── Zdieľané komponenty ────────────────────────────────────────────────────
const Sh = sandbox.Shell;
t('komponenty Shell sú načítané', Sh);
if (Sh) {
  t('detail sa poskladá s bočným panelom',
    Sh.detail({ title: 'x', body: 'b', aside: 'a' }).includes('dt-aside'));
  t('poznámky nemajú ako zmazať',
    !Sh.notes({ notes: [{ body: 'x' }], onAdd: 'f()' }).includes('trash'));
  t('súčty formátujú sumy cez Money',
    Sh.sums({ lines: [{ label: 'x', cents: 873600 }] }).includes('8 736,00'));
  t('blokátor povie prečo',
    Sh.blocker({ reasons: [{ rule: 'missing_a1', label: 'Chýba A1' }] }).includes('Chýba A1'));
  t('dôvod výnimky sedí s CHECK v migrácii 013', Sh.REASON_MIN === 5);
}

// ── Doklady živnostníka ────────────────────────────────────────────────────
const Docs = sandbox.DanubraDocs;
t('knižnica DanubraDocs je načítaná', Docs);
if (Docs) {
  t('A1 má dlhší horizont než tridsať dní', Docs.horizonOf({ kind: 'a1' }) > 30);
  t('bez dokladov sa nenasadzuje', Docs.readiness({ docs: [] }).ok === false);
  t('chýbajúce A1 má vlastný kľúč výnimky',
    Docs.readiness({ docs: [] }).reasons.some(r => r.rule === 'missing_a1'));
  t('prázdny fakturačný profil blokuje', Docs.billingReady({}).ok === false);
  // Že kľúče sedia s číselníkom override_rule, kontroluje documents.test.js —
  // tu stačí, že každá požiadavka nejaký kľúč má.
  t('každá požiadavka na doklad má kľúč výnimky',
    Object.values(Docs.REQUIRED).flat().every(r => typeof r.rule === 'string' && r.rule));
}
t('prevod kandidáta ide cez databázovú funkciu',
  sandbox.Cand && /DB\.rpc\(['"]convert_candidate/.test(String(sandbox.Cand.convert)));
t('DB má rpc helper', sandbox.DB && typeof sandbox.DB.rpc === 'function');
t('typy dokladov sa berú z číselníka',
  sandbox.Wrk && typeof sandbox.Wrk.docKinds === 'function' && sandbox.Wrk.docKinds().length > 0);

// ── Partie ─────────────────────────────────────────────────────────────────
const Cr = sandbox.DanubraCrews;
t('knižnica DanubraCrews je načítaná', Cr);
t('modul Crews', sandbox.Crews);
if (Cr) {
  // R5 je tvrdé pravidlo — nesmie sa dať prepnúť.
  t('za partiu fakturuje každý sám (R5)',
    Cr.invoicePlan({ members: [], workers: [] }).perMember === true);
  t('a je napísané prečo',
    Cr.invoicePlan({ members: [], workers: [] }).note.includes('Arbeitnehmerüberlassung'));
  t('prázdna partia sa nenasadzuje', Cr.review({}).ok === false);
  // Členstvo má trvanie — bez toho by sa spätne nedalo povedať, kto kde bol.
  const hist = [{ worker_id: 'w1', joined_at: '2026-01-01', left_at: '2026-06-01' }];
  t('bývalý člen sa v minulosti nájde', Cr.wasMember(hist, 'w1', '2026-03-01'));
  t('a v prítomnosti už nie', !Cr.wasMember(hist, 'w1', '2026-09-01'));
}
t('partie nemajú ako vystaviť spoločnú faktúru',
  sandbox.Crews && !/faktúr[au] za partiu/i.test(String(sandbox.Crews.detail)));

// ── Platobná disciplína odberateľa ─────────────────────────────────────────
const Pay = sandbox.DanubraPayment;
t('knižnica DanubraPayment je načítaná', Pay);
if (Pay) {
  t('bez uhradenej faktúry sa nehodnotí',
    Pay.suggestRating(Pay.discipline([])).rating === null);
  t('disciplína počíta v centoch',
    Pay.discipline([{ total: 0.1, status: 'sent', due_date: '2099-01-01' },
                    { total: 0.2, status: 'sent', due_date: '2099-01-01' }]).outstanding === 30);
}
// Faktúry sa viažu na odberateľa cez partner_id, nie cez client_id —
// ten patrí agende ubytovania (R4).
t('odberateľ číta faktúry cez partner_id',
  sandbox.Prt && /i\.partner_id === id/.test(String(sandbox.Prt.detail)));

// ── Ponuky a zmluvy ────────────────────────────────────────────────────────
const Qt = sandbox.DanubraQuotes;
t('knižnica DanubraQuotes je načítaná', Qt);
t('modul Quo', sandbox.Quo);
t('modul Con', sandbox.Con);
if (Qt) {
  // Réžia patrí do marže. Bez nej ponuka vyzerá lepšie, než je.
  t('marža sa počíta po odpočítaní réžie',
    Qt.margin({ charge_rate: 34, worker_rate: 26, overhead_per_hour: 4 }).perHour === 400);
  // Dva blokátory, ktoré nesmú byť len odporúčanie.
  t('na ponuke so stratou sa nedá pokračovať',
    Qt.review({ partner_id: 'p', charge_rate: 20, worker_rate: 26 }).reasons
      .some(r => r.rule === 'quote_negative_margin'));
  t('sadzba pod minimálnou mzdou blokuje',
    Qt.review({ partner_id: 'p', charge_rate: 40, worker_rate: 14 }).reasons
      .some(r => r.rule === 'below_min_wage'));
  t('odmietnutá ponuka sa nevracia medzi rozpracované', !Qt.canGo('rejected', 'draft'));
  t('predmet diela sa z ponuky nepredvyplní', Qt.toContract({ title: 'x' }).scope === null);
}
// Čísla prideľuje databáza transakčne — vlastné číslovanie v JS by spravilo
// dieru alebo duplicitu, keď kliknú dvaja naraz.
t('ponuky číslujú cez databázu',
  sandbox.Quo && /danubra_next_number/.test(String(sandbox.Quo.nextNumber)));
t('zmluvy číslujú cez databázu',
  sandbox.Con && /danubra_next_number/.test(String(sandbox.Con.nextNumber)));
// Dodatok sa zapisuje pred úpravou zmluvy — opačné poradie trigger odmietne.
t('dodatok sa zapisuje pred úpravou zmluvy', sandbox.Con && (() => {
  const src = String(sandbox.Con.saveAmendment);
  return src.indexOf("insert('contract_amendments'") < src.indexOf("update('contracts'");
})());

// ── Uzávierka obdobia ──────────────────────────────────────────────────────
const Per = sandbox.DanubraPeriods;
t('knižnica DanubraPeriods je načítaná', Per);
if (Per) {
  const asg = [{ id: 'a1', charge_rate: 34, worker_rate: 26 }];
  const rows = [
    { id: '1', assignment_id: 'a1', worker_id: 'w1', work_date: '2026-09-05',
      hours: 8, activity_type: 'construction', approved: true },
    { id: '2', assignment_id: 'a1', worker_id: 'w1', work_date: '2026-09-06',
      hours: 8, activity_type: 'construction', approved: false },
  ];
  const pv = Per.preview({ timesheets: rows, assignments: asg,
    from: '2026-09-01', to: '2026-09-30' });
  // Do podkladu idú len schválené hodiny — rovnako ako v danubra_close_period().
  t('do podkladu idú len schválené hodiny', pv.hours.construction === 8);
  t('podklad počíta v centoch', pv.charged === 27200 && pv.cost === 20800);
  t('neschválené hodiny sa nestratia, len sa vyčlenia', pv.unapproved.length === 1);
  t('prázdne obdobie sa neuzatvára',
    Per.review({ timesheets: [], assignments: asg, from: '2026-09-01', to: '2026-09-30' }).ok === false);
  t('obdobie je celý kalendárny mesiac',
    Per.nextPeriod([], '2026-09-17').to === '2026-09-30');
  t('február sa počíta správne', Per.lastOfMonth('2028-02-01') === '2028-02-29');
}
// Uzávierka aj otvorenie späť idú cez databázu — v UI by sa nedalo zaručiť,
// že sa súčty zmrazia v tej istej transakcii ako zmena stavu.
t('uzávierka ide cez databázu',
  sandbox.Sub && /rpc\('close_period'/.test(String(sandbox.Sub.closePeriod)));
t('otvorenie späť pýta dôvod',
  sandbox.Sub && /p_reason/.test(String(sandbox.Sub.reopenPeriod)));
t('partia sa nasadzuje jednou operáciou',
  sandbox.Sub && /rpc\('assign_crew'/.test(String(sandbox.Sub.assignCrew)));

// ── Vydaná faktúra ─────────────────────────────────────────────────────────
const Ivc = sandbox.DanubraInvoice;
t('knižnica DanubraInvoice je načítaná', Ivc);
if (Ivc) {
  // Tvrdé pravidlo zo zadania. Musí sedieť s triggerom v migrácii 018.
  t('faktúra sa nevystaví bez schválenia', !Ivc.canGo('draft', 'issued')
    && !Ivc.canGo('pending_approval', 'issued'));
  t('schválená faktúra sa neodošle sama', !Ivc.canGo('approved', 'sent'));
  t('vystavená sa nevracia do rozpracovaných', !Ivc.canGo('issued', 'draft'));
  // §48b: do dokladu ide plná suma, zrážka sa zobrazuje zvlášť.
  const w = Ivc.withholding({ total: 8736, withholding_pct: 15 });
  t('zrážka §48b sa počíta z plnej sumy', w.withheld === 131040 && w.net === 742560);
  t('zrážka a zvyšok dajú presne celok', w.withheld + w.net === w.gross);
  t('reverse charge má nulovú sadzbu',
    Ivc.sfPayload({ invoice: { total: 100, vat_regime: 'reverse_charge' },
      partner: { name: 'X' } }).InvoiceItem[0].tax === 0);
}
t('faktúra v2 sa pozná podľa odberateľa alebo podkladu',
  sandbox.Inv && sandbox.Inv.isV2({ partner_id: 'x' })
  && !sandbox.Inv.isV2({ client_id: 'y' }));
// Kľúč SuperFaktúry nesmie byť nikde v prehliadači.
t('v prehliadači nie je kľúč SuperFaktúry',
  !files.some(f => /SF_API_KEY|SFAPI /.test(
    fs.readFileSync(path.join(root, f), 'utf8'))));
t('vystavenie ide cez serverovú funkciu',
  sandbox.Inv && /netlify\/functions\/danubra-sf-invoice/.test(String(sandbox.Inv.sfAction)));

// ── Prijaté faktúry a náklady ──────────────────────────────────────────────
const Bl = sandbox.DanubraBills;
t('knižnica DanubraBills je načítaná', Bl);
t('modul Cost', sandbox.Cost);
if (Bl) {
  const ctx = {
    assignments: [{ id: 'a1', worker_rate: 26 }],
    timesheets: [{ assignment_id: 'a1', worker_id: 'w1', period_id: 'p1',
      hours: 100, approved: true }],
    worker: { id: 'w1' },
  };
  // Jadro F7: živnostník vyfakturuje viac, než odrobil.
  const more = Bl.check({ worker_id: 'w1', period_id: 'p1', amount: 3200 }, ctx);
  t('rozdiel voči odrobeným hodinám sa dopočíta', more.variance === 60000);
  t('faktúra s rozdielom ide do sporu', more.status === 'disputed');
  t('a nedá sa len tak schváliť',
    Bl.review({ bill: { worker_id: 'w1', period_id: 'p1', amount: 3200 }, ...ctx })
      .reasons.some(r => r.rule === 'bill_variance'));
  t('sediaca faktúra prejde',
    Bl.check({ worker_id: 'w1', period_id: 'p1', amount: 2600 }, ctx).matches === true);
  // Tolerancia kryje zaokrúhľovanie, nie „skoro sedí".
  t('tolerancia je jeden cent', Bl.TOLERANCE === 1);
  // Sporná faktúra ešte nie je záväzok.
  t('sporné faktúry sa nepočítajú do nákladov',
    Bl.economics({ bills: [{ amount: 1000, status: 'disputed' }] }).bills === 0);
}

// ── Banka a cash-flow ──────────────────────────────────────────────────────
const Bnk = sandbox.DanubraBank;
t('knižnica DanubraBank je načítaná', Bnk);
t('modul Bank', sandbox.Bank);
if (Bnk) {
  // Import musí zvládnuť to, čo naozaj vypadne z internet bankingu.
  const r = Bnk.parseCsv('﻿Dátum;Suma;VS\n05.10.2026;1 234,56;2026001');
  t('výpis sa prečíta aj s BOM a slovenským zápisom čísla',
    r.rows.length === 1 && r.rows[0].amount === 123456);
  t('každý pohyb dostane odtlačok', !!r.rows[0].import_hash);
  // Ten istý riadok dvakrát v jednom súbore sa naimportuje raz.
  const dup = Bnk.parseCsv('Datum;Suma\n05.10.2026;100,00\n05.10.2026;100,00');
  t('duplicita v jednom súbore sa zachytí', dup.rows.length === 1);
  // Nečitateľné riadky sa nezahadzujú ticho.
  t('nečitateľný riadok sa vypíše, nezahodí',
    Bnk.parseCsv('Datum;Suma\n05.10.2026;nezmysel').skipped.length === 1);
  // Toto je tá otázka, na ktorú cash-flow odpovedá.
  const tight = Bnk.forecast({
    balance: 100000, weeks: 4, today: '2026-10-01',
    items: [{ expected_on: '2026-10-03', amount: -5000 }],
  });
  t('chýbajúce peniaze na výplaty sa ukážu dopredu', !!tight.negativeFrom);
  t('a škálovanie sa zablokuje',
    Bnk.scaleCheck(tight, {}).reasons.some(r2 => r2.rule === 'cash_negative'));
}

// ── Úlohy a pravidlá ───────────────────────────────────────────────────────
const Tk = sandbox.DanubraTasks;
t('knižnica DanubraTasks je načítaná', Tk);
if (Tk) {
  const TD = '2026-09-17';
  const rows = [
    { id: '1', due_date: '2026-09-10', status: 'open', priority: 'normal' },
    { id: '2', due_date: '2026-09-17', status: 'open', priority: 'normal' },
    { id: '3', due_date: '2026-09-17', status: 'open', postponed_to: '2026-11-01' },
  ];
  // Zoznam sa triedi podľa toho, čo horí — nie podľa dátumu vzniku.
  t('úlohy sa triedia podľa toho, čo horí',
    Tk.group(rows, TD).map(g => g.key).join(',') === 'overdue,today');
  // Odloženie nie je zmazanie.
  t('odložená úloha sa dnes neukáže', !Tk.isActive(rows[2], TD));
  t('ale nie je stratená', Tk.counts(rows, TD).snoozed === 1);
  // Prvé, čo treba prečítať, je veta, nie tabuľka.
  t('dashboard začína vetou, nie číslom', /vec|veci|vecí|nehorí/.test(Tk.headline(rows, TD).text));
  t('bez úloh je to pokoj', Tk.headline([], TD).tone === 'ok');
  // Pravidlo sa dá vysvetliť po slovensky.
  t('pravidlo sa dá vysvetliť',
    Tk.describeRule({ source_table: 'danubra_worker_documents', date_field: 'valid_to',
      days_before: 60, task_title_template: 'x {label}' }).what === 'doklad pracovníka');
}
t('modul úloh vie zobraziť pravidlá',
  sandbox.Tsk && typeof sandbox.Tsk.rulesView === 'function');

// ── Výnimky z blokátorov ───────────────────────────────────────────────────
// Sľúbené vo F1, dopracované až tu: blokátor ich vie nielen vykresliť,
// ale aj zapísať.
t('kartotéka vie zapísať výnimku',
  sandbox.Wrk && typeof sandbox.Wrk.grantOverride === 'function');
t('a zrušiť ju cez revoked_at, nie zmazaním',
  sandbox.Wrk && /revoked_at/.test(String(sandbox.Wrk.revokeOverride))
  && !/DB\.remove\('overrides'/.test(String(sandbox.Wrk.revokeOverride)));
t('výnimka bez poriadneho dôvodu neprejde ani v UI',
  sandbox.Wrk && /reasonValid/.test(String(sandbox.Wrk.grantOverride)));

// ── Serverové funkcie ──────────────────────────────────────────────────────
// Netlify robí z každého súboru v `netlify/functions/` funkciu a názov smie
// mať len písmená, číslice, pomlčky a podčiarkovníky. Súbor s bodkou
// v názve — napríklad `nieco.test.js` — zhodí celý deploy, nie len seba.
// Stálo to jeden červený build, takže to odteraz stráži test.
{
  const fnDir = path.join(root, '..', 'netlify', 'functions');
  const entries = fs.existsSync(fnDir)
    ? fs.readdirSync(fnDir, { withFileTypes: true })
      .filter(e => e.isFile() && e.name.endsWith('.js'))
      .map(e => e.name)
    : [];
  const bad = entries.filter(n => !/^[A-Za-z0-9_-]+\.js$/.test(n));
  t(`názvy serverových funkcií sú platné${bad.length ? ' — chybné: ' + bad.join(', ') : ''}`,
    !bad.length);
  const noHandler = entries.filter(n =>
    !/exports\.handler|export\s+(default|const handler)/.test(
      fs.readFileSync(path.join(fnDir, n), 'utf8')));
  t(`každá serverová funkcia má handler${noHandler.length ? ' — chýba: ' + noHandler.join(', ') : ''}`,
    !noHandler.length);
}

// ── Prepínač agend v nastaveniach ──────────────────────────────────────────
// Ak sa agenda dá vypnúť len v SQL, nikto ju nezapne späť.
const Cfg = sandbox.Cfg;
t('nastavenia vedia prepínať agendy', Cfg && typeof Cfg.toggleModule === 'function');
t('prepínač pozná všetky agendy',
  Cfg && D && Cfg.MODULES.length === Object.keys(D.modules).length);
t('každá agenda z prepínača má význam v navigácii',
  Cfg && D && Cfg.MODULES.every(([k]) =>
    D.allNav().some(n => D.moduleOf(n) === k) || D.areas.some(a => a[0] === k)));

let bad = 0;
for (const [name, ok] of checks) { console.log((ok ? '  ✓ ' : '  ✗ ') + name); if (!ok) bad++; }
for (const f of failures) console.log('  ! ' + f);
console.log(bad ? `\n${bad} zlyhalo\n` : `\nrozhranie sa poskladá (${loaded} súborov)\n`);
process.exit(bad ? 1 : 0);
