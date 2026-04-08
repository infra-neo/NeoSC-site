import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Monitor, Globe, Trash2 } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function WorkspacesPage() {
  const { getAuthHeader, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [marketVms, setMarketVms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);

  const loadData = async () => {
    try {
      const mvRes = await axios.get(`${API}/market/my-vms`, { headers: getAuthHeader() }).catch(() => ({ data: { vms: [] } }));
      setMarketVms(mvRes.data.vms || []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const deleteVm = async (vmId) => {
    if (!window.confirm('¿Eliminar esta VM? Esta acción no se puede deshacer.')) return;
    setDeleting(vmId);
    try {
      await axios.delete(`${API}/market/vms/${vmId}`, { headers: getAuthHeader() });
      toast.success('VM eliminada correctamente');
      setMarketVms(prev => prev.filter(v => v.id !== vmId));
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al eliminar VM');
    }
    setDeleting(null);
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
      <main className="lg:ml-56 p-6 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </main>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="lg:ml-56 p-6">
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
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-sm">{vm.lxd_instance_name}</span>
                      <span className="text-muted-foreground text-xs ml-2 hidden sm:inline">· {vm.tunnel_hostname}</span>
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
                      onClick={() => window.open(vm.connection_url || 'https://web.proxy.kappa4.com/', '_blank')}
                    >
                      <Globe className="w-3 h-3" /> Abrir HTML5
                    </Button>
                    {isAdmin && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-red-400 hover:bg-red-500/10 h-8 w-8 p-0"
                        data-testid={`delete-vm-${vm.id}`}
                        onClick={() => deleteVm(vm.id)}
                        disabled={deleting === vm.id}
                      >
                        <Trash2 className={`w-3.5 h-3.5 ${deleting === vm.id ? 'animate-spin' : ''}`} />
                      </Button>
                    )}
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

          {marketVms.length === 0 && (
            <div className="text-center py-12 border border-dashed border-border rounded-2xl">
              <Monitor className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No tienes VMs Windows activas</p>
              <Button
                onClick={() => navigate('/market')}
                className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold gap-2 mt-4"
              >
                + Comprar VM Windows
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
