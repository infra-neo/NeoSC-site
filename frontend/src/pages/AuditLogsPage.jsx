import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { Badge } from '@/components/ui/badge';
import axios from 'axios';
import { FileText, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function AuditLogsPage() {
  const { getAuthHeader } = useAuth();
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    axios.get(`${API}/audit-logs`, { headers: getAuthHeader() })
      .then(r => setLogs(r.data))
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="lg:ml-64 p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          <h1 className="text-2xl font-bold" data-testid="audit-logs-title">Auditoría</h1>
          {logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-8 h-8 mx-auto mb-3 opacity-50" />
              <p>No hay registros de auditoría</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="max-h-[600px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/50 backdrop-blur">
                    <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                      <th className="text-left p-3">Fecha</th>
                      <th className="text-left p-3">Usuario</th>
                      <th className="text-left p-3">Acción</th>
                      <th className="text-left p-3">Recurso</th>
                      <th className="p-3">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log, i) => (
                      <tr key={log.id || i} className="border-b border-border last:border-0 hover:bg-muted/20">
                        <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                          {log.timestamp ? new Date(log.timestamp).toLocaleString('es-MX') : '-'}
                        </td>
                        <td className="p-3 text-xs">{log.user_email}</td>
                        <td className="p-3">
                          <Badge variant="outline" className="text-xs">{log.action}</Badge>
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">{log.resource}</td>
                        <td className="p-3 text-center">
                          {log.success ? (
                            <CheckCircle2 className="w-4 h-4 text-green-400 mx-auto" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-400 mx-auto" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
