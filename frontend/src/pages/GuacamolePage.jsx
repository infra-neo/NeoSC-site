import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import axios from 'axios';
import {
  Monitor, Loader2, Plus, Trash2, ExternalLink, RefreshCw,
  Server, Wifi, CheckCircle2, Container, Users, Shield,
  ChevronRight, ChevronDown, Lock, Key, Eye, EyeOff,
  Play, Globe, Copy, Network
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function GuacamolePage() {
  const { getAuthHeader } = useAuth();
  const headers = getAuthHeader();

  const [status, setStatus] = useState(null);
  const [connections, setConnections] = useState([]);
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState('connections');
  const [showCreate, setShowCreate] = useState(false);
  const [expandedConn, setExpandedConn] = useState(null);
  const [connDetail, setConnDetail] = useState(null);
  const [form, setForm] = useState({ name: '', protocol: 'rdp', hostname: '', port: 3389, username: '', password: '', tenant_id: '' });

  const loadData = async () => {
    setLoading(true);
    try {
      const [statusRes, connRes, usersRes, groupsRes] = await Promise.all([
        axios.get(`${API}/guacamole/status`, { headers }),
        axios.get(`${API}/guacamole/connections`, { headers }).catch(() => ({ data: { connections: [] } })),
        axios.get(`${API}/guacamole/users`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/guacamole/groups`, { headers }).catch(() => ({ data: [] })),
      ]);
      setStatus(statusRes.data);
      setConnections(connRes.data.connections || []);
      setUsers(usersRes.data || []);
      setGroups(groupsRes.data || []);
    } catch { toast.error('Error cargando Guacamole'); }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const loadConnDetail = async (id) => {
    if (expandedConn === id) { setExpandedConn(null); setConnDetail(null); return; }
    setExpandedConn(id);
    try {
      const res = await axios.get(`${API}/guacamole/connections/${id}/detail`, { headers });
      setConnDetail(res.data);
    } catch { toast.error('Error cargando detalle'); }
  };

  const openConnection = async (id) => {
    try {
      const res = await axios.get(`${API}/guacamole/connections/${id}/link`, { headers });
      if (res.data.ok) window.open(res.data.url, '_blank');
      else toast.error('No se pudo generar link');
    } catch { toast.error('Error'); }
  };

  const createConnection = async () => {
    try {
      const payload = { ...form, port: parseInt(form.port) || 3389 };
      const res = await axios.post(`${API}/guacamole/connections`, payload, { headers });
      if (res.data.ok) { toast.success(`Conexion ${form.name} creada`); setShowCreate(false); loadData(); }
      else toast.error(res.data.error || 'Error');
    } catch (err) { toast.error(err.response?.data?.detail || 'Error'); }
  };

  const deleteConnection = async (id) => {
    if (!window.confirm('Eliminar esta conexion?')) return;
    try { await axios.delete(`${API}/guacamole/connections/${id}`, { headers }); toast.success('Eliminada'); loadData(); }
    catch { toast.error('Error'); }
  };

  const syncZitadel = async () => {
    setSyncing(true);
    try {
      const res = await axios.post(`${API}/guacamole/sync-zitadel-groups`, {}, { headers });
      const d = res.data;
      toast.success(`Sync: ${d.groups_created?.length || 0} grupos, ${d.users_synced?.length || 0} usuarios`);
      loadData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Error sync'); }
    setSyncing(false);
  };

  const copyText = (t) => { navigator.clipboard.writeText(t); toast.success('Copiado'); };

  const tabs = [
    { id: 'connections', label: 'Conexiones', icon: Monitor, count: connections.length },
    { id: 'users', label: 'Usuarios', icon: Users, count: users.length },
    { id: 'groups', label: 'Grupos', icon: Shield, count: groups.length },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="lg:ml-56 p-6">
        <div className="max-w-6xl mx-auto space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="guacamole-title">
                <Monitor className="w-6 h-6 text-orange-400" /> NeoDesk — Guacamole
              </h1>
              <p className="text-muted-foreground text-sm mt-1">Gateway HTML5 para RDP, VNC y SSH</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={loadData} className="gap-1" data-testid="refresh-guac">
                <RefreshCw className="w-3 h-3" /> Actualizar
              </Button>
              <Button size="sm" onClick={syncZitadel} disabled={syncing}
                className="bg-purple-600 hover:bg-purple-500 gap-1" data-testid="sync-zitadel">
                {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Shield className="w-3 h-3" />}
                Sync Zitadel
              </Button>
              <Button size="sm" onClick={() => setShowCreate(!showCreate)}
                className="bg-orange-600 hover:bg-orange-500 gap-1" data-testid="new-connection-btn">
                <Plus className="w-3 h-3" /> Nueva conexion
              </Button>
            </div>
          </div>

          {/* Status */}
          <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Server className="w-5 h-5 text-orange-400" />
              <div>
                <div className="font-bold text-sm">Guacamole Server</div>
                <div className="text-xs text-muted-foreground font-mono">{status?.url || 'Cargando...'}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">DS: {status?.datasource}</span>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> :
                status?.connected
                  ? <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">Conectado</Badge>
                  : <Badge className="bg-red-500/10 text-red-400 border-red-500/30">Desconectado</Badge>}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-border">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
                    activeTab === tab.id ? 'border-orange-400 text-orange-400' : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}>
                  <Icon className="w-4 h-4" /> {tab.label}
                  <Badge variant="secondary" className="text-[10px] h-5">{tab.count}</Badge>
                </button>
              );
            })}
          </div>

          {/* Create Form */}
          {showCreate && (
            <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-5 space-y-4" data-testid="create-connection-form">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Plus className="w-4 h-4 text-orange-400" /> Nueva conexion
              </h3>
              <div className="grid grid-cols-3 gap-3">
                <div><Label className="text-xs">Nombre *</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Win-Server-01" className="h-8 text-xs" /></div>
                <div>
                  <Label className="text-xs">Protocolo</Label>
                  <select value={form.protocol} onChange={e => setForm({...form, protocol: e.target.value, port: e.target.value === 'rdp' ? 3389 : e.target.value === 'vnc' ? 5901 : 22})} className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs">
                    <option value="rdp">RDP</option><option value="vnc">VNC</option><option value="ssh">SSH</option>
                  </select>
                </div>
                <div><Label className="text-xs">Host / IP *</Label><Input value={form.hostname} onChange={e => setForm({...form, hostname: e.target.value})} placeholder="10.100.10.152" className="h-8 text-xs" /></div>
                <div><Label className="text-xs">Puerto</Label><Input type="number" value={form.port} onChange={e => setForm({...form, port: e.target.value})} className="h-8 text-xs" /></div>
                <div><Label className="text-xs">Usuario</Label><Input value={form.username} onChange={e => setForm({...form, username: e.target.value})} placeholder="Administrator" className="h-8 text-xs" /></div>
                <div><Label className="text-xs">Password</Label><Input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} className="h-8 text-xs" /></div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={createConnection} disabled={!form.name || !form.hostname} className="bg-orange-600 hover:bg-orange-500 gap-1"><CheckCircle2 className="w-3 h-3" /> Crear</Button>
                <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>Cancelar</Button>
              </div>
            </div>
          )}

          {/* Connections Tab */}
          {activeTab === 'connections' && (
            <div className="space-y-2">
              {connections.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground rounded-xl border border-border bg-card">
                  <Wifi className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                  No hay conexiones. Crea una nueva.
                </div>
              ) : connections.map(conn => (
                <div key={conn.id} className="rounded-xl border border-border bg-card overflow-hidden" data-testid={`conn-${conn.id}`}>
                  <div className="px-4 py-3 flex items-center justify-between hover:bg-muted/20 transition-colors cursor-pointer"
                    onClick={() => loadConnDetail(conn.id)}>
                    <div className="flex items-center gap-3">
                      <Monitor className={`w-5 h-5 ${conn.protocol === 'rdp' ? 'text-blue-400' : conn.protocol === 'vnc' ? 'text-purple-400' : 'text-green-400'}`} />
                      <div>
                        <div className="font-medium text-sm flex items-center gap-2">
                          {conn.name}
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0">{conn.protocol?.toUpperCase()}</Badge>
                          {conn.activeConnections > 0 && (
                            <Badge className="bg-green-500/10 text-green-400 border-green-500/30 text-[9px]">
                              {conn.activeConnections} activa{conn.activeConnections > 1 ? 's' : ''}
                            </Badge>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground">ID: {conn.id} | guacd: {conn.guacd_hostname || 'default'}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={e => { e.stopPropagation(); openConnection(conn.id); }} className="h-7 text-xs gap-1 text-blue-400">
                        <Play className="w-3 h-3" /> Conectar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={e => { e.stopPropagation(); deleteConnection(conn.id); }} className="h-7 text-xs text-red-400 gap-1">
                        <Trash2 className="w-3 h-3" />
                      </Button>
                      {expandedConn === conn.id ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </div>

                  {/* Expanded Detail */}
                  {expandedConn === conn.id && connDetail && (
                    <div className="px-4 py-3 border-t border-border bg-muted/10 space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="rounded-lg bg-card border border-border p-2.5">
                          <div className="text-[10px] text-muted-foreground">Hostname</div>
                          <div className="text-sm font-mono text-foreground flex items-center gap-1">
                            {connDetail.raw_hostname}
                            <button onClick={() => copyText(connDetail.raw_hostname)} className="p-0.5 rounded hover:bg-muted"><Copy className="w-2.5 h-2.5" /></button>
                          </div>
                        </div>
                        <div className="rounded-lg bg-card border border-border p-2.5">
                          <div className="text-[10px] text-muted-foreground">Puerto</div>
                          <div className="text-sm font-mono">{connDetail.raw_port}</div>
                        </div>
                        <div className="rounded-lg bg-card border border-border p-2.5">
                          <div className="text-[10px] text-muted-foreground">Sesiones activas</div>
                          <div className="text-sm font-bold text-green-400">{connDetail.activeConnections}</div>
                        </div>
                        <div className="rounded-lg bg-card border border-border p-2.5">
                          <div className="text-[10px] text-muted-foreground">guacd</div>
                          <div className="text-xs font-mono">{connDetail.attributes?.['guacd-hostname'] || 'default'}:{connDetail.attributes?.['guacd-port'] || '4822'}</div>
                        </div>
                      </div>
                      {connDetail.parameters && (
                        <div>
                          <div className="text-[10px] text-muted-foreground mb-1.5 font-semibold uppercase">Parametros RDP</div>
                          <div className="grid grid-cols-3 md:grid-cols-5 gap-1.5">
                            {Object.entries(connDetail.parameters).filter(([k]) => !['hostname','port','password','username'].includes(k)).map(([k,v]) => (
                              <div key={k} className="flex items-center gap-1 text-[10px]">
                                {v === 'true' ? <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" /> : <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/20 inline-block" />}
                                <span className="text-muted-foreground truncate">{k}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => openConnection(conn.id)} className="bg-blue-600 hover:bg-blue-500 gap-1 h-7 text-xs">
                          <ExternalLink className="w-3 h-3" /> Abrir en Guacamole
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Users Tab */}
          {activeTab === 'users' && (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="divide-y divide-border">
                {users.map(u => (
                  <div key={u.username} className="px-4 py-3 flex items-center justify-between hover:bg-muted/20" data-testid={`guac-user-${u.username}`}>
                    <div className="flex items-center gap-3">
                      <Users className="w-4 h-4 text-cyan-400" />
                      <div>
                        <div className="font-medium text-sm">{u.username}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {u.attributes?.['guac-full-name'] || ''} {u.attributes?.['guac-email-address'] || ''}
                          {u.lastActive && <span className="ml-1">| last: {new Date(u.lastActive).toLocaleString()}</span>}
                        </div>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px]">{u.disabled ? 'Deshabilitado' : 'Activo'}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Groups Tab */}
          {activeTab === 'groups' && (
            <div className="space-y-3">
              {groups.map(g => (
                <div key={g.identifier} className="rounded-xl border border-border bg-card p-4" data-testid={`guac-group-${g.identifier}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-purple-400" />
                      <span className="font-bold text-sm">{g.identifier}</span>
                      <Badge variant="outline" className="text-[10px]">{g.disabled ? 'Deshabilitado' : 'Activo'}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">{g.members?.length || 0} miembros</div>
                  </div>
                  {/* Members */}
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {(g.members || []).map(m => (
                      <Badge key={m} className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-[10px]">
                        <Users className="w-2.5 h-2.5 mr-1" />{m}
                      </Badge>
                    ))}
                  </div>
                  {/* Permissions */}
                  <div className="flex flex-wrap gap-1.5">
                    {(g.permissions?.system || []).map(p => (
                      <Badge key={p} variant="outline" className="text-[9px] text-amber-400 border-amber-500/30">{p}</Badge>
                    ))}
                    {(g.permissions?.connections || []).map(cid => (
                      <Badge key={cid} className="bg-blue-500/10 text-blue-400 border-blue-500/30 text-[9px]">
                        <Monitor className="w-2.5 h-2.5 mr-1" />conn:{cid}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}

              {/* Zitadel sync info */}
              <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4 text-xs text-muted-foreground space-y-2">
                <div className="font-bold text-sm text-foreground flex items-center gap-2">
                  <Shield className="w-4 h-4 text-purple-400" /> Zitadel → Guacamole Sync
                </div>
                <p>El boton "Sync Zitadel" sincroniza roles de proyectos Zitadel como grupos en Guacamole. Por cada rol, crea un grupo <code className="text-purple-400">zitadel-{'{role_key}'}</code> y agrega los usuarios con ese grant.</p>
                <p>Para OIDC claims: configura Guacamole con OpenID Connect apuntando a <code className="text-cyan-400">{'{'}ZITADEL_DOMAIN{'}'}</code> y mapeando el claim <code className="text-cyan-400">groups</code> a Guacamole user groups.</p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
