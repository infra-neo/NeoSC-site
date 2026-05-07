import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import axios from 'axios';
import {
  Wifi, Monitor, Users, Key, Globe, Trash2,
  RefreshCw, Plus, Shield, Route, CheckCircle2, XCircle
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function NetbirdAdminPage() {
  const { getAuthHeader } = useAuth();
  const [activeTab, setActiveTab] = useState('peers');
  const [peers, setPeers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [setupKeys, setSetupKeys] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [nbUsers, setNbUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Create group form
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  // Create setup key form
  const [showCreateKey, setShowCreateKey] = useState(false);
  const [newKey, setNewKey] = useState({ name: '', type: 'reusable', expires_in: 86400 });

  const headers = getAuthHeader();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [peersRes, groupsRes, keysRes, routesRes, usersRes] = await Promise.all([
        axios.get(`${API}/admin/netbird/peers`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/admin/netbird/groups`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/admin/netbird/setup-keys`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/admin/netbird/routes`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/admin/netbird/users`, { headers }).catch(() => ({ data: [] })),
      ]);
      setPeers(Array.isArray(peersRes.data) ? peersRes.data : []);
      setGroups(Array.isArray(groupsRes.data) ? groupsRes.data : []);
      setSetupKeys(Array.isArray(keysRes.data) ? keysRes.data : []);
      setRoutes(Array.isArray(routesRes.data) ? routesRes.data : []);
      setNbUsers(Array.isArray(usersRes.data) ? usersRes.data : []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [headers]);

  useEffect(() => { load(); }, []);

  const deletePeer = async (peerId) => {
    if (!confirm('¿Eliminar este peer?')) return;
    try {
      await axios.delete(`${API}/admin/netbird/peers/${peerId}`, { headers });
      toast.success('Peer eliminado');
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al eliminar peer');
    }
  };

  const createGroup = async () => {
    try {
      await axios.post(`${API}/admin/netbird/groups`, { name: newGroupName }, { headers });
      toast.success('Grupo creado');
      setShowCreateGroup(false);
      setNewGroupName('');
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al crear grupo');
    }
  };

  const deleteGroup = async (groupId) => {
    if (!confirm('¿Eliminar este grupo?')) return;
    try {
      await axios.delete(`${API}/admin/netbird/groups/${groupId}`, { headers });
      toast.success('Grupo eliminado');
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al eliminar grupo');
    }
  };

  const createSetupKey = async () => {
    try {
      await axios.post(`${API}/admin/netbird/setup-keys`, {
        name: newKey.name,
        type: newKey.type,
        expires_in: newKey.expires_in,
        auto_groups: [],
        usage_limit: 0,
      }, { headers });
      toast.success('Setup key creado');
      setShowCreateKey(false);
      setNewKey({ name: '', type: 'reusable', expires_in: 86400 });
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al crear setup key');
    }
  };

  const tabs = [
    { key: 'peers', label: 'Peers', icon: Monitor, count: peers.length },
    { key: 'groups', label: 'Grupos', icon: Shield, count: groups.length },
    { key: 'setup-keys', label: 'Setup Keys', icon: Key, count: setupKeys.length },
    { key: 'routes', label: 'Rutas', icon: Route, count: routes.length },
    { key: 'users', label: 'Usuarios', icon: Users, count: nbUsers.length },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="lg:ml-56 p-6">
        <div className="max-w-7xl mx-auto space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <Wifi className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold" data-testid="netbird-admin-title">NeoMesh Zero Trust</h1>
                <p className="text-muted-foreground text-sm">Red mesh y gestión de peers</p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={load} className="gap-1.5" data-testid="refresh-netbird">
              <RefreshCw className="w-3.5 h-3.5" /> Actualizar
            </Button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-border overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                data-testid={`nb-tab-${tab.key}`}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  activeTab === tab.key
                    ? 'border-green-500 text-green-400'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                <Badge variant="outline" className="text-[10px] ml-1">{tab.count}</Badge>
              </button>
            ))}
          </div>

          {loading && (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Peers Tab */}
          {!loading && activeTab === 'peers' && (
            <div className="rounded-xl border border-border bg-card overflow-hidden" data-testid="netbird-peers-table">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-[10px] text-muted-foreground uppercase tracking-wider">
                    <th className="text-left p-3">Nombre</th>
                    <th className="p-3">IP</th>
                    <th className="p-3">OS</th>
                    <th className="p-3">Versión</th>
                    <th className="p-3">Estado</th>
                    <th className="p-3">Grupos</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {peers.map((p) => (
                    <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/10">
                      <td className="p-3">
                        <div className="font-bold text-sm">{p.name || p.hostname}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{p.id?.slice(0, 12)}</div>
                      </td>
                      <td className="p-3 text-center font-mono text-xs">{p.ip}</td>
                      <td className="p-3 text-center text-xs">{p.os}</td>
                      <td className="p-3 text-center font-mono text-[10px]">{p.version}</td>
                      <td className="p-3 text-center">
                        <Badge className={`text-[10px] ${
                          p.connected ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'
                        }`}>
                          {p.connected ? 'online' : 'offline'}
                        </Badge>
                      </td>
                      <td className="p-3 text-center">
                        {(p.groups || []).slice(0, 3).map((g) => (
                          <Badge key={g.id} variant="outline" className="text-[9px] mr-0.5">{g.name}</Badge>
                        ))}
                      </td>
                      <td className="p-3 text-right">
                        <Button size="sm" variant="ghost" onClick={() => deletePeer(p.id)} className="text-red-400 hover:text-red-300 h-7">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Groups Tab */}
          {!loading && activeTab === 'groups' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button size="sm" onClick={() => setShowCreateGroup(!showCreateGroup)} className="bg-green-500 hover:bg-green-400 text-black gap-1" data-testid="create-group-btn">
                  <Plus className="w-4 h-4" /> Crear grupo
                </Button>
              </div>
              {showCreateGroup && (
                <div className="rounded-xl border border-green-500/30 bg-card p-4 space-y-3">
                  <h3 className="font-bold text-sm">Nuevo grupo NeoMesh</h3>
                  <Input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="Nombre del grupo" />
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => setShowCreateGroup(false)}>Cancelar</Button>
                    <Button size="sm" className="bg-green-500 hover:bg-green-400 text-black" onClick={createGroup}>Crear</Button>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {groups.map((g) => (
                  <div key={g.id} className="rounded-xl border border-border bg-card p-4" data-testid={`nb-group-${g.id}`}>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-bold text-sm">{g.name}</h3>
                      <Button size="sm" variant="ghost" onClick={() => deleteGroup(g.id)} className="text-red-400 hover:text-red-300 h-6 w-6 p-0">
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Monitor className="w-3 h-3" /> {g.peers_count || g.peers?.length || 0} peers
                    </div>
                    <p className="text-[10px] text-muted-foreground font-mono mt-1">{g.id}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Setup Keys Tab */}
          {!loading && activeTab === 'setup-keys' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button size="sm" onClick={() => setShowCreateKey(!showCreateKey)} className="bg-green-500 hover:bg-green-400 text-black gap-1" data-testid="create-key-btn">
                  <Key className="w-4 h-4" /> Crear setup key
                </Button>
              </div>
              {showCreateKey && (
                <div className="rounded-xl border border-green-500/30 bg-card p-4 space-y-3">
                  <h3 className="font-bold text-sm">Nuevo setup key</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div><Label className="text-xs">Nombre</Label><Input value={newKey.name} onChange={e => setNewKey({...newKey, name: e.target.value})} placeholder="Nombre" /></div>
                    <div>
                      <Label className="text-xs">Tipo</Label>
                      <select value={newKey.type} onChange={e => setNewKey({...newKey, type: e.target.value})}
                        className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm">
                        <option value="reusable">Reusable</option>
                        <option value="one-off">One-off</option>
                      </select>
                    </div>
                    <div><Label className="text-xs">Expira en (seg)</Label><Input type="number" value={newKey.expires_in} onChange={e => setNewKey({...newKey, expires_in: parseInt(e.target.value)})} /></div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => setShowCreateKey(false)}>Cancelar</Button>
                    <Button size="sm" className="bg-green-500 hover:bg-green-400 text-black" onClick={createSetupKey}>Crear</Button>
                  </div>
                </div>
              )}
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-[10px] text-muted-foreground uppercase tracking-wider">
                      <th className="text-left p-3">Nombre</th>
                      <th className="p-3">Tipo</th>
                      <th className="p-3">Usos</th>
                      <th className="p-3">Estado</th>
                      <th className="p-3">Expira</th>
                    </tr>
                  </thead>
                  <tbody>
                    {setupKeys.map((k) => (
                      <tr key={k.id} className="border-b border-border last:border-0">
                        <td className="p-3 font-medium">{k.name}</td>
                        <td className="p-3 text-center"><Badge variant="outline" className="text-[10px]">{k.type}</Badge></td>
                        <td className="p-3 text-center font-mono text-xs">{k.used_times || 0}/{k.usage_limit || '∞'}</td>
                        <td className="p-3 text-center">
                          <Badge className={`text-[10px] ${
                            k.valid ? 'bg-green-500/10 text-green-400 border-green-500/30' : k.revoked ? 'bg-red-500/10 text-red-400 border-red-500/30' : 'bg-muted text-muted-foreground'
                          }`}>
                            {k.revoked ? 'revoked' : k.valid ? 'valid' : 'expired'}
                          </Badge>
                        </td>
                        <td className="p-3 text-center text-xs text-muted-foreground">
                          {k.expires ? new Date(k.expires).toLocaleDateString('es-MX') : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Routes Tab */}
          {!loading && activeTab === 'routes' && (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              {routes.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No hay rutas configuradas</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-[10px] text-muted-foreground uppercase tracking-wider">
                      <th className="text-left p-3">Nombre</th>
                      <th className="p-3">Red</th>
                      <th className="p-3">Peer</th>
                      <th className="p-3">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {routes.map((r) => (
                      <tr key={r.id} className="border-b border-border last:border-0">
                        <td className="p-3 font-medium">{r.description || r.network_id}</td>
                        <td className="p-3 text-center font-mono text-xs">{r.network}</td>
                        <td className="p-3 text-center text-xs">{r.peer}</td>
                        <td className="p-3 text-center">
                          <Badge className={`text-[10px] ${r.enabled ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-muted text-muted-foreground'}`}>
                            {r.enabled ? 'activa' : 'desactivada'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Users Tab */}
          {!loading && activeTab === 'users' && (
            <div className="rounded-xl border border-border bg-card overflow-hidden" data-testid="netbird-users-table">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-[10px] text-muted-foreground uppercase tracking-wider">
                    <th className="text-left p-3">Nombre</th>
                    <th className="p-3">Email</th>
                    <th className="p-3">Rol</th>
                    <th className="p-3">Estado</th>
                    <th className="p-3">Peers</th>
                  </tr>
                </thead>
                <tbody>
                  {nbUsers.map((u) => (
                    <tr key={u.id} className="border-b border-border last:border-0 hover:bg-muted/10">
                      <td className="p-3 font-medium">{u.name}</td>
                      <td className="p-3 text-center text-xs text-muted-foreground">{u.email}</td>
                      <td className="p-3 text-center">
                        <Badge className={`text-[10px] ${
                          u.role === 'admin' ? 'bg-orange-500/10 text-orange-400 border-orange-500/30' : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                        }`}>{u.role}</Badge>
                      </td>
                      <td className="p-3 text-center">
                        <Badge className={`text-[10px] ${
                          u.status === 'active' ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        }`}>{u.status}</Badge>
                      </td>
                      <td className="p-3 text-center font-mono text-xs">{u.peers_count || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
