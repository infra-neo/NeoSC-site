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
  ChevronRight, ChevronDown, Lock, Copy, Play,
  Globe, Terminal, FileCode, Layout, Database, FileText,
  Zap, Settings, UserCheck, UserX
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const ICON_MAP = { monitor: Monitor, layout: Layout, code: FileCode, database: Database, globe: Globe, terminal: Terminal, lock: Lock, 'file-text': FileText };
const PROTOCOLS = ['rdp', 'vnc', 'ssh', 'html5', 'web'];
const PROTO_COLORS = { rdp: 'blue', vnc: 'purple', ssh: 'green', html5: 'cyan', web: 'amber' };

export default function GuacamolePage() {
  const { getAuthHeader } = useAuth();
  const headers = getAuthHeader();

  const [status, setStatus] = useState(null);
  const [connections, setConnections] = useState([]);
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [apps, setApps] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [installing, setInstalling] = useState(null);
  const [activeTab, setActiveTab] = useState('connections');
  const [showCreate, setShowCreate] = useState(false);
  const [expandedConn, setExpandedConn] = useState(null);
  const [connDetail, setConnDetail] = useState(null);
  const [oidcConfig, setOidcConfig] = useState(null);
  const [assignModal, setAssignModal] = useState(null); // {resource_id, resource_name, resource_type, protocols}
  const [assignGroup, setAssignGroup] = useState('');
  const [assignProtos, setAssignProtos] = useState([]);
  const [assignHostname, setAssignHostname] = useState('');
  const [assignPort, setAssignPort] = useState(0);
  const [editingAccess, setEditingAccess] = useState(null); // assignment object
  const [form, setForm] = useState({ name: '', protocol: 'rdp', hostname: '', port: 3389, username: '', password: '' });

  const loadData = async () => {
    setLoading(true);
    try {
      const [statusRes, connRes, usersRes, groupsRes, appsRes, assignRes] = await Promise.all([
        axios.get(`${API}/guacamole/status`, { headers }),
        axios.get(`${API}/guacamole/connections`, { headers }).catch(() => ({ data: { connections: [] } })),
        axios.get(`${API}/guacamole/users`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/guacamole/groups`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/apps/catalog`, { headers }).catch(() => ({ data: { apps: [] } })),
        axios.get(`${API}/workspace-assignments`, { headers }).catch(() => ({ data: { assignments: [] } })),
      ]);
      setStatus(statusRes.data);
      setConnections(connRes.data.connections || []);
      setUsers(usersRes.data || []);
      setGroups(groupsRes.data || []);
      setApps(appsRes.data.apps || []);
      setAssignments(assignRes.data.assignments || []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const loadConnDetail = async (id) => {
    if (expandedConn === id) { setExpandedConn(null); setConnDetail(null); return; }
    setExpandedConn(id);
    try { const res = await axios.get(`${API}/guacamole/connections/${id}/detail`, { headers }); setConnDetail(res.data); } catch { /* */ }
  };

  const openConnection = async (id) => {
    try { const res = await axios.get(`${API}/guacamole/connections/${id}/link`, { headers }); if (res.data.ok) window.open(res.data.url, '_blank'); }
    catch { toast.error('Error'); }
  };

  const createConnection = async () => {
    try {
      const res = await axios.post(`${API}/guacamole/connections`, { ...form, port: parseInt(form.port) || 3389 }, { headers });
      if (res.data.ok) { toast.success(`${form.name} creada`); setShowCreate(false); loadData(); }
      else toast.error(res.data.error || 'Error');
    } catch (err) { toast.error(err.response?.data?.detail || 'Error'); }
  };

  const deleteConnection = async (id) => {
    if (!window.confirm('Eliminar?')) return;
    await axios.delete(`${API}/guacamole/connections/${id}`, { headers }); toast.success('Eliminada'); loadData();
  };

  const syncZitadel = async () => {
    setSyncing(true);
    try {
      const res = await axios.post(`${API}/guacamole/sync-zitadel-groups`, {}, { headers });
      toast.success(`Sync: ${res.data.groups_created?.length || 0} grupos, ${res.data.users_synced?.length || 0} usuarios`);
      loadData();
    } catch { toast.error('Error sync'); }
    setSyncing(false);
  };

  const installApp = async (appId) => {
    setInstalling(appId);
    try {
      const res = await axios.post(`${API}/apps/install/${appId}`, {}, { headers });
      if (res.data.ok) { res.data.type === 'external' ? window.open(res.data.url, '_blank') : toast.success(`Instalada: ${res.data.container}`); loadData(); }
      else toast.error(res.data.error || 'Error');
    } catch (err) { toast.error(err.response?.data?.detail || 'Error'); }
    setInstalling(null);
  };

  // ─── Assign to Workspace ─────────────────────────────────────────────────
  const openAssignModal = (resource_id, resource_name, resource_type, defaultProtos = [], hostname = '', port = 0) => {
    setAssignModal({ resource_id, resource_name, resource_type });
    setAssignProtos(defaultProtos);
    setAssignHostname(hostname);
    setAssignPort(port);
    setAssignGroup(groups[0]?.identifier || '');
  };

  const submitAssignment = async () => {
    if (!assignModal || !assignGroup) return;
    try {
      const res = await axios.post(`${API}/workspace-assignments`, {
        resource_id: assignModal.resource_id,
        resource_name: assignModal.resource_name,
        resource_type: assignModal.resource_type,
        group_id: assignGroup,
        group_name: assignGroup,
        protocols_available: assignProtos,
        hostname: assignHostname,
        port: assignPort,
      }, { headers });
      if (res.data.ok) { toast.success(`Asignado a grupo: ${assignGroup}`); setAssignModal(null); loadData(); }
      else toast.error(res.data.error || 'Error');
    } catch (err) { toast.error(err.response?.data?.detail || 'Error'); }
  };

  // ─── Access Control ──────────────────────────────────────────────────────
  const openAccessEditor = (assignment) => {
    setEditingAccess({ ...assignment, user_access: [...(assignment.user_access || [])] });
  };

  const toggleUserAccess = (idx) => {
    setEditingAccess(prev => {
      const ua = [...prev.user_access];
      ua[idx] = { ...ua[idx], allowed: !ua[idx].allowed };
      return { ...prev, user_access: ua };
    });
  };

  const toggleUserProto = (idx, proto) => {
    setEditingAccess(prev => {
      const ua = [...prev.user_access];
      const protos = ua[idx].protocols || [];
      ua[idx] = { ...ua[idx], protocols: protos.includes(proto) ? protos.filter(p => p !== proto) : [...protos, proto] };
      return { ...prev, user_access: ua };
    });
  };

  const saveAccess = async () => {
    if (!editingAccess) return;
    try {
      await axios.put(`${API}/workspace-assignments/${editingAccess.id}/access`, { user_access: editingAccess.user_access }, { headers });
      toast.success('Acceso actualizado');
      setEditingAccess(null);
      loadData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Error'); }
  };

  const deleteAssignment = async (id) => {
    if (!window.confirm('Eliminar asignacion?')) return;
    await axios.delete(`${API}/workspace-assignments/${id}`, { headers });
    toast.success('Eliminada'); loadData();
  };

  const copyText = (t) => { navigator.clipboard.writeText(t); toast.success('Copiado'); };
  const isAssigned = (resId) => assignments.some(a => a.resource_id === resId);

  const tabs = [
    { id: 'connections', label: 'Conexiones', icon: Monitor, count: connections.length },
    { id: 'apps', label: 'Apps', icon: Container, count: apps.length },
    { id: 'access', label: 'Acceso', icon: Shield, count: assignments.length },
    { id: 'users', label: 'Usuarios', icon: Users, count: users.length },
    { id: 'groups', label: 'Grupos', icon: Lock, count: groups.length },
    { id: 'oidc', label: 'OIDC', icon: Lock, count: null },
  ];

  const appCategories = [...new Set(apps.map(a => a.category))];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="lg:ml-56 p-6">
        <div className="max-w-6xl mx-auto space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="neovdi-title">
                <Monitor className="w-6 h-6 text-cyan-400" /> NeoVDI
              </h1>
              <p className="text-muted-foreground text-sm mt-1">Escritorios remotos, Apps y control de acceso</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={loadData} className="gap-1"><RefreshCw className="w-3 h-3" /></Button>
              <Button size="sm" onClick={syncZitadel} disabled={syncing} className="bg-purple-600 hover:bg-purple-500 gap-1">
                {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Shield className="w-3 h-3" />} Sync Zitadel
              </Button>
              <Button size="sm" onClick={() => setShowCreate(!showCreate)} className="bg-cyan-600 hover:bg-cyan-500 gap-1">
                <Plus className="w-3 h-3" /> Nueva conexion
              </Button>
            </div>
          </div>

          {/* Status */}
          <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Server className="w-5 h-5 text-cyan-400" />
              <div><div className="font-bold text-sm">NeoVDI Gateway</div><div className="text-xs text-muted-foreground font-mono">{status?.url || '...'}</div></div>
            </div>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> :
              status?.connected ? <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">Conectado</Badge>
                : <Badge className="bg-red-500/10 text-red-400 border-red-500/30">Desconectado</Badge>}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-border overflow-x-auto">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button key={tab.id} onClick={() => { setActiveTab(tab.id); if (tab.id === 'oidc') { axios.get(`${API}/guacamole/oidc-config`, { headers }).then(r => setOidcConfig(r.data)).catch(() => {}); } }}
                  className={`flex items-center gap-2 px-3 py-2.5 text-xs font-medium border-b-2 transition-all whitespace-nowrap ${
                    activeTab === tab.id ? 'border-cyan-400 text-cyan-400' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                  <Icon className="w-3.5 h-3.5" /> {tab.label}
                  {tab.count !== null && <Badge variant="secondary" className="text-[9px] h-4 px-1">{tab.count}</Badge>}
                </button>
              );
            })}
          </div>

          {/* Create Connection Form */}
          {showCreate && (
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 space-y-3">
              <h3 className="font-bold text-sm flex items-center gap-2"><Plus className="w-4 h-4 text-cyan-400" /> Nueva conexion</h3>
              <div className="grid grid-cols-3 gap-3">
                <div><Label className="text-[10px]">Nombre *</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="h-7 text-xs" /></div>
                <div><Label className="text-[10px]">Protocolo</Label>
                  <select value={form.protocol} onChange={e => setForm({...form, protocol: e.target.value, port: e.target.value==='rdp'?3389:e.target.value==='vnc'?5901:22})} className="w-full h-7 rounded-md border border-border bg-background px-2 text-xs">
                    <option value="rdp">RDP</option><option value="vnc">VNC</option><option value="ssh">SSH</option></select></div>
                <div><Label className="text-[10px]">Host *</Label><Input value={form.hostname} onChange={e => setForm({...form, hostname: e.target.value})} className="h-7 text-xs" /></div>
                <div><Label className="text-[10px]">Puerto</Label><Input type="number" value={form.port} onChange={e => setForm({...form, port: e.target.value})} className="h-7 text-xs" /></div>
                <div><Label className="text-[10px]">Usuario</Label><Input value={form.username} onChange={e => setForm({...form, username: e.target.value})} className="h-7 text-xs" /></div>
                <div><Label className="text-[10px]">Password</Label><Input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} className="h-7 text-xs" /></div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={createConnection} disabled={!form.name||!form.hostname} className="bg-cyan-600 hover:bg-cyan-500 gap-1 h-7 text-xs"><CheckCircle2 className="w-3 h-3" /> Crear</Button>
                <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)} className="h-7 text-xs">Cancelar</Button>
              </div>
            </div>
          )}

          {/* ═══ ASSIGN MODAL ═══ */}
          {assignModal && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setAssignModal(null)}>
              <div className="bg-card rounded-xl border border-border p-5 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()} data-testid="assign-modal">
                <h3 className="font-bold text-sm flex items-center gap-2"><Plus className="w-4 h-4 text-cyan-400" /> Agregar a Workspace</h3>
                <div className="text-xs text-muted-foreground">Recurso: <span className="text-foreground font-medium">{assignModal.resource_name}</span> ({assignModal.resource_type})</div>
                <div>
                  <Label className="text-[10px]">Grupo de trabajo *</Label>
                  <select value={assignGroup} onChange={e => setAssignGroup(e.target.value)} className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs" data-testid="assign-group-select">
                    <option value="">— Seleccionar grupo —</option>
                    {groups.map(g => <option key={g.identifier} value={g.identifier}>{g.identifier} ({g.members?.length || 0} miembros)</option>)}
                  </select>
                </div>
                {assignHostname && (
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-[10px]">Hostname</Label><Input value={assignHostname} onChange={e => setAssignHostname(e.target.value)} className="h-7 text-xs" /></div>
                    <div><Label className="text-[10px]">Puerto</Label><Input type="number" value={assignPort} onChange={e => setAssignPort(parseInt(e.target.value)||0)} className="h-7 text-xs" /></div>
                  </div>
                )}
                <div>
                  <Label className="text-[10px]">Protocolos permitidos</Label>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {PROTOCOLS.map(p => (
                      <button key={p} onClick={() => setAssignProtos(prev => prev.includes(p) ? prev.filter(x=>x!==p) : [...prev, p])}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-bold border transition-all ${
                          assignProtos.includes(p) ? `bg-${PROTO_COLORS[p]}-500/20 text-${PROTO_COLORS[p]}-400 border-${PROTO_COLORS[p]}-500/40` : 'border-border text-muted-foreground'}`}>
                        {p.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" onClick={submitAssignment} disabled={!assignGroup || assignProtos.length === 0} className="bg-cyan-600 hover:bg-cyan-500 gap-1"><CheckCircle2 className="w-3 h-3" /> Asignar</Button>
                  <Button size="sm" variant="ghost" onClick={() => setAssignModal(null)}>Cancelar</Button>
                </div>
              </div>
            </div>
          )}

          {/* ═══ ACCESS EDIT MODAL ═══ */}
          {editingAccess && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setEditingAccess(null)}>
              <div className="bg-card rounded-xl border border-border p-5 w-full max-w-2xl space-y-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()} data-testid="access-edit-modal">
                <h3 className="font-bold text-sm flex items-center gap-2"><Settings className="w-4 h-4 text-amber-400" /> Control de acceso</h3>
                <div className="text-xs text-muted-foreground">
                  <span className="text-foreground font-medium">{editingAccess.resource_name}</span> → Grupo: <span className="text-cyan-400">{editingAccess.group_id}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">Protocolos disponibles: {editingAccess.protocols_available?.map(p => <Badge key={p} variant="outline" className="text-[8px] ml-1">{p}</Badge>)}</div>

                <div className="space-y-1">
                  <div className="grid grid-cols-[1fr_60px_repeat(5,40px)] gap-1 text-[9px] text-muted-foreground font-bold px-2 py-1 border-b border-border">
                    <span>Usuario</span><span className="text-center">Acceso</span>
                    {PROTOCOLS.map(p => <span key={p} className="text-center">{p.toUpperCase()}</span>)}
                  </div>
                  {editingAccess.user_access.map((ua, idx) => (
                    <div key={idx} className={`grid grid-cols-[1fr_60px_repeat(5,40px)] gap-1 items-center px-2 py-1.5 rounded-lg text-xs ${ua.allowed ? 'bg-emerald-500/5' : 'bg-red-500/5'}`}>
                      <span className="font-mono truncate text-[11px]">{ua.user_email}</span>
                      <div className="flex justify-center">
                        <button onClick={() => toggleUserAccess(idx)}
                          className={`w-8 h-5 rounded-full transition-all flex items-center ${ua.allowed ? 'bg-emerald-500 justify-end' : 'bg-red-500/50 justify-start'}`}>
                          <div className="w-3.5 h-3.5 rounded-full bg-white mx-0.5" />
                        </button>
                      </div>
                      {PROTOCOLS.map(proto => {
                        const has = (ua.protocols || []).includes(proto);
                        const avail = editingAccess.protocols_available?.includes(proto);
                        return (
                          <div key={proto} className="flex justify-center">
                            {avail ? (
                              <button onClick={() => toggleUserProto(idx, proto)}
                                className={`w-5 h-5 rounded border text-[8px] flex items-center justify-center transition-all ${
                                  has ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400' : 'border-border text-muted-foreground/30'}`}>
                                {has ? <CheckCircle2 className="w-3 h-3" /> : ''}
                              </button>
                            ) : <span className="text-muted-foreground/20">—</span>}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 pt-2">
                  <Button size="sm" onClick={saveAccess} className="bg-amber-600 hover:bg-amber-500 gap-1"><CheckCircle2 className="w-3 h-3" /> Guardar acceso</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingAccess(null)}>Cancelar</Button>
                </div>
              </div>
            </div>
          )}

          {/* ═══ CONNECTIONS TAB ═══ */}
          {activeTab === 'connections' && (
            <div className="space-y-2">
              {connections.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground rounded-xl border border-border bg-card"><Wifi className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />No hay conexiones.</div>
              ) : connections.map(conn => (
                <div key={conn.id} className="rounded-xl border border-border bg-card overflow-hidden" data-testid={`conn-${conn.id}`}>
                  <div className="px-4 py-3 flex items-center justify-between hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => loadConnDetail(conn.id)}>
                    <div className="flex items-center gap-3">
                      <Monitor className={`w-5 h-5 ${conn.protocol==='rdp'?'text-blue-400':conn.protocol==='vnc'?'text-purple-400':'text-green-400'}`} />
                      <div>
                        <div className="font-medium text-sm flex items-center gap-2">
                          {conn.name} <Badge variant="outline" className="text-[9px] px-1.5 py-0">{conn.protocol?.toUpperCase()}</Badge>
                          {conn.activeConnections > 0 && <Badge className="bg-green-500/10 text-green-400 border-green-500/30 text-[9px]">{conn.activeConnections} activa</Badge>}
                          {isAssigned(conn.id) && <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-[9px]">En Workspace</Badge>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {!isAssigned(conn.id) && (
                        <Button size="sm" variant="ghost" onClick={e => { e.stopPropagation(); openAssignModal(conn.id, conn.name, 'guacamole', [conn.protocol || 'rdp']); }}
                          className="h-7 text-xs gap-1 text-cyan-400" data-testid={`assign-conn-${conn.id}`}><Plus className="w-3 h-3" /> Workspace</Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={e => {e.stopPropagation(); openConnection(conn.id);}} className="h-7 text-xs gap-1 text-blue-400"><Play className="w-3 h-3" /></Button>
                      <Button size="sm" variant="ghost" onClick={e => {e.stopPropagation(); deleteConnection(conn.id);}} className="h-7 text-xs text-red-400"><Trash2 className="w-3 h-3" /></Button>
                      {expandedConn === conn.id ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </div>
                  {expandedConn === conn.id && connDetail && (
                    <div className="px-4 py-3 border-t border-border bg-muted/10 space-y-3">
                      <div className="grid grid-cols-4 gap-3">
                        <div className="rounded-lg bg-card border border-border p-2"><div className="text-[9px] text-muted-foreground">Host</div><div className="text-xs font-mono flex items-center gap-1">{connDetail.raw_hostname}<button onClick={() => copyText(connDetail.raw_hostname)} className="p-0.5 rounded hover:bg-muted"><Copy className="w-2.5 h-2.5" /></button></div></div>
                        <div className="rounded-lg bg-card border border-border p-2"><div className="text-[9px] text-muted-foreground">Puerto</div><div className="text-xs font-mono">{connDetail.raw_port}</div></div>
                        <div className="rounded-lg bg-card border border-border p-2"><div className="text-[9px] text-muted-foreground">Activas</div><div className="text-xs font-bold text-green-400">{connDetail.activeConnections}</div></div>
                        <div className="rounded-lg bg-card border border-border p-2"><div className="text-[9px] text-muted-foreground">guacd</div><div className="text-[10px] font-mono">{connDetail.attributes?.['guacd-hostname']||'default'}</div></div>
                      </div>
                      <Button size="sm" onClick={() => openConnection(conn.id)} className="bg-blue-600 hover:bg-blue-500 gap-1 h-7 text-xs"><ExternalLink className="w-3 h-3" /> Abrir HTML5</Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ═══ APPS TAB ═══ */}
          {activeTab === 'apps' && (
            <div className="space-y-6">
              {appCategories.map(cat => (
                <div key={cat}>
                  <h3 className="text-sm font-bold capitalize mb-3 text-muted-foreground">{cat}</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {apps.filter(a => a.category === cat).map(app => {
                      const AppIcon = ICON_MAP[app.icon] || Container;
                      const installed = app.status === 'installed';
                      const assigned = isAssigned(app.id);
                      return (
                        <div key={app.id} className={`rounded-xl border p-4 transition-all ${installed ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border bg-card hover:border-cyan-500/30'}`}>
                          <div className="flex items-center gap-2 mb-2">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${installed ? 'bg-emerald-500/10' : 'bg-muted/30'}`}>
                              <AppIcon className={`w-4 h-4 ${installed ? 'text-emerald-400' : 'text-muted-foreground'}`} />
                            </div>
                            <div>
                              <div className="font-medium text-sm">{app.name}</div>
                              <div className="text-[9px] text-muted-foreground">{app.protocol?.toUpperCase()} :{app.port}</div>
                            </div>
                          </div>
                          <p className="text-[10px] text-muted-foreground mb-3">{app.desc}</p>
                          <div className="flex items-center justify-between gap-1">
                            <Badge variant="outline" className="text-[8px]">{app.type}</Badge>
                            <div className="flex gap-1">
                              {!assigned && (
                                <Button size="sm" onClick={() => openAssignModal(app.id, app.name, app.type, [app.protocol], '', app.port)}
                                  className="h-5 text-[9px] bg-cyan-600/80 hover:bg-cyan-500 gap-0.5 px-1.5" data-testid={`assign-app-${app.id}`}>
                                  <Plus className="w-2.5 h-2.5" /> WS
                                </Button>
                              )}
                              {assigned && <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-[8px]">Asignada</Badge>}
                              {!installed ? (
                                <Button size="sm" onClick={() => installApp(app.id)} disabled={installing === app.id}
                                  className="h-5 text-[9px] bg-emerald-600/80 hover:bg-emerald-500 gap-0.5 px-1.5">
                                  {installing === app.id ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Zap className="w-2.5 h-2.5" />} Instalar
                                </Button>
                              ) : <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[8px]">OK</Badge>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ═══ ACCESS CONTROL TAB ═══ */}
          {activeTab === 'access' && (
            <div className="space-y-3">
              {assignments.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground rounded-xl border border-border bg-card">
                  <Shield className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                  No hay recursos asignados. Ve a Conexiones o Apps y usa "Workspace" para asignar.
                </div>
              ) : assignments.map(a => (
                <div key={a.id} className="rounded-xl border border-border bg-card p-4 space-y-3" data-testid={`assignment-${a.id}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Monitor className="w-5 h-5 text-cyan-400" />
                      <div>
                        <div className="font-medium text-sm">{a.resource_name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {a.resource_type} → Grupo: <span className="text-cyan-400">{a.group_id}</span>
                          {a.guacamole_connection_id && <span className="ml-1 text-purple-400">| NeoVDI #{a.guacamole_connection_id}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openAccessEditor(a)} className="h-7 text-xs gap-1 text-amber-400" data-testid={`edit-access-${a.id}`}>
                        <Settings className="w-3 h-3" /> Acceso
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteAssignment(a.id)} className="h-7 text-xs text-red-400"><Trash2 className="w-3 h-3" /></Button>
                    </div>
                  </div>
                  {/* Protocols */}
                  <div className="flex gap-1.5">
                    {(a.protocols_available || []).map(p => (
                      <Badge key={p} className={`bg-${PROTO_COLORS[p]||'gray'}-500/10 text-${PROTO_COLORS[p]||'gray'}-400 border-${PROTO_COLORS[p]||'gray'}-500/30 text-[9px]`}>{p.toUpperCase()}</Badge>
                    ))}
                  </div>
                  {/* Users summary */}
                  <div className="flex flex-wrap gap-1">
                    {(a.user_access || []).map((ua, i) => (
                      <div key={i} className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] border ${
                        ua.allowed ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400' : 'bg-red-500/5 border-red-500/20 text-red-400'}`}>
                        {ua.allowed ? <UserCheck className="w-2.5 h-2.5" /> : <UserX className="w-2.5 h-2.5" />}
                        {ua.user_email?.split('@')[0]}
                        <span className="text-muted-foreground">({(ua.protocols||[]).length}p)</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ═══ USERS TAB ═══ */}
          {activeTab === 'users' && (
            <div className="rounded-xl border border-border bg-card divide-y divide-border">
              {users.map(u => (
                <div key={u.username} className="px-4 py-2.5 flex items-center justify-between hover:bg-muted/20">
                  <div className="flex items-center gap-3"><Users className="w-4 h-4 text-cyan-400" /><div className="font-medium text-sm">{u.username}</div></div>
                  <Badge variant="outline" className="text-[10px]">{u.disabled ? 'Disabled' : 'Active'}</Badge>
                </div>
              ))}
            </div>
          )}

          {/* ═══ GROUPS TAB ═══ */}
          {activeTab === 'groups' && (
            <div className="space-y-3">
              {groups.map(g => (
                <div key={g.identifier} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2"><Shield className="w-4 h-4 text-purple-400" /><span className="font-bold text-sm">{g.identifier}</span></div>
                    <span className="text-xs text-muted-foreground">{g.members?.length || 0} miembros</span>
                  </div>
                  <div className="flex flex-wrap gap-1">{(g.members||[]).map(m => <Badge key={m} className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-[9px]">{m}</Badge>)}</div>
                </div>
              ))}
            </div>
          )}

          {/* ═══ OIDC TAB ═══ */}
          {activeTab === 'oidc' && oidcConfig && (
            <div className="space-y-4">
              <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-5 space-y-3">
                <h3 className="font-bold text-sm flex items-center gap-2"><Lock className="w-4 h-4 text-purple-400" /> NeoVDI OIDC — Zitadel</h3>
                {[['Client ID', oidcConfig.client_id], ['Groups Claim', oidcConfig.groups_claim], ['Scopes', oidcConfig.scopes], ['Post-logout', oidcConfig.post_logout_redirect]].map(([l,v]) => (
                  <div key={l} className="flex items-center gap-2 text-xs"><span className="text-muted-foreground w-28">{l}:</span><code className="text-cyan-400 font-mono">{v}</code>
                    <button onClick={() => copyText(v)} className="p-0.5 rounded hover:bg-muted"><Copy className="w-2.5 h-2.5 text-muted-foreground" /></button></div>
                ))}
                {oidcConfig.extensions && <div className="flex flex-wrap gap-1 pt-1">{oidcConfig.extensions.map(e => <Badge key={e} variant="outline" className="text-[8px]">{e}</Badge>)}</div>}
              </div>
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5 space-y-3">
                <h4 className="font-bold text-sm flex items-center gap-2"><Zap className="w-4 h-4 text-amber-400" /> Zitadel Action: groups claim</h4>
                <pre className="p-3 rounded-lg bg-black/40 text-[10px] text-green-400 font-mono overflow-x-auto whitespace-pre">{`function addGroupsClaim(ctx, api) {
  if (ctx.v1.user && ctx.v1.user.grants) {
    var groups = [];
    ctx.v1.user.grants.grants.forEach(function(grant) {
      grant.roles.forEach(function(role) { groups.push(role); });
    });
    api.v1.claims.setClaim("groups", groups);
  }
}`}</pre>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
