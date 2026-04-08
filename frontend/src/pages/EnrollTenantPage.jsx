import { useState } from 'react';
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
  Server, Lock, ArrowRight, Network, Monitor
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const STEPS = [
  { key: 'zitadel_org', label: 'NeoGuard SSO', desc: 'Crear proyecto + usuario admin en Zitadel', icon: Shield, color: 'text-purple-400' },
  { key: 'netbird_group', label: 'NeoMesh Grupo', desc: 'Grupo aislado en NetBird', icon: Wifi, color: 'text-green-400' },
  { key: 'netbird_setup_key', label: 'NeoMesh Key', desc: 'Setup key para nodo relay', icon: Key, color: 'text-green-400' },
  { key: 'netbird_policy', label: 'NeoMesh Policy', desc: 'Regla de acceso intra-grupo', icon: Lock, color: 'text-green-400' },
  { key: 'register_infra', label: 'Conectar TSplus', desc: 'Registrar host/IP del cliente', icon: Server, color: 'text-cyan-400' },
  { key: 'finalize', label: 'Activar Tenant', desc: 'Crear workspace y activar', icon: CheckCircle2, color: 'text-emerald-400' },
];

export default function EnrollTenantPage() {
  const { getAuthHeader } = useAuth();
  const navigate = useNavigate();
  const headers = getAuthHeader();

  const [phase, setPhase] = useState('form'); // form | enrolling | done
  const [form, setForm] = useState({
    org_name: '', slug: '', rfc: '', razon_social: '', email_admin: '',
    tier: 'plus', max_users: 5,
    tsplus_host: '', tsplus_port: 443, tsplus_license: '',
    has_ldap: false,
  });

  const [tenant, setTenant] = useState(null);
  const [stepResults, setStepResults] = useState({});
  const [runningStep, setRunningStep] = useState(null);
  const [infraForm, setInfraForm] = useState({ tsplus_host: '', tsplus_port: 443, tsplus_license: '', connection_type: 'web', has_ldap: false });

  const updateForm = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const startEnrollment = async () => {
    try {
      const res = await axios.post(`${API}/admin/tenants/enroll`, form, { headers });
      setTenant(res.data);
      // Pre-fill infra form with data from initial form
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
      toast.success(`Tenant ${res.data.name} creado. Ejecuta los pasos.`);
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
        res = await axios.post(`${API}/admin/tenants/${tenant.id}/step/${stepKey.replace(/_/g, '-')}`, {}, { headers });
      }
      setStepResults(prev => ({ ...prev, [stepKey]: res.data }));
      if (res.data.status === 'completed') {
        toast.success(`${stepKey} completado`);
        if (stepKey === 'finalize') setPhase('done');
      } else if (res.data.status === 'manual_pending') {
        toast.warning('Requiere configuración manual en Zitadel');
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

  const getStepStatus = (stepKey) => {
    if (tenant?.enrollment_steps?.[stepKey]) return tenant.enrollment_steps[stepKey];
    if (stepResults[stepKey]) return stepResults[stepKey].status;
    return 'pending';
  };

  const StatusIcon = ({ status }) => {
    if (status === 'completed') return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
    if (status === 'manual_pending') return <AlertTriangle className="w-4 h-4 text-amber-400" />;
    if (status === 'error') return <XCircle className="w-4 h-4 text-red-400" />;
    return <div className="w-4 h-4 rounded-full border-2 border-border" />;
  };

  // === FORM PHASE: Collect client data ===
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
                <Network className="w-4 h-4 text-cyan-400" /> ¿Cómo funciona?
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="flex items-start gap-2">
                  <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-purple-400 font-bold text-[10px]">1</span>
                  </div>
                  <div>
                    <div className="font-medium">NeoGuard SSO</div>
                    <div className="text-muted-foreground">Login seguro con Zitadel antes de acceder a TSplus</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-green-400 font-bold text-[10px]">2</span>
                  </div>
                  <div>
                    <div className="font-medium">NeoMesh VPN</div>
                    <div className="text-muted-foreground">NetBird relay conecta NeoSC con tu infra sin abrir puertos</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-6 h-6 rounded-full bg-cyan-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-cyan-400 font-bold text-[10px]">3</span>
                  </div>
                  <div>
                    <div className="font-medium">Acceso HTML5</div>
                    <div className="text-muted-foreground">Tus usuarios acceden desde navegador con SSO + MFA</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Organization */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <h2 className="font-bold flex items-center gap-2 text-sm">
                <Building2 className="w-4 h-4 text-cyan-400" /> Datos de la organización
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
                  <Label className="text-xs">Razón Social</Label>
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
                Ingresa los datos de tu servidor TSplus. NeoSC se conectará vía NetBird relay para proteger el acceso.
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
          <div className="max-w-3xl mx-auto">
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-8 text-center space-y-4">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
              <h2 className="text-2xl font-bold text-emerald-400">Tenant Conectado</h2>
              <p className="text-muted-foreground text-sm">
                {tenant?.name} ya está protegido con NeoSC.
                El workspace fue creado y aparece en tu lista.
              </p>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>Dominio: <span className="text-foreground">{tenant?.domain}</span></div>
                <div>Tier: <span className="text-foreground">{tenant?.tier}</span></div>
                <div>MRR: <span className="text-cyan-400">${tenant?.mrr}/mes</span></div>
              </div>
              <Button
                onClick={() => navigate('/workspaces')}
                className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold gap-2"
                data-testid="go-workspaces"
              >
                <Monitor className="w-4 h-4" /> Ir a Workspaces
              </Button>
            </div>
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
          <div>
            <h1 className="text-xl font-bold" data-testid="enrollment-title">
              Conectando: {tenant?.name}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30">{tenant?.status}</Badge>
              <span className="ml-2">{tenant?.domain}</span>
            </p>
          </div>

          {/* Steps */}
          <div className="space-y-2" data-testid="enrollment-steps">
            {STEPS.map((step, i) => {
              const status = getStepStatus(step.key);
              const isRunning = runningStep === step.key;
              const result = stepResults[step.key];
              const Icon = step.icon;
              const isDisabled = isRunning || runningStep !== null;

              return (
                <div key={step.key} className={`rounded-xl border bg-card p-4 transition-all ${
                  status === 'completed' ? 'border-emerald-500/30' :
                  status === 'manual_pending' ? 'border-amber-500/30' :
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
                      {status === 'manual_pending' && (
                        <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px]">Manual</Badge>
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

                  {/* Step 5: Infra form */}
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
                        <div key={k}><span className="text-cyan-400">{k}:</span> {String(v).slice(0, 100)}</div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
