import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import axios from 'axios';
import {
  Building2, Monitor, DollarSign, ShoppingCart,
  Users, Shield, Activity, Lock, Play, RefreshCw,
  Pause, RotateCcw, AlertTriangle, CheckCircle2,
  Info, XCircle, Cpu, Zap, Trash2, RefreshCcw
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function AdminGlobalPage() {
  const { getAuthHeader } = useAuth();
  const [stats, setStats] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [orchestrator, setOrchestrator] = useState(null);
  const [systemLogs, setSystemLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('tenants');
  // Reconcile Sunset dialog state
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [reconcileRunning, setReconcileRunning] = useState(false);
  const [reconcileResult, setReconcileResult] = useState(null);
  const [reconcileDeleteLegacy, setReconcileDeleteLegacy] = useState(false);
  const [reconcileDryRun, setReconcileDryRun] = useState(true);

  const load = useCallback(async () => {
    try {
      const [statsRes, tenantsRes, orchRes, logsRes] = await Promise.all([
        axios.get(`${API}/admin/global-stats`, { headers: getAuthHeader() }),
        axios.get(`${API}/admin/tenants`, { headers: getAuthHeader() }),
        axios.get(`${API}/admin/orchestrator`, { headers: getAuthHeader() }),
        axios.get(`${API}/admin/system-logs`, { headers: getAuthHeader() }),
      ]);
      setStats(statsRes.data);
      setTenants(tenantsRes.data);
      setOrchestrator(orchRes.data);
      setSystemLogs(logsRes.data);
    } catch (err) {
      if (err.response?.status === 403) {
        toast.error('Acceso denegado: se requiere rol admin');
      }
    }
    setLoading(false);
  }, [getAuthHeader]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh orchestrator every 5s
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await axios.get(`${API}/admin/orchestrator`, { headers: getAuthHeader() });
        setOrchestrator(res.data);
      } catch { /* ignore */ }
    }, 5000);
    return () => clearInterval(interval);
  }, [getAuthHeader]);

  const lockdownTenant = async (tenantId) => {
    try {
      await axios.post(`${API}/admin/tenants/${tenantId}/lockdown`, {}, { headers: getAuthHeader() });
      toast.success('Tenant suspendido');
      load();
    } catch { toast.error('Error al suspender tenant'); }
  };

  const activateTenant = async (tenantId) => {
    try {
      await axios.post(`${API}/admin/tenants/${tenantId}/activate`, {}, { headers: getAuthHeader() });
      toast.success('Tenant activado');
      load();
    } catch { toast.error('Error al activar tenant'); }
  };

  const [workspaces, setWorkspaces] = useState([]);

  useEffect(() => {
    axios.get(`${API}/workspaces`, { headers: getAuthHeader() })
      .then(r => setWorkspaces(Array.isArray(r.data) ? r.data : []))
      .catch(() => {});
  }, [getAuthHeader]);

  const retryOrder = async (orderId) => {
    if (!orderId) { toast.error('Selecciona una orden'); return; }
    try {
      const res = await axios.post(`${API}/admin/orders/${orderId}/retry`, {}, { headers: getAuthHeader() });
      toast.success(`Retry ejecutado (retry #${res.data.retry_count})`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error ejecutando retry');
    }
  };

  const suspendWorkspace = async (wsId) => {
    if (!wsId) return;
    if (!window.confirm('¿Suspender este workspace? Se terminarán las sesiones activas.')) return;
    try {
      const res = await axios.post(`${API}/admin/workspaces/${wsId}/suspend`, {}, { headers: getAuthHeader() });
      toast.success(`Workspace suspendido · ${res.data.killed_sessions} sesión(es) terminada(s)`);
      load();
      axios.get(`${API}/workspaces`, { headers: getAuthHeader() })
        .then(r => setWorkspaces(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al suspender workspace');
    }
  };

  const lockdownFirstActive = () => {
    const candidate = (tenants || []).find(t => t.status !== 'suspended');
    if (!candidate) { toast.warning('No hay tenants para bloquear'); return; }
    if (window.confirm(`Lockdown del tenant "${candidate.name}"?`)) {
      lockdownTenant(candidate.id);
    }
  };

  const runReconcile = async () => {
    setReconcileRunning(true);
    setReconcileResult(null);
    try {
      const res = await axios.post(
        `${API}/admin/sunset/reconcile`,
        { delete_legacy_without_sunset_id: reconcileDeleteLegacy, dry_run: reconcileDryRun },
        { headers: getAuthHeader() },
      );
      setReconcileResult(res.data.result);
      const r = res.data.result;
      toast.success(
        reconcileDryRun
          ? `Dry-run: ${r.deleted.length} candidatos, ${r.legacy_orphans.length} legacy`
          : `Reconcile: ${r.deleted.length} eliminadas, ${r.legacy_orphans.length} legacy`
      );
      if (!reconcileDryRun) load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error reconciliando Sunset');
    } finally {
      setReconcileRunning(false);
    }
  };

  const planColor = (plan) => {
    if (plan === 'Enterprise') return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
    if (plan === 'Business') return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
    return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
  };

  const statusColor = (s) => {
    if (s === 'activo') return 'bg-green-500/10 text-green-400 border-green-500/30';
    if (s === 'trial') return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
    if (s === 'suspended') return 'bg-red-500/10 text-red-400 border-red-500/30';
    return 'bg-muted text-muted-foreground';
  };

  const logIcon = (level) => {
    if (level === 'error') return <XCircle className="w-3.5 h-3.5 text-red-400" />;
    if (level === 'warn') return <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />;
    return <Info className="w-3.5 h-3.5 text-cyan-400" />;
  };

  if (loading) return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:ml-56 p-6 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </main>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="lg:ml-56 p-6">
        <div className="max-w-7xl mx-auto space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold" data-testid="admin-global-title">Admin Global</h1>
              <p className="text-muted-foreground text-sm mt-0.5">Panel de administración de plataforma</p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={load} className="gap-1.5" data-testid="refresh-admin">
                <RefreshCw className="w-3.5 h-3.5" /> Actualizar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setReconcileOpen(true); setReconcileResult(null); }}
                className="gap-1.5 border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                data-testid="reconcile-sunset-btn"
                title="Buscar VMs huérfanas y limpiar Guacamole"
              >
                <RefreshCcw className="w-3.5 h-3.5" /> Reconciliar Sunset
              </Button>
            </div>
          </div>

          {/* KPI Cards */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="admin-kpis">
              <KpiCard icon={Building2} value={stats.active_tenants} label="Tenants activos" color="text-cyan-400" />
              <KpiCard icon={Monitor} value={stats.running_vms} label="VMs corriendo" color="text-green-400" />
              <KpiCard icon={DollarSign} value={`$${stats.mrr.toLocaleString()}`} label="MRR" color="text-orange-400" />
              <KpiCard icon={ShoppingCart} value={stats.active_orders} label="Órdenes activas" color="text-amber-400" />
            </div>
          )}

          {/* Tab Navigation */}
          <div className="flex gap-1 border-b border-border">
            {[
              { key: 'tenants', label: 'Tenants y VMs', icon: Building2 },
              { key: 'orchestrator', label: 'Orquestador', icon: Activity },
              { key: 'logs', label: 'System Logs', icon: AlertTriangle },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                data-testid={`tab-${tab.key}`}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-cyan-500 text-cyan-400'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {activeTab === 'tenants' && (
            <TenantsTable
              tenants={tenants}
              planColor={planColor}
              statusColor={statusColor}
              onLockdown={lockdownTenant}
              onActivate={activateTenant}
            />
          )}

          {activeTab === 'orchestrator' && orchestrator && (
            <OrchestratorPanel
              orchestrator={orchestrator}
              onRetry={retryOrder}
              onSuspend={suspendWorkspace}
              onLockdownFirst={lockdownFirstActive}
              tenants={tenants}
              workspaces={workspaces}
            />
          )}

          {activeTab === 'logs' && (
            <SystemLogsPanel logs={systemLogs} logIcon={logIcon} />
          )}
        </div>
      </main>

      {/* Reconcile Sunset Dialog */}
      <Dialog open={reconcileOpen} onOpenChange={setReconcileOpen}>
        <DialogContent className="max-w-2xl" data-testid="reconcile-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCcw className="w-4 h-4 text-amber-400" /> Reconciliar VMs con Sunset
            </DialogTitle>
            <DialogDescription>
              Reconcilia cada VM del market contra Sunset. Las VMs con <code>sunset_vm_id</code>
              cuya presencia Sunset no confirma serán eliminadas (Mongo + Guacamole).
              Las VMs sin <code>sunset_vm_id</code> (legacy) sólo se listan a menos que actives la opción.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <label className="flex items-start gap-2.5 text-sm cursor-pointer">
              <Checkbox
                checked={reconcileDryRun}
                onCheckedChange={setReconcileDryRun}
                data-testid="reconcile-dry-run"
              />
              <div>
                <div className="font-medium">Dry-run (no elimina nada)</div>
                <div className="text-xs text-muted-foreground">Muestra qué eliminaría sin ejecutar</div>
              </div>
            </label>

            <label className="flex items-start gap-2.5 text-sm cursor-pointer">
              <Checkbox
                checked={reconcileDeleteLegacy}
                onCheckedChange={setReconcileDeleteLegacy}
                data-testid="reconcile-delete-legacy"
              />
              <div>
                <div className="font-medium text-red-400">Eliminar también legacy (sin sunset_vm_id)</div>
                <div className="text-xs text-muted-foreground">
                  Elimina VMs antiguas que nunca se registraron en Sunset. Cascada Guacamole.
                </div>
              </div>
            </label>

            {reconcileResult && (
              <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2 max-h-72 overflow-y-auto"
                   data-testid="reconcile-result">
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div>
                    <div className="text-lg font-black text-cyan-400 font-mono">{reconcileResult.scanned}</div>
                    <div className="text-muted-foreground">Escaneadas</div>
                  </div>
                  <div>
                    <div className="text-lg font-black text-red-400 font-mono">{reconcileResult.deleted.length}</div>
                    <div className="text-muted-foreground">{reconcileResult.dry_run ? 'A eliminar' : 'Eliminadas'}</div>
                  </div>
                  <div>
                    <div className="text-lg font-black text-amber-400 font-mono">{reconcileResult.legacy_orphans.length}</div>
                    <div className="text-muted-foreground">Legacy</div>
                  </div>
                  <div>
                    <div className="text-lg font-black text-green-400 font-mono">{reconcileResult.confirmed_present.length}</div>
                    <div className="text-muted-foreground">Presentes</div>
                  </div>
                </div>

                {reconcileResult.deleted.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs font-bold text-red-400 uppercase tracking-wider">
                      <Trash2 className="inline w-3 h-3 mr-1" />
                      {reconcileResult.dry_run ? 'Se eliminarían' : 'Eliminadas'}
                    </div>
                    {reconcileResult.deleted.map((v, i) => (
                      <div key={i} className="text-xs font-mono flex items-center gap-2">
                        <span className="text-red-400">✕</span>
                        <span className="text-muted-foreground">{v.id}</span>
                        <span>{v.name || '—'}</span>
                        <Badge className="bg-red-500/10 text-red-400 border-red-500/30 text-[9px]">
                          {v.reason}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}

                {reconcileResult.legacy_orphans.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                      <AlertTriangle className="inline w-3 h-3 mr-1" /> Legacy (sin sunset_vm_id)
                    </div>
                    {reconcileResult.legacy_orphans.map((v, i) => (
                      <div key={i} className="text-xs font-mono flex items-center gap-2">
                        <span className="text-amber-400">⚠</span>
                        <span className="text-muted-foreground">{v.id}</span>
                        <span>{v.name || '—'}</span>
                        {v.guacamole_connection_id && (
                          <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[9px]">
                            Guac #{v.guacamole_connection_id}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setReconcileOpen(false)} data-testid="reconcile-cancel">
              Cerrar
            </Button>
            <Button
              onClick={runReconcile}
              disabled={reconcileRunning}
              className={reconcileDryRun ? 'bg-cyan-500 hover:bg-cyan-400 text-black' : 'bg-red-500 hover:bg-red-400 text-white'}
              data-testid="reconcile-run-btn"
            >
              {reconcileRunning ? (
                <><RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" /> Ejecutando...</>
              ) : reconcileDryRun ? (
                <><CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Ejecutar dry-run</>
              ) : (
                <><Trash2 className="w-3.5 h-3.5 mr-1.5" /> Ejecutar reconcile</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Sub-components ── */

function KpiCard({ icon: Icon, value, label, color }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-center">
      <Icon className={`w-5 h-5 mx-auto mb-1.5 ${color}`} />
      <div className={`text-2xl font-black ${color} font-mono`}>{value}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">{label}</div>
    </div>
  );
}

function TenantsTable({ tenants, planColor, statusColor, onLockdown, onActivate }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden" data-testid="tenants-table">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30 text-[10px] text-muted-foreground uppercase tracking-wider">
            <th className="text-left p-3">Empresa</th>
            <th className="p-3">Plan</th>
            <th className="p-3">VMs</th>
            <th className="p-3">Usuarios</th>
            <th className="p-3">MRR</th>
            <th className="p-3">SSO</th>
            <th className="p-3">Estado</th>
            <th className="p-3">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {tenants.map((t) => (
            <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/10 transition-colors">
              <td className="p-3">
                <div className="font-bold text-sm">{t.name}</div>
                <div className="text-xs text-muted-foreground">{t.domain}</div>
              </td>
              <td className="p-3 text-center">
                <Badge className={`text-xs ${planColor(t.plan)}`}>{t.plan}</Badge>
              </td>
              <td className="p-3 text-center font-mono font-bold">{t.vms}</td>
              <td className="p-3 text-center font-mono text-xs">
                {t.users_current}/{t.users_max}
              </td>
              <td className="p-3 text-center font-mono text-green-400 font-bold">
                ${t.mrr}
              </td>
              <td className="p-3 text-center">
                <Badge variant="outline" className="text-[10px]">{t.sso_provider}</Badge>
              </td>
              <td className="p-3 text-center">
                <Badge className={`text-xs ${statusColor(t.status)}`}>{t.status}</Badge>
              </td>
              <td className="p-3 text-center">
                {t.status === 'suspended' ? (
                  <Button size="sm" variant="ghost" onClick={() => onActivate(t.id)} className="text-green-400 hover:text-green-300 h-7 text-xs gap-1">
                    <Play className="w-3 h-3" /> Activar
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => onLockdown(t.id)} className="text-red-400 hover:text-red-300 h-7 text-xs gap-1">
                    <Lock className="w-3 h-3" /> Lockdown
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrchestratorPanel({ orchestrator, onRetry, onSuspend, onLockdownFirst, tenants, workspaces }) {
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedWs, setSelectedWs] = useState('');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Active Orders Queue */}
      <div className="rounded-xl border border-border bg-card p-5" data-testid="orchestrator-queue">
        <h3 className="font-bold flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-cyan-400" />
          Órdenes en proceso
          <Badge className="bg-green-500/10 text-green-400 border-green-500/30 text-[10px] ml-auto">LIVE</Badge>
        </h3>
        <div className="space-y-3">
          {orchestrator.queue.map((item, i) => (
            <button
              key={i}
              onClick={() => setSelectedOrder(item.order_id)}
              className={`w-full text-left rounded-lg border p-3.5 transition-all ${
                selectedOrder === item.order_id ? 'bg-cyan-500/10 border-cyan-500/40' : 'bg-muted/20 border-border hover:bg-muted/30'
              }`}
              data-testid={`order-${item.order_id}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="font-bold text-xs font-mono">{item.order_id}</span>
                  <span className="text-xs text-muted-foreground ml-2">{item.tenant} · {item.plan}</span>
                  {item.is_demo && <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[8px] ml-1.5">DEMO</Badge>}
                </div>
                <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px]">
                  {item.status}
                </Badge>
              </div>
              <div className="w-full h-1.5 bg-muted/50 rounded-full overflow-hidden mb-1.5">
                <div
                  className="h-full bg-amber-400 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (item.step / (item.total_steps || 12)) * 100)}%` }}
                />
              </div>
              <div className="text-[10px] text-muted-foreground font-mono">
                <RefreshCw className="w-2.5 h-2.5 inline mr-1 animate-spin" />
                {item.current_action} — paso {item.step}/{item.total_steps}
              </div>
            </button>
          ))}
          {orchestrator.queue.length === 0 && (
            <div className="text-center text-xs text-muted-foreground py-6">No hay órdenes activas</div>
          )}
        </div>

        {/* Emergency Controls (ahora funcionales) */}
        <div className="mt-4 pt-3 border-t border-border">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Controles de emergencia</div>
          <div className="flex flex-wrap gap-2 items-center">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs text-red-400 border-red-500/30 hover:bg-red-500/10 gap-1"
              onClick={onLockdownFirst}
              disabled={!tenants || tenants.length === 0}
              data-testid="orch-lockdown-btn"
            >
              <Lock className="w-3 h-3" /> Lockdown tenant
            </Button>
            <div className="flex gap-1 items-center">
              <select
                value={selectedWs}
                onChange={e => setSelectedWs(e.target.value)}
                className="h-7 text-[11px] rounded-md border border-border bg-background px-2 max-w-[160px]"
                data-testid="orch-ws-select"
              >
                <option value="">Workspace…</option>
                {(workspaces || []).filter(w => w.status !== 'suspended').map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                disabled={!selectedWs}
                onClick={() => { onSuspend(selectedWs); setSelectedWs(''); }}
                data-testid="orch-suspend-btn"
              >
                <Pause className="w-3 h-3" /> Suspender VM
              </Button>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              disabled={!selectedOrder || selectedOrder.startsWith('DEMO-')}
              onClick={() => onRetry(selectedOrder)}
              data-testid="orch-retry-btn"
              title={selectedOrder ? `Retry ${selectedOrder}` : 'Selecciona una orden arriba'}
            >
              <RotateCcw className="w-3 h-3" /> Retry step
            </Button>
          </div>
        </div>
      </div>

      {/* Workers */}
      <div className="rounded-xl border border-border bg-card p-5" data-testid="orchestrator-workers">
        <h3 className="font-bold flex items-center gap-2 mb-4">
          <Cpu className="w-4 h-4 text-cyan-400" />
          Workers Celery
        </h3>
        <div className="space-y-2">
          {orchestrator.workers.map((w, i) => (
            <div key={i} className="px-3 py-2 rounded-lg bg-muted/20">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-foreground truncate">{w.name}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge className={`text-[10px] ${
                    w.status === 'activo' ? 'bg-green-500/10 text-green-400 border-green-500/30' :
                    w.status === 'idle' ? 'bg-muted text-muted-foreground border-border' :
                    'bg-red-500/10 text-red-400 border-red-500/30'
                  }`}>
                    {w.status}
                  </Badge>
                  <span className="text-xs font-mono text-muted-foreground">
                    {w.tasks > 0 ? <span className="text-amber-400">{w.tasks} {w.tasks > 1 ? 'tareas' : 'tarea'}</span> : 'idle'}
                  </span>
                </div>
              </div>
              {w.current_task && (
                <div className="text-[10px] text-cyan-400/70 font-mono mt-1 truncate">↳ {w.current_task}</div>
              )}
              {w.description && (
                <div className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">{w.description}</div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 pt-3 border-t border-border grid grid-cols-4 gap-2">
          <div className="text-center p-2 rounded-lg bg-muted/20">
            <div className="text-base font-bold text-green-400">{orchestrator.completed_today ?? 0}</div>
            <div className="text-[9px] text-muted-foreground uppercase">Hoy</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/20">
            <div className="text-base font-bold text-amber-400">{orchestrator.active_count ?? 0}</div>
            <div className="text-[9px] text-muted-foreground uppercase">Proc.</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/20">
            <div className="text-base font-bold text-cyan-400">{orchestrator.active_sessions ?? 0}</div>
            <div className="text-[9px] text-muted-foreground uppercase">Sesión</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/20">
            <div className="text-base font-bold text-purple-400">{orchestrator.pending_invites ?? 0}</div>
            <div className="text-[9px] text-muted-foreground uppercase">Invit.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SystemLogsPanel({ logs, logIcon }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden" data-testid="system-logs">
      <div className="max-h-[500px] overflow-y-auto terminal-scroll">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/80 backdrop-blur">
            <tr className="border-b border-border text-[10px] text-muted-foreground uppercase tracking-wider">
              <th className="text-left p-2.5 w-8"></th>
              <th className="text-left p-2.5">Timestamp</th>
              <th className="text-left p-2.5">Source</th>
              <th className="text-left p-2.5">Message</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {logs.map((log, i) => (
              <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/10">
                <td className="p-2.5">{logIcon(log.level)}</td>
                <td className="p-2.5 text-muted-foreground whitespace-nowrap">
                  {log.timestamp ? new Date(log.timestamp).toLocaleString('es-MX', { hour12: false }) : '-'}
                </td>
                <td className="p-2.5">
                  <Badge variant="outline" className="text-[9px] font-mono">{log.source}</Badge>
                </td>
                <td className="p-2.5 text-foreground">{log.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
