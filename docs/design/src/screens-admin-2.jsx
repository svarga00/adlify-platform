// Admin screens — part 2: Projects, Campaigns, Inbox, Tasks, Tickets, Invoicing

const ScreenProjects = () => {
  const cols = [
    { k:'Backlog', color:'var(--n-400)', cards:[
      { t:'Redizajn landing page', c:'Kozmetika Luna', p:'lav', due:'do 25. 4.' },
      { t:'Nastavenie pixel trackingu', c:'Autoservis Kováčik', p:'sky', due:'do 20. 4.' },
    ]},
    { k:'Prebieha', color:'var(--brand-500)', cards:[
      { t:'Letná kampaň · pečivo', c:'Pekáreň Jablko', p:'mint', due:'do 30. 4.', progress:60 },
      { t:'Google Ads setup', c:'MUDr. Novák', p:'amber', due:'do 22. 4.', progress:35 },
      { t:'A/B test kreatív', c:'Fitness Dynamic', p:'rose', due:'do 24. 4.', progress:80 },
    ]},
    { k:'Review', color:'var(--acc-lavender-ink)', cards:[
      { t:'Mesačný report marec', c:'Kvety Orchidea', p:'sky', due:'do 19. 4.' },
      { t:'Kreatívy na schválenie', c:'Kaviareň Latté', p:'amber', due:'do 18. 4.' },
    ]},
    { k:'Hotovo', color:'var(--ok)', cards:[
      { t:'Onboarding · setup', c:'Bistro Verde', p:'mint', due:'15. 4.' },
      { t:'Q1 report', c:'Kozmetika Luna', p:'lav', due:'10. 4.' },
      { t:'Pixel audit', c:'Pekáreň Jablko', p:'mint', due:'8. 4.' },
    ]},
  ];
  return <AppFrame mode="admin" active="Projekty" title="Projekty" sub="Kanban · apríl 2026"
    topRight={<><Btn variant="outline" size="sm">Zoznam</Btn><Btn variant="outline" size="sm" style={{background:'var(--n-900)', color:'#fff'}}>Kanban</Btn><Btn variant="primary" size="sm" icon={<I.Plus size={14}/>}>Nový projekt</Btn></>}>
    <div style={{display:'flex', gap:12, height:'calc(100% - 8px)'}}>
      {cols.map((col,i)=><div key={i} style={{flex:1, minWidth:260, display:'flex', flexDirection:'column'}}>
        <div style={{display:'flex', alignItems:'center', gap:8, padding:'0 6px 10px'}}>
          <span style={{width:8, height:8, borderRadius:99, background:col.color}}/>
          <span style={{fontSize:12, fontWeight:600, textTransform:'uppercase', letterSpacing:.8}}>{col.k}</span>
          <span style={{fontSize:11, color:'var(--ink-mute)', background:'var(--n-75)', padding:'1px 7px', borderRadius:99}}>{col.cards.length}</span>
          <div style={{flex:1}}/>
          <I.Plus size={14} color="var(--ink-mute)"/>
        </div>
        <div style={{flex:1, background:'var(--n-75)', borderRadius:12, padding:8, display:'flex', flexDirection:'column', gap:8, minHeight:0, overflowY:'auto'}}>
          {col.cards.map((c,j)=><div key={j} style={{background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:12, boxShadow:'var(--sh-xs)'}}>
            <div style={{display:'flex', gap:6, marginBottom:8}}><Chip tone={c.p} size="sm">{c.c}</Chip></div>
            <div style={{fontSize:13, fontWeight:500, letterSpacing:-.1, lineHeight:1.3, marginBottom:10}}>{c.t}</div>
            {c.progress!=null && <div style={{height:4, background:'var(--n-75)', borderRadius:99, overflow:'hidden', marginBottom:10}}>
              <div style={{width:`${c.progress}%`, height:'100%', background:'var(--brand-500)'}}/>
            </div>}
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
              <span style={{fontSize:11, color:'var(--ink-mute)', display:'flex', gap:4, alignItems:'center'}}><I.Clock size={11}/>{c.due}</span>
              <div style={{display:'flex', marginLeft:6}}>
                <Avatar name={j%2?'Lucia M':'Štefan V'} size={20}/>
                {j%2===0 && <div style={{marginLeft:-6}}><Avatar name={'Peter K'} size={20}/></div>}
              </div>
            </div>
          </div>)}
        </div>
      </div>)}
    </div>
  </AppFrame>;
};

// ───────────────────────────── Campaigns
const ScreenCampaigns = () => {
  const rows = [
    ['Letná ponuka · chlieb BIO','Pekáreň Jablko','Facebook','Aktívna','mint',420,47,2.1,78],
    ['Lokálne cielenie · 15km','Pekáreň Jablko','Google','Aktívna','mint',280,68,4.2,92],
    ['Remarketing wellness','Kozmetika Luna','Facebook','Aktívna','mint',610,124,3.8,88],
    ['Search · stomatológ BA','MUDr. Novák','Google','Aktívna','mint',190,42,5.1,95],
    ['A/B test kreatív · novinka','Fitness Dynamic','Instagram','Test','lav',340,28,1.9,62],
    ['Valentín 2026','Kvety Orchidea','Facebook','Ukončená','n',220,89,2.8,85],
    ['Brand awareness','Autoservis Kováčik','Facebook','Pauza','amber',0,0,0,0],
  ];
  return <AppFrame mode="admin" active="Kampane" title="Kampane" sub="Naprieč všetkými klientmi"
    topRight={<>
      <Btn variant="outline" size="sm">Apríl 2026 <I.ChevronDown size={12}/></Btn>
      <Btn variant="primary" size="sm" icon={<I.Plus size={14}/>}>Nová kampaň</Btn>
    </>}>

    <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:16}}>
      <Stat label="Aktívne" value="12" hint="5 FB · 7 Google"/>
      <Stat label="Spend (apríl)" value="2 847 €" delta={18}/>
      <Stat label="Konverzie" value="624" delta={32}/>
      <Stat label="Priemerný ROI" value="3.2×" tone="ok"/>
    </div>

    <div style={{display:'flex', gap:8, marginBottom:14}}>
      <Btn variant="outline" size="sm">Všetky platformy <I.ChevronDown size={12}/></Btn>
      <Btn variant="outline" size="sm">Všetci klienti <I.ChevronDown size={12}/></Btn>
      <Btn variant="outline" size="sm">Status</Btn>
      <div style={{flex:1}}/>
      <div style={{display:'flex', background:'var(--n-75)', borderRadius:9, padding:2}}>
        {['Zoznam','Grid','Timeline'].map((v,i)=><button key={i} style={{padding:'4px 10px', fontSize:12, borderRadius:7, background:i===0?'var(--surface)':'transparent', fontWeight:i===0?600:500}}>{v}</button>)}
      </div>
    </div>

    <Card pad={0}>
      <div style={{display:'grid', gridTemplateColumns:'2fr 1.2fr 100px 110px 90px 90px 90px 120px', padding:'12px 20px', background:'var(--n-50)', borderBottom:'1px solid var(--border)', fontSize:11, fontWeight:600, color:'var(--ink-sub)', textTransform:'uppercase', letterSpacing:.8, gap:14}}>
        <span>Kampaň</span><span>Klient</span><span>Platforma</span><span>Status</span><span>Spend</span><span>Konv.</span><span>ROI</span><span>Health</span>
      </div>
      {rows.map((r,i)=><div key={i} style={{display:'grid', gridTemplateColumns:'2fr 1.2fr 100px 110px 90px 90px 90px 120px', padding:'14px 20px', borderTop:'1px solid var(--border)', alignItems:'center', gap:14}}>
        <div style={{fontSize:13, fontWeight:600, letterSpacing:-.1}}>{r[0]}</div>
        <div style={{fontSize:12, color:'var(--ink-sub)'}}>{r[1]}</div>
        <div style={{display:'flex', gap:4, alignItems:'center', fontSize:12}}>
          {r[2]==='Facebook' && <I.Fb size={13} color="#1877F2"/>}
          {r[2]==='Google' && <I.Google size={13}/>}
          {r[2]==='Instagram' && <I.Instagram size={13} color="#E1306C"/>}
          {r[2]}
        </div>
        <Chip tone={r[4]} size="sm" dot>{r[3]}</Chip>
        <span className="mono" style={{fontSize:12, fontWeight:600}}>{r[5]}€</span>
        <span className="mono" style={{fontSize:12}}>{r[6]}</span>
        <span className="mono" style={{fontSize:12, color: r[7]>=2?'var(--ok)':r[7]>0?'var(--warn)':'var(--ink-mute)', fontWeight:600}}>{r[7]?r[7]+'×':'—'}</span>
        <div style={{display:'flex', alignItems:'center', gap:6}}>
          <div style={{flex:1, height:5, background:'var(--n-75)', borderRadius:99, overflow:'hidden'}}>
            <div style={{width:`${r[8]}%`, height:'100%', background: r[8]>=80?'var(--ok)':r[8]>=60?'var(--brand-500)':'var(--warn)'}}/>
          </div>
          <span className="mono" style={{fontSize:11, width:20, textAlign:'right'}}>{r[8]||'—'}</span>
        </div>
      </div>)}
    </Card>
  </AppFrame>;
};

// ───────────────────────────── Inbox
const ScreenInbox = () => (
  <AppFrame mode="admin" active="Správy" title="Správy" sub="Inbox · 3 nové"
    topRight={<Btn variant="primary" size="sm" icon={<I.Plus size={14}/>}>Nová správa</Btn>} pad={0}>
    <div style={{display:'grid', gridTemplateColumns:'320px 1fr', height:'100%'}}>
      {/* thread list */}
      <div style={{borderRight:'1px solid var(--border)', overflowY:'auto', background:'var(--surface)'}}>
        <div style={{padding:14, borderBottom:'1px solid var(--border)', display:'flex', gap:6}}>
          {['Všetko','Klienti','Leady','Interné'].map((t,i)=><Chip key={i} tone={i===0?'ink':'n'} size="sm">{t}</Chip>)}
        </div>
        {[
          ['Martin Jabĺčko','Re: Schválenie kreatívov','Super, môžeme to púšťať. Ďakujem…','pred 12 min', 'Pekáreň Jablko','mint',true,true],
          ['Lucia Molnárová','Otázka k reportu','Ahoj, neviem či som správne pocho…','pred 1h', 'Kozmetika Luna','lav',true,false],
          ['MUDr. Novák','Faktúra marec','Viete mi prosím poslať faktúru za…','2h', 'MUDr. Novák','sky',true,false],
          ['Peter Kováčik','','Dobrý deň, videl som vašu ponuku…','dnes 9:14', 'Nový lead','amber',false,false],
          ['Eva Dvořáková','Meeting piatok?','Môžeme si presunúť stretnutie na…','včera', 'Fitness Dynamic','rose',false,false],
          ['Tomáš Varga (interné)','Update o Bistre Verde','Pozri, chcú escalate na Premium…','včera', 'Interné','n',false,false],
          ['Jana Horváthová','Zmluva podpísaná','Dobrý deň, v prílohe posielam…','21. 3.', 'Bistro Verde','mint',false,false],
        ].map((t,i)=><div key={i} style={{
          display:'flex', gap:10, padding:'12px 16px', borderBottom:'1px solid var(--border)',
          background: i===0?'var(--brand-50)':'transparent', cursor:'pointer',
          borderLeft: i===0?'3px solid var(--brand-500)':'3px solid transparent'
        }}>
          <Avatar name={t[0]} size={36}/>
          <div style={{flex:1, minWidth:0}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:8}}>
              <span style={{fontSize:13, fontWeight: t[6]?700:500, letterSpacing:-.1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{t[0]}</span>
              <span style={{fontSize:11, color:'var(--ink-mute)', whiteSpace:'nowrap'}}>{t[3]}</span>
            </div>
            <div style={{fontSize:12, fontWeight: t[6]?600:500, color:'var(--ink)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginTop:1}}>{t[1] || <em style={{color:'var(--ink-mute)'}}>—</em>}</div>
            <div style={{fontSize:11, color:'var(--ink-sub)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginTop:2}}>{t[2]}</div>
            <div style={{display:'flex', gap:4, marginTop:6, alignItems:'center'}}>
              <Chip tone={t[5]} size="sm">{t[4]}</Chip>
              {t[7] && <Chip tone="brand" size="sm">akcia</Chip>}
            </div>
          </div>
        </div>)}
      </div>
      {/* thread view */}
      <div style={{display:'flex', flexDirection:'column', background:'var(--bg)'}}>
        <div style={{padding:'16px 24px', background:'var(--surface)', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <div>
            <div style={{fontSize:16, fontWeight:600, letterSpacing:-.2}}>Re: Schválenie kreatívov · Letná kampaň</div>
            <div style={{fontSize:12, color:'var(--ink-sub)', marginTop:2, display:'flex', gap:8, alignItems:'center'}}>
              <span>Martin Jabĺčko</span>
              <I.Dot size={6}/>
              <span>Pekáreň Jablko</span>
              <I.Dot size={6}/>
              <Chip tone="brand" size="sm">Vyžaduje akciu</Chip>
            </div>
          </div>
          <div style={{display:'flex', gap:6}}>
            <Btn variant="outline" size="sm" icon={<I.Check size={14}/>}>Schváliť</Btn>
            <Btn variant="outline" size="sm"><I.More size={14}/></Btn>
          </div>
        </div>

        <div style={{flex:1, overflowY:'auto', padding:24, display:'flex', flexDirection:'column', gap:16}}>
          {[
            { who:'Štefan Varga', me:true, t:'pred 3h', text:'Dobrý deň Martin, posielam 4 verzie kreatívov pre letnú kampaň chlieb BIO. Prosím o schválenie, aby sme mohli spustiť v pondelok ráno.' , attach:2},
            { who:'Martin Jabĺčko', me:false, t:'pred 12 min', text:'Super, môžeme to púšťať. Ďakujem, vizuály sú výborné. Len prosím verziu 3 ešte upraviť, aby tam bolo logo viditeľnejšie v pravom rohu.'},
          ].map((m,i)=><div key={i} style={{display:'flex', gap:12, maxWidth:640, alignSelf: m.me?'flex-end':'flex-start', flexDirection:m.me?'row-reverse':'row'}}>
            <Avatar name={m.who} size={32}/>
            <div>
              <div style={{fontSize:11, color:'var(--ink-mute)', marginBottom:4, textAlign:m.me?'right':'left'}}>{m.who} · {m.t}</div>
              <div style={{
                background: m.me?'var(--brand-500)':'var(--surface)',
                color: m.me?'#fff':'var(--ink)',
                border: m.me?'none':'1px solid var(--border)',
                padding:'12px 16px', borderRadius:14, fontSize:13, lineHeight:1.55
              }}>{m.text}</div>
              {m.attach && <div style={{display:'flex', gap:6, marginTop:8}}>
                {[...Array(m.attach)].map((_,j)=><div key={j} style={{display:'flex', alignItems:'center', gap:6, padding:'6px 10px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, fontSize:11}}>
                  <I.Attach size={12}/> kreativ-v{j+1}.png
                </div>)}
              </div>}
            </div>
          </div>)}
        </div>

        <div style={{padding:16, background:'var(--surface)', borderTop:'1px solid var(--border)'}}>
          <div style={{border:'1px solid var(--border)', borderRadius:12, overflow:'hidden'}}>
            <div style={{padding:'10px 14px', fontSize:13, color:'var(--ink-mute)', minHeight:60}}>Napíš odpoveď…</div>
            <div style={{display:'flex', gap:6, padding:10, borderTop:'1px solid var(--border)', background:'var(--n-50)'}}>
              <Btn variant="ghost" size="sm"><I.Attach size={14}/></Btn>
              <Btn variant="ghost" size="sm" icon={<I.Sparkle size={14}/>}>AI návrh</Btn>
              <Btn variant="ghost" size="sm" icon={<I.Template size={14}/>}>Šablóna</Btn>
              <div style={{flex:1}}/>
              <Btn variant="primary" size="sm" icon={<I.Send size={14}/>}>Odoslať</Btn>
            </div>
          </div>
        </div>
      </div>
    </div>
  </AppFrame>
);

// ───────────────────────────── Tasks
const ScreenTasks = () => (
  <AppFrame mode="admin" active="Úlohy" title="Úlohy" sub="Moje · 14 otvorených"
    topRight={<Btn variant="primary" size="sm" icon={<I.Plus size={14}/>}>Nová úloha</Btn>}>

    <div style={{display:'flex', gap:4, marginBottom:14, borderBottom:'1px solid var(--border)'}}>
      {[['Všetko',14],['Moje',8],['Tímové',6],['Po termíne',3],['Dnes',5]].map((t,i)=>
        <button key={i} style={{padding:'10px 14px', fontSize:13, fontWeight:500, color: i===1?'var(--ink)':'var(--ink-sub)', borderBottom:i===1?'2px solid var(--brand-500)':'2px solid transparent', marginBottom:-1, display:'flex', gap:6, alignItems:'center'}}>{t[0]}<span style={{fontSize:10, color:'var(--ink-mute)', background:'var(--n-75)', padding:'1px 6px', borderRadius:99}}>{t[1]}</span></button>
      )}
    </div>

    <div style={{display:'flex', flexDirection:'column', gap:8}}>
      {[
        ['Po termíne','err',[
          ['Schváliť kreatívy · Pekáreň Jablko','meškanie 1 deň','rose',['ŠV','LM'],2, true],
          ['Poslať report · Kvety Orchidea','meškanie 2 dni','amber',['PK'],1, false],
        ]],
        ['Dnes','brand',[
          ['Call s klientom · Fitness Dynamic','dnes 14:00','lav',['LM'],0, false],
          ['Google Ads audit · MUDr. Novák','dnes','sky',['ŠV'],3, false],
          ['Onboarding meeting · Bistro Verde','dnes 16:30','mint',['ŠV','PK'],0, false],
        ]],
        ['Tento týždeň','sky',[
          ['A/B test setup · Fitness Dynamic','str 22. 4.','rose',['LM'],1, false],
          ['Mesačný report · apríl','pi 30. 4.','n',['ŠV','LM','PK'],12, false],
          ['Zmluva · Bistro Verde (Premium upgrade)','št 24. 4.','amber',['ŠV'],0, false],
        ]],
      ].map((g,gi)=><div key={gi} style={{marginBottom:4}}>
        <div style={{display:'flex', alignItems:'center', gap:8, padding:'10px 4px'}}>
          <Chip tone={g[1]} size="sm" dot>{g[0]}</Chip>
          <span style={{fontSize:11, color:'var(--ink-mute)'}}>{g[2].length} úloh</span>
        </div>
        {g[2].map((t,i)=><div key={i} style={{display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, marginBottom:6}}>
          <div style={{width:18, height:18, borderRadius:5, border:'1.5px solid var(--border-strong)', flexShrink:0, cursor:'pointer'}}/>
          <div style={{flex:1, minWidth:0}}>
            <div style={{fontSize:13, fontWeight:600, letterSpacing:-.1}}>{t[0]}</div>
            <div style={{fontSize:11, color:'var(--ink-sub)', display:'flex', gap:8, alignItems:'center', marginTop:3}}>
              <span style={{display:'flex', gap:4, alignItems:'center'}}><I.Clock size={11}/>{t[1]}</span>
              {t[4]>0 && <span style={{display:'flex', gap:4, alignItems:'center'}}><I.Mail size={11}/>{t[4]} komentárov</span>}
              {t[5] && <Chip tone="brand" size="sm">Blokátor</Chip>}
            </div>
          </div>
          <Chip tone={t[2]} size="sm">{t[2]==='rose'?'Pekáreň':t[2]==='amber'?'Kvety':t[2]==='lav'?'Fitness':t[2]==='sky'?'Novák':t[2]==='mint'?'Bistro':'Intern'}</Chip>
          <div style={{display:'flex'}}>
            {t[3].map((a,j)=><div key={j} style={{marginLeft:j?-6:0}}><Avatar name={a} size={22}/></div>)}
          </div>
          <I.More size={16} color="var(--ink-mute)"/>
        </div>)}
      </div>)}
    </div>
  </AppFrame>
);

// ───────────────────────────── Tickets
const ScreenTickets = () => (
  <AppFrame mode="admin" active="Tickety" title="Tickety" sub="Podpora a požiadavky klientov"
    topRight={<Btn variant="primary" size="sm" icon={<I.Plus size={14}/>}>Nový ticket</Btn>}>

    <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:16}}>
      <Stat label="Otvorené" value="8" hint="2 urgentné" tone="err"/>
      <Stat label="In progress" value="5"/>
      <Stat label="Čakajú klienta" value="3" tone="warn"/>
      <Stat label="Priemerný čas rieš." value="4h 12m" tone="ok"/>
    </div>

    <Card pad={0}>
      <div style={{display:'grid', gridTemplateColumns:'60px 2fr 1fr 110px 120px 90px 120px 40px', padding:'12px 20px', background:'var(--n-50)', borderBottom:'1px solid var(--border)', fontSize:11, fontWeight:600, color:'var(--ink-sub)', textTransform:'uppercase', letterSpacing:.8, gap:12, alignItems:'center'}}>
        <span>#</span><span>Predmet</span><span>Klient</span><span>Priorita</span><span>Status</span><span>Vek</span><span>Priradený</span><span/>
      </div>
      {[
        [1247,'FB Pixel nefunguje na mobilných zariadeniach','Pekáreň Jablko','Urgent','err','In progress','brand','2h','ŠV'],
        [1246,'Prosím o zmenu rozpočtu Google Ads','MUDr. Novák','Normal','n','Open','sky','5h','LM'],
        [1245,'Potrebujeme nové kreatívy na 1. máj','Kvety Orchidea','Normal','n','Open','sky','8h','PK'],
        [1244,'Report za marec nie je správny','Fitness Dynamic','High','warn','Čaká klienta','amber','1d','LM'],
        [1243,'Pridajte IG do balíka','Kozmetika Luna','Low','sky','In progress','brand','1d','ŠV'],
        [1242,'Nefunguje export do PDF','Bistro Verde','Normal','n','Čaká interne','lav','2d','PK'],
        [1241,'Nové landing page pre letnú akciu','Pekáreň Jablko','High','warn','In progress','brand','2d','ŠV'],
        [1240,'Faktúra marec — otázka k DPH','Autoservis Kováčik','Low','sky','Vyriešené','mint','3d','LM'],
      ].map((r,i)=><div key={i} style={{display:'grid', gridTemplateColumns:'60px 2fr 1fr 110px 120px 90px 120px 40px', padding:'14px 20px', borderTop:'1px solid var(--border)', alignItems:'center', gap:12}}>
        <span className="mono" style={{fontSize:11, color:'var(--ink-mute)'}}>#{r[0]}</span>
        <div style={{fontSize:13, fontWeight:500, letterSpacing:-.1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{r[1]}</div>
        <div style={{fontSize:12, color:'var(--ink-sub)'}}>{r[2]}</div>
        <Chip tone={r[4]} size="sm" dot>{r[3]}</Chip>
        <Chip tone={r[6]} size="sm">{r[5]}</Chip>
        <span className="mono" style={{fontSize:11, color:'var(--ink-sub)'}}>{r[7]}</span>
        <div style={{display:'flex', alignItems:'center', gap:6}}><Avatar name={r[8]} size={22}/><span style={{fontSize:11}}>{r[8]}</span></div>
        <I.More size={14} color="var(--ink-mute)"/>
      </div>)}
    </Card>
  </AppFrame>
);

// ───────────────────────────── Invoicing
const ScreenInvoicing = () => (
  <AppFrame mode="admin" active="Fakturácia" title="Fakturácia" sub="Apríl 2026"
    topRight={<>
      <Btn variant="outline" size="sm" icon={<I.Download size={14}/>}>Export XML</Btn>
      <Btn variant="primary" size="sm" icon={<I.Plus size={14}/>}>Nová faktúra</Btn>
    </>}>

    <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:16}}>
      <Stat label="Vystavené (apríl)" value="5 416 €" hint="15 faktúr"/>
      <Stat label="Zaplatené" value="4 219 €" delta={0} tone="ok"/>
      <Stat label="Čakajú" value="1 048 €" tone="warn" hint="4 faktúry"/>
      <Stat label="Po splatnosti" value="149 €" tone="err" hint="1 faktúra"/>
    </div>

    <div style={{display:'grid', gridTemplateColumns:'2fr 1fr', gap:16}}>
      <Card pad={0}>
        <div style={{display:'grid', gridTemplateColumns:'110px 1.4fr 90px 110px 110px 90px 40px', padding:'12px 18px', background:'var(--n-50)', borderBottom:'1px solid var(--border)', fontSize:11, fontWeight:600, color:'var(--ink-sub)', textTransform:'uppercase', letterSpacing:.8, gap:12}}>
          <span>Číslo</span><span>Klient</span><span>Suma</span><span>Dátum</span><span>Splatnosť</span><span>Status</span><span/>
        </div>
        {[
          ['2026/04/015','Pekáreň Jablko',249,'1. 4.','15. 4.','Zaplatené','mint'],
          ['2026/04/014','Kozmetika Luna',399,'1. 4.','15. 4.','Zaplatené','mint'],
          ['2026/04/013','MUDr. Novák',149,'1. 4.','15. 4.','Zaplatené','mint'],
          ['2026/04/012','Fitness Dynamic',1250,'1. 4.','15. 4.','Zaplatené','mint'],
          ['2026/04/011','Kvety Orchidea',149,'1. 4.','15. 4.','Po splatnosti','err'],
          ['2026/04/010','Bistro Verde',249,'1. 4.','15. 4.','Čaká','amber'],
          ['2026/04/009','Kaviareň Latté',149,'1. 4.','15. 4.','Čaká','amber'],
          ['2026/04/008','Autoservis Kováčik',249,'1. 4.','15. 4.','Zaplatené','mint'],
        ].map((r,i)=><div key={i} style={{display:'grid', gridTemplateColumns:'110px 1.4fr 90px 110px 110px 90px 40px', padding:'14px 18px', borderTop:'1px solid var(--border)', alignItems:'center', gap:12}}>
          <span className="mono" style={{fontSize:11, color:'var(--ink-sub)'}}>{r[0]}</span>
          <span style={{fontSize:13, fontWeight:500}}>{r[1]}</span>
          <span className="mono" style={{fontSize:13, fontWeight:600}}>{r[2]}€</span>
          <span style={{fontSize:12, color:'var(--ink-sub)'}}>{r[3]}</span>
          <span style={{fontSize:12, color:'var(--ink-sub)'}}>{r[4]}</span>
          <Chip tone={r[6]} size="sm" dot>{r[5]}</Chip>
          <I.More size={14} color="var(--ink-mute)"/>
        </div>)}
      </Card>

      <div style={{display:'flex', flexDirection:'column', gap:16}}>
        <Card title="Príjem 2026 (YTD)">
          <div style={{fontSize:32, fontWeight:600, letterSpacing:-1}}>20 164 €</div>
          <div style={{display:'flex', gap:6, alignItems:'center', fontSize:12, color:'var(--ok)', fontFamily:'var(--font-mono)'}}>
            <I.ArrowUp size={12}/> +42% YoY
          </div>
          <div style={{marginTop:16}}>
            <Sparkbars data={[3100,3450,3600,4100,4200,5416]} labels={['n','d','j','f','m','a']} w={280} h={80}/>
          </div>
        </Card>
        <Card title="Automatizácie" pad={14}>
          <div style={{display:'flex', flexDirection:'column', gap:12}}>
            {[['Opakujúca sa fakturácia','15 klientov · 1. dňa mesiaca', true],['Upomienky po splatnosti','+3, +7, +14 dní', true],['Sync do Pohody','Každú hodinu', false]].map((r,i)=>
              <div key={i} style={{display:'flex', alignItems:'center', gap:10}}>
                <div style={{width:36, height:20, background: r[2]?'var(--brand-500)':'var(--n-150)', borderRadius:99, position:'relative', flexShrink:0}}>
                  <div style={{position:'absolute', top:2, left: r[2]?18:2, width:16, height:16, background:'#fff', borderRadius:99, transition:'left .2s'}}/>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13, fontWeight:500}}>{r[0]}</div>
                  <div style={{fontSize:11, color:'var(--ink-sub)'}}>{r[1]}</div>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  </AppFrame>
);

Object.assign(window, { ScreenProjects, ScreenCampaigns, ScreenInbox, ScreenTasks, ScreenTickets, ScreenInvoicing });
