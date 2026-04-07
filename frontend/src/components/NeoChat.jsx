import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import axios from 'axios';
import { MessageCircle, X, Send, Trash2, Loader2, Minimize2, Sparkles } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function getSessionId() {
  let sid = sessionStorage.getItem('neo_session_id');
  if (!sid) {
    sid = 'neo-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    sessionStorage.setItem('neo_session_id', sid);
  }
  return sid;
}

export default function NeoChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(getSessionId);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Load history on mount
  useEffect(() => {
    if (open && messages.length === 0) {
      axios.get(`${API}/neo/history/${sessionId}`)
        .then(r => {
          if (r.data.messages?.length > 0) {
            setMessages(r.data.messages);
          }
        })
        .catch(() => {});
    }
  }, [open, sessionId]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Focus input when opened
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [open]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setLoading(true);

    try {
      const res = await axios.post(`${API}/neo/chat`, {
        message: text,
        session_id: sessionId,
      });
      setMessages(prev => [...prev, { role: 'assistant', content: res.data.response }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Ups, tuve un problema al responder. Intenta de nuevo en un momento.'
      }]);
    }
    setLoading(false);
  }, [input, loading, sessionId]);

  const clearHistory = async () => {
    try {
      await axios.delete(`${API}/neo/history/${sessionId}`);
      setMessages([]);
      sessionStorage.removeItem('neo_session_id');
    } catch { /* ignore */ }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Render markdown-lite (bold, links, lists)
  const renderContent = (text) => {
    if (!text) return null;
    return text.split('\n').map((line, i) => {
      // Bold
      let processed = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      // Inline code
      processed = processed.replace(/`(.*?)`/g, '<code class="bg-muted/50 px-1 py-0.5 rounded text-[11px]">$1</code>');
      // List items
      if (processed.startsWith('- ')) {
        processed = '<span class="text-cyan-400 mr-1">•</span>' + processed.slice(2);
      }
      return (
        <span key={i} className="block" dangerouslySetInnerHTML={{ __html: processed }} />
      );
    });
  };

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          data-testid="neo-chat-toggle"
          className="fixed bottom-20 right-5 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-cyan-500 to-cyan-600 text-white shadow-lg shadow-cyan-500/25 flex items-center justify-center hover:scale-110 transition-transform"
        >
          <Sparkles className="w-6 h-6" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-20 right-5 z-50 w-[380px] h-[540px] rounded-2xl border border-border bg-background shadow-2xl shadow-black/40 flex flex-col overflow-hidden" data-testid="neo-chat-panel">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border-b border-border">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">N</span>
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-sm">Neo</h3>
              <p className="text-[10px] text-muted-foreground">Asistente IA NeoSC</p>
            </div>
            <Badge className="bg-green-500/10 text-green-400 border-green-500/30 text-[9px]">online</Badge>
            <button onClick={clearHistory} className="text-muted-foreground hover:text-foreground p-1" title="Limpiar historial" data-testid="neo-clear">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground p-1" data-testid="neo-close">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 terminal-scroll">
            {messages.length === 0 && !loading && (
              <div className="text-center py-8">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center mx-auto mb-3">
                  <Sparkles className="w-6 h-6 text-cyan-400" />
                </div>
                <p className="text-sm font-bold">Hola, soy Neo</p>
                <p className="text-xs text-muted-foreground mt-1">Tu asistente de NeoSC. Pregunta lo que quieras.</p>
                <div className="flex flex-wrap justify-center gap-1.5 mt-4">
                  {['¿Qué es NeoSC?', '¿Qué plan me conviene?', '¿Cómo funciona?'].map((q) => (
                    <button
                      key={q}
                      onClick={() => { setInput(q); setTimeout(sendMessage, 100); }}
                      className="text-[10px] px-2.5 py-1.5 rounded-full border border-border hover:border-cyan-500/50 hover:bg-cyan-500/5 text-muted-foreground hover:text-foreground transition-colors"
                      data-testid={`neo-suggestion-${q.slice(0,10)}`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-cyan-500 text-black rounded-br-sm'
                    : 'bg-muted/40 border border-border rounded-bl-sm'
                }`}>
                  {msg.role === 'assistant' ? renderContent(msg.content) : msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-muted/40 border border-border rounded-xl rounded-bl-sm px-3.5 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" style={{ animationDelay: '0.2s' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" style={{ animationDelay: '0.4s' }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-3 border-t border-border bg-muted/10">
            <div className="flex items-center gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Escribe tu mensaje..."
                rows={1}
                className="flex-1 bg-background border border-border rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-cyan-500/50 placeholder:text-muted-foreground"
                data-testid="neo-input"
              />
              <Button
                size="sm"
                disabled={!input.trim() || loading}
                onClick={sendMessage}
                className="bg-cyan-500 hover:bg-cyan-400 text-black h-9 w-9 p-0 rounded-xl"
                data-testid="neo-send"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-[9px] text-muted-foreground text-center mt-1.5">
              Neo usa Claude Sonnet 4.5 · Respuestas pueden variar
            </p>
          </div>
        </div>
      )}
    </>
  );
}
