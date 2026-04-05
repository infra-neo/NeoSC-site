import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const { ssoLogin } = useAuth();
  const [status, setStatus] = useState('Procesando SSO...');

  useEffect(() => {
    const handle = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const state = params.get('state');

        if (!code) {
          setStatus('Error: no se recibió código de autorización');
          setTimeout(() => navigate('/login'), 3000);
          return;
        }

        const savedState = sessionStorage.getItem('oauth_state');
        if (state !== savedState) {
          setStatus('Error: state mismatch');
          setTimeout(() => navigate('/login'), 3000);
          return;
        }

        const codeVerifier = sessionStorage.getItem('pkce_code_verifier');
        const provider = sessionStorage.getItem('sso_provider') || 'zitadel_cloud';
        const authority = sessionStorage.getItem('sso_authority');
        const clientId = sessionStorage.getItem('sso_client_id');

        setStatus('Intercambiando token...');

        // Exchange code for tokens via backend
        const tokenRes = await axios.post(`${API}/auth/token-exchange`, {
          code,
          code_verifier: codeVerifier,
          redirect_uri: `${BACKEND_URL}/auth/callback`,
          authority,
          client_id: clientId,
          provider,
        });

        const { tokens, profile, roles, groups } = tokenRes.data;

        setStatus('Iniciando sesión SSO...');

        await ssoLogin({
          access_token: tokens.access_token,
          id_token: tokens.id_token,
          profile,
          provider,
          roles,
          groups,
        });

        // Cleanup
        sessionStorage.removeItem('oauth_state');
        sessionStorage.removeItem('pkce_code_verifier');
        sessionStorage.removeItem('sso_provider');
        sessionStorage.removeItem('sso_authority');
        sessionStorage.removeItem('sso_client_id');

        navigate('/dashboard', { replace: true });
      } catch (err) {
        console.error('SSO callback error:', err);
        setStatus(`Error: ${err.response?.data?.detail || err.message}`);
        setTimeout(() => navigate('/login'), 4000);
      }
    };

    handle();
  }, [navigate, ssoLogin]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-muted-foreground">{status}</p>
      </div>
    </div>
  );
}
