import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import axios from 'axios';
import { LogOut, Lock, Power, Loader2 } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/**
 * SessionToolbar — TSplus Remote Action Engine UI
 * Actions: logoff (close Windows session), lock (Win+L), disconnect (keep alive)
 * Never exposes passwords. Calls /api/sessions/{id}/action.
 */
export default function SessionToolbar({ sessionId, workspaceName, autologon, authHeader, onTerminated }) {
  const [busy, setBusy] = useState(null);

  const runAction = async (action, confirmMsg) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(action);
    try {
      const res = await axios.post(
        `${API}/sessions/${sessionId}/action`,
        { action },
        { headers: authHeader }
      );
      if (res.data.success) {
        toast.success(
          action === 'logoff' ? 'Sesión cerrada' :
          action === 'lock' ? 'Pantalla bloqueada' : 'Desconectado'
        );
        if (action === 'logoff' || action === 'disconnect') {
          onTerminated?.(action);
        }
      } else {
        toast.warning(res.data.message || 'Acción enviada');
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || `Error ejecutando ${action}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex items-center gap-1.5" data-testid="session-toolbar">
      {autologon && (
        <span
          className="px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-semibold tracking-wide"
          title="Credenciales inyectadas sin exponer el password al frontend."
          data-testid="autologon-badge"
        >
          AUTOLOGON
        </span>
      )}
      <Button
        size="sm"
        variant="ghost"
        disabled={busy !== null}
        onClick={() => runAction('lock')}
        className="h-7 gap-1 text-amber-300 hover:text-amber-200 hover:bg-amber-500/10 px-2"
        data-testid="session-lock-btn"
        title="Bloquear pantalla (Win+L)"
      >
        {busy === 'lock' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
        <span className="text-[11px] hidden md:inline">Bloquear</span>
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={busy !== null}
        onClick={() => runAction('disconnect', '¿Desconectar esta sesión? La sesión permanece viva y puedes reconectar luego.')}
        className="h-7 gap-1 text-cyan-300 hover:text-cyan-200 hover:bg-cyan-500/10 px-2"
        data-testid="session-disconnect-btn"
        title="Desconectar (mantener sesión activa)"
      >
        {busy === 'disconnect' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
        <span className="text-[11px] hidden md:inline">Desconectar</span>
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={busy !== null}
        onClick={() => runAction('logoff', `¿Cerrar la sesión "${workspaceName}"? Esto cerrará todos los programas abiertos.`)}
        className="h-7 gap-1 text-red-400 hover:text-red-300 hover:bg-red-500/10 px-2"
        data-testid="session-logoff-btn"
        title="Cerrar sesión completamente"
      >
        {busy === 'logoff' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
        <span className="text-[11px] hidden md:inline">Cerrar sesión</span>
      </Button>
    </div>
  );
}
