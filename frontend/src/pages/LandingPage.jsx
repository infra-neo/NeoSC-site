import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ZITADEL_CONFIG, ZITADEL_CLOUD_CONFIG } from '@/config/zitadel';
import {
  Shield, Lock, Monitor, CheckCircle2, X, Play,
  Maximize2, Minimize2, ChevronRight, ChevronDown,
  Wifi, Globe, Server, Container, Key, Users,
  Cpu, Cloud, Terminal, FileCode, Layout, Chrome,
  ArrowRight, ExternalLink, Zap, Network, Eye,
  HardDrive, Search
} from 'lucide-react';

// Demo configurations
const demoConfigs = {
  linux: { title: 'Ubuntu Desktop 22.04', subtitle: 'Full Linux environment via noVNC', url: 'http://100.107.254.100:6080/', gradient: 'from-orange-500 to-yellow-500', plan: 'PRO & ENTERPRISE', icon: Layout },
  windows: { title: 'Windows Desktop', subtitle: 'Windows via TSplus HTML5', url: 'https://win11.blueedge.me/', gradient: 'from-blue-500 to-cyan-500', plan: 'ALL PLANS', icon: Monitor },
  vscode: { title: 'VS Code Online', subtitle: 'Browser-based IDE', url: 'https://stackblitz.com/edit/typescript?embed=1', gradient: 'from-blue-600 to-blue-400', plan: 'ALL PLANS', icon: FileCode },
  panel: { title: 'NeoSC Panel', subtitle: 'Server management panel', url: 'https://panel.proxy.kappa4.com/', gradient: 'from-purple-500 to-pink-500', plan: 'PRO & ENTERPRISE', icon: Server },
  crm: { title: 'CRM Dashboard', subtitle: 'Analytics dashboard', url: 'https://metabase.com/demo', gradient: 'from-green-500 to-emerald-500', plan: 'ALL PLANS', icon: Globe },
  jupyter: { title: 'Jupyter Lab', subtitle: 'Data science workspace', url: 'https://jupyter.org/try', gradient: 'from-orange-600 to-red-500', plan: 'PRO & ENTERPRISE', icon: Terminal },
};

const pricingPlans = [
  {
    name: 'Starter', price: '$29', period: '/mes',
    description: 'VM + NeoDesk HTML5 para equipos pequenos',
    features: [
      { text: '5 Usuarios NeoDesk', included: true },
      { text: '2 vCPU / 4 GB RAM / 80 GB NVMe', included: true },
      { text: 'NeoDesk (Guacamole HTML5)', included: true },
      { text: 'NeoMesh Zero Trust VPN', included: true },
      { text: 'NeoGuard SSO + MFA', included: true },
      { text: 'Soporte por email', included: true },
      { text: 'NeoDesk+ (TSplus)', included: false },
      { text: 'NeoProxy IAP', included: false },
      { text: 'NeoVault PAM', included: false },
    ],
    cta: 'Empezar', featured: false
  },
  {
    name: 'Plus', price: '$79', period: '/mes',
    description: 'TSplus existente + NeoProxy + NeoMesh',
    features: [
      { text: '25 Usuarios NeoDesk+', included: true },
      { text: '4 vCPU / 8 GB RAM / 120 GB NVMe', included: true },
      { text: 'NeoDesk+ (TSplus HTML5)', included: true },
      { text: 'NeoProxy IAP (Pomerium)', included: true },
      { text: 'NeoMesh Zero Trust VPN', included: true },
      { text: 'NeoGuard SSO + MFA + Google/MS', included: true },
      { text: 'Soporte prioritario 4h', included: true },
      { text: 'NeoVault PAM', included: false },
    ],
    cta: 'Comprar', featured: true
  },
  {
    name: 'Enterprise', price: 'Custom', period: '',
    description: 'B2B delegado con NeoVault y on-prem',
    features: [
      { text: 'Usuarios ilimitados', included: true },
      { text: '8+ vCPU / 16+ GB RAM / 200+ GB', included: true },
      { text: 'NeoVault PAM (JumpServer)', included: true },
      { text: 'NeoMesh + relay dedicado', included: true },
      { text: 'NeoGuard + AD/LDAP federado', included: true },
      { text: 'Grabacion sesiones', included: true },
      { text: 'SLA 99.9% + soporte 24/7', included: true },
      { text: 'CFDI Mexico / Facturacion', included: true },
    ],
    cta: 'Contactar ventas', featured: false
  }
];

const featuresComparison = [
  { feature: 'Usuarios', starter: '5', professional: '25', enterprise: 'Ilimitados' },
  { feature: 'NeoDesk HTML5', starter: true, professional: true, enterprise: true },
  { feature: 'NeoDesk+ (TSplus)', starter: false, professional: true, enterprise: true },
  { feature: 'NeoMesh VPN', starter: true, professional: true, enterprise: true },
  { feature: 'NeoGuard SSO + MFA', starter: true, professional: true, enterprise: true },
  { feature: 'NeoProxy IAP', starter: false, professional: true, enterprise: true },
  { feature: 'NeoVault PAM', starter: false, professional: false, enterprise: true },
  { feature: 'Relay dedicado', starter: false, professional: false, enterprise: true },
  { feature: 'AD/LDAP federado', starter: false, professional: false, enterprise: true },
  { feature: 'Soporte', starter: 'Email', professional: '4h prioritario', enterprise: '24/7 Premium' },
  { feature: 'SLA', starter: '-', professional: '99.5%', enterprise: '99.9%' },
];

// Platform tree — Teleport-style
const platformTree = [
  {
    label: 'Unified Identity Layer', icon: Shield, color: '#9945ff',
    children: [
      { label: 'NeoGuard SSO (Zitadel OIDC)', icon: Lock },
      { label: 'Multi-Factor Authentication', icon: Key },
      { label: 'AD / LDAP Federation', icon: Users },
    ]
  },
  {
    label: 'Zero Trust Access', icon: Wifi, color: '#1e998e',
    children: [
      { label: 'NeoMesh VPN (NetBird)', icon: Network },
      { label: 'NeoProxy IAP (Pomerium)', icon: Globe },
      { label: 'NeoConnect Relay', icon: Container },
    ]
  },
  {
    label: 'Remote Desktops & Apps', icon: Monitor, color: '#00b4d8',
    children: [
      { label: 'NeoDesk HTML5 (Guacamole)', icon: Chrome },
      { label: 'NeoDesk+ TSplus HTML5', icon: Layout },
      { label: 'Ubuntu Desktop / Kiosk', icon: Terminal },
      { label: 'Windows VMs on LXD', icon: Server },
    ]
  },
  {
    label: 'Identity Governance', icon: Eye, color: '#f72585',
    children: [
      { label: 'NeoVault PAM (JumpServer)', icon: Lock },
      { label: 'Session Recording', icon: Play },
      { label: 'Audit Logs & Compliance', icon: Shield },
    ]
  },
];

// Sidebar product icons
const sidebarProducts = [
  { icon: Shield, label: 'NeoGuard', color: '#9945ff' },
  { icon: Wifi, label: 'NeoMesh', color: '#1e998e' },
  { icon: Monitor, label: 'NeoDesk', color: '#00b4d8' },
  { icon: Globe, label: 'NeoProxy', color: '#f77f00' },
  { icon: Lock, label: 'NeoVault', color: '#f72585' },
  { icon: Container, label: 'NeoCloud', color: '#4cc9f0' },
  { icon: Network, label: 'NeoConnect', color: '#7209b7' },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [demoActive, setDemoActive] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [currentDemo, setCurrentDemo] = useState(null);
  const [demoFullscreen, setDemoFullscreen] = useState(false);
  const [expandedTree, setExpandedTree] = useState([0, 2]);
  const demoContainerRef = useRef(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleSignIn = () => navigate('/login');

  const loadDemo = (type) => {
    const config = demoConfigs[type];
    if (!config) return;
    setCurrentDemo({ ...config, type });
    setDemoActive(true);
    setDemoLoading(true);
    setTimeout(() => demoContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    setTimeout(() => setDemoLoading(false), 1500);
  };

  const closeDemo = () => { setDemoActive(false); setCurrentDemo(null); setDemoLoading(false); setDemoFullscreen(false); };

  const scrollToSection = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const toggleTree = (i) => {
    setExpandedTree(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]);
  };

  return (
    <div className="min-h-screen bg-[#0f1117] text-[#ced4da] overflow-x-hidden">

      {/* Announcement Bar */}
      <div className="bg-[#1e998e] text-white text-center py-2 text-xs font-medium z-[60] relative">
        <span>NeoSC Platform v2.0 — Automated Zitadel + NetBird provisioning is live.</span>
        <button onClick={() => navigate('/market')} className="ml-2 underline hover:no-underline">
          Explore Market <ChevronRight className="w-3 h-3 inline" />
        </button>
      </div>

      {/* Navigation — Teleport style */}
      <nav className={`sticky top-0 z-50 transition-all duration-300 border-b ${
        scrolled ? 'bg-[#0f1117]/95 backdrop-blur-xl border-[#2a2d35]' : 'bg-[#0f1117] border-transparent'
      }`}>
        <div className="max-w-7xl mx-auto px-6 h-[60px] flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#9945ff] to-[#7209b7] flex items-center justify-center">
              <span className="text-white font-bold">N</span>
            </div>
            <div className="flex items-baseline gap-0.5">
              <span className="font-semibold text-white text-lg">Neo</span>
              <span className="text-[#1e998e] font-bold text-lg">SC</span>
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-7 text-sm">
            {[
              { label: 'Platform', action: () => scrollToSection('platform') },
              { label: 'Solutions', action: () => scrollToSection('demo') },
              { label: 'Pricing', action: () => scrollToSection('pricing') },
              { label: 'Resources', action: () => scrollToSection('features') },
            ].map(item => (
              <button key={item.label} onClick={item.action}
                className="text-[#8b949e] hover:text-white transition-colors flex items-center gap-1">
                {item.label} <ChevronDown className="w-3 h-3" />
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button onClick={handleSignIn} className="text-sm text-[#8b949e] hover:text-white transition-colors hidden sm:block">
              LOG IN
            </button>
            <Button onClick={handleSignIn} size="sm"
              className="bg-[#2a2d35] hover:bg-[#363a42] text-white border border-[#3d4148] text-sm h-9 px-4">
              Try for Free
            </Button>
            <Button onClick={() => navigate('/market')} size="sm"
              className="bg-[#9945ff] hover:bg-[#8033e0] text-white text-sm h-9 px-4">
              Explore Market
            </Button>
          </div>
        </div>
      </nav>

      <div className="flex">
        {/* Left Sidebar — Product Icons */}
        <aside className="hidden lg:flex flex-col items-center w-16 py-6 gap-4 border-r border-[#1e2028] sticky top-[60px] h-[calc(100vh-60px)]">
          {sidebarProducts.map((p, i) => {
            const Icon = p.icon;
            return (
              <button key={i} title={p.label}
                className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-[#1e2028] transition-colors group relative">
                <Icon className="w-5 h-5" style={{ color: p.color }} />
                <span className="absolute left-12 bg-[#1e2028] text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                  {p.label}
                </span>
              </button>
            );
          })}
          <div className="flex-1" />
          <button onClick={handleSignIn} className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-[#1e2028] transition-colors">
            <Search className="w-4 h-4 text-[#8b949e]" />
          </button>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0">

          {/* Hero — Teleport Style */}
          <section className="relative px-6 pt-16 pb-12">
            <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-12">
              {/* Left: Platform title + tree */}
              <div className="flex-1 space-y-8">
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#9945ff] to-[#7209b7] flex items-center justify-center">
                      <Shield className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-[#9945ff] text-sm font-semibold tracking-wide uppercase">NeoSC Platform</span>
                  </div>
                  <h1 className="text-4xl sm:text-5xl font-bold text-white leading-tight" data-testid="hero-title">
                    NeoSC Infrastructure
                    <br />
                    <span className="bg-gradient-to-r from-[#9945ff] to-[#1e998e] bg-clip-text text-transparent">Identity Platform</span>
                  </h1>
                  <p className="mt-4 text-lg text-[#8b949e] max-w-xl">
                    Unified Identity Securing Desktops, Apps & Infrastructure.
                    Zero Trust Access for Windows, Linux and Cloud workloads.
                  </p>
                </div>

                {/* Platform Tree */}
                <div id="platform" className="space-y-1" data-testid="platform-tree">
                  {platformTree.map((branch, i) => {
                    const Icon = branch.icon;
                    const isOpen = expandedTree.includes(i);
                    return (
                      <div key={i}>
                        <button onClick={() => toggleTree(i)}
                          className="flex items-center gap-3 w-full py-2.5 px-3 rounded-lg hover:bg-[#1a1d24] transition-colors text-left group">
                          <div className="w-1 h-8 rounded-full" style={{ backgroundColor: branch.color }} />
                          <Icon className="w-4 h-4" style={{ color: branch.color }} />
                          <span className="text-white font-medium text-sm flex-1">{branch.label}</span>
                          <ChevronRight className={`w-3.5 h-3.5 text-[#8b949e] transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                        </button>
                        {isOpen && (
                          <div className="ml-8 pl-4 border-l border-[#2a2d35] space-y-0.5">
                            {branch.children.map((child, j) => {
                              const CIcon = child.icon;
                              return (
                                <div key={j} className="flex items-center gap-2.5 py-1.5 px-3 rounded text-sm text-[#8b949e] hover:text-white hover:bg-[#1a1d24] transition-colors cursor-default">
                                  <CIcon className="w-3.5 h-3.5" />
                                  {child.label}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right: Featured Resource / CTA */}
              <div className="w-full lg:w-[380px] space-y-6">
                <div className="rounded-2xl border border-[#2a2d35] bg-[#161920] p-6 space-y-5">
                  <div className="text-xs text-[#8b949e] uppercase tracking-wider font-semibold">Featured Resource</div>
                  <div className="rounded-xl bg-gradient-to-br from-[#9945ff]/20 to-[#1e998e]/20 p-8 flex items-center justify-center">
                    <div className="text-center space-y-3">
                      <div className="w-16 h-16 rounded-2xl bg-[#9945ff]/20 flex items-center justify-center mx-auto">
                        <Shield className="w-8 h-8 text-[#9945ff]" />
                      </div>
                      <div className="text-white font-semibold">Zero Trust<br />Secure Connect</div>
                    </div>
                  </div>
                  <div>
                    <div className="text-white font-semibold mb-1">NeoSC: Beyond VPN access</div>
                    <p className="text-xs text-[#8b949e]">
                      See how NeoGuard SSO + NeoMesh VPN + NeoDesk RDP create a unified identity perimeter.
                    </p>
                  </div>
                  <button onClick={() => scrollToSection('demo')} className="flex items-center gap-2 text-[#1e998e] text-sm font-medium hover:underline">
                    Try Live Demo <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Quick stats */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { val: '99.9%', label: 'Uptime SLA', color: '#1e998e' },
                    { val: '<2min', label: 'Provisioning', color: '#9945ff' },
                    { val: '0', label: 'Open Ports', color: '#f72585' },
                    { val: '3', label: 'Auth Factors', color: '#f77f00' },
                  ].map((s, i) => (
                    <div key={i} className="rounded-xl border border-[#2a2d35] bg-[#161920] p-3 text-center">
                      <div className="text-xl font-bold" style={{ color: s.color }}>{s.val}</div>
                      <div className="text-[10px] text-[#8b949e]">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Live Demo Section */}
          <section id="demo" className="px-6 py-16 border-t border-[#1e2028]" ref={demoContainerRef}>
            <div className="max-w-6xl mx-auto">
              <div className="text-center mb-10">
                <Badge className="bg-[#1e998e]/10 text-[#1e998e] border-[#1e998e]/30 mb-3">Interactive Demos</Badge>
                <h2 className="text-3xl font-bold text-white">Try it now — no install required</h2>
                <p className="text-[#8b949e] mt-2">Click any workspace to launch an HTML5 session in your browser</p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
                {Object.entries(demoConfigs).map(([key, config]) => {
                  const Icon = config.icon;
                  return (
                    <button key={key} onClick={() => loadDemo(key)}
                      className={`rounded-xl border p-4 text-center transition-all hover:scale-[1.02] ${
                        currentDemo?.type === key
                          ? 'border-[#1e998e] bg-[#1e998e]/10'
                          : 'border-[#2a2d35] bg-[#161920] hover:border-[#3d4148]'
                      }`} data-testid={`demo-${key}`}>
                      <Icon className="w-6 h-6 mx-auto mb-2 text-[#8b949e]" />
                      <div className="text-xs font-medium text-white">{config.title}</div>
                      <div className="text-[9px] text-[#8b949e] mt-0.5">{config.plan}</div>
                    </button>
                  );
                })}
              </div>

              {demoActive && currentDemo && (
                <div className={`rounded-2xl border border-[#2a2d35] bg-[#0a0c10] overflow-hidden ${demoFullscreen ? 'fixed inset-0 z-50 rounded-none' : ''}`}>
                  <div className="flex items-center justify-between px-4 py-2 bg-[#161920] border-b border-[#2a2d35]">
                    <div className="flex items-center gap-3">
                      <div className="flex gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-red-500 cursor-pointer" onClick={closeDemo} />
                        <div className="w-3 h-3 rounded-full bg-yellow-500" />
                        <div className="w-3 h-3 rounded-full bg-green-500" />
                      </div>
                      <span className="text-xs text-[#8b949e] font-mono">{currentDemo.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setDemoFullscreen(!demoFullscreen)} className="text-[#8b949e] hover:text-white">
                        {demoFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                      </button>
                      <button onClick={closeDemo} className="text-[#8b949e] hover:text-white">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className={`relative ${demoFullscreen ? 'h-[calc(100vh-40px)]' : 'h-[500px]'}`}>
                    {demoLoading ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-[#0a0c10]">
                        <div className="text-center space-y-3">
                          <div className="w-10 h-10 border-2 border-[#1e998e] border-t-transparent rounded-full animate-spin mx-auto" />
                          <p className="text-sm text-[#8b949e]">Establishing secure tunnel...</p>
                        </div>
                      </div>
                    ) : (
                      <iframe src={currentDemo.url} className="w-full h-full border-0" title={currentDemo.title}
                        sandbox="allow-scripts allow-same-origin allow-popups allow-forms" />
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Pricing */}
          <section id="pricing" className="px-6 py-16 border-t border-[#1e2028]">
            <div className="max-w-6xl mx-auto">
              <div className="text-center mb-10">
                <h2 className="text-3xl font-bold text-white">Simple, transparent pricing</h2>
                <p className="text-[#8b949e] mt-2">Start free, scale with your team</p>
              </div>

              <div className="grid md:grid-cols-3 gap-5">
                {pricingPlans.map((plan, i) => (
                  <div key={i} className={`rounded-2xl border p-6 transition-all relative ${
                    plan.featured
                      ? 'border-[#9945ff]/50 bg-[#161920] ring-1 ring-[#9945ff]/20'
                      : 'border-[#2a2d35] bg-[#161920]'
                  }`} data-testid={`pricing-${plan.name.toLowerCase()}`}>
                    {plan.featured && (
                      <Badge className="absolute -top-2.5 right-4 bg-[#9945ff] text-white text-[10px]">Popular</Badge>
                    )}
                    <div className="mb-5">
                      <div className="text-lg font-bold text-white">{plan.name}</div>
                      <div className="flex items-baseline gap-1 mt-1">
                        <span className="text-3xl font-bold text-white">{plan.price}</span>
                        <span className="text-[#8b949e] text-sm">{plan.period}</span>
                      </div>
                      <p className="text-xs text-[#8b949e] mt-1">{plan.description}</p>
                    </div>
                    <div className="space-y-2 mb-6">
                      {plan.features.map((f, j) => (
                        <div key={j} className="flex items-center gap-2 text-xs">
                          {f.included
                            ? <CheckCircle2 className="w-3.5 h-3.5 text-[#1e998e] flex-shrink-0" />
                            : <X className="w-3.5 h-3.5 text-[#3d4148] flex-shrink-0" />
                          }
                          <span className={f.included ? 'text-[#ced4da]' : 'text-[#3d4148]'}>{f.text}</span>
                        </div>
                      ))}
                    </div>
                    <Button onClick={() => navigate('/market')}
                      className={`w-full ${plan.featured
                        ? 'bg-[#9945ff] hover:bg-[#8033e0] text-white'
                        : 'bg-[#2a2d35] hover:bg-[#363a42] text-white border border-[#3d4148]'
                      }`}>
                      {plan.cta}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Features Comparison */}
          <section id="features" className="px-6 py-16 border-t border-[#1e2028]">
            <div className="max-w-5xl mx-auto">
              <h2 className="text-2xl font-bold text-white text-center mb-8">Feature comparison</h2>
              <div className="rounded-2xl border border-[#2a2d35] bg-[#161920] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2a2d35]">
                      <th className="text-left py-3 px-5 text-[#8b949e] font-medium">Feature</th>
                      <th className="text-center py-3 px-4 text-white font-medium">Starter</th>
                      <th className="text-center py-3 px-4 text-[#9945ff] font-medium">Plus</th>
                      <th className="text-center py-3 px-4 text-white font-medium">Enterprise</th>
                    </tr>
                  </thead>
                  <tbody>
                    {featuresComparison.map((row, i) => (
                      <tr key={i} className="border-b border-[#1e2028] hover:bg-[#1a1d24]">
                        <td className="py-2.5 px-5 text-[#8b949e] text-xs">{row.feature}</td>
                        {['starter', 'professional', 'enterprise'].map(tier => {
                          const val = row[tier];
                          return (
                            <td key={tier} className="py-2.5 px-4 text-center text-xs">
                              {val === true ? <CheckCircle2 className="w-4 h-4 text-[#1e998e] mx-auto" /> :
                               val === false ? <X className="w-4 h-4 text-[#3d4148] mx-auto" /> :
                               <span className="text-[#ced4da]">{val}</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Bottom CTA — Gradient bar */}
          <section className="px-6 py-16 bg-gradient-to-r from-[#9945ff]/20 via-[#7209b7]/10 to-[#1e998e]/20 border-t border-[#1e2028]">
            <div className="max-w-4xl mx-auto text-center space-y-6">
              <h2 className="text-3xl font-bold text-white">Ready to secure your infrastructure?</h2>
              <p className="text-[#8b949e]">Deploy NeoSC in minutes. No credit card required.</p>
              <div className="flex items-center justify-center gap-4">
                <Button onClick={() => navigate('/market')} size="lg"
                  className="bg-[#9945ff] hover:bg-[#8033e0] text-white font-bold px-8 py-6 text-base gap-2">
                  Start Free Trial <ArrowRight className="w-4 h-4" />
                </Button>
                <Button onClick={handleSignIn} size="lg" variant="outline"
                  className="border-[#3d4148] text-white hover:bg-[#2a2d35] px-8 py-6 text-base">
                  Contact Sales
                </Button>
              </div>
            </div>
          </section>

          {/* Footer */}
          <footer className="px-6 py-10 border-t border-[#1e2028]">
            <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-md bg-gradient-to-br from-[#9945ff] to-[#7209b7] flex items-center justify-center">
                  <span className="text-white font-bold text-xs">N</span>
                </div>
                <span className="text-sm text-[#8b949e]">NeoSC by Neogenesys</span>
              </div>
              <div className="flex gap-6 text-xs text-[#8b949e]">
                <a href="#" className="hover:text-white transition-colors">Terms of service</a>
                <a href="#" className="hover:text-white transition-colors">Privacy policy</a>
                <span>2026 Neogenesys</span>
              </div>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
