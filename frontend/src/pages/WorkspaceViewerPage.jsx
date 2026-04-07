import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import axios from 'axios';
import { ArrowLeft, Maximize2, Minimize2, RefreshCw } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function WorkspaceViewerPage() {
  const { sessionId } = useParams();
  const { getAuthHeader } = useAuth();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    axios.get(`${API}/sessions/${sessionId}`, { headers: getAuthHeader() })
      .then(r => {
        const data = r.data;
        // If no connection_url, use the TSplus proxy
        if (!data.connection_url) {
          data.connection_url = 'https://web.proxy.kappa4.com/';
        }
        setSession(data);
      })
      .catch(() => navigate('/workspaces'));
  }, [sessionId]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setFullscreen(true);
    } else {
      document.exitFullscreen();
      setFullscreen(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Toolbar */}
      <div className={`flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 ${fullscreen ? 'hidden' : ''}`}>
        <Button size="sm" variant="ghost" onClick={() => navigate('/workspaces')} className="text-zinc-400 hover:text-white gap-1">
          <ArrowLeft className="w-4 h-4" /> Volver
        </Button>
        <div className="flex-1 text-center text-xs text-zinc-500">
          {session?.workspace_name || 'Cargando...'} — {session?.workspace_type}
        </div>
        <Button size="sm" variant="ghost" onClick={toggleFullscreen} className="text-zinc-400 hover:text-white">
          {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </Button>
      </div>

      {/* Viewer iframe */}
      <div className="flex-1 relative" data-testid="workspace-viewer">
        {session?.connection_url ? (
          <iframe
            src={session.connection_url}
            className="w-full h-full border-0"
            title="Workspace Viewer"
            allow="clipboard-read; clipboard-write; fullscreen"
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
