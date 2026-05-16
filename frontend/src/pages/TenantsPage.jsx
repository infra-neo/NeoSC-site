import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import {
  Building2, Users, Server, Plus, Lock, Pause, RefreshCw, Settings, CheckCircle2, Shield,
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function TenantsPage() {
  const { getAuthHeader, user } = useAuth();
  const navigate = useNavigate();
  const [tenants, setTenants] = useState([]);
  const [myTenant, setMyTenant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [plan, setPlan] = useState('starter');
  const [creating, setCreating] = useState(false);

  const headers = getAuthHeader();

  const load = async () => {
    setLoading(true);
    try {
      const [tRes, mRes] = await Promise.all([
        axios.get(`${API}/tenants`, { headers }),
        axios.get(`${API}/tenants/me`, { headers }),
      ]);
      setTenants(tRes.data.tenants || []);
      setMyTenant(mRes.data);
    } catch (err) {
      toast.error('Error cargando tenants');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!name.trim()) { toast.error('Nombre requerido'); return; }
    setCreating(true);
    try {
      await axios.post(`${API}/tenants`, { name, plan }, { headers });
      toast.success(`Tenant "${name}" creado`);
      setName(''); setPlan('starter'); setShowCreate(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error');
    }
    setCreating(false);
  };

  const lockdown = async (t) => {
    if (!window.confirm(`¿Lockdown del tenant "${t.name}"? Se terminarán todas las sesiones activas.`)) return;
    try {
      const res = await axios.post(`${API}/tenants/${t.id}/lockdown`, {}, { headers });
      toast.success(`Lockdown ejecutado · ${res.data.killed_sessions} sesión(es) terminada(s)`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error en lockdown');
    }
  };

  const setStatus = async (t, status) => {
    try {
      await axios.put(`${API}/tenants/${t.id}`, { status }, { headers });
      toast.success(`Estado actualizado a "${status}"`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error');
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="lg:ml-56 p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-black flex items-center gap-2">
                <Building2 className="w-6 h-6 text-cyan-400" /> Tenants
              </h1>
              <p className="text-xs text-muted-foreground mt-1">
                Cada tenant aisla usuarios, workspaces, sesiones y logs. Tu tenant actual: <span className="font-mono text-cyan-400">{myTenant?.name}</span>
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={load} className="gap-1" data-testid="tenants-refresh">
                <RefreshCw className="w-3 h-3" /> Refresh
              </Button>
              <Button size="sm" onClick={() => setShowCreate(true)} className="bg-cyan-500 hover:bg-cyan-400 text-black gap-1" data-testid="tenants-create-btn">
                <Plus className="w-3 h-3" /> Nuevo tenant
              </Button>
            </div>
          </div>

          {/* My tenant card */}
          {myTenant && (
            <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-500/5 to-purple-500/5 p-6" data-testid="my-tenant-card">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className="bg-cyan-500/15 text-cyan-300 border-cyan-500/40 text-[10px]">TU TENANT</Badge>
                    <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px] uppercase">{myTenant.status}</Badge>
                    <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/30 text-[10px] uppercase">{myTenant.plan}</Badge>
                  </div>
                  <h2 className="text-xl font-black">{myTenant.name}</h2>
                  <p className="text-[11px] text-muted-foreground font-mono">{myTenant.slug} · {myTenant.id}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {[
                  { label: 'Usuarios', value: myTenant.counters?.users, icon: Users, color: 'text-cyan-400' },
                  { label: 'Workspaces', value: myTenant.counters?.workspaces, icon: Server, color: 'text-amber-400' },
                  { label: 'Apps', value: myTenant.counters?.applications, icon: Server, color: 'text-purple-400' },
                  { label: 'Sesiones', value: myTenant.counters?.active_sessions, icon: CheckCircle2, color: 'text-emerald-400' },
                  { label: 'Audit logs', value: myTenant.counters?.audit_logs, icon: Shield, color: 'text-zinc-400' },
                ].map(c => {
                  const Icon = c.icon;
                  return (
                    <div key={c.label} className="rounded-lg bg-muted/20 border border-border p-3 text-center">
                      <Icon className={`w-4 h-4 mx-auto mb-1 ${c.color}`} />
                      <div className="text-xl font-black">{c.value ?? '-'}</div>
                      <div className="text-[10px] text-muted-foreground uppercase">{c.label}</div>
                    </div>
                  );
                })}
              </div>
              {myTenant.zitadel_org_id && (
                <div className="mt-3 pt-3 border-t border-border text-[10px] text-muted-foreground font-mono">
                  NeoGuard Org: <span className="text-cyan-400">{myTenant.zitadel_org_id}</span>
                  {' · '}Project: <span className="text-cyan-400">{myTenant.zitadel_project_id}</span>
                </div>
              )}
            </div>
          )}

          {/* All tenants list */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="font-bold text-sm mb-3">Todos los tenants ({tenants.length})</h3>
            {loading && <p className="text-xs text-muted-foreground text-center py-6">Cargando...</p>}
            {!loading && tenants.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">Sin tenants</p>}
            <div className="space-y-2">
              {tenants.map(t => {
                const isMine = t.id === myTenant?.id;
                return (
                  <div key={t.id} className={`flex items-center gap-3 p-3 rounded-lg border ${
                    isMine ? 'bg-cyan-500/5 border-cyan-500/30' : 'bg-muted/10 border-border'
                  }`} data-testid={`tenant-row-${t.slug}`}>
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center font-black text-sm text-white flex-shrink-0">
                      {t.name[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">{t.name}</span>
                        {isMine && <Badge className="bg-cyan-500/15 text-cyan-300 border-cyan-500/40 text-[9px]">TU</Badge>}
                        <Badge className={`text-[9px] uppercase ${
                          t.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                          t.status === 'suspended' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
                          'bg-red-500/10 text-red-400 border-red-500/30'
                        }`}>{t.status}</Badge>
                        <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/30 text-[9px] uppercase">{t.plan}</Badge>
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono">
                        {t.slug} · {t.counters?.users || 0} users · {t.counters?.workspaces || 0} workspaces
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {t.status === 'active' && (
                        <Button size="sm" variant="outline" onClick={() => setStatus(t, 'suspended')}
                          className="h-7 text-xs gap-1 text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
                          data-testid={`tenant-suspend-${t.slug}`}>
                          <Pause className="w-3 h-3" /> Suspender
                        </Button>
                      )}
                      {t.status === 'suspended' && (
                        <Button size="sm" variant="outline" onClick={() => setStatus(t, 'active')}
                          className="h-7 text-xs gap-1 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                          data-testid={`tenant-activate-${t.slug}`}>
                          <CheckCircle2 className="w-3 h-3" /> Activar
                        </Button>
                      )}
                      {t.status !== 'lockdown' && !isMine && (
                        <Button size="sm" variant="outline" onClick={() => lockdown(t)}
                          className="h-7 text-xs gap-1 text-red-400 border-red-500/30 hover:bg-red-500/10"
                          data-testid={`tenant-lockdown-${t.slug}`}>
                          <Lock className="w-3 h-3" /> Lockdown
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" disabled>
                        <Settings className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      {/* Create tenant modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-card border border-border rounded-2xl max-w-md w-full p-5 space-y-4" onClick={e => e.stopPropagation()} data-testid="tenant-create-modal">
            <h3 className="font-bold flex items-center gap-2"><Building2 className="w-4 h-4 text-cyan-400" /> Nuevo tenant</h3>
            <div>
              <Label className="text-[10px]">Nombre</Label>
              <Input value={name} onChange={e => setName(e.target.value)} className="h-9 text-sm" placeholder="Acme Corp" data-testid="tenant-name-input" />
            </div>
            <div>
              <Label className="text-[10px]">Plan</Label>
              <select value={plan} onChange={e => setPlan(e.target.value)} className="w-full h-9 rounded-md border border-border bg-background px-2 text-xs" data-testid="tenant-plan-select">
                <option value="starter">Starter</option>
                <option value="business">Business</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>Cancelar</Button>
              <Button size="sm" onClick={create} disabled={creating || !name} className="bg-cyan-500 hover:bg-cyan-400 text-black gap-1" data-testid="tenant-create-submit">
                {creating ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} Crear
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
