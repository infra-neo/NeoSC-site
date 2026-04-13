import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import axios from 'axios';
import {
  Server, Cpu, MemoryStick, Play, Square,
  RefreshCw, Trash2, Plus, Wifi, WifiOff, Loader2,
  RotateCw, Database, Terminal, ChevronDown, ChevronRight,
  Key, Shield, Network, Box, Wrench, HardDrive
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function LxdAdminPage() {
  const { getAuthHeader } = useAuth();
  const headers = getAuthHeader();
  const [status, setStatus] = useState(null);
  const [instances, setInstances] = useState([]);
  const [images, setImages] = useState([]);
  const [pools, setPools] = useState([]);
  const [projects, setProjects] = useState([]);
  const [currentProject, setCurrentProject] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedConsole, setExpandedConsole] = useState(null);
  const [consoleCmd, setConsoleCmd] = useState('');
  const [consoleOutput, setConsoleOutput] = useState([]);
  const consoleEndRef = useRef(null);

  const [createForm, setCreateForm] = useState({
    name: '', instance_type: 'container', image_alias: '',
    cpu: '2', memory: '4GiB', disk_size: '40GiB', description: '', storage_pool: '',
    username: 'neosc', password: '', ssh_key: '',
    netbird_setup_key: '', addons: [], add_to_workspaces: true,
    iso_path: '', enable_tpm: false, secure_boot: false,
  });

  const toggleAddon = (addon) => {
    setCreateForm(prev => ({
      ...prev,
      addons: prev.addons.includes(addon)
        ? prev.addons.filter(a => a !== addon)
        : [...prev.addons, addon],
    }));
  };

  const loadData = async (proj) => {
    setLoading(true);
    const p = proj || currentProject || undefined;
    const qp = p ? `?project=${p}` : '';
    try {
      const [statusRes, instancesRes, imagesRes, poolsRes, projectsRes] = await Promise.all([
        axios.get(`${API}/lxd/status`, { headers }).catch(() => ({ data: { connected: false } })),
        axios.get(`${API}/lxd/instances${qp}`, { headers }).catch(() => ({ data: { instances: [] } })),
        axios.get(`${API}/lxd/images${qp}`, { headers }).catch(() => ({ data: { images: [] } })),
        axios.get(`${API}/lxd/storage-pools${qp}`, { headers }).catch(() => ({ data: { pools: [] } })),
        axios.get(`${API}/lxd/projects`, { headers }).catch(() => ({ data: { projects: [], current: '' } })),
      ]);
      setStatus(statusRes.data);
      setInstances(instancesRes.data.instances || []);
      const imgs = imagesRes.data.images || [];
      setImages(imgs);
      const pls = poolsRes.data.pools || [];
      setPools(pls);
      setProjects(projectsRes.data.projects || []);
      if (!currentProject && projectsRes.data.current) {
        setCurrentProject(projectsRes.data.current);
      }
      if (imgs.length > 0) {
        setCreateForm(prev => prev.image_alias && imgs.some(i => i.fingerprint === prev.image_alias)
          ? prev
          : { ...prev, image_alias: imgs[0].fingerprint });
      }
      if (pls.length > 0) {
        setCreateForm(prev => prev.storage_pool && pls.some(p => p.name === prev.storage_pool)
          ? prev
          : { ...prev, storage_pool: (pls.find(pp => pp.status === 'Created') || pls[0]).name });
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const switchProject = (proj) => {
    setCurrentProject(proj);
    setCreateForm(prev => ({ ...prev, image_alias: '', storage_pool: '' }));
    loadData(proj);
  };

  const doAction = async (name, action, force = false) => {
    setActionLoading(`${name}-${action}`);
    try {
      await axios.post(`${API}/lxd/instances/${name}/state`, { action, force, project: currentProject }, { headers });
      toast.success(`${name}: ${action}`);
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || `Error`);
    }
    setActionLoading(null);
  };

  const doDelete = async (name) => {
    if (!window.confirm(`¿Eliminar "${name}"?`)) return;
    setActionLoading(`${name}-delete`);
    try {
      await axios.delete(`${API}/lxd/instances/${name}?force=true&project=${currentProject}`, { headers });
      toast.success(`${name} eliminada`);
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
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
      const payload = { ...createForm, project: currentProject };
      // Don't send empty iso_path
      if (!payload.iso_path) delete payload.iso_path;
      const res = await axios.post(`${API}/lxd/instances`, payload, { headers });
      if (res.data.ok) {
        toast.success(`"${createForm.name}" creada`);
        setShowCreate(false);
        setCreateForm(prev => ({ ...prev, name: '', description: '', password: '' }));
        await loadData();
      } else {
        toast.error(res.data.error || 'Error al crear instancia');
      }
    } catch (err) {
      const detail = err.response?.data?.detail || err.response?.data?.error || err.message;
      toast.error(`Error: ${detail}`);
    }
    setActionLoading(null);
  };

  const doSync = async () => {
    setActionLoading('syncing');
    try {
      const res = await axios.post(`${API}/lxd/sync-workspaces?project=${currentProject}`, {}, { headers });
      toast.success(`Sincronizado: ${res.data.synced} nuevas, ${res.data.total} total`);
    } catch (err) {
      toast.error('Error sincronizando');
    }
    setActionLoading(null);
  };

  const doFixDevices = async (name) => {
    setActionLoading(`${name}-fix`);
    try {
      const res = await axios.post(`${API}/lxd/instances/${name}/fix-devices?project=${currentProject}`, {}, { headers });
      if (res.data.ok) {
        const fixed = res.data.fixed || [];
        if (fixed.length > 0) {
          toast.success(`Dispositivos corregidos en ${name}: ${fixed.join(', ')}`);
        } else {
          toast.success(`${name}: no hay dispositivos que corregir`);
        }
        await loadData();
      } else {
        toast.error(res.data.error || 'Error');
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error corrigiendo dispositivos');
    }
    setActionLoading(null);
  };

  const doRemoveDevice = async (name, deviceName) => {
    if (!window.confirm(`¿Eliminar dispositivo "${deviceName}" de ${name}?`)) return;
    setActionLoading(`${name}-removedev`);
    try {
      const res = await axios.delete(`${API}/lxd/instances/${name}/devices/${deviceName}?project=${currentProject}`, { headers });
      if (res.data.ok) {
        toast.success(`Dispositivo ${deviceName} eliminado de ${name}`);
        await loadData();
      } else {
        toast.error(res.data.error || 'Error');
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error');
    }
    setActionLoading(null);
  };

  const doExec = async (name) => {
    if (!consoleCmd.trim()) return;
    const cmd = consoleCmd.trim();
    setConsoleOutput(prev => [...prev, { type: 'cmd', text: `$ ${cmd}` }]);
    setConsoleCmd('');
    try {
      const res = await axios.post(`${API}/lxd/instances/${name}/exec`, {
        command: cmd.split(' '),
        project: currentProject,
      }, { headers });
      if (res.data.ok) {
        if (res.data.stdout) setConsoleOutput(prev => [...prev, { type: 'out', text: res.data.stdout }]);
        if (res.data.stderr) setConsoleOutput(prev => [...prev, { type: 'err', text: res.data.stderr }]);
        if (res.data.return_code !== 0) {
          setConsoleOutput(prev => [...prev, { type: 'err', text: `exit code: ${res.data.return_code}` }]);
        }
      } else {
        setConsoleOutput(prev => [...prev, { type: 'err', text: res.data.error }]);
      }
    } catch (err) {
      setConsoleOutput(prev => [...prev, { type: 'err', text: err.message }]);
    }
    setTimeout(() => consoleEndRef.current?.scrollIntoView(), 50);
  };

  const statusColor = (s) => {
    const sl = (s || '').toLowerCase();
    if (sl === 'running') return 'bg-green-500';
    if (sl === 'stopped') return 'bg-red-500';
    return 'bg-muted-foreground';
  };
  const statusBadge = (s) => {
    const sl = (s || '').toLowerCase();
    if (sl === 'running') return 'bg-green-500/10 text-green-400 border-green-500/30';
    if (sl === 'stopped') return 'bg-red-500/10 text-red-400 border-red-500/30';
    return 'bg-muted text-muted-foreground';
  };

  const ADDONS = [
    { id: 'netbird', label: 'NetBird Relay', icon: Network, color: 'text-green-400', desc: 'VPN mesh Zero Trust' },
    { id: 'docker', label: 'Docker', icon: Box, color: 'text-blue-400', desc: 'Container runtime' },
    { id: 'cockpit', label: 'Cockpit', icon: Shield, color: 'text-purple-400', desc: 'Web admin panel :9090' },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="lg:ml-56 p-6">
        <div className="max-w-6xl mx-auto space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold" data-testid="lxd-title">NeoCloud — LXD</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-muted-foreground text-sm">Proyecto:</span>
                <select
                  value={currentProject}
                  onChange={e => switchProject(e.target.value)}
                  className="h-7 text-sm rounded-md border border-cyan-500/30 bg-cyan-500/5 text-cyan-400 px-2 font-medium"
                  data-testid="project-selector"
                >
                  {projects.map(p => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => loadData()} className="gap-1" data-testid="lxd-refresh">
                <RefreshCw className="w-3 h-3" />
              </Button>
              <Button variant="outline" size="sm" onClick={doSync} disabled={actionLoading === 'syncing'} className="gap-1" data-testid="lxd-sync">
                {actionLoading === 'syncing' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Database className="w-3 h-3" />} Sync Workspaces
              </Button>
              <Button size="sm" onClick={() => setShowCreate(!showCreate)} className="bg-cyan-500 hover:bg-cyan-400 text-black gap-1" data-testid="lxd-create-btn">
                <Plus className="w-3 h-3" /> Crear
              </Button>
            </div>
          </div>

          {/* Status */}
          <div className={`rounded-xl border p-3 flex items-center gap-3 ${
            status?.connected ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'
          }`} data-testid="lxd-status">
            {status?.connected ? <Wifi className="w-4 h-4 text-green-400" /> : <WifiOff className="w-4 h-4 text-red-400" />}
            <div className="flex-1 text-xs">
              <span className="font-bold">{status?.connected ? `${status.server_name} v${status.server_version}` : 'Desconectado'}</span>
              {status?.connected && <span className="text-muted-foreground ml-2">Auth: {status.auth} · {pools.filter(p => p.status === 'Created').length}/{pools.length} pools</span>}
            </div>
            <Badge className={status?.connected ? 'bg-green-500/10 text-green-400 border-green-500/30 text-[10px]' : 'bg-red-500/10 text-red-400 border-red-500/30 text-[10px]'}>
              {status?.connected ? 'Online' : 'Offline'}
            </Badge>
          </div>

          {/* Create Form */}
          {showCreate && (
            <div className="rounded-xl border border-cyan-500/30 bg-card p-5 space-y-4" data-testid="lxd-create-form">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Server className="w-4 h-4 text-cyan-400" /> Crear instancia en {currentProject}
              </h3>

              {/* Row 1: Basic */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs">Nombre *</Label>
                  <Input value={createForm.name} onChange={e => setCreateForm({...createForm, name: e.target.value})} placeholder="neosc-01" className="h-8 text-xs" data-testid="lxd-vm-name" />
                </div>
                <div>
                  <Label className="text-xs">Imagen *</Label>
                  <select value={createForm.image_alias} onChange={e => {
                      const selectedImg = images.find(i => i.fingerprint === e.target.value);
                      const updates = { image_alias: e.target.value };
                      if (selectedImg?.type === 'virtual-machine') {
                        updates.instance_type = 'virtual-machine';
                      } else if (selectedImg?.type === 'container') {
                        updates.instance_type = 'container';
                      }
                      setCreateForm(prev => ({...prev, ...updates}));
                    }} className="h-8 text-xs w-full rounded-md border border-border bg-background px-2" data-testid="lxd-vm-image">
                    <option value="">— Seleccionar —</option>
                    {images.map(img => {
                      const label = img.description || (img.aliases && img.aliases[0]) || `${img.os || ''} ${img.release || ''}`.trim() || img.fingerprint;
                      return (
                        <option key={img.fingerprint} value={img.fingerprint}>
                          {label} ({img.type === 'virtual-machine' ? 'VM' : 'CT'})
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Tipo</Label>
                  <select value={createForm.instance_type} onChange={e => setCreateForm({...createForm, instance_type: e.target.value})} className="h-8 text-xs w-full rounded-md border border-border bg-background px-2">
                    <option value="container">Container</option>
                    <option value="virtual-machine">Virtual Machine</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Storage Pool</Label>
                  <select value={createForm.storage_pool} onChange={e => setCreateForm({...createForm, storage_pool: e.target.value})} className="h-8 text-xs w-full rounded-md border border-border bg-background px-2">
                    {pools.map(p => (
                      <option key={p.name} value={p.name}>{p.name} ({p.driver}) {p.status !== 'Created' ? `[${p.status}]` : ''}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 2: Resources */}
              <div className="grid grid-cols-3 gap-3">
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
              </div>

              {/* Row 3: Cloud-init user */}
              <div className="border-t border-border pt-3">
                <h4 className="text-xs font-bold text-muted-foreground mb-2 flex items-center gap-1">
                  <Key className="w-3 h-3" /> Credenciales iniciales (cloud-init)
                </h4>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Usuario</Label>
                    <Input value={createForm.username} onChange={e => setCreateForm({...createForm, username: e.target.value})} placeholder="neosc" className="h-8 text-xs" />
                  </div>
                  <div>
                    <Label className="text-xs">Password</Label>
                    <Input type="password" value={createForm.password} onChange={e => setCreateForm({...createForm, password: e.target.value})} placeholder="••••••••" className="h-8 text-xs" />
                  </div>
                  <div>
                    <Label className="text-xs">SSH Key (opcional)</Label>
                    <Input value={createForm.ssh_key} onChange={e => setCreateForm({...createForm, ssh_key: e.target.value})} placeholder="ssh-ed25519 AAAA..." className="h-8 text-xs" />
                  </div>
                </div>
              </div>

              {/* Row 4: Addons */}
              <div className="border-t border-border pt-3">
                <h4 className="text-xs font-bold text-muted-foreground mb-2">Addons</h4>
                <div className="flex flex-wrap gap-2">
                  {ADDONS.map(a => {
                    const active = createForm.addons.includes(a.id);
                    return (
                      <button
                        key={a.id}
                        onClick={() => toggleAddon(a.id)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-all ${
                          active ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-400' : 'border-border text-muted-foreground hover:border-border hover:bg-muted/30'
                        }`}
                        data-testid={`addon-${a.id}`}
                      >
                        <a.icon className={`w-3.5 h-3.5 ${active ? a.color : ''}`} />
                        {a.label}
                        <span className="text-[10px] text-muted-foreground">{a.desc}</span>
                      </button>
                    );
                  })}
                </div>
                {(createForm.addons.includes('netbird') || createForm.netbird_setup_key) && (
                  <div className="mt-2">
                    <Label className="text-xs">NetBird Setup Key</Label>
                    <Input value={createForm.netbird_setup_key} onChange={e => setCreateForm({...createForm, netbird_setup_key: e.target.value})} placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX" className="h-8 text-xs font-mono" data-testid="netbird-setup-key" />
                  </div>
                )}
              </div>

              {/* Row 5: Windows VM options */}
              {createForm.instance_type === 'virtual-machine' && (
                <div className="border-t border-border pt-3">
                  <h4 className="text-xs font-bold text-muted-foreground mb-2 flex items-center gap-1">
                    <Shield className="w-3 h-3" /> Opciones de VM
                  </h4>
                  <div className="flex gap-4 items-center">
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={createForm.enable_tpm} onChange={e => setCreateForm({...createForm, enable_tpm: e.target.checked})} className="rounded" />
                      TPM 2.0 (requerido para Win11)
                    </label>
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={createForm.secure_boot} onChange={e => setCreateForm({...createForm, secure_boot: e.target.checked})} className="rounded" />
                      Secure Boot
                    </label>
                    <span className="text-[10px] text-muted-foreground ml-2">La imagen ya debe tener el OS instalado</span>
                  </div>
                </div>
              )}

              {/* Create button */}
              <div className="flex items-center gap-3 pt-2">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input type="checkbox" checked={createForm.add_to_workspaces} onChange={e => setCreateForm({...createForm, add_to_workspaces: e.target.checked})} className="rounded" />
                  Agregar a Workspaces
                </label>
                <div className="flex-1" />
                <Button size="sm" variant="outline" onClick={() => setShowCreate(false)} className="h-8">Cancelar</Button>
                <Button size="sm" onClick={doCreate} disabled={actionLoading === 'creating'} className="bg-cyan-500 hover:bg-cyan-400 text-black gap-1 h-8" data-testid="lxd-create-submit">
                  {actionLoading === 'creating' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                  Crear Instancia
                </Button>
              </div>
            </div>
          )}

          {/* Instances */}
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-cyan-500 animate-spin" /></div>
          ) : instances.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-border rounded-2xl">
              <Server className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No hay instancias en {currentProject}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Instancias en {currentProject} ({instances.length})
              </h2>
              {instances.map((inst) => {
                const isLoading = actionLoading?.startsWith(inst.name);
                const isConsoleOpen = expandedConsole === inst.name;
                return (
                  <div key={inst.name} className="rounded-xl border border-border bg-card overflow-hidden" data-testid={`lxd-instance-${inst.name}`}>
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/20">
                      <div className={`w-2.5 h-2.5 rounded-full ${statusColor(inst.status)} shadow-lg`} />
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-sm">{inst.name}</span>
                        {inst.ipv4 && <span className="text-cyan-400 text-xs ml-2 font-mono">{inst.ipv4}</span>}
                      </div>
                      <Badge className={statusBadge(inst.status) + ' text-[10px]'}>{inst.status}</Badge>
                      <Badge variant="outline" className="text-[10px]">{inst.type === 'virtual-machine' ? 'VM' : 'CT'}</Badge>
                      <div className="flex gap-1">
                        {/* Console toggle */}
                        {inst.status === 'Running' && (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-cyan-400 hover:bg-cyan-500/10"
                            onClick={() => { setExpandedConsole(isConsoleOpen ? null : inst.name); setConsoleOutput([]); }}
                            data-testid={`lxd-console-${inst.name}`}>
                            <Terminal className="w-3 h-3" />
                          </Button>
                        )}
                        {inst.status === 'Running' ? (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:bg-red-500/10"
                            onClick={() => doAction(inst.name, 'stop')} disabled={isLoading} data-testid={`lxd-stop-${inst.name}`}>
                            {actionLoading === `${inst.name}-stop` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3" />}
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-400 hover:bg-green-500/10"
                            onClick={() => doAction(inst.name, 'start')} disabled={isLoading} data-testid={`lxd-start-${inst.name}`}>
                            {actionLoading === `${inst.name}-start` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-amber-400 hover:bg-amber-500/10"
                          onClick={() => doAction(inst.name, 'restart')} disabled={isLoading}>
                          {actionLoading === `${inst.name}-restart` ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCw className="w-3 h-3" />}
                        </Button>
                        {inst.type === 'virtual-machine' && (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-orange-400 hover:bg-orange-500/10"
                            onClick={() => doFixDevices(inst.name)} disabled={isLoading}
                            title="Corregir dispositivos (ISOs sin pool)"
                            data-testid={`lxd-fix-${inst.name}`}>
                            {actionLoading === `${inst.name}-fix` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wrench className="w-3 h-3" />}
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:bg-red-500/10"
                          onClick={() => doDelete(inst.name)} disabled={isLoading} data-testid={`lxd-delete-${inst.name}`}>
                          {actionLoading === `${inst.name}-delete` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                        </Button>
                      </div>
                    </div>
                    <div className="px-4 py-2.5 grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                      <div>
                        <span className="text-muted-foreground">CPU</span>
                        <div className="font-medium flex items-center gap-1"><Cpu className="w-3 h-3 text-cyan-400" />{inst.config?.cpu || '—'}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">RAM</span>
                        <div className="font-medium flex items-center gap-1"><MemoryStick className="w-3 h-3 text-purple-400" />{inst.config?.memory || '—'}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">OS</span>
                        <div className="font-medium truncate">{inst.config?.image || inst.config?.os || '—'}</div>
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

                    {/* Console */}
                    {isConsoleOpen && (
                      <div className="border-t border-border bg-black p-3" data-testid={`console-panel-${inst.name}`}>
                        <div className="h-40 overflow-y-auto font-mono text-xs mb-2 space-y-0.5">
                          {consoleOutput.length === 0 && (
                            <div className="text-muted-foreground">Ejecuta comandos en {inst.name}. Ej: hostname, ip addr, cat /etc/os-release</div>
                          )}
                          {consoleOutput.map((line, i) => (
                            <div key={i} className={line.type === 'cmd' ? 'text-cyan-400' : line.type === 'err' ? 'text-red-400' : 'text-green-400 whitespace-pre-wrap'}>
                              {line.text}
                            </div>
                          ))}
                          <div ref={consoleEndRef} />
                        </div>
                        <div className="flex gap-2">
                          <span className="text-cyan-400 font-mono text-xs py-1">$</span>
                          <input
                            value={consoleCmd}
                            onChange={e => setConsoleCmd(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && doExec(inst.name)}
                            placeholder="comando..."
                            className="flex-1 bg-transparent border-b border-border text-xs font-mono text-foreground outline-none py-1"
                            data-testid={`console-input-${inst.name}`}
                          />
                          <Button size="sm" variant="ghost" onClick={() => doExec(inst.name)} className="h-7 text-xs text-cyan-400">
                            Run
                          </Button>
                        </div>
                      </div>
                    )}
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
