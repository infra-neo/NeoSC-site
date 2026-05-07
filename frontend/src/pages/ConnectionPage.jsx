import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import axios from 'axios';
import { Loader2, X, Maximize2, Minimize2, ArrowLeft, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function ConnectionPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { getAuthHeader } = useAuth();
  const headers = getAuthHeader();

  const connId = searchParams.get('id');
  const connName = searchParams.get('name') || 'NeoVDI Session';
  const directUrl = searchParams.get('url'); // For direct web URLs (noVNC, Docker apps)
  const proto = searchParams.get('proto') || 'guac'; // guac, web

  const [loading, setLoading] = useState(true);
  const [sessionUrl, setSessionUrl] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [disconnected, setDisconnected] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const iframeRef = useRef(null);

  useEffect(() => {
    if (directUrl) {
      // Direct web URL — no Guacamole needed
      setSessionUrl(directUrl);
      setLoading(false);
    } else if (connId) {
      loadGuacConnection();
    } else {
      navigate('/workspaces');
    }
  }, [connId, directUrl]);

  // Countdown when disconnected
  useEffect(() => {
    if (!disconnected) return;
    if (countdown <= 0) { navigate('/workspaces'); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [disconnected, countdown]);

  const loadGuacConnection = async () => {
    try {
      const res = await axios.get(`${API}/guacamole/connections/${connId}/link`, { headers });
      if (res.data.ok) {
        // Use the direct client URL — goes straight to the session, not the home
        setSessionUrl(res.data.url);
      } else {
        toast.error('No se pudo conectar');
        navigate('/workspaces');
      }
    } catch {
      toast.error('Error de conexion');
      navigate('/workspaces');
    }
    setLoading(false);
  };

  const handleClose = () => {
    if (iframeRef.current) iframeRef.current.src = 'about:blank';
    navigate('/workspaces');
  };

  const handleDisconnect = () => {
    if (disconnected) return;
    setDisconnected(true);
    setCountdown(5);
    if (iframeRef.current) iframeRef.current.src = 'about:blank';
  };

  const handleReconnect = () => {
    setDisconnected(false);
    setLoading(true);
    if (directUrl) {
      setSessionUrl(directUrl);
      setLoading(false);
    } else {
      loadGuacConnection();
    }
  };

  const toggleFullscreen = () => {
    if (!fullscreen) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
    setFullscreen(!fullscreen);
  };

  // Focus iframe on click to ensure keyboard works
  const focusIframe = () => {
    if (iframeRef.current) {
      iframeRef.current.focus();
    }
  };

  // Detect when the iframe navigates back to NeoVDI home (user logged out from inside the gateway)
  // — we can't read iframe.contentDocument.location due to CORS, but we can poll iframe.src as best-effort
  // and listen to postMessage events. Most importantly, we expose a `Cerrar sesión` toolbar button.
  useEffect(() => {
    if (!sessionUrl || disconnected) return;
    const onMsg = (e) => {
      // Accept only messages from same-origin or our gateway origin
      const safeOrigins = [window.location.origin];
      try {
        const u = new URL(sessionUrl);
        safeOrigins.push(u.origin);
      } catch { /* */ }
      if (!safeOrigins.includes(e.origin)) return;
      if (e.data && (e.data.type === 'neosc:logout' || e.data === 'logout')) {
        handleDisconnect();
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUrl, disconnected]);

  // Loading screen with NeoSC animation
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0e17] flex items-center justify-center">
        <div className="text-center space-y-6">
          {/* Animated logo */}
          <div className="relative w-20 h-20 mx-auto">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-500 to-purple-500 animate-pulse opacity-30" />
            <div className="absolute inset-1 rounded-xl bg-[#0a0e17] flex items-center justify-center">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center animate-spin" style={{ animationDuration: '3s' }}>
                <span className="text-white font-bold text-lg">N</span>
              </div>
            </div>
          </div>
          {/* Dots animation */}
          <div className="flex items-center justify-center gap-1.5">
            {[0,1,2,3,4].map(i => (
              <div key={i} className="w-2 h-2 rounded-full bg-cyan-400" style={{
                animation: 'pulse 1.5s ease-in-out infinite',
                animationDelay: `${i * 0.15}s`,
              }} />
            ))}
          </div>
          <p className="text-sm text-[#94a3b8]">Conectando a <span className="text-white font-medium">{connName}</span></p>
          <style>{`@keyframes pulse { 0%,80%,100%{opacity:.2;transform:scale(0.8)} 40%{opacity:1;transform:scale(1.2)} }`}</style>
        </div>
      </div>
    );
  }

  // Disconnected screen
  if (disconnected) {
    return (
      <div className="min-h-screen bg-[#0a0e17] flex items-center justify-center">
        <div className="text-center space-y-5 max-w-md">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-2xl bg-red-500/20" />
            <div className="absolute inset-1 rounded-xl bg-[#0a0e17] flex items-center justify-center">
              <Monitor className="w-7 h-7 text-red-400" />
            </div>
          </div>
          <h2 className="text-xl font-bold text-white">Sesion finalizada</h2>
          <p className="text-sm text-[#94a3b8]">
            La conexion a <span className="text-white font-medium">{connName}</span> se ha cerrado.
          </p>
          <p className="text-sm text-cyan-400">Redirigiendo en {countdown}s...</p>
          <div className="flex gap-3 justify-center pt-2">
            <Button onClick={handleReconnect} variant="outline" className="gap-2 border-[#1e293b] text-white hover:bg-[#1e293b]">Reconectar</Button>
            <Button onClick={() => navigate('/workspaces')} className="bg-cyan-500 hover:bg-cyan-400 text-black gap-2">
              <ArrowLeft className="w-4 h-4" /> Workspaces
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Active session
  return (
    <div className={`bg-[#0a0e17] ${fullscreen ? 'fixed inset-0 z-[9999]' : 'min-h-screen flex flex-col'}`}>
      {/* Minimal toolbar */}
      <div className="flex items-center justify-between px-3 py-1 bg-[#111827] border-b border-[#1e293b] flex-shrink-0" style={{ height: '32px' }}>
        <div className="flex items-center gap-3">
          <button onClick={handleClose} className="flex items-center gap-1.5 text-[#94a3b8] hover:text-white text-xs transition-colors">
            <ArrowLeft className="w-3 h-3" /> Workspaces
          </button>
          <div className="w-px h-3 bg-[#1e293b]" />
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-white text-xs font-medium">{connName}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={toggleFullscreen} className="p-1 rounded hover:bg-[#1e293b] text-[#94a3b8] hover:text-white transition-colors">
            {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button onClick={handleDisconnect} className="p-1 rounded hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors" title="Cerrar sesion">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Session iframe — NO sandbox, NO restrictions for keyboard/mouse/performance */}
      <iframe
        ref={iframeRef}
        src={sessionUrl}
        className="w-full border-0 flex-1"
        style={{ height: fullscreen ? 'calc(100vh - 32px)' : 'calc(100vh - 32px)' }}
        title={connName}
        allow="clipboard-read; clipboard-write; fullscreen"
        allowFullScreen
        onLoad={focusIframe}
        onClick={focusIframe}
        data-testid="session-iframe"
      />
    </div>
  );
}
