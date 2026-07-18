import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { ZITADEL_CLOUD_CONFIG } from '@/config/zitadel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Shield, Lock, Mail } from 'lucide-react';

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


export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const from = searchParams.get('from') || '/dashboard';

  // If already authenticated, skip the login picker entirely
  useEffect(() => {
    if (!authLoading && user) {
      navigate(from, { replace: true });
    }
  }, [authLoading, user, navigate, from]);

  const handleLocalLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Usuario o contraseña incorrectos');
    } finally {
      setLoading(false);
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
            <span className="bg-background px-3 text-muted-foreground">o con cuenta local</span>
          </div>
        </div>

        {/* Local login form */}
        <form onSubmit={handleLocalLogin} className="space-y-3" data-testid="local-login-form">
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="email"
              placeholder="correo@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-9"
              autoComplete="username"
              data-testid="local-login-email"
              required
            />
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-9"
              autoComplete="current-password"
              data-testid="local-login-password"
              required
            />
          </div>
          <Button
            type="submit"
            className="w-full py-5"
            disabled={loading}
            data-testid="local-login-submit"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              'Iniciar sesión'
            )}
          </Button>
        </form>

        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            Las cuentas locales las crea un administrador de la plataforma.
          </p>
        </div>
      </div>
    </div>
  );
}
