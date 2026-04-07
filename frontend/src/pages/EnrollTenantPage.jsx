import { useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import axios from 'axios';
import {
  Building2, Shield, Wifi, Key, Globe, CheckCircle2,
  Loader2, AlertTriangle, Play, ChevronRight, XCircle,
  Server, FileText, Lock
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const TIERS = [
  { id: 'starter', label: 'Starter', price: '$29/mes', color: 'border-amber-500/40 bg-amber-500/5', desc: 'VM + NeoDesk (Guacamole HTML5), 5 users' },
  { id: 'plus', label: 'Plus', price: '$79/mes', color: 'border-cyan-500/40 bg-cyan-500/5', desc: 'TSplus existente + NeoProxy + NeoMesh, 25 users' },
  { id: 'enterprise', label: 'Enterprise', price: 'Custom', color: 'border-purple-500/40 bg-purple-500/5', desc: 'B2B delegado + NeoVault + On-prem' },
];

const STEPS = [
  { key: 'zitadel_org', label: 'NeoGuard Tenant', desc: 'Crear proyecto + rol + usuario admin en Zitadel', icon: Shield, color: 'text-purple-400' },
  { key: 'netbird_group', label: 'NeoMesh Grupo', desc: 'Crear grupo aislado en NetBird', icon: Wifi, color: 'text-green-400' },
  { key: 'netbird_setup_key', label: 'NeoMesh Key', desc: 'Generar setup key para nodo', icon: Key, color: 'text-green-400' },
  { key: 'netbird_policy', label: 'NeoMesh Policy', desc: 'Regla de acceso intra-grupo', icon: Lock, color: 'text-green-400' },
  { key: 'register_infra', label: 'Registrar Infra', desc: 'TSplus host / IP del cliente', icon: Server, color: 'text-cyan-400' },
  { key: 'finalize', label: 'Activar Tenant', desc: 'Finalizar enrollment', icon: CheckCircle2, color: 'text-emerald-400' },
];

export default function EnrollTenantPage() {
  const { getAuthHeader } = useAuth();
  const headers = getAuthHeader();

  // Form state
  const [phase, setPhase] = useState('form'); // form | enrolling
  const [form, setForm] = useState({
    org_name: '', slug: '', rfc: '', razon_social: '', email_admin: '',
    tier: 'starter', tsplus_host: '', tsplus_port: 443, tsplus_license: '',
    has_ldap: false, max_users: 5,
  });

  // Enrollment state
  const [tenant, setTenant] = useState(null);
  const [stepResults, setStepResults] = useState({});
  const [runningStep, setRunningStep] = useState(null);

  // Infra form for step 5
  const [infraForm, setInfraForm] = useState({ tsplus_host: '', tsplus_port: 443, tsplus_license: '', connection_type: 'web', has_ldap: false });

  const updateForm = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const startEnrollment = async () => {
    try {
      const res = await axios.post(`${API}/admin/tenants/enroll`, form, { headers });
      setTenant(res.data);
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
        res = await axios.post(`${API}/admin/tenants/${tenant.id}/step/${stepKey}`, infraForm, { headers });
      } else {
        res = await axios.post(`${API}/admin/tenants/${tenant.id}/step/${stepKey.replace(/_/g, '-')}`, {}, { headers });
      }
      setStepResults(prev => ({ ...prev, [stepKey]: res.data }));
      if (res.data.status === 'completed') {
        toast.success(`${stepKey} completado`);
      } else if (res.data.status === 'manual_pending') {
        toast.warning('Requiere configuración manual en Zitadel');
      } else {
        toast.error(res.data.details?.error || 'Error');
      }
      // Refresh tenant data
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
    if (status === 'completed') return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
    if (status === 'manual_pending') return <AlertTriangle className="w-5 h-5 text-amber-400" />;
    if (status === 'error') return <XCircle className="w-5 h-5 text-red-400" />;
    return <div className="w-5 h-5 rounded-full border-2 border-border" />;
  };

  // === FORM PHASE ===
  if (phase === 'form') {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Sidebar />
        <main className="lg:ml-64 p-6">
          <div className="max-w-3xl mx-auto space-y-6">
            <div>
              <h1 className="text-2xl font-bold" data-testid="enroll-title">Enrolar Tenant</h1>
              <p className="text-muted-foreground text-sm mt-1">Workflow de onboarding para nuevos clientes NeoSC</p>
            </div>

            {/* Tier Selection */}
            <div className="space-y-3">
              <Label className="text-sm font-bold">Tier</Label>
              <div className="grid grid-cols-3 gap-3">
                {TIERS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => updateForm('tier', t.id)}
                    data-testid={`tier-${t.id}`}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      form.tier === t.id ? t.color + ' ring-2 ring-offset-2 ring-offset-background ring-cyan-500/50' : 'border-border hover:border-border/80'
                    }`}
                  >
                    <div className="font-bold text-sm">{t.label}</div>
                    <div className="text-lg font-black text-cyan-400">{t.price}</div>
                    <div className="text-[10px] text-muted-foreground mt-1">{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Org Details */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <h2 className="font-bold flex items-center gap-2">
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
                  <Label className="text-xs">Max usuarios</Label>
                  <Input type="number" value={form.max_users} onChange={e => updateForm('max_users', parseInt(e.target.value) || 5)} />
                </div>
              </div>
            </div>

            {/* TSplus Infra (Plus/Enterprise) */}
            {(form.tier === 'plus' || form.tier === 'enterprise') && (
              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-5 space-y-4">
                <h2 className="font-bold flex items-center gap-2">
                  <Server className="w-4 h-4 text-cyan-400" /> Infraestructura TSplus existente
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs">TSplus Host/IP</Label>
                    <Input value={form.tsplus_host} onChange={e => updateForm('tsplus_host', e.target.value)} placeholder="tsplus.miempresa.com" />
                  </div>
                  <div>
                    <Label className="text-xs">Puerto HTML5</Label>
                    <Input type="number" value={form.tsplus_port} onChange={e => updateForm('tsplus_port', parseInt(e.target.value) || 443)} />
                  </div>
                  <div>
                    <Label className="text-xs">Licencia TSplus</Label>
                    <Input value={form.tsplus_license} onChange={e => updateForm('tsplus_license', e.target.value)} placeholder="TSP-XXXX-XXXX" />
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={form.has_ldap} onChange={e => updateForm('has_ldap', e.target.checked)} className="rounded" />
                      Usa LDAP/AD
                    </label>
                  </div>
                </div>
              </div>
            )}

            <Button
              onClick={startEnrollment}
              disabled={!form.org_name || !form.email_admin}
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-bold py-5 gap-2"
              data-testid="start-enrollment"
            >
              <Play className="w-4 h-4" /> Iniciar Enrollment
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // === ENROLLING PHASE ===
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="lg:ml-64 p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold" data-testid="enrollment-title">
                Enrollment: {tenant?.name}
              </h1>
              <p className="text-muted-foreground text-sm mt-1">
                <Badge className={tenant?.status === 'activo' ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'} >
                  {tenant?.status}
                </Badge>
                <span className="ml-2">{tenant?.tier} · {tenant?.domain}</span>
              </p>
            </div>
          </div>

          {/* Steps */}
          <div className="space-y-3" data-testid="enrollment-steps">
            {STEPS.map((step, i) => {
              const status = getStepStatus(step.key);
              const isRunning = runningStep === step.key;
              const result = stepResults[step.key];
              const Icon = step.icon;
              const isDisabled = isRunning || runningStep !== null;

              return (
                <div key={step.key} className={`rounded-xl border bg-card p-5 transition-all ${
                  status === 'completed' ? 'border-emerald-500/30' :
                  status === 'manual_pending' ? 'border-amber-500/30' :
                  status === 'error' ? 'border-red-500/30' :
                  'border-border'
                }`} data-testid={`step-${step.key}`}>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="text-xs font-mono text-muted-foreground w-6">{i + 1}</div>
                      <StatusIcon status={status} />
                      <Icon className={`w-5 h-5 ${step.color}`} />
                      <div>
                        <div className="font-bold text-sm">{step.label}</div>
                        <div className="text-xs text-muted-foreground">{step.desc}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {status === 'completed' && (
                        <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px]">Completado</Badge>
                      )}
                      {status === 'manual_pending' && (
                        <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px]">Manual</Badge>
                      )}
                      {status !== 'completed' && step.key !== 'register_infra' && (
                        <Button
                          size="sm"
                          disabled={isDisabled}
                          onClick={() => runStep(step.key)}
                          className="bg-cyan-500 hover:bg-cyan-400 text-black gap-1 h-8"
                          data-testid={`run-step-${step.key}`}
                        >
                          {isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                          Ejecutar
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Step 5: Infra form inline */}
                  {step.key === 'register_infra' && status !== 'completed' && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <div className="grid grid-cols-3 gap-3 mb-3">
                        <div>
                          <Label className="text-[10px]">TSplus Host</Label>
                          <Input size="sm" value={infraForm.tsplus_host} onChange={e => setInfraForm({...infraForm, tsplus_host: e.target.value})} placeholder="10.0.0.x" className="h-8 text-xs" />
                        </div>
                        <div>
                          <Label className="text-[10px]">Puerto</Label>
                          <Input size="sm" type="number" value={infraForm.tsplus_port} onChange={e => setInfraForm({...infraForm, tsplus_port: parseInt(e.target.value)||443})} className="h-8 text-xs" />
                        </div>
                        <div>
                          <Label className="text-[10px]">Licencia</Label>
                          <Input size="sm" value={infraForm.tsplus_license} onChange={e => setInfraForm({...infraForm, tsplus_license: e.target.value})} placeholder="TSP-XXX" className="h-8 text-xs" />
                        </div>
                      </div>
                      <Button size="sm" disabled={isDisabled} onClick={() => runStep('register_infra')} className="bg-cyan-500 hover:bg-cyan-400 text-black gap-1 h-8" data-testid="run-step-register_infra">
                        {runningStep === 'register_infra' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />} Registrar
                      </Button>
                    </div>
                  )}

                  {/* Result details */}
                  {result?.details && Object.keys(result.details).length > 0 && (
                    <div className="mt-3 p-2 rounded-lg bg-muted/30 font-mono text-[10px] text-muted-foreground">
                      {Object.entries(result.details).map(([k, v]) => (
                        <div key={k}><span className="text-cyan-400">{k}:</span> {String(v).slice(0, 100)}</div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Status */}
          {tenant?.status === 'activo' && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
              <h2 className="text-xl font-bold text-emerald-400">Tenant Activo</h2>
              <p className="text-muted-foreground text-sm mt-1">{tenant.name} · {tenant.domain} · MRR ${tenant.mrr}</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
