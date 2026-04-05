import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { ZITADEL_CLOUD_CONFIG } from '@/config/zitadel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Shield, LogIn, UserPlus, Eye, EyeOff } from 'lucide-react';

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
  const { login, register } = useAuth();

  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const from = searchParams.get('from') || '/dashboard';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'register') {
        await register(email, password, name);
      } else {
        await login(email, password);
      }
      navigate(from, { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error de autenticación');
    } finally {
      setLoading(false);
    }
  };

  const handleZitadelSSO = async () => {
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
          <h1 className="text-2xl font-bold mt-4">
            {mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {mode === 'login' ? 'Accede a tu plataforma NeoSC' : 'Regístrate en NeoSC'}
          </p>
        </div>

        {/* SSO Button */}
        <Button
          variant="outline"
          className="w-full gap-2 border-border hover:border-cyan-500/50 py-5"
          onClick={handleZitadelSSO}
          data-testid="sso-login-button"
        >
          <Shield className="w-4 h-4 text-cyan-400" />
          Continuar con Zitadel SSO
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-background px-3 text-muted-foreground">o con email</span>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <Label className="text-sm mb-1.5 block">Nombre</Label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Tu nombre"
                required
                data-testid="register-name-input"
              />
            </div>
          )}
          <div>
            <Label className="text-sm mb-1.5 block">Email</Label>
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu@email.com"
              required
              data-testid="login-email-input"
            />
          </div>
          <div>
            <Label className="text-sm mb-1.5 block">Contraseña</Label>
            <div className="relative">
              <Input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Tu contraseña"
                required
                data-testid="login-password-input"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-bold py-5 gap-2"
            data-testid="login-submit-button"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
            ) : mode === 'login' ? (
              <LogIn className="w-4 h-4" />
            ) : (
              <UserPlus className="w-4 h-4" />
            )}
            {mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          {mode === 'login' ? (
            <>¿No tienes cuenta? <button onClick={() => setMode('register')} className="text-cyan-400 hover:underline" data-testid="switch-to-register">Regístrate</button></>
          ) : (
            <>¿Ya tienes cuenta? <button onClick={() => setMode('login')} className="text-cyan-400 hover:underline" data-testid="switch-to-login">Inicia sesión</button></>
          )}
        </p>
      </div>
    </div>
  );
}
