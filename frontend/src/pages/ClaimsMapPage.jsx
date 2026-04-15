import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import axios from 'axios';
import {
  Shield, Wifi, Server, RefreshCw, Loader2, CheckCircle2,
  Users, Lock, ChevronRight, Zap, Monitor, Terminal, Globe
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function ClaimsMapPage() {
  const { getAuthHeader } = useAuth();
  const headers = getAuthHeader();

  const [config, setConfig] = useState(null);
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [cfgRes, stateRes] = await Promise.all([
        axios.get(`${API}/claims-map/config`, { headers }),
        axios.get(`${API}/claims-map/state`, { headers }),
      ]);
      setConfig(cfgRes.data);
      setState(stateRes.data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const runSync = async () => {
    setSyncing(true);
    try {
      const res = await axios.post(`${API}/claims-map/sync`, {}, { headers });
      const d = res.data;
      toast.success(`Sync: ${d.zitadel_grants} grants → ${d.netbird_groups_synced?.length || 0} NB groups → ${d.netbird_policies_synced?.length || 0} policies → ${d.user_map?.length || 0} users mapped`);
      loadData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Error sync'); }
    setSyncing(false);
  };

  const roleProtoMap = config?.role_to_netbird_ports || {};
  const roleLxdMap = config?.role_to_lxd_project || {};
  const userMap = state?.user_map || [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="lg:ml-56 p-6">
        <div className="max-w-6xl mx-auto space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="claims-map-title">
                <Shield className="w-6 h-6 text-purple-400" /> Claims Mapping
              </h1>
              <p className="text-muted-foreground text-sm mt-1">
                Zitadel Roles → NetBird Groups/Policies → NeoVDI Groups → LXD Projects
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={loadData} className="gap-1"><RefreshCw className="w-3 h-3" /></Button>
              <Button size="sm" onClick={runSync} disabled={syncing} className="bg-purple-600 hover:bg-purple-500 gap-1" data-testid="run-sync">
                {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                Sync End-to-End
              </Button>
            </div>
          </div>

          {/* Flow Diagram */}
          <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-5">
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {[
                { icon: Shield, label: 'Zitadel', sub: 'Roles + Grants', color: 'purple' },
                { icon: ChevronRight, label: '', color: 'muted' },
                { icon: Wifi, label: 'NetBird', sub: 'Groups + Policies', color: 'green' },
                { icon: ChevronRight, label: '', color: 'muted' },
                { icon: Monitor, label: 'NeoVDI', sub: 'User Groups', color: 'cyan' },
                { icon: ChevronRight, label: '', color: 'muted' },
                { icon: Server, label: 'LXD', sub: 'Project Access', color: 'amber' },
              ].map((step, i) => {
                const Icon = step.icon;
                return step.label ? (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <div className={`w-12 h-12 rounded-xl bg-${step.color}-500/10 flex items-center justify-center`}>
                      <Icon className={`w-6 h-6 text-${step.color}-400`} />
                    </div>
                    <span className="text-xs font-bold">{step.label}</span>
                    <span className="text-[9px] text-muted-foreground">{step.sub}</span>
                  </div>
                ) : (
                  <Icon key={i} className="w-4 h-4 text-muted-foreground mx-1" />
                );
              })}
            </div>
            {state?.synced_at && (
              <div className="text-center mt-3 text-[10px] text-muted-foreground">
                Ultimo sync: {new Date(state.synced_at).toLocaleString()}
              </div>
            )}
          </div>

          {/* Role → Ports + LXD Project Mapping */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border font-bold text-sm flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-400" /> Configuracion de Roles
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-2 px-4 font-medium">Zitadel Role</th>
                    <th className="text-left py-2 px-4 font-medium">NetBird Ports</th>
                    <th className="text-left py-2 px-4 font-medium">LXD Project</th>
                    <th className="text-center py-2 px-4 font-medium">Protocolos</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(roleProtoMap).map(([role, ports]) => {
                    const lxdProj = roleLxdMap[role];
                    const protos = [];
                    if (ports.includes('3389')) protos.push('RDP');
                    if (ports.includes('5901')) protos.push('VNC');
                    if (ports.includes('22')) protos.push('SSH');
                    if (ports.includes('443') || ports.includes('8443')) protos.push('HTML5');
                    if (ports.includes('80') || ports.includes('8080')) protos.push('WEB');
                    return (
                      <tr key={role} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="py-2 px-4 font-mono font-bold text-purple-400">{role}</td>
                        <td className="py-2 px-4">
                          <div className="flex flex-wrap gap-1">
                            {ports.map(p => <Badge key={p} variant="outline" className="text-[8px] px-1 py-0 font-mono">{p}</Badge>)}
                          </div>
                        </td>
                        <td className="py-2 px-4">
                          {lxdProj ? <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[9px]">{lxdProj}</Badge> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="py-2 px-4 text-center">
                          <div className="flex flex-wrap gap-1 justify-center">
                            {protos.map(p => <Badge key={p} className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-[8px]">{p}</Badge>)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* User Map */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border font-bold text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-cyan-400" /> User Access Map ({userMap.length} usuarios)
            </div>
            {loading ? (
              <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></div>
            ) : userMap.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No hay datos. Ejecuta "Sync End-to-End" para mapear los usuarios.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left py-2 px-4 font-medium">Usuario</th>
                      <th className="text-left py-2 px-4 font-medium">Zitadel Roles</th>
                      <th className="text-left py-2 px-4 font-medium">NetBird Groups</th>
                      <th className="text-left py-2 px-4 font-medium">LXD Projects</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userMap.map((u, i) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="py-2 px-4 font-mono text-foreground">{u.email}</td>
                        <td className="py-2 px-4">
                          <div className="flex flex-wrap gap-1">{u.roles.map(r => <Badge key={r} className="bg-purple-500/10 text-purple-400 border-purple-500/30 text-[8px]">{r}</Badge>)}</div>
                        </td>
                        <td className="py-2 px-4">
                          <div className="flex flex-wrap gap-1">{u.netbird_groups.map(g => <Badge key={g} className="bg-green-500/10 text-green-400 border-green-500/30 text-[8px]">{g}</Badge>)}</div>
                        </td>
                        <td className="py-2 px-4">
                          <div className="flex flex-wrap gap-1">
                            {u.lxd_projects.length > 0
                              ? u.lxd_projects.map(p => <Badge key={p} className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[8px]">{p}</Badge>)
                              : <span className="text-muted-foreground">—</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
