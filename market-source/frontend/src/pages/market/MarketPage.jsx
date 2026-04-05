import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import axios from 'axios';
import {
  Monitor, Shield, Zap, Users, HardDrive, Cpu, MemoryStick,
  ChevronRight, CheckCircle2, X, Plus, Minus, CreditCard,
  Globe, Lock, Server, ArrowRight, Sparkles, Star
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// ─── Planes NeoSC × TSplus ───────────────────────────────────────────────────
const NEOSC_PLANS = [
  {
    id: 'starter',
    name: 'NeoSC Starter',
    tsplus_licenses: 5,
    base_vcpu: 2,
    base_ram: 4,
    base_disk: 60,
    base_price_mo: 4999,   // cents
    base_price_yr: 47990,
    color: 'border-teal-500/50',
    glow: 'hover:shadow-teal-500/10',
    badge_bg: 'bg-teal-500/10 text-teal-400 border-teal-500/30',
    popular: false,
    features: [
      '5 usuarios TSplus HTML5',
      '2 vCPU / 4 GB RAM',
      '60 GB NVMe',
      'Netbird Zero Trust',
      'Zitadel SSO + MFA',
      'Soporte por email',
    ],
    limits: { maxVcpu: 8, maxRam: 16, maxDisk: 200 },
  },
  {
    id: 'business',
    name: 'NeoSC Business',
    tsplus_licenses: 10,
    base_vcpu: 4,
    base_ram: 8,
    base_disk: 80,
    base_price_mo: 9999,
    base_price_yr: 95990,
    color: 'border-cyan-500/70',
    glow: 'hover:shadow-cyan-500/15',
    badge_bg: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
    popular: true,
    features: [
      '10 usuarios TSplus HTML5',
      '4 vCPU / 8 GB RAM',
      '80 GB NVMe',
      'Netbird Zero Trust',
      'Zitadel SSO + MFA + Google/MS SSO',
      'Soporte prioritario 4h',
    ],
    limits: { maxVcpu: 16, maxRam: 32, maxDisk: 500 },
  },
  {
    id: 'enterprise',
    name: 'NeoSC Enterprise',
    tsplus_licenses: 25,
    base_vcpu: 8,
    base_ram: 16,
    base_disk: 160,
    base_price_mo: 19999,
    base_price_yr: 191990,
    color: 'border-purple-500/50',
    glow: 'hover:shadow-purple-500/10',
    badge_bg: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    popular: false,
    features: [
      '25 usuarios TSplus HTML5',
      '8 vCPU / 16 GB RAM',
      '160 GB NVMe',
      'Netbird Zero Trust + relay dedicado',
      'Zitadel SSO + MFA + AD/LDAP',
      'Grabación de sesiones',
      'Soporte 24/7 + SLA 99.9%',
    ],
    limits: { maxVcpu: 32, maxRam: 64, maxDisk: 1000 },
  },
];

// ─── Addons ───────────────────────────────────────────────────────────────────
const ADDONS = [
  { slug: 'backup-daily',  name: 'Backup Diario',        desc: 'Snapshot automático + 30 días', price_mo: 1500, icon: '💾', category: 'storage' },
  { slug: 'sso-google',    name: 'SSO Google Workspace', desc: 'Login con cuenta Google',        price_mo: 1000, icon: '🔐', category: 'security' },
  { slug: 'sso-microsoft', name: 'SSO Microsoft 365',    desc: 'Login con Azure AD / Entra ID', price_mo: 1000, icon: '🔑', category: 'security' },
  { slug: 'mfa-enforce',   name: 'MFA Obligatorio',      desc: 'Forzar 2FA a todos los usuarios', price_mo: 500,  icon: '🛡️', category: 'security' },
  { slug: 'session-rec',   name: 'Grabación Sesiones',   desc: 'Auditoría visual de sesiones',  price_mo: 2500, icon: '🎥', category: 'security' },
  { slug: 'support-prio',  name: 'Soporte 24/7',         desc: 'Teléfono + chat, respuesta 1h', price_mo: 5000, icon: '📞', category: 'support' },
  { slug: 'extra-disk-50', name: 'Disco Extra 50 GB',    desc: '50 GB NVMe adicionales',        price_mo: 800,  icon: '💽', category: 'storage' },
  { slug: 'tsplus-extra5', name: 'TSplus +5 licencias',  desc: '5 usuarios TSplus adicionales', price_mo: 3500, icon: '👥', category: 'tsplus' },
  { slug: 'custom-domain', name: 'Dominio Propio',        desc: 'Usa tu dominio personalizado',  price_mo: 1500, icon: '🌐', category: 'network' },
  { slug: 'geo-block',     name: 'Bloqueo Geográfico',   desc: 'Restringir acceso por país',    price_mo: 1000, icon: '🌍', category: 'security' },
];

const REGIONS = [
  { id: 'bare-metal-mx',  name: 'México',      flag: '🇲🇽', ping: '~5ms',  badge: 'Bare Metal', available: true },
  { id: 'gcp-us-central', name: 'USA Central', flag: '🇺🇸', ping: '~35ms', badge: 'GCP',        available: true },
  { id: 'gcp-eu-west',    name: 'Europa',      flag: '🇪🇺', ping: '~120ms',badge: 'GCP',        available: false },
];

const fmtMoney = (cents) => `$${(cents / 100).toFixed(0)}`;

// ─── Componente principal ────────────────────────────────────────────────────
export default function MarketPage() {
  const navigate = useNavigate();
  const { user, getAuthHeader, isAuthenticated } = useAuth();

  // State del configurador
  const [selectedPlan, setSelectedPlan] = useState(NEOSC_PLANS[1]); // Business por defecto
  const [billing, setBilling] = useState('monthly'); // monthly | annual
  const [vcpu, setVcpu] = useState(4);
  const [ram, setRam] = useState(8);
  const [disk, setDisk] = useState(80);
  const [region, setRegion] = useState('bare-metal-mx');
  const [selectedAddons, setSelectedAddons] = useState([]);
  const [tsplusLicenses, setTsplusLicenses] = useState(10);
  const [companyName, setCompanyName] = useState('');
  const [hostname, setHostname] = useState('');

  // UI state
  const [step, setStep] = useState('plan'); // plan | configure | checkout
  const [loading, setLoading] = useState(false);
  const [totalPrice, setTotalPrice] = useState(0);
  const [activeAddonCat, setActiveAddonCat] = useState('all');

  // Calcular precio en tiempo real
  const calcPrice = useCallback(() => {
    let base = billing === 'annual'
      ? Math.round(selectedPlan.base_price_yr / 12)
      : selectedPlan.base_price_mo;

    // Extra recursos
    const extraVcpu = Math.max(0, vcpu - selectedPlan.base_vcpu);
    const extraRam  = Math.max(0, ram  - selectedPlan.base_ram);
    const extraDisk = Math.max(0, disk - selectedPlan.base_disk);
    base += extraVcpu * 500 + extraRam * 200 + extraDisk * 10;

    // TSplus licencias extra
    const baseTs = selectedPlan.tsplus_licenses;
    if (tsplusLicenses > baseTs) {
      const extraTs = Math.ceil((tsplusLicenses - baseTs) / 5);
      base += extraTs * 3500;
    }

    // Addons
    const addonTotal = selectedAddons.reduce((sum, slug) => {
      const a = ADDONS.find(a => a.slug === slug);
      return sum + (a ? a.price_mo : 0);
    }, 0);

    setTotalPrice(base + addonTotal);
  }, [selectedPlan, billing, vcpu, ram, disk, tsplusLicenses, selectedAddons]);

  useEffect(() => { calcPrice(); }, [calcPrice]);

  // Sincronizar recursos con el plan seleccionado
  const selectPlan = (plan) => {
    setSelectedPlan(plan);
    setVcpu(plan.base_vcpu);
    setRam(plan.base_ram);
    setDisk(plan.base_disk);
    setTsplusLicenses(plan.tsplus_licenses);
  };

  const toggleAddon = (slug) => {
    setSelectedAddons(prev =>
      prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]
    );
  };

  const handleCheckout = async () => {
    if (!isAuthenticated) {
      // Guardar config en session storage y redirigir a login
      sessionStorage.setItem('market_config', JSON.stringify({
        plan: selectedPlan.id, billing, vcpu, ram, disk, region,
        addons: selectedAddons, tsplus_licenses: tsplusLicenses,
        company_name: companyName, hostname
      }));
      navigate('/login?from=/market&reason=checkout');
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(`${API}/market/orders`, {
        neosc_plan: selectedPlan.id,
        billing_period: billing,
        vcpu, ram_gb: ram, disk_gb: disk, region,
        addons: selectedAddons,
        tsplus_licenses: tsplusLicenses,
        tsplus_company_name: companyName || user?.organization || 'Mi Empresa',
        custom_hostname: hostname,
        total_cents: totalPrice,
      }, { headers: getAuthHeader() });

      const { order_id, demo } = res.data;
      if (demo) {
        // DEMO MODE: simular pago y redirigir a progress
        await axios.post(`${API}/market/orders/${order_id}/simulate-payment`, {}, {
          headers: getAuthHeader()
        });
        navigate(`/market/progress?order_id=${order_id}`);
      } else {
        // Modo real: ir a checkout Stripe/PayPal
        navigate(`/market/checkout?order_id=${order_id}`);
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al crear la orden');
    } finally {
      setLoading(false);
    }
  };

  const addonCategories = ['all', ...new Set(ADDONS.map(a => a.category))];
  const filteredAddons = activeAddonCat === 'all'
    ? ADDONS
    : ADDONS.filter(a => a.category === activeAddonCat);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ─── Header ─── */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-xl border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="flex items-center gap-2 text-cyan-400 font-bold text-lg">
              <Shield className="w-5 h-5" />
              NeoSC
            </button>
            <span className="text-muted-foreground">/</span>
            <span className="text-sm text-muted-foreground">Windows VDI Market</span>
          </div>
          <div className="flex items-center gap-3">
            {/* Steps indicator */}
            {['plan', 'configure', 'checkout'].map((s, i) => (
              <div key={s} className="flex items-center gap-1">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  step === s ? 'bg-cyan-500 text-black' :
                  ['plan','configure','checkout'].indexOf(step) > i ? 'bg-cyan-500/30 text-cyan-400' :
                  'bg-muted text-muted-foreground'
                }`}>{i + 1}</div>
                {i < 2 && <div className="w-8 h-px bg-border" />}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* ════════════════════════════════════════════════════════════
            STEP 1: Selección de plan
        ════════════════════════════════════════════════════════════ */}
        {step === 'plan' && (
          <div>
            <div className="text-center mb-10">
              <Badge className="mb-4 bg-cyan-500/10 text-cyan-400 border-cyan-500/30">
                Windows VDI Cloud — Zero Trust
              </Badge>
              <h1 className="text-3xl font-bold mb-3">
                Tu escritorio Windows seguro,<br />listo en minutos
              </h1>
              <p className="text-muted-foreground max-w-xl mx-auto">
                VMs Windows con TSplus HTML5, Netbird mesh y Zitadel SSO.
                Acceso desde cualquier navegador, sin VPN.
              </p>
            </div>

            {/* Billing toggle */}
            <div className="flex items-center justify-center gap-3 mb-8">
              <span className={`text-sm ${billing === 'monthly' ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>Mensual</span>
              <Switch
                checked={billing === 'annual'}
                onCheckedChange={v => setBilling(v ? 'annual' : 'monthly')}
              />
              <span className={`text-sm ${billing === 'annual' ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                Anual
                <Badge className="ml-2 bg-green-500/10 text-green-400 border-green-500/30 text-xs">−20%</Badge>
              </span>
            </div>

            {/* Cards de planes */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              {NEOSC_PLANS.map((plan) => (
                <div
                  key={plan.id}
                  onClick={() => selectPlan(plan)}
                  className={`relative rounded-2xl border-2 bg-card p-6 cursor-pointer transition-all duration-200 hover:shadow-xl ${plan.glow} ${
                    selectedPlan.id === plan.id ? plan.color + ' shadow-lg' : 'border-border hover:border-border/80'
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-cyan-500 text-black border-0 shadow-lg shadow-cyan-500/20">
                        <Star className="w-3 h-3 mr-1" /> Más popular
                      </Badge>
                    </div>
                  )}
                  <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium mb-3 ${plan.badge_bg}`}>
                    {plan.tsplus_licenses} usuarios TSplus
                  </div>
                  <h3 className="font-bold text-lg mb-1">{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mb-1">
                    <span className="text-3xl font-black text-cyan-400">
                      {fmtMoney(billing === 'annual' ? Math.round(plan.base_price_yr / 12) : plan.base_price_mo)}
                    </span>
                    <span className="text-muted-foreground text-sm">/mes</span>
                  </div>
                  {billing === 'annual' && (
                    <p className="text-xs text-muted-foreground mb-3">
                      Facturado {fmtMoney(plan.base_price_yr)}/año
                    </p>
                  )}
                  <div className="text-xs text-muted-foreground mb-4">
                    {plan.base_vcpu} vCPU · {plan.base_ram} GB RAM · {plan.base_disk} GB NVMe
                  </div>
                  <ul className="space-y-2">
                    {plan.features.map(f => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className="w-4 h-4 text-cyan-400 mt-0.5 flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <div className={`mt-4 h-0.5 rounded-full transition-all ${selectedPlan.id === plan.id ? 'bg-cyan-500' : 'bg-transparent'}`} />
                </div>
              ))}
            </div>

            <div className="flex justify-center">
              <Button
                onClick={() => setStep('configure')}
                className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold px-8 py-3 text-base gap-2"
              >
                Configurar {selectedPlan.name} <ArrowRight className="w-4 h-4" />
              </Button>
            </div>

            {/* Trust signals */}
            <div className="flex items-center justify-center gap-8 mt-8 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><Lock className="w-3 h-3 text-cyan-400" /> Zero Trust</span>
              <span className="flex items-center gap-1.5"><Shield className="w-3 h-3 text-cyan-400" /> WireGuard</span>
              <span className="flex items-center gap-1.5"><Zap className="w-3 h-3 text-cyan-400" /> Listo en ~8 min</span>
              <span className="flex items-center gap-1.5"><Globe className="w-3 h-3 text-cyan-400" /> HTML5 clientless</span>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════
            STEP 2: Configurador
        ════════════════════════════════════════════════════════════ */}
        {step === 'configure' && (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">

            {/* Panel izquierdo */}
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <button onClick={() => setStep('plan')} className="text-muted-foreground hover:text-foreground text-sm flex items-center gap-1">
                  ← Volver a planes
                </button>
                <span className="text-muted-foreground">·</span>
                <span className="font-medium">{selectedPlan.name}</span>
                <Badge className={selectedPlan.badge_bg}>{fmtMoney(totalPrice)}/mes</Badge>
              </div>

              {/* Recursos VM */}
              <section className="rounded-xl border border-border bg-card p-5 space-y-5">
                <h2 className="font-bold flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-cyan-400" /> Recursos de la VM
                </h2>

                {/* vCPU */}
                <div>
                  <div className="flex justify-between mb-2">
                    <Label className="text-sm">vCPU</Label>
                    <span className="text-cyan-400 font-bold text-sm">{vcpu} cores</span>
                  </div>
                  <Slider
                    min={selectedPlan.base_vcpu} max={selectedPlan.limits.maxVcpu} step={2}
                    value={[vcpu]} onValueChange={([v]) => setVcpu(v)}
                    className="[&>span]:bg-cyan-500"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>{selectedPlan.base_vcpu} (base)</span>
                    <span>{selectedPlan.limits.maxVcpu} max</span>
                  </div>
                </div>

                {/* RAM */}
                <div>
                  <div className="flex justify-between mb-2">
                    <Label className="text-sm">RAM</Label>
                    <span className="text-cyan-400 font-bold text-sm">{ram} GB</span>
                  </div>
                  <Slider
                    min={selectedPlan.base_ram} max={selectedPlan.limits.maxRam} step={4}
                    value={[ram]} onValueChange={([v]) => setRam(v)}
                    className="[&>span]:bg-cyan-500"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>{selectedPlan.base_ram} GB (base)</span>
                    <span>{selectedPlan.limits.maxRam} GB max</span>
                  </div>
                </div>

                {/* Disco */}
                <div>
                  <div className="flex justify-between mb-2">
                    <Label className="text-sm">Disco NVMe</Label>
                    <span className="text-cyan-400 font-bold text-sm">{disk} GB</span>
                  </div>
                  <Slider
                    min={selectedPlan.base_disk} max={selectedPlan.limits.maxDisk} step={20}
                    value={[disk]} onValueChange={([v]) => setDisk(v)}
                    className="[&>span]:bg-cyan-500"
                  />
                </div>
              </section>

              {/* TSplus */}
              <section className="rounded-xl border border-border bg-card p-5 space-y-4">
                <h2 className="font-bold flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-cyan-400" /> Configuración TSplus
                </h2>
                <div>
                  <Label className="text-sm mb-2 block">Número de licencias de usuario</Label>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setTsplusLicenses(Math.max(selectedPlan.tsplus_licenses, tsplusLicenses - 5))}
                      className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:border-cyan-500/50 transition-colors"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <div className="flex gap-2">
                      {[5, 10, 25].map(n => (
                        <button
                          key={n}
                          onClick={() => setTsplusLicenses(Math.max(n, selectedPlan.tsplus_licenses))}
                          className={`px-4 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                            tsplusLicenses === n
                              ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                              : 'border-border hover:border-border/80'
                          }`}
                        >
                          {n} usuarios
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setTsplusLicenses(tsplusLicenses + 5)}
                      className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:border-cyan-500/50 transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <span className="text-cyan-400 font-bold">{tsplusLicenses}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm mb-1.5 block">Nombre de empresa</Label>
                    <Input
                      value={companyName}
                      onChange={e => setCompanyName(e.target.value)}
                      placeholder="Mi Empresa S.A."
                      className="bg-background border-border"
                    />
                  </div>
                  <div>
                    <Label className="text-sm mb-1.5 block">Hostname personalizado</Label>
                    <div className="flex items-center gap-1">
                      <Input
                        value={hostname}
                        onChange={e => setHostname(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                        placeholder="miempresa"
                        className="bg-background border-border"
                      />
                      <span className="text-muted-foreground text-xs whitespace-nowrap">.desk.kappa4.com</span>
                    </div>
                  </div>
                </div>
              </section>

              {/* Región */}
              <section className="rounded-xl border border-border bg-card p-5">
                <h2 className="font-bold flex items-center gap-2 mb-3">
                  <Server className="w-4 h-4 text-cyan-400" /> Región del servidor
                </h2>
                <div className="grid grid-cols-3 gap-2">
                  {REGIONS.map(r => (
                    <button
                      key={r.id}
                      onClick={() => r.available && setRegion(r.id)}
                      disabled={!r.available}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        !r.available ? 'opacity-40 cursor-not-allowed border-border' :
                        region === r.id ? 'border-cyan-500 bg-cyan-500/10' : 'border-border hover:border-border/80'
                      }`}
                    >
                      <div className="text-xl mb-1">{r.flag}</div>
                      <div className="text-sm font-medium">{r.name}</div>
                      <div className="text-xs text-muted-foreground">{r.ping} · {r.badge}</div>
                      {!r.available && <div className="text-xs text-muted-foreground mt-0.5">Próximamente</div>}
                    </button>
                  ))}
                </div>
              </section>

              {/* Add-ons */}
              <section className="rounded-xl border border-border bg-card p-5">
                <h2 className="font-bold flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-cyan-400" /> Add-ons opcionales
                </h2>
                {/* Filtro por categoría */}
                <div className="flex gap-1.5 mb-4 flex-wrap">
                  {addonCategories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setActiveAddonCat(cat)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                        activeAddonCat === cat
                          ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                          : 'border-border text-muted-foreground hover:border-border/80'
                      }`}
                    >
                      {cat === 'all' ? 'Todos' : cat}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {filteredAddons.map(addon => {
                    const active = selectedAddons.includes(addon.slug);
                    return (
                      <button
                        key={addon.slug}
                        onClick={() => toggleAddon(addon.slug)}
                        className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                          active ? 'border-cyan-500 bg-cyan-500/5' : 'border-border hover:border-border/70'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-base">{addon.icon}</span>
                          <div>
                            <div className="text-sm font-medium">{addon.name}</div>
                            <div className="text-xs text-muted-foreground">{addon.desc}</div>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 ml-2">
                          <div className="text-xs font-bold text-cyan-400">+{fmtMoney(addon.price_mo)}</div>
                          <div className="text-[10px] text-muted-foreground">/mes</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>

            {/* ─── Panel derecho: resumen sticky ─── */}
            <div className="xl:sticky xl:top-20 h-fit space-y-4">
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="font-bold mb-4">Resumen de tu pedido</h3>

                {/* Billing */}
                <div className="flex items-center gap-2 p-1.5 bg-muted rounded-xl mb-4">
                  {['monthly', 'annual'].map(b => (
                    <button
                      key={b}
                      onClick={() => setBilling(b)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        billing === b ? 'bg-cyan-500 text-black shadow-sm' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {b === 'monthly' ? 'Mensual' : 'Anual −20%'}
                    </button>
                  ))}
                </div>

                {/* Desglose */}
                <div className="space-y-2 text-sm border-b border-border pb-3 mb-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{selectedPlan.name}</span>
                    <span>{fmtMoney(billing === 'annual' ? Math.round(selectedPlan.base_price_yr/12) : selectedPlan.base_price_mo)}</span>
                  </div>
                  {vcpu > selectedPlan.base_vcpu && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">+{vcpu - selectedPlan.base_vcpu} vCPU extra</span>
                      <span>+{fmtMoney((vcpu - selectedPlan.base_vcpu) * 500)}</span>
                    </div>
                  )}
                  {ram > selectedPlan.base_ram && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">+{ram - selectedPlan.base_ram} GB RAM extra</span>
                      <span>+{fmtMoney((ram - selectedPlan.base_ram) * 200)}</span>
                    </div>
                  )}
                  {disk > selectedPlan.base_disk && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">+{disk - selectedPlan.base_disk} GB disco extra</span>
                      <span>+{fmtMoney((disk - selectedPlan.base_disk) * 10)}</span>
                    </div>
                  )}
                  {tsplusLicenses > selectedPlan.tsplus_licenses && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">+{tsplusLicenses - selectedPlan.tsplus_licenses} licencias TSplus</span>
                      <span>+{fmtMoney(Math.ceil((tsplusLicenses - selectedPlan.tsplus_licenses)/5) * 3500)}</span>
                    </div>
                  )}
                  {selectedAddons.map(slug => {
                    const a = ADDONS.find(a => a.slug === slug);
                    return a ? (
                      <div key={slug} className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{a.icon} {a.name}</span>
                        <span>+{fmtMoney(a.price_mo)}</span>
                      </div>
                    ) : null;
                  })}
                  {billing === 'annual' && (
                    <div className="flex justify-between text-xs text-green-400">
                      <span>Descuento anual (−20%)</span>
                      <span>aplicado</span>
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-baseline mb-4">
                  <span className="text-muted-foreground text-sm">Total mensual</span>
                  <div className="text-right">
                    <span className="text-2xl font-black text-cyan-400">{fmtMoney(totalPrice)}</span>
                    <span className="text-xs text-muted-foreground">/mes</span>
                  </div>
                </div>

                {/* Mini spec */}
                <div className="rounded-xl bg-muted/50 p-3 text-xs font-mono space-y-1 mb-4">
                  <div className="text-muted-foreground mb-1">Tu VM incluye:</div>
                  <div>✓ Windows + {vcpu} vCPU / {ram} GB / {disk} GB</div>
                  <div>✓ TSplus HTML5 — {tsplusLicenses} usuarios</div>
                  <div>✓ Netbird mesh Zero Trust</div>
                  <div>✓ Zitadel SSO + MFA</div>
                  <div>✓ {hostname || 'tunombre'}.desk.kappa4.com</div>
                  <div>✓ Listo en ~8 minutos</div>
                </div>

                <Button
                  onClick={handleCheckout}
                  disabled={loading}
                  className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-bold py-3 gap-2"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  ) : (
                    <CreditCard className="w-4 h-4" />
                  )}
                  {isAuthenticated ? 'Continuar al pago' : 'Iniciar sesión y pagar'}
                  <ArrowRight className="w-4 h-4" />
                </Button>

                <p className="text-center text-[10px] text-muted-foreground mt-2">
                  🔒 Pago seguro · Sin permanencia · Cancela cuando quieras
                </p>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
