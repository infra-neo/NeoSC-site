import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Monitor, Globe, Play, Square, RefreshCw, Camera, Shield, ExternalLink } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function WorkspacesPage() {
  const { getAuthHeader } = useAuth();
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState([]);
  const [marketVms, setMarketVms] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const [wsRes, mvRes] = await Promise.all([
        axios.get(`${API}/workspaces`, { headers: getAuthHeader() }),
        axios.get(`${API}/market/my-vms`, { headers: getAuthHeader() }).catch(() => ({ data: { vms: [] } })),
      ]);
      setWorkspaces(wsRes.data);
      setMarketVms(mvRes.data.vms || []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const launchWorkspace = async (wsId) => {
    try {
      const res = await axios.post(`${API}/workspaces/${wsId}/launch`, {}, { headers: getAuthHeader() });
      const { connection_url, launch_mode } = res.data;
      if (launch_mode === 'new_tab' && connection_url) {
        window.open(connection_url, '_blank');
      } else if (connection_url) {
        navigate(`/viewer/${res.data.session_id}`);
      }
      toast.success('Workspace iniciado');
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al iniciar workspace');
    }
  };

  const stopWorkspace = async (wsId) => {
    try {
      await axios.post(`${API}/workspaces/${wsId}/stop`, {}, { headers: getAuthHeader() });
      toast.success('Workspace detenido');
      loadData();
    } catch { /* ignore */ }
  };

  const statusColor = (s) => {
    if (s === 'running') return 'bg-green-500';
    if (s === 'available') return 'bg-cyan-500';
    if (s === 'error') return 'bg-red-500';
    return 'bg-muted-foreground';
  };

  if (loading) return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:ml-64 p-6 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </main>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="lg:ml-64 p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold" data-testid="workspaces-title">Workspaces</h1>
              <p className="text-muted-foreground text-sm mt-1">
                Gestiona tus escritorios y aplicaciones remotas
              </p>
            </div>
            <Button
              onClick={() => navigate('/market')}
              className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold gap-2"
              data-testid="add-vm-button"
            >
              + Comprar VM Windows
            </Button>
          </div>

          {/* Market VMs */}
          {marketVms.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                VMs Windows VDI (Market)
              </h2>
              {marketVms.map((vm) => (
                <div key={vm.id} className="rounded-xl border border-border bg-card overflow-hidden" data-testid={`market-vm-${vm.id}`}>
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/20">
                    <div className={`w-2.5 h-2.5 rounded-full ${statusColor(vm.status)} shadow-lg`} />
                    <div className="flex-1">
                      <span className="font-bold text-sm">{vm.lxd_instance_name}</span>
                      <span className="text-muted-foreground text-xs ml-2">· {vm.tunnel_hostname}</span>
                    </div>
                    {vm.order && (
                      <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-xs">
                        {vm.order.neosc_plan}
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      className="bg-cyan-500 hover:bg-cyan-400 text-black gap-1"
                      data-testid={`open-html5-${vm.id}`}
                      onClick={() => window.open('https://web.proxy.kappa4.com/', '_blank')}
                    >
                      <Globe className="w-3 h-3" /> Abrir HTML5
                    </Button>
                  </div>
                  <div className="px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground text-xs">CPU</span>
                      <div className="font-medium">{vm.vcpu} vCPU</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">RAM</span>
                      <div className="font-medium">{vm.ram_gb} GB</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Disco</span>
                      <div className="font-medium">{vm.disk_gb} GB NVMe</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">TSplus</span>
                      <div className="font-medium">{vm.tsplus_licenses} licencias</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Default Workspaces */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Workspaces disponibles
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {workspaces.map((ws) => (
                <div key={ws.id} className="rounded-xl border border-border bg-card p-4" data-testid={`workspace-${ws.id}`}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-2 h-2 rounded-full ${statusColor(ws.status)}`} />
                    <h3 className="font-bold text-sm flex-1">{ws.name}</h3>
                    <Badge variant="outline" className="text-xs">
                      {ws.connection_type || ws.type}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">{ws.description}</p>
                  <div className="text-xs text-muted-foreground mb-3">
                    {ws.cpu} · {ws.memory} · {ws.storage}
                  </div>
                  <div className="flex gap-2">
                    {ws.status === 'running' ? (
                      <Button size="sm" variant="outline" onClick={() => stopWorkspace(ws.id)}>
                        <Square className="w-3 h-3 mr-1" /> Detener
                      </Button>
                    ) : (
                      <Button size="sm" className="bg-cyan-500 hover:bg-cyan-400 text-black" onClick={() => launchWorkspace(ws.id)}>
                        <Play className="w-3 h-3 mr-1" /> Iniciar
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
