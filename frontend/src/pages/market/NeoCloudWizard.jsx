import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import axios from 'axios';
import {
  Monitor, ArrowRight, ArrowLeft, Cloud, CheckCircle2, Loader2,
  AppWindow, Container, Globe, Zap, Shield, Lock, Cpu, MemoryStick,
  HardDrive, Terminal, Layout, Chrome, FileCode, FileSpreadsheet,
  Server, Wifi, ChevronRight, CreditCard
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const WORKSPACE_TYPES = [
  {
    id: 'windows-desktop', name: 'Windows Desktop', desc: 'Escritorio Windows completo con apps pre-instaladas',
    icon: Monitor, color: 'blue', defaults: { cpu: '4', memory: '8GiB', disk: '100GiB', type: 'virtual-machine' },
    apps: ['Office', 'Chrome', 'Teams', 'RDP nativo'],
  },
  {
    id: 'ubuntu-desktop', name: 'Ubuntu Desktop', desc: 'Escritorio Linux con GUI tipo Kasm. LibreOffice, Firefox, Terminal.',
    icon: Layout, color: 'orange', defaults: { cpu: '2', memory: '4GiB', disk: '40GiB', type: 'container' },
    apps: ['LibreOffice', 'Firefox', 'Terminal', 'Files'],
  },
  {
    id: 'browser-kiosk', name: 'Navegador Kiosko', desc: 'Browser aislado para acceso seguro a apps web. Ideal para SaaS.',
    icon: Chrome, color: 'green', defaults: { cpu: '1', memory: '2GiB', disk: '10GiB', type: 'container' },
    apps: ['Chrome/Firefox embebido', 'Modo kiosko', 'Aislamiento total'],
  },
  {
    id: 'vscode-server', name: 'VSCode Server', desc: 'Entorno de desarrollo completo con code-server. Extensiones, terminal, Git.',
    icon: FileCode, color: 'purple', defaults: { cpu: '2', memory: '4GiB', disk: '30GiB', type: 'container' },
    apps: ['code-server', 'Node.js', 'Python', 'Git', 'Docker'],
  },
  {
    id: 'office-suite', name: 'Office Suite', desc: 'LibreOffice + Collabora/OnlyOffice para edicion colaborativa de documentos.',
    icon: FileSpreadsheet, color: 'teal', defaults: { cpu: '2', memory: '4GiB', disk: '20GiB', type: 'container' },
    apps: ['LibreOffice', 'OnlyOffice', 'Collabora', 'PDF viewer'],
  },
  {
    id: 'dev-container', name: 'Dev Container', desc: 'Container Linux con Docker, herramientas de desarrollo y acceso SSH.',
    icon: Terminal, color: 'slate', defaults: { cpu: '4', memory: '8GiB', disk: '50GiB', type: 'container' },
    apps: ['Docker-in-Docker', 'SSH', 'Node/Python/Go', 'Cockpit'],
  },
];

const PLAN_TIERS = [
  {
    id: 'starter', name: 'Starter', price: 29, color: 'amber',
    includes: ['1 workspace', '5 usuarios', 'SSO + MFA', 'HTML5 access', 'Soporte email'],
    limits: { workspaces: 1, users: 5 },
  },
  {
    id: 'plus', name: 'Plus', price: 79, color: 'cyan', popular: true,
    includes: ['5 workspaces', '25 usuarios', 'SSO + MFA + Google/MS', 'HTML5 + NeoProxy', 'NeoMesh VPN', 'Soporte 4h'],
    limits: { workspaces: 5, users: 25 },
  },
  {
    id: 'enterprise', name: 'Enterprise', price: null, color: 'purple',
    includes: ['Workspaces ilimitados', 'Usuarios ilimitados', 'Dominio propio', 'Relay dedicado', 'PAM + grabacion', 'SLA 99.9% + 24/7'],
    limits: { workspaces: 999, users: 999 },
  },
];

const ADDONS_CLOUD = [
  { id: 'netbird', name: 'NeoMesh VPN', desc: 'Conecta tu red local', price: 15, icon: Wifi },
  { id: 'storage-50', name: '+50GB Storage', desc: 'Almacenamiento extra', price: 8, icon: HardDrive },
  { id: 'backup', name: 'Backup diario', desc: 'Snapshots automaticos', price: 15, icon: Server },
  { id: 'sso-google', name: 'SSO Google', desc: 'Login con Google Workspace', price: 10, icon: Shield },
  { id: 'mfa-enforce', name: 'MFA obligatorio', desc: 'Forzar 2FA a todos', price: 5, icon: Lock },
];

export default function NeoCloudWizard() {
  const navigate = useNavigate();
  const { user, getAuthHeader, isAuthenticated } = useAuth();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  const [selected, setSelected] = useState({
    workspace: null,
    plan: 'plus',
    cpu: '2', memory: '4GiB', disk: '40GiB',
    addons: [],
    company: '', email: '', name: '',
  });

  const steps = [
    { label: 'Workspace', icon: Monitor },
    { label: 'Recursos', icon: Cpu },
    { label: 'Plan', icon: Zap },
    { label: 'Cuenta', icon: Shield },
    { label: 'Confirmar', icon: CheckCircle2 },
  ];

  const selectWorkspace = (ws) => {
    setSelected(prev => ({
      ...prev,
      workspace: ws.id,
      cpu: ws.defaults.cpu,
      memory: ws.defaults.memory,
      disk: ws.defaults.disk,
    }));
  };

  const toggleAddon = (id) => {
    setSelected(prev => ({
      ...prev,
      addons: prev.addons.includes(id) ? prev.addons.filter(a => a !== id) : [...prev.addons, id],
    }));
  };

  const currentWs = WORKSPACE_TYPES.find(w => w.id === selected.workspace);
  const currentPlan = PLAN_TIERS.find(p => p.id === selected.plan);
  const addonTotal = selected.addons.reduce((sum, id) => sum + (ADDONS_CLOUD.find(a => a.id === id)?.price || 0), 0);
  const totalPrice = (currentPlan?.price || 0) + addonTotal;

  const canNext = () => {
    if (step === 0) return !!selected.workspace;
    if (step === 3) return isAuthenticated || (selected.email && selected.name);
    return true;
  };

  const handleSubmit = async () => {
    if (!isAuthenticated) {
      toast.error('Inicia sesion primero');
      navigate('/login');
      return;
    }
    setLoading(true);
    try {
      const headers = getAuthHeader();
      const res = await axios.post(`${API}/market/orders`, {
        neosc_plan: selected.plan,
        vcpu: parseInt(selected.cpu) || 2,
        ram_gb: parseInt(selected.memory) || 4,
        disk_gb: parseInt(selected.disk) || 40,
        workspace_type: selected.workspace,
        addons: selected.addons,
        billing_period: 'monthly',
        region: 'bare-metal-mx',
        tsplus_licenses: currentPlan?.limits?.users || 5,
        tsplus_company_name: selected.company || user?.organization || 'NeoCloud',
      }, { headers });
      toast.success('Orden creada');
      navigate(`/market/progress?orderId=${res.data.order_id}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error creando orden');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border bg-card/50">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/market')}>
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">N</span>
            </div>
            <span className="font-semibold">Neo<span className="text-cyan-400">Cloud</span></span>
          </div>
          {/* Step indicators */}
          <div className="hidden md:flex items-center gap-1">
            {steps.map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={i} className="flex items-center gap-1">
                  <button
                    onClick={() => i <= step && setStep(i)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      i === step ? 'bg-cyan-500/20 text-cyan-400' :
                      i < step ? 'bg-emerald-500/10 text-emerald-400' : 'text-muted-foreground'
                    }`}
                  >
                    {i < step ? <CheckCircle2 className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
                    {s.label}
                  </button>
                  {i < steps.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Step 0: Select Workspace Type */}
        {step === 0 && (
          <div className="space-y-6" data-testid="step-workspace">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold">Elige tu tipo de workspace</h2>
              <p className="text-muted-foreground text-sm mt-1">Cada workspace se despliega como container o VM en nuestro cloud</p>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              {WORKSPACE_TYPES.map(ws => {
                const Icon = ws.icon;
                const isSelected = selected.workspace === ws.id;
                return (
                  <button
                    key={ws.id}
                    onClick={() => selectWorkspace(ws)}
                    className={`rounded-xl border p-5 text-left transition-all ${
                      isSelected ? `border-${ws.color}-500/60 bg-${ws.color}-500/5 ring-1 ring-${ws.color}-500/30` : 'border-border hover:border-border hover:bg-muted/20'
                    }`}
                    data-testid={`ws-${ws.id}`}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-10 h-10 rounded-lg bg-${ws.color}-500/10 flex items-center justify-center`}>
                        <Icon className={`w-5 h-5 text-${ws.color}-400`} />
                      </div>
                      <div>
                        <div className="font-bold text-sm">{ws.name}</div>
                        <div className="text-[10px] text-muted-foreground">{ws.defaults.type === 'virtual-machine' ? 'VM' : 'Container LXC'}</div>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">{ws.desc}</p>
                    <div className="flex flex-wrap gap-1">
                      {ws.apps.map((app, i) => (
                        <Badge key={i} variant="outline" className="text-[9px] px-1.5 py-0">{app}</Badge>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 1: Configure Resources */}
        {step === 1 && currentWs && (
          <div className="space-y-6 max-w-2xl mx-auto" data-testid="step-resources">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold">Configura los recursos</h2>
              <p className="text-muted-foreground text-sm mt-1">{currentWs.name} — {currentWs.defaults.type === 'virtual-machine' ? 'Virtual Machine' : 'Container LXC'}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-6 space-y-5">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs flex items-center gap-1"><Cpu className="w-3 h-3 text-cyan-400" /> CPU (cores)</Label>
                  <select value={selected.cpu} onChange={e => setSelected(p => ({...p, cpu: e.target.value}))}
                    className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm mt-1">
                    {['1','2','4','8','16'].map(v => <option key={v} value={v}>{v} vCPU</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs flex items-center gap-1"><MemoryStick className="w-3 h-3 text-purple-400" /> RAM</Label>
                  <select value={selected.memory} onChange={e => setSelected(p => ({...p, memory: e.target.value}))}
                    className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm mt-1">
                    {['1GiB','2GiB','4GiB','8GiB','16GiB','32GiB'].map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs flex items-center gap-1"><HardDrive className="w-3 h-3 text-amber-400" /> Disco</Label>
                  <select value={selected.disk} onChange={e => setSelected(p => ({...p, disk: e.target.value}))}
                    className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm mt-1">
                    {['10GiB','20GiB','40GiB','80GiB','100GiB','200GiB'].map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Addons */}
            <div className="rounded-xl border border-border bg-card p-6 space-y-4">
              <h3 className="font-bold text-sm">Complementos</h3>
              <div className="grid grid-cols-2 gap-2">
                {ADDONS_CLOUD.map(addon => {
                  const Icon = addon.icon;
                  const active = selected.addons.includes(addon.id);
                  return (
                    <button key={addon.id} onClick={() => toggleAddon(addon.id)}
                      className={`flex items-center gap-3 p-3 rounded-lg border text-left text-xs transition-all ${
                        active ? 'border-cyan-500/50 bg-cyan-500/5' : 'border-border hover:bg-muted/20'
                      }`}>
                      <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-cyan-400' : 'text-muted-foreground'}`} />
                      <div className="flex-1">
                        <div className="font-medium">{addon.name}</div>
                        <div className="text-[10px] text-muted-foreground">{addon.desc}</div>
                      </div>
                      <span className="text-cyan-400 font-bold">+${addon.price}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Select Plan */}
        {step === 2 && (
          <div className="space-y-6" data-testid="step-plan">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold">Elige tu plan</h2>
              <p className="text-muted-foreground text-sm mt-1">Todos incluyen SSO, MFA y acceso HTML5</p>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              {PLAN_TIERS.map(plan => {
                const isSelected = selected.plan === plan.id;
                return (
                  <button key={plan.id} onClick={() => setSelected(p => ({...p, plan: plan.id}))}
                    className={`rounded-xl border p-6 text-left transition-all relative ${
                      isSelected ? `border-${plan.color}-500/60 bg-${plan.color}-500/5 ring-1 ring-${plan.color}-500/30` : 'border-border hover:border-border hover:bg-muted/20'
                    }`} data-testid={`plan-${plan.id}`}>
                    {plan.popular && (
                      <Badge className="absolute -top-2.5 right-4 bg-cyan-500 text-black text-[10px] font-bold">Popular</Badge>
                    )}
                    <div className="mb-4">
                      <div className="font-bold text-lg">{plan.name}</div>
                      <div className={`text-2xl font-bold text-${plan.color}-400 mt-1`}>
                        {plan.price ? `$${plan.price}/mes` : 'Contactar'}
                      </div>
                    </div>
                    <div className="space-y-2">
                      {plan.includes.map((feat, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <CheckCircle2 className={`w-3 h-3 text-${plan.color}-400 flex-shrink-0`} />
                          {feat}
                        </div>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 3: Account */}
        {step === 3 && (
          <div className="space-y-6 max-w-lg mx-auto" data-testid="step-account">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold">Tu cuenta</h2>
              <p className="text-muted-foreground text-sm mt-1">
                {isAuthenticated ? `Conectado como ${user?.email}` : 'Crea tu cuenta o inicia sesion'}
              </p>
            </div>
            {isAuthenticated ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6 text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <div className="font-bold">{user?.name}</div>
                <div className="text-sm text-muted-foreground">{user?.email}</div>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card p-6 space-y-4">
                <div>
                  <Label className="text-xs">Nombre completo</Label>
                  <Input value={selected.name} onChange={e => setSelected(p => ({...p, name: e.target.value}))} placeholder="Juan Perez" />
                </div>
                <div>
                  <Label className="text-xs">Email corporativo</Label>
                  <Input type="email" value={selected.email} onChange={e => setSelected(p => ({...p, email: e.target.value}))} placeholder="juan@empresa.com" />
                </div>
                <div>
                  <Label className="text-xs">Empresa</Label>
                  <Input value={selected.company} onChange={e => setSelected(p => ({...p, company: e.target.value}))} placeholder="Mi Empresa SA" />
                </div>
                <Button variant="outline" onClick={() => navigate('/login')} className="w-full gap-2">
                  <Lock className="w-4 h-4" /> O inicia sesion con cuenta existente
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Confirm */}
        {step === 4 && (
          <div className="space-y-6 max-w-lg mx-auto" data-testid="step-confirm">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold">Confirmar pedido</h2>
            </div>
            <div className="rounded-xl border border-border bg-card p-6 space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Workspace</span>
                <span className="font-medium">{currentWs?.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Recursos</span>
                <span className="font-medium">{selected.cpu} CPU / {selected.memory} RAM / {selected.disk}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Plan</span>
                <span className="font-medium">{currentPlan?.name}</span>
              </div>
              {selected.addons.length > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Addons</span>
                  <span className="font-medium">{selected.addons.length} complementos (+${addonTotal}/mes)</span>
                </div>
              )}
              <div className="border-t border-border pt-3 flex justify-between items-center">
                <span className="font-bold">Total mensual</span>
                <span className="text-2xl font-bold text-cyan-400">
                  {currentPlan?.price ? `$${totalPrice}/mes` : 'Contactar ventas'}
                </span>
              </div>
            </div>
            <Button onClick={handleSubmit} disabled={loading}
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-bold py-6 gap-2" data-testid="submit-order">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
              {currentPlan?.price ? 'Proceder al pago' : 'Solicitar cotizacion'}
            </Button>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-10 pt-6 border-t border-border">
          <Button variant="ghost" onClick={() => step > 0 ? setStep(step - 1) : navigate('/market')} className="gap-2">
            <ArrowLeft className="w-4 h-4" /> {step > 0 ? 'Anterior' : 'Volver'}
          </Button>
          {step < 4 && (
            <Button onClick={() => setStep(step + 1)} disabled={!canNext()}
              className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold gap-2" data-testid="next-step">
              Siguiente <ArrowRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
