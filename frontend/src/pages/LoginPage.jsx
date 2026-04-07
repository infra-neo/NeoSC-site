import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { ZITADEL_CLOUD_CONFIG } from '@/config/zitadel';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Zap, Crown, Users, Shield } from 'lucide-react';

function generateRandomString() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

const QUICK_ACCOUNTS = [
  { email: 'admin@windesk.cloud', password: 'Admin123!', label: 'Platform Admin', role: 'admin', icon: Crown, color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/30 hover:bg-orange-500/20' },
  { email: 'usuario1@windesk.cloud', password: 'Demo123!', label: 'Usuario Demo 1', role: 'user', icon: Users, color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/30 hover:bg-cyan-500/20' },
  { email: 'usuario2@windesk.cloud', password: 'Demo123!', label: 'Usuario Demo 2', role: 'user', icon: Users, color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/30 hover:bg-cyan-500/20' },
  { email: 'usuario3@windesk.cloud', password: 'Demo123!', label: 'Usuario Demo 3', role: 'user', icon: Users, color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/30 hover:bg-cyan-500/20' },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();
  const [loading, setLoading] = useState(null);

  const from = searchParams.get('from') || '/dashboard';

  const handleQuickLogin = async (account) => {
    setLoading(account.email);
    try {
      await login(account.email, account.password);
      navigate(from, { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error de autenticación');
    } finally {
      setLoading(null);
    }
  };

  const handleNeoSCSSO = async () => {
    const cfg = ZITADEL_CLOUD_CONFIG;
    const state = generateRandomString();
    const codeVerifier = generateRandomString();

    sessionStorage.setItem('oauth_state', state);
    sessionStorage.setItem('pkce_code_verifier', codeVerifier);
    sessionStorage.setItem('sso_provider', cfg.provider_key);
    sessionStorage.setItem('sso_authority', cfg.authority);
    sessionStorage.setItem('sso_client_id', cfg.client_id);

    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const params = new URLSearchParams({
      client_id: cfg.client_id,
      redirect_uri: cfg.redirect_uri,
      scope: cfg.scope,
      response_type: 'code',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    window.location.href = `${cfg.authorization_endpoint}?${params.toString()}`;
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="text-center">
          <Link to="/" className="inline-flex items-center gap-2">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center">
              <span className="text-white font-bold text-xl">N</span>
            </div>
          </Link>
          <h1 className="text-2xl font-bold mt-4">Acceso NeoSC</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Selecciona una cuenta o usa SSO
          </p>
        </div>

        {/* NeoSC SSO Button */}
        <Button
          variant="outline"
          className="w-full gap-2 border-purple-500/30 hover:border-purple-500/60 hover:bg-purple-500/10 py-5 text-purple-400"
          onClick={handleNeoSCSSO}
          data-testid="sso-login-button"
        >
          <Shield className="w-4 h-4" />
          Continuar con NeoSC SSO (Zitadel)
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-background px-3 text-muted-foreground">o acceso rápido local</span>
          </div>
        </div>

        {/* Quick Access Accounts */}
        <div className="space-y-3" data-testid="quick-access-list">
          {QUICK_ACCOUNTS.map((account) => {
            const Icon = account.icon;
            const isLoading = loading === account.email;
            return (
              <button
                key={account.email}
                onClick={() => handleQuickLogin(account)}
                disabled={loading !== null}
                data-testid={`quick-login-${account.role === 'admin' ? 'admin' : account.email.split('@')[0]}`}
                className={`
                  w-full flex items-center gap-4 p-4 rounded-xl border transition-all duration-200
                  ${account.bg}
                  ${isLoading ? 'ring-2 ring-cyan-500/50' : ''}
                  disabled:opacity-50
                `}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  account.role === 'admin' 
                    ? 'bg-gradient-to-br from-orange-500 to-amber-500' 
                    : 'bg-gradient-to-br from-cyan-500 to-cyan-600'
                }`}>
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Icon className="w-5 h-5 text-white" />
                  )}
                </div>
                <div className="flex-1 text-left">
                  <div className="font-bold text-sm">{account.label}</div>
                  <div className="text-xs text-muted-foreground">{account.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                    account.role === 'admin' 
                      ? 'bg-orange-500/20 text-orange-400' 
                      : 'bg-cyan-500/20 text-cyan-400'
                  }`}>
                    {account.role}
                  </span>
                  <Zap className={`w-4 h-4 ${account.color}`} />
                </div>
              </button>
            );
          })}
        </div>

        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            Bypass local + NeoSC SSO
          </p>
        </div>
      </div>
    </div>
  );
}
