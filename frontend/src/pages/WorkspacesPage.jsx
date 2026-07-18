import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Monitor, Globe, Trash2, Terminal, Server, Network, Cpu, MemoryStick } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function WorkspacesPage() {
  const { getAuthHeader, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [vms, setVms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);

  const loadData = async () => {
    try {
      const res = await axios.get(`${API}/market/my-vms`, { headers: getAuthHeader() }).catch(() => ({ data: { vms: [] } }));
      setVms(res.data.vms || []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const deleteVm = async (vmId) => {
    if (!window.confirm('¿Eliminar este workspace?')) return;
    setDeleting(vmId);
    try {
      await axios.delete(`${API}/market/vms/${vmId}`, { headers: getAuthHeader() });
      toast.success('Workspace eliminado');
      setVms(prev => prev.filter(v => v.id !== vmId));
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error');
    }
    setDeleting(null);
  };

  const [acting, setActing] = useState(null); // `${vmId}:${action}`

  const connectViaGuacamole = async (vm) => {
    try {
      const res = await axios.get(`${API}/market/vms/${vm.id}/guacamole-link`, { headers: getAuthHeader() });
      window.open(res.data.url, '_blank');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo abrir la sesión Guacamole');
    }
  };

  const vmAction = async (vm, action) => {
    const key = `${vm.id}:${action}`;
    setActing(key);
    try {
      const res = await axios.post(`${API}/market/vms/${vm.id}/action`, { action }, { headers: getAuthHeader() });
      toast.success(`${action} ejecutado — estado: ${res.data.status}`);
      setVms(prev => prev.map(v => v.id === vm.id ? { ...v, status: res.data.status } : v));
    } catch (err) {
      toast.error(err.response?.data?.detail || `Error ejecutando ${action}`);
    }
    setActing(null);
  };

  const statusColor = (s) => {
    const sl = (s || '').toLowerCase();
    if (['running', 'available'].includes(sl)) return 'bg-green-500';
    if (['stopped', 'error'].includes(sl)) return 'bg-red-500';
    if (sl === 'provisioning') return 'bg-amber-500 animate-pulse';
    return 'bg-muted-foreground';
  };

  const getConnectionButton = (vm) => {
    const source = vm.source || '';
    const hasHtml5 = vm.connection_url && (vm.connection_url.startsWith('http') || vm.tsplus_licenses > 0);
    const hasIp = vm.ipv4 || (vm.connection_url && vm.connection_url.startsWith('ssh://'));

    // Prioridad 1: conexión real registrada en Guacamole (NeoDesk) — RDP nativo
    // vía el IP real de NetBird, no la URL genérica del proxy.
    if (vm.guacamole_connection_id) {
      return (
        <Button size="sm" className="bg-purple-500 hover:bg-purple-400 text-black gap-1" data-testid={`open-guac-${vm.id}`}
          onClick={() => connectViaGuacamole(vm)}>
          <Monitor className="w-3 h-3" /> RDP (Guacamole)
        </Button>
      );
    }

    if (hasHtml5) {
      return (
        <Button size="sm" className="bg-cyan-500 hover:bg-cyan-400 text-black gap-1" data-testid={`open-html5-${vm.id}`}
          onClick={() => window.open(vm.connection_url || 'https://web.proxy.kappa4.com/', '_blank')}>
          <Globe className="w-3 h-3" /> HTML5
        </Button>
      );
    }
    if (source === 'lxd' || hasIp) {
      const ip = vm.ipv4 || vm.connection_url?.replace('ssh://', '') || '';
      const user = vm.ssh_user || 'neosc';
      return (
        <div className="flex gap-1">
          <Button size="sm" variant="outline" className="gap-1 text-xs h-7" data-testid={`ssh-${vm.id}`}
            onClick={() => { navigator.clipboard.writeText(`ssh ${user}@${ip}`); toast.success(`Copiado: ssh ${user}@${ip}`); }}>
            <Terminal className="w-3 h-3" /> SSH
          </Button>
          {isAdmin && (
            <Button size="sm" variant="outline" className="gap-1 text-xs h-7" onClick={() => navigate('/admin/lxd')}>
              <Server className="w-3 h-3" /> LXD
            </Button>
          )}
        </div>
      );
    }
    return (
      <Button size="sm" className="bg-cyan-500 hover:bg-cyan-400 text-black gap-1" data-testid={`open-${vm.id}`}
        onClick={() => window.open('https://web.proxy.kappa4.com/', '_blank')}>
        <Globe className="w-3 h-3" /> Conectar
      </Button>
    );
  };

  if (loading) return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:ml-56 p-6 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </main>
    </div>
  );

  // Separate VMs by source
  const tsplusVms = vms.filter(v => v.source !== 'lxd');
  const lxdVms = vms.filter(v => v.source === 'lxd');

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="lg:ml-56 p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold" data-testid="workspaces-title">Workspaces</h1>
              <p className="text-muted-foreground text-sm mt-1">Escritorios, servidores y aplicaciones remotas</p>
            </div>
            <Button onClick={() => navigate('/market')} className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold gap-2" data-testid="add-vm-button">
              + Nuevo Workspace
            </Button>
          </div>

          {/* TSplus / Windows VDI */}
          {tsplusVms.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Globe className="w-3.5 h-3.5 text-cyan-400" /> Windows VDI (TSplus)
              </h2>
              {tsplusVms.map((vm) => (
                <div key={vm.id} className="rounded-xl border border-border bg-card overflow-hidden" data-testid={`ws-${vm.id}`}>
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/20">
                    <div className={`w-2.5 h-2.5 rounded-full ${statusColor(vm.status)} shadow-lg`} />
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-sm">{vm.lxd_instance_name || vm.name}</span>
                      {vm.netbird_ip && <span className="text-cyan-400 text-xs ml-2 font-mono">{vm.netbird_ip}</span>}
                      {vm.html5_access_url && (
                        <span className="text-muted-foreground text-xs ml-2 hidden md:inline truncate">· {vm.html5_access_url.replace(/^https?:\/\//, '')}</span>
                      )}
                    </div>
                    {vm.order && <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-xs">{vm.order.neosc_plan}</Badge>}
                    {getConnectionButton(vm)}
                    {isAdmin && vm.source === 'opennebula-marketplace' && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="text-xs h-7 px-2" data-testid={`start-${vm.id}`}
                          disabled={acting === `${vm.id}:start`} onClick={() => vmAction(vm, 'start')}>
                          {acting === `${vm.id}:start` ? '…' : 'Start'}
                        </Button>
                        <Button size="sm" variant="outline" className="text-xs h-7 px-2" data-testid={`stop-${vm.id}`}
                          disabled={acting === `${vm.id}:stop`} onClick={() => vmAction(vm, 'stop')}>
                          {acting === `${vm.id}:stop` ? '…' : 'Stop'}
                        </Button>
                        <Button size="sm" variant="outline" className="text-xs h-7 px-2" data-testid={`reboot-${vm.id}`}
                          disabled={acting === `${vm.id}:reboot`} onClick={() => vmAction(vm, 'reboot')}>
                          {acting === `${vm.id}:reboot` ? '…' : 'Reboot'}
                        </Button>
                      </div>
                    )}
                    {isAdmin && (
                      <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-red-400 hover:bg-red-500/10 h-8 w-8 p-0"
                        data-testid={`delete-${vm.id}`} onClick={() => deleteVm(vm.id)} disabled={deleting === vm.id}>
                        <Trash2 className={`w-3.5 h-3.5 ${deleting === vm.id ? 'animate-spin' : ''}`} />
                      </Button>
                    )}
                  </div>
                  <div className="px-4 py-2.5 grid grid-cols-2 md:grid-cols-5 gap-4 text-xs">
                    <div><span className="text-muted-foreground">CPU</span><div className="font-medium">{vm.vcpu} vCPU</div></div>
                    <div><span className="text-muted-foreground">RAM</span><div className="font-medium">{vm.ram_gb} GB</div></div>
                    <div><span className="text-muted-foreground">Disco</span><div className="font-medium">{vm.disk_gb} GB</div></div>
                    <div><span className="text-muted-foreground">TSplus</span><div className="font-medium">{vm.tsplus_licenses} licencias</div></div>
                    <div><span className="text-muted-foreground">NeoMesh</span><div className="font-medium font-mono text-[11px]">{vm.netbird_ip || '—'}</div></div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* LXD Instances */}
          {lxdVms.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Server className="w-3.5 h-3.5 text-purple-400" /> Linux Containers / VMs (LXD)
              </h2>
              {lxdVms.map((vm) => (
                <div key={vm.id} className="rounded-xl border border-border bg-card overflow-hidden" data-testid={`ws-${vm.id}`}>
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/20">
                    <div className={`w-2.5 h-2.5 rounded-full ${statusColor(vm.status)} shadow-lg`} />
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-sm">{vm.lxd_instance_name}</span>
                      {vm.ipv4 && <span className="text-cyan-400 text-xs ml-2 font-mono">{vm.ipv4}</span>}
                      <span className="text-muted-foreground text-xs ml-2 hidden sm:inline">· {vm.lxd_project || 'NeoSC'}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px]">{vm.instance_type === 'virtual-machine' ? 'VM' : 'CT'}</Badge>
                    {vm.addons?.length > 0 && vm.addons.map(a => (
                      <Badge key={a} className="bg-green-500/10 text-green-400 border-green-500/30 text-[10px]">{a}</Badge>
                    ))}
                    {getConnectionButton(vm)}
                    {isAdmin && (
                      <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-red-400 hover:bg-red-500/10 h-8 w-8 p-0"
                        data-testid={`delete-${vm.id}`} onClick={() => deleteVm(vm.id)} disabled={deleting === vm.id}>
                        <Trash2 className={`w-3.5 h-3.5 ${deleting === vm.id ? 'animate-spin' : ''}`} />
                      </Button>
                    )}
                  </div>
                  <div className="px-4 py-2.5 grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                    <div><span className="text-muted-foreground">CPU</span><div className="font-medium flex items-center gap-1"><Cpu className="w-3 h-3 text-cyan-400" />{vm.vcpu || '—'} vCPU</div></div>
                    <div><span className="text-muted-foreground">RAM</span><div className="font-medium flex items-center gap-1"><MemoryStick className="w-3 h-3 text-purple-400" />{vm.ram_gb || '—'} GB</div></div>
                    <div><span className="text-muted-foreground">Disco</span><div className="font-medium">{vm.disk_gb || '—'} GB</div></div>
                    <div><span className="text-muted-foreground">SSH User</span><div className="font-medium font-mono">{vm.ssh_user || '—'}</div></div>
                    <div><span className="text-muted-foreground">NetBird</span><div className="font-medium">{vm.netbird_setup_key ? <Network className="w-3.5 h-3.5 text-green-400 inline" /> : '—'}</div></div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {vms.length === 0 && (
            <div className="text-center py-12 border border-dashed border-border rounded-2xl">
              <Monitor className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No tienes workspaces activos</p>
              <Button onClick={() => navigate('/market')} className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold gap-2 mt-4">
                + Nuevo Workspace
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
