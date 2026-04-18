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

  const [loading, setLoading] = useState(true);
  const [guacUrl, setGuacUrl] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [disconnected, setDisconnected] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const iframeRef = useRef(null);
  const checkIntervalRef = useRef(null);

  useEffect(() => {
    if (!connId) { navigate('/workspaces'); return; }
    loadConnection();
    return () => { if (checkIntervalRef.current) clearInterval(checkIntervalRef.current); };
  }, [connId]);

  // Countdown redirect when disconnected
  useEffect(() => {
    if (!disconnected) return;
    if (countdown <= 0) {
      navigate('/workspaces');
      return;
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [disconnected, countdown]);

  const loadConnection = async () => {
    try {
      const res = await axios.get(`${API}/guacamole/connections/${connId}/link`, { headers });
      if (res.data.ok) {
        setGuacUrl(res.data.url);
      } else {
        toast.error('No se pudo obtener el link');
        navigate('/workspaces');
      }
    } catch {
      toast.error('Error de conexion');
      navigate('/workspaces');
    }
    setLoading(false);
  };

  // Monitor iframe for disconnect — check if Guacamole shows error/disconnect state
  useEffect(() => {
    if (!guacUrl || !iframeRef.current) return;

    // Monitor via message events from Guacamole
    const handleMessage = (event) => {
      try {
        // Guacamole sends tunnel status updates
        if (typeof event.data === 'string') {
          if (event.data.includes('disconnect') || event.data.includes('error') || event.data.includes('closed')) {
            handleDisconnect();
          }
        }
      } catch { /* cross-origin, expected */ }
    };

    // Periodic check — if the iframe navigates away or shows error
    checkIntervalRef.current = setInterval(() => {
      try {
        const iframe = iframeRef.current;
        if (!iframe) return;
        // Try to detect if Guacamole redirected to login or error page
        const iframeSrc = iframe.src || '';
        if (iframeSrc && !iframeSrc.includes('client') && !iframeSrc.includes('token')) {
          handleDisconnect();
        }
      } catch { /* cross-origin, expected */ }
    }, 3000);

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
      if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
    };
  }, [guacUrl]);

  const handleDisconnect = () => {
    if (disconnected) return;
    setDisconnected(true);
    setCountdown(5);
    if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
  };

  const handleClose = () => {
    // Kill the Guacamole session token by navigating away
    if (iframeRef.current) {
      iframeRef.current.src = 'about:blank';
    }
    navigate('/workspaces');
  };

  const toggleFullscreen = () => {
    if (!fullscreen) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
    setFullscreen(!fullscreen);
  };

  // Loading
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0e17] flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-cyan-400 mx-auto" />
          <p className="text-sm text-[#94a3b8]">Conectando a {connName}...</p>
        </div>
      </div>
    );
  }

  // Disconnected overlay
  if (disconnected) {
    return (
      <div className="min-h-screen bg-[#0a0e17] flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto">
            <Monitor className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-white">Sesion finalizada</h2>
          <p className="text-sm text-[#94a3b8]">
            La conexion a <span className="text-white font-medium">{connName}</span> se ha cerrado.
          </p>
          <p className="text-sm text-cyan-400">
            Redirigiendo a Workspaces en {countdown}s...
          </p>
          <div className="flex gap-3 justify-center pt-2">
            <Button onClick={loadConnection} variant="outline" className="gap-2 border-[#1e293b] text-white">
              Reconectar
            </Button>
            <Button onClick={() => navigate('/workspaces')} className="bg-cyan-500 hover:bg-cyan-400 text-black gap-2">
              <ArrowLeft className="w-4 h-4" /> Ir a Workspaces
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Active session — embedded Guacamole
  return (
    <div className={`bg-[#0a0e17] ${fullscreen ? 'fixed inset-0 z-[9999]' : 'min-h-screen'}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#111827] border-b border-[#1e293b]">
        <div className="flex items-center gap-3">
          <button onClick={handleClose} className="flex items-center gap-1.5 text-[#94a3b8] hover:text-white text-xs transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Workspaces
          </button>
          <div className="w-px h-4 bg-[#1e293b]" />
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-white text-xs font-medium">{connName}</span>
            <span className="text-[10px] text-[#94a3b8] font-mono">ID:{connId}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleFullscreen} className="p-1.5 rounded hover:bg-[#1e293b] text-[#94a3b8] hover:text-white transition-colors">
            {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button onClick={handleDisconnect} className="p-1.5 rounded hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors" title="Cerrar sesion">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Guacamole iframe */}
      <iframe
        ref={iframeRef}
        src={guacUrl}
        className="w-full border-0"
        style={{ height: fullscreen ? 'calc(100vh - 36px)' : 'calc(100vh - 36px)' }}
        title={connName}
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        data-testid="guac-iframe"
      />
    </div>
  );
}
