import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import axios from 'axios';
import {
  Cpu, MemoryStick, HardDrive, Monitor, Cloud, CheckCircle2, AlertCircle,
  Loader2, Rocket, Sparkles, Lock, Search, Filter, RefreshCw, Server,
  Settings, ArrowRight, X
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const BADGE_STYLES = {
  GOLD:  { bg: 'from-amber-400 via-orange-500 to-amber-600', pill: 'bg-amber-500/90 text-white', text: 'text-amber-300' },
  STD:   { bg: 'from-violet-500 via-purple-600 to-indigo-600', pill: 'bg-indigo-500/90 text-white', text: 'text-indigo-300' },
  POWER: { bg: 'from-fuchsia-500 via-pink-600 to-rose-600', pill: 'bg-rose-500/90 text-white', text: 'text-rose-300' },
};

const CATEGORIES = [
  { id: 'all', label: 'Todas' },
  { id: 'windows', label: 'Windows VDI' },
  { id: 'linux', label: 'Linux' },
  { id: 'specialized', label: 'Especializadas' },
];

export default function MarketPage() {
  const navigate = useNavigate();
  const { isAuthenticated, getAuthHeader, user } = useAuth();

  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [apiStatus, setApiStatus] = useState('checking');
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTpl, setModalTpl] = useState(null);
  const [form, setForm] = useState({ vmName: '', cpu: 4, memory: 8192 });
  const [submitting, setSubmitting] = useState(false);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/market/templates`);
      setTemplates(res.data.templates || []);
      setApiStatus(res.data.api_status || 'ok');
    } catch (e) {
      console.error(e);
      setApiStatus('error');
      toast.error('No se pudieron cargar las plantillas');
    }
    setLoading(false);
  };

  useEffect(() => { loadTemplates(); }, []);

  const openInstantiate = (tpl) => {
    if (!isAuthenticated) {
      toast.error('Inicia sesión para instanciar una VM');
      navigate('/login');
      return;
    }
    setModalTpl(tpl);
    setForm({
      vmName: '',
      cpu: tpl.cpu,
      memory: tpl.memory,
    });
    setModalOpen(true);
  };

  const handleInstantiate = async () => {
    if (!modalTpl) return;
    setSubmitting(true);
    try {
      const res = await axios.post(
        `${API}/market/templates/${modalTpl.templateId}/instantiate`,
        {
          vm_name: form.vmName || undefined,
          cpu: parseInt(form.cpu) || modalTpl.cpu,
          memory: parseInt(form.memory) || modalTpl.memory,
          tsplus_users: modalTpl.tsplus_users?.default,
          company_name: user?.organization || '',
          admin_email: user?.email,
          admin_name: user?.name,
        },
        { headers: getAuthHeader() }
      );
      toast.success(`VM ${res.data.vm_name} en aprovisionamiento`);
      setModalOpen(false);
      navigate(`/market/progress?order_id=${res.data.order_id}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al instanciar la VM');
    }
    setSubmitting(false);
  };

  const filtered = templates.filter(t => {
    if (activeCategory !== 'all' && t.category !== activeCategory) return false;
    if (search && !t.name.toLowerCase().includes(search.toLowerCase()) &&
        !t.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-foreground">
      {/* Header */}
      <header className="border-b border-white/5 bg-slate-950/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/30">
              <Cloud className="w-5 h-5 text-white" />
            </div>
            <div className="leading-tight">
              <div className="font-bold text-base">Neo<span className="text-cyan-400">Market</span></div>
              <div className="text-[10px] text-slate-400">OpenCloud Marketplace · OpenNebula</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* API status indicator */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs"
                 data-testid="api-status">
              <span className={`w-2 h-2 rounded-full ${
                apiStatus === 'ok' ? 'bg-emerald-400 animate-pulse' :
                apiStatus === 'checking' ? 'bg-amber-400' : 'bg-red-400'
              }`} />
              <span className="text-slate-300">
                {apiStatus === 'ok' ? 'API Disponible' :
                 apiStatus === 'checking' ? 'Verificando...' : 'API Limitada'}
              </span>
            </div>

            <Button variant="ghost" size="sm" onClick={loadTemplates} data-testid="btn-refresh">
              <RefreshCw className="w-4 h-4" />
            </Button>

            {isAuthenticated ? (
              <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')} data-testid="btn-dashboard">
                <Monitor className="w-3.5 h-3.5 mr-1" /> Dashboard
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => navigate('/login')} data-testid="btn-login">
                <Lock className="w-3.5 h-3.5 mr-1" /> Iniciar sesión
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(168,85,247,0.15),transparent_50%),radial-gradient(circle_at_70%_80%,rgba(6,182,212,0.15),transparent_50%)]" />
        <div className="relative max-w-7xl mx-auto px-6 py-14">
          <Badge className="bg-purple-500/10 text-purple-300 border-purple-500/30 mb-4">
            <Sparkles className="w-3 h-3 mr-1" /> NeoCloud · TSplus VDI
          </Badge>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight max-w-3xl" data-testid="hero-title">
            Marketplace VDI Empresarial sobre <span className="bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">OpenNebula</span>
          </h1>
          <p className="text-slate-400 mt-4 max-w-2xl text-base">
            Catálogo de plantillas Windows optimizadas para despliegue masivo, con versionado, perfiles y aprovisionamiento controlado autónomo.
            Auto-instala TSplus, registra en NeoMesh y entrega acceso HTML5 listo para usar.
          </p>
          <div className="flex flex-wrap gap-3 mt-6">
            <Button
              className="bg-gradient-to-r from-cyan-500 to-purple-500 hover:opacity-90 text-white font-bold gap-2"
              onClick={() => document.getElementById('templates-section')?.scrollIntoView({ behavior: 'smooth' })}
              data-testid="btn-explore"
            >
              <Rocket className="w-4 h-4" /> Explorar Plantillas
            </Button>
            <Button
              className="bg-gradient-to-r from-emerald-500 via-cyan-500 to-purple-500 hover:opacity-90 text-white font-bold gap-2 shadow-lg shadow-purple-500/30"
              onClick={() => navigate('/market/chat')}
              data-testid="btn-chat-wizard"
            >
              <Sparkles className="w-4 h-4" /> Asistente Chat <Badge className="ml-1 bg-white/20 text-white border-0 text-[9px]">NEW</Badge>
            </Button>
            <Button variant="outline" className="border-white/20 hover:bg-white/5 gap-2" data-testid="btn-status">
              <Server className="w-4 h-4" /> Estado del Servicio
            </Button>
            <Button variant="ghost" className="text-slate-300 gap-2" onClick={() => navigate('/market/neocloud')} data-testid="btn-wizard">
              <Settings className="w-4 h-4" /> Wizard guiado <ArrowRight className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </section>

      {/* Filters */}
      <section id="templates-section" className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <h2 className="text-2xl font-bold">Plantillas Disponibles</h2>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:flex-initial">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar plantilla..."
                className="pl-9 bg-white/5 border-white/10 md:w-64"
                data-testid="input-search"
              />
            </div>
          </div>
        </div>

        {/* Category chips */}
        <div className="flex flex-wrap gap-2 mb-8">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                activeCategory === cat.id
                  ? 'bg-cyan-500 text-black'
                  : 'bg-white/5 text-slate-300 hover:bg-white/10 border border-white/10'
              }`}
              data-testid={`chip-${cat.id}`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Templates grid */}
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-cyan-400" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <Filter className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>No hay plantillas que coincidan con los filtros</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="templates-grid">
            {filtered.map(tpl => {
              const style = BADGE_STYLES[tpl.badge] || BADGE_STYLES.STD;
              return (
                <div
                  key={tpl.templateId}
                  className="group relative rounded-2xl overflow-hidden border border-white/10 bg-slate-900/60 backdrop-blur hover:border-white/20 transition-all hover:shadow-2xl hover:shadow-purple-500/10 hover:-translate-y-1 duration-300"
                  data-testid={`template-${tpl.templateId}`}
                >
                  {/* Gradient header */}
                  <div className={`relative bg-gradient-to-br ${style.bg} p-5`}>
                    <div className="absolute top-3 right-3">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black tracking-wider ${style.pill}`}>
                        {tpl.badge}
                      </span>
                    </div>
                    <h3 className="text-lg font-black text-white leading-tight pr-12">
                      {tpl.name}
                    </h3>
                    <p className="text-white/70 text-[11px] mt-1">Service ID {tpl.service_id}</p>
                  </div>

                  {/* Body */}
                  <div className="p-5">
                    <p className="text-xs text-slate-400 leading-relaxed mb-5 min-h-[60px]">
                      {tpl.description}
                    </p>

                    {/* Specs grid */}
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <SpecItem icon={Cpu} label="CPU" value={`${tpl.cpu} núcleos`} color="text-cyan-400" />
                      <SpecItem icon={MemoryStick} label="RAM" value={`${tpl.memory / 1024} GB`} color="text-purple-400" />
                      <SpecItem icon={HardDrive} label="Disco" value={`${tpl.disk} GB`} color="text-amber-400" />
                      <SpecItem icon={Monitor} label="SO" value={tpl.os} color="text-emerald-400" />
                    </div>

                    {/* Tags */}
                    <div className="flex flex-wrap gap-1.5 mb-5">
                      {tpl.tags.map((tag, i) => (
                        <Badge key={i} variant="outline" className="text-[9px] border-white/15 text-slate-400 px-1.5 py-0">
                          {tag}
                        </Badge>
                      ))}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-4 border-t border-white/5">
                      <div className="text-[10px] text-slate-500">
                        <div>Actualizado:</div>
                        <div className="font-mono">2026-05-25</div>
                      </div>
                      <Button
                        onClick={() => openInstantiate(tpl)}
                        className="bg-gradient-to-r from-cyan-500 to-purple-500 hover:opacity-90 text-white font-bold gap-2 shadow-lg shadow-cyan-500/20"
                        data-testid={`btn-instantiate-${tpl.templateId}`}
                      >
                        <Rocket className="w-3.5 h-3.5" /> Instanciar
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Bottom info */}
        <div className="mt-12 rounded-2xl border border-white/10 bg-slate-900/40 p-6 text-center">
          <p className="text-xs text-slate-400">
            <CheckCircle2 className="w-3 h-3 inline mr-1 text-emerald-400" />
            Al instanciar una plantilla, se ejecuta <code className="text-cyan-400 bg-white/5 px-1 rounded">POST /api/vm/instantiate</code> contra OpenNebula OneFlow,
            seguido de auto-instalación de TSplus + registro en NeoMesh (NetBird Cloud).
          </p>
        </div>
      </section>

      {/* Instantiate Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="bg-slate-900 border-white/10 text-foreground max-w-md p-0 overflow-hidden">
          <div className={`bg-gradient-to-br ${modalTpl ? (BADGE_STYLES[modalTpl.badge]?.bg || BADGE_STYLES.STD.bg) : ''} p-5`}>
            <DialogHeader>
              <DialogTitle className="text-white text-lg font-black flex items-center justify-between">
                <span>Instanciar: {modalTpl?.name}</span>
                <button onClick={() => setModalOpen(false)} className="text-white/70 hover:text-white" data-testid="modal-close">
                  <X className="w-5 h-5" />
                </button>
              </DialogTitle>
              <DialogDescription className="text-white/70 text-xs">
                Service ID {modalTpl?.service_id} · Template ID {modalTpl?.templateId}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="p-5 space-y-4">
            <div>
              <Label className="text-xs">Nombre de la VM</Label>
              <Input
                value={form.vmName}
                onChange={e => setForm(f => ({ ...f, vmName: e.target.value }))}
                placeholder={`vm-${modalTpl?.tier || 'demo'}-auto`}
                className="bg-white/5 border-white/10 mt-1"
                data-testid="modal-input-vmname"
              />
              <p className="text-[10px] text-slate-500 mt-1">Se generará automáticamente si está vacío</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs flex items-center gap-1">
                  <Cpu className="w-3 h-3 text-cyan-400" /> CPU (núcleos)
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={16}
                  value={form.cpu}
                  onChange={e => setForm(f => ({ ...f, cpu: e.target.value }))}
                  className="bg-white/5 border-white/10 mt-1"
                  data-testid="modal-input-cpu"
                />
                <p className="text-[10px] text-slate-500 mt-1">1-16</p>
              </div>
              <div>
                <Label className="text-xs flex items-center gap-1">
                  <MemoryStick className="w-3 h-3 text-purple-400" /> Memoria (MB)
                </Label>
                <Input
                  type="number"
                  min={512}
                  max={131072}
                  step={1024}
                  value={form.memory}
                  onChange={e => setForm(f => ({ ...f, memory: e.target.value }))}
                  className="bg-white/5 border-white/10 mt-1"
                  data-testid="modal-input-memory"
                />
                <p className="text-[10px] text-slate-500 mt-1">512-131072 MB</p>
              </div>
            </div>

            {/* Summary */}
            <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 text-cyan-400 font-bold mb-2">
                <CheckCircle2 className="w-3.5 h-3.5" /> Resumen
              </div>
              <div className="flex justify-between"><span className="text-slate-400">Plantilla:</span> <span>{modalTpl?.name}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Nombre VM:</span> <span className="font-mono">{form.vmName || '(auto)'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Config:</span> <span>{form.cpu} CPU · {(form.memory / 1024).toFixed(0)}GB RAM · {modalTpl?.disk}GB SSD</span></div>
              <div className="flex justify-between"><span className="text-slate-400">TSplus users:</span> <span>{modalTpl?.tsplus_users?.default}</span></div>
            </div>

            <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-2.5 text-[10px] text-amber-300 flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>Al hacer clic en &quot;Instanciar&quot;, se enviará la orden a OpenNebula OneFlow y se ejecutará la cadena completa: deploy VM → bootstrap → TSplus → NeoMesh → DNS.</span>
            </div>

            <Button
              onClick={handleInstantiate}
              disabled={submitting}
              className="w-full bg-gradient-to-r from-cyan-500 to-purple-500 hover:opacity-90 text-white font-bold gap-2 py-5"
              data-testid="modal-submit"
            >
              {submitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Creando VM...</>
              ) : (
                <><Rocket className="w-4 h-4" /> Instanciar VM</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SpecItem({ icon: Icon, label, value, color }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <div className="min-w-0">
        <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
        <div className="text-xs font-bold truncate">{value}</div>
      </div>
    </div>
  );
}
