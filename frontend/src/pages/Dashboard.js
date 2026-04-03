import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getVMs, getOrders, getVMMetrics } from '../services/api';
import { 
  Monitor, Plus, ExternalLink, RefreshCw, Cpu, HardDrive, 
  Activity, Globe, LogOut, Settings, User, LayoutDashboard,
  Clock, CheckCircle, AlertCircle, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

const Dashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [vms, setVMs] = useState([]);
  const [orders, setOrders] = useState([]);
  const [metrics, setMetrics] = useState({});
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [vmsRes, ordersRes] = await Promise.all([
        getVMs(),
        getOrders()
      ]);
      setVMs(vmsRes.data);
      setOrders(ordersRes.data);
      
      // Fetch metrics for each VM
      const metricsPromises = vmsRes.data.map(vm => 
        getVMMetrics(vm.id).then(res => ({ id: vm.id, ...res.data })).catch(() => null)
      );
      const metricsResults = await Promise.all(metricsPromises);
      const metricsMap = {};
      metricsResults.filter(Boolean).forEach(m => { metricsMap[m.id] = m; });
      setMetrics(metricsMap);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);

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
      restarting: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    };
    return styles[status] || styles.pending;
  };

  const pendingOrders = orders.filter(o => ['pending', 'paid', 'provisioning'].includes(o.status));

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
            className="flex items-center gap-3 px-4 py-3 rounded-lg bg-brand-teal/10 text-brand-teal"
            data-testid="nav-dashboard"
          >
            <LayoutDashboard className="w-5 h-5" />
            <span>Dashboard</span>
          </Link>
          
          {user?.role === 'platform_admin' && (
            <Link
              to="/admin"
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-muted2 hover:bg-elevated hover:text-white transition-colors"
              data-testid="nav-admin"
            >
              <Settings className="w-5 h-5" />
              <span>Admin Panel</span>
            </Link>
          )}
        </nav>

        <div className="border-t border-custom pt-4">
          <div className="flex items-center gap-3 px-4 py-2 mb-2">
            <div className="w-10 h-10 rounded-full bg-brand-teal/20 flex items-center justify-center">
              <User className="w-5 h-5 text-brand-teal" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-xs text-muted-custom truncate">{user?.email}</p>
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
        <div className="max-w-6xl">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold mb-2">Welcome back, {user?.name?.split(' ')[0]}</h1>
              <p className="text-muted-custom">Manage your virtual desktops</p>
            </div>
            <Link to="/plans">
              <Button className="btn-cyber" data-testid="new-vm-btn">
                <Plus className="w-4 h-4 mr-2" />
                New Desktop
              </Button>
            </Link>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-brand-teal animate-spin" />
            </div>
          ) : (
            <>
              {/* Pending Orders */}
              {pendingOrders.length > 0 && (
                <div className="mb-8">
                  <h2 className="text-xl font-semibold mb-4">In Progress</h2>
                  <div className="space-y-4">
                    {pendingOrders.map(order => (
                      <div key={order.id} className="card-cyber p-6" data-testid={`order-${order.id}`}>
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h3 className="font-semibold">{order.plan_name} Plan</h3>
                            <p className="text-sm text-muted-custom">Order #{order.id}</p>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusBadge(order.status)}`}>
                            {order.status === 'provisioning' ? (
                              <span className="flex items-center gap-1">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                {order.provisioning_step?.replace(/_/g, ' ')}
                              </span>
                            ) : order.status}
                          </span>
                        </div>
                        
                        {order.status === 'pending' && (
                          <Link to={`/checkout/${order.plan_id}?order=${order.id}`}>
                            <Button className="btn-cyber-outline" size="sm" data-testid={`complete-payment-${order.id}`}>
                              Complete Payment
                            </Button>
                          </Link>
                        )}
                        
                        {order.status === 'provisioning' && (
                          <div className="space-y-2">
                            <Progress value={getProvisioningProgress(order.provisioning_step)} className="h-2" />
                            <p className="text-xs text-muted-custom">Setting up your Windows desktop...</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* VMs */}
              <div>
                <h2 className="text-xl font-semibold mb-4">Your Desktops</h2>
                {vms.length === 0 ? (
                  <div className="card-cyber p-12 text-center">
                    <Monitor className="w-16 h-16 text-muted-custom mx-auto mb-4" />
                    <h3 className="text-xl font-semibold mb-2">No desktops yet</h3>
                    <p className="text-muted-custom mb-6">Create your first Windows desktop in the cloud</p>
                    <Link to="/plans">
                      <Button className="btn-cyber" data-testid="create-first-vm-btn">
                        <Plus className="w-4 h-4 mr-2" />
                        Create Desktop
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="grid gap-6">
                    {vms.map(vm => (
                      <div key={vm.id} className="card-cyber p-6" data-testid={`vm-card-${vm.id}`}>
                        <div className="flex items-start justify-between mb-6">
                          <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-lg bg-brand-teal/10 flex items-center justify-center">
                              <Monitor className="w-7 h-7 text-brand-teal" />
                            </div>
                            <div>
                              <h3 className="text-xl font-semibold">{vm.name}</h3>
                              <p className="text-sm text-muted-custom mono">{vm.tunnel_hostname}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`status-dot ${vm.status === 'active' ? 'status-dot-active' : 'status-dot-pending'}`} />
                            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusBadge(vm.status)}`}>
                              {vm.status}
                            </span>
                          </div>
                        </div>

                        {/* Specs */}
                        <div className="grid grid-cols-4 gap-4 mb-6">
                          <div className="bg-elevated rounded-lg p-3">
                            <div className="flex items-center gap-2 text-muted-custom text-xs mb-1">
                              <Cpu className="w-3 h-3" />
                              CPU
                            </div>
                            <p className="font-semibold">{vm.vcpu} vCPU</p>
                          </div>
                          <div className="bg-elevated rounded-lg p-3">
                            <div className="flex items-center gap-2 text-muted-custom text-xs mb-1">
                              <Activity className="w-3 h-3" />
                              RAM
                            </div>
                            <p className="font-semibold">{vm.ram_gb} GB</p>
                          </div>
                          <div className="bg-elevated rounded-lg p-3">
                            <div className="flex items-center gap-2 text-muted-custom text-xs mb-1">
                              <HardDrive className="w-3 h-3" />
                              Storage
                            </div>
                            <p className="font-semibold">{vm.disk_gb} GB</p>
                          </div>
                          <div className="bg-elevated rounded-lg p-3">
                            <div className="flex items-center gap-2 text-muted-custom text-xs mb-1">
                              <Globe className="w-3 h-3" />
                              Region
                            </div>
                            <p className="font-semibold">{vm.region}</p>
                          </div>
                        </div>

                        {/* Metrics */}
                        {metrics[vm.id] && (
                          <div className="grid grid-cols-3 gap-4 mb-6">
                            <div>
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-muted-custom">CPU Usage</span>
                                <span className="text-brand-teal">{metrics[vm.id].cpu_percent}%</span>
                              </div>
                              <Progress value={metrics[vm.id].cpu_percent} className="h-1.5" />
                            </div>
                            <div>
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-muted-custom">RAM Usage</span>
                                <span className="text-brand-blue">{metrics[vm.id].ram_percent}%</span>
                              </div>
                              <Progress value={metrics[vm.id].ram_percent} className="h-1.5" />
                            </div>
                            <div>
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-muted-custom">Disk Usage</span>
                                <span className="text-brand-amber">{metrics[vm.id].disk_percent}%</span>
                              </div>
                              <Progress value={metrics[vm.id].disk_percent} className="h-1.5" />
                            </div>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-3">
                          <a
                            href={`https://${vm.tunnel_hostname}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button className="btn-cyber" data-testid={`connect-vm-${vm.id}`}>
                              <ExternalLink className="w-4 h-4 mr-2" />
                              Connect
                            </Button>
                          </a>
                          <Link to={`/vm/${vm.id}`}>
                            <Button variant="outline" className="btn-cyber-outline" data-testid={`manage-vm-${vm.id}`}>
                              Manage
                            </Button>
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

const getProvisioningProgress = (step) => {
  const steps = {
    creating_vm: 15,
    installing_windows: 35,
    configuring_network: 50,
    installing_tsplus: 65,
    configuring_netbird: 80,
    creating_tunnel: 90,
    finalizing: 95,
    completed: 100,
  };
  return steps[step] || 0;
};

export default Dashboard;
