// Chrome (sidebar + topbar) for admin app + portal
// Uses window.I icons and window.* ui primitives.

const SB_ITEMS_ADMIN = [
  { group: 'Hlavné', items: [
    { k:'Dashboard', icon:'Dashboard', active:true },
    { k:'Leady', icon:'Leads', badge: 12 },
    { k:'Klienti', icon:'Clients' },
    { k:'Projekty', icon:'Projects' },
    { k:'Kampane', icon:'Campaign' },
    { k:'Správy', icon:'Mail', badge: 3 },
    { k:'Úlohy', icon:'Tasks' },
    { k:'Tickety', icon:'Ticket' },
    { k:'Fakturácia', icon:'Invoice' },
  ]},
  { group: 'Nástroje', items: [
    { k:'Onboarding', icon:'Onboard' },
    { k:'Služby & Balíčky', icon:'Package' },
    { k:'Reporty', icon:'Report' },
    { k:'Kalendár', icon:'Calendar' },
    { k:'Šablóny', icon:'Template' },
    { k:'Dokumenty', icon:'Docs' },
    { k:'Keywords', icon:'Key' },
  ]},
];
const SB_ITEMS_PORTAL = [
  { group: 'Prehľad', items: [
    { k:'Dashboard', icon:'Dashboard', active:true },
    { k:'Reporty', icon:'Chart' },
    { k:'Kampane', icon:'Campaign' },
  ]},
  { group: 'Spolupráca', items: [
    { k:'Správy', icon:'Mail', badge: 2 },
    { k:'Schvaľovanie', icon:'Check', badge: 4 },
    { k:'Kalendár', icon:'Calendar' },
    { k:'Tickety', icon:'Ticket' },
  ]},
  { group: 'Administratíva', items: [
    { k:'Faktúry', icon:'Invoice' },
    { k:'Dokumenty', icon:'Docs' },
    { k:'Nastavenia', icon:'Settings' },
  ]},
];

// variant: 'full' | 'icon' | 'floating'
const Sidebar = ({ variant='full', mode='admin', active }) => {
  const groups = mode==='admin' ? SB_ITEMS_ADMIN : SB_ITEMS_PORTAL;
  const full = variant==='full';
  const floating = variant==='floating';
  const w = full ? 224 : 64;

  return <aside style={{
    width: w, flexShrink:0,
    background: floating ? 'transparent' : 'var(--surface)',
    borderRight: floating ? 'none' : '1px solid var(--border)',
    padding: floating ? 14 : 0,
    display:'flex', flexDirection:'column',
  }}>
    <div style={{
      background: floating ? 'var(--surface)' : 'transparent',
      border: floating ? '1px solid var(--border)' : 'none',
      borderRadius: floating ? 14 : 0,
      boxShadow: floating ? 'var(--sh-md)' : 'none',
      padding: floating ? 0 : 0, flex:1,
      display:'flex', flexDirection:'column'
    }}>
      {/* Logo */}
      <div style={{
        padding: full ? '16px 18px' : '16px 0',
        display:'flex', alignItems:'center', justifyContent: full?'flex-start':'center', gap:8,
        borderBottom:'1px solid var(--border)'
      }}>
        <I.Logo size={28}/>
        {full && <div style={{
          fontSize:18, fontWeight:700, letterSpacing:-.5, color:'var(--ink)'
        }}>Adlify{mode==='portal' && <span style={{fontSize:9.5, fontWeight:600, marginLeft:7, padding:'2px 6px', background:'var(--brand-50)', color:'var(--brand-700)', borderRadius:4, letterSpacing:.6, textTransform:'uppercase', verticalAlign:'2px'}}>Klient</span>}</div>}
      </div>

      <nav style={{flex:1, overflowY:'auto', padding:'10px 10px 14px'}}>
        {groups.map((g,gi)=>(
          <div key={gi} style={{marginTop: gi? 18 : 6}}>
            {full && <div style={{
              padding:'6px 10px', fontSize:10, textTransform:'uppercase', letterSpacing:1.2,
              color:'var(--ink-mute)', fontWeight:600
            }}>{g.group}</div>}
            {g.items.map((it,i)=>{
              const isActive = active ? active===it.k : it.active;
              return <div key={i} style={{
                display:'flex', alignItems:'center', gap:10,
                padding: full ? '8px 10px' : '10px',
                margin: full ? '2px 0' : '4px 0',
                borderRadius: 8, cursor:'pointer',
                justifyContent: full?'flex-start':'center',
                background: isActive ? 'var(--brand-50)' : 'transparent',
                color: isActive ? 'var(--brand-700)' : 'var(--ink-sub)',
                fontWeight: isActive ? 600 : 500, fontSize: 13,
                position:'relative'
              }}>
                {React.createElement(I[it.icon], { size: 17 })}
                {full && <span style={{flex:1}}>{it.k}</span>}
                {full && it.badge && <span style={{
                  background: isActive?'var(--brand-500)':'var(--n-150)',
                  color: isActive?'#fff':'var(--ink-sub)',
                  fontSize:10, fontWeight:600,
                  padding:'1px 6px', borderRadius:99
                }}>{it.badge}</span>}
                {!full && it.badge && <span style={{
                  position:'absolute', top:4, right:8, width:6, height:6, borderRadius:99, background:'var(--brand-500)'
                }}/>}
              </div>;
            })}
          </div>
        ))}
      </nav>

      <div style={{
        padding: full ? '12px 14px' : '12px 8px',
        borderTop:'1px solid var(--border)',
        display:'flex', alignItems:'center', gap:10, justifyContent: full?'flex-start':'center'
      }}>
        <Avatar name={mode==='admin' ? "Štefan Varga" : "Jana Kováčová"} size={28}/>
        {full && <div style={{flex:1, minWidth:0}}>
          <div style={{fontSize:12, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
            {mode==='admin' ? "Štefan Varga" : "Jana Kováčová"}
          </div>
          <div style={{fontSize:10, color:'var(--ink-mute)'}}>{mode==='admin' ? "Vlastník" : "Pekáreň Jablko"}</div>
        </div>}
        {full && <I.Settings size={16} color="var(--ink-mute)"/>}
      </div>
    </div>
  </aside>;
};

const Topbar = ({ title, breadcrumbs, right, sub }) => (
  <header style={{
    height: 60, padding:'0 24px', borderBottom:'1px solid var(--border)',
    display:'flex', alignItems:'center', gap:16, background:'var(--surface)',
    flexShrink:0
  }}>
    <div style={{flex:1, minWidth:0}}>
      {breadcrumbs && <div style={{fontSize:11, color:'var(--ink-mute)', marginBottom:2, display:'flex', alignItems:'center', gap:4}}>
        {breadcrumbs.map((b,i)=><React.Fragment key={i}>
          <span>{b}</span>
          {i<breadcrumbs.length-1 && <I.Chevron size={10}/>}
        </React.Fragment>)}
      </div>}
      <div style={{fontSize:16, fontWeight:600, letterSpacing:-.2, display:'flex', alignItems:'center', gap:10}}>
        {title}
        {sub && <span style={{fontSize:12, fontWeight:400, color:'var(--ink-sub)'}}>{sub}</span>}
      </div>
    </div>
    <div style={{
      display:'flex', alignItems:'center', gap:8,
      background:'var(--n-50)', border:'1px solid var(--border)', borderRadius:10,
      padding:'6px 12px', width: 320
    }}>
      <I.Search size={15} color="var(--ink-mute)"/>
      <div style={{flex:1, color:'var(--ink-mute)', fontSize:13}}>Hľadať leady, klientov, projekty…</div>
      <span className="mono" style={{
        fontSize:10, color:'var(--ink-mute)', background:'var(--surface)',
        padding:'1px 6px', border:'1px solid var(--border)', borderRadius:4
      }}>⌘K</span>
    </div>
    <div style={{display:'flex', alignItems:'center', gap:6}}>
      {right}
      <button style={{
        width:34, height:34, borderRadius:9, border:'1px solid var(--border)', background:'var(--surface)',
        display:'inline-flex', alignItems:'center', justifyContent:'center', position:'relative'
      }}>
        <I.Bell size={16} color="var(--ink-sub)"/>
        <span style={{position:'absolute', top:7, right:8, width:6, height:6, borderRadius:99, background:'var(--brand-500)'}}/>
      </button>
    </div>
  </header>
);

// App frame: sidebar + topbar + content
const AppFrame = ({ children, sidebarVariant='full', mode='admin', title, breadcrumbs, sub, topRight, active, pad=20 }) => (
  <div className="adl" style={{
    width:'100%', height:'100%', display:'flex',
    background: sidebarVariant==='floating' ? 'var(--bg-sub)' : 'var(--bg)'
  }}>
    <Sidebar variant={sidebarVariant} mode={mode} active={active}/>
    <div style={{flex:1, display:'flex', flexDirection:'column', minWidth:0}}>
      <Topbar title={title} breadcrumbs={breadcrumbs} sub={sub} right={topRight}/>
      <main style={{flex:1, overflow:'auto', padding: pad}}>{children}</main>
    </div>
  </div>
);

Object.assign(window, { Sidebar, Topbar, AppFrame });
