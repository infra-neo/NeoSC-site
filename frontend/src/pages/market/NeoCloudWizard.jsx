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
  Server, Monitor, Building2, User, Mail, KeyRound, AlertCircle,
  Zap, MapPin
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

// ─── TSplus License Options (single product: Remote Enterprise Access, 14-day trial) ────
const TSPLUS_LICENSE_OPTIONS = [
  { value: 3,    label: '3 usuarios',  description: 'Equipos muy pequeños' },
  { value: 5,    label: '5 usuarios',  description: 'Equipos pequeños' },
  { value: 10,   label: '10 usuarios', description: 'Equipos medianos' },
  { value: 15,   label: '15 usuarios', description: 'Equipos en crecimiento' },
  { value: 25,   label: '25 usuarios', description: 'Equipos grandes' },
  { value: 9999, label: 'Ilimitada',   description: 'Sin límite de usuarios' },
];

// ─── VM Resource Combos (CPU/RAM/Disk + allowed user counts) ───────────────
// Rules:
//   2 vCPU /  4 GB ·  50 GB disk → only 3 users (basic)
//   4 vCPU /  8 GB ·  50 GB disk → 3, 5 users
//   8 vCPU / 16 GB · 100 GB disk → 3, 5, 10, 15 users
//  16 vCPU / 32 GB · 100 GB disk → any (3-unlimited)
const VM_COMBOS = [
  { id: 'xs',  cpu: 2,  ram: 4,  disk: 50,  allowed: [3],                        label: 'XS · Básico',     desc: '2 vCPU · 4 GB RAM · 50 GB SSD' },
  { id: 's',   cpu: 4,  ram: 8,  disk: 50,  allowed: [3, 5],                     label: 'S · Pequeño',     desc: '4 vCPU · 8 GB RAM · 50 GB SSD' },
  { id: 'm',   cpu: 8,  ram: 16, disk: 100, allowed: [3, 5, 10, 15],             label: 'M · Mediano',     desc: '8 vCPU · 16 GB RAM · 100 GB SSD' },
  { id: 'l',   cpu: 16, ram: 32, disk: 100, allowed: [3, 5, 10, 15, 25, 9999],   label: 'L · Grande',      desc: '16 vCPU · 32 GB RAM · 100 GB SSD' },
];

// ─── Windows OS Options ─────────────────────────────────────────────────────
const WINDOWS_OS = [
  { id: 'win-server-2025', name: 'Windows Server 2025', desc: 'Última versión LTS — recomendado', recommended: true },
  { id: 'win-server-2022', name: 'Windows Server 2022', desc: 'Estable y ampliamente compatible' },
  { id: 'win-11',          name: 'Windows 11 Pro VDI',  desc: 'Para escritorios individuales' },
  { id: 'win-10',          name: 'Windows 10 LTSC',     desc: 'Soporte extendido sin updates forzados' },
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
    // Step 1: TSplus (only license count — product is always "Remote Enterprise Access")
    tsplusUsers: 10,
    // Step 2: Infra (VM combo + OS)
    vmComboId: 'm',
    osId: 'win-server-2025',
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
  const vmCombo = useMemo(() => VM_COMBOS.find(v => v.id === config.vmComboId), [config.vmComboId]);
  const os = useMemo(() => WINDOWS_OS.find(o => o.id === config.osId), [config.osId]);
  // Allowed VM combos for the currently selected number of users
  const allowedCombos = useMemo(
    () => VM_COMBOS.filter(v => v.allowed.includes(config.tsplusUsers)),
    [config.tsplusUsers]
  );

  // Price calc
  const basePrice = config.billing === 'yearly' ? plan.yearlyPrice : plan.price;
  const extraUsers = Math.max(0, config.tsplusUsers - plan.users.default);
  const extraUserPrice = extraUsers * 12; // $12/extra user (after trial)
  const totalMonthly = basePrice + extraUserPrice;

  // ─── Step picker logic ─────────────────────────────────────────────────────
  const pickPlan = (planId) => {
    const p = PLAN_TIERS.find(x => x.id === planId);
    // Pick a sensible VM combo for the plan's default user count
    const fallbackCombo = VM_COMBOS.find(v => v.allowed.includes(p.users.default))?.id || 'm';
    setConfig(c => ({
      ...c,
      planId,
      tsplusUsers: p.users.default,
      vmComboId: fallbackCombo,
    }));
  };

  // Auto-correct VM combo if current selection is no longer valid for the chosen users
  const onChangeUsers = (newUsers) => {
    setConfig(c => {
      const currentValid = VM_COMBOS.find(v => v.id === c.vmComboId)?.allowed.includes(newUsers);
      const newCombo = currentValid ? c.vmComboId : VM_COMBOS.find(v => v.allowed.includes(newUsers))?.id || 'l';
      return { ...c, tsplusUsers: newUsers, vmComboId: newCombo };
    });
  };

  const canNext = () => {
    if (step === 0) return !!config.planId;
    if (step === 1) return TSPLUS_LICENSE_OPTIONS.some(o => o.value === config.tsplusUsers);
    if (step === 2) return !!config.osId && !!vmCombo && vmCombo.allowed.includes(config.tsplusUsers);
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
      // Use OpenCloud Marketplace instantiate endpoint (real OpenNebula + NetBird polling)
      const payload = {
        vm_name: undefined, // backend autogenerates NEOSC-VDI-XXXX
        cpu: vmCombo.cpu,
        memory: vmCombo.ram * 1024,  // backend expects MB
        tsplus_users: config.tsplusUsers,
        company_name: config.companyName,
        admin_email: config.adminEmail,
        admin_name: config.adminName,
        billing_period: config.billing,
      };
      const res = await axios.post(
        `${API}/market/templates/${plan.serviceId === 84 ? 12 : (plan.serviceId === 92 ? 16 : 14)}/instantiate`,
        payload,
        { headers }
      );
      toast.success('Pago simulado aprobado. Iniciando provisión real en OpenNebula...');
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

        {/* ─── STEP 1: TSPLUS — Remote Enterprise Access (single product, 14-day trial) ── */}
        {step === 1 && (
          <div className="space-y-6 max-w-3xl mx-auto" data-testid="step-tsplus">
            <div className="text-center">
              <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 mb-3">Paso 2 de 6</Badge>
              <h2 className="text-3xl font-bold">Licencias TSplus</h2>
              <p className="text-muted-foreground text-sm mt-2">
                Selecciona la cantidad de usuarios concurrentes. Las primeras <strong className="text-cyan-400">14 días son de prueba gratuita</strong>.
              </p>
            </div>

            {/* Product banner */}
            <div className="rounded-2xl border-2 border-cyan-500/40 bg-gradient-to-br from-cyan-500/10 to-purple-500/10 p-6">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center flex-shrink-0">
                  <Crown className="w-7 h-7 text-white" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="text-lg font-black">TSplus Remote Enterprise Access</h3>
                    <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/40 text-[10px]">
                      14 días gratis
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Acceso HTML5, Universal Printer, Farm Manager, Load Balancing y Gateway Portal incluidos.
                    Después del periodo de prueba se activa la suscripción con tu número de licencias o se cancela el servicio.
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {['HTML5 RemoteApp', 'Universal Printer', 'Farm Manager', 'Load Balancing', 'Gateway Portal', 'Mobile Web'].map((f, i) => (
                      <Badge key={i} variant="outline" className="text-[9px] px-1.5 py-0">{f}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* License count picker — fixed options ONLY */}
            <div className="rounded-xl border border-border bg-card p-5">
              <Label className="text-sm font-bold flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-cyan-400" /> Cantidad de licencias
              </Label>
              <p className="text-[11px] text-muted-foreground mb-4">
                Solo se permiten estas cantidades. La elección define qué tamaños de VM están disponibles en el siguiente paso.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                {TSPLUS_LICENSE_OPTIONS.map(opt => {
                  const selected = config.tsplusUsers === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => onChangeUsers(opt.value)}
                      className={`rounded-xl border p-3 text-left transition-all relative ${
                        selected
                          ? 'border-cyan-500 bg-cyan-500/10 ring-2 ring-cyan-500/30'
                          : 'border-border hover:bg-muted/20'
                      }`}
                      data-testid={`license-count-${opt.value}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-2xl font-black">{opt.value === 9999 ? '∞' : opt.value}</span>
                        {selected && <CheckCircle2 className="w-5 h-5 text-cyan-400" />}
                      </div>
                      <div className="text-xs font-bold mt-1">{opt.label}</div>
                      <div className="text-[10px] text-muted-foreground">{opt.description}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Trial info */}
            <div className="rounded-lg bg-amber-500/5 border border-amber-500/30 px-4 py-3 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-amber-300">
                <strong>Modelo de cobro:</strong> 14 días de prueba gratuita. Después se activa el cargo mensual según las licencias elegidas, o el servicio se cancela automáticamente.
              </div>
            </div>
          </div>
        )}

        {/* ─── STEP 2: INFRASTRUCTURE (VM combo + OS) ─────────────────────── */}
        {step === 2 && (
          <div className="space-y-6 max-w-4xl mx-auto" data-testid="step-infra">
            <div className="text-center">
              <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 mb-3">Paso 3 de 6</Badge>
              <h2 className="text-3xl font-bold">Infraestructura de la VM</h2>
              <p className="text-muted-foreground text-sm mt-2">
                Para <strong className="text-cyan-400">{config.tsplusUsers === 9999 ? 'usuarios ilimitados' : `${config.tsplusUsers} usuarios`}</strong> solo se permiten estas combinaciones:
              </p>
            </div>

            {/* VM Combo picker */}
            <div className="rounded-xl border border-border bg-card p-5">
              <Label className="text-sm font-bold flex items-center gap-2 mb-3">
                <Server className="w-4 h-4 text-cyan-400" /> Tamaño de la VM
              </Label>
              <div className="grid md:grid-cols-2 gap-3">
                {VM_COMBOS.map(combo => {
                  const isAllowed = combo.allowed.includes(config.tsplusUsers);
                  const selected = config.vmComboId === combo.id;
                  return (
                    <button
                      key={combo.id}
                      onClick={() => isAllowed && setConfig(c => ({ ...c, vmComboId: combo.id }))}
                      disabled={!isAllowed}
                      className={`rounded-xl border p-4 text-left transition-all relative ${
                        !isAllowed
                          ? 'border-border/30 bg-muted/10 opacity-40 cursor-not-allowed'
                          : selected
                          ? 'border-cyan-500 bg-cyan-500/5 ring-2 ring-cyan-500/30'
                          : 'border-border hover:bg-muted/20'
                      }`}
                      data-testid={`vm-combo-${combo.id}`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="font-bold text-sm">{combo.label}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">{combo.desc}</div>
                        </div>
                        {selected && <CheckCircle2 className="w-5 h-5 text-cyan-400 flex-shrink-0" />}
                        {!isAllowed && <Lock className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                      </div>
                      <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground mt-2 pt-2 border-t border-border/30">
                        <div className="flex items-center gap-1"><Cpu className="w-3 h-3 text-cyan-400" /> {combo.cpu} vCPU</div>
                        <div className="flex items-center gap-1"><MemoryStick className="w-3 h-3 text-purple-400" /> {combo.ram} GB</div>
                        <div className="flex items-center gap-1"><HardDrive className="w-3 h-3 text-amber-400" /> {combo.disk} GB SSD</div>
                      </div>
                      {!isAllowed && (
                        <div className="mt-2 text-[10px] text-amber-400">
                          No disponible para {config.tsplusUsers === 9999 ? 'usuarios ilimitados' : `${config.tsplusUsers} usuarios`}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              {allowedCombos.length === 0 && (
                <div className="mt-3 rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-400">
                  <AlertCircle className="w-3.5 h-3.5 inline mr-1" />
                  No hay combinaciones válidas. Vuelve al paso anterior y ajusta el número de licencias.
                </div>
              )}
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
                <div className="text-2xl font-black">{config.tsplusUsers === 9999 ? 'Ilimitada' : `${config.tsplusUsers} usuarios`}</div>
                <div className="text-xs text-muted-foreground">Remote Enterprise Access · 14 días gratis</div>
              </div>

              {/* Infra card */}
              <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400">
                  <Server className="w-4 h-4" /> Infraestructura
                </div>
                <div className="text-sm font-bold">{os?.name}</div>
                <div className="text-xs text-muted-foreground">
                  {vmCombo?.cpu} vCPU · {vmCombo?.ram} GB RAM · {vmCombo?.disk} GB SSD · {config.region}
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
