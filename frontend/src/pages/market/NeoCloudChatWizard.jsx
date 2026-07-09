import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import axios from 'axios';
import {
  Sparkles, Send, Loader2, ArrowLeft, ArrowRight, CheckCircle2,
  Cpu, MemoryStick, HardDrive, Users, Monitor, Building2, Crown,
  Bot, User as UserIcon, Zap, MessageSquare, RotateCcw
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const PLAN_BADGES = {
  starter:    { color: 'amber',   gradient: 'from-amber-500 to-orange-600',  label: 'STARTER', price: 79 },
  business:   { color: 'cyan',    gradient: 'from-cyan-500 to-blue-600',     label: 'BUSINESS', price: 189 },
  enterprise: { color: 'purple',  gradient: 'from-purple-500 to-pink-600',   label: 'ENTERPRISE', price: 499 },
};

const VM_SIZE_LABELS = {
  xs: '2 vCPU · 4 GB · 50 GB',
  s:  '4 vCPU · 8 GB · 50 GB',
  m:  '8 vCPU · 16 GB · 100 GB',
  l:  '16 vCPU · 32 GB · 100 GB',
};

const OS_LABELS = {
  'win-server-2025': 'Windows Server 2025',
  'win-server-2022': 'Windows Server 2022',
  'win-11': 'Windows 11 Pro VDI',
  'win-10': 'Windows 10 LTSC',
};

export default function NeoCloudChatWizard() {
  const navigate = useNavigate();
  const { user, getAuthHeader, isAuthenticated } = useAuth();
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: '¡Hola! 👋 Soy tu asistente NeoSC. Estoy aquí para ayudarte a configurar tu workspace virtual Windows con TSplus en pocos minutos.\n\nCuéntame, ¿para qué necesitas el escritorio remoto? Por ejemplo: cuántas personas lo usarán, qué tipo de trabajo hacen, etc.',
    },
  ]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [state, setState] = useState({});
  const [quickReplies, setQuickReplies] = useState([
    '6-10 personas en contabilidad',
    '3 desarrolladores',
    'Equipo de ventas de 15',
    'No estoy seguro, necesito una recomendación',
  ]);
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const send = async (text) => {
    const userMsg = text ?? input.trim();
    if (!userMsg || sending) return;
    setInput('');
    setMessages(m => [...m, { role: 'user', content: userMsg }]);
    setSending(true);
    setQuickReplies([]);
    try {
      const res = await axios.post(`${API}/wizard/chat`, {
        message: userMsg,
        session_id: sessionId,
        context: isAuthenticated ? { email: user?.email, name: user?.name, org: user?.organization } : null,
      });
      setSessionId(res.data.session_id);
      setMessages(m => [...m, { role: 'assistant', content: res.data.message }]);
      setState(res.data.state || {});
      setQuickReplies(res.data.quick_replies || []);
    } catch (err) {
      toast.error('Error en la conversación');
      setMessages(m => [...m, { role: 'assistant', content: '⚠️ Hubo un problema. Intenta de nuevo.' }]);
    }
    setSending(false);
  };

  const handleSubmit = async () => {
    if (!isAuthenticated) {
      toast.error('Inicia sesión para confirmar la compra');
      navigate('/login');
      return;
    }
    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/wizard/submit`,
        { session_id: sessionId, state },
        { headers: getAuthHeader() }
      );
      toast.success(`Orden creada: ${res.data.vm_name}`);
      navigate(`/market/progress?order_id=${res.data.order_id}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al crear la orden');
    }
    setSubmitting(false);
  };

  const reset = async () => {
    if (sessionId) {
      try { await axios.delete(`${API}/wizard/chat/${sessionId}`); } catch { /* ignore */ }
    }
    setMessages([{
      role: 'assistant',
      content: '¡Hola de nuevo! 👋 Cuéntame, ¿qué tipo de workspace necesitas hoy?',
    }]);
    setSessionId(null);
    setState({});
    setQuickReplies(['Necesito 3 usuarios', '10 personas en mi equipo', 'No estoy seguro']);
  };

  // ─── Build summary card from state ──────────────────────────────────────
  const planBadge = PLAN_BADGES[state.plan_tier] || PLAN_BADGES.business;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-foreground flex flex-col">
      {/* Header */}
      <header className="border-b border-white/5 bg-slate-950/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <button onClick={() => navigate('/market')} className="flex items-center gap-3 hover:opacity-80" data-testid="back-market">
            <ArrowLeft className="w-4 h-4 text-slate-400" />
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 via-purple-500 to-pink-500 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div className="leading-tight">
              <div className="font-bold text-sm">Neo<span className="text-cyan-400">Cloud</span> Chat Wizard</div>
              <div className="text-[10px] text-slate-400">Powered by Claude Sonnet 4.5</div>
            </div>
          </button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={reset} className="text-slate-400 hover:text-white" data-testid="reset-chat">
              <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reiniciar
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/market/neocloud')} data-testid="switch-classic">
              <MessageSquare className="w-3.5 h-3.5 mr-1" /> Wizard clásico
            </Button>
          </div>
        </div>
      </header>

      {/* Main split layout */}
      <div className="flex-1 max-w-7xl mx-auto px-4 py-6 grid lg:grid-cols-[1fr_360px] gap-6 w-full">
        {/* ─── Chat column ─────────────────────────────────────────────── */}
        <div className="flex flex-col bg-slate-900/40 rounded-2xl border border-white/5 overflow-hidden min-h-[70vh]">
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 space-y-5" data-testid="chat-messages">
            {messages.map((m, i) => (
              <Message key={i} role={m.role} content={m.content} userName={user?.name} />
            ))}
            {sending && (
              <div className="flex gap-3 items-start">
                <Avatar role="assistant" />
                <div className="bg-slate-800/60 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2 text-xs text-slate-400">
                  <Loader2 className="w-3 h-3 animate-spin text-cyan-400" /> Pensando...
                </div>
              </div>
            )}
          </div>

          {/* Quick replies */}
          {quickReplies?.length > 0 && !sending && (
            <div className="px-6 pb-3 flex flex-wrap gap-2" data-testid="quick-replies">
              {quickReplies.map((q, i) => (
                <button
                  key={i}
                  onClick={() => send(q)}
                  className="text-xs px-3 py-1.5 rounded-full bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 transition-all"
                  data-testid={`quick-reply-${i}`}
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Composer */}
          <div className="border-t border-white/5 p-4 flex items-center gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
              placeholder="Cuéntame qué necesitas..."
              disabled={sending || state.ready_to_submit}
              className="bg-slate-800/40 border-white/10 text-sm"
              data-testid="chat-input"
            />
            <Button
              onClick={() => send()}
              disabled={!input.trim() || sending}
              className="bg-gradient-to-r from-cyan-500 to-purple-500 hover:opacity-90 text-white gap-1"
              data-testid="chat-send"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* ─── State sidebar ───────────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Plan card */}
          <div className={`rounded-2xl overflow-hidden border ${state.plan_tier ? `border-${planBadge.color}-500/40` : 'border-white/5'}`}>
            <div className={`bg-gradient-to-br ${state.plan_tier ? planBadge.gradient : 'from-slate-800 to-slate-900'} p-5`}>
              <div className="flex items-center justify-between mb-2">
                <Crown className="w-6 h-6 text-white" />
                {state.plan_tier && <Badge className="bg-white/20 text-white border-0 text-[10px] font-bold">{planBadge.label}</Badge>}
              </div>
              <div className="text-2xl font-black text-white">
                {state.plan_tier ? `$${planBadge.price}/mes` : 'Plan pendiente'}
              </div>
              <div className="text-xs text-white/70 mt-1">TSplus Remote Enterprise Access · 14 días gratis</div>
            </div>
            <div className="bg-slate-900/60 p-4 space-y-2.5">
              <StateItem icon={Building2} label="Empresa" value={state.company_name} color="text-cyan-400" />
              <StateItem icon={Users} label="Usuarios TSplus" value={state.tsplus_users === 9999 ? 'Ilimitada' : state.tsplus_users} color="text-purple-400" />
              <StateItem icon={Cpu} label="Tamaño VM" value={VM_SIZE_LABELS[state.vm_size]} color="text-amber-400" />
              <StateItem icon={Monitor} label="Sistema" value={OS_LABELS[state.os_id]} color="text-emerald-400" />
              {!isAuthenticated && (
                <StateItem icon={UserIcon} label="Email admin" value={state.admin_email} color="text-pink-400" />
              )}
            </div>
          </div>

          {/* Submit button */}
          {state.ready_to_submit && (
            <div className="rounded-2xl border-2 border-emerald-500/40 bg-emerald-500/5 p-4 space-y-3">
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold">
                <CheckCircle2 className="w-4 h-4" /> ¡Listo para crear!
              </div>
              <p className="text-xs text-slate-300">
                Todos los datos están completos. Al confirmar, se simulará el pago y comenzará el aprovisionamiento real en OpenNebula.
              </p>
              <Button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-bold gap-2 py-5"
                data-testid="submit-order"
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Procesando...</>
                ) : (
                  <><Zap className="w-4 h-4" /> Confirmar y aprovisionar <ArrowRight className="w-4 h-4" /></>
                )}
              </Button>
            </div>
          )}

          {/* Info card */}
          <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-4 text-xs text-slate-400 space-y-2">
            <div className="flex items-center gap-2 text-slate-300 font-semibold">
              <Bot className="w-3.5 h-3.5 text-cyan-400" /> Cómo funciona
            </div>
            <p>Conversa naturalmente con tu asistente. Te hará algunas preguntas y te recomendará la mejor combinación de licencias TSplus y tamaño de VM según tu equipo.</p>
            <p>Al final, podrás confirmar la orden y se aprovisionará automáticamente en OpenNebula con NetBird para acceso seguro.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Avatar({ role }) {
  if (role === 'assistant') {
    return (
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 via-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-purple-500/30">
        <Bot className="w-4 h-4 text-white" />
      </div>
    );
  }
  return (
    <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
      <UserIcon className="w-4 h-4 text-slate-300" />
    </div>
  );
}

function Message({ role, content, userName }) {
  const isUser = role === 'user';
  return (
    <div className={`flex gap-3 items-start ${isUser ? 'flex-row-reverse' : ''}`}>
      <Avatar role={role} />
      <div className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
        isUser
          ? 'bg-cyan-500/15 border border-cyan-500/30 text-foreground rounded-tr-sm'
          : 'bg-slate-800/60 border border-white/5 text-foreground rounded-tl-sm'
      }`}>
        {!isUser && <div className="text-[10px] text-cyan-400 font-bold mb-1 uppercase tracking-wider">NeoSC Assistant</div>}
        {isUser && userName && <div className="text-[10px] text-cyan-400 font-bold mb-1 text-right">{userName}</div>}
        <div className="prose-sm" dangerouslySetInnerHTML={{ __html: renderMd(content) }} />
      </div>
    </div>
  );
}

function StateItem({ icon: Icon, label, value, color }) {
  const filled = value !== null && value !== undefined && value !== '';
  return (
    <div className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg ${filled ? 'bg-white/5' : ''}`}>
      <Icon className={`w-3.5 h-3.5 ${filled ? color : 'text-slate-600'}`} />
      <div className="flex-1 min-w-0">
        <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
        <div className={`text-xs font-medium truncate ${filled ? 'text-foreground' : 'text-slate-600 italic'}`}>
          {filled ? value : 'pendiente'}
        </div>
      </div>
      {filled && <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />}
    </div>
  );
}

// Minimal safe markdown: bold and inline-code only
function renderMd(text) {
  if (!text) return '';
  const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escape(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-cyan-300">$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="bg-white/10 text-cyan-300 px-1 py-0.5 rounded text-[11px]">$1</code>')
    .replace(/\n/g, '<br/>');
}
