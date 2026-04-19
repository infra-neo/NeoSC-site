import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import SessionToolbar from '@/components/SessionToolbar';
import axios from 'axios';
import { toast } from 'sonner';
import { ArrowLeft, Maximize2, Minimize2, Loader2, Monitor } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/**
 * WorkspaceViewerPage
 * Routes:
 *   /viewer/:sessionId            → Resume existing session
 *   /viewer/new/:workspaceId      → Launch autologon (TSplus) + create session
 */
export default function WorkspaceViewerPage() {
  const { sessionId: paramSessionId, workspaceId } = useParams();
  const { getAuthHeader } = useAuth();
  const authHeader = getAuthHeader();
  const navigate = useNavigate();
  const location = useLocation();

  // When path is /viewer/new/:workspaceId -> paramSessionId is "new"
  const isLaunch = location.pathname.startsWith('/viewer/new/') && !!workspaceId;

  const [sessionId, setSessionId] = useState(isLaunch ? null : paramSessionId);
  const [session, setSession] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [terminated, setTerminated] = useState(null); // 'logoff' | 'disconnect'
  const iframeRef = useRef(null);

  useEffect(() => {
    if (isLaunch) {
      launchAutologon();
    } else if (paramSessionId) {
      loadSession(paramSessionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramSessionId, workspaceId]);

  const launchAutologon = async () => {
    try {
      const res = await axios.post(
        `${API}/workspaces/${workspaceId}/launch-autologon`,
        {},
        { headers: authHeader }
      );
      const data = res.data;
      setSessionId(data.session_id);
      setSession({
        id: data.session_id,
        workspace_id: workspaceId,
        workspace_name: data.workspace?.name || 'Workspace',
        workspace_type: data.workspace?.type || 'rdp',
        connection_url: data.connection_url,
        autologon: !!data.autologon,
        clientless: !!data.clientless,
        launch_mode: data.launch_mode || 'iframe',
      });
      if (data.autologon) {
        toast.success('Autologon iniciado — credenciales inyectadas vía TSplus');
      } else {
        toast.info('Sesión lanzada sin autologon');
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo iniciar autologon');
      setTimeout(() => navigate('/workspaces'), 1500);
    }
  };

  const loadSession = async (sid) => {
    try {
      const r = await axios.get(`${API}/sessions/${sid}`, { headers: authHeader });
      const data = r.data;
      if (!data.connection_url) {
        data.connection_url = 'https://web.proxy.kappa4.com/';
      }
      setSession(data);
    } catch {
      navigate('/workspaces');
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
      setFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setFullscreen(false);
    }
  };

  const handleTerminated = (action) => {
    setTerminated(action);
    if (iframeRef.current) iframeRef.current.src = 'about:blank';
    // Auto-return after 3s
    setTimeout(() => navigate('/workspaces'), 3000);
  };

  // Loading screen
  if (!session) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center" data-testid="workspace-viewer-loading">
        <div className="text-center space-y-4">
          <Loader2 className="w-10 h-10 text-cyan-400 animate-spin mx-auto" />
          <p className="text-sm text-zinc-400">
            {isLaunch ? 'Inyectando credenciales vía TSplus Farm API...' : 'Cargando sesión...'}
          </p>
        </div>
      </div>
    );
  }

  // Terminated overlay
  if (terminated) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center" data-testid="workspace-viewer-terminated">
        <div className="text-center space-y-4 max-w-sm">
          <Monitor className="w-12 h-12 text-red-400 mx-auto" />
          <h2 className="text-lg font-bold">
            {terminated === 'logoff' ? 'Sesión cerrada' : 'Sesión desconectada'}
          </h2>
          <p className="text-sm text-zinc-400">
            Redirigiendo a workspaces...
          </p>
          <Button onClick={() => navigate('/workspaces')} className="bg-cyan-500 hover:bg-cyan-400 text-black gap-1">
            <ArrowLeft className="w-4 h-4" /> Ir ahora
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Toolbar */}
      <div className={`flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 ${fullscreen ? 'hidden' : ''}`}>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => navigate('/workspaces')}
          className="text-zinc-400 hover:text-white gap-1"
          data-testid="back-to-workspaces"
        >
          <ArrowLeft className="w-4 h-4" /> Volver
        </Button>
        <div className="flex-1 text-center text-xs text-zinc-500 truncate px-2">
          {session.workspace_name || 'Workspace'}
          <span className="text-zinc-600 mx-1.5">·</span>
          <span className="uppercase">{session.workspace_type}</span>
        </div>
        <SessionToolbar
          sessionId={sessionId}
          workspaceName={session.workspace_name}
          autologon={session.autologon}
          authHeader={authHeader}
          onTerminated={handleTerminated}
        />
        <Button
          size="sm"
          variant="ghost"
          onClick={toggleFullscreen}
          className="text-zinc-400 hover:text-white h-7 px-2"
          data-testid="toggle-fullscreen"
        >
          {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </Button>
      </div>

      {/* Viewer iframe */}
      <div className="flex-1 relative" data-testid="workspace-viewer">
        {session.connection_url ? (
          <iframe
            ref={iframeRef}
            src={session.connection_url}
            className="w-full h-full border-0"
            title="Workspace Viewer"
            allow="clipboard-read; clipboard-write; fullscreen"
            allowFullScreen
            data-testid="workspace-iframe"
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-3">
              <div className="w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-zinc-500 text-sm">Conectando al workspace...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
