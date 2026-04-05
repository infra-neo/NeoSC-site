import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import axios from 'axios';
import { toast } from 'sonner';
import { Shield, ToggleLeft, ToggleRight } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function PoliciesPage() {
  const { getAuthHeader } = useAuth();
  const [policies, setPolicies] = useState([]);

  const load = async () => {
    try {
      const res = await axios.get(`${API}/policies`, { headers: getAuthHeader() });
      setPolicies(res.data);
    } catch { /* ignore */ }
  };

  useEffect(() => { load(); }, []);

  const togglePolicy = async (id) => {
    try {
      await axios.patch(`${API}/policies/${id}`, {}, { headers: getAuthHeader() });
      toast.success('Política actualizada');
      load();
    } catch { /* ignore */ }
  };

  const typeColor = (t) => {
    if (t === 'access') return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
    if (t === 'network') return 'bg-green-500/10 text-green-400 border-green-500/30';
    if (t === 'session') return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
    return 'bg-muted text-muted-foreground';
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="lg:ml-64 p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <h1 className="text-2xl font-bold" data-testid="policies-title">Políticas de Seguridad</h1>
          <div className="space-y-3">
            {policies.map((p) => (
              <div key={p.id} className="rounded-xl border border-border bg-card p-5" data-testid={`policy-${p.id}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <Shield className="w-5 h-5 text-cyan-400" />
                    <div>
                      <h3 className="font-bold">{p.name}</h3>
                      <p className="text-xs text-muted-foreground">{p.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className={`text-xs ${typeColor(p.type)}`}>{p.type}</Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => togglePolicy(p.id)}
                      className={p.enabled ? 'text-green-400' : 'text-muted-foreground'}
                    >
                      {p.enabled ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(p.rules || []).map((r, i) => (
                    <span key={i} className="text-xs bg-muted/50 px-2 py-0.5 rounded text-muted-foreground">
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
