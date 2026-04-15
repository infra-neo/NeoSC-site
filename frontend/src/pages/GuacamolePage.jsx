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
  ChevronRight, ChevronDown, Lock, Key, Copy, Play,
  Globe, Network, Terminal, FileCode, Layout, Database,
  FileText, Download, Zap
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const ICON_MAP = { monitor: Monitor, layout: Layout, code: FileCode, database: Database, globe: Globe, terminal: Terminal, lock: Lock, 'file-text': FileText };

export default function GuacamolePage() {
  const { getAuthHeader } = useAuth();
  const headers = getAuthHeader();

  const [status, setStatus] = useState(null);
  const [connections, setConnections] = useState([]);
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [installing, setInstalling] = useState(null);
  const [activeTab, setActiveTab] = useState('connections');
  const [showCreate, setShowCreate] = useState(false);
  const [expandedConn, setExpandedConn] = useState(null);
  const [connDetail, setConnDetail] = useState(null);
  const [oidcConfig, setOidcConfig] = useState(null);
  const [form, setForm] = useState({ name: '', protocol: 'rdp', hostname: '', port: 3389, username: '', password: '' });

  const loadData = async () => {
    setLoading(true);
    try {
      const [statusRes, connRes, usersRes, groupsRes, appsRes] = await Promise.all([
        axios.get(`${API}/guacamole/status`, { headers }),
        axios.get(`${API}/guacamole/connections`, { headers }).catch(() => ({ data: { connections: [] } })),
        axios.get(`${API}/guacamole/users`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/guacamole/groups`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/apps/catalog`, { headers }).catch(() => ({ data: { apps: [] } })),
      ]);
      setStatus(statusRes.data);
      setConnections(connRes.data.connections || []);
      setUsers(usersRes.data || []);
      setGroups(groupsRes.data || []);
      setApps(appsRes.data.apps || []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const loadConnDetail = async (id) => {
    if (expandedConn === id) { setExpandedConn(null); setConnDetail(null); return; }
    setExpandedConn(id);
    try {
      const res = await axios.get(`${API}/guacamole/connections/${id}/detail`, { headers });
      setConnDetail(res.data);
    } catch { /* ignore */ }
  };

  const openConnection = async (id) => {
    try {
      const res = await axios.get(`${API}/guacamole/connections/${id}/link`, { headers });
      if (res.data.ok) window.open(res.data.url, '_blank');
    } catch { toast.error('Error generando link'); }
  };

  const createConnection = async () => {
    try {
      const res = await axios.post(`${API}/guacamole/connections`, { ...form, port: parseInt(form.port) || 3389 }, { headers });
      if (res.data.ok) { toast.success(`${form.name} creada`); setShowCreate(false); loadData(); }
      else toast.error(res.data.error || 'Error');
    } catch (err) { toast.error(err.response?.data?.detail || 'Error'); }
  };

  const deleteConnection = async (id) => {
    if (!window.confirm('Eliminar esta conexion?')) return;
    await axios.delete(`${API}/guacamole/connections/${id}`, { headers });
    toast.success('Eliminada'); loadData();
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

  const loadOidcConfig = async () => {
    try {
      const res = await axios.get(`${API}/guacamole/oidc-config`, { headers });
      setOidcConfig(res.data);
    } catch { /* ignore */ }
  };

  const installApp = async (appId) => {
    setInstalling(appId);
    try {
      const res = await axios.post(`${API}/apps/install/${appId}`, {}, { headers });
      if (res.data.ok) {
        if (res.data.type === 'external') {
          window.open(res.data.url, '_blank');
        } else {
          toast.success(`App instalada: ${res.data.container}`);
        }
        loadData();
      } else toast.error(res.data.error || 'Error');
    } catch (err) { toast.error(err.response?.data?.detail || 'Error'); }
    setInstalling(null);
  };

  const copyText = (t) => { navigator.clipboard.writeText(t); toast.success('Copiado'); };

  const tabs = [
    { id: 'connections', label: 'Conexiones', icon: Monitor, count: connections.length },
    { id: 'apps', label: 'Apps', icon: Container, count: apps.length },
    { id: 'users', label: 'Usuarios', icon: Users, count: users.length },
    { id: 'groups', label: 'Grupos', icon: Shield, count: groups.length },
    { id: 'oidc', label: 'OIDC Config', icon: Lock, count: null },
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
              <p className="text-muted-foreground text-sm mt-1">Escritorios remotos, Apps y sesiones HTML5</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={loadData} className="gap-1"><RefreshCw className="w-3 h-3" /> Actualizar</Button>
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
              <div>
                <div className="font-bold text-sm">NeoVDI Gateway</div>
                <div className="text-xs text-muted-foreground font-mono">{status?.url || 'Cargando...'}</div>
              </div>
            </div>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> :
              status?.connected
                ? <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">Conectado</Badge>
                : <Badge className="bg-red-500/10 text-red-400 border-red-500/30">Desconectado</Badge>}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-border overflow-x-auto">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button key={tab.id} onClick={() => { setActiveTab(tab.id); if (tab.id === 'oidc') loadOidcConfig(); }}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                    activeTab === tab.id ? 'border-cyan-400 text-cyan-400' : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}>
                  <Icon className="w-4 h-4" /> {tab.label}
                  {tab.count !== null && <Badge variant="secondary" className="text-[10px] h-5">{tab.count}</Badge>}
                </button>
              );
            })}
          </div>

          {/* Create Form */}
          {showCreate && (
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-5 space-y-4" data-testid="create-connection-form">
              <h3 className="font-bold text-sm flex items-center gap-2"><Plus className="w-4 h-4 text-cyan-400" /> Nueva conexion</h3>
              <div className="grid grid-cols-3 gap-3">
                <div><Label className="text-xs">Nombre *</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Win-Server-01" className="h-8 text-xs" /></div>
                <div><Label className="text-xs">Protocolo</Label>
                  <select value={form.protocol} onChange={e => setForm({...form, protocol: e.target.value, port: e.target.value==='rdp'?3389:e.target.value==='vnc'?5901:22})} className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs">
                    <option value="rdp">RDP</option><option value="vnc">VNC</option><option value="ssh">SSH</option>
                  </select></div>
                <div><Label className="text-xs">Host / IP *</Label><Input value={form.hostname} onChange={e => setForm({...form, hostname: e.target.value})} placeholder="10.100.10.x" className="h-8 text-xs" /></div>
                <div><Label className="text-xs">Puerto</Label><Input type="number" value={form.port} onChange={e => setForm({...form, port: e.target.value})} className="h-8 text-xs" /></div>
                <div><Label className="text-xs">Usuario</Label><Input value={form.username} onChange={e => setForm({...form, username: e.target.value})} className="h-8 text-xs" /></div>
                <div><Label className="text-xs">Password</Label><Input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} className="h-8 text-xs" /></div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={createConnection} disabled={!form.name||!form.hostname} className="bg-cyan-600 hover:bg-cyan-500 gap-1"><CheckCircle2 className="w-3 h-3" /> Crear</Button>
                <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>Cancelar</Button>
              </div>
            </div>
          )}

          {/* === CONNECTIONS TAB === */}
          {activeTab === 'connections' && (
            <div className="space-y-2">
              {connections.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground rounded-xl border border-border bg-card">
                  <Wifi className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />No hay conexiones.
                </div>
              ) : connections.map(conn => (
                <div key={conn.id} className="rounded-xl border border-border bg-card overflow-hidden" data-testid={`conn-${conn.id}`}>
                  <div className="px-4 py-3 flex items-center justify-between hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => loadConnDetail(conn.id)}>
                    <div className="flex items-center gap-3">
                      <Monitor className={`w-5 h-5 ${conn.protocol==='rdp'?'text-blue-400':conn.protocol==='vnc'?'text-purple-400':'text-green-400'}`} />
                      <div>
                        <div className="font-medium text-sm flex items-center gap-2">
                          {conn.name} <Badge variant="outline" className="text-[9px] px-1.5 py-0">{conn.protocol?.toUpperCase()}</Badge>
                          {conn.activeConnections > 0 && <Badge className="bg-green-500/10 text-green-400 border-green-500/30 text-[9px]">{conn.activeConnections} activa</Badge>}
                        </div>
                        <div className="text-[11px] text-muted-foreground">ID: {conn.id}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={e => {e.stopPropagation(); openConnection(conn.id);}} className="h-7 text-xs gap-1 text-blue-400"><Play className="w-3 h-3" /> Conectar</Button>
                      <Button size="sm" variant="ghost" onClick={e => {e.stopPropagation(); deleteConnection(conn.id);}} className="h-7 text-xs text-red-400"><Trash2 className="w-3 h-3" /></Button>
                      {expandedConn === conn.id ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </div>
                  {expandedConn === conn.id && connDetail && (
                    <div className="px-4 py-3 border-t border-border bg-muted/10 space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[
                          {label:'Hostname', val: connDetail.raw_hostname, copy: true},
                          {label:'Puerto', val: connDetail.raw_port},
                          {label:'Sesiones', val: connDetail.activeConnections, color:'text-green-400'},
                          {label:'guacd', val: `${connDetail.attributes?.['guacd-hostname']||'default'}:${connDetail.attributes?.['guacd-port']||'4822'}`},
                        ].map((item,i) => (
                          <div key={i} className="rounded-lg bg-card border border-border p-2.5">
                            <div className="text-[10px] text-muted-foreground">{item.label}</div>
                            <div className={`text-sm font-mono ${item.color||''} flex items-center gap-1`}>
                              {item.val}
                              {item.copy && <button onClick={() => copyText(String(item.val))} className="p-0.5 rounded hover:bg-muted"><Copy className="w-2.5 h-2.5" /></button>}
                            </div>
                          </div>
                        ))}
                      </div>
                      {connDetail.parameters && (
                        <div className="grid grid-cols-3 md:grid-cols-5 gap-1">
                          {Object.entries(connDetail.parameters).filter(([k]) => !['hostname','port','password','username'].includes(k)).map(([k,v]) => (
                            <div key={k} className="flex items-center gap-1 text-[10px]">
                              {v==='true' ? <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" /> : <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/20 inline-block" />}
                              <span className="text-muted-foreground truncate">{k}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <Button size="sm" onClick={() => openConnection(conn.id)} className="bg-blue-600 hover:bg-blue-500 gap-1 h-7 text-xs"><ExternalLink className="w-3 h-3" /> Abrir sesion HTML5</Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* === APPS TAB === */}
          {activeTab === 'apps' && (
            <div className="space-y-6">
              {appCategories.map(cat => (
                <div key={cat}>
                  <h3 className="text-sm font-bold capitalize mb-3 text-muted-foreground">{cat}</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {apps.filter(a => a.category === cat).map(app => {
                      const AppIcon = ICON_MAP[app.icon] || Container;
                      const isInstalled = app.status === 'installed';
                      return (
                        <div key={app.id} className={`rounded-xl border p-4 transition-all ${isInstalled ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border bg-card hover:border-cyan-500/30'}`}
                          data-testid={`app-${app.id}`}>
                          <div className="flex items-center gap-2.5 mb-2">
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isInstalled ? 'bg-emerald-500/10' : 'bg-muted/30'}`}>
                              <AppIcon className={`w-4.5 h-4.5 ${isInstalled ? 'text-emerald-400' : 'text-muted-foreground'}`} />
                            </div>
                            <div>
                              <div className="font-medium text-sm">{app.name}</div>
                              <div className="text-[10px] text-muted-foreground">{app.protocol?.toUpperCase()} :{app.port}</div>
                            </div>
                          </div>
                          <p className="text-[11px] text-muted-foreground mb-3">{app.desc}</p>
                          <div className="flex items-center justify-between">
                            <Badge variant="outline" className="text-[9px]">{app.type}</Badge>
                            {isInstalled ? (
                              <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px]">Instalada</Badge>
                            ) : (
                              <Button size="sm" onClick={() => installApp(app.id)} disabled={installing === app.id}
                                className="h-6 text-[10px] bg-cyan-600 hover:bg-cyan-500 gap-1">
                                {installing === app.id ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Zap className="w-2.5 h-2.5" />}
                                Instalar
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* === USERS TAB === */}
          {activeTab === 'users' && (
            <div className="rounded-xl border border-border bg-card divide-y divide-border">
              {users.map(u => (
                <div key={u.username} className="px-4 py-3 flex items-center justify-between hover:bg-muted/20">
                  <div className="flex items-center gap-3">
                    <Users className="w-4 h-4 text-cyan-400" />
                    <div>
                      <div className="font-medium text-sm">{u.username}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {u.lastActive && `Ultima actividad: ${new Date(u.lastActive).toLocaleString()}`}
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{u.disabled ? 'Deshabilitado' : 'Activo'}</Badge>
                </div>
              ))}
            </div>
          )}

          {/* === GROUPS TAB === */}
          {activeTab === 'groups' && (
            <div className="space-y-3">
              {groups.map(g => (
                <div key={g.identifier} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2"><Shield className="w-4 h-4 text-purple-400" /><span className="font-bold text-sm">{g.identifier}</span></div>
                    <span className="text-xs text-muted-foreground">{g.members?.length || 0} miembros</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {(g.members||[]).map(m => <Badge key={m} className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-[10px]"><Users className="w-2.5 h-2.5 mr-1" />{m}</Badge>)}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(g.permissions?.system||[]).map(p => <Badge key={p} variant="outline" className="text-[9px] text-amber-400 border-amber-500/30">{p}</Badge>)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* === OIDC CONFIG TAB === */}
          {activeTab === 'oidc' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-5 space-y-4">
                <h3 className="font-bold text-sm flex items-center gap-2"><Lock className="w-4 h-4 text-purple-400" /> NeoVDI OIDC — Zitadel Configuration</h3>
                <p className="text-xs text-muted-foreground">Configuracion OIDC para que NeoVDI autentique via Zitadel. Los roles de proyecto se mapean a grupos en NeoVDI. Al cerrar sesion redirige a NeoSC Workspaces.</p>

                {oidcConfig ? (
                  <div className="space-y-2">
                    {[
                      ['Client ID', oidcConfig.client_id],
                      ['Issuer', oidcConfig.issuer],
                      ['Authorization', oidcConfig.authorization_endpoint],
                      ['Token', oidcConfig.token_endpoint],
                      ['JWKS', oidcConfig.jwks_endpoint],
                      ['Redirect URI', oidcConfig.redirect_uri],
                      ['Post-logout', oidcConfig.post_logout_redirect],
                      ['Scopes', oidcConfig.scopes],
                      ['Groups Claim', oidcConfig.groups_claim],
                      ['Username Claim', oidcConfig.username_claim],
                    ].map(([label, val]) => (
                      <div key={label} className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground w-32 flex-shrink-0">{label}:</span>
                        <code className="text-cyan-400 font-mono flex-1 truncate">{val}</code>
                        <button onClick={() => copyText(val)} className="p-0.5 rounded hover:bg-muted"><Copy className="w-3 h-3 text-muted-foreground" /></button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Cargando configuracion...</div>
                )}

                <div className="pt-3 border-t border-border">
                  <h4 className="text-xs font-bold mb-2">Script de instalacion</h4>
                  <p className="text-[11px] text-muted-foreground mb-2">Ejecuta este script en el servidor NeoVDI (149.56.241.64) para configurar OIDC automaticamente:</p>
                  <div className="relative">
                    <pre className="p-3 rounded-lg bg-black/40 text-[11px] text-green-400 font-mono overflow-x-auto">
{`# SSH al servidor NeoVDI y ejecutar:
curl -sL ${BACKEND_URL}/api/guacamole/oidc-script | sudo bash`}
                    </pre>
                    <button onClick={() => copyText(`curl -sL ${BACKEND_URL}/api/guacamole/oidc-script | sudo bash`)}
                      className="absolute top-2 right-2 p-1 rounded bg-white/10 hover:bg-white/20"><Copy className="w-3 h-3 text-white" /></button>
                  </div>
                </div>

                <div className="pt-3 border-t border-border">
                  <h4 className="text-xs font-bold mb-2">Claim → Group Mapping</h4>
                  <div className="text-[11px] text-muted-foreground space-y-1">
                    <p>Zitadel envia los roles del proyecto en el claim <code className="text-purple-400">urn:zitadel:iam:org:project:roles</code>.</p>
                    <p>NeoVDI los mapea automaticamente a user groups. Ejemplo:</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/30 text-[10px]">Zitadel: admin</Badge>
                      <ChevronRight className="w-3 h-3 text-muted-foreground" />
                      <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-[10px]">NeoVDI: zitadel-admin</Badge>
                    </div>
                    <p className="mt-2">El boton "Sync Zitadel" crea los grupos y asigna usuarios segun los grants actuales.</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
