import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAdminStats, getAdminUsers, getAdminOrders, getVMs } from '../services/api';
import { 
  Monitor, Users, Server, ShoppingCart, LayoutDashboard,
  LogOut, User, ArrowUpRight, Activity, Clock, CheckCircle,
  AlertCircle, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const Admin = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [vms, setVMs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.role !== 'platform_admin') {
      navigate('/dashboard');
      return;
    }

    const fetchData = async () => {
      try {
        const [statsRes, usersRes, ordersRes, vmsRes] = await Promise.all([
          getAdminStats(),
          getAdminUsers(),
          getAdminOrders(),
          getVMs()
        ]);
        setStats(statsRes.data);
        setUsers(usersRes.data);
        setOrders(ordersRes.data);
        setVMs(vmsRes.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [user, navigate]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const getStatusBadge = (status) => {
    const styles = {
      active: 'bg-green-500/20 text-green-400 border-green-500/30',
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
      <aside className="fixed left-0 top-0 bottom-0 w-64 bg-surface border-r border-custom p-4 flex flex-col">
        <Link to="/" className="flex items-center gap-2 mb-10">
          <Monitor className="w-8 h-8 text-brand-teal" />
          <span className="text-xl font-bold text-brand-teal">WinDesk</span>
        </Link>

        <nav className="flex-1 space-y-2">
          <Link
            to="/dashboard"
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-muted2 hover:bg-elevated hover:text-white transition-colors"
            data-testid="nav-dashboard"
          >
            <LayoutDashboard className="w-5 h-5" />
            <span>Dashboard</span>
          </Link>
          <Link
            to="/admin"
            className="flex items-center gap-3 px-4 py-3 rounded-lg bg-brand-teal/10 text-brand-teal"
            data-testid="nav-admin"
          >
            <Activity className="w-5 h-5" />
            <span>Admin Panel</span>
          </Link>
        </nav>

        <div className="border-t border-custom pt-4">
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
            className="w-full justify-start text-muted-custom hover:text-red-400"
            onClick={handleLogout}
            data-testid="logout-btn"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-64 p-8">
        <div className="max-w-7xl">
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">Admin Panel</h1>
            <p className="text-muted-custom">Platform overview and management</p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            <div className="card-cyber p-6">
              <div className="flex items-center justify-between mb-2">
                <Users className="w-5 h-5 text-brand-teal" />
                <ArrowUpRight className="w-4 h-4 text-brand-green" />
              </div>
              <p className="text-3xl font-bold">{stats?.total_users || 0}</p>
              <p className="text-sm text-muted-custom">Total Users</p>
            </div>
            <div className="card-cyber p-6">
              <div className="flex items-center justify-between mb-2">
                <Server className="w-5 h-5 text-brand-blue" />
                <Activity className="w-4 h-4 text-muted-custom" />
              </div>
              <p className="text-3xl font-bold">{stats?.total_vms || 0}</p>
              <p className="text-sm text-muted-custom">Total VMs</p>
            </div>
            <div className="card-cyber p-6">
              <div className="flex items-center justify-between mb-2">
                <CheckCircle className="w-5 h-5 text-brand-green" />
              </div>
              <p className="text-3xl font-bold">{stats?.active_vms || 0}</p>
              <p className="text-sm text-muted-custom">Active VMs</p>
            </div>
            <div className="card-cyber p-6">
              <div className="flex items-center justify-between mb-2">
                <ShoppingCart className="w-5 h-5 text-brand-amber" />
              </div>
              <p className="text-3xl font-bold">{stats?.total_orders || 0}</p>
              <p className="text-sm text-muted-custom">Total Orders</p>
            </div>
            <div className="card-cyber p-6">
              <div className="flex items-center justify-between mb-2">
                <Clock className="w-5 h-5 text-brand-amber" />
              </div>
              <p className="text-3xl font-bold">{stats?.pending_orders || 0}</p>
              <p className="text-sm text-muted-custom">Pending Orders</p>
            </div>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="orders" className="space-y-6">
            <TabsList className="bg-elevated border border-custom">
              <TabsTrigger value="orders" data-testid="tab-orders">Orders</TabsTrigger>
              <TabsTrigger value="vms" data-testid="tab-vms">Virtual Machines</TabsTrigger>
              <TabsTrigger value="users" data-testid="tab-users">Users</TabsTrigger>
            </TabsList>

            <TabsContent value="orders">
              <div className="card-cyber overflow-hidden">
                <div className="p-4 border-b border-custom">
                  <h2 className="font-semibold">Recent Orders</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-elevated text-sm text-muted-custom">
                      <tr>
                        <th className="text-left p-4">Order ID</th>
                        <th className="text-left p-4">Plan</th>
                        <th className="text-left p-4">Status</th>
                        <th className="text-left p-4">Amount</th>
                        <th className="text-left p-4">Date</th>
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
                            No orders yet
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="vms">
              <div className="card-cyber overflow-hidden">
                <div className="p-4 border-b border-custom">
                  <h2 className="font-semibold">All Virtual Machines</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-elevated text-sm text-muted-custom">
                      <tr>
                        <th className="text-left p-4">Name</th>
                        <th className="text-left p-4">Status</th>
                        <th className="text-left p-4">Specs</th>
                        <th className="text-left p-4">Region</th>
                        <th className="text-left p-4">IP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vms.map(vm => (
                        <tr key={vm.id} className="border-t border-custom hover:bg-elevated/50">
                          <td className="p-4">
                            <div>
                              <p className="font-medium">{vm.name}</p>
                              <p className="text-xs text-muted-custom mono">{vm.tunnel_hostname}</p>
                            </div>
                          </td>
                          <td className="p-4">
                            <span className={`px-2 py-1 rounded text-xs border ${getStatusBadge(vm.status)}`}>
                              {vm.status}
                            </span>
                          </td>
                          <td className="p-4 text-sm">
                            {vm.vcpu} vCPU • {vm.ram_gb}GB • {vm.disk_gb}GB
                          </td>
                          <td className="p-4">{vm.region}</td>
                          <td className="p-4 mono text-sm">{vm.netbird_ip}</td>
                        </tr>
                      ))}
                      {vms.length === 0 && (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-muted-custom">
                            No VMs provisioned yet
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="users">
              <div className="card-cyber overflow-hidden">
                <div className="p-4 border-b border-custom">
                  <h2 className="font-semibold">All Users</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-elevated text-sm text-muted-custom">
                      <tr>
                        <th className="text-left p-4">Name</th>
                        <th className="text-left p-4">Email</th>
                        <th className="text-left p-4">Role</th>
                        <th className="text-left p-4">Joined</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map(u => (
                        <tr key={u.id} className="border-t border-custom hover:bg-elevated/50">
                          <td className="p-4 font-medium">{u.name}</td>
                          <td className="p-4">{u.email}</td>
                          <td className="p-4">
                            <span className={`px-2 py-1 rounded text-xs ${
                              u.role === 'platform_admin' 
                                ? 'bg-brand-amber/20 text-brand-amber' 
                                : 'bg-brand-blue/20 text-brand-blue'
                            }`}>
                              {u.role}
                            </span>
                          </td>
                          <td className="p-4 text-sm text-muted-custom">
                            {new Date(u.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default Admin;
