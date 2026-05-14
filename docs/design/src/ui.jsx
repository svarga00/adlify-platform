// Shared UI primitives for Adlify mockups
// All text/chrome uses CSS tokens from styles/tokens.css

const Chip = ({ tone='n', children, dot=false, size='md' }) => {
  const tones = {
    n:   { bg:'var(--n-100)',       fg:'var(--n-700)',         br:'var(--border)' },
    ink: { bg:'var(--n-900)',       fg:'#fff',                 br:'var(--n-900)' },
    brand:{bg:'var(--brand-50)',    fg:'var(--brand-700)',     br:'var(--brand-100)' },
    sky: { bg:'var(--acc-sky)',     fg:'var(--acc-sky-ink)',   br:'transparent' },
    mint:{ bg:'var(--acc-mint)',    fg:'var(--acc-mint-ink)',  br:'transparent' },
    lav: { bg:'var(--acc-lavender)',fg:'var(--acc-lavender-ink)',br:'transparent' },
    rose:{ bg:'var(--acc-rose)',    fg:'var(--acc-rose-ink)',  br:'transparent' },
    amber:{bg:'var(--acc-amber)',   fg:'var(--acc-amber-ink)', br:'transparent' },
    ok:  { bg:'color-mix(in oklab, var(--ok) 14%, transparent)', fg:'var(--ok)', br:'transparent'},
    err: { bg:'color-mix(in oklab, var(--err) 14%, transparent)', fg:'var(--err)', br:'transparent'},
    warn:{ bg:'color-mix(in oklab, var(--warn) 16%, transparent)', fg:'var(--warn)', br:'transparent'},
  };
  const t = tones[tone] || tones.n;
  const pad = size==='sm' ? '2px 7px' : '3px 9px';
  const fs  = size==='sm' ? 11 : 12;
  return <span style={{
    display:'inline-flex', alignItems:'center', gap:5,
    padding:pad, background:t.bg, color:t.fg,
    border:`1px solid ${t.br}`,
    borderRadius: 999, fontSize:fs, fontWeight:500, letterSpacing:-.1, whiteSpace:'nowrap'
  }}>
    {dot && <span style={{width:6,height:6,borderRadius:99,background:t.fg,opacity:.85}}/>}
    {children}
  </span>;
};

const Btn = ({ variant='ghost', size='md', icon, children, ...rest }) => {
  const sz = size==='sm' ? { h:28, pad:'0 10px', fs:12, r:8 }
           : size==='lg' ? { h:40, pad:'0 16px', fs:14, r:10 }
           :               { h:32, pad:'0 12px', fs:13, r:9 };
  const styles = {
    primary: { bg:'var(--brand-500)', fg:'#fff', br:'var(--brand-500)', hov:'var(--brand-600)' },
    ink:     { bg:'var(--n-900)', fg:'#fff', br:'var(--n-900)' },
    outline: { bg:'var(--surface)', fg:'var(--ink)', br:'var(--border-strong)' },
    ghost:   { bg:'transparent', fg:'var(--ink-sub)', br:'transparent' },
    soft:    { bg:'var(--n-75)', fg:'var(--ink)', br:'transparent' },
  };
  const s = styles[variant];
  return <button {...rest} style={{
    height: sz.h, padding: sz.pad, fontSize: sz.fs, fontWeight:500,
    background: s.bg, color: s.fg, borderRadius: sz.r,
    border:`1px solid ${s.br}`, display:'inline-flex', alignItems:'center', gap:6,
    whiteSpace:'nowrap', letterSpacing:-.1,
    ...(rest.style||{})
  }}>{icon}{children}</button>;
};

const Card = ({ title, right, children, pad=20, style={} }) => (
  <div style={{
    background:'var(--surface)', border:'1px solid var(--border)',
    borderRadius:14, boxShadow:'var(--sh-sm)', ...style
  }}>
    {title && <div style={{
      display:'flex', alignItems:'center', justifyContent:'space-between',
      padding:'14px 18px', borderBottom:'1px solid var(--border)'
    }}>
      <div style={{fontSize:13, fontWeight:600, letterSpacing:-.1, color:'var(--ink)'}}>{title}</div>
      <div>{right}</div>
    </div>}
    <div style={{padding: pad}}>{children}</div>
  </div>
);

const Stat = ({ label, value, delta, tone='n', hint, accent }) => (
  <div style={{
    background: accent==='hero' ? 'linear-gradient(135deg,var(--brand-500),var(--brand-700))' : 'var(--surface)',
    color: accent==='hero' ? '#fff' : 'var(--ink)',
    border:'1px solid ' + (accent==='hero' ? 'var(--brand-500)' : 'var(--border)'),
    borderRadius:14, padding:'16px 18px', boxShadow:'var(--sh-sm)',
    position:'relative', overflow:'hidden'
  }}>
    <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
      <div style={{
        fontSize:11, textTransform:'uppercase', letterSpacing:.8, fontWeight:600,
        color: accent==='hero' ? 'rgba(255,255,255,.75)' : 'var(--ink-mute)',
      }}>{label}</div>
      {hint && <Chip tone={accent==='hero' ? 'ink' : tone} size="sm">{hint}</Chip>}
    </div>
    <div style={{fontSize:28, fontWeight:600, letterSpacing:-.8, marginTop:6, lineHeight:1.1}}>{value}</div>
    {delta!=null && <div style={{
      fontSize:12, marginTop:4,
      color: accent==='hero' ? 'rgba(255,255,255,.8)' :
             (delta > 0 ? 'var(--ok)' : delta < 0 ? 'var(--err)' : 'var(--ink-sub)'),
      fontFamily:'var(--font-mono)'
    }}>{delta>0?'+':''}{delta}%</div>}
  </div>
);

const Avatar = ({ name='', size=28, color }) => {
  const colors = ['#F97316','#4F46E5','#059669','#DC2626','#7C3AED','#0891B2','#CA8A04','#DB2777'];
  const initials = name.split(' ').map(s=>s[0]).slice(0,2).join('').toUpperCase() || '?';
  const c = color || colors[[...name].reduce((a,c)=>a+c.charCodeAt(0),0) % colors.length];
  return <div style={{
    width:size, height:size, borderRadius:99, background:c, color:'#fff',
    display:'inline-flex', alignItems:'center', justifyContent:'center',
    fontSize: size<24?9:11, fontWeight:600, letterSpacing:.3, flexShrink:0
  }}>{initials}</div>;
};

// Mini bar chart (svg, no deps)
const Sparkbars = ({ data, color='var(--brand-500)', w=180, h=40, labels }) => {
  const max = Math.max(...data);
  const bw = (w - (data.length-1)*4) / data.length;
  return <svg width={w} height={h+(labels?14:0)} viewBox={`0 0 ${w} ${h+(labels?14:0)}`}>
    {data.map((v,i)=>{
      const bh = (v/max) * (h-4);
      return <g key={i}>
        <rect x={i*(bw+4)} y={h-bh} width={bw} height={bh} rx={3} fill={color} opacity={0.85}/>
        {labels && <text x={i*(bw+4)+bw/2} y={h+11} textAnchor="middle" fontSize="9" fill="var(--ink-mute)" fontFamily="var(--font-mono)">{labels[i]}</text>}
      </g>;
    })}
  </svg>;
};

// Donut chart — clean
const Donut = ({ data, size=160, thick=22 }) => {
  // data: [{label, value, color}]
  const total = data.reduce((a,b)=>a+b.value,0);
  const r = (size-thick)/2;
  const cx = size/2, cy = size/2;
  let acc = 0;
  const segs = data.map(d=>{
    const start = acc/total * 360; acc += d.value;
    const end = acc/total * 360;
    const a1 = (start-90)*Math.PI/180, a2 = (end-90)*Math.PI/180;
    const x1=cx+r*Math.cos(a1), y1=cy+r*Math.sin(a1);
    const x2=cx+r*Math.cos(a2), y2=cy+r*Math.sin(a2);
    const large = end-start>180?1:0;
    return { path:`M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`, color:d.color };
  });
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
    <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--n-75)" strokeWidth={thick}/>
    {segs.map((s,i)=><path key={i} d={s.path} stroke={s.color} strokeWidth={thick} fill="none" strokeLinecap="butt"/>)}
  </svg>;
};

// Line chart (tiny)
const Line = ({ data, color='var(--brand-500)', w=220, h=60, fill=true }) => {
  const max = Math.max(...data), min = Math.min(...data);
  const rng = max-min || 1;
  const pts = data.map((v,i)=>[i*(w/(data.length-1)), h-((v-min)/rng)*(h-6)-3]);
  const d = 'M '+pts.map(p=>p.join(' ')).join(' L ');
  const fillD = d+` L ${w} ${h} L 0 ${h} Z`;
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
    {fill && <path d={fillD} fill={color} opacity={0.08}/>}
    <path d={d} stroke={color} strokeWidth={1.8} fill="none" strokeLinejoin="round" strokeLinecap="round"/>
  </svg>;
};

// Placeholder image tile — subtle stripes with mono label
const Placeholder = ({ label='image', w='100%', h=80, tone='brand' }) => {
  const c = tone==='brand' ? 'var(--brand-200)' : 'var(--n-200)';
  return <div style={{
    width:w, height:h, borderRadius:10, background:`repeating-linear-gradient(45deg, ${c} 0 8px, transparent 8px 16px), var(--n-75)`,
    display:'flex', alignItems:'center', justifyContent:'center',
    fontFamily:'var(--font-mono)', fontSize:10, color:'var(--ink-sub)',
    border:'1px dashed var(--border-strong)', letterSpacing:.5
  }}>{label}</div>;
};

// Generic table
const Table = ({ cols, rows, compact=false }) => (
  <div style={{overflow:'hidden', borderRadius:10, border:'1px solid var(--border)'}}>
    <table style={{width:'100%', borderCollapse:'collapse', fontSize:13}}>
      <thead>
        <tr style={{background:'var(--n-50)'}}>
          {cols.map((c,i)=><th key={i} style={{
            textAlign:'left', padding: compact?'8px 12px':'10px 14px',
            fontSize:11, fontWeight:600, color:'var(--ink-sub)', textTransform:'uppercase', letterSpacing:.6,
            borderBottom:'1px solid var(--border)', width:c.w
          }}>{c.h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r,i)=><tr key={i} style={{
          borderBottom: i<rows.length-1?'1px solid var(--border)':''
        }}>
          {cols.map((c,j)=><td key={j} style={{padding: compact?'8px 12px':'12px 14px', color:'var(--ink)'}}>{r[c.k]}</td>)}
        </tr>)}
      </tbody>
    </table>
  </div>
);

Object.assign(window, { Chip, Btn, Card, Stat, Avatar, Sparkbars, Donut, Line, Placeholder, Table });
