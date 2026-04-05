import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { Badge } from '@/components/ui/badge';
import axios from 'axios';
import { Building2, Users, Globe } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function OrganizationsPage() {
  const { getAuthHeader } = useAuth();
  const [orgs, setOrgs] = useState([]);

  useEffect(() => {
    axios.get(`${API}/organizations`, { headers: getAuthHeader() })
      .then(r => setOrgs(r.data))
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="lg:ml-64 p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          <h1 className="text-2xl font-bold" data-testid="organizations-title">Organizaciones</h1>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {orgs.map((org) => (
              <div key={org.id} className="rounded-xl border border-border bg-card p-5" data-testid={`org-${org.id}`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div>
                    <h3 className="font-bold">{org.name}</h3>
                    <p className="text-xs text-muted-foreground">{org.domain || 'Sin dominio'}</p>
                  </div>
                </div>
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {org.member_count || 0}</span>
                  <span className="flex items-center gap-1"><Globe className="w-3.5 h-3.5" /> {org.sso_provider || 'local'}</span>
                </div>
                <Badge variant="outline" className="mt-3 text-xs">{org.plan || 'starter'}</Badge>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
