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
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const files = [...html.matchAll(/<script src="\.\/([^"]+)"><\/script>/g)].map(m => m[1]);

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
t('mega menu ukazuje všetky zapnuté agendy',
  D && D.visibleAreas().every(a => D.megaHtml().includes(a[1])));
// na mobile sa bočný panel neotvára, takže toto musí byť v mega menu
t('mega menu má odhlásenie', D && D.megaHtml().includes('Odhlásiť sa'));

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
