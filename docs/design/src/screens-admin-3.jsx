// Admin screens — part 3: Onboarding, Services, Reports, Calendar, Templates, Documents, Keywords, Settings

const ScreenOnboarding = () => (
  <AppFrame mode="admin" active="Onboarding" title="Onboarding nového klienta" sub="Krok 3 z 6 · Bistro Verde">
    <div style={{display:'grid', gridTemplateColumns:'260px 1fr', gap:24}}>
      <div>
        {['Základné info','Biznis & ciele','Reklamné účty','Kreatívy','Zmluva & platba','Spustenie'].map((s,i)=>
          <div key={i} style={{display:'flex', gap:12, padding:'12px 0', borderBottom:'1px dashed var(--border)'}}>
            <div style={{width:28, height:28, borderRadius:99, display:'flex', alignItems:'center', justifyContent:'center',
              background: i<2?'var(--ok)': i===2?'var(--brand-500)':'var(--n-75)',
              color: i<=2?'#fff':'var(--ink-mute)', fontSize:12, fontWeight:600, flexShrink:0
            }}>{i<2 ? <I.Check size={14}/> : i+1}</div>
            <div>
              <div style={{fontSize:13, fontWeight:i===2?600:500}}>{s}</div>
              <div style={{fontSize:11, color:'var(--ink-mute)'}}>{i<2?'Dokončené': i===2?'Prebieha':'Čaká'}</div>
            </div>
          </div>
        )}
      </div>

      <Card title="Reklamné účty" right={<span style={{fontSize:11, color:'var(--ink-mute)'}}>Povinné</span>}>
        <div style={{fontSize:13, color:'var(--ink-sub)', marginBottom:20, lineHeight:1.6}}>
          Prepojte reklamné účty klienta. Budeme cez ne spravovať kampane. Klient si ponechá plnú kontrolu a môže prístup kedykoľvek odobrať.
        </div>

        {[
          ['Fb','Facebook Business Manager','Vyžaduje prístup pre správu kampaní a pixelu','mint','Prepojené','BM ID: 284 019 473','var(--ok)'],
          ['Google','Google Ads','Cez MCC prepojenie · klient dostane email','sky','Čaká klienta','—','var(--warn)'],
          ['Instagram','Instagram Business','Automaticky cez Facebook','lav','Pripravené','Cez FB','var(--ok)'],
          ['Globe','Web & analytika','GA4, GSC, Meta pixel','amber','Nenastavené','—','var(--ink-mute)'],
        ].map((a,i)=>{const Ic=I[a[0]]; return <div key={i} style={{display:'flex', alignItems:'center', gap:16, padding:'16px', background:'var(--n-50)', border:'1px solid var(--border)', borderRadius:12, marginBottom:10}}>
          <div style={{width:44, height:44, borderRadius:11, background:'var(--surface)', display:'flex', alignItems:'center', justifyContent:'center', border:'1px solid var(--border)'}}><Ic size={20}/></div>
          <div style={{flex:1}}>
            <div style={{fontSize:14, fontWeight:600, display:'flex', alignItems:'center', gap:8}}>{a[1]} <Chip tone={a[3]} size="sm" dot>{a[4]}</Chip></div>
            <div style={{fontSize:12, color:'var(--ink-sub)', marginTop:2}}>{a[2]}</div>
            <div className="mono" style={{fontSize:11, color:'var(--ink-mute)', marginTop:4}}>{a[5]}</div>
          </div>
          {a[4]==='Prepojené' ? <Btn variant="outline" size="sm">Odpojiť</Btn>
            : a[4]==='Čaká klienta' ? <Btn variant="outline" size="sm" icon={<I.Send size={14}/>}>Pripomenúť</Btn>
            : <Btn variant="primary" size="sm" icon={<I.Plus size={14}/>}>Prepojiť</Btn>}
        </div>})}

        <div style={{display:'flex', justifyContent:'space-between', marginTop:20, paddingTop:20, borderTop:'1px solid var(--border)'}}>
          <Btn variant="outline" size="md">← Späť</Btn>
          <div style={{display:'flex', gap:8}}>
            <Btn variant="ghost" size="md">Uložiť a zatvoriť</Btn>
            <Btn variant="primary" size="md">Pokračovať na Kreatívy →</Btn>
          </div>
        </div>
      </Card>
    </div>
  </AppFrame>
);

const ScreenServices = () => (
  <AppFrame mode="admin" active="Služby & Balíčky" title="Služby & Balíčky"
    topRight={<Btn variant="primary" size="sm" icon={<I.Plus size={14}/>}>Nový balík</Btn>}>
    <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14}}>
      {[
        {n:'Starter', p:149, c:4, rev:596, desc:'Pre živnostníkov', tone:'sky', feats:['1 platforma','1 kampaň','2 vizuály','Mesačný report']},
        {n:'Pro', p:249, c:6, rev:1494, desc:'Pre firmy čo chcú rásť', tone:'brand', pop:true, feats:['2 platformy','Až 3 kampane','4 vizuály','A/B testovanie','Detailný report']},
        {n:'Enterprise', p:399, c:3, rev:1197, desc:'Pre e-shopy', tone:'lav', feats:['Všetky platformy','5 kampaní','8 vizuálov','Remarketing','Strategické konzultácie']},
        {n:'Premium', p:1250, c:2, rev:2500, desc:'VIP + account manažér', tone:'ink', feats:['Neobmedzené kampane','Dedikovaný AM','Denná optimalizácia','24/7 podpora']},
      ].map((pkg,i)=><div key={i} style={{
        background: pkg.pop?'var(--n-900)':'var(--surface)',
        color: pkg.pop?'#fff':'var(--ink)',
        border:'1px solid ' + (pkg.pop?'var(--n-900)':'var(--border)'),
        borderRadius:16, padding:22, boxShadow:'var(--sh-sm)', position:'relative'
      }}>
        {pkg.pop && <div style={{position:'absolute', top:-10, right:18, background:'var(--brand-500)', color:'#fff', fontSize:10, fontWeight:600, padding:'3px 10px', borderRadius:99, textTransform:'uppercase', letterSpacing:.8}}>Najobľúbenejší</div>}
        <div style={{fontSize:11, textTransform:'uppercase', letterSpacing:1, fontWeight:600, opacity:.7}}>{pkg.desc}</div>
        <div style={{fontSize:22, fontWeight:700, letterSpacing:-.4, marginTop:4}}>{pkg.n}</div>
        <div style={{display:'flex', alignItems:'baseline', gap:4, marginTop:10}}>
          <span style={{fontSize:38, fontWeight:700, letterSpacing:-1}}>{pkg.p}</span>
          <span style={{fontSize:14, opacity:.7}}>€/mes</span>
        </div>
        <div style={{fontSize:11, opacity:.6, marginTop:-2}}>bez DPH</div>

        <div style={{display:'flex', gap:16, padding:'14px 0', marginTop:14, borderTop:'1px solid '+(pkg.pop?'#2a2720':'var(--border)')}}>
          <div><div style={{fontSize:10, opacity:.6, textTransform:'uppercase', letterSpacing:.8}}>Klientov</div><div style={{fontSize:16, fontWeight:600}}>{pkg.c}</div></div>
          <div><div style={{fontSize:10, opacity:.6, textTransform:'uppercase', letterSpacing:.8}}>MRR</div><div style={{fontSize:16, fontWeight:600, fontFamily:'var(--font-mono)'}}>{pkg.rev}€</div></div>
        </div>

        <div style={{display:'flex', flexDirection:'column', gap:8, marginTop:8, paddingTop:14, borderTop:'1px solid '+(pkg.pop?'#2a2720':'var(--border)')}}>
          {pkg.feats.map((f,j)=><div key={j} style={{display:'flex', gap:8, fontSize:12}}><I.Check size={14} color={pkg.pop?'var(--brand-400)':'var(--ok)'}/>{f}</div>)}
        </div>

        <Btn variant={pkg.pop?'primary':'outline'} size="md" style={{width:'100%', justifyContent:'center', marginTop:18}}>Upraviť balík</Btn>
      </div>)}
    </div>

    <div style={{marginTop:20}}>
      <Card title="Doplnkové služby" pad={0}>
        <div style={{display:'grid', gridTemplateColumns:'2fr 100px 100px 100px 100px 100px', padding:'12px 20px', background:'var(--n-50)', borderBottom:'1px solid var(--border)', fontSize:11, fontWeight:600, color:'var(--ink-sub)', textTransform:'uppercase', letterSpacing:.8}}>
          <span>Služba</span><span>Typ</span><span>Cena</span><span>Aktívnych</span><span>Predaje</span><span/>
        </div>
        {[
          ['Landing page · 1 stránka','Jednorazový','499€',3,12],
          ['Redizajn loga','Jednorazový','350€',1,4],
          ['Extra kreatívy (4 ks)','Mesačný','99€',8,24],
          ['Video spot 15s','Jednorazový','680€',2,6],
          ['Strategická konzultácia','Hodinová','80€',5,18],
        ].map((r,i)=><div key={i} style={{display:'grid', gridTemplateColumns:'2fr 100px 100px 100px 100px 100px', padding:'14px 20px', borderTop:'1px solid var(--border)', alignItems:'center'}}>
          <span style={{fontSize:13, fontWeight:500}}>{r[0]}</span>
          <Chip tone="n" size="sm">{r[1]}</Chip>
          <span className="mono" style={{fontSize:13, fontWeight:600}}>{r[2]}</span>
          <span className="mono" style={{fontSize:12}}>{r[3]}</span>
          <span className="mono" style={{fontSize:12}}>{r[4]}</span>
          <I.More size={14} color="var(--ink-mute)"/>
        </div>)}
      </Card>
    </div>
  </AppFrame>
);

const ScreenReports = () => (
  <AppFrame mode="admin" active="Reporty" title="Reporty" sub="Globálny výkon · apríl 2026"
    topRight={<>
      <Btn variant="outline" size="sm">Apríl 2026 <I.ChevronDown size={12}/></Btn>
      <Btn variant="outline" size="sm" icon={<I.Download size={14}/>}>PDF</Btn>
    </>}>
    <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:16}}>
      <Stat label="Spend spravovaný" value="18 420 €" delta={24}/>
      <Stat label="Konverzie (celkom)" value="2 847" delta={32}/>
      <Stat label="Priemerný ROI" value="3.2×" tone="ok"/>
      <Stat label="Cena za konverziu" value="6.47 €" delta={-12} tone="ok"/>
    </div>

    <div style={{display:'grid', gridTemplateColumns:'2fr 1fr', gap:16, marginBottom:16}}>
      <Card title="Výkon v čase · konverzie">
        <div style={{display:'flex', gap:20, alignItems:'flex-end', height:240, padding:'10px 0'}}>
          {[45,62,38,78,92,68,104,88,115,142,98,168].map((v,i)=><div key={i} style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:8}}>
            <div style={{width:'100%', height:`${v/180*100}%`, background:`linear-gradient(180deg, var(--brand-500), var(--brand-700))`, borderRadius:'6px 6px 0 0', position:'relative'}}>
              {i===11 && <div style={{position:'absolute', top:-28, left:'50%', transform:'translateX(-50%)', background:'var(--n-900)', color:'#fff', fontSize:11, padding:'3px 7px', borderRadius:6, fontWeight:600, whiteSpace:'nowrap'}} className="mono">{v}</div>}
            </div>
            <span style={{fontSize:10, color:'var(--ink-mute)', fontFamily:'var(--font-mono)'}}>{['m1','m2','m3','a1','a2','a3','a4','a5','a6','a7','a8','a9'][i]}</span>
          </div>)}
        </div>
      </Card>
      <Card title="Rozdelenie spend podľa platformy">
        <div style={{display:'flex', gap:20, alignItems:'center'}}>
          <Donut data={[
            {label:'Facebook', value:8200, color:'#1877F2'},
            {label:'Google', value:7100, color:'#EA4335'},
            {label:'Instagram', value:2400, color:'#E1306C'},
            {label:'Ostatné', value:720, color:'var(--n-300)'}
          ]} size={150} thick={22}/>
          <div style={{flex:1, display:'flex', flexDirection:'column', gap:8}}>
            {[['Facebook','8 200 €','45%','#1877F2'],['Google','7 100 €','39%','#EA4335'],['Instagram','2 400 €','13%','#E1306C'],['Ostatné','720 €','3%','var(--n-300)']].map((r,i)=>
              <div key={i} style={{display:'flex', alignItems:'center', gap:8, fontSize:12}}>
                <span style={{width:8, height:8, borderRadius:99, background:r[3]}}/>
                <span style={{flex:1}}>{r[0]}</span>
                <span className="mono" style={{fontWeight:600}}>{r[1]}</span>
                <span style={{color:'var(--ink-mute)', width:34, textAlign:'right'}}>{r[2]}</span>
              </div>)}
          </div>
        </div>
      </Card>
    </div>

    <Card title="Top klienti podľa výkonu" pad={0}>
      <div style={{display:'grid', gridTemplateColumns:'24px 2fr 110px 110px 110px 110px 120px', padding:'12px 20px', background:'var(--n-50)', borderBottom:'1px solid var(--border)', fontSize:11, fontWeight:600, color:'var(--ink-sub)', textTransform:'uppercase', letterSpacing:.8, gap:12}}>
        <span>#</span><span>Klient</span><span>Spend</span><span>Konverzie</span><span>CPA</span><span>ROI</span><span>Trend</span>
      </div>
      {[
        ['Fitness Dynamic',4200,412,10.19,4.2,[3,5,4,6,8,7,9]],
        ['Kozmetika Luna',3100,287,10.80,3.8,[2,3,4,3,5,6,7]],
        ['Pekáreň Jablko',1240,142,8.73,3.4,[1,2,2,3,4,4,5]],
        ['MUDr. Novák',890,94,9.47,5.1,[2,2,3,3,3,4,4]],
        ['Bistro Verde',720,68,10.59,2.1,[1,1,2,2,2,3,3]],
      ].map((r,i)=><div key={i} style={{display:'grid', gridTemplateColumns:'24px 2fr 110px 110px 110px 110px 120px', padding:'14px 20px', borderTop:'1px solid var(--border)', alignItems:'center', gap:12}}>
        <span className="mono" style={{fontSize:11, color:'var(--ink-mute)'}}>{i+1}</span>
        <span style={{fontSize:13, fontWeight:600}}>{r[0]}</span>
        <span className="mono" style={{fontSize:12, fontWeight:600}}>{r[1]}€</span>
        <span className="mono" style={{fontSize:12}}>{r[2]}</span>
        <span className="mono" style={{fontSize:12}}>{r[3]}€</span>
        <Chip tone={r[4]>=3?'ok':'warn'} size="sm">{r[4]}×</Chip>
        <Line data={r[5]} color="var(--brand-500)" w={100} h={28}/>
      </div>)}
    </Card>
  </AppFrame>
);

const ScreenCalendar = () => {
  const days = Array.from({length:35}, (_,i)=>i-2);
  const events = {
    3: [{t:'Onb. Bistro', c:'sky'}],
    5: [{t:'Call Novák', c:'brand'}],
    8: [{t:'Q1 review', c:'lav'},{t:'Kreatívy', c:'amber'}],
    12: [{t:'Launch FB', c:'mint'}],
    15: [{t:'Fakturácia', c:'amber'},{t:'Report', c:'lav'}],
    18: [{t:'DNES', c:'brand'},{t:'Call Luna', c:'sky'}],
    22: [{t:'A/B test', c:'rose'}],
    24: [{t:'Zmluva Bistro', c:'amber'}],
    29: [{t:'Strat. call', c:'sky'}],
    30: [{t:'Report apríl', c:'lav'},{t:'Fakturácia', c:'amber'}],
  };
  return <AppFrame mode="admin" active="Kalendár" title="Kalendár" sub="Apríl 2026"
    topRight={<>
      <Btn variant="outline" size="sm">Dnes</Btn>
      <Btn variant="outline" size="sm"><I.Chevron size={12} style={{transform:'rotate(180deg)'}}/></Btn>
      <Btn variant="outline" size="sm"><I.Chevron size={12}/></Btn>
      <div style={{width:1, background:'var(--border)', margin:'0 4px'}}/>
      <Btn variant="primary" size="sm" icon={<I.Plus size={14}/>}>Udalosť</Btn>
    </>}>
    <div style={{display:'grid', gridTemplateColumns:'1fr 280px', gap:16, height:'100%'}}>
      <Card pad={0} style={{display:'flex', flexDirection:'column'}}>
        <div style={{display:'grid', gridTemplateColumns:'repeat(7,1fr)', borderBottom:'1px solid var(--border)'}}>
          {['Po','Ut','St','Št','Pi','So','Ne'].map((d,i)=><div key={i} style={{padding:'10px 14px', fontSize:11, fontWeight:600, color:'var(--ink-sub)', textTransform:'uppercase', letterSpacing:.8, textAlign:'center'}}>{d}</div>)}
        </div>
        <div style={{flex:1, display:'grid', gridTemplateColumns:'repeat(7,1fr)', gridTemplateRows:'repeat(5,1fr)'}}>
          {days.map((d,i)=>{
            const isOther = d<1 || d>30;
            const isToday = d===18;
            const ev = events[d] || [];
            return <div key={i} style={{
              borderRight: (i%7<6)?'1px solid var(--border)':'none',
              borderTop: i>=7?'1px solid var(--border)':'none',
              padding:8, minHeight:90, background: isOther?'var(--n-50)':'var(--surface)',
              display:'flex', flexDirection:'column', gap:4
            }}>
              <div style={{fontSize:11, fontWeight: isToday?700:500,
                color: isOther?'var(--ink-mute)':isToday?'#fff':'var(--ink)',
                width:22, height:22, borderRadius:99, display:'flex', alignItems:'center', justifyContent:'center',
                background: isToday?'var(--brand-500)':'transparent'
              }}>{d<1?31+d:d>30?d-30:d}</div>
              {ev.map((e,j)=><div key={j} style={{fontSize:10, fontWeight:500, padding:'2px 6px', borderRadius:4,
                background: `var(--acc-${e.c==='lav'?'lavender':e.c==='sky'?'sky':e.c==='mint'?'mint':e.c==='rose'?'rose':e.c==='amber'?'amber':'sky'})`,
                color: `var(--acc-${e.c==='lav'?'lavender':e.c==='sky'?'sky':e.c==='mint'?'mint':e.c==='rose'?'rose':e.c==='amber'?'amber':'sky'}-ink)`,
                whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
                ...(e.c==='brand' && !isToday ? {background:'var(--brand-500)', color:'#fff'} : {})
              }}>{e.t}</div>)}
            </div>;
          })}
        </div>
      </Card>

      <div style={{display:'flex', flexDirection:'column', gap:14}}>
        <Card title="Dnes · 18. apríl" pad={14}>
          {[['14:00','Call Fitness Dynamic','lav'],['15:30','Briefing kreatív','amber'],['16:30','Onboarding Bistro','sky']].map((e,i)=>
            <div key={i} style={{display:'flex', gap:10, padding:'10px 0', borderTop:i?'1px dashed var(--border)':'none'}}>
              <div className="mono" style={{fontSize:11, color:'var(--ink-sub)', width:46, paddingTop:2}}>{e[0]}</div>
              <div style={{flex:1, borderLeft:`3px solid var(--acc-${e[2]==='lav'?'lavender':e[2]==='sky'?'sky':'amber'}-ink)`, paddingLeft:10}}>
                <div style={{fontSize:13, fontWeight:500}}>{e[1]}</div>
                <div style={{fontSize:11, color:'var(--ink-mute)', marginTop:2, display:'flex', gap:6, alignItems:'center'}}><Avatar name="ŠV" size={16}/> Štefan V.</div>
              </div>
            </div>
          )}
        </Card>
        <Card title="Kategórie" pad={14}>
          {[['Meetingy','lav'],['Kampane','mint'],['Fakturácia','amber'],['Deadlines','rose']].map((c,i)=>
            <div key={i} style={{display:'flex', alignItems:'center', gap:10, padding:'6px 0'}}>
              <div style={{width:14, height:14, borderRadius:4, background:`var(--acc-${c[1]==='lav'?'lavender':c[1]==='mint'?'mint':c[1]==='amber'?'amber':'rose'})`}}/>
              <span style={{fontSize:13, flex:1}}>{c[0]}</span>
              <I.Eye size={14} color="var(--ink-mute)"/>
            </div>
          )}
        </Card>
      </div>
    </div>
  </AppFrame>;
};

const ScreenTemplates = () => (
  <AppFrame mode="admin" active="Šablóny" title="Šablóny"
    topRight={<Btn variant="primary" size="sm" icon={<I.Plus size={14}/>}>Nová šablóna</Btn>}>
    <div style={{display:'flex', gap:8, marginBottom:16}}>
      {['Všetky (42)','Emaily (18)','Zmluvy (6)','Kreatívy (11)','Reporty (7)'].map((t,i)=>
        <Chip key={i} tone={i===0?'ink':'n'} size="md">{t}</Chip>
      )}
    </div>
    <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:14}}>
      {[
        ['Úvodný email · Pitch','email','Prvý kontakt s leadom',42,'amber'],
        ['Mesačný report','report','Automaticky 1. dňa',164,'lav'],
        ['Zmluva Pro','contract','Balík Pro · 249€',28,'mint'],
        ['FB kreatív · letná','creative','1080×1080 template',18,'rose'],
        ['Pripomienka faktúry','email','+3 dni po splatnosti',34,'amber'],
        ['Strategický plán Q','doc','Kvartálny review',12,'sky'],
        ['Landing page · lokálny biznis','creative','Gutenberg blocks',8,'rose'],
        ['Uvítací email · klient','email','Po podpise zmluvy',67,'amber'],
        ['A/B test plán','doc','Setup checklist',22,'sky'],
      ].map((t,i)=><div key={i} style={{background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden'}}>
        <div style={{height:110, background:`var(--acc-${t[4]==='lav'?'lavender':t[4]==='sky'?'sky':t[4]==='mint'?'mint':t[4]==='rose'?'rose':'amber'})`, display:'flex', alignItems:'center', justifyContent:'center', color:`var(--acc-${t[4]==='lav'?'lavender':t[4]==='sky'?'sky':t[4]==='mint'?'mint':t[4]==='rose'?'rose':'amber'}-ink)`, position:'relative'}}>
          {t[1]==='email' && <I.Mail size={34}/>}
          {t[1]==='report' && <I.Chart size={34}/>}
          {t[1]==='contract' && <I.Docs size={34}/>}
          {t[1]==='creative' && <I.Template size={34}/>}
          {t[1]==='doc' && <I.Docs size={34}/>}
          <div style={{position:'absolute', top:10, left:10}}><Chip tone="ink" size="sm">{t[1]}</Chip></div>
        </div>
        <div style={{padding:14}}>
          <div style={{fontSize:13, fontWeight:600, letterSpacing:-.1}}>{t[0]}</div>
          <div style={{fontSize:11, color:'var(--ink-sub)', marginTop:2}}>{t[2]}</div>
          <div style={{display:'flex', justifyContent:'space-between', marginTop:10, fontSize:11, color:'var(--ink-mute)'}}>
            <span>použité {t[3]}×</span>
            <span style={{display:'flex', gap:8}}><I.Edit size={12}/><I.Copy size={12}/></span>
          </div>
        </div>
      </div>)}
    </div>
  </AppFrame>
);

const ScreenDocuments = () => (
  <AppFrame mode="admin" active="Dokumenty" title="Dokumenty"
    topRight={<><Btn variant="outline" size="sm" icon={<I.Upload size={14}/>}>Nahrať</Btn><Btn variant="primary" size="sm" icon={<I.Plus size={14}/>}>Nový priečinok</Btn></>}>
    <div style={{display:'flex', gap:4, marginBottom:14, fontSize:13, color:'var(--ink-sub)'}}>
      <span>Všetko</span><I.Chevron size={12}/><span>Klienti</span><I.Chevron size={12}/><span style={{color:'var(--ink)', fontWeight:500}}>Pekáreň Jablko</span>
    </div>
    <Card pad={0}>
      <div style={{display:'grid', gridTemplateColumns:'40px 2.2fr 110px 120px 140px 120px 40px', padding:'12px 20px', background:'var(--n-50)', borderBottom:'1px solid var(--border)', fontSize:11, fontWeight:600, color:'var(--ink-sub)', textTransform:'uppercase', letterSpacing:.8}}>
        <span/><span>Názov</span><span>Typ</span><span>Veľkosť</span><span>Upravené</span><span>Autor</span><span/>
      </div>
      {[
        ['Folder','Kreatívy apríl 2026','priečinok','12 súborov','včera','Štefan V.'],
        ['Folder','Reporty','priečinok','8 súborov','20. 3.','Lucia M.'],
        ['Docs','Zmluva Pro · podpísaná.pdf','PDF','2.4 MB','15. 1.','Štefan V.'],
        ['Docs','Brand guidelines.pdf','PDF','8.1 MB','12. 3.','Klient'],
        ['Template','Letná kampaň · storyboard.fig','Figma','—','18. 3.','Lucia M.'],
        ['Chart','Report marec 2026.pdf','PDF','4.2 MB','1. 4.','Auto'],
        ['Docs','Plnomocenstvo · FB BM.pdf','PDF','1.1 MB','15. 1.','Klient'],
        ['Template','Logo pack.zip','ZIP','22.6 MB','15. 1.','Klient'],
      ].map((r,i)=>{const Ic = I[r[0]]; return <div key={i} style={{display:'grid', gridTemplateColumns:'40px 2.2fr 110px 120px 140px 120px 40px', padding:'14px 20px', borderTop:'1px solid var(--border)', alignItems:'center'}}>
        <Ic size={18} color="var(--ink-sub)"/>
        <div style={{fontSize:13, fontWeight:500}}>{r[1]}</div>
        <Chip tone="n" size="sm">{r[2]}</Chip>
        <span style={{fontSize:12, color:'var(--ink-sub)'}}>{r[3]}</span>
        <span style={{fontSize:12, color:'var(--ink-sub)'}}>{r[4]}</span>
        <span style={{display:'flex', alignItems:'center', gap:6, fontSize:12}}><Avatar name={r[5]} size={20}/>{r[5]}</span>
        <I.More size={14} color="var(--ink-mute)"/>
      </div>})}
    </Card>
  </AppFrame>
);

const ScreenKeywords = () => (
  <AppFrame mode="admin" active="Keywords" title="Keywords" sub="Monitoring · 248 keywords"
    topRight={<><Btn variant="outline" size="sm" icon={<I.Upload size={14}/>}>Import</Btn><Btn variant="primary" size="sm" icon={<I.Plus size={14}/>}>Pridať keyword</Btn></>}>
    <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:16}}>
      <Stat label="Sledované" value="248"/>
      <Stat label="Avg. pozícia" value="12.4" delta={-2} hint="↑ lepšie" tone="ok"/>
      <Stat label="TOP 10" value="62" delta={8} tone="ok"/>
      <Stat label="Stratené" value="7" tone="err"/>
    </div>
    <Card pad={0}>
      <div style={{display:'grid', gridTemplateColumns:'2fr 1fr 100px 100px 100px 120px 100px', padding:'12px 20px', background:'var(--n-50)', borderBottom:'1px solid var(--border)', fontSize:11, fontWeight:600, color:'var(--ink-sub)', textTransform:'uppercase', letterSpacing:.8, gap:12}}>
        <span>Keyword</span><span>Klient</span><span>Obtiažnosť</span><span>Objem</span><span>Pozícia</span><span>Zmena (7d)</span><span>URL</span>
      </div>
      {[
        ['pekáreň bratislava','Pekáreň Jablko',42,1800,3,+2,'/'],
        ['chlieb bio dovoz','Pekáreň Jablko',28,720,2,+1,'/eshop'],
        ['kozmetika bratislava staré mesto','Kozmetika Luna',56,2400,8,+4,'/'],
        ['masáže ruzinov','Kozmetika Luna',34,890,12,-3,'/sluzby'],
        ['zubár nové mesto','MUDr. Novák',48,1600,5,+1,'/'],
        ['dentálna hygiena cena','MUDr. Novák',38,540,14,+7,'/sluzby/hygiena'],
        ['autoservis koliba','Autoservis Kováčik',24,320,7,-1,'/'],
        ['fitness petržalka','Fitness Dynamic',62,2100,18,+12,'/'],
      ].map((r,i)=><div key={i} style={{display:'grid', gridTemplateColumns:'2fr 1fr 100px 100px 100px 120px 100px', padding:'14px 20px', borderTop:'1px solid var(--border)', alignItems:'center', gap:12}}>
        <span style={{fontSize:13, fontWeight:600, fontFamily:'var(--font-mono)'}}>{r[0]}</span>
        <span style={{fontSize:12, color:'var(--ink-sub)'}}>{r[1]}</span>
        <div style={{display:'flex', alignItems:'center', gap:6}}>
          <div style={{flex:1, maxWidth:50, height:4, background:'var(--n-75)', borderRadius:99, overflow:'hidden'}}>
            <div style={{width:`${r[2]}%`, height:'100%', background: r[2]>50?'var(--err)':r[2]>30?'var(--warn)':'var(--ok)'}}/>
          </div>
          <span className="mono" style={{fontSize:11}}>{r[2]}</span>
        </div>
        <span className="mono" style={{fontSize:12}}>{r[3]}</span>
        <span className="mono" style={{fontSize:13, fontWeight:600, color: r[4]<=10?'var(--ok)':r[4]<=20?'var(--ink)':'var(--warn)'}}>#{r[4]}</span>
        <span className="mono" style={{fontSize:12, color: r[5]>0?'var(--ok)':'var(--err)', display:'flex', alignItems:'center', gap:3}}>
          {r[5]>0 ? <I.ArrowUp size={11}/> : <I.ArrowDown size={11}/>}
          {Math.abs(r[5])}
        </span>
        <span className="mono" style={{fontSize:11, color:'var(--ink-sub)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{r[6]}</span>
      </div>)}
    </Card>
  </AppFrame>
);

const ScreenSettings = () => (
  <AppFrame mode="admin" active="Nastavenia" title="Nastavenia" sub="Účet a organizácia">
    <div style={{display:'grid', gridTemplateColumns:'220px 1fr', gap:24}}>
      <div>
        {[['Profil','Users'],['Organizácia','Building'],['Tím & roly','Users'],['Notifikácie','Bell'],['Integrácie','Link'],['Fakturačné údaje','Invoice'],['Bezpečnosť','Lock'],['API kľúče','Key']].map((s,i)=>{const Ic = I[s[1]]; return <div key={i} style={{display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:8, background: i===1?'var(--n-75)':'transparent', color: i===1?'var(--ink)':'var(--ink-sub)', fontWeight: i===1?600:500, fontSize:13, cursor:'pointer', marginBottom:2}}>
          <Ic size={16}/>{s[0]}
        </div>})}
      </div>
      <div style={{display:'flex', flexDirection:'column', gap:16}}>
        <Card title="Organizácia" right={<Btn variant="ghost" size="sm">Uložiť</Btn>}>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
            {[['Názov','Adlify s.r.o.'],['IČO','54 321 987'],['DIČ','2121 998 765'],['Adresa','Mlynská 14, 821 09 Bratislava'],['Email','hello@adlify.eu'],['Telefón','+421 944 184 045']].map((f,i)=>
              <div key={i}>
                <label style={{fontSize:11, color:'var(--ink-mute)', textTransform:'uppercase', letterSpacing:.8, fontWeight:600, display:'block', marginBottom:5}}>{f[0]}</label>
                <div style={{padding:'10px 12px', background:'var(--n-50)', border:'1px solid var(--border)', borderRadius:9, fontSize:13}}>{f[1]}</div>
              </div>
            )}
          </div>
        </Card>

        <Card title="Integrácie">
          {[
            ['Fb','Meta Business','Aktívne · 15 BM účtov','mint'],
            ['Google','Google Ads (MCC)','Aktívne · 12 účtov','mint'],
            ['Mail','Resend · transakčné emaily','Aktívne','mint'],
            ['Invoice','Pohoda · fakturácia','Aktívne · sync každú hodinu','mint'],
            ['Zap','Slack · notifikácie','Odpojené','n'],
            ['Template','Marketing Miner · lead analýza','Aktívne · 2000/mes','mint'],
          ].map((a,i)=>{const Ic=I[a[0]]; return <div key={i} style={{display:'flex', alignItems:'center', gap:14, padding:'12px 0', borderTop:i?'1px solid var(--border)':'none'}}>
            <div style={{width:38, height:38, borderRadius:9, background:'var(--n-50)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center'}}><Ic size={18}/></div>
            <div style={{flex:1}}>
              <div style={{fontSize:13, fontWeight:600}}>{a[1]}</div>
              <div style={{fontSize:11, color:'var(--ink-sub)'}}>{a[2]}</div>
            </div>
            <Chip tone={a[3]} size="sm" dot>{a[3]==='mint'?'Aktívne':'Odpojené'}</Chip>
            <Btn variant="outline" size="sm">Spravovať</Btn>
          </div>})}
        </Card>
      </div>
    </div>
  </AppFrame>
);

Object.assign(window, { ScreenOnboarding, ScreenServices, ScreenReports, ScreenCalendar, ScreenTemplates, ScreenDocuments, ScreenKeywords, ScreenSettings });
