import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getVM, getVMMetrics, restartVM, createSnapshot, getAccessUrl } from '../services/api';
import { 
  Monitor, ArrowLeft, ExternalLink, RefreshCw, Camera, 
  Cpu, HardDrive, Activity, Globe, Clock, Shield,
  Terminal, Loader2, AlertCircle, CheckCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

const VMDetail = () => {
  const { vmId } = useParams();
  const navigate = useNavigate();
  const [vm, setVM] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [accessUrls, setAccessUrls] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [message, setMessage] = useState(null);

  const fetchData = async () => {
    try {
      const [vmRes, metricsRes, accessRes] = await Promise.all([
        getVM(vmId),
        getVMMetrics(vmId),
        getAccessUrl(vmId)
      ]);
      setVM(vmRes.data);
      setMetrics(metricsRes.data);
      setAccessUrls(accessRes.data);
    } catch (err) {
      console.error(err);
      if (err.response?.status === 404) {
        navigate('/dashboard');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [vmId]);

  const handleRestart = async () => {
    setActionLoading('restart');
    setMessage(null);
    try {
      await restartVM(vmId);
      setMessage({ type: 'success', text: 'VM restart initiated' });
      fetchData();
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to restart VM' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleSnapshot = async () => {
    setActionLoading('snapshot');
    setMessage(null);
    try {
      const res = await createSnapshot(vmId);
      setMessage({ type: 'success', text: `Snapshot created: ${res.data.snapshot_id}` });
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to create snapshot' });
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-teal animate-spin" />
      </div>
    );
  }

  if (!vm) return null;

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      {/* Header */}
      <header className="border-b border-custom">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/dashboard" className="text-muted-custom hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl font-bold">{vm.name}</h1>
              <p className="text-sm text-muted-custom mono">{vm.tunnel_hostname}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`status-dot ${vm.status === 'active' ? 'status-dot-active' : 'status-dot-pending'}`} />
            <span className="text-sm capitalize">{vm.status}</span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Message */}
        {message && (
          <div className={`flex items-center gap-2 p-4 mb-6 rounded-lg border ${
            message.type === 'success' 
              ? 'bg-green-500/10 border-green-500/30 text-green-400' 
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}>
            {message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <span>{message.text}</span>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Quick Actions */}
            <div className="card-cyber p-6">
              <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
              <div className="flex flex-wrap gap-3">
                <a href="https://web.tsplus.html5/" target="_blank" rel="noopener noreferrer">
                  <Button className="btn-cyber" data-testid="connect-tsplus">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Conectar via TSplus
                  </Button>
                </a>
                {accessUrls?.panel_url && (
                  <a href={accessUrls.panel_url} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" className="btn-cyber-outline" data-testid="connect-1panel">
                      <Terminal className="w-4 h-4 mr-2" />
                      Conectar via 1Panel
                    </Button>
                  </a>
                )}
                <Button 
                  variant="outline" 
                  className="btn-cyber-outline"
                  onClick={handleRestart}
                  disabled={actionLoading === 'restart'}
                  data-testid="restart-vm"
                >
                  {actionLoading === 'restart' ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  Restart
                </Button>
                <Button 
                  variant="outline" 
                  className="btn-cyber-outline"
                  onClick={handleSnapshot}
                  disabled={actionLoading === 'snapshot'}
                  data-testid="create-snapshot"
                >
                  {actionLoading === 'snapshot' ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Camera className="w-4 h-4 mr-2" />
                  )}
                  Snapshot
                </Button>
              </div>
            </div>

            {/* Metrics */}
            {metrics && (
              <div className="card-cyber p-6">
                <h2 className="text-lg font-semibold mb-4">Resource Usage</h2>
                <div className="grid md:grid-cols-3 gap-6">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 text-sm text-muted-custom">
                        <Cpu className="w-4 h-4" />
                        CPU
                      </div>
                      <span className="text-brand-teal font-semibold">{metrics.cpu_percent}%</span>
                    </div>
                    <Progress value={metrics.cpu_percent} className="h-2" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 text-sm text-muted-custom">
                        <Activity className="w-4 h-4" />
                        RAM
                      </div>
                      <span className="text-brand-blue font-semibold">{metrics.ram_percent}%</span>
                    </div>
                    <Progress value={metrics.ram_percent} className="h-2" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 text-sm text-muted-custom">
                        <HardDrive className="w-4 h-4" />
                        Disk
                      </div>
                      <span className="text-brand-amber font-semibold">{metrics.disk_percent}%</span>
                    </div>
                    <Progress value={metrics.disk_percent} className="h-2" />
                  </div>
                </div>
                
                <div className="grid md:grid-cols-2 gap-4 mt-6 pt-6 border-t border-custom">
                  <div className="bg-elevated p-4 rounded-lg">
                    <p className="text-xs text-muted-custom mb-1">Network In</p>
                    <p className="font-semibold">{metrics.network_in_mb} MB/s</p>
                  </div>
                  <div className="bg-elevated p-4 rounded-lg">
                    <p className="text-xs text-muted-custom mb-1">Network Out</p>
                    <p className="font-semibold">{metrics.network_out_mb} MB/s</p>
                  </div>
                </div>
              </div>
            )}

            {/* Access Info */}
            <div className="card-cyber p-6">
              <h2 className="text-lg font-semibold mb-4">Access Information</h2>
              <div className="terminal">
                <div className="terminal-header">
                  <span className="terminal-dot terminal-dot-red" />
                  <span className="terminal-dot terminal-dot-yellow" />
                  <span className="terminal-dot terminal-dot-green" />
                </div>
                <div className="space-y-2 text-sm">
                  <p><span className="text-brand-teal">TSplus URL:</span> https://web.tsplus.html5/</p>
                  {accessUrls?.panel_url && (
                    <p><span className="text-brand-amber">1Panel URL:</span> {accessUrls.panel_url}</p>
                  )}
                  <p><span className="text-brand-blue">NetBird IP:</span> {accessUrls?.rdp_ip}</p>
                  <p><span className="text-muted-custom">Internal IP:</span> {accessUrls?.internal_ip}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Specs */}
            <div className="card-cyber p-6">
              <h2 className="text-lg font-semibold mb-4">Specifications</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-muted-custom">
                    <Cpu className="w-4 h-4" />
                    <span>vCPU</span>
                  </div>
                  <span className="font-semibold">{vm.vcpu} cores</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-muted-custom">
                    <Activity className="w-4 h-4" />
                    <span>RAM</span>
                  </div>
                  <span className="font-semibold">{vm.ram_gb} GB</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-muted-custom">
                    <HardDrive className="w-4 h-4" />
                    <span>Storage</span>
                  </div>
                  <span className="font-semibold">{vm.disk_gb} GB SSD</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-muted-custom">
                    <Globe className="w-4 h-4" />
                    <span>Region</span>
                  </div>
                  <span className="font-semibold">{vm.region}</span>
                </div>
              </div>
            </div>

            {/* Features */}
            <div className="card-cyber p-6">
              <h2 className="text-lg font-semibold mb-4">Features</h2>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="w-4 h-4 text-brand-green" />
                  <span>Windows 11 Pro</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="w-4 h-4 text-brand-green" />
                  <span>TSplus HTML5 Access</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="w-4 h-4 text-brand-green" />
                  <span>NetBird Zero Trust</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="w-4 h-4 text-brand-green" />
                  <span>Cloudflare Tunnel</span>
                </div>
              </div>
            </div>

            {/* Created */}
            <div className="card-cyber p-6">
              <div className="flex items-center gap-2 text-muted-custom text-sm">
                <Clock className="w-4 h-4" />
                <span>Created {new Date(vm.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default VMDetail;
