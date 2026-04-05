import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const TOKEN_KEY = 'neosc_token';
const USER_KEY = 'neosc_user';

const AuthContext = createContext(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authMethod, setAuthMethod] = useState('local');

  // Restore session from localStorage
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    const saved = localStorage.getItem(USER_KEY);
    if (token && saved) {
      try {
        const parsed = JSON.parse(saved);
        setUser(parsed);
        setAuthMethod(parsed.sso_provider ? 'zitadel' : 'local');
      } catch { /* ignore */ }
    }
    setLoading(false);
  }, []);

  const getAuthHeader = useCallback(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const login = async (email, password) => {
    const res = await axios.post(`${API}/auth/login`, { email, password });
    const { access_token, user: u } = res.data;
    localStorage.setItem(TOKEN_KEY, access_token);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    setUser(u);
    setAuthMethod('local');
    return u;
  };

  const register = async (email, password, name, organization) => {
    const res = await axios.post(`${API}/auth/register`, { email, password, name, organization });
    const { access_token, user: u } = res.data;
    localStorage.setItem(TOKEN_KEY, access_token);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    setUser(u);
    setAuthMethod('local');
    return u;
  };

  const ssoLogin = async (ssoData) => {
    const res = await axios.post(`${API}/auth/sso`, ssoData);
    const { access_token, user: u } = res.data;
    localStorage.setItem(TOKEN_KEY, access_token);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    setUser(u);
    setAuthMethod('zitadel');
    return u;
  };

  const logout = async () => {
    try {
      await axios.post(`${API}/auth/logout`, {}, { headers: getAuthHeader() });
    } catch { /* ignore */ }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  };

  const isAuthenticated = !!user;
  const isAdmin = user?.role === 'admin' || user?.role === 'platform_admin';
  const userRoles = user?.roles || [];

  return (
    <AuthContext.Provider value={{
      user, loading, login, register, ssoLogin, logout,
      getAuthHeader, isAuthenticated, isAdmin, authMethod, userRoles
    }}>
      {children}
    </AuthContext.Provider>
  );
};
