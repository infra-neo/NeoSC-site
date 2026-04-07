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
  Shield, Users, Building2, Key, UserPlus, Trash2,
  RefreshCw, Search, ChevronDown, ChevronRight, Eye
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function ZitadelAdminPage() {
  const { getAuthHeader } = useAuth();
  const [activeTab, setActiveTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [roles, setRoles] = useState([]);
  const [grants, setGrants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Create user form
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', firstName: '', lastName: '', password: '' });

  // Create org form
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');

  const headers = getAuthHeader();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, orgsRes, rolesRes, grantsRes] = await Promise.all([
        axios.get(`${API}/admin/zitadel/users`, { headers }).catch(() => ({ data: { result: [] } })),
        axios.get(`${API}/admin/zitadel/orgs`, { headers }).catch(() => ({ data: { result: [] } })),
        axios.get(`${API}/admin/zitadel/roles`, { headers }).catch(() => ({ data: { result: [] } })),
        axios.get(`${API}/admin/zitadel/grants`, { headers }).catch(() => ({ data: { result: [] } })),
      ]);
      setUsers(usersRes.data?.result || []);
      setOrgs(orgsRes.data?.result || []);
      setRoles(rolesRes.data?.result || []);
      setGrants(grantsRes.data?.result || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [headers]);

  useEffect(() => { load(); }, []);

  const createUser = async () => {
    try {
      await axios.post(`${API}/admin/zitadel/users`, {
        user: {
          human: {
            profile: { givenName: newUser.firstName, familyName: newUser.lastName },
            email: { email: newUser.email, isVerified: true },
            password: { password: newUser.password, changeRequired: false },
          }
        }
      }, { headers });
      toast.success('Usuario creado en Zitadel');
      setShowCreateUser(false);
      setNewUser({ email: '', firstName: '', lastName: '', password: '' });
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al crear usuario');
    }
  };

  const deleteUser = async (userId) => {
    if (!confirm('¿Eliminar este usuario de Zitadel?')) return;
    try {
      await axios.delete(`${API}/admin/zitadel/users/${userId}`, { headers });
      toast.success('Usuario eliminado');
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al eliminar');
    }
  };

  const createOrg = async () => {
    try {
      await axios.post(`${API}/admin/zitadel/orgs`, { name: newOrgName }, { headers });
      toast.success('Organización creada');
      setShowCreateOrg(false);
      setNewOrgName('');
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al crear organización');
    }
  };

  const filteredUsers = users.filter(u => {
    const name = `${u.human?.profile?.givenName || ''} ${u.human?.profile?.familyName || ''} ${u.human?.email?.email || ''}`.toLowerCase();
    return name.includes(search.toLowerCase());
  });

  const tabs = [
    { key: 'users', label: 'Usuarios', icon: Users, count: users.length },
    { key: 'orgs', label: 'Organizaciones', icon: Building2, count: orgs.length },
    { key: 'roles', label: 'Proyectos/Roles', icon: Key, count: roles.length },
    { key: 'grants', label: 'Grants', icon: Shield, count: grants.length },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="lg:ml-56 p-6">
        <div className="max-w-7xl mx-auto space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Shield className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold" data-testid="zitadel-admin-title">NeoSC SSO (Zitadel)</h1>
                <p className="text-muted-foreground text-sm">Gestión de identidad y acceso</p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={load} className="gap-1.5" data-testid="refresh-zitadel">
              <RefreshCw className="w-3.5 h-3.5" /> Actualizar
            </Button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-border">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                data-testid={`zt-tab-${tab.key}`}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-purple-500 text-purple-400'
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
              <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Users Tab */}
          {!loading && activeTab === 'users' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Buscar usuarios..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" data-testid="search-users" />
                </div>
                <Button size="sm" onClick={() => setShowCreateUser(!showCreateUser)} className="bg-purple-500 hover:bg-purple-400 text-white gap-1" data-testid="create-user-btn">
                  <UserPlus className="w-4 h-4" /> Crear usuario
                </Button>
              </div>

              {showCreateUser && (
                <div className="rounded-xl border border-purple-500/30 bg-card p-4 space-y-3" data-testid="create-user-form">
                  <h3 className="font-bold text-sm">Nuevo usuario Zitadel</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs">Nombre</Label><Input value={newUser.firstName} onChange={e => setNewUser({...newUser, firstName: e.target.value})} placeholder="Juan" /></div>
                    <div><Label className="text-xs">Apellido</Label><Input value={newUser.lastName} onChange={e => setNewUser({...newUser, lastName: e.target.value})} placeholder="Pérez" /></div>
                    <div><Label className="text-xs">Email</Label><Input type="email" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} placeholder="juan@empresa.com" /></div>
                    <div><Label className="text-xs">Contraseña</Label><Input type="password" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} placeholder="Min. 8 caracteres" /></div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => setShowCreateUser(false)}>Cancelar</Button>
                    <Button size="sm" className="bg-purple-500 hover:bg-purple-400 text-white" onClick={createUser}>Crear</Button>
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-border bg-card overflow-hidden" data-testid="zitadel-users-table">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-[10px] text-muted-foreground uppercase tracking-wider">
                      <th className="text-left p-3">Usuario</th>
                      <th className="p-3">Email</th>
                      <th className="p-3">Estado</th>
                      <th className="p-3">Tipo</th>
                      <th className="p-3">ID</th>
                      <th className="p-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => (
                      <tr key={u.userId} className="border-b border-border last:border-0 hover:bg-muted/10">
                        <td className="p-3 font-medium">
                          {u.human?.profile?.givenName} {u.human?.profile?.familyName}
                          {u.machine && <span className="text-muted-foreground">{u.machine?.name}</span>}
                        </td>
                        <td className="p-3 text-center text-xs text-muted-foreground">
                          {u.human?.email?.email || u.preferredLoginName || '-'}
                        </td>
                        <td className="p-3 text-center">
                          <Badge className={`text-[10px] ${
                            u.state === 'USER_STATE_ACTIVE' ? 'bg-green-500/10 text-green-400 border-green-500/30' :
                            u.state === 'USER_STATE_INITIAL' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
                            'bg-muted text-muted-foreground'
                          }`}>
                            {u.state?.replace('USER_STATE_', '') || 'unknown'}
                          </Badge>
                        </td>
                        <td className="p-3 text-center">
                          <Badge variant="outline" className="text-[10px]">
                            {u.human ? 'human' : 'machine'}
                          </Badge>
                        </td>
                        <td className="p-3 text-center font-mono text-[10px] text-muted-foreground">{u.userId?.slice(0, 12)}...</td>
                        <td className="p-3 text-right">
                          <Button size="sm" variant="ghost" onClick={() => deleteUser(u.userId)} className="text-red-400 hover:text-red-300 h-7">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Orgs Tab */}
          {!loading && activeTab === 'orgs' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button size="sm" onClick={() => setShowCreateOrg(!showCreateOrg)} className="bg-purple-500 hover:bg-purple-400 text-white gap-1" data-testid="create-org-btn">
                  <Building2 className="w-4 h-4" /> Crear organización
                </Button>
              </div>

              {showCreateOrg && (
                <div className="rounded-xl border border-purple-500/30 bg-card p-4 space-y-3">
                  <h3 className="font-bold text-sm">Nueva organización</h3>
                  <Input value={newOrgName} onChange={e => setNewOrgName(e.target.value)} placeholder="Nombre de la organización" />
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => setShowCreateOrg(false)}>Cancelar</Button>
                    <Button size="sm" className="bg-purple-500 hover:bg-purple-400 text-white" onClick={createOrg}>Crear</Button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {orgs.map((org) => (
                  <div key={org.organizationId || org.id} className="rounded-xl border border-border bg-card p-4" data-testid={`zt-org-${org.organizationId || org.id}`}>
                    <div className="flex items-center gap-3 mb-2">
                      <Building2 className="w-5 h-5 text-purple-400" />
                      <div>
                        <h3 className="font-bold text-sm">{org.name}</h3>
                        <p className="text-[10px] text-muted-foreground font-mono">{org.organizationId || org.id}</p>
                      </div>
                    </div>
                    <Badge className={`text-[10px] ${
                      org.state === 'ORG_STATE_ACTIVE' ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-muted text-muted-foreground'
                    }`}>
                      {org.state?.replace('ORG_STATE_', '') || 'active'}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Roles Tab */}
          {!loading && activeTab === 'roles' && (
            <div className="space-y-3">
              {roles.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No se encontraron proyectos/roles</p>
              ) : (
                roles.map((p) => (
                  <div key={p.id} className="rounded-xl border border-border bg-card p-4">
                    <h3 className="font-bold">{p.name}</h3>
                    <p className="text-xs text-muted-foreground font-mono">{p.id}</p>
                    <Badge variant="outline" className="mt-2 text-[10px]">{p.state?.replace('PROJECT_STATE_', '') || '-'}</Badge>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Grants Tab */}
          {!loading && activeTab === 'grants' && (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              {grants.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No se encontraron grants de usuario</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-[10px] text-muted-foreground uppercase tracking-wider">
                      <th className="text-left p-3">Usuario ID</th>
                      <th className="p-3">Proyecto ID</th>
                      <th className="p-3">Roles</th>
                      <th className="p-3">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grants.map((g, i) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        <td className="p-3 font-mono text-xs">{g.userId}</td>
                        <td className="p-3 font-mono text-xs text-center">{g.projectId}</td>
                        <td className="p-3 text-center">
                          {(g.roleKeys || []).map((r, j) => (
                            <Badge key={j} variant="outline" className="text-[10px] mr-1">{r}</Badge>
                          ))}
                        </td>
                        <td className="p-3 text-center">
                          <Badge className="text-[10px] bg-green-500/10 text-green-400 border-green-500/30">
                            {g.state?.replace('USER_GRANT_STATE_', '') || '-'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
