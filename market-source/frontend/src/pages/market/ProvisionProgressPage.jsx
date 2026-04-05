import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import axios from 'axios';
import { CheckCircle2, XCircle, Loader2, Shield, Monitor, Globe } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const STEP_DEFS = [
  { name: 'payment_confirmed',    label: 'Pago confirmado',             icon: '💳' },
  { name: 'generate_credentials', label: 'Generando credenciales',      icon: '🔑' },
  { name: 'create_lxd_vm',        label: 'Creando VM Windows',          icon: '🖥️' },
  { name: 'windows_bootstrap',    label: 'Configurando Windows',        icon: '⚙️' },
  { name: 'tsplus_install',       label: 'Instalando TSplus',           icon: '📦' },
  { name: 'netbird_install',      label: 'Instalando Netbird mesh',     icon: '🔒' },
  { name: 'tsplus_configure',     label: 'Activando acceso HTML5',      icon: '🌐' },
  { name: 'netbird_configure',    label: 'Configurando red Zero Trust', icon: '🕸️' },
  { name: 'zitadel_provision',    label: 'Creando organización SSO',    icon: '👤' },
  { name: 'dns_create',           label: 'Configurando DNS',            icon: '📡' },
  { name: 'email_welcome',        label: 'Enviando credenciales',       icon: '📧' },
  { name: 'complete',             label: '¡Todo listo!',                icon: '🎉' },
];

export default function ProvisionProgressPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { getAuthHeader } = useAuth();
  const orderId = searchParams.get('order_id');

  const [steps, setSteps] = useState(STEP_DEFS.map(d => ({ ...d, status: 'pending' })));
  const [logs, setLogs] = useState([]);
  const [vmData, setVmData] = useState(null);
  const [complete, setComplete] = useState(false);
  const [failed, setFailed] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());
  const logRef = useRef(null);

  // Timer
  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // SSE stream
  useEffect(() => {
    if (!orderId) return;
    const token = localStorage.getItem('neosc_token');
    const url = `${BACKEND_URL}/api/market/orders/${orderId}/stream`;

    // Usar polling como fallback si SSE no está disponible
    let es;
    try {
      es = new EventSource(url);
      es.onmessage = (e) => {
        try { handleEvent(JSON.parse(e.data)); } catch {}
      };
      es.onerror = () => {
        // fallback a polling
        startPolling();
        es?.close();
      };
    } catch {
      startPolling();
    }

    return () => es?.close();
  }, [orderId]);

  const startPolling = () => {
    const poll = setInterval(async () => {
      try {
        const res = await axios.get(`${API}/market/orders/${orderId}/status`, {
          headers: getAuthHeader()
        });
        const data = res.data;

        if (data.steps) {
          setSteps(prev => prev.map(s => {
            const updated = data.steps.find(ds => ds.step_name === s.name);
            return updated ? { ...s, status: updated.status, log: updated.log_output } : s;
          }));
        }

        if (data.order_status === 'active') {
          setComplete(true);
          setVmData(data.vm);
          clearInterval(poll);
        } else if (data.order_status === 'failed') {
          setFailed(true);
          clearInterval(poll);
        }
      } catch {}
    }, 3000);
  };

  const handleEvent = (data) => {
    const { step, status, log } = data;

    setSteps(prev => prev.map(s =>
      s.name === step ? { ...s, status } : s
    ));

    if (log) {
      const time = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLogs(prev => [...prev.slice(-150), `[${time}] ${log}`]);
    }

    if (step === 'complete' && status === 'success') {
      setComplete(true);
      setVmData(data.metadata?.vm);
      // Redirect after 4 seconds
      setTimeout(() => navigate('/workspaces'), 4000);
    }
    if (status === 'failed') setFailed(true);
  };

  const completed = steps.filter(s => s.status === 'success').length;
  const pct = Math.round((completed / STEP_DEFS.length) * 100);
  const running = steps.find(s => s.status === 'running');
  const minsLeft = Math.max(0, Math.round((STEP_DEFS.length - completed) * 0.6));

  const fmtTime = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <div className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-cyan-400" />
          <span className="font-bold text-cyan-400">NeoSC</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm text-muted-foreground">Aprovisionando tu VM Windows</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">Orden:</span>
          <code className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground">
            #{orderId?.slice(0, 8).toUpperCase()}
          </code>
          <span className="font-mono text-cyan-400">{fmtTime(elapsed)}</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto w-full px-4 py-8 space-y-6">

        {/* Barra de progreso */}
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-muted-foreground">
              {complete ? '¡VM lista! Redirigiendo a Workspaces...' :
               failed  ? 'Error en el proceso — contacta soporte' :
               running ? `${running.icon} ${running.label}...` : 'Iniciando...'}
            </span>
            <span className="font-bold text-cyan-400">{pct}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                failed ? 'bg-red-500' : complete ? 'bg-green-500' : 'bg-cyan-500'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {!complete && !failed && (
            <p className="text-xs text-muted-foreground mt-1">
              Estimado: ~{minsLeft} {minsLeft === 1 ? 'minuto' : 'minutos'} restantes
            </p>
          )}
        </div>

        {/* Grid de steps */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {steps.map((step) => (
            <div
              key={step.name}
              className={`p-3 rounded-xl border text-sm transition-all ${
                step.status === 'success' ? 'border-teal-500/40 bg-teal-500/5' :
                step.status === 'running' ? 'border-cyan-500/60 bg-cyan-500/10' :
                step.status === 'failed'  ? 'border-red-500/40 bg-red-500/5' :
                'border-border bg-card/50'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-base">{step.icon}</span>
                {step.status === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" />}
                {step.status === 'running' && <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin" />}
                {step.status === 'failed'  && <XCircle className="w-3.5 h-3.5 text-red-400" />}
                {step.status === 'pending' && <div className="w-3.5 h-3.5 rounded-full border border-muted-foreground/30" />}
              </div>
              <div className={`text-xs font-medium leading-tight ${
                step.status === 'success' ? 'text-teal-400' :
                step.status === 'running' ? 'text-cyan-400' :
                step.status === 'failed'  ? 'text-red-400' :
                'text-muted-foreground'
              }`}>
                {step.label}
              </div>
            </div>
          ))}
        </div>

        {/* Log en tiempo real */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Log en tiempo real
            </h3>
            <Badge variant="outline" className="text-xs border-border text-muted-foreground">
              {logs.length} eventos
            </Badge>
          </div>
          <div
            ref={logRef}
            className="h-36 overflow-y-auto font-mono text-[11px] bg-black/40 border border-border rounded-xl p-3 space-y-0.5"
          >
            {logs.length === 0 ? (
              <div className="text-muted-foreground">Esperando eventos del orquestador...</div>
            ) : (
              logs.map((line, i) => (
                <div key={i} className={
                  line.toLowerCase().includes('error') || line.toLowerCase().includes('fail') ? 'text-red-400' :
                  line.includes('✓') || line.toLowerCase().includes('success') ? 'text-teal-400' :
                  'text-slate-400'
                }>
                  {line}
                </div>
              ))
            )}
            {running && <div className="text-cyan-400 animate-pulse">▊</div>}
          </div>
        </div>

        {/* Panel de éxito */}
        {complete && (
          <div className="rounded-2xl border border-teal-500/30 bg-teal-500/5 p-6 text-center space-y-4">
            <div className="text-5xl">🎉</div>
            <h2 className="text-xl font-black text-teal-400">¡Tu VM Windows está lista!</h2>
            <p className="text-muted-foreground text-sm">
              Revisa tu email con las credenciales. Redirigiendo a Workspaces en 4 segundos...
            </p>
            {vmData && (
              <div className="bg-card rounded-xl p-4 text-left text-xs font-mono space-y-1.5 border border-border">
                <div className="text-teal-400 font-bold mb-2">Detalles de tu VM:</div>
                {vmData.tunnel_hostname && (
                  <div className="flex items-center gap-2">
                    <Globe className="w-3 h-3 text-cyan-400" />
                    <span className="text-muted-foreground">URL:</span>
                    <a href={`https://${vmData.tunnel_hostname}`} target="_blank" rel="noreferrer"
                      className="text-cyan-400 hover:underline">
                      https://{vmData.tunnel_hostname}
                    </a>
                  </div>
                )}
                {vmData.netbird_ip && (
                  <div className="flex items-center gap-2">
                    <Shield className="w-3 h-3 text-teal-400" />
                    <span className="text-muted-foreground">IP Netbird:</span>
                    <span className="text-white">{vmData.netbird_ip}</span>
                  </div>
                )}
                {vmData.tsplus_licenses && (
                  <div className="flex items-center gap-2">
                    <Monitor className="w-3 h-3 text-blue-400" />
                    <span className="text-muted-foreground">TSplus:</span>
                    <span className="text-white">{vmData.tsplus_licenses} licencias activas</span>
                  </div>
                )}
              </div>
            )}
            <Button
              onClick={() => navigate('/workspaces')}
              className="bg-teal-500 hover:bg-teal-400 text-black font-bold gap-2"
            >
              <Monitor className="w-4 h-4" /> Ir a mis Workspaces
            </Button>
          </div>
        )}

        {/* Panel de error */}
        {failed && !complete && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-center space-y-3">
            <div className="text-4xl">⚠️</div>
            <h2 className="text-lg font-bold text-red-400">Error en el aprovisionamiento</h2>
            <p className="text-muted-foreground text-sm">
              Nuestro equipo ha sido notificado. Te contactaremos en menos de 30 minutos.
            </p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                Reintentar
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate('/workspaces')}>
                Ir a Workspaces
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
