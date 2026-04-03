import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  getAdminStats, getAdminUsers, getAdminOrders, getAdminVMs,
  getAdminGroups, getAdminRoles, getAdminAcls, getAdminPolicies,
  createAdminUser, updateAdminUser, deleteAdminUser,
  createAdminGroup, updateAdminGroup, deleteAdminGroup, addGroupMember, removeGroupMember,
  createAdminRole, updateAdminRole, deleteAdminRole,
  createAdminAcl, updateAdminAcl, deleteAdminAcl,
  createAdminPolicy, updateAdminPolicy, deleteAdminPolicy,
  createAdminVM, updateAdminVM, deleteAdminVM
} from '../services/api';
import {
  Monitor, Users, Server, ShoppingCart, LayoutDashboard,
  LogOut, User, ArrowUpRight, Activity, Clock, CheckCircle,
  AlertCircle, Loader2, Plus, Trash2, Edit, Shield, Key,
  FileText, UserPlus, Settings, Link2, FolderTree, Lock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';

const Admin = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [vms, setVMs] = useState([]);
  const [groups, setGroups] = useState([]);
  const [roles, setRoles] = useState([]);
  const [acls, setAcls] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');

  // Modal states
  const [showUserModal, setShowUserModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showAclModal, setShowAclModal] = useState(false);
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [showVMModal, setShowVMModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [selectedVM, setSelectedVM] = useState(null);

  useEffect(() => {
    if (user?.role !== 'platform_admin') {
      navigate('/dashboard');
      return;
    }
    fetchAllData();
  }, [user, navigate]);

  const fetchAllData = async () => {
    try {
      const [statsRes, usersRes, ordersRes, vmsRes, groupsRes, rolesRes, aclsRes, policiesRes] = await Promise.all([
        getAdminStats(),
        getAdminUsers(),
        getAdminOrders(),
        getAdminVMs(),
        getAdminGroups(),
        getAdminRoles(),
        getAdminAcls(),
        getAdminPolicies()
      ]);
      setStats(statsRes.data);
      setUsers(usersRes.data);
      setOrders(ordersRes.data);
      setVMs(vmsRes.data);
      setGroups(groupsRes.data);
      setRoles(rolesRes.data);
      setAcls(aclsRes.data);
      setPolicies(policiesRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const getStatusBadge = (status) => {
    const styles = {
      active: 'bg-green-500/20 text-green-400 border-green-500/30',
      available: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
      provisioning: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      pending: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      paid: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
      error: 'bg-red-500/20 text-red-400 border-red-500/30',
    };
    return styles[status] || styles.pending;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-teal animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-64 bg-surface border-r border-custom p-4 flex flex-col overflow-y-auto">
        <Link to="/" className="flex items-center gap-2 mb-8">
          <Monitor className="w-8 h-8 text-brand-teal" />
          <span className="text-xl font-bold text-brand-teal">WinDesk</span>
        </Link>

        <nav className="flex-1 space-y-1">
          <Link
            to="/dashboard"
            className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-muted2 hover:bg-elevated hover:text-white transition-colors text-sm"
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Dashboard</span>
          </Link>
          
          <div className="pt-4 pb-2">
            <p className="px-4 text-xs font-semibold text-muted-custom uppercase tracking-wider">Administración</p>
          </div>
          
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors ${activeTab === 'dashboard' ? 'bg-brand-teal/10 text-brand-teal' : 'text-muted2 hover:bg-elevated hover:text-white'}`}
          >
            <Activity className="w-4 h-4" />
            <span>Panel General</span>
          </button>
          
          <button
            onClick={() => setActiveTab('users')}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors ${activeTab === 'users' ? 'bg-brand-teal/10 text-brand-teal' : 'text-muted2 hover:bg-elevated hover:text-white'}`}
          >
            <Users className="w-4 h-4" />
            <span>Usuarios</span>
          </button>
          
          <button
            onClick={() => setActiveTab('groups')}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors ${activeTab === 'groups' ? 'bg-brand-teal/10 text-brand-teal' : 'text-muted2 hover:bg-elevated hover:text-white'}`}
          >
            <FolderTree className="w-4 h-4" />
            <span>Grupos</span>
          </button>
          
          <button
            onClick={() => setActiveTab('roles')}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors ${activeTab === 'roles' ? 'bg-brand-teal/10 text-brand-teal' : 'text-muted2 hover:bg-elevated hover:text-white'}`}
          >
            <Shield className="w-4 h-4" />
            <span>Roles</span>
          </button>
          
          <button
            onClick={() => setActiveTab('vms')}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors ${activeTab === 'vms' ? 'bg-brand-teal/10 text-brand-teal' : 'text-muted2 hover:bg-elevated hover:text-white'}`}
          >
            <Server className="w-4 h-4" />
            <span>Máquinas Virtuales</span>
          </button>
          
          <button
            onClick={() => setActiveTab('acls')}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors ${activeTab === 'acls' ? 'bg-brand-teal/10 text-brand-teal' : 'text-muted2 hover:bg-elevated hover:text-white'}`}
          >
            <Lock className="w-4 h-4" />
            <span>ACLs</span>
          </button>
          
          <button
            onClick={() => setActiveTab('policies')}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors ${activeTab === 'policies' ? 'bg-brand-teal/10 text-brand-teal' : 'text-muted2 hover:bg-elevated hover:text-white'}`}
          >
            <FileText className="w-4 h-4" />
            <span>Políticas</span>
          </button>
          
          <button
            onClick={() => setActiveTab('orders')}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors ${activeTab === 'orders' ? 'bg-brand-teal/10 text-brand-teal' : 'text-muted2 hover:bg-elevated hover:text-white'}`}
          >
            <ShoppingCart className="w-4 h-4" />
            <span>Órdenes</span>
          </button>
        </nav>

        <div className="border-t border-custom pt-4 mt-4">
          <div className="flex items-center gap-3 px-4 py-2 mb-2">
            <div className="w-10 h-10 rounded-full bg-brand-teal/20 flex items-center justify-center">
              <User className="w-5 h-5 text-brand-teal" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-xs text-brand-amber truncate">Platform Admin</p>
            </div>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-custom hover:text-red-400 text-sm"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Cerrar Sesión
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-64 p-8">
        <div className="max-w-7xl">
          {/* Dashboard Tab */}
          {activeTab === 'dashboard' && (
            <DashboardTab stats={stats} users={users} vms={vms} groups={groups} policies={policies} getStatusBadge={getStatusBadge} />
          )}

          {/* Users Tab */}
          {activeTab === 'users' && (
            <UsersTab 
              users={users} 
              groups={groups}
              onRefresh={fetchAllData}
              getStatusBadge={getStatusBadge}
            />
          )}

          {/* Groups Tab */}
          {activeTab === 'groups' && (
            <GroupsTab 
              groups={groups} 
              users={users}
              onRefresh={fetchAllData}
            />
          )}

          {/* Roles Tab */}
          {activeTab === 'roles' && (
            <RolesTab 
              roles={roles}
              onRefresh={fetchAllData}
            />
          )}

          {/* VMs Tab */}
          {activeTab === 'vms' && (
            <VMsTab 
              vms={vms}
              users={users}
              groups={groups}
              onRefresh={fetchAllData}
              getStatusBadge={getStatusBadge}
            />
          )}

          {/* ACLs Tab */}
          {activeTab === 'acls' && (
            <ACLsTab 
              acls={acls}
              vms={vms}
              onRefresh={fetchAllData}
            />
          )}

          {/* Policies Tab */}
          {activeTab === 'policies' && (
            <PoliciesTab 
              policies={policies}
              users={users}
              groups={groups}
              vms={vms}
              acls={acls}
              onRefresh={fetchAllData}
            />
          )}

          {/* Orders Tab */}
          {activeTab === 'orders' && (
            <OrdersTab orders={orders} getStatusBadge={getStatusBadge} />
          )}
        </div>
      </main>
    </div>
  );
};

// Dashboard Tab Component
const DashboardTab = ({ stats, users, vms, groups, policies, getStatusBadge }) => (
  <>
    <div className="mb-8">
      <h1 className="text-3xl font-bold mb-2">Panel de Administración</h1>
      <p className="text-muted-custom">Vista general de la plataforma</p>
    </div>

    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
      <div className="card-cyber p-6">
        <div className="flex items-center justify-between mb-2">
          <Users className="w-5 h-5 text-brand-teal" />
          <ArrowUpRight className="w-4 h-4 text-brand-green" />
        </div>
        <p className="text-3xl font-bold">{stats?.total_users || 0}</p>
        <p className="text-sm text-muted-custom">Usuarios</p>
      </div>
      <div className="card-cyber p-6">
        <div className="flex items-center justify-between mb-2">
          <Server className="w-5 h-5 text-brand-blue" />
        </div>
        <p className="text-3xl font-bold">{stats?.total_vms || 0}</p>
        <p className="text-sm text-muted-custom">VMs Totales</p>
      </div>
      <div className="card-cyber p-6">
        <div className="flex items-center justify-between mb-2">
          <CheckCircle className="w-5 h-5 text-brand-green" />
        </div>
        <p className="text-3xl font-bold">{stats?.active_vms || 0}</p>
        <p className="text-sm text-muted-custom">VMs Activas</p>
      </div>
      <div className="card-cyber p-6">
        <div className="flex items-center justify-between mb-2">
          <FolderTree className="w-5 h-5 text-brand-amber" />
        </div>
        <p className="text-3xl font-bold">{groups?.length || 0}</p>
        <p className="text-sm text-muted-custom">Grupos</p>
      </div>
      <div className="card-cyber p-6">
        <div className="flex items-center justify-between mb-2">
          <FileText className="w-5 h-5 text-brand-red" />
        </div>
        <p className="text-3xl font-bold">{policies?.length || 0}</p>
        <p className="text-sm text-muted-custom">Políticas</p>
      </div>
    </div>

    {/* Quick Overview */}
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="card-cyber p-6">
        <h3 className="font-semibold mb-4">VMs Disponibles</h3>
        <div className="space-y-3">
          {vms.filter(vm => vm.status === 'available' || vm.status === 'active').slice(0, 4).map(vm => (
            <div key={vm.id} className="flex items-center justify-between p-3 bg-elevated rounded-lg">
              <div className="flex items-center gap-3">
                <Server className="w-4 h-4 text-brand-teal" />
                <div>
                  <p className="text-sm font-medium">{vm.name}</p>
                  <p className="text-xs text-muted-custom">{vm.internal_ip}</p>
                </div>
              </div>
              <span className={`px-2 py-1 rounded text-xs border ${getStatusBadge(vm.status)}`}>
                {vm.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="card-cyber p-6">
        <h3 className="font-semibold mb-4">Usuarios Recientes</h3>
        <div className="space-y-3">
          {users.slice(0, 4).map(u => (
            <div key={u.id} className="flex items-center justify-between p-3 bg-elevated rounded-lg">
              <div className="flex items-center gap-3">
                <User className="w-4 h-4 text-brand-blue" />
                <div>
                  <p className="text-sm font-medium">{u.name}</p>
                  <p className="text-xs text-muted-custom">{u.email}</p>
                </div>
              </div>
              <span className={`px-2 py-1 rounded text-xs ${u.role === 'platform_admin' ? 'bg-brand-amber/20 text-brand-amber' : 'bg-brand-blue/20 text-brand-blue'}`}>
                {u.role}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </>
);

// Users Tab Component
const UsersTab = ({ users, groups, onRefresh, getStatusBadge }) => {
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({ email: '', password: '', name: '', role: 'customer' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingUser) {
        await updateAdminUser(editingUser.id, { name: formData.name, role: formData.role, enabled: formData.enabled });
      } else {
        await createAdminUser(formData);
      }
      setShowModal(false);
      setEditingUser(null);
      setFormData({ email: '', password: '', name: '', role: 'customer' });
      onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (userId) => {
    if (window.confirm('¿Estás seguro de eliminar este usuario?')) {
      await deleteAdminUser(userId);
      onRefresh();
    }
  };

  const openEdit = (user) => {
    setEditingUser(user);
    setFormData({ email: user.email, name: user.name, role: user.role, enabled: user.enabled !== false });
    setShowModal(true);
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Gestión de Usuarios</h1>
          <p className="text-muted-custom">Administra los usuarios de la plataforma</p>
        </div>
        <Button className="btn-cyber" onClick={() => { setEditingUser(null); setFormData({ email: '', password: '', name: '', role: 'customer' }); setShowModal(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Usuario
        </Button>
      </div>

      <div className="card-cyber overflow-hidden">
        <table className="w-full">
          <thead className="bg-elevated text-sm text-muted-custom">
            <tr>
              <th className="text-left p-4">Usuario</th>
              <th className="text-left p-4">Email</th>
              <th className="text-left p-4">Rol</th>
              <th className="text-left p-4">Grupos</th>
              <th className="text-left p-4">Estado</th>
              <th className="text-left p-4">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-t border-custom hover:bg-elevated/50">
                <td className="p-4 font-medium">{u.name}</td>
                <td className="p-4">{u.email}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded text-xs ${u.role === 'platform_admin' ? 'bg-brand-amber/20 text-brand-amber' : 'bg-brand-blue/20 text-brand-blue'}`}>
                    {u.role}
                  </span>
                </td>
                <td className="p-4 text-sm text-muted-custom">
                  {u.group_ids?.length || 0} grupos
                </td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded text-xs ${u.enabled !== false ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {u.enabled !== false ? 'Activo' : 'Deshabilitado'}
                  </span>
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(u)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="text-red-400" onClick={() => handleDelete(u.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="bg-surface border-custom">
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!editingUser && (
              <>
                <div>
                  <Label>Email</Label>
                  <Input value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} required />
                </div>
                <div>
                  <Label>Contraseña</Label>
                  <Input type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} required />
                </div>
              </>
            )}
            <div>
              <Label>Nombre</Label>
              <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
            </div>
            <div>
              <Label>Rol</Label>
              <Select value={formData.role} onValueChange={v => setFormData({...formData, role: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">Customer</SelectItem>
                  <SelectItem value="platform_admin">Platform Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editingUser && (
              <div className="flex items-center gap-2">
                <Switch checked={formData.enabled} onCheckedChange={v => setFormData({...formData, enabled: v})} />
                <Label>Usuario activo</Label>
              </div>
            )}
            <Button type="submit" className="w-full btn-cyber">
              {editingUser ? 'Guardar Cambios' : 'Crear Usuario'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

// Groups Tab Component
const GroupsTab = ({ groups, users, onRefresh }) => {
  const [showModal, setShowModal] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [formData, setFormData] = useState({ name: '', description: '' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingGroup) {
        await updateAdminGroup(editingGroup.id, formData);
      } else {
        await createAdminGroup(formData);
      }
      setShowModal(false);
      setEditingGroup(null);
      setFormData({ name: '', description: '' });
      onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (groupId) => {
    if (window.confirm('¿Estás seguro de eliminar este grupo?')) {
      await deleteAdminGroup(groupId);
      onRefresh();
    }
  };

  const handleAddMember = async (userId) => {
    await addGroupMember(selectedGroup.id, userId);
    onRefresh();
  };

  const handleRemoveMember = async (memberId) => {
    await removeGroupMember(selectedGroup.id, memberId);
    onRefresh();
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Gestión de Grupos</h1>
          <p className="text-muted-custom">Organiza usuarios en grupos de trabajo</p>
        </div>
        <Button className="btn-cyber" onClick={() => { setEditingGroup(null); setFormData({ name: '', description: '' }); setShowModal(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Grupo
        </Button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {groups.map(group => (
          <div key={group.id} className="card-cyber p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-brand-teal/10 flex items-center justify-center">
                  <FolderTree className="w-5 h-5 text-brand-teal" />
                </div>
                <div>
                  <h3 className="font-semibold">{group.name}</h3>
                  <p className="text-xs text-muted-custom">{group.member_ids?.length || 0} miembros</p>
                </div>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => { setEditingGroup(group); setFormData({ name: group.name, description: group.description }); setShowModal(true); }}>
                  <Edit className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" className="text-red-400" onClick={() => handleDelete(group.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <p className="text-sm text-muted2 mb-4">{group.description}</p>
            <Button variant="outline" size="sm" className="w-full btn-cyber-outline" onClick={() => { setSelectedGroup(group); setShowMembersModal(true); }}>
              <Users className="w-4 h-4 mr-2" />
              Gestionar Miembros
            </Button>
          </div>
        ))}
      </div>

      {/* Create/Edit Group Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="bg-surface border-custom">
          <DialogHeader>
            <DialogTitle>{editingGroup ? 'Editar Grupo' : 'Nuevo Grupo'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Nombre</Label>
              <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
            </div>
            <div>
              <Label>Descripción</Label>
              <Input value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
            </div>
            <Button type="submit" className="w-full btn-cyber">
              {editingGroup ? 'Guardar Cambios' : 'Crear Grupo'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Members Modal */}
      <Dialog open={showMembersModal} onOpenChange={setShowMembersModal}>
        <DialogContent className="bg-surface border-custom max-w-lg">
          <DialogHeader>
            <DialogTitle>Miembros de {selectedGroup?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Agregar Usuario</Label>
              <Select onValueChange={handleAddMember}>
                <SelectTrigger><SelectValue placeholder="Seleccionar usuario..." /></SelectTrigger>
                <SelectContent>
                  {users.filter(u => !selectedGroup?.member_ids?.includes(u.id)).map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.name} ({u.email})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {selectedGroup?.member_ids?.map(memberId => {
                const member = users.find(u => u.id === memberId);
                return member ? (
                  <div key={memberId} className="flex items-center justify-between p-3 bg-elevated rounded-lg">
                    <div>
                      <p className="text-sm font-medium">{member.name}</p>
                      <p className="text-xs text-muted-custom">{member.email}</p>
                    </div>
                    <Button variant="ghost" size="sm" className="text-red-400" onClick={() => handleRemoveMember(memberId)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ) : null;
              })}
              {(!selectedGroup?.member_ids || selectedGroup.member_ids.length === 0) && (
                <p className="text-center text-muted-custom py-4">No hay miembros en este grupo</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

// Roles Tab Component
const RolesTab = ({ roles, onRefresh }) => {
  const [showModal, setShowModal] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [formData, setFormData] = useState({ name: '', description: '', permissions: [] });

  const allPermissions = [
    { id: 'manage_users', label: 'Gestionar Usuarios' },
    { id: 'manage_groups', label: 'Gestionar Grupos' },
    { id: 'manage_vms', label: 'Gestionar VMs' },
    { id: 'manage_acls', label: 'Gestionar ACLs' },
    { id: 'manage_policies', label: 'Gestionar Políticas' },
    { id: 'connect_all', label: 'Conectar a todas las VMs' },
    { id: 'connect_assigned', label: 'Conectar a VMs asignadas' },
    { id: 'view_all', label: 'Ver todo' },
    { id: 'view_own', label: 'Ver propio' },
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingRole) {
        await updateAdminRole(editingRole.id, formData);
      } else {
        await createAdminRole(formData);
      }
      setShowModal(false);
      setEditingRole(null);
      setFormData({ name: '', description: '', permissions: [] });
      onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (roleId) => {
    if (window.confirm('¿Estás seguro de eliminar este rol?')) {
      try {
        await deleteAdminRole(roleId);
        onRefresh();
      } catch (err) {
        alert(err.response?.data?.detail || 'Error al eliminar');
      }
    }
  };

  const togglePermission = (permId) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permId)
        ? prev.permissions.filter(p => p !== permId)
        : [...prev.permissions, permId]
    }));
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Gestión de Roles</h1>
          <p className="text-muted-custom">Define roles y permisos</p>
        </div>
        <Button className="btn-cyber" onClick={() => { setEditingRole(null); setFormData({ name: '', description: '', permissions: [] }); setShowModal(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Rol
        </Button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {roles.map(role => (
          <div key={role.id} className="card-cyber p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-brand-blue/10 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-brand-blue" />
                </div>
                <div>
                  <h3 className="font-semibold">{role.name}</h3>
                  <p className="text-xs text-muted-custom">{role.permissions?.length || 0} permisos</p>
                </div>
              </div>
              {!role.id.startsWith('role-admin') && !role.id.startsWith('role-operator') && !role.id.startsWith('role-user') && (
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => { setEditingRole(role); setFormData({ name: role.name, description: role.description, permissions: role.permissions }); setShowModal(true); }}>
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="text-red-400" onClick={() => handleDelete(role.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
            <p className="text-sm text-muted2 mb-4">{role.description}</p>
            <div className="flex flex-wrap gap-1">
              {role.permissions?.slice(0, 3).map(perm => (
                <span key={perm} className="px-2 py-1 bg-elevated rounded text-xs text-muted2">{perm}</span>
              ))}
              {role.permissions?.length > 3 && (
                <span className="px-2 py-1 bg-elevated rounded text-xs text-muted2">+{role.permissions.length - 3}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="bg-surface border-custom">
          <DialogHeader>
            <DialogTitle>{editingRole ? 'Editar Rol' : 'Nuevo Rol'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Nombre</Label>
              <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
            </div>
            <div>
              <Label>Descripción</Label>
              <Input value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
            </div>
            <div>
              <Label className="mb-2 block">Permisos</Label>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 bg-elevated rounded-lg">
                {allPermissions.map(perm => (
                  <div key={perm.id} className="flex items-center gap-2">
                    <Checkbox 
                      checked={formData.permissions.includes(perm.id)} 
                      onCheckedChange={() => togglePermission(perm.id)}
                    />
                    <span className="text-sm">{perm.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <Button type="submit" className="w-full btn-cyber">
              {editingRole ? 'Guardar Cambios' : 'Crear Rol'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

// VMs Tab Component
const VMsTab = ({ vms, users, groups, onRefresh, getStatusBadge }) => {
  const [showModal, setShowModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [editingVM, setEditingVM] = useState(null);
  const [selectedVM, setSelectedVM] = useState(null);
  const [formData, setFormData] = useState({ name: '', internal_ip: '', vcpu: 2, ram_gb: 4, disk_gb: 80, region: 'eu-west', has_tsplus: true, panel_port: '' });
  const [assignData, setAssignData] = useState({ user_ids: [], group_ids: [] });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = { ...formData, panel_port: formData.panel_port ? parseInt(formData.panel_port) : null };
      if (editingVM) {
        await updateAdminVM(editingVM.id, data);
      } else {
        await createAdminVM(data);
      }
      setShowModal(false);
      setEditingVM(null);
      onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (vmId) => {
    if (window.confirm('¿Estás seguro de eliminar esta VM?')) {
      await deleteAdminVM(vmId);
      onRefresh();
    }
  };

  const openAssign = (vm) => {
    setSelectedVM(vm);
    setAssignData({ user_ids: vm.assigned_user_ids || [], group_ids: vm.assigned_group_ids || [] });
    setShowAssignModal(true);
  };

  const handleAssign = async () => {
    try {
      await updateAdminVM(selectedVM.id, { assigned_user_ids: assignData.user_ids, assigned_group_ids: assignData.group_ids });
      setShowAssignModal(false);
      onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Gestión de Máquinas Virtuales</h1>
          <p className="text-muted-custom">Administra las VMs y asigna accesos</p>
        </div>
        <Button className="btn-cyber" onClick={() => { setEditingVM(null); setFormData({ name: '', internal_ip: '', vcpu: 2, ram_gb: 4, disk_gb: 80, region: 'eu-west', has_tsplus: true, panel_port: '' }); setShowModal(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          Nueva VM
        </Button>
      </div>

      <div className="card-cyber overflow-hidden">
        <table className="w-full">
          <thead className="bg-elevated text-sm text-muted-custom">
            <tr>
              <th className="text-left p-4">Nombre</th>
              <th className="text-left p-4">IP</th>
              <th className="text-left p-4">Specs</th>
              <th className="text-left p-4">Estado</th>
              <th className="text-left p-4">Asignaciones</th>
              <th className="text-left p-4">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {vms.map(vm => (
              <tr key={vm.id} className="border-t border-custom hover:bg-elevated/50">
                <td className="p-4">
                  <div>
                    <p className="font-medium">{vm.name}</p>
                    <p className="text-xs text-muted-custom mono">{vm.id}</p>
                  </div>
                </td>
                <td className="p-4 mono text-sm">{vm.internal_ip}</td>
                <td className="p-4 text-sm">{vm.vcpu} vCPU • {vm.ram_gb}GB • {vm.disk_gb}GB</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded text-xs border ${getStatusBadge(vm.status)}`}>{vm.status}</span>
                </td>
                <td className="p-4 text-sm">
                  <span className="text-brand-teal">{vm.assigned_user_ids?.length || 0}</span> usuarios, 
                  <span className="text-brand-blue ml-1">{vm.assigned_group_ids?.length || 0}</span> grupos
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openAssign(vm)} title="Asignar acceso">
                      <Link2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => { setEditingVM(vm); setFormData({ name: vm.name, internal_ip: vm.internal_ip, vcpu: vm.vcpu, ram_gb: vm.ram_gb, disk_gb: vm.disk_gb, region: vm.region, has_tsplus: vm.has_tsplus, panel_port: vm.panel_port || '' }); setShowModal(true); }}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="text-red-400" onClick={() => handleDelete(vm.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create/Edit VM Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="bg-surface border-custom">
          <DialogHeader>
            <DialogTitle>{editingVM ? 'Editar VM' : 'Nueva VM'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Nombre</Label>
              <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
            </div>
            <div>
              <Label>IP Interna</Label>
              <Input value={formData.internal_ip} onChange={e => setFormData({...formData, internal_ip: e.target.value})} placeholder="10.100.10.xxx" required />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>vCPU</Label>
                <Input type="number" value={formData.vcpu} onChange={e => setFormData({...formData, vcpu: parseInt(e.target.value)})} />
              </div>
              <div>
                <Label>RAM (GB)</Label>
                <Input type="number" value={formData.ram_gb} onChange={e => setFormData({...formData, ram_gb: parseInt(e.target.value)})} />
              </div>
              <div>
                <Label>Disco (GB)</Label>
                <Input type="number" value={formData.disk_gb} onChange={e => setFormData({...formData, disk_gb: parseInt(e.target.value)})} />
              </div>
            </div>
            <div>
              <Label>Región</Label>
              <Select value={formData.region} onValueChange={v => setFormData({...formData, region: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="eu-west">EU West</SelectItem>
                  <SelectItem value="eu-central">EU Central</SelectItem>
                  <SelectItem value="us-east">US East</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Puerto 1Panel (opcional)</Label>
              <Input type="number" value={formData.panel_port} onChange={e => setFormData({...formData, panel_port: e.target.value})} placeholder="33491" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={formData.has_tsplus} onCheckedChange={v => setFormData({...formData, has_tsplus: v})} />
              <Label>TSplus habilitado</Label>
            </div>
            <Button type="submit" className="w-full btn-cyber">
              {editingVM ? 'Guardar Cambios' : 'Crear VM'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign Modal */}
      <Dialog open={showAssignModal} onOpenChange={setShowAssignModal}>
        <DialogContent className="bg-surface border-custom max-w-lg">
          <DialogHeader>
            <DialogTitle>Asignar Acceso a {selectedVM?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">Usuarios con acceso</Label>
              <div className="space-y-2 max-h-40 overflow-y-auto p-2 bg-elevated rounded-lg">
                {users.map(u => (
                  <div key={u.id} className="flex items-center gap-2">
                    <Checkbox 
                      checked={assignData.user_ids.includes(u.id)} 
                      onCheckedChange={(checked) => {
                        setAssignData(prev => ({
                          ...prev,
                          user_ids: checked 
                            ? [...prev.user_ids, u.id]
                            : prev.user_ids.filter(id => id !== u.id)
                        }));
                      }}
                    />
                    <span className="text-sm">{u.name} ({u.email})</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <Label className="mb-2 block">Grupos con acceso</Label>
              <div className="space-y-2 max-h-40 overflow-y-auto p-2 bg-elevated rounded-lg">
                {groups.map(g => (
                  <div key={g.id} className="flex items-center gap-2">
                    <Checkbox 
                      checked={assignData.group_ids.includes(g.id)} 
                      onCheckedChange={(checked) => {
                        setAssignData(prev => ({
                          ...prev,
                          group_ids: checked 
                            ? [...prev.group_ids, g.id]
                            : prev.group_ids.filter(id => id !== g.id)
                        }));
                      }}
                    />
                    <span className="text-sm">{g.name}</span>
                  </div>
                ))}
              </div>
            </div>
            <Button onClick={handleAssign} className="w-full btn-cyber">
              Guardar Asignaciones
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

// ACLs Tab Component
const ACLsTab = ({ acls, vms, onRefresh }) => {
  const [showModal, setShowModal] = useState(false);
  const [editingAcl, setEditingAcl] = useState(null);
  const [formData, setFormData] = useState({ name: '', description: '', resource_type: 'vm', resource_ids: [], allowed_actions: [], enabled: true });

  const allActions = [
    { id: 'connect_tsplus', label: 'Conectar via TSplus' },
    { id: 'connect_1panel', label: 'Conectar via 1Panel' },
    { id: 'restart', label: 'Reiniciar VM' },
    { id: 'snapshot', label: 'Crear Snapshot' },
    { id: 'view', label: 'Ver información' },
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingAcl) {
        await updateAdminAcl(editingAcl.id, formData);
      } else {
        await createAdminAcl(formData);
      }
      setShowModal(false);
      setEditingAcl(null);
      onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (aclId) => {
    if (window.confirm('¿Estás seguro de eliminar esta ACL?')) {
      await deleteAdminAcl(aclId);
      onRefresh();
    }
  };

  const toggleAction = (actionId) => {
    setFormData(prev => ({
      ...prev,
      allowed_actions: prev.allowed_actions.includes(actionId)
        ? prev.allowed_actions.filter(a => a !== actionId)
        : [...prev.allowed_actions, actionId]
    }));
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Listas de Control de Acceso (ACLs)</h1>
          <p className="text-muted-custom">Define qué acciones pueden realizar los usuarios</p>
        </div>
        <Button className="btn-cyber" onClick={() => { setEditingAcl(null); setFormData({ name: '', description: '', resource_type: 'vm', resource_ids: [], allowed_actions: [], enabled: true }); setShowModal(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          Nueva ACL
        </Button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {acls.map(acl => (
          <div key={acl.id} className={`card-cyber p-6 ${!acl.enabled ? 'opacity-50' : ''}`}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${acl.enabled ? 'bg-brand-green/10' : 'bg-red-500/10'}`}>
                  <Lock className={`w-5 h-5 ${acl.enabled ? 'text-brand-green' : 'text-red-400'}`} />
                </div>
                <div>
                  <h3 className="font-semibold">{acl.name}</h3>
                  <p className="text-xs text-muted-custom">{acl.enabled ? 'Activa' : 'Deshabilitada'}</p>
                </div>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => { setEditingAcl(acl); setFormData({ ...acl }); setShowModal(true); }}>
                  <Edit className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" className="text-red-400" onClick={() => handleDelete(acl.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <p className="text-sm text-muted2 mb-4">{acl.description}</p>
            <div className="flex flex-wrap gap-1">
              {acl.allowed_actions?.map(action => (
                <span key={action} className="px-2 py-1 bg-brand-teal/10 text-brand-teal rounded text-xs">{action}</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="bg-surface border-custom">
          <DialogHeader>
            <DialogTitle>{editingAcl ? 'Editar ACL' : 'Nueva ACL'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Nombre</Label>
              <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
            </div>
            <div>
              <Label>Descripción</Label>
              <Input value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
            </div>
            <div>
              <Label>Tipo de Recurso</Label>
              <Select value={formData.resource_type} onValueChange={v => setFormData({...formData, resource_type: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="vm">VMs específicas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-2 block">Acciones Permitidas</Label>
              <div className="space-y-2 p-2 bg-elevated rounded-lg">
                {allActions.map(action => (
                  <div key={action.id} className="flex items-center gap-2">
                    <Checkbox 
                      checked={formData.allowed_actions.includes(action.id)} 
                      onCheckedChange={() => toggleAction(action.id)}
                    />
                    <span className="text-sm">{action.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={formData.enabled} onCheckedChange={v => setFormData({...formData, enabled: v})} />
              <Label>ACL activa</Label>
            </div>
            <Button type="submit" className="w-full btn-cyber">
              {editingAcl ? 'Guardar Cambios' : 'Crear ACL'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

// Policies Tab Component
const PoliciesTab = ({ policies, users, groups, vms, acls, onRefresh }) => {
  const [showModal, setShowModal] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState(null);
  const [formData, setFormData] = useState({ name: '', description: '', policy_type: 'user_vm', subject_type: 'user', subject_ids: [], vm_ids: [], acl_id: '', enabled: true });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingPolicy) {
        await updateAdminPolicy(editingPolicy.id, formData);
      } else {
        await createAdminPolicy(formData);
      }
      setShowModal(false);
      setEditingPolicy(null);
      onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (policyId) => {
    if (window.confirm('¿Estás seguro de eliminar esta política?')) {
      await deleteAdminPolicy(policyId);
      onRefresh();
    }
  };

  const toggleEnabled = async (policy) => {
    await updateAdminPolicy(policy.id, { enabled: !policy.enabled });
    onRefresh();
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Políticas de Acceso</h1>
          <p className="text-muted-custom">Asocia usuarios o grupos con VMs y define sus permisos</p>
        </div>
        <Button className="btn-cyber" onClick={() => { setEditingPolicy(null); setFormData({ name: '', description: '', policy_type: 'user_vm', subject_type: 'user', subject_ids: [], vm_ids: [], acl_id: '', enabled: true }); setShowModal(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          Nueva Política
        </Button>
      </div>

      <div className="card-cyber overflow-hidden">
        <table className="w-full">
          <thead className="bg-elevated text-sm text-muted-custom">
            <tr>
              <th className="text-left p-4">Política</th>
              <th className="text-left p-4">Tipo</th>
              <th className="text-left p-4">Sujetos</th>
              <th className="text-left p-4">VMs</th>
              <th className="text-left p-4">ACL</th>
              <th className="text-left p-4">Estado</th>
              <th className="text-left p-4">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {policies.map(policy => (
              <tr key={policy.id} className={`border-t border-custom hover:bg-elevated/50 ${!policy.enabled ? 'opacity-50' : ''}`}>
                <td className="p-4">
                  <div>
                    <p className="font-medium">{policy.name}</p>
                    <p className="text-xs text-muted-custom">{policy.description}</p>
                  </div>
                </td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded text-xs ${policy.subject_type === 'user' ? 'bg-brand-blue/20 text-brand-blue' : 'bg-brand-amber/20 text-brand-amber'}`}>
                    {policy.subject_type === 'user' ? 'Usuario' : 'Grupo'}
                  </span>
                </td>
                <td className="p-4 text-sm">{policy.subject_ids?.length || 0} {policy.subject_type === 'user' ? 'usuarios' : 'grupos'}</td>
                <td className="p-4 text-sm">{policy.vm_ids?.length || 0} VMs</td>
                <td className="p-4 text-sm">{acls.find(a => a.id === policy.acl_id)?.name || '-'}</td>
                <td className="p-4">
                  <Switch checked={policy.enabled} onCheckedChange={() => toggleEnabled(policy)} />
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => { setEditingPolicy(policy); setFormData({ ...policy }); setShowModal(true); }}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="text-red-400" onClick={() => handleDelete(policy.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {policies.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-custom">
                  No hay políticas configuradas
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="bg-surface border-custom max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingPolicy ? 'Editar Política' : 'Nueva Política'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Nombre</Label>
              <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
            </div>
            <div>
              <Label>Descripción</Label>
              <Input value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
            </div>
            <div>
              <Label>Tipo de Sujeto</Label>
              <Select value={formData.subject_type} onValueChange={v => setFormData({...formData, subject_type: v, subject_ids: []})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Usuarios</SelectItem>
                  <SelectItem value="group">Grupos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-2 block">{formData.subject_type === 'user' ? 'Usuarios' : 'Grupos'}</Label>
              <div className="space-y-2 max-h-32 overflow-y-auto p-2 bg-elevated rounded-lg">
                {(formData.subject_type === 'user' ? users : groups).map(item => (
                  <div key={item.id} className="flex items-center gap-2">
                    <Checkbox 
                      checked={formData.subject_ids.includes(item.id)} 
                      onCheckedChange={(checked) => {
                        setFormData(prev => ({
                          ...prev,
                          subject_ids: checked 
                            ? [...prev.subject_ids, item.id]
                            : prev.subject_ids.filter(id => id !== item.id)
                        }));
                      }}
                    />
                    <span className="text-sm">{item.name || item.email}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <Label className="mb-2 block">VMs</Label>
              <div className="space-y-2 max-h-32 overflow-y-auto p-2 bg-elevated rounded-lg">
                {vms.map(vm => (
                  <div key={vm.id} className="flex items-center gap-2">
                    <Checkbox 
                      checked={formData.vm_ids.includes(vm.id)} 
                      onCheckedChange={(checked) => {
                        setFormData(prev => ({
                          ...prev,
                          vm_ids: checked 
                            ? [...prev.vm_ids, vm.id]
                            : prev.vm_ids.filter(id => id !== vm.id)
                        }));
                      }}
                    />
                    <span className="text-sm">{vm.name} ({vm.internal_ip})</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <Label>ACL a aplicar</Label>
              <Select value={formData.acl_id} onValueChange={v => setFormData({...formData, acl_id: v})}>
                <SelectTrigger><SelectValue placeholder="Seleccionar ACL..." /></SelectTrigger>
                <SelectContent>
                  {acls.filter(a => a.enabled).map(acl => (
                    <SelectItem key={acl.id} value={acl.id}>{acl.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={formData.enabled} onCheckedChange={v => setFormData({...formData, enabled: v})} />
              <Label>Política activa</Label>
            </div>
            <Button type="submit" className="w-full btn-cyber">
              {editingPolicy ? 'Guardar Cambios' : 'Crear Política'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

// Orders Tab Component
const OrdersTab = ({ orders, getStatusBadge }) => (
  <>
    <div className="mb-6">
      <h1 className="text-2xl font-bold">Órdenes</h1>
      <p className="text-muted-custom">Historial de todas las órdenes</p>
    </div>

    <div className="card-cyber overflow-hidden">
      <table className="w-full">
        <thead className="bg-elevated text-sm text-muted-custom">
          <tr>
            <th className="text-left p-4">Order ID</th>
            <th className="text-left p-4">Plan</th>
            <th className="text-left p-4">Estado</th>
            <th className="text-left p-4">Monto</th>
            <th className="text-left p-4">Fecha</th>
          </tr>
        </thead>
        <tbody>
          {orders.map(order => (
            <tr key={order.id} className="border-t border-custom hover:bg-elevated/50">
              <td className="p-4 mono text-sm">{order.id}</td>
              <td className="p-4">{order.plan_name}</td>
              <td className="p-4">
                <span className={`px-2 py-1 rounded text-xs border ${getStatusBadge(order.status)}`}>
                  {order.status}
                </span>
              </td>
              <td className="p-4">${order.total_price}</td>
              <td className="p-4 text-sm text-muted-custom">
                {new Date(order.created_at).toLocaleDateString()}
              </td>
            </tr>
          ))}
          {orders.length === 0 && (
            <tr>
              <td colSpan={5} className="p-8 text-center text-muted-custom">
                No hay órdenes
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </>
);

export default Admin;
