import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getZitadelConfig, zitadelLogin } from '../services/api';
import { Monitor, ArrowRight, AlertCircle, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function formatApiErrorDetail(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).filter(Boolean).join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [zitadelEnabled, setZitadelEnabled] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    // Check for auth errors from callback
    const authError = searchParams.get('error');
    if (authError) {
      setError('Authentication failed. Please try again.');
    }

    // Check Zitadel config
    getZitadelConfig()
      .then(res => setZitadelEnabled(res.data.enabled))
      .catch(() => setZitadelEnabled(false));
  }, [searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleZitadelLogin = () => {
    window.location.href = zitadelLogin();
  };

  return (
    <div className="min-h-screen gradient-hero grid-pattern flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="card-cyber p-8 animate-scaleIn">
          <div className="text-center mb-8">
            <Link to="/" className="inline-flex items-center gap-2 mb-6">
              <Monitor className="w-10 h-10 text-brand-teal" />
              <span className="text-2xl font-bold text-brand-teal">WinDesk</span>
              <span className="text-2xl font-light text-muted2">Cloud</span>
            </Link>
            <h1 className="text-2xl font-bold mb-2">Bienvenido</h1>
            <p className="text-muted-custom">Inicia sesión para acceder a tu escritorio virtual</p>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 mb-6 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Zitadel SSO Button */}
          {zitadelEnabled && (
            <>
              <Button
                type="button"
                onClick={handleZitadelLogin}
                className="w-full mb-4 bg-[#5469d4] hover:bg-[#4356b4] text-white py-6"
                data-testid="zitadel-login-btn"
              >
                <Shield className="w-5 h-5 mr-3" />
                Iniciar sesión con Zitadel SSO
              </Button>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-custom"></div>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-4 bg-surface text-muted-custom">o continuar con email</span>
                </div>
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="tu@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="login-email-input"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                data-testid="login-password-input"
              />
            </div>

            <Button
              type="submit"
              className="w-full btn-cyber"
              disabled={loading}
              data-testid="login-submit-btn"
            >
              {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
              {!loading && <ArrowRight className="w-4 h-4 ml-2" />}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-custom">
            ¿No tienes cuenta?{' '}
            <Link to="/register" className="text-brand-teal hover:underline" data-testid="go-to-register">
              Crear una
            </Link>
          </div>

          <div className="mt-4 p-3 rounded-lg bg-elevated border border-custom text-center">
            <p className="text-xs text-muted2 mono">
              Demo: usuario1@windesk.cloud / Demo123!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
