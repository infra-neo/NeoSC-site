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
  Server, Cpu, MemoryStick, HardDrive, Play, Square,
  RefreshCw, Trash2, Plus, Wifi, WifiOff, Monitor, Loader2,
  ChevronDown, ChevronRight, Image, RotateCw
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function LxdAdminPage() {
  const { getAuthHeader } = useAuth();
  const headers = getAuthHeader();
  const [status, setStatus] = useState(null);
  const [instances, setInstances] = useState([]);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showImages, setShowImages] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '', instance_type: 'virtual-machine', image_alias: '',
    cpu: '4', memory: '8GiB', disk_size: '120GiB', description: '',
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [statusRes, instancesRes] = await Promise.all([
        axios.get(`${API}/lxd/status`, { headers }).catch(() => ({ data: { connected: false, error: 'No response' } })),
        axios.get(`${API}/lxd/instances`, { headers }).catch(() => ({ data: { instances: [] } })),
      ]);
      setStatus(statusRes.data);
      setInstances(instancesRes.data.instances || []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const loadImages = async () => {
    try {
      const res = await axios.get(`${API}/lxd/images`, { headers });
      setImages(res.data.images || []);
      setShowImages(true);
    } catch (err) {
      toast.error('Error cargando imágenes');
    }
  };

  useEffect(() => { loadData(); }, []);

  const doAction = async (name, action, force = false) => {
    setActionLoading(`${name}-${action}`);
    try {
      await axios.post(`${API}/lxd/instances/${name}/state`, { action, force }, { headers });
      toast.success(`${name}: ${action} OK`);
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || `Error en ${action}`);
    }
    setActionLoading(null);
  };

  const doDelete = async (name) => {
    if (!window.confirm(`¿Eliminar "${name}"? Esta acción no se puede deshacer.`)) return;
    setActionLoading(`${name}-delete`);
    try {
      await axios.delete(`${API}/lxd/instances/${name}?force=true`, { headers });
      toast.success(`${name} eliminada`);
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error eliminando');
    }
    setActionLoading(null);
  };

  const doCreate = async () => {
    if (!createForm.name || !createForm.image_alias) {
      toast.error('Nombre e imagen son requeridos');
      return;
    }
    setActionLoading('creating');
    try {
      const res = await axios.post(`${API}/lxd/instances`, createForm, { headers });
      if (res.data.ok) {
        toast.success(`VM "${createForm.name}" creada`);
        setShowCreate(false);
        setCreateForm({ name: '', instance_type: 'virtual-machine', image_alias: '', cpu: '4', memory: '8GiB', disk_size: '120GiB', description: '' });
        await loadData();
      } else {
        toast.error(res.data.error || 'Error creando');
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error creando VM');
    }
    setActionLoading(null);
  };

  const statusColor = (s) => {
    if (s === 'Running') return 'bg-green-500';
    if (s === 'Stopped') return 'bg-red-500';
    if (s === 'Frozen') return 'bg-blue-500';
    return 'bg-muted-foreground';
  };

  const statusBadge = (s) => {
    if (s === 'Running') return 'bg-green-500/10 text-green-400 border-green-500/30';
    if (s === 'Stopped') return 'bg-red-500/10 text-red-400 border-red-500/30';
    return 'bg-muted text-muted-foreground';
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="lg:ml-56 p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold" data-testid="lxd-title">NeoCloud — LXD Cluster</h1>
              <p className="text-muted-foreground text-sm mt-1">
                Administración de VMs para provisioning NeoCloud
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={loadData} className="gap-1" data-testid="lxd-refresh">
                <RefreshCw className="w-3 h-3" /> Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={loadImages} className="gap-1" data-testid="lxd-images-btn">
                <Image className="w-3 h-3" /> Imágenes
              </Button>
              <Button size="sm" onClick={() => setShowCreate(!showCreate)} className="bg-cyan-500 hover:bg-cyan-400 text-black gap-1" data-testid="lxd-create-btn">
                <Plus className="w-3 h-3" /> Crear VM
              </Button>
            </div>
          </div>

          {/* Connection Status */}
          <div className={`rounded-xl border p-4 flex items-center gap-4 ${
            status?.connected ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'
          }`} data-testid="lxd-status">
            {status?.connected ? <Wifi className="w-5 h-5 text-green-400" /> : <WifiOff className="w-5 h-5 text-red-400" />}
            <div className="flex-1">
              <div className="font-bold text-sm">
                {status?.connected ? 'Conectado al cluster LXD' : 'Sin conexión al LXD'}
              </div>
              <div className="text-xs text-muted-foreground">
                {status?.connected
                  ? `${status.server_name || 'LXD'} v${status.server_version || '?'} · API ${status.api_version || '?'} · Auth: ${status.auth || '?'}`
                  : status?.error || 'Verificando...'}
              </div>
            </div>
            <Badge className={status?.connected ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}>
              {status?.connected ? 'Online' : 'Offline'}
            </Badge>
          </div>

          {/* Create VM Form */}
          {showCreate && (
            <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-5 space-y-4" data-testid="lxd-create-form">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Server className="w-4 h-4 text-cyan-400" /> Crear nueva instancia
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs">Nombre *</Label>
                  <Input value={createForm.name} onChange={e => setCreateForm({...createForm, name: e.target.value})} placeholder="neosc-cliente-01" className="h-8 text-xs" data-testid="lxd-vm-name" />
                </div>
                <div>
                  <Label className="text-xs">Imagen *</Label>
                  <Input value={createForm.image_alias} onChange={e => setCreateForm({...createForm, image_alias: e.target.value})} placeholder="ubuntu/24.04" className="h-8 text-xs" data-testid="lxd-vm-image" />
                </div>
                <div>
                  <Label className="text-xs">CPU</Label>
                  <Input value={createForm.cpu} onChange={e => setCreateForm({...createForm, cpu: e.target.value})} className="h-8 text-xs" />
                </div>
                <div>
                  <Label className="text-xs">RAM</Label>
                  <Input value={createForm.memory} onChange={e => setCreateForm({...createForm, memory: e.target.value})} className="h-8 text-xs" />
                </div>
                <div>
                  <Label className="text-xs">Disco</Label>
                  <Input value={createForm.disk_size} onChange={e => setCreateForm({...createForm, disk_size: e.target.value})} className="h-8 text-xs" />
                </div>
                <div>
                  <Label className="text-xs">Tipo</Label>
                  <select value={createForm.instance_type} onChange={e => setCreateForm({...createForm, instance_type: e.target.value})} className="h-8 text-xs w-full rounded-md border border-border bg-background px-2">
                    <option value="virtual-machine">Virtual Machine</option>
                    <option value="container">Container</option>
                  </select>
                </div>
                <div className="col-span-2 flex items-end gap-2">
                  <Button size="sm" onClick={doCreate} disabled={actionLoading === 'creating'} className="bg-cyan-500 hover:bg-cyan-400 text-black gap-1 h-8" data-testid="lxd-create-submit">
                    {actionLoading === 'creating' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                    Crear
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowCreate(false)} className="h-8">
                    Cancelar
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Images list */}
          {showImages && images.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm">Imágenes disponibles ({images.length})</h3>
                <Button size="sm" variant="ghost" onClick={() => setShowImages(false)} className="h-6 text-xs">Cerrar</Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {images.map((img, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-muted/20 text-xs">
                    <Image className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{img.aliases?.join(', ') || img.fingerprint}</div>
                      <div className="text-muted-foreground truncate">{img.description || `${img.os} ${img.release}`}</div>
                    </div>
                    <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => {
                      setCreateForm({...createForm, image_alias: img.aliases?.[0] || img.fingerprint});
                      setShowCreate(true);
                    }}>
                      Usar
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Instances */}
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
            </div>
          ) : instances.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-border rounded-2xl">
              <Server className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">
                {status?.connected ? 'No hay instancias en el cluster' : 'Conecta al LXD para ver instancias'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Instancias ({instances.length})
              </h2>
              {instances.map((inst) => {
                const isLoading = actionLoading?.startsWith(inst.name);
                return (
                  <div key={inst.name} className="rounded-xl border border-border bg-card overflow-hidden" data-testid={`lxd-instance-${inst.name}`}>
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/20">
                      <div className={`w-2.5 h-2.5 rounded-full ${statusColor(inst.status)} shadow-lg`} />
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-sm">{inst.name}</span>
                        {inst.ipv4 && <span className="text-muted-foreground text-xs ml-2">· {inst.ipv4}</span>}
                      </div>
                      <Badge className={statusBadge(inst.status) + ' text-[10px]'}>
                        {inst.status}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {inst.type === 'virtual-machine' ? 'VM' : 'CT'}
                      </Badge>
                      <div className="flex gap-1">
                        {inst.status === 'Running' ? (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:bg-red-500/10"
                            onClick={() => doAction(inst.name, 'stop')} disabled={isLoading}
                            data-testid={`lxd-stop-${inst.name}`}>
                            {actionLoading === `${inst.name}-stop` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3" />}
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-400 hover:bg-green-500/10"
                            onClick={() => doAction(inst.name, 'start')} disabled={isLoading}
                            data-testid={`lxd-start-${inst.name}`}>
                            {actionLoading === `${inst.name}-start` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-amber-400 hover:bg-amber-500/10"
                          onClick={() => doAction(inst.name, 'restart')} disabled={isLoading}
                          data-testid={`lxd-restart-${inst.name}`}>
                          {actionLoading === `${inst.name}-restart` ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCw className="w-3 h-3" />}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:bg-red-500/10"
                          onClick={() => doDelete(inst.name)} disabled={isLoading}
                          data-testid={`lxd-delete-${inst.name}`}>
                          {actionLoading === `${inst.name}-delete` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                        </Button>
                      </div>
                    </div>
                    <div className="px-4 py-3 grid grid-cols-2 md:grid-cols-5 gap-4 text-xs">
                      <div>
                        <span className="text-muted-foreground">CPU</span>
                        <div className="font-medium flex items-center gap-1">
                          <Cpu className="w-3 h-3 text-cyan-400" />
                          {inst.config?.cpu || '—'} vCPU
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">RAM</span>
                        <div className="font-medium flex items-center gap-1">
                          <MemoryStick className="w-3 h-3 text-purple-400" />
                          {inst.config?.memory || '—'}
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Imagen</span>
                        <div className="font-medium truncate">{inst.config?.image || inst.architecture || '—'}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Perfiles</span>
                        <div className="font-medium">{inst.profiles?.join(', ') || '—'}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Creada</span>
                        <div className="font-medium">{inst.created_at ? new Date(inst.created_at).toLocaleDateString() : '—'}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
