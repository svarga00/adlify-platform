// Lucide-like inline icons — 20x20 / 16x16 strokes. No emoji anywhere.
const Icon = ({ d, size = 18, stroke = 1.6, fill = 'none', children, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
       strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" {...rest}>
    {d ? <path d={d}/> : children}
  </svg>
);

const I = {
  Logo: (p) => (
    <svg width={p.size||28} height={p.size||28} viewBox="0 0 32 32" fill="none" {...p}>
      <defs>
        <linearGradient id="adlG" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FB923C"/>
          <stop offset="1" stopColor="#EA580C"/>
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="8" fill="url(#adlG)"/>
      <path d="M8 23 L14 8.5 L18 8.5 L24 23 M11 18 L21 18" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <circle cx="24" cy="8" r="2.4" fill="#fff"/>
    </svg>
  ),
  LogoWord: (p) => (
    <div style={{display:'inline-flex', alignItems:'center', gap:9, ...p.style}}>
      <svg width={p.size||28} height={p.size||28} viewBox="0 0 32 32" fill="none">
        <defs>
          <linearGradient id={`adlG2-${p.id||'d'}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FB923C"/>
            <stop offset="1" stopColor="#EA580C"/>
          </linearGradient>
        </defs>
        <rect x="1" y="1" width="30" height="30" rx="8" fill={`url(#adlG2-${p.id||'d'})`}/>
        <path d="M8 23 L14 8.5 L18 8.5 L24 23 M11 18 L21 18" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <circle cx="24" cy="8" r="2.4" fill="#fff"/>
      </svg>
      <span style={{fontSize:(p.size||28)*0.66, fontWeight:700, letterSpacing:-.5, color:p.color||'currentColor'}}>Adlify{p.sub && <span style={{fontSize:'.55em', fontWeight:500, color:'var(--ink-sub)', marginLeft:6, textTransform:'uppercase', letterSpacing:.8}}>{p.sub}</span>}</span>
    </div>
  ),
  Dashboard: (p)=><Icon {...p}><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></Icon>,
  Leads: (p)=><Icon {...p}><path d="M3 12h4l3-8 4 16 3-8h4"/></Icon>,
  Clients: (p)=><Icon {...p}><circle cx="9" cy="8" r="3.5"/><path d="M2 20c1.5-4 5-5 7-5s5.5 1 7 5"/><circle cx="17" cy="7" r="2.5"/><path d="M15 13c3 0 5 2 6 5"/></Icon>,
  Projects: (p)=><Icon {...p}><path d="M3 7.5l9-4 9 4-9 4-9-4z"/><path d="M3 12l9 4 9-4M3 16.5l9 4 9-4"/></Icon>,
  Campaign: (p)=><Icon {...p}><path d="M3 11v2a1 1 0 001 1h3l8 5V5L7 10H4a1 1 0 00-1 1z"/><path d="M18 9a4 4 0 010 6"/></Icon>,
  Mail: (p)=><Icon {...p}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></Icon>,
  Tasks: (p)=><Icon {...p}><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 11l3 3 5-6"/></Icon>,
  Ticket: (p)=><Icon {...p}><path d="M3 8a2 2 0 012-2h14a2 2 0 012 2v2a2 2 0 000 4v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-2a2 2 0 000-4V8z"/><path d="M13 6v12" strokeDasharray="2 2"/></Icon>,
  Invoice: (p)=><Icon {...p}><path d="M6 3h9l4 4v14a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z"/><path d="M9 12h6M9 16h6M9 8h3"/></Icon>,
  Onboard: (p)=><Icon {...p}><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/></Icon>,
  Package: (p)=><Icon {...p}><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/></Icon>,
  Report: (p)=><Icon {...p}><path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/></Icon>,
  Calendar: (p)=><Icon {...p}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></Icon>,
  Template: (p)=><Icon {...p}><rect x="3" y="3" width="18" height="5" rx="1.5"/><rect x="3" y="11" width="9" height="10" rx="1.5"/><rect x="15" y="11" width="6" height="10" rx="1.5"/></Icon>,
  Docs: (p)=><Icon {...p}><path d="M7 3h8l4 4v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z"/><path d="M14 3v5h5M9 13h8M9 17h5"/></Icon>,
  Key: (p)=><Icon {...p}><circle cx="8" cy="14" r="4"/><path d="M11 12l9-9 2 2-3 3 2 2-2 2-2-2-3 3"/></Icon>,
  Settings: (p)=><Icon {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1A1.7 1.7 0 004.6 9a1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></Icon>,
  Search: (p)=><Icon {...p}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></Icon>,
  Bell: (p)=><Icon {...p}><path d="M6 8a6 6 0 1112 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 21a2 2 0 004 0"/></Icon>,
  Plus: (p)=><Icon {...p}><path d="M12 5v14M5 12h14"/></Icon>,
  Filter: (p)=><Icon {...p}><path d="M3 5h18l-7 9v5l-4 2v-7L3 5z"/></Icon>,
  Chevron: (p)=><Icon {...p}><path d="M9 6l6 6-6 6"/></Icon>,
  ChevronDown: (p)=><Icon {...p}><path d="M6 9l6 6 6-6"/></Icon>,
  ArrowUp: (p)=><Icon {...p}><path d="M12 19V5M5 12l7-7 7 7"/></Icon>,
  ArrowDown: (p)=><Icon {...p}><path d="M12 5v14M19 12l-7 7-7-7"/></Icon>,
  ArrowRight: (p)=><Icon {...p}><path d="M5 12h14M13 5l7 7-7 7"/></Icon>,
  Check: (p)=><Icon {...p}><path d="M5 12l5 5L20 7"/></Icon>,
  X: (p)=><Icon {...p}><path d="M6 6l12 12M18 6L6 18"/></Icon>,
  Dot: (p)=><Icon {...p}><circle cx="12" cy="12" r="3" fill="currentColor"/></Icon>,
  More: (p)=><Icon {...p}><circle cx="6" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="18" cy="12" r="1.2" fill="currentColor"/></Icon>,
  Upload: (p)=><Icon {...p}><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 9l5-5 5 5M12 4v12"/></Icon>,
  Download: (p)=><Icon {...p}><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 11l5 5 5-5M12 16V4"/></Icon>,
  Sparkle: (p)=><Icon {...p}><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5zM19 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z"/></Icon>,
  Zap: (p)=><Icon {...p}><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/></Icon>,
  Phone: (p)=><Icon {...p}><path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014 2h3a2 2 0 012 1.7c.1.9.3 1.8.6 2.6a2 2 0 01-.5 2.1L7.9 9.8a16 16 0 006 6l1.4-1.3a2 2 0 012.1-.4 13 13 0 002.6.6 2 2 0 011.7 2z"/></Icon>,
  Globe: (p)=><Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18 14 14 0 010-18z"/></Icon>,
  Play: (p)=><Icon {...p}><polygon points="6 4 20 12 6 20 6 4" fill="currentColor"/></Icon>,
  Pause: (p)=><Icon {...p}><rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/></Icon>,
  Edit: (p)=><Icon {...p}><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></Icon>,
  Trash: (p)=><Icon {...p}><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M6 6l1 14a2 2 0 002 2h6a2 2 0 002-2l1-14"/></Icon>,
  Eye: (p)=><Icon {...p}><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></Icon>,
  Link: (p)=><Icon {...p}><path d="M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1"/><path d="M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1"/></Icon>,
  Copy: (p)=><Icon {...p}><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></Icon>,
  Send: (p)=><Icon {...p}><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></Icon>,
  Attach: (p)=><Icon {...p}><path d="M21 10l-9.5 9.5a5 5 0 01-7-7L14 3a3.5 3.5 0 015 5L9 18.5a2 2 0 01-3-3L15 7"/></Icon>,
  Chart: (p)=><Icon {...p}><path d="M3 3v18h18"/><path d="M7 15l4-4 4 3 5-7"/></Icon>,
  Users: (p)=><Icon {...p}><circle cx="9" cy="8" r="3.5"/><path d="M2 20c1-4 4-5 7-5s6 1 7 5"/><circle cx="17" cy="7" r="2.5"/></Icon>,
  Building: (p)=><Icon {...p}><rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2M10 21v-3h4v3"/></Icon>,
  Money: (p)=><Icon {...p}><path d="M12 2v20M17 6H10a3 3 0 000 6h4a3 3 0 010 6H6"/></Icon>,
  Target: (p)=><Icon {...p}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></Icon>,
  Rocket: (p)=><Icon {...p}><path d="M5 19s-1-4 2-7 7-2 7-2 1 4-2 7-7 2-7 2z"/><path d="M14 10s3-1 5-3 2-5 2-5-3 0-5 2-3 5-3 5"/><path d="M9 15l-3 3M7 13l-4 4"/></Icon>,
  Hash: (p)=><Icon {...p}><path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18"/></Icon>,
  Folder: (p)=><Icon {...p}><path d="M3 7a2 2 0 012-2h4l2 3h8a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></Icon>,
  Fb: (p)=><svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M13.5 21v-7.5h2.5l.4-3H13.5V8.6c0-.9.2-1.5 1.5-1.5h1.6V4.5c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.2H8v3h2.5V21h3z"/></svg>,
  Google: (p)=><svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" {...p}><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.3-.2-2H12v3.8h5.4a4.6 4.6 0 01-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.5l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.7-5.6-4.1H3v2.6A10 10 0 0012 22z"/><path fill="#FBBC04" d="M6.4 13.9A6 6 0 016 12c0-.7.1-1.3.4-1.9V7.5H3a10 10 0 000 9l3.4-2.6z"/><path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 003 7.5l3.4 2.6C7.2 7.7 9.4 6 12 6z"/></svg>,
  Instagram: (p)=><Icon {...p}><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="0.8" fill="currentColor"/></Icon>,
  Lock: (p)=><Icon {...p}><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></Icon>,
  Logout: (p)=><Icon {...p}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></Icon>,
  External: (p)=><Icon {...p}><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></Icon>,
  Megaphone: (p)=><Icon {...p}><path d="M3 11v2a1 1 0 001 1h2l10 5V5L6 10H4a1 1 0 00-1 1z"/><path d="M18 8a5 5 0 010 8"/></Icon>,
  Clock: (p)=><Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></Icon>,
  Star: (p)=><Icon {...p}><path d="M12 2l3 7 7 .5-5.5 5 2 7-6.5-4-6.5 4 2-7L2 9.5 9 9l3-7z"/></Icon>,
  Info: (p)=><Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/></Icon>,
  Warning: (p)=><Icon {...p}><path d="M10.3 3.9L2 18a2 2 0 001.7 3h16.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17h.01"/></Icon>,
};

window.I = I;
