// Portal screens — client-facing: Login, Dashboard, Reports, Campaigns, Messages, Approvals, Calendar, Tickets, Invoices, Documents, Settings
// Uses the same AppFrame but mode="portal" — lighter sidebar, friendlier language.

// 1. Login / onboarding
const ScreenPortalLogin = () => (
  <div className="adl" style={{width:'100%', height:'100%', display:'grid', gridTemplateColumns:'1fr 1fr', background:'var(--bg)'}}>
    <div style={{padding:'60px 80px', display:'flex', flexDirection:'column', justifyContent:'center', maxWidth:520, margin:'0 auto'}}>
      <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:48}}>
        <I.Logo size={30}/>
        <div style={{fontSize:20, fontWeight:700, letterSpacing:-.4}}>Adlify <span style={{fontSize:11, fontWeight:500, color:'var(--ink-sub)', letterSpacing:.4, textTransform:'uppercase', marginLeft:4}}>Klient</span></div>
      </div>
      <div style={{fontSize:34, fontWeight:700, letterSpacing:-1, lineHeight:1.1}}>Vitajte späť.</div>
      <div style={{fontSize:14, color:'var(--ink-sub)', marginTop:10, lineHeight:1.55}}>Prihláste sa a pozrite si výkon svojich kampaní, reporty a komunikáciu s tímom.</div>

      <div style={{display:'flex', flexDirection:'column', gap:14, marginTop:36}}>
        <div>
          <label style={{fontSize:12, fontWeight:500, marginBottom:6, display:'block'}}>Email</label>
          <div style={{padding:'12px 14px', background:'var(--surface)', border:'1px solid var(--border-strong)', borderRadius:10, fontSize:14, color:'var(--ink-sub)'}}>jana@pekaren-jablko.sk</div>
        </div>
        <div>
          <label style={{fontSize:12, fontWeight:500, marginBottom:6, display:'flex', justifyContent:'space-between'}}>Heslo <a style={{color:'var(--brand-600)'}}>Zabudli ste?</a></label>
          <div style={{padding:'12px 14px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, fontSize:14, color:'var(--ink-mute)', display:'flex', alignItems:'center', justifyContent:'space-between'}}>••••••••••• <I.Eye size={16}/></div>
        </div>
        <Btn variant="primary" size="lg" style={{width:'100%', justifyContent:'center', marginTop:8}}>Prihlásiť sa <I.ArrowRight size={16}/></Btn>
        <div style={{display:'flex', alignItems:'center', gap:12, margin:'10px 0', color:'var(--ink-mute)', fontSize:12}}>
          <div style={{flex:1, height:1, background:'var(--border)'}}/>alebo<div style={{flex:1, height:1, background:'var(--border)'}}/>
        </div>
        <Btn variant="outline" size="lg" icon={<I.Google size={16}/>} style={{width:'100%', justifyContent:'center'}}>Pokračovať s Google</Btn>
      </div>

      <div style={{fontSize:12, color:'var(--ink-mute)', marginTop:40, textAlign:'center'}}>
        Nemáte ešte účet? <span style={{color:'var(--brand-600)', fontWeight:500}}>Požiadajte agentúru o prístup</span>
      </div>
    </div>

    <div style={{background:'linear-gradient(160deg, var(--brand-500), var(--brand-700))', padding:60, display:'flex', flexDirection:'column', justifyContent:'center', color:'#fff', position:'relative', overflow:'hidden'}}>
      <div style={{position:'absolute', right:-100, top:-100, width:400, height:400, background:'radial-gradient(circle, rgba(255,255,255,.2), transparent 70%)'}}/>
      <div style={{maxWidth:420, position:'relative'}}>
        <div style={{fontSize:11, textTransform:'uppercase', letterSpacing:1, opacity:.8, fontWeight:600, marginBottom:14}}>Váš výkon v reálnom čase</div>
        <div style={{fontSize:42, fontWeight:700, letterSpacing:-1.2, lineHeight:1.1}}>„Za 3 mesiace sme znížili cenu za konverziu o 38% a zdvojnásobili objednávky.“</div>
        <div style={{display:'flex', alignItems:'center', gap:12, marginTop:28}}>
          <Avatar name="Martin Jabĺčko" size={44}/>
          <div>
            <div style={{fontSize:14, fontWeight:600}}>Martin Jabĺčko</div>
            <div style={{fontSize:12, opacity:.8}}>Konateľ · Pekáreň Jablko</div>
          </div>
        </div>
        <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginTop:40}}>
          {[['3.4×','ROI'],['142','Konverzií'],['+38%','Rast']].map((s,i)=><div key={i} style={{padding:'16px 18px', background:'rgba(255,255,255,.12)', backdropFilter:'blur(10px)', borderRadius:12}}>
            <div style={{fontSize:26, fontWeight:700, letterSpacing:-.5}}>{s[0]}</div>
            <div style={{fontSize:11, opacity:.8}}>{s[1]}</div>
          </div>)}
        </div>
      </div>
    </div>
  </div>
);

// 2. Portal Dashboard
const ScreenPortalDashboard = () => (
  <AppFrame mode="portal" active="Dashboard" title="Dobré ráno, Jana" sub="Apríl 2026 · Pekáreň Jablko s.r.o."
    topRight={<Btn variant="outline" size="sm" icon={<I.Download size={14}/>}>Report PDF</Btn>}>

    <div style={{background:'linear-gradient(135deg, var(--brand-500), var(--brand-700))', borderRadius:16, padding:28, color:'#fff', marginBottom:16, position:'relative', overflow:'hidden'}}>
      <div style={{position:'absolute', right:-50, top:-50, width:260, height:260, background:'radial-gradient(circle, rgba(255,255,255,.18), transparent 70%)'}}/>
      <div style={{display:'flex', alignItems:'flex-start', gap:40, position:'relative'}}>
        <div style={{flex:1}}>
          <div style={{fontSize:11, textTransform:'uppercase', letterSpacing:1, opacity:.8, fontWeight:600}}>Váš výkon · apríl 2026</div>
          <div style={{fontSize:44, fontWeight:700, letterSpacing:-1.5, marginTop:6, lineHeight:1.1}}>142 konverzií</div>
          <div style={{display:'flex', gap:10, marginTop:12}}>
            <span className="mono" style={{fontSize:13, background:'rgba(255,255,255,.18)', padding:'4px 10px', borderRadius:999}}>+28% vs. marec</span>
            <span style={{fontSize:13, opacity:.85}}>ROI 3.4× · cena za konverziu 5.96 €</span>
          </div>
        </div>
        <div style={{width:300}}>
          <Line data={[2,4,3,5,6,4,7,9,8,10,12,14,15,13,18]} color="#fff" w={300} h={80} fill/>
        </div>
      </div>
    </div>

    <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:16}}>
      <Stat label="Dosah" value="184.2K" delta={32}/>
      <Stat label="Kliky" value="8 421" delta={18} hint="CTR 4.6%"/>
      <Stat label="Minuté z budgetu" value="847 €" hint="z 1 000 €"/>
      <Stat label="Hodnota konverzií" value="12 480 €" delta={42} tone="ok"/>
    </div>

    <div style={{display:'grid', gridTemplateColumns:'1.3fr 1fr', gap:16, marginBottom:16}}>
      <Card title="Aktívne kampane (3)" right={<Btn variant="ghost" size="sm">Všetky <I.ArrowRight size={12}/></Btn>} pad={0}>
        {[
          ['Letná ponuka · chlieb BIO','FB + IG','Aktívna','mint',420,47,2.1],
          ['Lokálne cielenie · 15km','Google','Aktívna','mint',280,68,4.2],
          ['Remarketing','Facebook','Pauza','amber',147,27,1.8],
        ].map((c,i)=><div key={i} style={{padding:'16px 20px', borderTop:i?'1px solid var(--border)':'none', display:'grid', gridTemplateColumns:'2fr 100px 80px 80px 60px', gap:14, alignItems:'center'}}>
          <div>
            <div style={{fontSize:13, fontWeight:600}}>{c[0]}</div>
            <div style={{fontSize:11, color:'var(--ink-sub)', display:'flex', gap:6, alignItems:'center', marginTop:2}}>
              {c[1].includes('FB') && <I.Fb size={11} color="#1877F2"/>}
              {c[1].includes('Google') && <I.Google size={11}/>}
              {c[1]}
            </div>
          </div>
          <Chip tone={c[3]} size="sm" dot>{c[2]}</Chip>
          <span className="mono" style={{fontSize:12, fontWeight:600}}>{c[4]}€</span>
          <span className="mono" style={{fontSize:12}}>{c[5]} konv.</span>
          <Chip tone={c[6]>2?'ok':'warn'} size="sm">{c[6]}×</Chip>
        </div>)}
      </Card>

      <Card title="Vyžaduje vašu akciu">
        {[
          ['Check','4 kreatívy na schválenie','Letná kampaň · do 20. 4.','brand'],
          ['Invoice','Faktúra 2026/04/015','249 € · splatnosť 15. 4.','amber'],
          ['Mail','Otázka od Lucie','Report — odpovedať','sky'],
        ].map((a,i)=>{const Ic=I[a[0]]; return <div key={i} style={{display:'flex', gap:12, padding:'12px 10px', borderRadius:10, marginBottom:4, background: i===0?'var(--brand-50)':'transparent', cursor:'pointer'}}>
          <div style={{width:34, height:34, borderRadius:9, background:`var(--acc-${a[3]==='brand'?'amber':a[3]==='amber'?'amber':'sky'})`, color:`var(--acc-${a[3]==='brand'?'amber':a[3]==='amber'?'amber':'sky'}-ink)`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, ...(a[3]==='brand'?{background:'var(--brand-500)', color:'#fff'}:{})}}><Ic size={15}/></div>
          <div style={{flex:1}}>
            <div style={{fontSize:13, fontWeight:600}}>{a[1]}</div>
            <div style={{fontSize:11, color:'var(--ink-sub)'}}>{a[2]}</div>
          </div>
          <I.Chevron size={14} color="var(--ink-mute)"/>
        </div>})}
      </Card>
    </div>

    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16}}>
      <Card title="Tím Adlify">
        <div style={{display:'flex', alignItems:'center', gap:14}}>
          <Avatar name="Štefan Varga" size={48}/>
          <div style={{flex:1}}>
            <div style={{fontSize:14, fontWeight:600}}>Štefan Varga</div>
            <div style={{fontSize:11, color:'var(--ink-sub)'}}>Váš account manažér · odpovedá do 2h</div>
          </div>
          <Btn variant="outline" size="sm" icon={<I.Mail size={14}/>}>Napísať</Btn>
          <Btn variant="outline" size="sm" icon={<I.Phone size={14}/>}>Zavolať</Btn>
        </div>
      </Card>
      <Card title="Najbližšie udalosti">
        {[['18. 4.','14:00','Call · monthly review','brand'],['22. 4.','','Spustenie novej kampane','sky'],['1. 5.','','Fakturácia máj','amber']].map((e,i)=>
          <div key={i} style={{display:'flex', gap:14, padding:'10px 0', borderTop:i?'1px dashed var(--border)':'none'}}>
            <div style={{textAlign:'center', width:44}}>
              <div className="mono" style={{fontSize:15, fontWeight:600, color: e[3]==='brand'?'var(--brand-700)':'var(--ink)'}}>{e[0]}</div>
              {e[1] && <div className="mono" style={{fontSize:10, color:'var(--ink-mute)'}}>{e[1]}</div>}
            </div>
            <div style={{flex:1, fontSize:13, paddingLeft:12, borderLeft:`3px solid var(--acc-${e[3]==='brand'?'amber-ink':e[3]==='amber'?'amber-ink':'sky-ink'})`}}>{e[2]}</div>
          </div>
        )}
      </Card>
    </div>
  </AppFrame>
);

// 3. Portal reports
const ScreenPortalReports = () => (
  <AppFrame mode="portal" active="Reporty" title="Reporty" sub="Výkon kampaní"
    topRight={<><Btn variant="outline" size="sm">Apríl 2026 <I.ChevronDown size={12}/></Btn><Btn variant="outline" size="sm" icon={<I.Download size={14}/>}>PDF</Btn></>}>
    <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:16}}>
      <Stat label="Celkový spend" value="847 €" delta={4}/>
      <Stat label="Konverzie" value="142" delta={28}/>
      <Stat label="Hodnota" value="12 480 €" delta={42} tone="ok"/>
      <Stat label="ROAS" value="14.7×" tone="ok"/>
    </div>
    <Card title="Výkon po týždňoch" right={<Chip tone="ok" size="sm">+28% MoM</Chip>}>
      <div style={{display:'flex', gap:16, alignItems:'flex-end', height:220}}>
        {[['T1',28,6],['T2',34,9],['T3',42,13],['T4',38,19]].map((w,i)=><div key={i} style={{flex:1, display:'flex', gap:8, alignItems:'flex-end', justifyContent:'center'}}>
          <div style={{width:40, height:`${w[1]/50*100}%`, background:'var(--brand-500)', borderRadius:'6px 6px 0 0', position:'relative'}}>
            <div className="mono" style={{position:'absolute', top:-22, left:0, right:0, textAlign:'center', fontSize:11, fontWeight:600}}>{w[1]}</div>
          </div>
          <div style={{width:40, height:`${w[2]/50*100}%`, background:'var(--acc-lavender-ink)', borderRadius:'6px 6px 0 0'}}/>
          <div style={{position:'absolute', bottom:-20, fontSize:11, color:'var(--ink-mute)'}} className="mono">{w[0]}</div>
        </div>)}
      </div>
      <div style={{display:'flex', gap:20, justifyContent:'center', marginTop:30, fontSize:12}}>
        <span style={{display:'flex', gap:6, alignItems:'center'}}><span style={{width:10, height:10, background:'var(--brand-500)', borderRadius:3}}/>Konverzie</span>
        <span style={{display:'flex', gap:6, alignItems:'center'}}><span style={{width:10, height:10, background:'var(--acc-lavender-ink)', borderRadius:3}}/>Návštevy</span>
      </div>
    </Card>
    <div style={{marginTop:16}}><Card title="Detail po kampaniach" pad={0}>
      {[
        ['Letná ponuka · chlieb BIO','FB + IG',420,47,2.1,'+12%'],
        ['Lokálne cielenie · 15km','Google',280,68,4.2,'+32%'],
        ['Remarketing','Facebook',147,27,1.8,'-4%'],
      ].map((c,i)=><div key={i} style={{display:'grid', gridTemplateColumns:'2fr 120px 100px 100px 100px 100px', padding:'16px 20px', borderTop:i?'1px solid var(--border)':'none', alignItems:'center'}}>
        <div style={{fontSize:13, fontWeight:600}}>{c[0]}</div>
        <span style={{fontSize:12, color:'var(--ink-sub)'}}>{c[1]}</span>
        <span className="mono" style={{fontSize:13, fontWeight:600}}>{c[2]}€</span>
        <span className="mono" style={{fontSize:12}}>{c[3]}</span>
        <Chip tone={c[4]>2?'ok':'warn'} size="sm">{c[4]}×</Chip>
        <Chip tone={c[5].startsWith('+')?'ok':'err'} size="sm">{c[5]}</Chip>
      </div>)}
    </Card></div>
  </AppFrame>
);

// 4. Portal — Approvals (creatives)
const ScreenPortalApprovals = () => (
  <AppFrame mode="portal" active="Schvaľovanie" title="Schvaľovanie materiálov" sub="4 čakajú na vaše potvrdenie">
    <div style={{display:'flex', gap:6, marginBottom:16}}>
      {['Všetko (4)','Kreatívy (3)','Texty (1)','Schválené (12)'].map((t,i)=><Chip key={i} tone={i===0?'ink':'n'}>{t}</Chip>)}
    </div>
    <Card title="Letná kampaň · chlieb BIO" right={<><Chip tone="brand" size="sm">4 kreatívy</Chip><Chip tone="amber" size="sm">do 20. 4.</Chip></>}>
      <div style={{fontSize:13, color:'var(--ink-sub)', marginBottom:16, lineHeight:1.55}}>Prosím schváľte tieto vizuály aby sme ich mohli spustiť v pondelok. Môžete schváliť individuálne alebo všetky naraz.</div>
      <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14}}>
        {['v1','v2','v3','v4'].map((v,i)=><div key={i} style={{border:'1px solid var(--border)', borderRadius:12, overflow:'hidden'}}>
          <div style={{aspectRatio:'1', background:`linear-gradient(135deg, ${['#FFE6D3','#FADCE0','#D6EFDE','#E4DEF7'][i]}, ${['#FFA870','#F0B5BF','#A3D6B5','#C6BDF0'][i]})`, display:'flex', alignItems:'center', justifyContent:'center', color:'rgba(0,0,0,.4)', fontFamily:'var(--font-mono)', fontSize:11, letterSpacing:.5, position:'relative'}}>
            kreativ · {v}
            <div style={{position:'absolute', bottom:10, left:10, background:'rgba(255,255,255,.9)', padding:'4px 8px', borderRadius:6, fontSize:10, fontWeight:600, color:'var(--ink)'}}>1080 × 1080</div>
          </div>
          <div style={{padding:12, display:'flex', gap:6}}>
            <Btn variant="outline" size="sm" style={{flex:1, justifyContent:'center'}} icon={<I.Edit size={12}/>}>Komentár</Btn>
            <Btn variant="primary" size="sm" icon={<I.Check size={12}/>}>OK</Btn>
          </div>
        </div>)}
      </div>
      <div style={{display:'flex', justifyContent:'flex-end', gap:8, marginTop:18, paddingTop:18, borderTop:'1px solid var(--border)'}}>
        <Btn variant="outline" size="md">Zamietnuť všetko</Btn>
        <Btn variant="primary" size="md" icon={<I.Check size={14}/>}>Schváliť všetky 4</Btn>
      </div>
    </Card>
  </AppFrame>
);

// 5. Portal — Messages
const ScreenPortalMessages = () => (
  <AppFrame mode="portal" active="Správy" title="Správy" sub="Váš tím Adlify" pad={0}>
    <div style={{display:'grid', gridTemplateColumns:'280px 1fr', height:'100%'}}>
      <div style={{borderRight:'1px solid var(--border)', background:'var(--surface)'}}>
        {[
          ['Štefan Varga','Account manažér','Môžeme sa stretnúť v piatok…','pred 12m',true,true],
          ['Lucia Molnárová','Kreatíva','Posielam vám preview kreatívov.','pred 2h',false,false],
          ['Peter Kováčik','Copywriter','Texty sú schválené, ide to do…','včera',false,false],
          ['Podpora Adlify','Tím','Váš ticket #1247 bol vyriešený.','2d',false,false],
        ].map((t,i)=><div key={i} style={{display:'flex', gap:10, padding:'14px 16px', borderBottom:'1px solid var(--border)', cursor:'pointer', background:i===0?'var(--brand-50)':'transparent'}}>
          <Avatar name={t[0]} size={38}/>
          <div style={{flex:1, minWidth:0}}>
            <div style={{display:'flex', justifyContent:'space-between'}}>
              <span style={{fontSize:13, fontWeight:t[4]?700:500}}>{t[0]}</span>
              <span style={{fontSize:11, color:'var(--ink-mute)'}}>{t[3]}</span>
            </div>
            <div style={{fontSize:11, color:'var(--ink-sub)'}}>{t[1]}</div>
            <div style={{fontSize:12, color:'var(--ink-sub)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginTop:3, fontWeight:t[4]?600:400}}>{t[2]}</div>
          </div>
        </div>)}
      </div>
      <div style={{display:'flex', flexDirection:'column'}}>
        <div style={{padding:'16px 24px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12, background:'var(--surface)'}}>
          <Avatar name="Štefan Varga" size={36}/>
          <div style={{flex:1}}>
            <div style={{fontSize:14, fontWeight:600}}>Štefan Varga</div>
            <div style={{fontSize:11, color:'var(--ok)', display:'flex', gap:5, alignItems:'center'}}><span style={{width:6, height:6, borderRadius:99, background:'var(--ok)'}}/>Online · odpovedá do 2h</div>
          </div>
          <Btn variant="outline" size="sm" icon={<I.Phone size={14}/>}>Call</Btn>
        </div>
        <div style={{flex:1, overflowY:'auto', padding:24, display:'flex', flexDirection:'column', gap:14, background:'var(--bg)'}}>
          {[
            {me:false, t:'pred 2h', text:'Dobrý deň Jana, posielam vám preview kreatívov pre letnú kampaň. Pozrite si ich, prosím, a dajte vedieť.'},
            {me:true, t:'pred 1h', text:'Ďakujem! Vyzerajú super, len verzia 3 má trochu malé logo. Môžeme to upraviť?'},
            {me:false, t:'pred 45m', text:'Jasné, Lucia to upraví a pošle vám novú verziu dnes do konca dňa.'},
            {me:false, t:'pred 12m', text:'Môžeme sa stretnúť v piatok o 14:00 na monthly review? Budem mať pre vás aj plán na máj.'},
          ].map((m,i)=><div key={i} style={{display:'flex', gap:10, maxWidth:520, alignSelf:m.me?'flex-end':'flex-start', flexDirection:m.me?'row-reverse':'row'}}>
            <Avatar name={m.me?"Jana Kováčová":"Štefan V"} size={28}/>
            <div>
              <div style={{fontSize:10, color:'var(--ink-mute)', marginBottom:4, textAlign:m.me?'right':'left'}}>{m.t}</div>
              <div style={{background:m.me?'var(--brand-500)':'var(--surface)', color:m.me?'#fff':'var(--ink)', padding:'10px 14px', borderRadius:14, fontSize:13, lineHeight:1.5, border:m.me?'none':'1px solid var(--border)'}}>{m.text}</div>
            </div>
          </div>)}
        </div>
        <div style={{padding:14, borderTop:'1px solid var(--border)', background:'var(--surface)', display:'flex', gap:8, alignItems:'center'}}>
          <Btn variant="ghost" size="sm"><I.Attach size={16}/></Btn>
          <div style={{flex:1, padding:'10px 14px', background:'var(--n-50)', border:'1px solid var(--border)', borderRadius:10, fontSize:13, color:'var(--ink-mute)'}}>Napíš odpoveď…</div>
          <Btn variant="primary" size="md" icon={<I.Send size={14}/>}>Odoslať</Btn>
        </div>
      </div>
    </div>
  </AppFrame>
);

// 6. Portal — Invoices
const ScreenPortalInvoices = () => (
  <AppFrame mode="portal" active="Faktúry" title="Faktúry" sub="Pekáreň Jablko s.r.o.">
    <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:16}}>
      <Stat label="Celkom zaplatené (2026)" value="1 245 €" hint="5 faktúr"/>
      <Stat label="Ďalšia splatnosť" value="249 €" hint="15. 5. 2026"/>
      <Stat label="Spôsob platby" value="SEPA" hint="••• 4521"/>
    </div>
    <Card pad={0}>
      <div style={{display:'grid', gridTemplateColumns:'130px 2fr 100px 120px 120px 120px 40px', padding:'12px 20px', background:'var(--n-50)', borderBottom:'1px solid var(--border)', fontSize:11, fontWeight:600, color:'var(--ink-sub)', textTransform:'uppercase', letterSpacing:.8}}>
        <span>Číslo</span><span>Popis</span><span>Suma</span><span>Splatnosť</span><span>Status</span><span/><span/>
      </div>
      {[
        ['2026/04/015','Pro balík · apríl 2026',249,'15. 4. 2026','Zaplatené','mint'],
        ['2026/03/012','Pro balík · marec 2026',249,'15. 3. 2026','Zaplatené','mint'],
        ['2026/02/009','Pro balík · február 2026',249,'15. 2. 2026','Zaplatené','mint'],
        ['2026/01/004','Pro balík · január 2026 + setup',498,'15. 1. 2026','Zaplatené','mint'],
        ['2026/05/—','Pro balík · máj 2026 (pripravované)',249,'15. 5. 2026','Čaká','amber'],
      ].map((r,i)=><div key={i} style={{display:'grid', gridTemplateColumns:'130px 2fr 100px 120px 120px 120px 40px', padding:'14px 20px', borderTop:'1px solid var(--border)', alignItems:'center'}}>
        <span className="mono" style={{fontSize:11, color:'var(--ink-sub)'}}>{r[0]}</span>
        <span style={{fontSize:13, fontWeight:500}}>{r[1]}</span>
        <span className="mono" style={{fontSize:13, fontWeight:600}}>{r[2]}€</span>
        <span style={{fontSize:12, color:'var(--ink-sub)'}}>{r[3]}</span>
        <Chip tone={r[5]} size="sm" dot>{r[4]}</Chip>
        <Btn variant="outline" size="sm" icon={<I.Download size={12}/>}>PDF</Btn>
        <I.More size={14} color="var(--ink-mute)"/>
      </div>)}
    </Card>
  </AppFrame>
);

// 7. Portal Campaigns (simplified)
const ScreenPortalCampaigns = () => (
  <AppFrame mode="portal" active="Kampane" title="Kampane" sub="3 aktívne">
    <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14}}>
      {[
        ['Letná ponuka · chlieb BIO','FB + Instagram','Aktívna','mint',420,1000,47,2.1],
        ['Lokálne cielenie · 15km','Google Ads','Aktívna','mint',280,400,68,4.2],
        ['Remarketing wellness','Facebook','Pauza','amber',147,300,27,1.8],
      ].map((c,i)=><Card key={i} pad={0}>
        <div style={{height:100, background:`linear-gradient(135deg, ${['var(--acc-rose)','var(--acc-mint)','var(--acc-lavender)'][i]}, ${['#F0B5BF','#A3D6B5','#C6BDF0'][i]})`, position:'relative', display:'flex', alignItems:'flex-end', padding:14}}>
          <Chip tone={c[3]} size="sm" dot>{c[2]}</Chip>
          <div style={{position:'absolute', top:14, right:14, display:'flex', gap:4}}>
            {c[1].includes('FB') && <I.Fb size={16}/>}
            {c[1].includes('Google') && <I.Google size={16}/>}
            {c[1].includes('Instagram') && <I.Instagram size={16}/>}
          </div>
        </div>
        <div style={{padding:18}}>
          <div style={{fontSize:15, fontWeight:600, letterSpacing:-.2}}>{c[0]}</div>
          <div style={{fontSize:12, color:'var(--ink-sub)', marginTop:2}}>{c[1]}</div>
          <div style={{marginTop:14}}>
            <div style={{display:'flex', justifyContent:'space-between', fontSize:11, color:'var(--ink-mute)', marginBottom:6}}>
              <span>Rozpočet</span><span className="mono">{c[4]}€ z {c[5]}€</span>
            </div>
            <div style={{height:6, background:'var(--n-75)', borderRadius:99, overflow:'hidden'}}>
              <div style={{width:`${c[4]/c[5]*100}%`, height:'100%', background:'var(--brand-500)'}}/>
            </div>
          </div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:14, paddingTop:14, borderTop:'1px solid var(--border)'}}>
            <div><div style={{fontSize:10, color:'var(--ink-mute)', textTransform:'uppercase', letterSpacing:.8}}>Konverzie</div><div style={{fontSize:20, fontWeight:600, fontFamily:'var(--font-mono)'}}>{c[6]}</div></div>
            <div><div style={{fontSize:10, color:'var(--ink-mute)', textTransform:'uppercase', letterSpacing:.8}}>ROI</div><div style={{fontSize:20, fontWeight:600, fontFamily:'var(--font-mono)', color: c[7]>2?'var(--ok)':'var(--warn)'}}>{c[7]}×</div></div>
          </div>
        </div>
      </Card>)}
    </div>
  </AppFrame>
);

// 8. Portal Tickets
const ScreenPortalTickets = () => (
  <AppFrame mode="portal" active="Tickety" title="Podpora" sub="Vaše tickety"
    topRight={<Btn variant="primary" size="sm" icon={<I.Plus size={14}/>}>Nový ticket</Btn>}>
    <div style={{display:'grid', gridTemplateColumns:'1fr 320px', gap:16}}>
      <Card pad={0}>
        <div style={{display:'grid', gridTemplateColumns:'60px 2.2fr 110px 120px 100px 40px', padding:'12px 20px', background:'var(--n-50)', borderBottom:'1px solid var(--border)', fontSize:11, fontWeight:600, color:'var(--ink-sub)', textTransform:'uppercase', letterSpacing:.8}}>
          <span>#</span><span>Predmet</span><span>Priorita</span><span>Status</span><span>Vek</span><span/>
        </div>
        {[
          [1247,'FB Pixel nefunguje na mobilných zariadeniach','Urgent','err','In progress','brand','2h'],
          [1241,'Nové landing page pre letnú akciu','High','warn','In progress','brand','2d'],
          [1240,'Faktúra marec — otázka k DPH','Low','sky','Vyriešené','mint','3d'],
          [1235,'Pridanie IG do balíka','Low','sky','Vyriešené','mint','1t'],
        ].map((r,i)=><div key={i} style={{display:'grid', gridTemplateColumns:'60px 2.2fr 110px 120px 100px 40px', padding:'14px 20px', borderTop:'1px solid var(--border)', alignItems:'center'}}>
          <span className="mono" style={{fontSize:11, color:'var(--ink-mute)'}}>#{r[0]}</span>
          <span style={{fontSize:13, fontWeight:500}}>{r[1]}</span>
          <Chip tone={r[3]} size="sm" dot>{r[2]}</Chip>
          <Chip tone={r[5]} size="sm">{r[4]}</Chip>
          <span className="mono" style={{fontSize:11, color:'var(--ink-sub)'}}>{r[6]}</span>
          <I.Chevron size={14} color="var(--ink-mute)"/>
        </div>)}
      </Card>
      <Card title="Potrebujete pomoc?">
        <div style={{fontSize:13, color:'var(--ink-sub)', lineHeight:1.6, marginBottom:16}}>
          Máte otázku? Ozvite sa priamo vášmu account manažérovi alebo vytvorte ticket.
        </div>
        <div style={{display:'flex', alignItems:'center', gap:10, padding:14, background:'var(--n-50)', borderRadius:10, marginBottom:10}}>
          <Avatar name="Štefan Varga" size={40}/>
          <div style={{flex:1}}><div style={{fontSize:13, fontWeight:600}}>Štefan Varga</div><div style={{fontSize:11, color:'var(--ink-sub)'}}>Odpovedá do 2h</div></div>
        </div>
        <Btn variant="primary" size="md" style={{width:'100%', justifyContent:'center'}} icon={<I.Mail size={14}/>}>Napísať Štefanovi</Btn>
        <Btn variant="outline" size="md" style={{width:'100%', justifyContent:'center', marginTop:8}} icon={<I.Phone size={14}/>}>+421 944 184 045</Btn>
      </Card>
    </div>
  </AppFrame>
);

// 9. Portal Calendar (simple upcoming)
const ScreenPortalCalendar = () => (
  <AppFrame mode="portal" active="Kalendár" title="Kalendár & meetingy" sub="Vaše udalosti s tímom Adlify"
    topRight={<Btn variant="primary" size="sm" icon={<I.Plus size={14}/>}>Nová udalosť</Btn>}>
    <div style={{display:'grid', gridTemplateColumns:'2fr 1fr', gap:16}}>
      <Card title="Najbližšie">
        {[
          ['18','apr','14:00','Monthly review · apríl','call · 45 min','Štefan Varga','brand',true],
          ['22','apr','','Spustenie novej kampane','deadline','—','sky',false],
          ['29','apr','10:30','Strategický call · máj','call · 60 min','Štefan Varga + Lucia','lav',false],
          ['1','máj','','Fakturácia máj 2026','249 €','—','amber',false],
          ['8','máj','16:00','Kreatívny workshop','meeting · in-person','Lucia Molnárová','rose',false],
        ].map((e,i)=><div key={i} style={{display:'flex', gap:14, padding:'16px 0', borderTop:i?'1px solid var(--border)':'none', alignItems:'center'}}>
          <div style={{textAlign:'center', width:56, padding:'8px 6px', background: e[7]?'var(--brand-500)':'var(--n-50)', color: e[7]?'#fff':'var(--ink)', borderRadius:10}}>
            <div className="mono" style={{fontSize:22, fontWeight:700, lineHeight:1}}>{e[0]}</div>
            <div className="mono" style={{fontSize:10, textTransform:'uppercase', letterSpacing:.8, opacity:.8}}>{e[1]}</div>
          </div>
          <div style={{flex:1, paddingLeft:14, borderLeft:`3px solid var(--acc-${e[6]==='lav'?'lavender':e[6]==='sky'?'sky':e[6]==='rose'?'rose':e[6]==='amber'?'amber':'amber'}-ink)`}}>
            <div style={{fontSize:14, fontWeight:600}}>{e[3]} {e[7] && <Chip tone="brand" size="sm">Dnes</Chip>}</div>
            <div style={{fontSize:12, color:'var(--ink-sub)', marginTop:2}}>
              {e[2] && <><I.Clock size={11} style={{verticalAlign:'-1px'}}/> {e[2]} · </>}{e[4]}
              {e[5]!=='—' && <> · {e[5]}</>}
            </div>
          </div>
          {e[7] && <Btn variant="primary" size="sm" icon={<I.Play size={12}/>}>Join</Btn>}
        </div>)}
      </Card>
      <Card title="Apríl 2026">
        <div style={{display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4, fontSize:11}}>
          {['P','U','S','Š','P','S','N'].map((d,i)=><div key={i} style={{textAlign:'center', color:'var(--ink-mute)', fontWeight:600, padding:'6px 0'}}>{d}</div>)}
          {Array.from({length:30},(_,i)=>i+1).map(d=>{
            const has = [18,22,29].includes(d);
            const today = d===18;
            return <div key={d} style={{textAlign:'center', padding:'8px 0', borderRadius:6, fontWeight:today?700:500, color: today?'#fff':has?'var(--brand-700)':'var(--ink)', background: today?'var(--brand-500)':has?'var(--brand-50)':'transparent', cursor:'pointer'}}>{d}</div>;
          })}
        </div>
      </Card>
    </div>
  </AppFrame>
);

// 10. Portal documents
const ScreenPortalDocuments = () => (
  <AppFrame mode="portal" active="Dokumenty" title="Dokumenty" sub="Zmluvy, reporty, kreatívy">
    <div style={{display:'flex', gap:6, marginBottom:14}}>
      {['Všetko (18)','Zmluvy (3)','Reporty (5)','Kreatívy (8)','Faktúry (5)'].map((t,i)=><Chip key={i} tone={i===0?'ink':'n'}>{t}</Chip>)}
    </div>
    <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12}}>
      {[
        ['Docs','Zmluva Pro · podpísaná','PDF · 2.4 MB','15. 1. 2026','mint'],
        ['Chart','Report · marec 2026','PDF · 4.2 MB','1. 4. 2026','lav'],
        ['Chart','Report · február 2026','PDF · 4.1 MB','1. 3. 2026','lav'],
        ['Template','Kreatívy · letná','ZIP · 18 MB','18. 3. 2026','rose'],
        ['Docs','Brand guidelines','PDF · 8.1 MB','12. 3. 2026','sky'],
        ['Invoice','Faktúry Q1 2026','ZIP · 1.2 MB','1. 4. 2026','amber'],
        ['Template','Logo pack','ZIP · 22.6 MB','15. 1. 2026','rose'],
        ['Docs','GDPR súhlasy','PDF · 340 KB','15. 1. 2026','mint'],
      ].map((d,i)=>{const Ic = I[d[0]]; return <div key={i} style={{background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16, display:'flex', flexDirection:'column', gap:10, cursor:'pointer'}}>
        <div style={{width:44, height:44, borderRadius:10, background:`var(--acc-${d[4]==='lav'?'lavender':d[4]==='sky'?'sky':d[4]==='mint'?'mint':d[4]==='rose'?'rose':'amber'})`, color:`var(--acc-${d[4]==='lav'?'lavender':d[4]==='sky'?'sky':d[4]==='mint'?'mint':d[4]==='rose'?'rose':'amber'}-ink)`, display:'flex', alignItems:'center', justifyContent:'center'}}><Ic size={20}/></div>
        <div>
          <div style={{fontSize:13, fontWeight:600}}>{d[1]}</div>
          <div style={{fontSize:11, color:'var(--ink-sub)'}}>{d[2]}</div>
        </div>
        <div style={{display:'flex', justifyContent:'space-between', fontSize:11, color:'var(--ink-mute)', marginTop:'auto'}}>
          <span>{d[3]}</span><I.Download size={13}/>
        </div>
      </div>})}
    </div>
  </AppFrame>
);

// 11. Portal Settings
const ScreenPortalSettings = () => (
  <AppFrame mode="portal" active="Nastavenia" title="Nastavenia účtu" sub="Pekáreň Jablko s.r.o.">
    <div style={{display:'grid', gridTemplateColumns:'220px 1fr', gap:24}}>
      <div>
        {[['Profil','Users',true],['Firma','Building',false],['Notifikácie','Bell',false],['Reklamné účty','Link',false],['Spôsob platby','Money',false],['Bezpečnosť','Lock',false]].map((s,i)=>{const Ic=I[s[1]]; return <div key={i} style={{display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:8, background:s[2]?'var(--n-75)':'transparent', fontSize:13, fontWeight:s[2]?600:500, color:s[2]?'var(--ink)':'var(--ink-sub)', marginBottom:2}}><Ic size={16}/>{s[0]}</div>})}
      </div>
      <Card title="Profil">
        <div style={{display:'flex', gap:20, alignItems:'center', marginBottom:20, paddingBottom:20, borderBottom:'1px solid var(--border)'}}>
          <Avatar name="Jana Kováčová" size={70}/>
          <div style={{flex:1}}>
            <div style={{fontSize:16, fontWeight:600}}>Jana Kováčová</div>
            <div style={{fontSize:12, color:'var(--ink-sub)'}}>Konateľka · Pekáreň Jablko s.r.o.</div>
          </div>
          <Btn variant="outline" size="sm" icon={<I.Upload size={14}/>}>Zmeniť foto</Btn>
        </div>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
          {[['Meno','Jana'],['Priezvisko','Kováčová'],['Email','jana@pekaren-jablko.sk'],['Telefón','+421 905 123 456'],['Pozícia','Konateľka'],['Jazyk','Slovenčina']].map((f,i)=>
            <div key={i}>
              <label style={{fontSize:11, color:'var(--ink-mute)', textTransform:'uppercase', letterSpacing:.8, fontWeight:600, display:'block', marginBottom:5}}>{f[0]}</label>
              <div style={{padding:'10px 12px', background:'var(--n-50)', border:'1px solid var(--border)', borderRadius:9, fontSize:13}}>{f[1]}</div>
            </div>
          )}
        </div>
        <div style={{display:'flex', justifyContent:'flex-end', marginTop:20}}>
          <Btn variant="primary" size="md">Uložiť zmeny</Btn>
        </div>
      </Card>
    </div>
  </AppFrame>
);

Object.assign(window, {
  ScreenPortalLogin, ScreenPortalDashboard, ScreenPortalReports, ScreenPortalApprovals,
  ScreenPortalMessages, ScreenPortalInvoices, ScreenPortalCampaigns, ScreenPortalTickets,
  ScreenPortalCalendar, ScreenPortalDocuments, ScreenPortalSettings
});
