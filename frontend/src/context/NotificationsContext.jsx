import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const NotificationsContext = createContext(null);

/**
 * NotificationsProvider — connects to /api/notifications/stream (SSE) and
 * emits toasts + keeps a short history accessible via useNotifications().
 */
export function NotificationsProvider({ children }) {
  const { user, getAuthHeader } = useAuth();
  const token = (getAuthHeader().Authorization || '').replace('Bearer ', '');
  const [events, setEvents] = useState([]); // recent events (most-recent first)
  const [connected, setConnected] = useState(false);
  const esRef = useRef(null);
  const retryTimerRef = useRef(null);

  const pushEvent = useCallback((evt) => {
    setEvents(prev => [evt, ...prev].slice(0, 50));
  }, []);

  const handleEvent = useCallback((evt) => {
    pushEvent(evt);
    const sev = evt.severity || 'info';
    const title = evt.title || 'Notificación';
    const message = evt.message || '';
    if (sev === 'error') toast.error(title, { description: message });
    else if (sev === 'warning') toast.warning(title, { description: message });
    else if (sev === 'success') toast.success(title, { description: message });
    else toast(title, { description: message });

    // Session-kill events: if user is currently in a session that matches, leave the viewer
    if (evt.type && evt.type.startsWith('session.') && evt.session_id) {
      if (window.location.pathname.includes(`/viewer/`)) {
        // Let the viewer page decide what to do; broadcast via custom event
        window.dispatchEvent(new CustomEvent('neosc:session-terminated', { detail: evt }));
      }
    }
  }, [pushEvent]);

  useEffect(() => {
    if (!user || !token) return undefined;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      const url = `${API}/notifications/stream?token=${encodeURIComponent(token)}`;
      try {
        const es = new EventSource(url);
        esRef.current = es;

        es.addEventListener('ready', () => setConnected(true));
        es.addEventListener('error', () => {
          setConnected(false);
          es.close();
          if (!cancelled) {
            // Exponential-ish retry, capped at 10s
            retryTimerRef.current = setTimeout(connect, 3000);
          }
        });

        // Listen for any named event plus the default
        const listener = (ev) => {
          try {
            const data = JSON.parse(ev.data);
            handleEvent(data);
          } catch (e) { /* ignore */ }
        };
        ['message', 'info', 'warning', 'error', 'success',
         'session.logoff', 'session.disconnect', 'session.lock',
         'user.invited', 'tenant.enrolled', 'connector.deployed',
        ].forEach(t => es.addEventListener(t, listener));
      } catch (e) {
        console.warn('SSE connect failed', e);
      }
    };

    connect();
    return () => {
      cancelled = true;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (esRef.current) esRef.current.close();
      setConnected(false);
    };
  }, [user, token, handleEvent]);

  const clearEvents = () => setEvents([]);

  return (
    <NotificationsContext.Provider value={{ events, connected, clearEvents }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) return { events: [], connected: false, clearEvents: () => {} };
  return ctx;
}
