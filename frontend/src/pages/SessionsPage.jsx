import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import axios from 'axios';
import { Zap, XCircle } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function SessionsPage() {
  const { getAuthHeader } = useAuth();
  const [sessions, setSessions] = useState([]);

  const load = async () => {
    try {
      const res = await axios.get(`${API}/sessions`, { headers: getAuthHeader() });
      setSessions(res.data);
    } catch { /* ignore */ }
  };

  useEffect(() => { load(); }, []);

  const disconnect = async (id) => {
    try {
      await axios.post(`${API}/sessions/${id}/disconnect`, {}, { headers: getAuthHeader() });
      load();
    } catch { /* ignore */ }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="lg:ml-64 p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          <h1 className="text-2xl font-bold" data-testid="sessions-title">Sesiones Activas</h1>
          {sessions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Zap className="w-8 h-8 mx-auto mb-3 opacity-50" />
              <p>No hay sesiones registradas</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground uppercase tracking-wider">
                    <th className="text-left p-3">Workspace</th>
                    <th className="p-3">Tipo</th>
                    <th className="p-3">Estado</th>
                    <th className="p-3">Inicio</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id} className="border-b border-border last:border-0">
                      <td className="p-3 font-medium">{s.workspace_name}</td>
                      <td className="p-3 text-center">
                        <Badge variant="outline" className="text-xs">{s.workspace_type}</Badge>
                      </td>
                      <td className="p-3 text-center">
                        <Badge className={`text-xs ${
                          s.status === 'active' ? 'bg-green-500/10 text-green-400 border-green-500/30' :
                          s.status === 'disconnected' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {s.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-center text-xs text-muted-foreground">
                        {s.started_at ? new Date(s.started_at).toLocaleString('es-MX') : '-'}
                      </td>
                      <td className="p-3 text-right">
                        {s.status === 'active' && (
                          <Button size="sm" variant="ghost" onClick={() => disconnect(s.id)} className="text-red-400 hover:text-red-300">
                            <XCircle className="w-4 h-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
