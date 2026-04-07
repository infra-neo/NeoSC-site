import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import axios from 'axios';
import { Globe, ExternalLink } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function ApplicationsPage() {
  const { getAuthHeader } = useAuth();
  const [apps, setApps] = useState([]);

  useEffect(() => {
    axios.get(`${API}/applications`, { headers: getAuthHeader() })
      .then(r => setApps(r.data))
      .catch(() => {});
  }, []);

  const launchApp = async (appId) => {
    try {
      const res = await axios.post(`${API}/applications/${appId}/launch`, {}, { headers: getAuthHeader() });
      const url = res.data.connection_url;
      if (url) window.open(url, '_blank');
    } catch { /* ignore */ }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="lg:ml-56 p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          <h1 className="text-2xl font-bold" data-testid="applications-title">Aplicaciones</h1>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {apps.map((app) => (
              <div key={app.id} className="rounded-xl border border-border bg-card p-4 space-y-3" data-testid={`app-${app.id}`}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{app.icon}</span>
                  <div>
                    <h3 className="font-bold text-sm">{app.name}</h3>
                    <p className="text-xs text-muted-foreground">{app.category}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{app.description}</p>
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-xs">{app.sso_type}</Badge>
                  <Button size="sm" onClick={() => launchApp(app.id)} className="gap-1">
                    <ExternalLink className="w-3 h-3" /> Abrir
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
