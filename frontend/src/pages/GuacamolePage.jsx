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
  Monitor, Loader2, Plus, Trash2, ExternalLink, RefreshCw,
  Server, Wifi, AlertTriangle, CheckCircle2, Container
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function GuacamolePage() {
  const { getAuthHeader } = useAuth();
  const headers = getAuthHeader();

  const [status, setStatus] = useState(null);
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deploying, setDeploying] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: '', protocol: 'rdp', hostname: '', port: 3389, username: '', password: '', tenant_id: ''
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [statusRes, connRes] = await Promise.all([
        axios.get(`${API}/guacamole/status`, { headers }),
        axios.get(`${API}/guacamole/connections`, { headers }).catch(() => ({ data: { connections: [] } })),
      ]);
      setStatus(statusRes.data);
      setConnections(connRes.data.connections || []);
    } catch (err) {
      toast.error('Error cargando Guacamole');
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const deployGuacamole = async () => {
    setDeploying(true);
    try {
      const res = await axios.post(`${API}/guacamole/deploy`, {}, { headers });
      if (res.data.ok) {
        toast.success('Guacamole server desplegado en LXD');
      } else {
        toast.error(res.data.error || 'Error al desplegar');
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al desplegar');
    }
    setDeploying(false);
  };

  const createConnection = async () => {
    try {
      const payload = { ...form, port: parseInt(form.port) || 3389 };
      const res = await axios.post(`${API}/guacamole/connections`, payload, { headers });
      if (res.data.ok) {
        toast.success(`Conexion ${form.name} creada`);
        setShowCreate(false);
        setForm({ name: '', protocol: 'rdp', hostname: '', port: 3389, username: '', password: '', tenant_id: '' });
        loadData();
      } else {
        toast.error(res.data.error || 'Error creando conexion');
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error');
    }
  };

  const deleteConnection = async (id) => {
    try {
      await axios.delete(`${API}/guacamole/connections/${id}`, { headers });
      toast.success('Conexion eliminada');
      loadData();
    } catch { toast.error('Error eliminando'); }
  };

  const openConnection = async (id) => {
    try {
      const res = await axios.get(`${API}/guacamole/connections/${id}/link`, { headers });
      if (res.data.ok) {
        window.open(res.data.url, '_blank');
      } else {
        toast.error('No se pudo generar el link');
      }
    } catch { toast.error('Error'); }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="lg:ml-56 p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="guacamole-title">
                <Monitor className="w-6 h-6 text-orange-400" /> NeoDesk - Guacamole
              </h1>
              <p className="text-muted-foreground text-sm mt-1">
                Gateway HTML5 para conexiones RDP y VNC
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={loadData} className="gap-1" data-testid="refresh-guac">
                <RefreshCw className="w-3 h-3" /> Actualizar
              </Button>
              <Button size="sm" onClick={() => setShowCreate(!showCreate)} className="bg-orange-600 hover:bg-orange-500 gap-1" data-testid="new-connection-btn">
                <Plus className="w-3 h-3" /> Nueva conexion
              </Button>
            </div>
          </div>

          {/* Status */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Server className="w-5 h-5 text-orange-400" />
                <div>
                  <div className="font-bold text-sm">Estado del servidor</div>
                  <div className="text-xs text-muted-foreground">
                    {status?.url || 'No configurado'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : status?.connected ? (
                  <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">Conectado</Badge>
                ) : (
                  <>
                    <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30">Desconectado</Badge>
                    <Button size="sm" onClick={deployGuacamole} disabled={deploying} className="bg-orange-600 hover:bg-orange-500 gap-1 h-7 text-xs" data-testid="deploy-guac-btn">
                      {deploying ? <Loader2 className="w-3 h-3 animate-spin" /> : <Container className="w-3 h-3" />}
                      Desplegar en LXD
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Create Connection Form */}
          {showCreate && (
            <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-5 space-y-4" data-testid="create-connection-form">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Plus className="w-4 h-4 text-orange-400" /> Nueva conexion RDP/VNC
              </h3>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Nombre *</Label>
                  <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Win-Server-01" className="h-8 text-xs" />
                </div>
                <div>
                  <Label className="text-xs">Protocolo</Label>
                  <select
                    value={form.protocol}
                    onChange={e => setForm({...form, protocol: e.target.value, port: e.target.value === 'rdp' ? 3389 : 5901})}
                    className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs"
                    data-testid="protocol-select"
                  >
                    <option value="rdp">RDP (Escritorio Windows)</option>
                    <option value="vnc">VNC (Escritorio Remoto)</option>
                    <option value="ssh">SSH (Terminal)</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Host / IP *</Label>
                  <Input value={form.hostname} onChange={e => setForm({...form, hostname: e.target.value})} placeholder="10.100.10.152" className="h-8 text-xs" />
                </div>
                <div>
                  <Label className="text-xs">Puerto</Label>
                  <Input type="number" value={form.port} onChange={e => setForm({...form, port: e.target.value})} className="h-8 text-xs" />
                </div>
                <div>
                  <Label className="text-xs">Usuario</Label>
                  <Input value={form.username} onChange={e => setForm({...form, username: e.target.value})} placeholder="Administrator" className="h-8 text-xs" />
                </div>
                <div>
                  <Label className="text-xs">Password</Label>
                  <Input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} className="h-8 text-xs" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={createConnection} disabled={!form.name || !form.hostname} className="bg-orange-600 hover:bg-orange-500 gap-1" data-testid="submit-connection">
                  <CheckCircle2 className="w-3 h-3" /> Crear conexion
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>Cancelar</Button>
              </div>
            </div>
          )}

          {/* Connections Table */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h3 className="font-bold text-sm">Conexiones ({connections.length})</h3>
            </div>
            {connections.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <Wifi className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                {status?.connected
                  ? 'No hay conexiones configuradas. Crea una nueva.'
                  : 'Guacamole no esta conectado. Despliega el servidor primero.'}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {connections.map(conn => (
                  <div key={conn.id} className="px-4 py-3 flex items-center justify-between hover:bg-muted/20 transition-colors" data-testid={`conn-${conn.id}`}>
                    <div className="flex items-center gap-3">
                      <Monitor className={`w-4 h-4 ${conn.protocol === 'rdp' ? 'text-blue-400' : conn.protocol === 'vnc' ? 'text-purple-400' : 'text-green-400'}`} />
                      <div>
                        <div className="font-medium text-sm">{conn.name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {conn.protocol?.toUpperCase()} | ID: {conn.id}
                          {conn.activeConnections > 0 && <span className="text-green-400 ml-2">{conn.activeConnections} activas</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openConnection(conn.id)} className="h-7 text-xs gap-1">
                        <ExternalLink className="w-3 h-3" /> Abrir
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteConnection(conn.id)} className="h-7 text-xs text-red-400 hover:text-red-300 gap-1">
                        <Trash2 className="w-3 h-3" /> Eliminar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Info Card */}
          <div className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground space-y-2">
            <div className="flex items-center gap-2 font-bold text-sm text-foreground">
              <AlertTriangle className="w-4 h-4 text-amber-400" /> Configuracion
            </div>
            <p>Para usar NeoDesk (Guacamole), necesitas:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Un servidor Guacamole desplegado (clic en "Desplegar en LXD" si no tienes uno)</li>
              <li>Configurar <code className="text-cyan-400">GUACAMOLE_URL</code> en el backend .env con la IP del container</li>
              <li>Las conexiones RDP requieren que el servidor Windows tenga RDP habilitado</li>
              <li>NetBird relay debe estar corriendo para acceso seguro sin abrir puertos</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
