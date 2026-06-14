import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import axios from 'axios';
import {
  ArrowRight, ArrowLeft, CheckCircle2, Loader2, Cpu, MemoryStick, HardDrive,
  Shield, Lock, ChevronRight, CreditCard, Users, Crown, Star, Sparkles,
  Server, Monitor, Building2, User, Mail, KeyRound, AppWindow, Smartphone,
  Printer, Layers, Zap, Calendar, MapPin, Globe
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// ─── 3-Tier Subscription Plans ──────────────────────────────────────────────
const PLAN_TIERS = [
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'Equipos pequeños',
    icon: Star,
    color: 'amber',
    accent: 'amber-400',
    price: 79,
    yearlyPrice: 790,
    badge: 'STD',
    users: { default: 3, min: 3, max: 5 },
    vm: { cpu: 4, ram: 8, disk: 100 },
    template: 'WIN11-VDI-STANDARD',
    serviceId: 84,
    license: 'system',
    features: [
      '3-5 usuarios concurrentes',
      'TSplus System Edition',
      '4 vCPU / 8 GB RAM / 100 GB SSD',
      'Windows Server 2019 o Win 11',
      'HTML5 vía NeoVDI',
      'SSO + MFA (NeoGuard)',
      'NeoMesh VPN incluido',
      'Soporte por email',
    ],
  },
  {
    id: 'business',
    name: 'Business',
    tagline: 'Equipos en crecimiento',
    icon: Sparkles,
    color: 'cyan',
    accent: 'cyan-400',
    price: 189,
    yearlyPrice: 1890,
    badge: 'GOLD',
    popular: true,
    users: { default: 10, min: 6, max: 15 },
    vm: { cpu: 6, ram: 16, disk: 200 },
    template: 'WIN11-VDI-TSPLUS-GOLD',
    serviceId: 68,
    license: 'printer',
    features: [
      '6-15 usuarios concurrentes',
      'TSplus Printer Edition',
      '6 vCPU / 16 GB RAM / 200 GB SSD',
      'Windows Server 2022',
      'HTML5 + Universal Printer',
      'SSO + MFA + Google/MS',
      'NeoMesh VPN + 2FA',
      'Backup diario incluido',
      'Soporte 8x5 (4h SLA)',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Producción crítica',
    icon: Crown,
    color: 'purple',
    accent: 'purple-400',
    price: 499,
    yearlyPrice: 4990,
    badge: 'POWER',
    users: { default: 25, min: 16, max: 100 },
    vm: { cpu: 8, ram: 32, disk: 500 },
    template: 'WIN11-VDI-POWER',
    serviceId: 92,
    license: 'enterprise',
    features: [
      '16+ usuarios (hasta 100)',
      'TSplus Enterprise Edition',
      '8 vCPU / 32 GB RAM / 500 GB SSD',
      'Windows Server 2022 + Load Balancing',
      'Farm Manager + Gateway Portal',
      'PAM + grabación de sesiones',
      'Dominio propio + relay dedicado',
      'SLA 99.9% + soporte 24/7',
      'Onboarding asistido',
    ],
  },
];

// ─── TSplus License Editions ────────────────────────────────────────────────
const TSPLUS_EDITIONS = [
  {
    id: 'system',
    name: 'System Edition',
    desc: 'Acceso RDP web básico, sin impresión universal',
    icon: AppWindow,
    color: 'amber',
    features: ['HTML5 RemoteApp', 'Acceso RDP', 'Hasta 5 usuarios'],
  },
  {
    id: 'printer',
    name: 'Printer Edition',
    desc: 'Incluye Universal Printer para imprimir desde cualquier dispositivo',
    icon: Printer,
    color: 'cyan',
    features: ['Todo de System', 'Universal Printer', 'Driver-less printing'],
  },
  {
    id: 'mobile-web',
    name: 'Mobile Web Edition',
    desc: 'Cliente HTML5 optimizado para móviles + tablet',
    icon: Smartphone,
    color: 'teal',
    features: ['Todo de Printer', 'HTML5 móvil avanzado', 'Touch gestures'],
  },
  {
    id: 'enterprise',
    name: 'Enterprise Edition',
    desc: 'Farm + Load Balancing + Gateway Portal',
    icon: Layers,
    color: 'purple',
    features: ['Todo de Mobile Web', 'Farm Manager', 'Load Balancing', 'Gateway Portal'],
  },
];

// ─── Windows OS Options ─────────────────────────────────────────────────────
const WINDOWS_OS = [
  { id: 'win-server-2022', name: 'Windows Server 2022', desc: 'Recomendado — última versión LTS', recommended: true },
  { id: 'win-server-2019', name: 'Windows Server 2019', desc: 'Estable y ampliamente compatible' },
  { id: 'win-11-pro', name: 'Windows 11 Pro (VDI)', desc: 'Para escritorios virtuales individuales' },
  { id: 'win-10-ltsc', name: 'Windows 10 LTSC', desc: 'Soporte extendido sin actualizaciones forzadas' },
];

// ─── Wizard Steps ───────────────────────────────────────────────────────────
const STEPS = [
  { label: 'Plan', icon: Star },
  { label: 'TSplus', icon: Users },
  { label: 'Infraestructura', icon: Server },
  { label: 'Admin', icon: User },
  { label: 'Pago', icon: CreditCard },
  { label: 'Confirmar', icon: CheckCircle2 },
];

export default function NeoCloudWizard() {
  const navigate = useNavigate();
  const { user, getAuthHeader, isAuthenticated } = useAuth();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  const [config, setConfig] = useState({
    // Step 0: Plan tier
    planId: 'business',
    billing: 'monthly',
    // Step 1: TSplus
    licenseId: 'printer',
    tsplusUsers: 10,
    // Step 2: Infra
    osId: 'win-server-2022',
    cpu: 6,
    ram: 16,
    disk: 200,
    region: 'mx-central-1',
    // Step 3: Admin
    adminName: user?.name || '',
    adminEmail: user?.email || '',
    adminPassword: '',
    companyName: user?.organization || '',
    // Step 4: Payment (mocked)
    cardNumber: '',
    cardExpiry: '',
    cardCvc: '',
    cardName: '',
  });

  const plan = useMemo(() => PLAN_TIERS.find(p => p.id === config.planId), [config.planId]);
  const license = useMemo(() => TSPLUS_EDITIONS.find(l => l.id === config.licenseId), [config.licenseId]);
  const os = useMemo(() => WINDOWS_OS.find(o => o.id === config.osId), [config.osId]);

  // Price calc
  const basePrice = config.billing === 'yearly' ? plan.yearlyPrice : plan.price;
  const extraUsers = Math.max(0, config.tsplusUsers - plan.users.default);
  const extraUserPrice = extraUsers * 12; // $12/extra user
  const totalMonthly = basePrice + extraUserPrice;

  // ─── Step picker logic ─────────────────────────────────────────────────────
  const pickPlan = (planId) => {
    const p = PLAN_TIERS.find(x => x.id === planId);
    setConfig(c => ({
      ...c,
      planId,
      tsplusUsers: p.users.default,
      cpu: p.vm.cpu,
      ram: p.vm.ram,
      disk: p.vm.disk,
      licenseId: p.license,
    }));
  };

  const canNext = () => {
    if (step === 0) return !!config.planId;
    if (step === 1) return config.tsplusUsers >= plan.users.min && config.tsplusUsers <= plan.users.max && !!config.licenseId;
    if (step === 2) return !!config.osId && config.cpu > 0 && config.ram > 0;
    if (step === 3) {
      if (isAuthenticated) return !!config.companyName;
      return config.adminName && config.adminEmail && config.adminPassword?.length >= 8 && config.companyName;
    }
    if (step === 4) return config.cardNumber?.replace(/\s/g, '').length >= 15 && config.cardExpiry && config.cardCvc?.length >= 3 && config.cardName;
    return true;
  };

  // ─── Submit (simulated payment + provisioning) ─────────────────────────────
  const handleSubmit = async () => {
    setLoading(true);
    // Simulate payment ~1.5s
    await new Promise(r => setTimeout(r, 1500));
    try {
      const headers = isAuthenticated ? getAuthHeader() : {};
      const payload = {
        // Plan
        neosc_plan: config.planId,
        billing_period: config.billing,
        // TSplus
        tsplus_license_edition: config.licenseId,
        tsplus_users: config.tsplusUsers,
        tsplus_company_name: config.companyName,
        // Infra (OpenNebula)
        opennebula_template: plan.template,
        opennebula_service_id: plan.serviceId,
        vm_os: config.osId,
        vcpu: config.cpu,
        ram_gb: config.ram,
        disk_gb: config.disk,
        region: config.region,
        // Admin user
        admin_name: config.adminName,
        admin_email: config.adminEmail,
        admin_password: config.adminPassword,
        // Mocked payment
        payment_method: 'card_simulated',
        payment_last4: config.cardNumber.replace(/\s/g, '').slice(-4),
        total_price: totalMonthly,
        // Legacy fields used by provision flow
        workspace_type: 'windows-desktop',
        addons: [],
      };
      const res = await axios.post(`${API}/market/orders`, payload, { headers });
      toast.success('Pago simulado aprobado. Iniciando provisión...');
      navigate(`/market/progress?order_id=${res.data.order_id}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error creando la orden');
    }
    setLoading(false);
  };

  const fmtCard = (v) => v.replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim().slice(0, 19);
  const fmtExpiry = (v) => {
    const digits = v.replace(/\D/g, '');
    if (digits.length <= 2) return digits;
    return digits.slice(0, 2) + '/' + digits.slice(2, 4);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border bg-card/50 sticky top-0 z-10 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/market')} data-testid="back-to-market">
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center">
              <span className="text-white font-bold text-sm">N</span>
            </div>
            <div className="leading-tight">
              <div className="font-semibold text-sm">Neo<span className="text-cyan-400">Cloud</span> Wizard</div>
              <div className="text-[10px] text-muted-foreground">TSplus VDI + OpenNebula</div>
            </div>
          </div>

          {/* Step indicators */}
          <div className="hidden lg:flex items-center gap-1">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const done = i < step;
              const active = i === step;
              return (
                <div key={i} className="flex items-center gap-1">
                  <button
                    onClick={() => i < step && setStep(i)}
                    disabled={i > step}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      active ? 'bg-cyan-500/20 text-cyan-400' :
                      done ? 'bg-emerald-500/10 text-emerald-400 cursor-pointer hover:bg-emerald-500/20' :
                      'text-muted-foreground'
                    }`}
                    data-testid={`step-nav-${i}`}
                  >
                    {done ? <CheckCircle2 className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
                    {s.label}
                  </button>
                  {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground/40" />}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 pb-32">
        {/* ─── STEP 0: PLAN TIER ──────────────────────────────────────────── */}
        {step === 0 && (
          <div className="space-y-8" data-testid="step-plan">
            <div className="text-center max-w-2xl mx-auto">
              <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 mb-3">Paso 1 de 6</Badge>
              <h2 className="text-3xl font-bold">Elige tu suscripción</h2>
              <p className="text-muted-foreground text-sm mt-2">
                Cada plan incluye la VM Windows aprovisionada en OpenNebula + licencias TSplus + acceso HTML5 vía NeoVDI.
              </p>
            </div>

            {/* Billing toggle */}
            <div className="flex justify-center">
              <div className="inline-flex rounded-full border border-border bg-card p-1">
                <button
                  onClick={() => setConfig(c => ({ ...c, billing: 'monthly' }))}
                  className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                    config.billing === 'monthly' ? 'bg-cyan-500 text-black' : 'text-muted-foreground'
                  }`}
                  data-testid="billing-monthly"
                >
                  Mensual
                </button>
                <button
                  onClick={() => setConfig(c => ({ ...c, billing: 'yearly' }))}
                  className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                    config.billing === 'yearly' ? 'bg-cyan-500 text-black' : 'text-muted-foreground'
                  }`}
                  data-testid="billing-yearly"
                >
                  Anual <span className="text-emerald-400 ml-1">-15%</span>
                </button>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-5">
              {PLAN_TIERS.map(p => {
                const Icon = p.icon;
                const selected = config.planId === p.id;
                const displayPrice = config.billing === 'yearly' ? Math.round(p.yearlyPrice / 12) : p.price;
                return (
                  <button
                    key={p.id}
                    onClick={() => pickPlan(p.id)}
                    className={`group relative rounded-2xl border-2 p-1 text-left transition-all overflow-hidden ${
                      selected
                        ? `border-${p.color}-500 shadow-lg shadow-${p.color}-500/20`
                        : 'border-border hover:border-border'
                    }`}
                    data-testid={`tier-${p.id}`}
                  >
                    {/* Gradient header */}
                    <div className={`bg-gradient-to-br ${
                      p.id === 'starter' ? 'from-amber-500 to-orange-600' :
                      p.id === 'business' ? 'from-cyan-500 to-blue-600' :
                      'from-purple-500 to-pink-600'
                    } p-5 rounded-t-xl relative`}>
                      <div className="flex items-start justify-between mb-2">
                        <Icon className="w-7 h-7 text-white" />
                        <Badge className="bg-white/20 text-white border-0 text-[10px]">{p.badge}</Badge>
                      </div>
                      <h3 className="text-2xl font-black text-white">{p.name}</h3>
                      <p className="text-white/80 text-xs">{p.tagline}</p>
                      {p.popular && (
                        <Badge className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-yellow-400 text-black font-bold text-[10px]">
                          MÁS POPULAR
                        </Badge>
                      )}
                    </div>

                    {/* Body */}
                    <div className="bg-card p-5 rounded-b-xl">
                      <div className="mb-4">
                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl font-black">${displayPrice}</span>
                          <span className="text-muted-foreground text-xs">/mes</span>
                        </div>
                        {config.billing === 'yearly' && (
                          <div className="text-[10px] text-emerald-400">Facturado anualmente: ${p.yearlyPrice}</div>
                        )}
                      </div>

                      <div className="space-y-1.5 mb-4">
                        {p.features.map((f, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs">
                            <CheckCircle2 className={`w-3 h-3 text-${p.accent} mt-0.5 flex-shrink-0`} />
                            <span className="text-foreground/80">{f}</span>
                          </div>
                        ))}
                      </div>

                      {selected && (
                        <div className={`text-center text-xs font-bold text-${p.accent} mt-3`}>
                          <CheckCircle2 className="w-4 h-4 inline mr-1" /> Seleccionado
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── STEP 1: TSPLUS LICENSE + USERS ─────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-8 max-w-4xl mx-auto" data-testid="step-tsplus">
            <div className="text-center">
              <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 mb-3">Paso 2 de 6</Badge>
              <h2 className="text-3xl font-bold">Configura TSplus</h2>
              <p className="text-muted-foreground text-sm mt-2">
                Elige la edición de TSplus y cuántos usuarios concurrentes necesitas.
              </p>
            </div>

            {/* Edition picker */}
            <div className="grid md:grid-cols-2 gap-3">
              {TSPLUS_EDITIONS.map(e => {
                const Icon = e.icon;
                const selected = config.licenseId === e.id;
                return (
                  <button
                    key={e.id}
                    onClick={() => setConfig(c => ({ ...c, licenseId: e.id }))}
                    className={`rounded-xl border p-4 text-left transition-all ${
                      selected ? `border-${e.color}-500 bg-${e.color}-500/5 ring-1 ring-${e.color}-500/30` : 'border-border hover:bg-muted/20'
                    }`}
                    data-testid={`license-${e.id}`}
                  >
                    <div className="flex items-start gap-3 mb-2">
                      <div className={`w-10 h-10 rounded-lg bg-${e.color}-500/10 flex items-center justify-center flex-shrink-0`}>
                        <Icon className={`w-5 h-5 text-${e.color}-400`} />
                      </div>
                      <div className="flex-1">
                        <div className="font-bold text-sm">{e.name}</div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{e.desc}</p>
                      </div>
                      {selected && <CheckCircle2 className={`w-4 h-4 text-${e.color}-400 flex-shrink-0`} />}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {e.features.map((f, i) => (
                        <Badge key={i} variant="outline" className="text-[9px] px-1.5 py-0">{f}</Badge>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* User slider */}
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <Label className="text-sm font-bold flex items-center gap-2">
                    <Users className="w-4 h-4 text-cyan-400" /> Usuarios concurrentes TSplus
                  </Label>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Plan {plan.name}: incluye {plan.users.default} usuarios, máx {plan.users.max}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-black text-cyan-400" data-testid="users-count">{config.tsplusUsers}</div>
                  <div className="text-[10px] text-muted-foreground">usuarios</div>
                </div>
              </div>
              <input
                type="range"
                min={plan.users.min}
                max={plan.users.max}
                value={config.tsplusUsers}
                onChange={e => setConfig(c => ({ ...c, tsplusUsers: parseInt(e.target.value) }))}
                className="w-full accent-cyan-500"
                data-testid="users-slider"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>{plan.users.min} mín</span>
                <span>{plan.users.max} máx</span>
              </div>
              {extraUsers > 0 && (
                <div className="mt-3 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs flex items-center justify-between">
                  <span className="text-amber-400">+{extraUsers} usuarios extra</span>
                  <span className="font-bold text-amber-400">+${extraUserPrice}/mes</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── STEP 2: INFRASTRUCTURE ─────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-6 max-w-4xl mx-auto" data-testid="step-infra">
            <div className="text-center">
              <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 mb-3">Paso 3 de 6</Badge>
              <h2 className="text-3xl font-bold">Personaliza la infraestructura</h2>
              <p className="text-muted-foreground text-sm mt-2">
                Tu VM se desplegará en <strong className="text-cyan-400">OpenNebula</strong> con la plantilla{' '}
                <code className="text-[11px] bg-muted px-1.5 py-0.5 rounded">{plan.template}</code> (Service ID {plan.serviceId}).
              </p>
            </div>

            {/* OS Selection */}
            <div className="rounded-xl border border-border bg-card p-5">
              <Label className="text-sm font-bold mb-3 block flex items-center gap-2">
                <Monitor className="w-4 h-4 text-cyan-400" /> Sistema Operativo
              </Label>
              <div className="grid md:grid-cols-2 gap-2">
                {WINDOWS_OS.map(o => {
                  const selected = config.osId === o.id;
                  return (
                    <button
                      key={o.id}
                      onClick={() => setConfig(c => ({ ...c, osId: o.id }))}
                      className={`rounded-lg border p-3 text-left transition-all ${
                        selected ? 'border-cyan-500 bg-cyan-500/5 ring-1 ring-cyan-500/30' : 'border-border hover:bg-muted/20'
                      }`}
                      data-testid={`os-${o.id}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-xs">{o.name}</span>
                        {o.recommended && <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[9px]">Recomendado</Badge>}
                      </div>
                      <p className="text-[10px] text-muted-foreground">{o.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Resources */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-5">
              <Label className="text-sm font-bold flex items-center gap-2">
                <Cpu className="w-4 h-4 text-cyan-400" /> Recursos de la VM
              </Label>
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs flex items-center gap-1 mb-2">
                    <Cpu className="w-3 h-3 text-cyan-400" /> CPU: {config.cpu} vCPU
                  </Label>
                  <input
                    type="range" min={plan.vm.cpu} max={plan.vm.cpu * 2} step={2}
                    value={config.cpu}
                    onChange={e => setConfig(c => ({ ...c, cpu: parseInt(e.target.value) }))}
                    className="w-full accent-cyan-500"
                    data-testid="slider-cpu"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>{plan.vm.cpu}</span>
                    <span>{plan.vm.cpu * 2}</span>
                  </div>
                </div>
                <div>
                  <Label className="text-xs flex items-center gap-1 mb-2">
                    <MemoryStick className="w-3 h-3 text-purple-400" /> RAM: {config.ram} GB
                  </Label>
                  <input
                    type="range" min={plan.vm.ram} max={plan.vm.ram * 2} step={4}
                    value={config.ram}
                    onChange={e => setConfig(c => ({ ...c, ram: parseInt(e.target.value) }))}
                    className="w-full accent-purple-500"
                    data-testid="slider-ram"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>{plan.vm.ram} GB</span>
                    <span>{plan.vm.ram * 2} GB</span>
                  </div>
                </div>
                <div>
                  <Label className="text-xs flex items-center gap-1 mb-2">
                    <HardDrive className="w-3 h-3 text-amber-400" /> Disco: {config.disk} GB
                  </Label>
                  <input
                    type="range" min={plan.vm.disk} max={plan.vm.disk * 2} step={50}
                    value={config.disk}
                    onChange={e => setConfig(c => ({ ...c, disk: parseInt(e.target.value) }))}
                    className="w-full accent-amber-500"
                    data-testid="slider-disk"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>{plan.vm.disk} GB</span>
                    <span>{plan.vm.disk * 2} GB</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Region */}
            <div className="rounded-xl border border-border bg-card p-5">
              <Label className="text-sm font-bold flex items-center gap-2 mb-3">
                <MapPin className="w-4 h-4 text-cyan-400" /> Región / Datacenter
              </Label>
              <select
                value={config.region}
                onChange={e => setConfig(c => ({ ...c, region: e.target.value }))}
                className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm"
                data-testid="region-select"
              >
                <option value="mx-central-1">México Central (CDMX) — Bare metal NeoCloud</option>
                <option value="us-east-1">US East (N. Virginia)</option>
                <option value="us-west-2">US West (Oregon)</option>
                <option value="eu-west-1">Europa (Frankfurt)</option>
              </select>
            </div>
          </div>
        )}

        {/* ─── STEP 3: ADMIN USER ─────────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-6 max-w-xl mx-auto" data-testid="step-admin">
            <div className="text-center">
              <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 mb-3">Paso 4 de 6</Badge>
              <h2 className="text-3xl font-bold">Primer usuario administrador</h2>
              <p className="text-muted-foreground text-sm mt-2">
                Será el dueño de la organización y recibirá credenciales por email para acceder a TSplus y al panel NeoCloud.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-6 space-y-4">
              {isAuthenticated && (
                <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/30 px-3 py-2 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Sesión activa como <strong>{user?.email}</strong>. Se vinculará la organización a tu cuenta.</span>
                </div>
              )}

              <div>
                <Label className="text-xs flex items-center gap-1.5 mb-1.5">
                  <Building2 className="w-3 h-3" /> Nombre de la empresa
                </Label>
                <Input
                  value={config.companyName}
                  onChange={e => setConfig(c => ({ ...c, companyName: e.target.value }))}
                  placeholder="Acme Corp SA de CV"
                  data-testid="input-company"
                />
                <p className="text-[10px] text-muted-foreground mt-1">Se usará para tu organización NeoGuard y subdominio TSplus.</p>
              </div>

              {!isAuthenticated && (
                <>
                  <div>
                    <Label className="text-xs flex items-center gap-1.5 mb-1.5">
                      <User className="w-3 h-3" /> Nombre completo del admin
                    </Label>
                    <Input
                      value={config.adminName}
                      onChange={e => setConfig(c => ({ ...c, adminName: e.target.value }))}
                      placeholder="Juan Pérez"
                      data-testid="input-admin-name"
                    />
                  </div>
                  <div>
                    <Label className="text-xs flex items-center gap-1.5 mb-1.5">
                      <Mail className="w-3 h-3" /> Email del admin
                    </Label>
                    <Input
                      type="email"
                      value={config.adminEmail}
                      onChange={e => setConfig(c => ({ ...c, adminEmail: e.target.value }))}
                      placeholder="juan@acme.com"
                      data-testid="input-admin-email"
                    />
                  </div>
                  <div>
                    <Label className="text-xs flex items-center gap-1.5 mb-1.5">
                      <KeyRound className="w-3 h-3" /> Contraseña (mín 8 caracteres)
                    </Label>
                    <Input
                      type="password"
                      value={config.adminPassword}
                      onChange={e => setConfig(c => ({ ...c, adminPassword: e.target.value }))}
                      placeholder="••••••••"
                      data-testid="input-admin-password"
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ─── STEP 4: PAYMENT (SIMULATED) ────────────────────────────────── */}
        {step === 4 && (
          <div className="space-y-6 max-w-2xl mx-auto" data-testid="step-payment">
            <div className="text-center">
              <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30 mb-3">Paso 5 de 6 — Pago simulado</Badge>
              <h2 className="text-3xl font-bold">Información de pago</h2>
              <p className="text-muted-foreground text-sm mt-2">
                <Lock className="w-3 h-3 inline mr-1" /> Conexión segura. Esto es una <strong className="text-amber-400">simulación</strong> — no se cobrará tu tarjeta.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="md:col-span-2 rounded-xl border border-border bg-card p-6 space-y-4">
                <div>
                  <Label className="text-xs mb-1.5 block">Nombre en la tarjeta</Label>
                  <Input
                    value={config.cardName}
                    onChange={e => setConfig(c => ({ ...c, cardName: e.target.value }))}
                    placeholder="JUAN PEREZ"
                    data-testid="input-card-name"
                  />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Número de tarjeta</Label>
                  <Input
                    value={config.cardNumber}
                    onChange={e => setConfig(c => ({ ...c, cardNumber: fmtCard(e.target.value) }))}
                    placeholder="4242 4242 4242 4242"
                    maxLength={19}
                    data-testid="input-card-number"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">Test card: 4242 4242 4242 4242</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs mb-1.5 block">Expira (MM/AA)</Label>
                    <Input
                      value={config.cardExpiry}
                      onChange={e => setConfig(c => ({ ...c, cardExpiry: fmtExpiry(e.target.value) }))}
                      placeholder="12/28"
                      maxLength={5}
                      data-testid="input-card-expiry"
                    />
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5 block">CVC</Label>
                    <Input
                      value={config.cardCvc}
                      onChange={e => setConfig(c => ({ ...c, cardCvc: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                      placeholder="123"
                      data-testid="input-card-cvc"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-5 space-y-3 h-fit">
                <div className="text-xs font-bold text-cyan-400 uppercase tracking-wider">Resumen</div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Plan {plan.name}</span>
                  <span className="font-bold">${basePrice}</span>
                </div>
                {extraUsers > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">+{extraUsers} usuarios</span>
                    <span className="font-bold">${extraUserPrice}</span>
                  </div>
                )}
                <div className="border-t border-cyan-500/20 pt-3 flex justify-between items-end">
                  <span className="text-xs">Total {config.billing === 'yearly' ? 'anual' : 'mensual'}</span>
                  <span className="text-2xl font-black text-cyan-400">${totalMonthly}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">IVA incluido. Cancela cuando quieras.</div>
              </div>
            </div>
          </div>
        )}

        {/* ─── STEP 5: CONFIRM ────────────────────────────────────────────── */}
        {step === 5 && (
          <div className="space-y-6 max-w-3xl mx-auto" data-testid="step-confirm">
            <div className="text-center">
              <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 mb-3">Paso 6 de 6</Badge>
              <h2 className="text-3xl font-bold">Confirmar y aprovisionar</h2>
              <p className="text-muted-foreground text-sm mt-2">Revisa todos los detalles antes de iniciar la creación de tu workspace.</p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Plan card */}
              <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-400">
                  <Zap className="w-4 h-4" /> Plan
                </div>
                <div className="text-2xl font-black">{plan.name}</div>
                <div className="text-xs text-muted-foreground">
                  Facturación {config.billing === 'yearly' ? 'anual' : 'mensual'} · {plan.template}
                </div>
              </div>

              {/* TSplus card */}
              <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-400">
                  <Users className="w-4 h-4" /> TSplus
                </div>
                <div className="text-2xl font-black">{config.tsplusUsers} usuarios</div>
                <div className="text-xs text-muted-foreground">{license?.name}</div>
              </div>

              {/* Infra card */}
              <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400">
                  <Server className="w-4 h-4" /> Infraestructura
                </div>
                <div className="text-sm font-bold">{os?.name}</div>
                <div className="text-xs text-muted-foreground">
                  {config.cpu} vCPU · {config.ram} GB RAM · {config.disk} GB SSD · {config.region}
                </div>
              </div>

              {/* Admin card */}
              <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
                  <User className="w-4 h-4" /> Administrador
                </div>
                <div className="text-sm font-bold">{isAuthenticated ? user?.name : config.adminName}</div>
                <div className="text-xs text-muted-foreground">{isAuthenticated ? user?.email : config.adminEmail} · {config.companyName}</div>
              </div>
            </div>

            {/* Total */}
            <div className="rounded-2xl border-2 border-cyan-500/40 bg-gradient-to-br from-cyan-500/10 to-purple-500/10 p-6 flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground">Total {config.billing === 'yearly' ? 'anual' : 'mensual'}</div>
                <div className="text-4xl font-black text-cyan-400 mt-1">${totalMonthly}</div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  Cargo a tarjeta •••• {config.cardNumber.replace(/\s/g, '').slice(-4) || '----'}
                </div>
              </div>
              <Button
                onClick={handleSubmit}
                disabled={loading}
                className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold px-8 py-6 text-base gap-2"
                data-testid="confirm-and-pay"
              >
                {loading ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Procesando pago...</>
                ) : (
                  <><CreditCard className="w-5 h-5" /> Pagar y aprovisionar</>
                )}
              </Button>
            </div>

            <p className="text-center text-[10px] text-muted-foreground">
              Al continuar aceptas los términos de servicio. La VM se desplegará vía OpenNebula{' '}
              <code className="bg-muted px-1 rounded">oneflow service-template instantiate {plan.serviceId}</code>.
            </p>
          </div>
        )}
      </div>

      {/* ─── FIXED BOTTOM NAVIGATION ───────────────────────────────────────── */}
      {step < 5 && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-background/95 backdrop-blur z-20">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={() => step > 0 ? setStep(step - 1) : navigate('/market')}
              className="gap-2"
              data-testid="btn-prev"
            >
              <ArrowLeft className="w-4 h-4" /> {step > 0 ? 'Anterior' : 'Volver al Market'}
            </Button>

            {/* Mini summary */}
            <div className="hidden md:flex items-center gap-4 text-xs">
              <span className="text-muted-foreground">Plan:</span>
              <Badge variant="outline" className="font-bold">{plan.name}</Badge>
              <span className="text-muted-foreground">·</span>
              <span className="font-bold text-cyan-400">${totalMonthly}/mes</span>
            </div>

            <Button
              onClick={() => setStep(step + 1)}
              disabled={!canNext()}
              className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold gap-2"
              data-testid="btn-next"
            >
              Siguiente <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
