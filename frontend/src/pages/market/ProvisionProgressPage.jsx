import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import axios from 'axios';
import {
  CheckCircle2, XCircle, Loader2, Shield, Monitor, Globe,
  ChevronLeft, ChevronRight, Zap, Lock, Users, Laptop,
  Network, KeyRound, LayoutDashboard, ArrowRight
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const STEP_DEFS = [
  { name: 'payment_confirmed',    label: 'Pago confirmado',             icon: '1' },
  { name: 'generate_credentials', label: 'Generando credenciales',      icon: '2' },
  { name: 'create_lxd_vm',        label: 'Creando VM Windows',          icon: '3' },
  { name: 'windows_bootstrap',    label: 'Configurando Windows',        icon: '4' },
  { name: 'tsplus_install',       label: 'Instalando TSplus',           icon: '5' },
  { name: 'netbird_install',      label: 'Instalando Netbird mesh',     icon: '6' },
  { name: 'tsplus_configure',     label: 'Activando acceso HTML5',      icon: '7' },
  { name: 'netbird_configure',    label: 'Configurando red Zero Trust', icon: '8' },
  { name: 'zitadel_provision',    label: 'Creando organización SSO',    icon: '9' },
  { name: 'dns_create',           label: 'Configurando DNS',            icon: '10' },
  { name: 'email_welcome',        label: 'Enviando credenciales',       icon: '11' },
  { name: 'complete',             label: 'Todo listo',                  icon: '12' },
];

// Onboarding slides shown while provisioning
const ONBOARDING_SLIDES = [
  {
    title: 'Bienvenido a NeoSC',
    subtitle: 'Tu escritorio Windows seguro en la nube',
    description: 'Mientras preparamos tu VM, conoce todo lo que NeoSC puede hacer por ti y tu equipo.',
    icon: Shield,
    color: 'cyan',
    tips: [
      'Tu VM estará lista en aproximadamente 8 minutos',
      'Recibirás un email con tus credenciales de acceso',
      'Podrás conectarte desde cualquier navegador',
    ],
  },
  {
    title: 'NeoDesk — Acceso HTML5',
    subtitle: 'Tu escritorio Windows desde cualquier navegador',
    description: 'Con NeoDesk+ (TSplus HTML5) accedes a tu escritorio Windows completo sin instalar nada. Solo abre tu navegador, inicia sesión y trabaja.',
    icon: Laptop,
    color: 'purple',
    tips: [
      'Compatible con Chrome, Firefox, Safari y Edge',
      'Soporte para múltiples monitores y resoluciones',
      'Clipboard compartido entre tu equipo y la VM',
      'Audio y video remoto de alta calidad',
    ],
  },
  {
    title: 'NeoMesh — Red Zero Trust',
    subtitle: 'Conexión segura con WireGuard',
    description: 'NeoMesh (NetBird) crea una red mesh encriptada entre tu VM y tus dispositivos. Sin VPN tradicional, sin puertos abiertos.',
    icon: Network,
    color: 'teal',
    tips: [
      'Encriptación punto a punto con WireGuard',
      'Sin necesidad de abrir puertos en tu firewall',
      'Acceso granular por usuario y dispositivo',
      'Funciona detrás de NAT y firewalls corporativos',
    ],
  },
  {
    title: 'NeoGuard — SSO + MFA',
    subtitle: 'Identidad y acceso con Zitadel',
    description: 'NeoGuard protege tu acceso con Single Sign-On y autenticación multifactor. Integra Google, Microsoft 365 o tu propio directorio.',
    icon: KeyRound,
    color: 'amber',
    tips: [
      'Login único para todas las apps NeoSC',
      'MFA con TOTP, FIDO2 o notificaciones push',
      'Integración con Google Workspace y Azure AD',
      'Auditoría completa de inicios de sesión',
    ],
  },
  {
    title: 'Panel de Control',
    subtitle: 'Gestiona todo desde un solo lugar',
    description: 'Desde el Dashboard de NeoSC puedes administrar usuarios, ver sesiones activas, revisar logs de auditoría y configurar políticas de acceso.',
    icon: LayoutDashboard,
    color: 'blue',
    tips: [
      'Invita usuarios y asigna permisos',
      'Monitorea sesiones en tiempo real',
      'Configura políticas de acceso por horario o IP',
      'Exporta logs para cumplimiento (SOC 2, ISO 27001)',
    ],
  },
  {
    title: 'Próximos pasos',
    subtitle: 'Qué hacer cuando tu VM esté lista',
    description: 'Una vez completado el aprovisionamiento, sigue estos pasos para comenzar a trabajar con tu equipo.',
    icon: Zap,
    color: 'green',
    tips: [
      '1. Revisa el email con tus credenciales',
      '2. Abre tu escritorio desde "Workspaces"',
      '3. Instala NetBird en tus dispositivos de equipo',
      '4. Invita a tus usuarios desde "Organizaciones"',
    ],
  },
];

const colorMap = {
  cyan: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/30', dot: 'bg-cyan-500' },
  purple: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30', dot: 'bg-purple-500' },
  teal: { bg: 'bg-teal-500/10', text: 'text-teal-400', border: 'border-teal-500/30', dot: 'bg-teal-500' },
  amber: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30', dot: 'bg-amber-500' },
  blue: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30', dot: 'bg-blue-500' },
  green: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30', dot: 'bg-green-500' },
};

export default function ProvisionProgressPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { getAuthHeader } = useAuth();
  const orderId = searchParams.get('order_id') || searchParams.get('orderId');

  const [steps, setSteps] = useState(STEP_DEFS.map(d => ({ ...d, status: 'pending' })));
  const [vmData, setVmData] = useState(null);
  const [complete, setComplete] = useState(false);
  const [failed, setFailed] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [currentSlide, setCurrentSlide] = useState(0);
  const startRef = useRef(Date.now());
  const autoSlideRef = useRef(null);

  // Timer
  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  // Auto-advance slides
  useEffect(() => {
    if (complete || failed) return;
    autoSlideRef.current = setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % ONBOARDING_SLIDES.length);
    }, 8000);
    return () => clearInterval(autoSlideRef.current);
  }, [complete, failed]);

  // SSE stream + polling
  useEffect(() => {
    if (!orderId) return;
    // Go straight to polling — SSE requires auth headers which EventSource doesn't support
    startPolling();
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
            return updated ? { ...s, status: updated.status } : s;
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
    const { step, status } = data;
    setSteps(prev => prev.map(s =>
      s.name === step ? { ...s, status } : s
    ));
    if (step === 'complete' && status === 'success') {
      setComplete(true);
      setVmData(data.metadata?.vm);
      setTimeout(() => navigate('/workspaces'), 5000);
    }
    if (status === 'failed') setFailed(true);
  };

  const completed = steps.filter(s => s.status === 'success').length;
  const pct = Math.round((completed / STEP_DEFS.length) * 100);
  const running = steps.find(s => s.status === 'running');
  const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const goSlide = (dir) => {
    clearInterval(autoSlideRef.current);
    setCurrentSlide(prev => {
      const next = prev + dir;
      if (next < 0) return ONBOARDING_SLIDES.length - 1;
      return next % ONBOARDING_SLIDES.length;
    });
  };

  const slide = ONBOARDING_SLIDES[currentSlide];
  const colors = colorMap[slide.color];
  const SlideIcon = slide.icon;

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

      <div className="flex-1 max-w-5xl mx-auto w-full px-4 py-6 flex flex-col gap-6">

        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-muted-foreground">
              {complete ? 'VM lista — Redirigiendo a Workspaces...' :
               failed  ? 'Error en el proceso — contacta soporte' :
               running ? `Paso ${completed + 1}/${STEP_DEFS.length}: ${running.label}...` : 'Iniciando...'}
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

          {/* Mini step dots */}
          <div className="flex items-center gap-1 mt-3">
            {steps.map((s) => (
              <div
                key={s.name}
                className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                  s.status === 'success' ? 'bg-teal-500' :
                  s.status === 'running' ? 'bg-cyan-500 animate-pulse' :
                  s.status === 'failed' ? 'bg-red-500' :
                  'bg-muted'
                }`}
                title={s.label}
              />
            ))}
          </div>
        </div>

        {/* Success panel */}
        {complete && (
          <div className="rounded-2xl border border-teal-500/30 bg-teal-500/5 p-8 text-center space-y-4" data-testid="provision-complete">
            <div className="w-16 h-16 rounded-2xl bg-teal-500/10 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-teal-400" />
            </div>
            <h2 className="text-2xl font-black text-teal-400">Tu VM Windows está lista</h2>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              Revisa tu email con las credenciales de acceso. Redirigiendo a Workspaces...
            </p>
            {vmData && (
              <div className="bg-card rounded-xl p-4 text-left text-xs font-mono space-y-1.5 border border-border max-w-md mx-auto">
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
              </div>
            )}
            <Button
              onClick={() => navigate('/workspaces')}
              className="bg-teal-500 hover:bg-teal-400 text-black font-bold gap-2"
              data-testid="go-workspaces"
            >
              <Monitor className="w-4 h-4" /> Ir a mis Workspaces
            </Button>
          </div>
        )}

        {/* Error panel */}
        {failed && !complete && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-center space-y-3">
            <XCircle className="w-10 h-10 text-red-400 mx-auto" />
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

        {/* Onboarding slides (shown while provisioning) */}
        {!complete && !failed && (
          <div className="flex-1 flex flex-col">
            <div className={`flex-1 rounded-2xl border ${colors.border} ${colors.bg} p-8 flex flex-col transition-all duration-500`}>
              <div className="flex-1 flex flex-col items-center justify-center text-center max-w-2xl mx-auto">
                <div className={`w-16 h-16 rounded-2xl ${colors.bg} flex items-center justify-center mb-6`}>
                  <SlideIcon className={`w-8 h-8 ${colors.text}`} />
                </div>
                <Badge className={`mb-3 ${colors.bg} ${colors.text} ${colors.border}`}>
                  {slide.subtitle}
                </Badge>
                <h2 className="text-2xl font-black mb-3">{slide.title}</h2>
                <p className="text-muted-foreground text-sm mb-6 max-w-lg">
                  {slide.description}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
                  {slide.tips.map((tip, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 text-left text-sm bg-background/50 rounded-xl p-3 border border-border/50"
                    >
                      <CheckCircle2 className={`w-4 h-4 ${colors.text} mt-0.5 flex-shrink-0`} />
                      <span className="text-foreground/80">{tip}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-border/30">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => goSlide(-1)}
                  className="text-muted-foreground hover:text-foreground gap-1"
                  data-testid="slide-prev"
                >
                  <ChevronLeft className="w-4 h-4" /> Anterior
                </Button>
                <div className="flex items-center gap-2">
                  {ONBOARDING_SLIDES.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => { clearInterval(autoSlideRef.current); setCurrentSlide(i); }}
                      className={`w-2 h-2 rounded-full transition-all ${
                        i === currentSlide ? `${colors.dot} w-6` : 'bg-muted-foreground/30'
                      }`}
                      data-testid={`slide-dot-${i}`}
                    />
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => goSlide(1)}
                  className="text-muted-foreground hover:text-foreground gap-1"
                  data-testid="slide-next"
                >
                  Siguiente <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
