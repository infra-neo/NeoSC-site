import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import axios from 'axios';
import {
  Building2, Shield, Wifi, Key, Globe, CheckCircle2,
  Loader2, AlertTriangle, Play, XCircle,
  Server, Lock, ArrowRight, Network, Monitor,
  Download, Terminal, Zap, Container, Copy, ExternalLink
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const STEPS = [
  { key: 'zitadel_org', label: 'NeoGuard SSO', desc: 'Proyecto + Roles + App OIDC + Usuario admin en Zitadel', icon: Shield, color: 'text-purple-400' },
  { key: 'netbird_group', label: 'NeoMesh Grupo', desc: 'Grupo aislado en NetBird', icon: Wifi, color: 'text-green-400' },
  { key: 'netbird_setup_key', label: 'NeoMesh Key', desc: 'Setup key para nodo relay', icon: Key, color: 'text-green-400' },
  { key: 'netbird_policy', label: 'NeoMesh Policy', desc: 'Regla de acceso intra-grupo', icon: Lock, color: 'text-green-400' },
  { key: 'deploy_relay', label: 'NeoConnect Relay', desc: 'Container Linux con NetBird como puente', icon: Container, color: 'text-blue-400' },
  { key: 'register_infra', label: 'Conectar TSplus', desc: 'Registrar host/IP del cliente', icon: Server, color: 'text-cyan-400' },
  { key: 'finalize', label: 'Activar Tenant', desc: 'Crear workspace y activar', icon: CheckCircle2, color: 'text-emerald-400' },
];

export default function EnrollTenantPage() {
  const { getAuthHeader } = useAuth();
  const navigate = useNavigate();
  const headers = getAuthHeader();

  const [phase, setPhase] = useState('form');
  const [form, setForm] = useState({
    org_name: '', slug: '', rfc: '', razon_social: '', email_admin: '',
    tier: 'plus', max_users: 5,
    tsplus_host: '', tsplus_port: 443, tsplus_license: '',
    has_ldap: false,
  });

  const [tenant, setTenant] = useState(null);
  const [stepResults, setStepResults] = useState({});
  const [runningStep, setRunningStep] = useState(null);
  const [autoRunning, setAutoRunning] = useState(false);
  const [infraForm, setInfraForm] = useState({ tsplus_host: '', tsplus_port: 443, tsplus_license: '', connection_type: 'web', has_ldap: false });
  const [neoconnectInfo, setNeoconnectInfo] = useState(null);

  const updateForm = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const startEnrollment = async () => {
    try {
      const res = await axios.post(`${API}/admin/tenants/enroll`, form, { headers });
      setTenant(res.data);
      if (form.tsplus_host) {
        setInfraForm({
          tsplus_host: form.tsplus_host,
          tsplus_port: form.tsplus_port,
          tsplus_license: form.tsplus_license,
          connection_type: 'web',
          has_ldap: form.has_ldap,
        });
      }
      setPhase('enrolling');
      toast.success(`Tenant ${res.data.name} creado`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al crear tenant');
    }
  };

  const runStep = async (stepKey) => {
    if (!tenant) return;
    setRunningStep(stepKey);
    try {
      let res;
      if (stepKey === 'register_infra') {
        res = await axios.post(`${API}/admin/tenants/${tenant.id}/step/register-infra`, infraForm, { headers });
      } else {
        const apiStep = stepKey.replace(/_/g, '-');
        res = await axios.post(`${API}/admin/tenants/${tenant.id}/step/${apiStep}`, {}, { headers });
      }
      setStepResults(prev => ({ ...prev, [stepKey]: res.data }));
      if (res.data.status === 'completed') {
        toast.success(`${stepKey} completado`);
        if (stepKey === 'finalize') setPhase('done');
      } else {
        toast.error(res.data.details?.error || 'Error');
      }
      const tenantRes = await axios.get(`${API}/admin/tenants/${tenant.id}/enrollment-status`, { headers });
      setTenant(tenantRes.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error en paso');
      setStepResults(prev => ({ ...prev, [stepKey]: { status: 'error', details: { error: err.message } } }));
    }
    setRunningStep(null);
  };

  const runAutoProvision = async () => {
    if (!tenant) return;
    setAutoRunning(true);
    try {
      const res = await axios.post(`${API}/admin/tenants/${tenant.id}/auto-provision`, {}, { headers });
      const data = res.data;
      if (data.steps) {
        Object.entries(data.steps).forEach(([key, val]) => {
          const dbKey = key.replace(/-/g, '_');
          setStepResults(prev => ({ ...prev, [dbKey]: val }));
        });
      }
      toast.success(data.auto_provision === 'completed' ? 'Auto-provisioning completado' : 'Parcialmente completado');
      const tenantRes = await axios.get(`${API}/admin/tenants/${tenant.id}/enrollment-status`, { headers });
      setTenant(tenantRes.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error en auto-provisioning');
    }
    setAutoRunning(false);
  };

  const loadNeoconnectInfo = async () => {
    if (!tenant) return;
    try {
      const res = await axios.get(`${API}/admin/tenants/${tenant.id}/neoconnect-info`, { headers });
      setNeoconnectInfo(res.data);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (tenant && phase === 'enrolling') loadNeoconnectInfo();
  }, [tenant, phase]);

  const getStepStatus = (stepKey) => {
    if (tenant?.enrollment_steps?.[stepKey]) return tenant.enrollment_steps[stepKey];
    if (stepResults[stepKey]) return stepResults[stepKey].status;
    return 'pending';
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado al portapapeles');
  };

  const StatusIcon = ({ status }) => {
    if (status === 'completed') return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
    if (status === 'skipped') return <CheckCircle2 className="w-4 h-4 text-slate-400" />;
    if (status === 'error') return <XCircle className="w-4 h-4 text-red-400" />;
    return <div className="w-4 h-4 rounded-full border-2 border-border" />;
  };

  // === FORM PHASE ===
  if (phase === 'form') {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Sidebar />
        <main className="lg:ml-56 p-6">
          <div className="max-w-3xl mx-auto space-y-6">
            <div>
              <h1 className="text-2xl font-bold" data-testid="enroll-title">Conectar NeoSC</h1>
              <p className="text-muted-foreground text-sm mt-1">
                Protege tu ambiente TSplus existente con NeoGuard SSO + NeoMesh VPN
              </p>
            </div>

            {/* How it works */}
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-5">
              <h3 className="font-bold text-sm flex items-center gap-2 mb-3">
                <Network className="w-4 h-4 text-cyan-400" /> ¿Como funciona NeoConnect?
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                {[
                  { num: '1', color: 'purple', icon: Shield, title: 'NeoGuard SSO', desc: 'Proyecto Zitadel + Roles + OIDC App automatico' },
                  { num: '2', color: 'green', icon: Wifi, title: 'NeoMesh VPN', desc: 'NetBird grupo + setup key + policy automatico' },
                  { num: '3', color: 'blue', icon: Container, title: 'Relay Container', desc: 'Container Linux LXD con NetBird como puente' },
                  { num: '4', color: 'cyan', icon: Monitor, title: 'Acceso HTML5', desc: 'Guacamole RDP/VNC o TSplus via navegador' },
                ].map(item => (
                  <div key={item.num} className="flex items-start gap-2">
                    <div className={`w-6 h-6 rounded-full bg-${item.color}-500/20 flex items-center justify-center flex-shrink-0 mt-0.5`}>
                      <span className={`text-${item.color}-400 font-bold text-[10px]`}>{item.num}</span>
                    </div>
                    <div>
                      <div className="font-medium">{item.title}</div>
                      <div className="text-muted-foreground">{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Organization */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <h2 className="font-bold flex items-center gap-2 text-sm">
                <Building2 className="w-4 h-4 text-cyan-400" /> Datos de la organizacion
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Nombre empresa *</Label>
                  <Input value={form.org_name} onChange={e => updateForm('org_name', e.target.value)} placeholder="Mi Empresa SA" data-testid="enroll-org-name" />
                </div>
                <div>
                  <Label className="text-xs">Slug</Label>
                  <Input value={form.slug} onChange={e => updateForm('slug', e.target.value)} placeholder="mi-empresa (auto)" />
                </div>
                <div>
                  <Label className="text-xs">RFC</Label>
                  <Input value={form.rfc} onChange={e => updateForm('rfc', e.target.value)} placeholder="XAXX010101000" />
                </div>
                <div>
                  <Label className="text-xs">Razon Social</Label>
                  <Input value={form.razon_social} onChange={e => updateForm('razon_social', e.target.value)} placeholder="Mi Empresa SA de CV" />
                </div>
                <div>
                  <Label className="text-xs">Email admin *</Label>
                  <Input type="email" value={form.email_admin} onChange={e => updateForm('email_admin', e.target.value)} placeholder="admin@miempresa.com" data-testid="enroll-email" />
                </div>
                <div>
                  <Label className="text-xs">Usuarios TSplus</Label>
                  <Input type="number" value={form.max_users} onChange={e => updateForm('max_users', parseInt(e.target.value) || 5)} />
                </div>
              </div>
            </div>

            {/* TSplus Infrastructure */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <h2 className="font-bold flex items-center gap-2 text-sm">
                <Server className="w-4 h-4 text-cyan-400" /> Tu infraestructura TSplus
              </h2>
              <p className="text-xs text-muted-foreground">
                Ingresa los datos de tu servidor TSplus. NeoSC se conectara via NetBird relay sin abrir puertos.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">TSplus Host / IP *</Label>
                  <Input value={form.tsplus_host} onChange={e => updateForm('tsplus_host', e.target.value)} placeholder="10.100.10.152 o tsplus.miempresa.com" data-testid="enroll-tsplus-host" />
                </div>
                <div>
                  <Label className="text-xs">Puerto HTML5</Label>
                  <Input type="number" value={form.tsplus_port} onChange={e => updateForm('tsplus_port', parseInt(e.target.value) || 443)} />
                </div>
                <div>
                  <Label className="text-xs">Licencia TSplus</Label>
                  <Input value={form.tsplus_license} onChange={e => updateForm('tsplus_license', e.target.value)} placeholder="TSP-XXXX-XXXX" data-testid="enroll-tsplus-license" />
                </div>
                <div className="flex items-end gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.has_ldap} onChange={e => updateForm('has_ldap', e.target.checked)} className="rounded" />
                    Usa LDAP/AD
                  </label>
                </div>
              </div>
            </div>

            <Button
              onClick={startEnrollment}
              disabled={!form.org_name || !form.email_admin || !form.tsplus_host}
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-bold py-5 gap-2"
              data-testid="start-enrollment"
            >
              <Play className="w-4 h-4" /> Iniciar Enrollment <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // === DONE PHASE ===
  if (phase === 'done' || tenant?.status === 'activo') {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Sidebar />
        <main className="lg:ml-56 p-6">
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-8 text-center space-y-4">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
              <h2 className="text-2xl font-bold text-emerald-400">Tenant Conectado</h2>
              <p className="text-muted-foreground text-sm">
                {tenant?.name} ya esta protegido con NeoSC.
              </p>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>Dominio: <span className="text-foreground">{tenant?.domain}</span></div>
                <div>Tier: <span className="text-foreground">{tenant?.tier}</span></div>
                <div>MRR: <span className="text-cyan-400">${tenant?.mrr}/mes</span></div>
                {tenant?.zitadel_client_id && (
                  <div>OIDC Client ID: <span className="text-purple-400 font-mono">{tenant.zitadel_client_id}</span></div>
                )}
              </div>
              <div className="flex gap-3 justify-center">
                <Button
                  onClick={() => navigate('/workspaces')}
                  className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold gap-2"
                  data-testid="go-workspaces"
                >
                  <Monitor className="w-4 h-4" /> Ir a Workspaces
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate('/admin/lxd')}
                  className="gap-2"
                >
                  <Container className="w-4 h-4" /> Ver Containers
                </Button>
              </div>
            </div>

            {/* NeoConnect Downloads */}
            {neoconnectInfo && neoconnectInfo.setup_key && (
              <NeoConnectPanel info={neoconnectInfo} onCopy={copyToClipboard} />
            )}
          </div>
        </main>
      </div>
    );
  }

  // === ENROLLING PHASE ===
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="lg:ml-56 p-6">
        <div className="max-w-3xl mx-auto space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold" data-testid="enrollment-title">
                Conectando: {tenant?.name}
              </h1>
              <p className="text-muted-foreground text-sm mt-1">
                <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30">{tenant?.status}</Badge>
                <span className="ml-2">{tenant?.domain}</span>
              </p>
            </div>
            <Button
              onClick={runAutoProvision}
              disabled={autoRunning}
              className="bg-purple-600 hover:bg-purple-500 text-white gap-2"
              data-testid="auto-provision-btn"
            >
              {autoRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Auto-Provisionar
            </Button>
          </div>

          {/* Steps */}
          <div className="space-y-2" data-testid="enrollment-steps">
            {STEPS.map((step, i) => {
              const status = getStepStatus(step.key);
              const isRunning = runningStep === step.key;
              const result = stepResults[step.key];
              const Icon = step.icon;
              const isDisabled = isRunning || runningStep !== null || autoRunning;

              return (
                <div key={step.key} className={`rounded-xl border bg-card p-4 transition-all ${
                  status === 'completed' ? 'border-emerald-500/30' :
                  status === 'error' ? 'border-red-500/30' :
                  'border-border'
                }`} data-testid={`step-${step.key}`}>
                  <div className="flex items-center gap-3">
                    <div className="text-xs font-mono text-muted-foreground w-5">{i + 1}</div>
                    <StatusIcon status={status} />
                    <Icon className={`w-4 h-4 ${step.color}`} />
                    <div className="flex-1">
                      <div className="font-bold text-sm">{step.label}</div>
                      <div className="text-[11px] text-muted-foreground">{step.desc}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {status === 'completed' && (
                        <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px]">OK</Badge>
                      )}
                      {status !== 'completed' && step.key !== 'register_infra' && (
                        <Button
                          size="sm"
                          disabled={isDisabled}
                          onClick={() => runStep(step.key)}
                          className="bg-cyan-500 hover:bg-cyan-400 text-black gap-1 h-7 text-xs"
                          data-testid={`run-step-${step.key}`}
                        >
                          {isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                          Ejecutar
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Step: Register Infra form */}
                  {step.key === 'register_infra' && status !== 'completed' && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <div className="grid grid-cols-3 gap-2 mb-2">
                        <div>
                          <Label className="text-[10px]">TSplus Host</Label>
                          <Input value={infraForm.tsplus_host} onChange={e => setInfraForm({...infraForm, tsplus_host: e.target.value})} placeholder="10.0.0.x" className="h-7 text-xs" />
                        </div>
                        <div>
                          <Label className="text-[10px]">Puerto</Label>
                          <Input type="number" value={infraForm.tsplus_port} onChange={e => setInfraForm({...infraForm, tsplus_port: parseInt(e.target.value)||443})} className="h-7 text-xs" />
                        </div>
                        <div>
                          <Label className="text-[10px]">Licencia</Label>
                          <Input value={infraForm.tsplus_license} onChange={e => setInfraForm({...infraForm, tsplus_license: e.target.value})} placeholder="TSP-XXX" className="h-7 text-xs" />
                        </div>
                      </div>
                      <Button size="sm" disabled={isDisabled} onClick={() => runStep('register_infra')} className="bg-cyan-500 hover:bg-cyan-400 text-black gap-1 h-7 text-xs" data-testid="run-step-register_infra">
                        {runningStep === 'register_infra' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />} Registrar
                      </Button>
                    </div>
                  )}

                  {/* Result details */}
                  {result?.details && Object.keys(result.details).length > 0 && (
                    <div className="mt-2 p-2 rounded-lg bg-muted/30 font-mono text-[10px] text-muted-foreground">
                      {Object.entries(result.details).map(([k, v]) => (
                        <div key={k}><span className="text-cyan-400">{k}:</span> {typeof v === 'object' ? JSON.stringify(v) : String(v).slice(0, 120)}</div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* NeoConnect Panel - shown after setup key is ready */}
          {neoconnectInfo && neoconnectInfo.setup_key && (
            <NeoConnectPanel info={neoconnectInfo} onCopy={copyToClipboard} />
          )}
        </div>
      </main>
    </div>
  );
}

function NeoConnectPanel({ info, onCopy }) {
  const [activeTab, setActiveTab] = useState('windows');
  if (!info || !info.setup_key) return null;

  const tabs = [
    { key: 'windows', label: 'Windows', icon: Monitor },
    { key: 'linux', label: 'Linux', icon: Terminal },
    { key: 'docker', label: 'Docker', icon: Container },
  ];

  return (
    <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-5 space-y-4" data-testid="neoconnect-panel">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm flex items-center gap-2">
          <Download className="w-4 h-4 text-blue-400" /> NeoConnect - Instalar en cliente
        </h3>
        <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/30 text-[10px]">
          {info.relay_status === 'deployed' ? 'Relay activo' : 'Setup Key lista'}
        </Badge>
      </div>

      <div className="flex gap-1">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === tab.key ? 'bg-blue-500/20 text-blue-300' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-3 h-3" /> {tab.label}
            </button>
          );
        })}
      </div>

      <div className="space-y-3">
        {activeTab === 'windows' && (
          <>
            <div className="text-xs text-muted-foreground">
              Descarga el instalador de NetBird para Windows y ejecuta el siguiente comando:
            </div>
            <a
              href={info.downloads?.windows?.exe_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all"
              data-testid="download-windows"
            >
              <Download className="w-3 h-3" /> Descargar NetBird.exe
              <ExternalLink className="w-3 h-3" />
            </a>
            <div className="relative">
              <pre className="p-3 rounded-lg bg-black/40 text-[11px] text-green-400 font-mono overflow-x-auto">
                {info.downloads?.windows?.instructions}
              </pre>
              <button onClick={() => onCopy(info.downloads?.windows?.instructions)} className="absolute top-2 right-2 p-1 rounded bg-white/10 hover:bg-white/20">
                <Copy className="w-3 h-3 text-white" />
              </button>
            </div>
          </>
        )}

        {activeTab === 'linux' && (
          <>
            <div className="text-xs text-muted-foreground">
              Ejecuta este script en la terminal del servidor Linux donde esta TSplus:
            </div>
            <div className="relative">
              <pre className="p-3 rounded-lg bg-black/40 text-[11px] text-green-400 font-mono overflow-x-auto whitespace-pre-wrap">
                {info.downloads?.linux?.script}
              </pre>
              <button onClick={() => onCopy(info.downloads?.linux?.script)} className="absolute top-2 right-2 p-1 rounded bg-white/10 hover:bg-white/20">
                <Copy className="w-3 h-3 text-white" />
              </button>
            </div>
          </>
        )}

        {activeTab === 'docker' && (
          <>
            <div className="text-xs text-muted-foreground">
              Despliega NetBird como contenedor Docker:
            </div>
            <div className="relative">
              <pre className="p-3 rounded-lg bg-black/40 text-[11px] text-green-400 font-mono overflow-x-auto whitespace-pre-wrap">
                {info.downloads?.docker?.run}
              </pre>
              <button onClick={() => onCopy(info.downloads?.docker?.run)} className="absolute top-2 right-2 p-1 rounded bg-white/10 hover:bg-white/20">
                <Copy className="w-3 h-3 text-white" />
              </button>
            </div>
          </>
        )}

        <div className="flex items-center gap-2 text-[10px] text-muted-foreground pt-2 border-t border-border">
          <Key className="w-3 h-3 text-green-400" />
          <span>Setup Key: <code className="text-green-400">{info.setup_key}</code></span>
          <button onClick={() => onCopy(info.setup_key)} className="p-0.5 rounded hover:bg-white/10">
            <Copy className="w-2.5 h-2.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
