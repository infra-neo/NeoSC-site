import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import axios from 'axios';
import { toast } from 'sonner';
import { LayoutGrid, Columns, X, Maximize2 } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function MultiViewPage() {
  const { getAuthHeader } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [activeSessions, setActiveSessions] = useState([]);
  const [layout, setLayout] = useState('grid'); // grid | cols

  useEffect(() => {
    axios.get(`${API}/sessions/active`, { headers: getAuthHeader() })
      .then(r => {
        setSessions(r.data);
        setActiveSessions(r.data.slice(0, 4));
      })
      .catch(() => {});
  }, []);

  const removeSession = (id) => {
    setActiveSessions(prev => prev.filter(s => s.id !== id));
  };

  const gridCols = activeSessions.length <= 1 ? 'grid-cols-1' :
    activeSessions.length <= 2 ? 'grid-cols-2' :
    activeSessions.length <= 4 ? 'grid-cols-2' : 'grid-cols-3';

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="lg:ml-64 p-4 h-screen flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold" data-testid="multiview-title">Multi-View</h1>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {activeSessions.length} sesiones
            </Badge>
            <Button size="sm" variant="ghost" onClick={() => setLayout(layout === 'grid' ? 'cols' : 'grid')}>
              {layout === 'grid' ? <Columns className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* Sessions grid */}
        {activeSessions.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <p>No hay sesiones activas para visualizar</p>
          </div>
        ) : (
          <div className={`flex-1 grid ${gridCols} gap-2`}>
            {activeSessions.map((s) => (
              <div key={s.id} className="rounded-lg border border-border bg-card overflow-hidden flex flex-col" data-testid={`multiview-panel-${s.id}`}>
                <div className="flex items-center gap-2 px-2 py-1 bg-muted/30 border-b border-border text-xs">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  <span className="flex-1 truncate font-medium">{s.workspace_name}</span>
                  <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-muted-foreground hover:text-red-400" onClick={() => removeSession(s.id)}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
                <div className="flex-1 bg-zinc-950 flex items-center justify-center">
                  {s.connection_url ? (
                    <iframe src={s.connection_url} className="w-full h-full border-0" title={s.workspace_name} />
                  ) : (
                    <div className="text-xs text-zinc-600 text-center p-4">
                      <p>{s.workspace_name}</p>
                      <p className="mt-1">{s.workspace_type}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
