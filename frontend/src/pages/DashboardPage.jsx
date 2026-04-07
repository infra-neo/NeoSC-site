import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Monitor, Zap, Users, ShieldCheck, TrendingUp, Activity } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function DashboardPage() {
  const { user, getAuthHeader } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        const [statsRes, sessionsRes] = await Promise.all([
          axios.get(`${API}/stats`, { headers: getAuthHeader() }),
          axios.get(`${API}/sessions/active`, { headers: getAuthHeader() }),
        ]);
        setStats(statsRes.data);
        setSessions(sessionsRes.data);
      } catch { /* ignore */ }
    };
    load();
  }, [getAuthHeader]);

  const kpis = [
    { label: 'Workspaces', value: stats?.total_workspaces || 0, icon: Monitor, color: 'text-cyan-400' },
    { label: 'Sesiones Activas', value: stats?.active_sessions || 0, icon: Zap, color: 'text-green-400' },
    { label: 'Usuarios', value: stats?.total_users || 0, icon: Users, color: 'text-amber-400' },
    { label: 'Uptime', value: stats?.uptime || '99.9%', icon: ShieldCheck, color: 'text-purple-400' },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="lg:ml-56 p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold" data-testid="dashboard-title">
              Bienvenido, {user?.name}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Panel de control NeoSC
            </p>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="dashboard-kpis">
            {kpis.map((kpi) => (
              <div key={kpi.label} className="rounded-xl border border-border bg-card p-5 text-center">
                <kpi.icon className={`w-5 h-5 mx-auto mb-2 ${kpi.color}`} />
                <div className={`text-2xl font-black ${kpi.color}`}>
                  {kpi.value}
                </div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">
                  {kpi.label}
                </div>
              </div>
            ))}
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="font-bold flex items-center gap-2 mb-3">
                <Activity className="w-4 h-4 text-cyan-400" />
                Acciones Rápidas
              </h2>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/workspaces')}
                  data-testid="goto-workspaces"
                >
                  <Monitor className="w-4 h-4 mr-1" /> Mis Workspaces
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/market')}
                  className="border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
                  data-testid="goto-market"
                >
                  🪟 Comprar VM Windows
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/sessions')}
                >
                  <Zap className="w-4 h-4 mr-1" /> Ver Sesiones
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="font-bold flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-green-400" />
                Sesiones Activas
              </h2>
              {sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay sesiones activas</p>
              ) : (
                <div className="space-y-2">
                  {sessions.slice(0, 5).map((s) => (
                    <div key={s.id} className="flex items-center justify-between text-sm p-2 rounded-lg bg-muted/30">
                      <div>
                        <span className="font-medium">{s.workspace_name}</span>
                        <Badge variant="outline" className="ml-2 text-xs">
                          {s.workspace_type}
                        </Badge>
                      </div>
                      <Badge className="bg-green-500/10 text-green-400 border-green-500/30 text-xs">
                        activa
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Market CTA */}
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-6 text-center">
            <h2 className="text-xl font-bold mb-2">
              Windows VDI Cloud — <span className="text-cyan-400">Zero Trust</span>
            </h2>
            <p className="text-muted-foreground text-sm mb-4">
              VMs Windows con NeoDesk HTML5, NeoMesh Zero Trust y NeoGuard SSO. Sin VPN, sin cliente.
            </p>
            <Button
              onClick={() => navigate('/market')}
              className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold gap-2"
              data-testid="market-cta-button"
            >
              Ver planes desde $29/mes
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
