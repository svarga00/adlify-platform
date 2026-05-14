// Admin screens — part 1: Dashboard, Leads, Lead Detail, Clients, Client Detail

const ADMIN_W = 1280;
const ADMIN_H = 820;

// ───────────────────────────────────────────────────── Dashboard
// cardStyle: 'hero' (big numbers + sparklines) | 'grid' (current-like) | 'list' (denser list)
const ScreenDashboard = ({ cardStyle = 'hero' }) => {
  const pipelineData = [
    { label:'Nové', value: 86, color:'var(--brand-500)' },
    { label:'Ready', value: 42, color:'var(--acc-lavender-ink)' },
    { label:'Kontaktované', value: 39, color:'var(--acc-sky-ink)' },
    { label:'Klienti', value: 15, color:'var(--acc-mint-ink)' },
  ];
  const weekData = [3,6,4,7,3,8,5];
  const weekLabels = ['ne','po','ut','st','št','pi','so'];

  return <AppFrame mode="admin" active="Dashboard" title="Dashboard" sub="Prehľad · dnes · 18. apríla 2026"
    topRight={<Btn variant="primary" size="sm" icon={<I.Plus size={14}/>}>Nový lead</Btn>}>

    {cardStyle === 'hero' && (
      <div style={{display:'grid', gridTemplateColumns:'2fr 1fr', gap:16, marginBottom:16}}>
        <div style={{background:'linear-gradient(135deg, var(--brand-500), var(--brand-700))', color:'#fff',
          borderRadius:16, padding:'24px 28px', position:'relative', overflow:'hidden'}}>
          <div style={{position:'absolute', right:-40, top:-40, width:240, height:240,
            background:'radial-gradient(circle, rgba(255,255,255,.18), transparent 70%)'}}/>
          <div style={{fontSize:11, textTransform:'uppercase', letterSpacing:1, opacity:.8, fontWeight:600}}>Mesačný príjem · MRR</div>
          <div style={{fontSize:56, fontWeight:700, letterSpacing:-2, lineHeight:1.05, marginTop:6}}>5 416 <span style={{fontSize:28, opacity:.8}}>€</span></div>
          <div style={{display:'flex', gap:16, marginTop:10, alignItems:'center'}}>
            <div className="mono" style={{fontSize:12, background:'rgba(255,255,255,.18)', padding:'3px 8px', borderRadius:999}}>+12.4% vs. marec</div>
            <div style={{fontSize:12, opacity:.85}}>15 aktívnych klientov · priemer 361 €/klient</div>
          </div>
          <div style={{marginTop:18}}><Line data={[3100,3450,3600,4100,4200,4800,4950,5200,5416]} color="#fff" w={440} h={50} fill/></div>
        </div>
        <div style={{display:'grid', gridTemplateRows:'1fr 1fr', gap:12}}>
          <Stat label="Leady celkom" value="182" delta={12} hint="+22 tento týždeň"/>
          <Stat label="Aktívni klienti" value="15" delta={8} hint="2 novo v apríli"/>
        </div>
      </div>
    )}

    {cardStyle === 'grid' && (
      <div style={{display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12, marginBottom:16}}>
        <Stat label="Leadov celkom" value="182" hint="Všetky"/>
        <Stat label="Na analýzu" value="86" tone="lav" hint="Nové"/>
        <Stat label="Na kontakt" value="42" tone="brand" hint="Ready"/>
        <Stat label="Klienti" value="15" tone="mint" hint="Aktívni"/>
        <Stat label="Mesačný príjem" value="5 416 €" accent="hero" hint="MRR"/>
      </div>
    )}

    {cardStyle === 'list' && (
      <div style={{background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, marginBottom:16, overflow:'hidden'}}>
        {[
          ['Leady celkom','182','+22 tento týždeň', '+12%'],
          ['Na analýzu','86','Nová várka domén', null],
          ['Ready na kontakt','42','Priemerné skóre 84', null],
          ['Aktívni klienti','15','2 novo v apríli', '+8%'],
          ['Mesačný príjem','5 416 €','MRR · priemer 361 €/klient', '+12%'],
        ].map((r,i)=><div key={i} style={{display:'grid', gridTemplateColumns:'1fr 140px 1fr 80px', gap:20, padding:'14px 20px', borderTop:i?'1px solid var(--border)':'none', alignItems:'center'}}>
          <div style={{fontSize:12, color:'var(--ink-sub)', textTransform:'uppercase', letterSpacing:.8, fontWeight:600}}>{r[0]}</div>
          <div style={{fontSize:22, fontWeight:600, letterSpacing:-.6}}>{r[1]}</div>
          <div style={{fontSize:12, color:'var(--ink-sub)'}}>{r[2]}</div>
          <div>{r[3] && <Chip tone="ok" size="sm">{r[3]}</Chip>}</div>
        </div>)}
      </div>
    )}

    <div style={{display:'grid', gridTemplateColumns:'1.1fr 1fr', gap:16, marginBottom:16}}>
      <Card title="Pipeline" right={<Btn variant="ghost" size="sm">Detail <I.Chevron size={12}/></Btn>}>
        <div style={{display:'flex', gap:24, alignItems:'center'}}>
          <div style={{position:'relative'}}>
            <Donut data={pipelineData} size={180} thick={24}/>
            <div style={{position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center'}}>
              <div style={{fontSize:24, fontWeight:600, letterSpacing:-.6}}>182</div>
              <div style={{fontSize:10, color:'var(--ink-mute)', textTransform:'uppercase', letterSpacing:.8}}>leadov</div>
            </div>
          </div>
          <div style={{flex:1, display:'flex', flexDirection:'column', gap:10}}>
            {pipelineData.map((d,i)=><div key={i} style={{display:'flex', alignItems:'center', gap:10, padding:'8px 10px', background:'var(--n-50)', borderRadius:8}}>
              <span style={{width:8, height:8, borderRadius:99, background:d.color}}/>
              <span style={{flex:1, fontSize:13, fontWeight:500}}>{d.label}</span>
              <span className="mono" style={{fontSize:13, fontWeight:600}}>{d.value}</span>
              <span style={{fontSize:11, color:'var(--ink-mute)', width:40, textAlign:'right'}}>{Math.round(d.value/182*100)}%</span>
            </div>)}
          </div>
        </div>
      </Card>
      <Card title="Aktivita (7 dní)" right={<Chip tone="mint" size="sm">+14%</Chip>}>
        <div style={{padding:'6px 0'}}>
          <Sparkbars data={weekData} labels={weekLabels} w={420} h={140}/>
          <div style={{display:'flex', justifyContent:'space-between', marginTop:12, fontSize:11, color:'var(--ink-mute)'}}>
            <span>Nových leadov: <strong style={{color:'var(--ink)'}}>36</strong></span>
            <span>Kontaktov: <strong style={{color:'var(--ink)'}}>24</strong></span>
            <span>Konverzií: <strong style={{color:'var(--ink)'}}>3</strong></span>
          </div>
        </div>
      </Card>
    </div>

    <div style={{display:'grid', gridTemplateColumns:'1fr 1.2fr 1fr', gap:16}}>
      <Card title="Rýchle akcie">
        {[
          {i:'Upload', t:'Import leadov', s:'Hromadný import domén', tone:'sky'},
          {i:'Sparkle', t:'Analyzovať všetky nové', s:'AI + Marketing Miner', tone:'lav'},
          {i:'Plus', t:'Nový klient', s:'Pridať manuálne', tone:'mint'},
          {i:'Megaphone', t:'Spustiť kampaň', s:'FB / Google', tone:'amber'},
        ].map((a,i)=>{
          const Ic = I[a.i];
          return <div key={i} style={{display:'flex', gap:12, padding:'10px', borderRadius:10, cursor:'pointer',
            background: i===1?'var(--acc-lavender)':'transparent', marginBottom:4}}>
            <div style={{width:36, height:36, borderRadius:9, background: `var(--acc-${a.tone==='sky'?'sky':a.tone==='lav'?'lavender':a.tone==='mint'?'mint':'amber'})`,
              color:`var(--acc-${a.tone==='sky'?'sky':a.tone==='lav'?'lavender':a.tone==='mint'?'mint':'amber'}-ink)`,
              display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
              <Ic size={16}/>
            </div>
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontSize:13, fontWeight:600}}>{a.t}</div>
              <div style={{fontSize:11, color:'var(--ink-sub)'}}>{a.s}</div>
            </div>
            <I.Chevron size={14} color="var(--ink-mute)"/>
          </div>;
        })}
      </Card>

      <Card title="Posledné leady" right={<Btn variant="ghost" size="sm">Všetky <I.ArrowRight size={12}/></Btn>} pad={0}>
        {[
          ['pekaren-jablko.sk', 'Kontaktovaný', 'brand', 92],
          ['autoservis-kovacik.sk', 'Ready', 'lav', 88],
          ['kvety-orchidea.sk', 'Nový', 'sky', 76],
          ['zubar-novak.sk', 'Kontaktovaný', 'brand', 84],
          ['fitness-dynamic.sk', 'Ready', 'lav', 79],
        ].map((r,i)=><div key={i} style={{
          display:'flex', alignItems:'center', gap:12, padding:'12px 18px',
          borderTop: i?'1px solid var(--border)':'none'
        }}>
          <div style={{width:32, height:32, borderRadius:8, background:'var(--n-75)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:600, color:'var(--ink-sub)'}}>{r[0][0].toUpperCase()}</div>
          <div style={{flex:1, minWidth:0}}>
            <div style={{fontSize:13, fontWeight:500, letterSpacing:-.1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{r[0]}</div>
            <div style={{fontSize:11, color:'var(--ink-mute)'}}>skóre {r[3]} · 20. 3. 2026</div>
          </div>
          <Chip tone={r[2]} size="sm" dot>{r[1]}</Chip>
        </div>)}
      </Card>

      <Card title="Metriky">
        {[
          ['Konverzný pomer','8.2%', '+0.6%'],
          ['Priemerné skóre','84', '+3'],
          ['Nové tento týždeň','22', '+8'],
          ['Čakajúce úlohy','14', null],
          ['Priemerný čas odpovede','2h 14m', '-18m'],
        ].map((m,i)=><div key={i} style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 2px', borderTop:i?'1px solid var(--border)':'none'}}>
          <span style={{fontSize:13, color:'var(--ink-sub)'}}>{m[0]}</span>
          <span style={{display:'flex', alignItems:'center', gap:8}}>
            <strong className="mono" style={{fontSize:13, fontWeight:600}}>{m[1]}</strong>
            {m[2] && <Chip tone={m[2].startsWith('-')?'err':'ok'} size="sm">{m[2]}</Chip>}
          </span>
        </div>)}
      </Card>
    </div>
  </AppFrame>;
};

// ───────────────────────────────────────────────────── Leads list
const ScreenLeads = () => {
  const rows = [
    ['pekaren-jablko.sk','Pekáreň Jablko','Gastro','Kontaktovaný','brand',92,'20. 3.'],
    ['autoservis-kovacik.sk','Autoservis Kováčik','Autá','Ready','lav',88,'20. 3.'],
    ['kvety-orchidea.sk','Kvety Orchidea','Remeslo','Nový','sky',76,'19. 3.'],
    ['zubar-novak.sk','MUDr. Novák','Zdravie','Kontaktovaný','brand',84,'19. 3.'],
    ['fitness-dynamic.sk','Fitness Dynamic','Zdravie','Ready','lav',79,'18. 3.'],
    ['kaviaren-latte.sk','Kaviareň Latté','Gastro','Nový','sky',72,'18. 3.'],
    ['instalater-rapid.sk','Inštalatér Rapid','Remeslo','Ready','lav',81,'17. 3.'],
    ['cukraren-marta.sk','Cukráreň Marta','Gastro','Nový','sky',68,'17. 3.'],
    ['kosmetika-luna.sk','Kozmetika Luna','Krása','Klient','mint',94,'15. 3.'],
    ['bistro-verde.sk','Bistro Verde','Gastro','Odmietnutý','err',52,'14. 3.'],
  ];

  const tabs = [['Všetky', 182], ['Nové', 86], ['Ready', 42], ['Kontaktované', 39], ['Klienti', 15]];

  return <AppFrame mode="admin" active="Leady" title="Leady" sub="182 záznamov"
    topRight={<>
      <Btn variant="outline" size="sm" icon={<I.Upload size={14}/>}>Import</Btn>
      <Btn variant="outline" size="sm" icon={<I.Sparkle size={14}/>}>Analyzovať (12)</Btn>
      <Btn variant="primary" size="sm" icon={<I.Plus size={14}/>}>Nový lead</Btn>
    </>}>

    <div style={{display:'flex', gap:4, marginBottom:16, borderBottom:'1px solid var(--border)'}}>
      {tabs.map((t,i)=><button key={i} style={{
        padding:'10px 14px', fontSize:13, fontWeight:500,
        color: i===0?'var(--ink)':'var(--ink-sub)',
        borderBottom: i===0?'2px solid var(--brand-500)':'2px solid transparent',
        marginBottom:-1, display:'flex', gap:6, alignItems:'center'
      }}>
        {t[0]}
        <span style={{fontSize:11, color:'var(--ink-mute)', background:'var(--n-75)', padding:'1px 6px', borderRadius:99}}>{t[1]}</span>
      </button>)}
    </div>

    <div style={{display:'flex', gap:8, marginBottom:14}}>
      <div style={{display:'flex', alignItems:'center', gap:8, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:9, padding:'6px 10px', flex:1}}>
        <I.Search size={14} color="var(--ink-mute)"/>
        <div style={{flex:1, fontSize:13, color:'var(--ink-mute)'}}>Filtrovať doménu, odvetvie, skóre…</div>
      </div>
      <Btn variant="outline" size="sm" icon={<I.Filter size={14}/>}>Odvetvie</Btn>
      <Btn variant="outline" size="sm" icon={<I.Filter size={14}/>}>Skóre ≥ 70</Btn>
      <Btn variant="outline" size="sm">Zdroj</Btn>
      <div style={{width:1, background:'var(--border)', margin:'0 4px'}}/>
      <Btn variant="outline" size="sm">Export <I.Download size={12}/></Btn>
    </div>

    <div style={{background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden'}}>
      <div style={{display:'grid', gridTemplateColumns:'32px 2.3fr 1fr 1.2fr 1.4fr 80px 100px 40px', padding:'10px 16px', background:'var(--n-50)', borderBottom:'1px solid var(--border)', fontSize:11, fontWeight:600, color:'var(--ink-sub)', textTransform:'uppercase', letterSpacing:.8, alignItems:'center', gap:12}}>
        <input type="checkbox"/>
        <span>Doména / Spoločnosť</span>
        <span>Odvetvie</span>
        <span>Status</span>
        <span>Skóre & výkon</span>
        <span>Pridané</span>
        <span>Priradený</span>
        <span></span>
      </div>
      {rows.map((r,i)=><div key={i} style={{
        display:'grid', gridTemplateColumns:'32px 2.3fr 1fr 1.2fr 1.4fr 80px 100px 40px',
        padding:'14px 16px', borderTop: i?'1px solid var(--border)':'none', alignItems:'center', gap:12
      }}>
        <input type="checkbox"/>
        <div style={{minWidth:0}}>
          <div style={{fontSize:13, fontWeight:600, letterSpacing:-.1, display:'flex', alignItems:'center', gap:6}}>
            {r[0]}
            <I.External size={11} color="var(--ink-mute)"/>
          </div>
          <div style={{fontSize:11, color:'var(--ink-sub)'}}>{r[1]}</div>
        </div>
        <Chip tone="n" size="sm">{r[2]}</Chip>
        <Chip tone={r[4]} size="sm" dot>{r[3]}</Chip>
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          <span className="mono" style={{fontSize:13, fontWeight:600, color: r[5]>85?'var(--ok)':r[5]>70?'var(--ink)':'var(--ink-sub)', width:22}}>{r[5]}</span>
          <div style={{flex:1, maxWidth:100, height:5, background:'var(--n-75)', borderRadius:99, overflow:'hidden'}}>
            <div style={{width:`${r[5]}%`, height:'100%', background: r[5]>85?'var(--ok)':'var(--brand-500)'}}/>
          </div>
        </div>
        <span style={{fontSize:12, color:'var(--ink-sub)'}}>{r[6]}</span>
        <div style={{display:'flex', alignItems:'center', gap:6}}>
          <Avatar name={i%2? "Štefan Varga":"Lucia M"} size={22}/>
          <span style={{fontSize:11, color:'var(--ink-sub)'}}>{i%2?'ŠV':'LM'}</span>
        </div>
        <I.More size={16} color="var(--ink-mute)"/>
      </div>)}
    </div>
  </AppFrame>;
};

// ───────────────────────────────────────────────────── Lead Detail
const ScreenLeadDetail = () => (
  <AppFrame mode="admin" active="Leady"
    breadcrumbs={["Leady", "Ready", "pekaren-jablko.sk"]}
    title="pekaren-jablko.sk"
    sub="Pekáreň Jablko · Gastro · Bratislava"
    topRight={<>
      <Btn variant="outline" size="sm" icon={<I.Phone size={14}/>}>Zavolať</Btn>
      <Btn variant="outline" size="sm" icon={<I.Mail size={14}/>}>Poslať email</Btn>
      <Btn variant="primary" size="sm" icon={<I.ArrowRight size={14}/>}>Konvertovať na klienta</Btn>
    </>}>
    <div style={{display:'grid', gridTemplateColumns:'1fr 320px', gap:16}}>
      <div style={{display:'flex', flexDirection:'column', gap:16}}>
        {/* Hero score */}
        <Card>
          <div style={{display:'flex', gap:24, alignItems:'center'}}>
            <div style={{position:'relative', width:120, height:120, flexShrink:0}}>
              <svg viewBox="0 0 100 100" width={120} height={120}>
                <circle cx="50" cy="50" r="42" fill="none" stroke="var(--n-75)" strokeWidth="10"/>
                <circle cx="50" cy="50" r="42" fill="none" stroke="var(--brand-500)" strokeWidth="10"
                  strokeDasharray={`${2*Math.PI*42*0.92} ${2*Math.PI*42}`} strokeLinecap="round"
                  transform="rotate(-90 50 50)"/>
              </svg>
              <div style={{position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center'}}>
                <div style={{fontSize:30, fontWeight:600, letterSpacing:-1}}>92</div>
                <div style={{fontSize:10, color:'var(--ink-mute)', textTransform:'uppercase', letterSpacing:.8}}>skóre</div>
              </div>
            </div>
            <div style={{flex:1}}>
              <div style={{display:'flex', gap:8, marginBottom:10}}>
                <Chip tone="mint" size="sm" dot>Ready na kontakt</Chip>
                <Chip tone="brand" size="sm">Vysoký potenciál</Chip>
                <Chip tone="n" size="sm">Zdroj: Marketing Miner</Chip>
              </div>
              <h3 style={{fontSize:18, fontWeight:600, margin:0, letterSpacing:-.3}}>Pekáreň Jablko s.r.o.</h3>
              <div style={{fontSize:13, color:'var(--ink-sub)', marginTop:4}}>
                Rodinná pekáreň, 3 pobočky · 12 zamestnancov · IČO 52 438 190
              </div>
              <div style={{display:'flex', gap:24, marginTop:14, fontSize:12, color:'var(--ink-sub)'}}>
                <span><I.Globe size={12}/> pekaren-jablko.sk</span>
                <span><I.Phone size={12}/> +421 905 123 456</span>
                <span><I.Mail size={12}/> info@pekaren-jablko.sk</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Tabs */}
        <div style={{display:'flex', gap:4, borderBottom:'1px solid var(--border)'}}>
          {['AI Analýza', 'Web & SEO', 'Sociálne siete', 'História', 'Poznámky'].map((t,i)=>
            <button key={i} style={{padding:'10px 14px', fontSize:13, fontWeight:500,
              color: i===0?'var(--ink)':'var(--ink-sub)',
              borderBottom: i===0?'2px solid var(--brand-500)':'2px solid transparent', marginBottom:-1}}>{t}</button>
          )}
        </div>

        <Card title="AI Analýza · Marketing Miner" right={<Chip tone="lav" size="sm" dot>Dokončené</Chip>}>
          <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:16}}>
            {[['Návštevnosť','2.4K','/mes'],['Odhadovaný obrat','18 400 €','/mes'],['Organic keywords','142',''],['Backlinks','38','']]
              .map((s,i)=><div key={i} style={{background:'var(--n-50)', borderRadius:10, padding:'12px 14px'}}>
                <div style={{fontSize:10, color:'var(--ink-mute)', textTransform:'uppercase', letterSpacing:.8, fontWeight:600}}>{s[0]}</div>
                <div style={{fontSize:18, fontWeight:600, letterSpacing:-.4, marginTop:2}}>{s[1]} <span style={{fontSize:11, color:'var(--ink-mute)', fontWeight:400}}>{s[2]}</span></div>
              </div>)}
          </div>
          <div style={{background:'var(--brand-50)', border:'1px solid var(--brand-100)', borderRadius:10, padding:'14px 16px'}}>
            <div style={{display:'flex', alignItems:'center', gap:8, fontSize:12, fontWeight:600, color:'var(--brand-700)', marginBottom:6, textTransform:'uppercase', letterSpacing:.8}}>
              <I.Sparkle size={14}/> AI odporúčanie
            </div>
            <div style={{fontSize:13, color:'var(--ink)', lineHeight:1.55}}>
              Pekáreň má silnú organickú návštevnosť (2.4K/mes), ale chýba jej remarketing a FB reklama. 
              <strong> Odporúčaný balík: Pro (249 €/mes)</strong> s dôrazom na lokálne cielenie v okruhu 15 km od pobočiek.
              Odhadovaný ROI po 3 mesiacoch: <strong className="mono" style={{color:'var(--ok)'}}>+42%</strong>.
            </div>
          </div>
        </Card>

        <Card title="Kontakty (3)">
          {[
            ['Martin Jabĺčko','Konateľ','martin@pekaren-jablko.sk','+421 905 123 456', true],
            ['Eva Jabĺčková','Finančná manažérka','eva@pekaren-jablko.sk','+421 908 987 654', false],
            ['Peter Novák','Marketing','marketing@pekaren-jablko.sk','', false],
          ].map((c,i)=><div key={i} style={{display:'flex', alignItems:'center', gap:14, padding:'10px 0', borderTop:i?'1px solid var(--border)':'none'}}>
            <Avatar name={c[0]} size={34}/>
            <div style={{flex:1}}>
              <div style={{fontSize:13, fontWeight:600, display:'flex', gap:6, alignItems:'center'}}>{c[0]} {c[4] && <Chip tone="brand" size="sm">Primárny</Chip>}</div>
              <div style={{fontSize:11, color:'var(--ink-sub)'}}>{c[1]} · {c[2]}</div>
            </div>
            {c[3] && <span style={{fontSize:12, color:'var(--ink-sub)', fontFamily:'var(--font-mono)'}}>{c[3]}</span>}
            <Btn variant="ghost" size="sm"><I.More size={14}/></Btn>
          </div>)}
        </Card>
      </div>

      {/* Right sidebar */}
      <div style={{display:'flex', flexDirection:'column', gap:16}}>
        <Card title="Akcie" pad={12}>
          {[
            ['Mail','Odoslať úvodný email', false],
            ['Phone','Zavolať · naplánovať', false],
            ['Sparkle','Vygenerovať ponuku (AI)', true],
            ['Template','Poslať pitch šablónu', false],
            ['Users','Priradiť inému tímu', false],
          ].map((a,i)=>{const Ic=I[a[0]]; return <div key={i} style={{display:'flex', gap:10, padding:'8px 10px', borderRadius:8, cursor:'pointer', background:a[2]?'var(--brand-50)':'transparent', color:a[2]?'var(--brand-700)':'var(--ink)'}}>
            <Ic size={16}/>
            <span style={{fontSize:13, flex:1, fontWeight:a[2]?600:500}}>{a[1]}</span>
            <I.Chevron size={12}/>
          </div>})}
        </Card>

        <Card title="Aktivita">
          {[
            ['Sparkle','AI analýza dokončená','pred 2h','lav'],
            ['Mail','Email otvorený 2×','včera','sky'],
            ['Eye','Web navštívený z FB','21. 3.','n'],
            ['Plus','Lead pridaný · import CSV','20. 3.','mint'],
          ].map((a,i)=>{const Ic=I[a[0]]; return <div key={i} style={{display:'flex', gap:10, alignItems:'flex-start', padding:'8px 0', borderTop:i?'1px dashed var(--border)':'none'}}>
            <div style={{width:28, height:28, borderRadius:8, background:`var(--acc-${a[3]==='lav'?'lavender':a[3]==='sky'?'sky':a[3]==='mint'?'mint':'sky'})`, color:`var(--acc-${a[3]==='lav'?'lavender':a[3]==='sky'?'sky':a[3]==='mint'?'mint':'sky'}-ink)`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, opacity:a[3]==='n'?.5:1}}><Ic size={13}/></div>
            <div style={{flex:1, fontSize:12}}>
              <div style={{fontWeight:500}}>{a[1]}</div>
              <div style={{color:'var(--ink-mute)', fontSize:11}}>{a[2]}</div>
            </div>
          </div>})}
        </Card>

        <Card title="Tagy & odporúčanie" pad={14}>
          <div style={{display:'flex', gap:6, flexWrap:'wrap', marginBottom:10}}>
            <Chip tone="amber" size="sm">lokálna</Chip>
            <Chip tone="mint" size="sm">e-shop</Chip>
            <Chip tone="sky" size="sm">3 pobočky</Chip>
            <Chip tone="rose" size="sm">rodinná</Chip>
          </div>
          <div style={{fontSize:11, color:'var(--ink-mute)', textTransform:'uppercase', letterSpacing:.8, marginTop:12, marginBottom:6}}>Odporúčaný balík</div>
          <div style={{padding:'12px', background:'var(--brand-50)', border:'1px solid var(--brand-100)', borderRadius:10, display:'flex', alignItems:'center', gap:10}}>
            <div style={{width:36, height:36, borderRadius:8, background:'var(--brand-500)', display:'flex', alignItems:'center', justifyContent:'center'}}><I.Star size={16} color="#fff"/></div>
            <div style={{flex:1}}>
              <div style={{fontSize:13, fontWeight:600}}>Pro · 249 €/mes</div>
              <div style={{fontSize:11, color:'var(--ink-sub)'}}>FB/IG + Google · 3 kampane</div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  </AppFrame>
);

// ───────────────────────────────────────────────────── Clients
const ScreenClients = () => {
  const rows = [
    ['Pekáreň Jablko','Gastro','Pro','Aktívny','mint','249','Štefan V.','4.9'],
    ['Kozmetika Luna','Krása','Enterprise','Aktívny','mint','399','Lucia M.','4.8'],
    ['MUDr. Novák','Zdravie','Starter','Aktívny','mint','149','Štefan V.','4.6'],
    ['Autoservis Kováčik','Autá','Pro','Pauza','amber','249','Peter K.','4.5'],
    ['Fitness Dynamic','Zdravie','Premium','Aktívny','mint','1250','Lucia M.','5.0'],
    ['Kvety Orchidea','Remeslo','Starter','Aktívny','mint','149','Peter K.','4.4'],
    ['Bistro Verde','Gastro','Pro','Onboarding','sky','249','Štefan V.','—'],
    ['Kaviareň Latté','Gastro','Starter','Aktívny','mint','149','Lucia M.','4.7'],
  ];
  return <AppFrame mode="admin" active="Klienti" title="Klienti" sub="15 aktívnych · 1 onboarding · 1 pauza"
    topRight={<Btn variant="primary" size="sm" icon={<I.Plus size={14}/>}>Nový klient</Btn>}>

    <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:16}}>
      <Stat label="Aktívni" value="15" hint="+2 v apríli"/>
      <Stat label="MRR" value="5 416 €" delta={12} hint="priemer"/>
      <Stat label="Priemerné NPS" value="4.7" hint="vynikajúce"/>
      <Stat label="Churn (30d)" value="0%" hint="žiadny"/>
    </div>

    <div style={{display:'flex', gap:8, marginBottom:14}}>
      <div style={{display:'flex', alignItems:'center', gap:8, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:9, padding:'6px 10px', flex:1}}>
        <I.Search size={14} color="var(--ink-mute)"/>
        <div style={{flex:1, fontSize:13, color:'var(--ink-mute)'}}>Hľadať klienta…</div>
      </div>
      <Btn variant="outline" size="sm">Balík</Btn>
      <Btn variant="outline" size="sm">Odvetvie</Btn>
      <Btn variant="outline" size="sm">Account manažér</Btn>
    </div>

    <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:12}}>
      {rows.map((r,i)=><div key={i} style={{
        background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:18, boxShadow:'var(--sh-sm)',
        display:'flex', flexDirection:'column', gap:10
      }}>
        <div style={{display:'flex', alignItems:'center', gap:10}}>
          <div style={{width:40, height:40, borderRadius:10, background:'var(--brand-50)', color:'var(--brand-700)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:14}}>{r[0][0]}</div>
          <div style={{flex:1, minWidth:0}}>
            <div style={{fontSize:14, fontWeight:600, letterSpacing:-.2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{r[0]}</div>
            <div style={{fontSize:11, color:'var(--ink-sub)'}}>{r[1]}</div>
          </div>
          <Chip tone={r[4]} size="sm" dot>{r[3]}</Chip>
        </div>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, padding:'10px 12px', background:'var(--n-50)', borderRadius:8}}>
          <div>
            <div style={{fontSize:10, color:'var(--ink-mute)', textTransform:'uppercase', letterSpacing:.8}}>Balík</div>
            <div style={{fontSize:13, fontWeight:600}}>{r[2]}</div>
          </div>
          <div>
            <div style={{fontSize:10, color:'var(--ink-mute)', textTransform:'uppercase', letterSpacing:.8}}>MRR</div>
            <div style={{fontSize:13, fontWeight:600, fontFamily:'var(--font-mono)'}}>{r[5]} €</div>
          </div>
        </div>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:11, color:'var(--ink-sub)'}}>
          <span style={{display:'flex', alignItems:'center', gap:6}}><Avatar name={r[6]} size={20}/> {r[6]}</span>
          <span style={{display:'flex', alignItems:'center', gap:4}}><I.Star size={12}/> {r[7]}</span>
        </div>
      </div>)}
    </div>
  </AppFrame>;
};

// ───────────────────────────────────────────────────── Client Detail
const ScreenClientDetail = () => (
  <AppFrame mode="admin" active="Klienti"
    breadcrumbs={["Klienti","Pekáreň Jablko"]}
    title="Pekáreň Jablko s.r.o."
    sub="Klient od 15. 1. 2026 · Pro · 249 €/mes"
    topRight={<>
      <Btn variant="outline" size="sm" icon={<I.Mail size={14}/>}>Kontaktovať</Btn>
      <Btn variant="outline" size="sm" icon={<I.External size={14}/>}>Otvoriť v portáli</Btn>
      <Btn variant="primary" size="sm" icon={<I.Plus size={14}/>}>Nová kampaň</Btn>
    </>}>

    <div style={{display:'grid', gridTemplateColumns:'1fr 320px', gap:16}}>
      <div style={{display:'flex', flexDirection:'column', gap:16}}>
        <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12}}>
          <Stat label="Aktívne kampane" value="3" hint="FB · Google"/>
          <Stat label="Spend (apríl)" value="847 €" delta={4} hint="rozpočet"/>
          <Stat label="Konverzie" value="142" delta={28}/>
          <Stat label="ROI" value="3.4×" hint="vynikajúce" tone="ok"/>
        </div>

        <Card title="Výkon kampaní (30 dní)" right={<><Chip tone="mint" size="sm">+28%</Chip></>}>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:20}}>
            <div>
              <div style={{fontSize:11, color:'var(--ink-mute)', marginBottom:4, textTransform:'uppercase', letterSpacing:.8}}>Konverzie</div>
              <div style={{fontSize:28, fontWeight:600, letterSpacing:-.8}}>142</div>
              <Line data={[2,4,3,5,6,4,7,9,8,10,12,14,15,13,18]} color="var(--brand-500)" w={340} h={80}/>
            </div>
            <div>
              <div style={{fontSize:11, color:'var(--ink-mute)', marginBottom:4, textTransform:'uppercase', letterSpacing:.8}}>Dosah (impressions)</div>
              <div style={{fontSize:28, fontWeight:600, letterSpacing:-.8}}>184.2K</div>
              <Line data={[5,8,6,10,12,11,14,16,15,17,20,22,24,22,28]} color="var(--acc-lavender-ink)" w={340} h={80}/>
            </div>
          </div>
        </Card>

        <Card title="Aktívne kampane" pad={0}>
          {[
            ['Letná ponuka · chlieb BIO','Facebook + Instagram','Aktívna','mint','420 €','47','2.1×'],
            ['Lokálne cielenie · 15km','Google Search','Aktívna','mint','280 €','68','4.2×'],
            ['Remarketing','Facebook','Pauza','amber','147 €','27','1.8×'],
          ].map((c,i)=><div key={i} style={{display:'grid', gridTemplateColumns:'2fr 1fr 100px 100px 80px 80px', padding:'14px 20px', borderTop:i?'1px solid var(--border)':'none', alignItems:'center', gap:14}}>
            <div>
              <div style={{fontSize:13, fontWeight:600}}>{c[0]}</div>
              <div style={{fontSize:11, color:'var(--ink-sub)', display:'flex', alignItems:'center', gap:6, marginTop:2}}>
                {c[1].includes('Face') && <I.Fb size={11}/>}
                {c[1].includes('Google') && <I.Google size={11}/>}
                {c[1]}
              </div>
            </div>
            <Chip tone={c[3]} size="sm" dot>{c[2]}</Chip>
            <span className="mono" style={{fontSize:12, fontWeight:600}}>{c[4]}</span>
            <span className="mono" style={{fontSize:12}}>{c[5]} konv.</span>
            <Chip tone={parseFloat(c[6])>2?'ok':'warn'} size="sm">{c[6]}</Chip>
            <I.More size={14} color="var(--ink-mute)"/>
          </div>)}
        </Card>
      </div>

      <div style={{display:'flex', flexDirection:'column', gap:16}}>
        <Card title="Klient info" pad={14}>
          <div style={{display:'flex', flexDirection:'column', gap:10}}>
            {[['IČO','52 438 190'],['Adresa','Hlavná 24, Bratislava'],['Kontakt','Martin Jabĺčko'],['Telefón','+421 905 123 456'],['Email','martin@pekaren…'],['Faktúra','Mesačne · 249 €']].map((r,i)=>
              <div key={i} style={{display:'flex', justifyContent:'space-between', fontSize:12}}>
                <span style={{color:'var(--ink-mute)'}}>{r[0]}</span>
                <span style={{fontWeight:500}}>{r[1]}</span>
              </div>
            )}
          </div>
        </Card>

        <Card title="Account manažér" pad={14}>
          <div style={{display:'flex', alignItems:'center', gap:10}}>
            <Avatar name="Štefan Varga" size={40}/>
            <div style={{flex:1}}>
              <div style={{fontSize:13, fontWeight:600}}>Štefan Varga</div>
              <div style={{fontSize:11, color:'var(--ink-sub)'}}>Senior Account</div>
            </div>
          </div>
          <div style={{display:'flex', gap:6, marginTop:12}}>
            <Btn variant="soft" size="sm" icon={<I.Mail size={12}/>}>Email</Btn>
            <Btn variant="soft" size="sm" icon={<I.Phone size={12}/>}>Call</Btn>
          </div>
        </Card>

        <Card title="Najbližšie" pad={14}>
          {[['Monthly report','23. 4.','lav'],['Strategický call','29. 4.','sky'],['Fakturácia','1. 5.','amber']].map((t,i)=>
            <div key={i} style={{display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderTop:i?'1px dashed var(--border)':'none'}}>
              <div style={{width:32, height:32, borderRadius:8, background:`var(--acc-${t[2]==='lav'?'lavender':t[2]==='sky'?'sky':'amber'})`, color:`var(--acc-${t[2]==='lav'?'lavender':t[2]==='sky'?'sky':'amber'}-ink)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:600}}>{t[1].split('.')[0]}</div>
              <div style={{flex:1, fontSize:12}}>
                <div style={{fontWeight:500}}>{t[0]}</div>
                <div style={{color:'var(--ink-mute)', fontSize:11}}>{t[1]}</div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  </AppFrame>
);

Object.assign(window, { ScreenDashboard, ScreenLeads, ScreenLeadDetail, ScreenClients, ScreenClientDetail, ADMIN_W, ADMIN_H });
