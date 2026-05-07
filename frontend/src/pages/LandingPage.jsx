import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Shield, Lock, Monitor, CheckCircle2, X, Play,
  Maximize2, Minimize2, ChevronRight, ChevronDown,
  Wifi, Globe, Server, Container, Key, Users,
  Eye, Terminal, Layout, Code, BarChart3, BookOpen,
  ArrowRight, Menu, Check, Minus
} from 'lucide-react';

// ─── DATA ────────────────────────────────────────────────────────────────────

const categories = [
  { icon: Shield, title: 'Unified Identity Layer', items: [
    { icon: Lock, label: 'NeoGuard SSO (OIDC)' }, { icon: Key, label: 'Multi-Factor Authentication' }, { icon: Users, label: 'AD / LDAP Federation' }
  ], defaultOpen: true },
  { icon: Wifi, title: 'Zero Trust Access', items: [
    { icon: Globe, label: 'NeoMesh Zero-Trust VPN' }, { icon: Container, label: 'NeoConnect Relay' }, { icon: Lock, label: 'NeoProxy IAP' }
  ] },
  { icon: Monitor, title: 'Remote Desktops & Apps', items: [
    { icon: Globe, label: 'NeoVDI HTML5 Gateway' }, { icon: Layout, label: 'NeoDesk+ TSplus HTML5' }, { icon: Terminal, label: 'Ubuntu Desktop / Kiosk' }, { icon: Monitor, label: 'Windows VMs on NeoCloud' }
  ], defaultOpen: true },
  { icon: Eye, title: 'Identity Governance', items: [
    { icon: Lock, label: 'NeoVault PAM (JumpServer)' }, { icon: Play, label: 'Session Recording' }, { icon: Shield, label: 'Audit Logs & Compliance' }
  ] },
];

const stats = [
  { value: 99.9, suffix: '%', label: 'Uptime SLA' },
  { value: 2, prefix: '<', suffix: 'min', label: 'Provisioning' },
  { value: 0, suffix: '', label: 'Open Ports' },
  { value: 3, suffix: '', label: 'Auth Factors' },
];

const demoConfigs = {
  linux:   { title: 'Ubuntu Desktop 22.04', url: 'http://100.107.254.100:6080/', icon: Terminal, badge: 'PRO & ENTERPRISE', color: 'from-orange-500 to-red-500' },
  windows: { title: 'Windows Desktop',      url: 'https://win11.blueedge.me/',  icon: Monitor,  badge: 'ALL PLANS',        color: 'from-blue-500 to-cyan-500' },
  vscode:  { title: 'VS Code Online',       url: 'https://stackblitz.com/edit/typescript?embed=1', icon: Code, badge: 'ALL PLANS', color: 'from-blue-600 to-blue-400' },
  panel:   { title: 'NeoSCloud Panel',      url: 'https://panel.proxy.kappa4.com/', icon: Layout, badge: 'PRO & ENTERPRISE', color: 'from-cyan-500 to-teal-500' },
  crm:     { title: 'CRM Dashboard',        url: 'https://metabase.com/demo',  icon: BarChart3, badge: 'ALL PLANS',        color: 'from-green-500 to-emerald-500' },
  jupyter: { title: 'Jupyter Lab',          url: 'https://jupyter.org/try',    icon: BookOpen,  badge: 'PRO & ENTERPRISE', color: 'from-orange-400 to-yellow-500' },
};

const plans = [
  { name: 'Starter', price: '$29', period: '/mes', description: 'VM + NeoVDI HTML5 para equipos pequenos', features: [
    { text: '5 Usuarios NeoVDI', ok: true }, { text: '2 vCPU / 4 GB RAM / 80 GB NVMe', ok: true }, { text: 'NeoVDI HTML5', ok: true },
    { text: 'NeoMesh Zero Trust VPN', ok: true }, { text: 'NeoGuard SSO + MFA', ok: true }, { text: 'Soporte por email', ok: true },
    { text: 'NeoDesk+ (TSplus)', ok: false }, { text: 'NeoProxy IAP', ok: false }, { text: 'NeoVault PAM', ok: false },
  ], cta: 'Empezar', popular: false },
  { name: 'Plus', price: '$79', period: '/mes', description: 'TSplus existente + NeoProxy + NeoMesh', features: [
    { text: '25 Usuarios NeoDesk+', ok: true }, { text: '4 vCPU / 8 GB RAM / 120 GB NVMe', ok: true }, { text: 'NeoDesk+ (TSplus HTML5)', ok: true },
    { text: 'NeoProxy IAP (Pomerium)', ok: true }, { text: 'NeoMesh Zero Trust VPN', ok: true }, { text: 'NeoGuard SSO + MFA + Google/MS', ok: true },
    { text: 'Soporte prioritario 4h', ok: true }, { text: 'NeoVault PAM', ok: false },
  ], cta: 'Comprar', popular: true },
  { name: 'Enterprise', price: 'Custom', period: '', description: 'B2B delegado con NeoVault y on-prem', features: [
    { text: 'Usuarios ilimitados', ok: true }, { text: '8+ vCPU / 16+ GB RAM / 200+ GB', ok: true }, { text: 'NeoVault PAM (JumpServer)', ok: true },
    { text: 'NeoMesh + relay dedicado', ok: true }, { text: 'NeoGuard + AD/LDAP federado', ok: true }, { text: 'Grabacion sesiones', ok: true },
    { text: 'SLA 99.9% + soporte 24/7', ok: true }, { text: 'CFDI Mexico / Facturacion', ok: true },
  ], cta: 'Contactar ventas', popular: false },
];

const featureRows = [
  { name: 'Usuarios', starter: '5', plus: '25', enterprise: 'Ilimitados' },
  { name: 'NeoVDI HTML5', starter: true, plus: true, enterprise: true },
  { name: 'NeoDesk+ (TSplus)', starter: false, plus: true, enterprise: true },
  { name: 'NeoMesh VPN', starter: true, plus: true, enterprise: true },
  { name: 'NeoGuard SSO + MFA', starter: true, plus: true, enterprise: true },
  { name: 'NeoProxy IAP', starter: false, plus: true, enterprise: true },
  { name: 'NeoVault PAM', starter: false, plus: false, enterprise: true },
  { name: 'Relay dedicado', starter: false, plus: false, enterprise: true },
  { name: 'AD/LDAP federado', starter: false, plus: false, enterprise: true },
  { name: 'Soporte', starter: 'Email', plus: '4h prioritario', enterprise: '24/7 Premium' },
  { name: 'SLA', starter: '-', plus: '99.5%', enterprise: '99.9%' },
];

const sidebarItems = [
  { icon: Shield, label: 'Identity', href: '#hero' },
  { icon: Wifi, label: 'Zero Trust', href: '#hero' },
  { icon: Monitor, label: 'Desktops', href: '#demos' },
  { icon: Globe, label: 'Network', href: '#features' },
  { icon: Lock, label: 'Security', href: '#pricing' },
  { icon: Eye, label: 'Governance', href: '#features' },
  { icon: Users, label: 'Users', href: '#cta' },
];

// ─── COMPONENTS ──────────────────────────────────────────────────────────────

function CountUp({ value, prefix = '', suffix = '' }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });
  useEffect(() => {
    if (!isInView) return;
    let current = 0;
    const inc = value / 40;
    const timer = setInterval(() => {
      current += inc;
      if (current >= value) { setCount(value); clearInterval(timer); }
      else setCount(current);
    }, 37);
    return () => clearInterval(timer);
  }, [isInView, value]);
  return <span ref={ref}>{prefix}{value % 1 !== 0 ? count.toFixed(1) : Math.round(count)}{suffix}</span>;
}

function CellValue({ value }) {
  if (typeof value === 'boolean') return value ? <Check className="w-4 h-4 text-emerald-400 mx-auto" /> : <X className="w-4 h-4 text-muted-foreground/30 mx-auto" />;
  if (value === '-') return <Minus className="w-4 h-4 text-muted-foreground/30 mx-auto" />;
  return <span className="text-foreground text-sm">{value}</span>;
}

const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } };
const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5 } } };
const fadeLeft = { hidden: { opacity: 0, x: -20 }, visible: { opacity: 1, x: 0, transition: { duration: 0.5 } } };

// ─── MAIN PAGE ───────────────────────────────────────────────────────────────

export default function LandingPage() {
  const navigate = useNavigate();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [openCats, setOpenCats] = useState([0, 2]);
  const [demoActive, setDemoActive] = useState(false);
  const [currentDemo, setCurrentDemo] = useState(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoFullscreen, setDemoFullscreen] = useState(false);
  const [hoveredSidebar, setHoveredSidebar] = useState(null);
  const demoRef = useRef(null);

  useEffect(() => {
    const h = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', h);
    return () => window.removeEventListener('scroll', h);
  }, []);

  const toggleCat = (i) => setOpenCats(p => p.includes(i) ? p.filter(x => x !== i) : [...p, i]);
  const loadDemo = (key) => {
    const c = demoConfigs[key];
    if (!c) return;
    setCurrentDemo({ ...c, key });
    setDemoActive(true);
    setDemoLoading(true);
    setTimeout(() => demoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    setTimeout(() => setDemoLoading(false), 1500);
  };
  const closeDemo = () => { setDemoActive(false); setCurrentDemo(null); setDemoFullscreen(false); };
  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="min-h-screen bg-[#0a0e17] text-[#e2e8f0] overflow-x-hidden">
      <style>{`
        .glass-card { background: rgba(17,24,39,0.6); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.08); }
        .glass-card:hover { border-color: rgba(6,182,212,0.3); background: rgba(17,24,39,0.8); }
        .glow-cyan { box-shadow: 0 0 20px rgba(6,182,212,0.15), 0 0 40px rgba(6,182,212,0.05); }
        .gradient-text-cyan { background: linear-gradient(135deg, #06b6d4, #a855f7); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        @keyframes float-slow { 0%,100%{transform:translateY(0) translateX(0)} 25%{transform:translateY(-20px) translateX(10px)} 50%{transform:translateY(-10px) translateX(-5px)} 75%{transform:translateY(-25px) translateX(8px)} }
        @keyframes pulse-glow { 0%,100%{opacity:.3;box-shadow:0 0 10px currentColor} 50%{opacity:.7;box-shadow:0 0 25px currentColor} }
        @keyframes grid-move { 0%{transform:translateY(0)} 100%{transform:translateY(40px)} }
        .float-slow { animation: float-slow 8s ease-in-out infinite; }
        .pulse-glow-anim { animation: pulse-glow 3s ease-in-out infinite; }
        .grid-move { animation: grid-move 20s linear infinite; }
      `}</style>

      {/* ═══ ANNOUNCEMENT BAR ═══ */}
      <div className="fixed top-0 left-0 right-0 z-[120] bg-gradient-to-r from-cyan-500/20 via-purple-500/20 to-cyan-500/20 border-b border-[#1e293b]">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-center text-xs sm:text-sm">
          <span className="text-[#94a3b8]">NeoSCloud Platform v2.0 — Automated provisioning is live.</span>
          <button onClick={() => navigate('/market')} className="ml-2 text-[#06b6d4] font-medium hover:underline hidden sm:inline">Explore Market →</button>
        </div>
      </div>

      {/* ═══ NAVBAR ═══ */}
      <motion.nav initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
        className="fixed top-[33px] sm:top-[37px] left-0 right-0 z-[110]">
        <div className={`w-full px-4 sm:px-6 lg:px-12 py-3 transition-all duration-300 ${isScrolled ? 'bg-[#0a0e17]/90 backdrop-blur-xl border-b border-[#1e293b]' : 'bg-transparent'}`}>
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm">N</div>
              <span className="font-bold text-lg text-white">Neo<span className="text-[#06b6d4]">SC</span>loud</span>
            </Link>
            <div className="hidden md:flex items-center gap-8">
              {[['Platform','hero'],['Solutions','demos'],['Pricing','pricing'],['Resources','features']].map(([l,h])=>(
                <button key={l} onClick={()=>scrollTo(h)} className="text-[#94a3b8] hover:text-white text-sm font-medium transition-colors flex items-center gap-1">{l}<ChevronDown className="w-3 h-3"/></button>
              ))}
            </div>
            <div className="hidden md:flex items-center gap-4">
              <button onClick={()=>navigate('/login')} className="text-[#94a3b8] hover:text-white text-sm">LOG IN</button>
              <button onClick={()=>navigate('/login')} className="px-4 py-2 rounded-lg border border-[#1e293b] text-white text-sm font-medium hover:bg-[#1e293b] transition-colors">Try for Free</button>
              <motion.button whileHover={{scale:1.05}} whileTap={{scale:0.95}} onClick={()=>navigate('/market')} className="px-4 py-2 rounded-lg bg-[#06b6d4] text-[#0a0e17] text-sm font-semibold hover:bg-[#06b6d4]/90">Explore Market</motion.button>
            </div>
            <button onClick={()=>setMobileMenu(!mobileMenu)} className="md:hidden p-2 text-white">{mobileMenu?<X className="w-5 h-5"/>:<Menu className="w-5 h-5"/>}</button>
          </div>
        </div>
      </motion.nav>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileMenu && (
          <motion.div initial={{opacity:0,y:-20}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-20}} className="md:hidden fixed inset-0 bg-[#0a0e17]/98 backdrop-blur-xl z-[100] pt-24 px-6" onClick={()=>setMobileMenu(false)}>
            <div className="flex flex-col gap-6" onClick={e=>e.stopPropagation()}>
              {['Platform','Solutions','Pricing','Resources'].map((l,i)=>(<motion.button key={l} initial={{opacity:0,x:-20}} animate={{opacity:1,x:0}} transition={{delay:i*0.1}} className="text-white text-xl font-medium text-left" onClick={()=>setMobileMenu(false)}>{l}</motion.button>))}
              <div className="pt-4 border-t border-[#1e293b]"><button onClick={()=>{setMobileMenu(false);navigate('/market')}} className="w-full text-center px-4 py-3 rounded-lg bg-[#06b6d4] text-[#0a0e17] font-semibold">Try for Free</button></div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ SIDEBAR ═══ */}
      <motion.aside initial={{opacity:0,x:-20}} animate={{opacity:1,x:0}} transition={{duration:0.6,delay:0.5}}
        className="fixed left-0 top-1/2 -translate-y-1/2 z-[100] hidden lg:flex flex-col items-center py-4 px-2">
        <div className="glass-card rounded-2xl py-4 px-2 flex flex-col items-center gap-1 border border-[#1e293b]/50">
          {sidebarItems.map((item, i) => {
            const Icon = item.icon;
            return (
              <button key={item.label} onClick={()=>scrollTo(item.href.replace('#',''))}
                className="relative group p-3 rounded-xl text-[#94a3b8] hover:text-[#06b6d4] transition-colors"
                onMouseEnter={()=>setHoveredSidebar(i)} onMouseLeave={()=>setHoveredSidebar(null)}>
                <motion.div whileHover={{scale:1.2}} transition={{type:'spring',stiffness:400}}><Icon className="w-5 h-5"/></motion.div>
                {hoveredSidebar===i && (
                  <motion.div initial={{opacity:0,x:-8,scale:0.9}} animate={{opacity:1,x:0,scale:1}} transition={{duration:0.15}}
                    className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-[#111827] border border-[#1e293b] text-white text-xs font-medium whitespace-nowrap">
                    {item.label}
                  </motion.div>
                )}
              </button>
            );
          })}
        </div>
      </motion.aside>

      {/* ═══ HERO ═══ */}
      <section id="hero" className="relative min-h-screen pt-28 sm:pt-32 pb-16 px-4 sm:px-6 lg:px-12 overflow-hidden">
        {/* Particles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(6)].map((_,i)=>(<div key={i} className="absolute rounded-full float-slow pulse-glow-anim" style={{width:`${4+i*2}px`,height:`${4+i*2}px`,left:`${10+i*15}%`,top:`${20+(i%3)*25}%`,background:i%2===0?'#06b6d4':'#a855f7',animationDelay:`${i*0.8}s`,opacity:0.4}}/>))}
        </div>
        {/* Grid */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none grid-move" style={{backgroundImage:'linear-gradient(#06b6d4 1px, transparent 1px), linear-gradient(90deg, #06b6d4 1px, transparent 1px)',backgroundSize:'40px 40px'}}/>

        <div className="relative z-10 max-w-7xl mx-auto grid lg:grid-cols-2 gap-8 lg:gap-12 items-start">
          {/* Left */}
          <motion.div variants={stagger} initial="hidden" animate="visible">
            <motion.div variants={fadeLeft} className="flex items-center gap-2 mb-6">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center"><Shield className="w-3 h-3 text-white"/></div>
              <span className="text-[#06b6d4] text-sm font-semibold tracking-wider uppercase">NeoSCloud Platform</span>
            </motion.div>
            <motion.h1 variants={fadeLeft} className="text-3xl sm:text-4xl lg:text-6xl font-bold text-white leading-tight mb-4" data-testid="hero-title">
              NeoSCloud Infrastructure{' '}<span className="gradient-text-cyan">Identity Platform</span>
            </motion.h1>
            <motion.p variants={fadeLeft} className="text-[#94a3b8] text-base sm:text-lg mb-8 max-w-lg">
              Unified Identity Securing Desktops, Apps & Infrastructure. Zero Trust Access for Windows, Linux and Cloud workloads.
            </motion.p>
            {/* Accordion */}
            <motion.div variants={stagger} className="space-y-2">
              {categories.map((cat,idx)=>(
                <motion.div key={idx} variants={fadeLeft}>
                  <button onClick={()=>toggleCat(idx)} className="w-full flex items-center justify-between px-3 sm:px-4 py-3 rounded-lg hover:bg-[#1e293b]/50 transition-all text-left group">
                    <div className="flex items-center gap-3">
                      <div className="w-1 h-8 rounded-full bg-[#06b6d4] group-hover:h-10 transition-all"/>
                      <cat.icon className="w-4 h-4 text-[#06b6d4] group-hover:scale-110 transition-transform"/>
                      <span className="text-white font-medium text-sm">{cat.title}</span>
                    </div>
                    {cat.items.length>0 && <motion.div animate={{rotate:openCats.includes(idx)?180:0}} transition={{duration:0.3}}><ChevronDown className="w-4 h-4 text-[#94a3b8]"/></motion.div>}
                  </button>
                  <AnimatePresence>
                    {openCats.includes(idx)&&cat.items.length>0&&(
                      <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}} transition={{duration:0.3}} className="ml-8 sm:ml-12 space-y-1 pb-2">
                        {cat.items.map((item,i)=>(
                          <motion.div key={i} initial={{opacity:0,x:-10}} animate={{opacity:1,x:0}} transition={{delay:i*0.05}}
                            className="flex items-center gap-2 px-3 py-2 text-[#94a3b8] text-sm hover:text-white transition-colors rounded-md hover:bg-[#1e293b]/30">
                            <item.icon className="w-3.5 h-3.5"/><span>{item.label}</span>
                          </motion.div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>

          {/* Right */}
          <motion.div initial={{opacity:0,x:30}} animate={{opacity:1,x:0}} transition={{duration:0.8,delay:0.3}} className="space-y-4 sm:space-y-6">
            <motion.div whileHover={{scale:1.02,y:-4}} transition={{type:'spring',stiffness:300}} className="glass-card rounded-2xl p-6 sm:p-8 glow-cyan">
              <p className="text-xs text-[#94a3b8] uppercase tracking-wider mb-6">Featured Resource</p>
              <div className="flex flex-col items-center text-center mb-6">
                <motion.div animate={{rotate:[0,5,-5,0]}} transition={{duration:4,repeat:Infinity,ease:'easeInOut'}}
                  className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 border border-[#06b6d4]/30 flex items-center justify-center mb-4">
                  <Shield className="w-8 h-8 text-[#06b6d4]"/>
                </motion.div>
                <p className="text-white font-semibold text-lg">Zero Trust</p>
                <p className="text-[#06b6d4] font-semibold">Secure Connect</p>
              </div>
              <h3 className="text-white font-bold text-lg sm:text-xl mb-2">NeoSCloud: Beyond VPN access</h3>
              <p className="text-[#94a3b8] text-sm mb-4">See how NeoGuard SSO + NeoMesh VPN + NeoVDI create a unified identity perimeter.</p>
              <button onClick={()=>scrollTo('demos')} className="text-[#06b6d4] text-sm font-medium hover:underline inline-flex items-center gap-1 group">
                Try Live Demo <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform"/>
              </button>
            </motion.div>
            <div className="grid grid-cols-2 gap-3">
              {stats.map((s,i)=>(
                <motion.div key={i} initial={{opacity:0,scale:0.8}} animate={{opacity:1,scale:1}} transition={{delay:0.5+i*0.1,type:'spring'}}
                  whileHover={{scale:1.05,y:-2}} className="glass-card rounded-xl p-4 sm:p-5 text-center">
                  <p className="text-xl sm:text-2xl font-bold text-white"><CountUp value={s.value} prefix={s.prefix} suffix={s.suffix}/></p>
                  <p className="text-xs text-[#94a3b8] mt-1">{s.label}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══ DEMOS ═══ */}
      <section id="demos" className="py-16 sm:py-24 px-4 sm:px-6 lg:px-12 bg-[#1e293b]/30" ref={demoRef}>
        <div className="max-w-7xl mx-auto">
          <motion.div initial={{opacity:0,y:20}} whileInView={{opacity:1,y:0}} viewport={{once:true}} className="text-center mb-12 sm:mb-16">
            <motion.span initial={{opacity:0,scale:0.8}} whileInView={{opacity:1,scale:1}} viewport={{once:true}} className="inline-block px-3 py-1 rounded-full border border-[#06b6d4]/30 text-[#06b6d4] text-xs font-medium mb-4">Interactive Demos</motion.span>
            <h2 className="text-2xl sm:text-3xl lg:text-5xl font-bold text-white mb-4">Try it now — no install required</h2>
            <p className="text-[#94a3b8] max-w-xl mx-auto text-sm sm:text-base">Click any workspace to launch an HTML5 session in your browser</p>
          </motion.div>
          <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{once:true,margin:'-50px'}} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-8">
            {Object.entries(demoConfigs).map(([key,d])=>{
              const Icon=d.icon;
              return(
                <motion.div key={key} variants={{hidden:{opacity:0,y:30,scale:0.95},visible:{opacity:1,y:0,scale:1,transition:{duration:0.5,type:'spring',stiffness:200}}}}
                  whileHover={{y:-8,scale:1.03}} whileTap={{scale:0.98}}
                  onClick={()=>loadDemo(key)} className={`glass-card rounded-xl p-5 sm:p-6 cursor-pointer group ${currentDemo?.key===key?'border-[#06b6d4] glow-cyan':''}`} data-testid={`demo-${key}`}>
                  <motion.div whileHover={{scale:1.15,rotate:5}} transition={{type:'spring',stiffness:400}} className={`w-12 h-12 rounded-lg bg-gradient-to-br ${d.color} flex items-center justify-center mb-4`}>
                    <Icon className="w-6 h-6 text-white"/>
                  </motion.div>
                  <h3 className="text-white font-semibold mb-2">{d.title}</h3>
                  <span className="text-xs text-[#94a3b8] uppercase tracking-wider">{d.badge}</span>
                </motion.div>
              );
            })}
          </motion.div>
          {/* Demo iframe */}
          {demoActive&&currentDemo&&(
            <div className={`rounded-2xl border border-[#1e293b] bg-[#0a0c10] overflow-hidden ${demoFullscreen?'fixed inset-0 z-50 rounded-none':''}`}>
              <div className="flex items-center justify-between px-4 py-2 bg-[#111827] border-b border-[#1e293b]">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5"><div className="w-3 h-3 rounded-full bg-red-500 cursor-pointer" onClick={closeDemo}/><div className="w-3 h-3 rounded-full bg-yellow-500"/><div className="w-3 h-3 rounded-full bg-green-500"/></div>
                  <span className="text-xs text-[#94a3b8] font-mono">{currentDemo.title}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={()=>setDemoFullscreen(!demoFullscreen)} className="text-[#94a3b8] hover:text-white">{demoFullscreen?<Minimize2 className="w-4 h-4"/>:<Maximize2 className="w-4 h-4"/>}</button>
                  <button onClick={closeDemo} className="text-[#94a3b8] hover:text-white"><X className="w-4 h-4"/></button>
                </div>
              </div>
              <div className={`relative ${demoFullscreen?'h-[calc(100vh-40px)]':'h-[500px]'}`}>
                {demoLoading?(<div className="absolute inset-0 flex items-center justify-center bg-[#0a0c10]"><div className="text-center space-y-3"><div className="w-10 h-10 border-2 border-[#06b6d4] border-t-transparent rounded-full animate-spin mx-auto"/><p className="text-sm text-[#94a3b8]">Establishing secure tunnel...</p></div></div>)
                :(<iframe src={currentDemo.url} className="w-full h-full border-0" title={currentDemo.title} sandbox="allow-scripts allow-same-origin allow-popups allow-forms"/>)}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ═══ PRICING ═══ */}
      <section id="pricing" className="py-16 sm:py-24 px-4 sm:px-6 lg:px-12">
        <div className="max-w-7xl mx-auto">
          <motion.div initial={{opacity:0,y:20}} whileInView={{opacity:1,y:0}} viewport={{once:true}} className="text-center mb-12 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl lg:text-5xl font-bold text-white mb-4">Simple, transparent pricing</h2>
            <p className="text-[#94a3b8] text-sm sm:text-base">Start free, scale with your team</p>
          </motion.div>
          <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{once:true,margin:'-50px'}} className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
            {plans.map((plan,idx)=>(
              <motion.div key={idx} variants={{hidden:{opacity:0,y:40,rotateX:10},visible:{opacity:1,y:0,rotateX:0,transition:{duration:0.6,type:'spring'}}}}
                whileHover={{y:-8,scale:1.02}} className={`glass-card rounded-2xl p-6 sm:p-8 relative ${plan.popular?'border-[#06b6d4]/50 glow-cyan':''}`} data-testid={`pricing-${plan.name.toLowerCase()}`}>
                {plan.popular&&(<motion.span initial={{opacity:0,y:-10}} animate={{opacity:1,y:0}} className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-[#06b6d4] text-[#0a0e17] text-xs font-semibold">Popular</motion.span>)}
                <h3 className="text-white font-bold text-xl mb-1">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mb-2"><span className="text-3xl sm:text-4xl font-bold text-white">{plan.price}</span><span className="text-[#94a3b8] text-sm">{plan.period}</span></div>
                <p className="text-[#94a3b8] text-sm mb-6 sm:mb-8">{plan.description}</p>
                <div className="space-y-3 mb-6 sm:mb-8">
                  {plan.features.map((f,i)=>(
                    <motion.div key={i} initial={{opacity:0,x:-10}} whileInView={{opacity:1,x:0}} viewport={{once:true}} transition={{delay:i*0.03}} className="flex items-center gap-2 text-sm">
                      {f.ok?<Check className="w-4 h-4 text-emerald-400 flex-shrink-0"/>:<X className="w-4 h-4 text-[#94a3b8]/40 flex-shrink-0"/>}
                      <span className={f.ok?'text-white':'text-[#94a3b8]/50'}>{f.text}</span>
                    </motion.div>
                  ))}
                </div>
                <motion.button whileHover={{scale:1.03}} whileTap={{scale:0.97}} onClick={()=>navigate('/market')}
                  className={`w-full py-3 rounded-lg font-semibold text-sm transition-colors ${plan.popular?'bg-[#06b6d4] text-[#0a0e17] hover:bg-[#06b6d4]/90':'border border-[#1e293b] text-white hover:bg-[#1e293b]'}`}>{plan.cta}</motion.button>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══ FEATURES TABLE ═══ */}
      <section id="features" className="py-16 sm:py-24 px-4 sm:px-6 lg:px-12 bg-[#1e293b]/30">
        <div className="max-w-5xl mx-auto">
          <motion.div initial={{opacity:0,y:20}} whileInView={{opacity:1,y:0}} viewport={{once:true}} className="text-center mb-8 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white">Feature comparison</h2>
          </motion.div>
          <motion.div initial={{opacity:0,y:30}} whileInView={{opacity:1,y:0}} viewport={{once:true}} transition={{duration:0.6}} className="glass-card rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px]">
                <thead><tr className="border-b border-[#1e293b]">
                  <th className="text-left px-4 sm:px-6 py-4 text-sm font-medium text-[#94a3b8]">Feature</th>
                  <th className="text-center px-3 sm:px-6 py-4 text-sm font-medium text-[#94a3b8]">Starter</th>
                  <th className="text-center px-3 sm:px-6 py-4 text-sm font-medium text-[#06b6d4]">Plus</th>
                  <th className="text-center px-3 sm:px-6 py-4 text-sm font-medium text-[#94a3b8]">Enterprise</th>
                </tr></thead>
                <tbody>{featureRows.map((f,i)=>(
                  <motion.tr key={i} initial={{opacity:0,x:-10}} whileInView={{opacity:1,x:0}} viewport={{once:true}} transition={{delay:i*0.03}} className="border-b border-[#1e293b]/50 last:border-0 hover:bg-[#1e293b]/30 transition-colors">
                    <td className="px-4 sm:px-6 py-3.5 text-sm text-white">{f.name}</td>
                    <td className="px-3 sm:px-6 py-3.5 text-center"><CellValue value={f.starter}/></td>
                    <td className="px-3 sm:px-6 py-3.5 text-center"><CellValue value={f.plus}/></td>
                    <td className="px-3 sm:px-6 py-3.5 text-center"><CellValue value={f.enterprise}/></td>
                  </motion.tr>
                ))}</tbody>
              </table>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section id="cta" className="relative py-16 sm:py-24 px-4 sm:px-6 lg:px-12 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-cyan-500/5 rounded-full blur-[100px]"/>
          <div className="absolute top-1/2 left-1/3 -translate-y-1/2 w-[400px] h-[200px] bg-purple-500/5 rounded-full blur-[80px]"/>
        </div>
        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <motion.div initial={{opacity:0,y:30}} whileInView={{opacity:1,y:0}} viewport={{once:true}} transition={{duration:0.7}}>
            <motion.h2 initial={{opacity:0,scale:0.9}} whileInView={{opacity:1,scale:1}} viewport={{once:true}} transition={{duration:0.6,delay:0.1}} className="text-2xl sm:text-3xl lg:text-5xl font-bold text-white mb-4">Ready to secure your infrastructure?</motion.h2>
            <motion.p initial={{opacity:0}} whileInView={{opacity:1}} viewport={{once:true}} transition={{delay:0.3}} className="text-[#94a3b8] text-base sm:text-lg mb-8 sm:mb-10">Deploy NeoSCloud in minutes. No credit card required.</motion.p>
            <motion.div initial={{opacity:0,y:10}} whileInView={{opacity:1,y:0}} viewport={{once:true}} transition={{delay:0.4}} className="flex flex-col sm:flex-row gap-4 justify-center">
              <motion.button whileHover={{scale:1.05,y:-2}} whileTap={{scale:0.97}} onClick={()=>navigate('/market')} className="px-8 py-3.5 rounded-lg bg-[#06b6d4] text-[#0a0e17] font-semibold hover:bg-[#06b6d4]/90 transition-colors">Start Free Trial</motion.button>
              <motion.button whileHover={{scale:1.05,y:-2}} whileTap={{scale:0.97}} onClick={()=>navigate('/login')} className="px-8 py-3.5 rounded-lg border border-[#1e293b] text-white font-semibold hover:bg-[#1e293b] transition-colors">Contact Sales</motion.button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <motion.footer initial={{opacity:0}} whileInView={{opacity:1}} viewport={{once:true}} className="border-t border-[#1e293b] py-8 sm:py-12 px-4 sm:px-6 lg:px-12">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center text-white font-bold text-xs">N</div>
            <span className="text-white font-bold">Neo<span className="text-[#06b6d4]">SC</span>loud</span>
          </div>
          <nav className="flex flex-wrap justify-center gap-4 sm:gap-6">
            {['Platform','Pricing','Demos','Docs'].map(l=>(<button key={l} className="text-[#94a3b8] hover:text-white text-sm transition-colors">{l}</button>))}
          </nav>
          <p className="text-[#94a3b8] text-sm">2026 NeoSCloud</p>
        </div>
      </motion.footer>
    </div>
  );
}
