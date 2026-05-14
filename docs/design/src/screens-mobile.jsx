// Mobile screens — admin + portal, using iOS frame (375×812 scaled to ~340×735)
// Keeps the Adlify design system: soft modern, no emoji, JetBrains Mono for numbers.

const MW = 375, MH = 812;

// Mobile container — just the "screen" content. We mount into an iPhone frame shell later.
const MScreen = ({ children, bg='var(--bg)' }) => (
  <div className="adl" style={{width:MW, height:MH, background:bg, overflow:'hidden', display:'flex', flexDirection:'column', fontFamily:'var(--font-sans)'}}>
    {children}
  </div>
);

// iOS-like status bar (light, Adlify-style)
const MStatus = () => (
  <div style={{height:44, padding:'0 22px', display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:14, fontWeight:600, flexShrink:0, paddingTop:8}}>
    <span>9:41</span>
    <div style={{display:'flex', gap:5, alignItems:'center'}}>
      <svg width="16" height="10" viewBox="0 0 16 10"><rect x="0" y="6" width="2.5" height="3.5" rx=".5" fill="#000"/><rect x="4" y="4" width="2.5" height="5.5" rx=".5" fill="#000"/><rect x="8" y="2" width="2.5" height="7.5" rx=".5" fill="#000"/><rect x="12" y="0" width="2.5" height="9.5" rx=".5" fill="#000"/></svg>
      <svg width="14" height="10" viewBox="0 0 14 10"><path d="M7 3a7 7 0 014 1.5l1-1A9 9 0 002 3.5l1 1A7 7 0 017 3zm0 3a4 4 0 012.5 1l1-1A5.5 5.5 0 003 7l1 1A4 4 0 017 6zm0 2.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" fill="#000"/></svg>
      <svg width="24" height="11" viewBox="0 0 24 11"><rect x=".5" y=".5" width="20" height="10" rx="2.5" stroke="#000" strokeOpacity=".4" fill="none"/><rect x="2" y="2" width="17" height="7" rx="1.5" fill="#000"/><rect x="21" y="3.5" width="1.5" height="4" rx=".5" fill="#000" fillOpacity=".4"/></svg>
    </div>
  </div>
);

// Bottom tab bar for admin / portal
const MTabBar = ({ tabs, active }) => (
  <div style={{height:84, padding:'8px 6px 24px', background:'var(--surface)', borderTop:'1px solid var(--border)', display:'flex', flexShrink:0}}>
    {tabs.map((t,i)=>{const Ic = I[t.icon]; const on = t.k===active; return <div key={i} style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3, color: on?'var(--brand-600)':'var(--ink-mute)', position:'relative'}}>
      {t.badge && <span style={{position:'absolute', top:-2, right:'32%', minWidth:14, height:14, padding:'0 4px', background:'var(--brand-500)', color:'#fff', fontSize:9, fontWeight:700, borderRadius:99, display:'flex', alignItems:'center', justifyContent:'center', border:'2px solid var(--surface)'}}>{t.badge}</span>}
      <Ic size={22}/>
      <span style={{fontSize:10, fontWeight: on?600:500}}>{t.k}</span>
    </div>})}
  </div>
);

const MHeader = ({ title, sub, left, right }) => (
  <div style={{padding:'6px 20px 14px', display:'flex', alignItems:'center', gap:12, flexShrink:0}}>
    {left || <div style={{width:38, height:38, borderRadius:11, background:'var(--surface)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center'}}><I.Chevron size={14} style={{transform:'rotate(180deg)'}}/></div>}
    <div style={{flex:1, minWidth:0}}>
      <div style={{fontSize:11, color:'var(--ink-mute)', textTransform:'uppercase', letterSpacing:.8, fontWeight:600}}>{sub}</div>
      <div style={{fontSize:19, fontWeight:700, letterSpacing:-.4}}>{title}</div>
    </div>
    {right}
  </div>
);

const ADMIN_TABS = [
  {k:'Domov', icon:'Dashboard'}, {k:'Klienti', icon:'Clients'},
  {k:'Inbox', icon:'Mail', badge:3}, {k:'Úlohy', icon:'Tasks', badge:5}, {k:'Viac', icon:'More'},
];
const PORTAL_TABS = [
  {k:'Prehľad', icon:'Dashboard'}, {k:'Kampane', icon:'Campaign'},
  {k:'Správy', icon:'Mail', badge:2}, {k:'Akcie', icon:'Check', badge:4}, {k:'Viac', icon:'More'},
];

// ───────── Admin Mobile: Dashboard
const MAdminDashboard = () => (
  <MScreen>
    <MStatus/>
    <div style={{padding:'4px 20px 0', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
      <I.Logo size={30}/>
      <div style={{display:'flex', gap:8}}>
        <div style={{width:38, height:38, borderRadius:11, background:'var(--surface)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', position:'relative'}}><I.Bell size={16}/><span style={{position:'absolute', top:8, right:10, width:7, height:7, borderRadius:99, background:'var(--brand-500)', border:'2px solid var(--surface)'}}/></div>
        <Avatar name="Štefan Varga" size={38}/>
      </div>
    </div>
    <div style={{padding:'18px 20px 8px'}}>
      <div style={{fontSize:12, color:'var(--ink-sub)'}}>Piatok, 18. apríla · dobré ráno</div>
      <div style={{fontSize:26, fontWeight:700, letterSpacing:-.7, marginTop:2}}>Štefan</div>
    </div>

    <div style={{flex:1, overflowY:'auto', padding:'8px 16px 16px'}}>
      {/* Hero stat */}
      <div style={{background:'linear-gradient(135deg, var(--brand-500), var(--brand-700))', color:'#fff', borderRadius:18, padding:20, position:'relative', overflow:'hidden'}}>
        <div style={{position:'absolute', right:-40, top:-40, width:180, height:180, background:'radial-gradient(circle, rgba(255,255,255,.25), transparent 70%)'}}/>
        <div style={{fontSize:10, textTransform:'uppercase', letterSpacing:1, opacity:.85, fontWeight:600}}>MRR · apríl</div>
        <div style={{fontSize:34, fontWeight:700, letterSpacing:-.8, marginTop:2}}>5 416 €</div>
        <div style={{display:'flex', gap:6, alignItems:'center', fontSize:12, marginTop:4}}>
          <span style={{background:'rgba(255,255,255,.2)', padding:'2px 7px', borderRadius:99, fontWeight:600}}>+18% MoM</span>
          <span style={{opacity:.85}}>cieľ 6 500 €</span>
        </div>
        <div style={{height:4, background:'rgba(255,255,255,.2)', borderRadius:99, marginTop:14, overflow:'hidden'}}>
          <div style={{width:'83%', height:'100%', background:'#fff'}}/>
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:12}}>
        <div style={{background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:14}}>
          <div style={{fontSize:10, color:'var(--ink-mute)', textTransform:'uppercase', letterSpacing:.8, fontWeight:600}}>Leady</div>
          <div style={{fontSize:22, fontWeight:700, marginTop:2}}>18</div>
          <div style={{fontSize:11, color:'var(--ok)', fontFamily:'var(--font-mono)'}}>+6 nové</div>
        </div>
        <div style={{background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:14}}>
          <div style={{fontSize:10, color:'var(--ink-mute)', textTransform:'uppercase', letterSpacing:.8, fontWeight:600}}>Klientov</div>
          <div style={{fontSize:22, fontWeight:700, marginTop:2}}>15</div>
          <div style={{fontSize:11, color:'var(--ink-sub)'}}>12 aktívnych</div>
        </div>
      </div>

      <div style={{marginTop:18, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 4px 8px'}}>
        <div style={{fontSize:14, fontWeight:700, letterSpacing:-.2}}>Vyžaduje akciu · 4</div>
        <span style={{fontSize:12, color:'var(--brand-600)', fontWeight:600}}>Všetko</span>
      </div>

      {[
        ['Check','Schváliť kreatívy','Pekáreň Jablko · 4 vizuály','brand','1d'],
        ['Mail','Odpovedať Lucii M.','Kozmetika Luna · otázka k reportu','amber','1h'],
        ['Invoice','Poslať faktúru','MUDr. Novák · marec','sky','dnes'],
        ['Phone','Call Fitness Dynamic','monthly review','lav','14:00'],
      ].map((a,i)=>{const Ic=I[a[0]]; return <div key={i} style={{display:'flex', gap:12, alignItems:'center', padding:'14px 14px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, marginBottom:8}}>
        <div style={{width:40, height:40, borderRadius:11, background:`var(--acc-${a[3]==='brand'?'amber':a[3]==='amber'?'amber':a[3]==='sky'?'sky':'lavender'})`, color:`var(--acc-${a[3]==='brand'?'amber-ink':a[3]==='amber'?'amber-ink':a[3]==='sky'?'sky-ink':'lavender-ink'})`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, ...(a[3]==='brand'?{background:'var(--brand-500)', color:'#fff'}:{})}}><Ic size={17}/></div>
        <div style={{flex:1, minWidth:0}}>
          <div style={{fontSize:14, fontWeight:600, letterSpacing:-.1}}>{a[1]}</div>
          <div style={{fontSize:11, color:'var(--ink-sub)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{a[2]}</div>
        </div>
        <Chip tone="n" size="sm">{a[4]}</Chip>
      </div>})}
    </div>
    <MTabBar tabs={ADMIN_TABS} active="Domov"/>
  </MScreen>
);

// ───────── Admin Mobile: Client list
const MAdminClients = () => (
  <MScreen>
    <MStatus/>
    <MHeader title="Klienti" sub="15 aktívnych" left={<I.Logo size={32}/>} right={<div style={{width:38, height:38, borderRadius:11, background:'var(--brand-500)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center'}}><I.Plus size={16}/></div>}/>
    <div style={{padding:'0 20px 12px'}}>
      <div style={{background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'10px 14px', display:'flex', alignItems:'center', gap:8}}>
        <I.Search size={16} color="var(--ink-mute)"/>
        <span style={{flex:1, fontSize:14, color:'var(--ink-mute)'}}>Hľadať klientov…</span>
      </div>
      <div style={{display:'flex', gap:6, marginTop:12, overflowX:'auto', paddingBottom:4}}>
        {['Všetci (15)','Aktívni (12)','Risk (2)','Nový (1)','Pro','Enterprise'].map((t,i)=><Chip key={i} tone={i===0?'ink':'n'} size="sm">{t}</Chip>)}
      </div>
    </div>

    <div style={{flex:1, overflowY:'auto', padding:'0 16px 16px'}}>
      {[
        ['Pekáreň Jablko','Pro · 249€','3','mint','healthy',3.4],
        ['Kozmetika Luna','Enterprise · 399€','5','mint','healthy',3.8],
        ['Fitness Dynamic','Premium · 1250€','8','mint','healthy',4.2],
        ['MUDr. Novák','Starter · 149€','1','sky','new',5.1],
        ['Kvety Orchidea','Starter · 149€','1','rose','risk',1.8],
        ['Bistro Verde','Pro · 249€','2','mint','healthy',2.1],
        ['Autoservis Kováčik','Pro · 249€','2','mint','healthy',2.6],
        ['Kaviareň Latté','Starter · 149€','1','mint','healthy',2.9],
      ].map((c,i)=><div key={i} style={{display:'flex', gap:12, alignItems:'center', padding:'14px 14px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, marginBottom:8}}>
        <Avatar name={c[0]} size={44}/>
        <div style={{flex:1, minWidth:0}}>
          <div style={{fontSize:14, fontWeight:600, letterSpacing:-.1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{c[0]}</div>
          <div style={{fontSize:11, color:'var(--ink-sub)', display:'flex', gap:6, alignItems:'center'}}>
            <span>{c[1]}</span><I.Dot size={6}/><span>{c[2]} kampane</span>
          </div>
        </div>
        <div style={{textAlign:'right'}}>
          <div className="mono" style={{fontSize:14, fontWeight:700, color: c[5]>=3?'var(--ok)':'var(--warn)'}}>{c[5]}×</div>
          <Chip tone={c[3]} size="sm" dot>{c[4]==='healthy'?'OK':c[4]==='new'?'nový':'risk'}</Chip>
        </div>
      </div>)}
    </div>
    <MTabBar tabs={ADMIN_TABS} active="Klienti"/>
  </MScreen>
);

// ───────── Admin Mobile: Inbox
const MAdminInbox = () => (
  <MScreen>
    <MStatus/>
    <MHeader title="Inbox" sub="3 nové" left={<I.Logo size={32}/>} right={<div style={{width:38, height:38, borderRadius:11, background:'var(--surface)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center'}}><I.Search size={16}/></div>}/>
    <div style={{padding:'0 20px 10px', display:'flex', gap:6, overflowX:'auto'}}>
      {['Všetko','Klienti','Leady','Interné','Nezobrazené'].map((t,i)=><Chip key={i} tone={i===0?'ink':'n'} size="sm">{t}</Chip>)}
    </div>
    <div style={{flex:1, overflowY:'auto', padding:'4px 16px 16px'}}>
      {[
        ['Martin Jabĺčko','Re: Schválenie kreatívov','Super, môžeme to púšťať. Ďakujem…','12m','Pekáreň Jablko','mint',true,true],
        ['Lucia Molnárová','Otázka k reportu','Ahoj, neviem či som správne…','1h','Kozmetika Luna','lav',true,false],
        ['MUDr. Novák','Faktúra marec','Viete mi prosím poslať faktúru…','2h','MUDr. Novák','sky',true,false],
        ['Peter Kováčik','Dopyt cez web','Dobrý deň, videl som vašu ponuku…','9:14','Nový lead','amber',false,false],
        ['Eva Dvořáková','Meeting piatok?','Môžeme si presunúť stretnutie…','včera','Fitness Dynamic','rose',false,false],
        ['Tomáš Varga','Update o Bistre Verde','Pozri, chcú escalate na Premium…','včera','Interné','n',false,false],
      ].map((t,i)=><div key={i} style={{display:'flex', gap:12, padding:'12px 0', borderBottom:'1px solid var(--border)', alignItems:'flex-start'}}>
        {t[6] && <div style={{width:8, height:8, borderRadius:99, background:'var(--brand-500)', marginTop:8, marginLeft:-2, flexShrink:0}}/>}
        <Avatar name={t[0]} size={40}/>
        <div style={{flex:1, minWidth:0}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:8}}>
            <span style={{fontSize:14, fontWeight:t[6]?700:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{t[0]}</span>
            <span style={{fontSize:11, color:'var(--ink-mute)', whiteSpace:'nowrap'}}>{t[3]}</span>
          </div>
          <div style={{fontSize:13, fontWeight:t[6]?600:500, marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{t[1]}</div>
          <div style={{fontSize:12, color:'var(--ink-sub)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginTop:2}}>{t[2]}</div>
          <div style={{display:'flex', gap:5, marginTop:6}}>
            <Chip tone={t[5]} size="sm">{t[4]}</Chip>
            {t[7] && <Chip tone="brand" size="sm">akcia</Chip>}
          </div>
        </div>
      </div>)}
    </div>
    <MTabBar tabs={ADMIN_TABS} active="Inbox"/>
  </MScreen>
);

// ───────── Admin Mobile: Client detail
const MAdminClientDetail = () => (
  <MScreen>
    <MStatus/>
    <MHeader title="Pekáreň Jablko" sub="KLIENT · PRO"/>
    <div style={{flex:1, overflowY:'auto', padding:'0 20px 16px'}}>
      <div style={{display:'flex', alignItems:'center', gap:14, paddingBottom:18, borderBottom:'1px solid var(--border)'}}>
        <Avatar name="Pekáreň Jablko" size={56}/>
        <div style={{flex:1}}>
          <div style={{fontSize:12, color:'var(--ink-sub)'}}>Martin Jabĺčko · konateľ</div>
          <div style={{fontSize:11, color:'var(--ink-mute)', fontFamily:'var(--font-mono)', marginTop:2}}>+421 905 211 874</div>
        </div>
        <div style={{display:'flex', gap:6}}>
          <div style={{width:40, height:40, borderRadius:11, background:'var(--surface)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center'}}><I.Phone size={16}/></div>
          <div style={{width:40, height:40, borderRadius:11, background:'var(--brand-500)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center'}}><I.Mail size={16}/></div>
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginTop:16}}>
        {[['ROI','3.4×','ok'],['MRR','249€','n'],['Konv.','142','ok']].map((s,i)=>
          <div key={i} style={{background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 10px', textAlign:'center'}}>
            <div style={{fontSize:10, color:'var(--ink-mute)', textTransform:'uppercase', letterSpacing:.8, fontWeight:600}}>{s[0]}</div>
            <div className="mono" style={{fontSize:18, fontWeight:700, marginTop:3, color: s[2]==='ok'?'var(--ok)':'var(--ink)'}}>{s[1]}</div>
          </div>)}
      </div>

      <div style={{display:'flex', gap:6, marginTop:18, marginBottom:10, overflowX:'auto'}}>
        {['Prehľad','Kampane (3)','Správy','Fakturácia','Súbory'].map((t,i)=><Chip key={i} tone={i===0?'ink':'n'} size="sm">{t}</Chip>)}
      </div>

      <div style={{fontSize:12, color:'var(--ink-mute)', textTransform:'uppercase', letterSpacing:.8, fontWeight:600, marginTop:10, marginBottom:8}}>Aktívne kampane</div>
      {[
        ['Letná ponuka · chlieb BIO','FB + IG',420,47,2.1,'mint'],
        ['Lokálne cielenie · 15km','Google',280,68,4.2,'mint'],
        ['Remarketing','Facebook',147,27,1.8,'amber'],
      ].map((c,i)=><div key={i} style={{padding:'12px 14px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, marginBottom:8}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <div style={{fontSize:13, fontWeight:600, flex:1}}>{c[0]}</div>
          <Chip tone={c[5]} size="sm" dot>{c[5]==='mint'?'live':'pauza'}</Chip>
        </div>
        <div style={{fontSize:11, color:'var(--ink-sub)', marginTop:3}}>{c[1]}</div>
        <div style={{display:'flex', gap:14, marginTop:10, fontFamily:'var(--font-mono)'}}>
          <span style={{fontSize:11}}><span style={{color:'var(--ink-mute)'}}>spend </span><span style={{fontWeight:600}}>{c[2]}€</span></span>
          <span style={{fontSize:11}}><span style={{color:'var(--ink-mute)'}}>konv </span><span style={{fontWeight:600}}>{c[3]}</span></span>
          <span style={{fontSize:11, color: c[4]>=2?'var(--ok)':'var(--warn)'}}><span style={{color:'var(--ink-mute)'}}>roi </span><span style={{fontWeight:700}}>{c[4]}×</span></span>
        </div>
      </div>)}

      <div style={{fontSize:12, color:'var(--ink-mute)', textTransform:'uppercase', letterSpacing:.8, fontWeight:600, marginTop:14, marginBottom:8}}>Posledná aktivita</div>
      {[
        ['12m','Martin Jabĺčko schválil 4 kreatívy'],
        ['2h','Spustená kampaň "Letná ponuka"'],
        ['1d','Odoslaná faktúra 2026/04/015'],
      ].map((e,i)=><div key={i} style={{display:'flex', gap:10, padding:'10px 0', borderBottom:'1px dashed var(--border)'}}>
        <span className="mono" style={{fontSize:10, color:'var(--ink-mute)', width:30, paddingTop:2}}>{e[0]}</span>
        <span style={{fontSize:12, flex:1}}>{e[1]}</span>
      </div>)}
    </div>
    <MTabBar tabs={ADMIN_TABS} active="Klienti"/>
  </MScreen>
);

// ───────── Portal Mobile: Dashboard
const MPortalDashboard = () => (
  <MScreen>
    <MStatus/>
    <div style={{padding:'4px 20px 0', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
      <I.Logo size={30}/>
      <div style={{display:'flex', gap:8}}>
        <div style={{width:38, height:38, borderRadius:11, background:'var(--surface)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', position:'relative'}}><I.Bell size={16}/><span style={{position:'absolute', top:8, right:10, width:7, height:7, borderRadius:99, background:'var(--brand-500)', border:'2px solid var(--surface)'}}/></div>
        <Avatar name="Jana Kováčová" size={38}/>
      </div>
    </div>
    <div style={{padding:'18px 20px 8px'}}>
      <div style={{fontSize:12, color:'var(--ink-sub)'}}>Dobré ráno, Jana</div>
      <div style={{fontSize:26, fontWeight:700, letterSpacing:-.7, marginTop:2}}>Pekáreň Jablko</div>
    </div>

    <div style={{flex:1, overflowY:'auto', padding:'6px 16px 16px'}}>
      <div style={{background:'linear-gradient(135deg, var(--brand-500), var(--brand-700))', color:'#fff', borderRadius:18, padding:22, position:'relative', overflow:'hidden'}}>
        <div style={{position:'absolute', right:-40, top:-60, width:200, height:200, background:'radial-gradient(circle, rgba(255,255,255,.22), transparent 70%)'}}/>
        <div style={{fontSize:10, textTransform:'uppercase', letterSpacing:1, opacity:.85, fontWeight:600}}>Konverzie · apríl</div>
        <div style={{fontSize:40, fontWeight:700, letterSpacing:-1, marginTop:4}}>142</div>
        <div style={{display:'flex', gap:6, alignItems:'center', fontSize:12, marginTop:2}}>
          <span style={{background:'rgba(255,255,255,.2)', padding:'2px 7px', borderRadius:99, fontWeight:600}}>+28% vs. marec</span>
        </div>
        <div style={{marginTop:14}}>
          <Line data={[2,4,3,5,6,4,7,9,8,10,12,14,15,13,18]} color="#fff" w={300} h={50} fill/>
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:12}}>
        {[['Hodnota','12 480 €','+42%','ok'],['Spend','847 €','z 1000 €','n'],['CTR','4.6%','+0.3pp','ok'],['ROAS','14.7×','','ok']].map((s,i)=>
          <div key={i} style={{background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:14}}>
            <div style={{fontSize:10, color:'var(--ink-mute)', textTransform:'uppercase', letterSpacing:.8, fontWeight:600}}>{s[0]}</div>
            <div className="mono" style={{fontSize:19, fontWeight:700, marginTop:2}}>{s[1]}</div>
            {s[2] && <div className="mono" style={{fontSize:11, color: s[3]==='ok'?'var(--ok)':'var(--ink-sub)'}}>{s[2]}</div>}
          </div>)}
      </div>

      <div style={{marginTop:18, padding:14, background:'var(--brand-50)', border:'1px solid var(--brand-200, #FFE6D3)', borderRadius:14, display:'flex', gap:12, alignItems:'center'}}>
        <div style={{width:40, height:40, borderRadius:11, background:'var(--brand-500)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center'}}><I.Check size={18}/></div>
        <div style={{flex:1}}>
          <div style={{fontSize:14, fontWeight:700, color:'var(--brand-700)'}}>4 kreatívy čakajú</div>
          <div style={{fontSize:11, color:'var(--ink-sub)'}}>Letná kampaň · schváľte do 20. 4.</div>
        </div>
        <I.Chevron size={14} color="var(--brand-700)"/>
      </div>

      <div style={{marginTop:18, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 4px 8px'}}>
        <div style={{fontSize:14, fontWeight:700, letterSpacing:-.2}}>Váš tím</div>
      </div>
      <div style={{padding:14, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, display:'flex', gap:12, alignItems:'center'}}>
        <Avatar name="Štefan Varga" size={44}/>
        <div style={{flex:1}}>
          <div style={{fontSize:13, fontWeight:600}}>Štefan Varga</div>
          <div style={{fontSize:11, color:'var(--ok)', display:'flex', gap:4, alignItems:'center'}}><span style={{width:6, height:6, borderRadius:99, background:'var(--ok)'}}/>online · odpovedá do 2h</div>
        </div>
        <div style={{width:40, height:40, borderRadius:11, background:'var(--brand-500)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center'}}><I.Mail size={16}/></div>
      </div>
    </div>
    <MTabBar tabs={PORTAL_TABS} active="Prehľad"/>
  </MScreen>
);

// ───────── Portal Mobile: Approvals
const MPortalApprovals = () => (
  <MScreen>
    <MStatus/>
    <MHeader title="Schvaľovanie" sub="4 čakajú"/>
    <div style={{flex:1, overflowY:'auto', padding:'0 20px 16px'}}>
      <div style={{padding:14, background:'var(--brand-50)', border:'1px dashed var(--brand-500)', borderRadius:14, marginBottom:16, fontSize:12, color:'var(--ink-sub)', lineHeight:1.5}}>
        <strong style={{color:'var(--brand-700)'}}>Letná kampaň · chlieb BIO</strong> — posledný termín <strong>20. 4.</strong>, aby kampaň začala v pondelok.
      </div>

      {['v1','v2','v3','v4'].map((v,i)=><div key={i} style={{background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, overflow:'hidden', marginBottom:14}}>
        <div style={{aspectRatio:'1.6', background:`linear-gradient(135deg, ${['#FFE6D3','#FADCE0','#D6EFDE','#E4DEF7'][i]}, ${['#FFA870','#F0B5BF','#A3D6B5','#C6BDF0'][i]})`, display:'flex', alignItems:'flex-end', padding:14, color:'rgba(0,0,0,.55)'}}>
          <div style={{display:'flex', justifyContent:'space-between', width:'100%', alignItems:'flex-end'}}>
            <span className="mono" style={{fontSize:11, background:'rgba(255,255,255,.85)', padding:'3px 7px', borderRadius:6, fontWeight:600}}>1080 × 1080</span>
            <span style={{fontSize:11, fontWeight:600, fontFamily:'var(--font-mono)'}}>kreativ · {v}</span>
          </div>
        </div>
        <div style={{padding:14, display:'flex', gap:8}}>
          <button style={{flex:1, padding:'12px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:11, fontSize:13, fontWeight:600, display:'flex', gap:6, alignItems:'center', justifyContent:'center'}}><I.Edit size={13}/>Komentár</button>
          <button style={{flex:1, padding:'12px', background:'var(--brand-500)', color:'#fff', border:'none', borderRadius:11, fontSize:13, fontWeight:600, display:'flex', gap:6, alignItems:'center', justifyContent:'center'}}><I.Check size={13}/>Schváliť</button>
        </div>
      </div>)}

      <div style={{padding:14, marginTop:4, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, display:'flex', gap:10, alignItems:'center'}}>
        <div style={{flex:1, fontSize:13}}>
          <div style={{fontWeight:700}}>Schváliť všetky naraz</div>
          <div style={{fontSize:11, color:'var(--ink-sub)'}}>bez komentára · pustíme v pondelok</div>
        </div>
        <button style={{padding:'12px 16px', background:'var(--n-900)', color:'#fff', border:'none', borderRadius:11, fontSize:13, fontWeight:600}}>Schváliť 4</button>
      </div>
    </div>
    <MTabBar tabs={PORTAL_TABS} active="Akcie"/>
  </MScreen>
);

// ───────── Portal Mobile: Reports
const MPortalReports = () => (
  <MScreen>
    <MStatus/>
    <MHeader title="Reporty" sub="Apríl 2026" right={<div style={{width:38, height:38, borderRadius:11, background:'var(--surface)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center'}}><I.Download size={15}/></div>}/>
    <div style={{flex:1, overflowY:'auto', padding:'0 20px 16px'}}>
      <div style={{display:'flex', gap:6, marginBottom:14, overflowX:'auto'}}>
        {['Apríl','Marec','Február','Q1 2026','YTD'].map((t,i)=><Chip key={i} tone={i===0?'ink':'n'} size="sm">{t}</Chip>)}
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
        {[['Spend','847 €','+4%','var(--ink)'],['Konverzie','142','+28%','var(--ok)'],['Hodnota','12 480 €','+42%','var(--ok)'],['ROAS','14.7×','','var(--ok)']].map((s,i)=>
          <div key={i} style={{background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:14}}>
            <div style={{fontSize:10, color:'var(--ink-mute)', textTransform:'uppercase', letterSpacing:.8, fontWeight:600}}>{s[0]}</div>
            <div className="mono" style={{fontSize:20, fontWeight:700, marginTop:3, color:s[3]}}>{s[1]}</div>
            {s[2] && <div className="mono" style={{fontSize:11, color:s[3]}}>{s[2]}</div>}
          </div>)}
      </div>

      <div style={{marginTop:16, padding:18, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14}}>
          <div style={{fontSize:13, fontWeight:700}}>Výkon po týždňoch</div>
          <Chip tone="ok" size="sm">+28%</Chip>
        </div>
        <div style={{display:'flex', gap:8, alignItems:'flex-end', height:140}}>
          {[['T1',28],['T2',34],['T3',42],['T4',38]].map((w,i)=><div key={i} style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:6}}>
            <div className="mono" style={{fontSize:11, fontWeight:600}}>{w[1]}</div>
            <div style={{width:'70%', height:`${w[1]/50*100}%`, background:`linear-gradient(180deg, var(--brand-500), var(--brand-700))`, borderRadius:'6px 6px 0 0'}}/>
            <div className="mono" style={{fontSize:10, color:'var(--ink-mute)'}}>{w[0]}</div>
          </div>)}
        </div>
      </div>

      <div style={{marginTop:16, fontSize:12, color:'var(--ink-mute)', textTransform:'uppercase', letterSpacing:.8, fontWeight:600, marginBottom:10}}>Podľa platformy</div>
      {[['Fb','Facebook + IG',420,47,2.1,'#1877F2'],['Google','Google Ads',280,68,4.2,'#EA4335']].map((p,i)=>{const Ic=I[p[0]]; return <div key={i} style={{padding:'14px 14px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, marginBottom:8, display:'flex', gap:12, alignItems:'center'}}>
        <div style={{width:40, height:40, borderRadius:10, background:'var(--n-50)', display:'flex', alignItems:'center', justifyContent:'center', color:p[5]}}><Ic size={18}/></div>
        <div style={{flex:1}}>
          <div style={{fontSize:13, fontWeight:600}}>{p[1]}</div>
          <div className="mono" style={{fontSize:11, color:'var(--ink-sub)'}}>spend {p[2]}€ · {p[3]} konv.</div>
        </div>
        <Chip tone={p[4]>=3?'ok':'warn'} size="sm">{p[4]}×</Chip>
      </div>})}
    </div>
    <MTabBar tabs={PORTAL_TABS} active="Prehľad"/>
  </MScreen>
);

// ───────── Portal Mobile: Messages / chat
const MPortalMessages = () => (
  <MScreen>
    <MStatus/>
    <div style={{padding:'6px 20px 12px', display:'flex', alignItems:'center', gap:12, borderBottom:'1px solid var(--border)', background:'var(--surface)'}}>
      <div style={{width:34, height:34, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center'}}><I.Chevron size={14} style={{transform:'rotate(180deg)'}}/></div>
      <Avatar name="Štefan Varga" size={38}/>
      <div style={{flex:1}}>
        <div style={{fontSize:14, fontWeight:700}}>Štefan Varga</div>
        <div style={{fontSize:10, color:'var(--ok)', display:'flex', gap:4, alignItems:'center'}}><span style={{width:6, height:6, borderRadius:99, background:'var(--ok)'}}/>online</div>
      </div>
      <div style={{width:36, height:36, borderRadius:10, background:'var(--n-50)', display:'flex', alignItems:'center', justifyContent:'center'}}><I.Phone size={15}/></div>
    </div>

    <div style={{flex:1, overflowY:'auto', padding:'18px 16px', display:'flex', flexDirection:'column', gap:12, background:'var(--bg)'}}>
      <div style={{textAlign:'center', fontSize:11, color:'var(--ink-mute)', margin:'8px 0'}}>Dnes · 9:14</div>
      {[
        {me:false, text:'Dobrý deň Jana, posielam vám preview kreatívov pre letnú kampaň.'},
        {me:true, text:'Super, ďakujem! Verzia 3 má trochu malé logo, môžeme upraviť?'},
        {me:false, text:'Jasné, Lucia to dnes upraví a pošle vám novú verziu do večera.'},
        {me:false, text:'Môžeme sa stretnúť v piatok 14:00 na monthly review? Budem mať pre vás aj plán na máj.'},
        {me:true, text:'Perfekt, piatok 14:00 mi sedí. Tešim sa.'},
      ].map((m,i)=><div key={i} style={{display:'flex', maxWidth:'82%', alignSelf:m.me?'flex-end':'flex-start'}}>
        <div style={{background:m.me?'var(--brand-500)':'var(--surface)', color:m.me?'#fff':'var(--ink)', padding:'10px 14px', borderRadius: m.me?'16px 16px 4px 16px':'16px 16px 16px 4px', fontSize:14, lineHeight:1.45, border:m.me?'none':'1px solid var(--border)'}}>{m.text}</div>
      </div>)}
    </div>

    <div style={{padding:'10px 14px 14px', background:'var(--surface)', borderTop:'1px solid var(--border)', display:'flex', gap:8, alignItems:'center'}}>
      <div style={{width:38, height:38, borderRadius:11, background:'var(--n-50)', display:'flex', alignItems:'center', justifyContent:'center'}}><I.Plus size={16}/></div>
      <div style={{flex:1, padding:'10px 14px', background:'var(--n-50)', borderRadius:20, fontSize:13, color:'var(--ink-mute)'}}>Správa pre Štefana…</div>
      <div style={{width:38, height:38, borderRadius:11, background:'var(--brand-500)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center'}}><I.Send size={15}/></div>
    </div>
  </MScreen>
);

// ───────── Portal Mobile: Invoices
const MPortalInvoices = () => (
  <MScreen>
    <MStatus/>
    <MHeader title="Faktúry" sub="2026"/>
    <div style={{flex:1, overflowY:'auto', padding:'0 20px 16px'}}>
      <div style={{padding:18, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, marginBottom:14}}>
        <div style={{fontSize:11, color:'var(--ink-mute)', textTransform:'uppercase', letterSpacing:.8, fontWeight:600}}>Ďalšia splatnosť</div>
        <div className="mono" style={{fontSize:32, fontWeight:700, letterSpacing:-.8, marginTop:4}}>249 €</div>
        <div style={{fontSize:12, color:'var(--ink-sub)'}}>Pro balík · 15. 5. 2026 · SEPA •••4521</div>
      </div>

      <div style={{fontSize:12, color:'var(--ink-mute)', textTransform:'uppercase', letterSpacing:.8, fontWeight:600, marginBottom:8}}>História</div>
      {[
        ['2026/04/015','Apríl 2026',249,'Zaplatené','mint'],
        ['2026/03/012','Marec 2026',249,'Zaplatené','mint'],
        ['2026/02/009','Február 2026',249,'Zaplatené','mint'],
        ['2026/01/004','Január + setup',498,'Zaplatené','mint'],
      ].map((r,i)=><div key={i} style={{padding:'14px 16px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, marginBottom:8, display:'flex', alignItems:'center', gap:12}}>
        <div style={{width:40, height:40, borderRadius:10, background:'var(--acc-mint)', color:'var(--acc-mint-ink)', display:'flex', alignItems:'center', justifyContent:'center'}}><I.Invoice size={18}/></div>
        <div style={{flex:1}}>
          <div style={{fontSize:13, fontWeight:600}}>{r[1]}</div>
          <div className="mono" style={{fontSize:11, color:'var(--ink-sub)'}}>{r[0]}</div>
        </div>
        <div style={{textAlign:'right'}}>
          <div className="mono" style={{fontSize:14, fontWeight:700}}>{r[2]}€</div>
          <Chip tone={r[4]} size="sm" dot>{r[3]}</Chip>
        </div>
      </div>)}
    </div>
    <MTabBar tabs={PORTAL_TABS} active="Prehľad"/>
  </MScreen>
);

// ───────── Admin Mobile: Quick-add sheet
const MAdminQuickAdd = () => (
  <MScreen>
    <MStatus/>
    {/* faded background screen */}
    <div style={{flex:1, background:'var(--n-50)', opacity:.6}}/>
    {/* sheet */}
    <div style={{background:'var(--surface)', borderRadius:'22px 22px 0 0', padding:20, boxShadow:'0 -20px 60px rgba(0,0,0,.15)'}}>
      <div style={{width:36, height:4, background:'var(--n-150)', borderRadius:99, margin:'0 auto 16px'}}/>
      <div style={{fontSize:18, fontWeight:700, letterSpacing:-.4, marginBottom:16}}>Rýchly výber</div>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
        {[
          ['Leads','Nový lead','Z webu alebo manuálne','brand'],
          ['Clients','Nový klient','Onboarding spustí flow','sky'],
          ['Campaign','Kampaň','FB · Google · IG','lav'],
          ['Invoice','Faktúra','Manuálna alebo recurring','amber'],
          ['Tasks','Úloha','Priradiť tímu','mint'],
          ['Calendar','Udalosť','Meeting · deadline','rose'],
        ].map((a,i)=>{const Ic=I[a[0]]; return <div key={i} style={{padding:14, background:'var(--n-50)', border:'1px solid var(--border)', borderRadius:14}}>
          <div style={{width:36, height:36, borderRadius:10, background:`var(--acc-${a[3]==='brand'?'amber':a[3]==='sky'?'sky':a[3]==='lav'?'lavender':a[3]==='amber'?'amber':a[3]==='mint'?'mint':'rose'})`, color:`var(--acc-${a[3]==='brand'?'amber-ink':a[3]==='sky'?'sky-ink':a[3]==='lav'?'lavender-ink':a[3]==='amber'?'amber-ink':a[3]==='mint'?'mint-ink':'rose-ink'})`, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:10, ...(a[3]==='brand'?{background:'var(--brand-500)', color:'#fff'}:{})}}><Ic size={17}/></div>
          <div style={{fontSize:13, fontWeight:700}}>{a[1]}</div>
          <div style={{fontSize:10, color:'var(--ink-sub)', marginTop:2}}>{a[2]}</div>
        </div>})}
      </div>
      <button style={{width:'100%', padding:'14px', background:'var(--n-900)', color:'#fff', border:'none', borderRadius:12, fontSize:14, fontWeight:600, marginTop:16}}>Zrušiť</button>
    </div>
  </MScreen>
);

Object.assign(window, {
  MAdminDashboard, MAdminClients, MAdminInbox, MAdminClientDetail, MAdminQuickAdd,
  MPortalDashboard, MPortalApprovals, MPortalReports, MPortalMessages, MPortalInvoices,
  MW, MH
});
