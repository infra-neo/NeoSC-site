import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Loader2, Monitor } from 'lucide-react';

const AuthCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { checkAuth } = useAuth();

  useEffect(() => {
    const handleCallback = async () => {
      const error = searchParams.get('error');
      
      if (error) {
        navigate('/login?error=auth_failed');
        return;
      }

      // The backend should have set cookies, so check auth
      try {
        await checkAuth();
        navigate('/dashboard');
      } catch (err) {
        navigate('/login?error=auth_failed');
      }
    };

    handleCallback();
  }, [navigate, searchParams, checkAuth]);

  return (
    <div className="min-h-screen gradient-hero grid-pattern flex items-center justify-center">
      <div className="card-cyber p-12 text-center animate-scaleIn">
        <div className="flex items-center justify-center gap-3 mb-6">
          <Monitor className="w-10 h-10 text-brand-teal" />
          <span className="text-2xl font-bold text-brand-teal">WinDesk</span>
          <span className="text-2xl font-light text-muted2">Cloud</span>
        </div>
        <Loader2 className="w-12 h-12 text-brand-teal animate-spin mx-auto mb-4" />
        <p className="text-muted2">Completando autenticación...</p>
      </div>
    </div>
  );
};

export default AuthCallback;
