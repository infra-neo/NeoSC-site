import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ZITADEL_CONFIG, ZITADEL_CLOUD_CONFIG } from '@/config/zitadel';
import { 
  Shield, 
  Lock, 
  Monitor, 
  CheckCircle2, 
  X, 
  Play,
  Maximize2,
  Minimize2,
  ChevronRight,
} from 'lucide-react';

// Demo configurations - URLs that WORK in iframe
const demoConfigs = {
  linux: {
    title: 'Ubuntu Desktop 22.04',
    subtitle: 'Full Linux environment with development tools via noVNC',
    url: 'http://100.107.254.100:6080/',
    icon: '🐧',
    gradient: 'from-orange-500 to-yellow-500',
    plan: 'PRO & ENTERPRISE'
  },
  windows: {
    title: 'Windows Desktop',
    subtitle: 'Windows environment via TSplus HTML5 Remote Desktop',
    url: 'https://win11.blueedge.me/',
    icon: '🪟',
    gradient: 'from-blue-500 to-cyan-500',
    plan: 'ALL PLANS'
  },
  vscode: {
    title: 'VS Code Online',
    subtitle: 'Browser-based development environment',
    url: 'https://stackblitz.com/edit/typescript?embed=1',
    icon: '💻',
    gradient: 'from-blue-600 to-blue-400',
    plan: 'ALL PLANS'
  },
  panel: {
    title: 'NeoSC Panel',
    subtitle: 'Modern Linux server management panel',
    url: 'https://panel.proxy.kappa4.com/',
    icon: '🎛️',
    gradient: 'from-purple-500 to-pink-500',
    plan: 'PRO & ENTERPRISE'
  },
  crm: {
    title: 'CRM Dashboard',
    subtitle: 'Analytics and business dashboard demo',
    url: 'https://metabase.com/demo',
    icon: '📊',
    gradient: 'from-green-500 to-emerald-500',
    plan: 'ALL PLANS'
  },
  jupyter: {
    title: 'Jupyter Lab',
    subtitle: 'Interactive data science workspace',
    url: 'https://jupyter.org/try',
    icon: '📓',
    gradient: 'from-orange-600 to-red-500',
    plan: 'PRO & ENTERPRISE'
  }
};

// Pricing plans - NeoSC Masterplan v1
const pricingPlans = [
  {
    name: 'Starter',
    icon: '🟢',
    price: '$29',
    period: '/mes',
    description: 'VM + NeoDesk HTML5 para equipos pequeños',
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
    cta: 'Empezar',
    featured: false
  },
  {
    name: 'Plus',
    icon: '🔵',
    price: '$79',
    period: '/mes',
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
    cta: 'Comprar',
    featured: true
  },
  {
    name: 'Enterprise',
    icon: '🟣',
    price: 'Custom',
    period: '',
    description: 'B2B delegado con NeoVault y on-prem',
    features: [
      { text: 'Usuarios ilimitados', included: true },
      { text: '8+ vCPU / 16+ GB RAM / 200+ GB', included: true },
      { text: 'NeoVault PAM (JumpServer)', included: true },
      { text: 'NeoMesh + relay dedicado', included: true },
      { text: 'NeoGuard + AD/LDAP federado', included: true },
      { text: 'Grabación sesiones', included: true },
      { text: 'SLA 99.9% + soporte 24/7', included: true },
      { text: 'CFDI México / Facturación', included: true },
    ],
    cta: 'Contactar ventas',
    featured: false
  }
];

// Features comparison table
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

export default function LandingPage() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [demoActive, setDemoActive] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [currentDemo, setCurrentDemo] = useState(null);
  const [demoFullscreen, setDemoFullscreen] = useState(false);
  const [activeQuality, setActiveQuality] = useState('balanced');
  const demoContainerRef = useRef(null);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Redirect to Zitadel SSO directly
  const handleSignIn = () => {
    navigate('/login');
  };

  const loadDemo = (type) => {
    const config = demoConfigs[type];
    if (!config) return;

    setCurrentDemo({ ...config, type });
    setDemoActive(true);
    setDemoLoading(true);

    // Scroll to demo container
    setTimeout(() => {
      demoContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);

    // Simulate connection delay, then load iframe
    setTimeout(() => {
      setDemoLoading(false);
    }, 1500);
  };

  const closeDemo = () => {
    setDemoActive(false);
    setCurrentDemo(null);
    setDemoLoading(false);
    setDemoFullscreen(false);
  };

  const scrollToSection = (id) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-cyan-500/5" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      {/* Navigation */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-background/95 backdrop-blur-xl border-b border-border shadow-lg' : 'bg-transparent'
      }`}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center">
              <span className="text-white font-bold text-lg">N</span>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1">
                <span className="font-semibold text-foreground">Neo</span>
                <span className="text-cyan-400 font-bold">SC</span>
              </div>
              <span className="text-xs text-orange-400">by Neogénesys</span>
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            <button onClick={() => scrollToSection('demo')} className="text-muted-foreground hover:text-foreground transition-colors">
              Demo
            </button>
            <button onClick={() => scrollToSection('pricing')} className="text-muted-foreground hover:text-foreground transition-colors">
              Pricing
            </button>
            <button onClick={() => scrollToSection('features')} className="text-muted-foreground hover:text-foreground transition-colors">
              Features
            </button>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={handleSignIn}>
              Sign In
            </Button>
            <Button onClick={handleSignIn} className="bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500">
              Start Free Trial
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <Badge className="mb-6 bg-cyan-500/10 text-cyan-400 border-cyan-500/30">
            Powered by NeoMesh Zero Trust Network
          </Badge>
          
          <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-foreground via-cyan-400 to-foreground bg-clip-text text-transparent">
            Zero Trust Remote Access
            <br />
            <span className="text-cyan-400">Platform</span>
          </h1>
          
          <p className="text-xl text-muted-foreground mb-10 max-w-3xl mx-auto leading-relaxed">
            Access Linux desktops, Windows machines, and web applications securely from anywhere.
            Built on <span className="text-cyan-400">NeoGuard SSO</span> + <span className="text-orange-400">NeoMesh VPN</span> + <span className="text-purple-400">NeoDesk RDP</span>.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button 
              size="lg" 
              onClick={() => scrollToSection('demo')}
              className="bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-lg px-8 py-6"
            >
              <Play className="w-5 h-5 mr-2" />
              Try Live Demo
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              onClick={() => scrollToSection('pricing')}
              className="text-lg px-8 py-6 border-border hover:border-cyan-500/50"
            >
              View Pricing
            </Button>
            <Button
              size="lg"
              onClick={() => navigate('/market')}
              className="text-lg px-8 py-6 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white border-0 gap-2"
            >
              🪟 Windows VDI Cloud
            </Button>
          </div>

          {/* Trust badges */}
          <div className="flex items-center justify-center gap-6 mt-12 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-green-400" />
              SOC 2 Compliant
            </div>
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-cyan-400" />
              GDPR Ready
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-purple-400" />
              ISO 27001
            </div>
          </div>
        </div>
      </section>

      {/* Demo Section */}
      <section id="demo" className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold mb-4">Experience NeoSC in Action</h2>
            <p className="text-muted-foreground text-lg">Click on any workspace to start an instant demo session</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.entries(demoConfigs).map(([key, config]) => (
              <div
                key={key}
                onClick={() => loadDemo(key)}
                className="group relative p-6 rounded-2xl bg-card border border-border cursor-pointer transition-all duration-300 hover:border-cyan-500/50 hover:shadow-lg hover:shadow-cyan-500/10 hover:scale-[1.02] overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                
                <div className={`w-16 h-16 rounded-xl bg-gradient-to-br ${config.gradient} flex items-center justify-center text-3xl mb-4 relative z-10`}>
                  {config.icon}
                </div>
                
                <h3 className="text-xl font-semibold mb-2 relative z-10">{config.title.split(' ').slice(0, 2).join(' ')}</h3>
                <p className="text-muted-foreground text-sm mb-4 relative z-10">{config.subtitle}</p>
                
                <Badge variant="outline" className="text-xs border-cyan-500/30 text-cyan-400 relative z-10">
                  ✓ {config.plan}
                </Badge>
              </div>
            ))}
          </div>

          {/* Live Demo Container - EMBEDDED IFRAME */}
          <div 
            ref={demoContainerRef}
            className={`mt-8 transition-all duration-500 ${
              demoActive ? 'opacity-100 max-h-[800px]' : 'opacity-0 max-h-0 overflow-hidden'
            }`}
          >
            <div className={`rounded-2xl border border-cyan-500/30 bg-card overflow-hidden shadow-2xl shadow-cyan-500/10 ${
              demoFullscreen ? 'fixed inset-4 z-50' : ''
            }`}>
              {/* Demo Header */}
              <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
                <div className="flex items-center gap-3">
                  {currentDemo && (
                    <>
                      <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${currentDemo.gradient} flex items-center justify-center text-xl`}>
                        {currentDemo.icon}
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">{currentDemo.title}</h3>
                        <p className="text-sm text-muted-foreground">{currentDemo.subtitle}</p>
                      </div>
                    </>
                  )}
                </div>
                
                <div className="flex items-center gap-2">
                  {/* Quality tabs */}
                  <div className="hidden md:flex items-center gap-1 p-1 bg-muted/50 rounded-lg mr-4">
                    {['high', 'balanced', 'low'].map((q) => (
                      <button
                        key={q}
                        onClick={() => setActiveQuality(q)}
                        className={`px-3 py-1 rounded text-xs transition-colors ${
                          activeQuality === q 
                            ? 'bg-primary text-primary-foreground' 
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {q === 'high' ? 'High Quality' : q === 'balanced' ? 'Balanced' : 'Low Latency'}
                      </button>
                    ))}
                  </div>
                  
                  <Button variant="ghost" size="icon" onClick={() => setDemoFullscreen(!demoFullscreen)}>
                    {demoFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={closeDemo} className="text-destructive hover:text-destructive">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Demo Content - IFRAME */}
              <div className={`bg-black relative ${demoFullscreen ? 'h-[calc(100%-70px)]' : 'h-[500px]'}`}>
                {demoLoading ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center bg-background/95">
                    <div className="w-12 h-12 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4" />
                    <h4 className="text-lg font-medium mb-2">Connecting to {currentDemo?.title}...</h4>
                    <p className="text-sm text-muted-foreground">Establishing secure tunnel...</p>
                    <div className="mt-4 flex items-center gap-2 text-xs text-green-400">
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      Encrypted connection active
                    </div>
                  </div>
                ) : currentDemo ? (
                  <iframe
                    src={currentDemo.url}
                    className="w-full h-full border-0"
                    title={currentDemo.title}
                    allow="clipboard-read; clipboard-write; fullscreen"
                    sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
                  />
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-6 bg-muted/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold mb-4">Simple, Transparent Pricing</h2>
            <p className="text-muted-foreground text-lg">Choose the plan that fits your organization</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {pricingPlans.map((plan) => (
              <div
                key={plan.name}
                className={`relative p-6 rounded-2xl bg-card border transition-all hover:shadow-lg ${
                  plan.featured 
                    ? 'border-cyan-500 shadow-lg shadow-cyan-500/20' 
                    : 'border-border hover:border-cyan-500/30'
                }`}
              >
                {plan.featured && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-gradient-to-r from-orange-500 to-red-500 text-white border-0">
                      🔥 MOST POPULAR
                    </Badge>
                  </div>
                )}

                <div className="text-3xl mb-2">{plan.icon}</div>
                <h3 className="text-2xl font-bold mb-1">{plan.name}</h3>
                <div className="mb-2">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-muted-foreground">{plan.period}</span>
                </div>
                <p className="text-muted-foreground text-sm mb-6">{plan.description}</p>

                <ul className="space-y-3 mb-6">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className={`flex items-center gap-2 text-sm ${
                      feature.included ? '' : 'text-muted-foreground/50'
                    }`}>
                      {feature.included ? (
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                      ) : (
                        <X className="w-4 h-4 text-muted-foreground/30" />
                      )}
                      {feature.text}
                    </li>
                  ))}
                </ul>

                <Button 
                  className={`w-full ${
                    plan.featured 
                      ? 'bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500' 
                      : ''
                  }`}
                  variant={plan.featured ? 'default' : 'outline'}
                  onClick={() => navigate('/market')}
                >
                  {plan.cta}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Comparison Table */}
      <section id="features" className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold mb-4">Feature Comparison</h2>
            <p className="text-muted-foreground text-lg">Compare all plans side by side</p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left p-4 font-semibold">Feature</th>
                  <th className="text-center p-4 font-semibold">Starter</th>
                  <th className="text-center p-4 font-semibold text-cyan-400">Plus</th>
                  <th className="text-center p-4 font-semibold">Enterprise</th>
                </tr>
              </thead>
              <tbody>
                {featuresComparison.map((row, idx) => (
                  <tr key={idx} className="border-b border-border last:border-0 hover:bg-muted/20">
                    <td className="p-4 font-medium">{row.feature}</td>
                    <td className="p-4 text-center">
                      {typeof row.starter === 'boolean' ? (
                        row.starter ? (
                          <CheckCircle2 className="w-5 h-5 text-green-400 mx-auto" />
                        ) : (
                          <X className="w-5 h-5 text-muted-foreground/30 mx-auto" />
                        )
                      ) : (
                        <span className="text-muted-foreground">{row.starter}</span>
                      )}
                    </td>
                    <td className="p-4 text-center bg-cyan-500/5">
                      {typeof row.professional === 'boolean' ? (
                        row.professional ? (
                          <CheckCircle2 className="w-5 h-5 text-green-400 mx-auto" />
                        ) : (
                          <X className="w-5 h-5 text-muted-foreground/30 mx-auto" />
                        )
                      ) : (
                        <span className="text-cyan-400">{row.professional}</span>
                      )}
                    </td>
                    <td className="p-4 text-center">
                      {typeof row.enterprise === 'boolean' ? (
                        row.enterprise ? (
                          <CheckCircle2 className="w-5 h-5 text-green-400 mx-auto" />
                        ) : (
                          <X className="w-5 h-5 text-muted-foreground/30 mx-auto" />
                        )
                      ) : (
                        <span className="text-purple-400">{row.enterprise}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6 bg-gradient-to-r from-cyan-500/10 via-primary/10 to-purple-500/10">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-4">Ready to Get Started?</h2>
          <p className="text-muted-foreground text-lg mb-8">
            Join thousands of organizations using NeoSC for secure remote access
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button 
              size="lg" 
              onClick={handleSignIn}
              className="bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-lg px-8 py-6"
            >
              Get Started Free
              <ChevronRight className="w-5 h-5 ml-2" />
            </Button>
            <Button
              size="lg"
              onClick={() => navigate('/market')}
              className="text-lg px-8 py-6 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white border-0 gap-2"
            >
              🪟 Windows VDI — Comprar ahora
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              onClick={() => scrollToSection('demo')}
              className="text-lg px-8 py-6"
            >
              <Play className="w-5 h-5 mr-2" />
              Watch Demo
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-border">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">N</span>
            </div>
            <span className="text-muted-foreground">© 2025 NeoSC by Neogénesys. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#" className="hover:text-foreground transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-foreground transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-foreground transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Helper functions for PKCE
function generateRandomString() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}
