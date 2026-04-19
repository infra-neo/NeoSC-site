import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles, Mail, Users, CheckCircle2, ArrowRight, Loader2,
  Send, ShieldCheck, Server, Network, Rocket, Eye, Trash2, RefreshCw,
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function WelcomePage() {
  const { user, getAuthHeader } = useAuth();
  const navigate = useNavigate();
  const headers = getAuthHeader();
  const [step, setStep] = useState(1); // 1 = welcome, 2 = invite
  const [emailsText, setEmailsText] = useState('');
  const [welcomeMsg, setWelcomeMsg] = useState('');
  const [role, setRole] = useState('user');
  const [sending, setSending] = useState(false);
  const [invited, setInvited] = useState([]);
  const [recentEmails, setRecentEmails] = useState([]);
  const [previewEmail, setPreviewEmail] = useState(null);

  const loadInvited = async () => {
    try {
      const [invRes, emailsRes] = await Promise.all([
        axios.get(`${API}/tenants/invited-users`, { headers }).catch(() => ({ data: { users: [] } })),
        axios.get(`${API}/admin/emails`, { headers }).catch(() => ({ data: { emails: [] } })),
      ]);
      setInvited(invRes.data.users || []);
      setRecentEmails(emailsRes.data.emails || []);
    } catch { /* */ }
  };

  useEffect(() => { loadInvited(); }, []);

  const parseEmails = (text) => {
    return Array.from(new Set(
      text.split(/[\s,;\n]+/).map(s => s.trim().toLowerCase()).filter(Boolean)
    ));
  };

  const emails = parseEmails(emailsText);
  const validCount = emails.filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)).length;

  const sendInvites = async () => {
    if (validCount === 0) { toast.error('Agrega al menos un email válido'); return; }
    setSending(true);
    try {
      const res = await axios.post(
        `${API}/tenants/invite-users`,
        { emails, role, welcome_message: welcomeMsg },
        { headers }
      );
      const invited = res.data.results.filter(r => r.status === 'invited').length;
      const exists = res.data.results.filter(r => r.status === 'already_exists').length;
      const invalid = res.data.results.filter(r => r.status === 'invalid').length;
      toast.success(`Invitaciones enviadas: ${invited}`, {
        description: `${exists} ya existían · ${invalid} inválidos`,
      });
      setEmailsText('');
      setWelcomeMsg('');
      loadInvited();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error enviando invitaciones');
    }
    setSending(false);
  };

  const loadPreview = async (emailId) => {
    try {
      const res = await axios.get(`${API}/admin/emails/${emailId}`, { headers });
      setPreviewEmail(res.data);
    } catch { toast.error('No se pudo cargar el email'); }
  };

  const stepperItems = [
    { id: 1, label: 'Bienvenida', icon: Sparkles },
    { id: 2, label: 'Invita a tu equipo', icon: Mail },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="lg:ml-56 p-6">
        <div className="max-w-4xl mx-auto space-y-6">

          {/* Stepper */}
          <div className="flex items-center gap-2">
            {stepperItems.map((s, i) => {
              const Icon = s.icon;
              const active = step === s.id;
              const done = step > s.id;
              return (
                <div key={s.id} className="flex items-center gap-2">
                  <button
                    onClick={() => setStep(s.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
                      active ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-400'
                      : done ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : 'bg-muted/20 border-border text-muted-foreground'
                    }`}
                    data-testid={`welcome-step-${s.id}`}
                  >
                    {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                    {s.label}
                  </button>
                  {i < stepperItems.length - 1 && <div className="w-5 h-px bg-border" />}
                </div>
              );
            })}
          </div>

          {/* Step 1 — Welcome */}
          {step === 1 && (
            <div className="space-y-5" data-testid="welcome-step-1-content">
              <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/5 via-purple-500/5 to-transparent p-8">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center font-black text-white text-xl">N</div>
                  <div>
                    <h1 className="text-2xl font-black tracking-tight">Bienvenido a NeoSC</h1>
                    <p className="text-xs text-muted-foreground">Zero-Trust HTML5 Workspaces para <span className="text-cyan-400">{user?.organization || 'tu organización'}</span></p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
                  Ya tienes un tenant Zitadel provisionado automáticamente. En el próximo paso invitas a tu equipo —
                  tus usuarios acceden por navegador con SSO, sin VPN, sin cliente, sobre tu TSplus actual o VMs nuevas.
                </p>
                <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { icon: ShieldCheck, label: 'NeoGuard', desc: 'SSO + MFA', color: 'text-cyan-400' },
                    { icon: Network, label: 'NeoMesh', desc: 'Zero Trust VPN', color: 'text-purple-400' },
                    { icon: Server, label: 'NeoVDI', desc: 'HTML5 Desktop', color: 'text-amber-400' },
                    { icon: Rocket, label: 'NeoConnect', desc: 'Bridge TSplus', color: 'text-emerald-400' },
                  ].map(p => (
                    <div key={p.label} className="rounded-xl border border-border bg-card p-3 text-center">
                      <p.icon className={`w-5 h-5 mx-auto mb-1.5 ${p.color}`} />
                      <div className="text-xs font-bold">{p.label}</div>
                      <div className="text-[10px] text-muted-foreground">{p.desc}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-6 flex gap-3">
                  <Button
                    onClick={() => setStep(2)}
                    className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold gap-2"
                    data-testid="welcome-continue-btn"
                  >
                    Invitar a mi equipo <ArrowRight className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => navigate('/admin/neovdi')}
                    className="gap-2"
                  >
                    <Server className="w-4 h-4" /> Configurar workspaces
                  </Button>
                </div>
              </div>

              {/* Enrollment info */}
              <div className="rounded-xl border border-border bg-card p-5 space-y-2">
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Enrolamiento completo
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                  <div className="flex justify-between px-3 py-2 rounded-lg bg-muted/20">
                    <span className="text-muted-foreground">Organización</span>
                    <span className="font-mono text-cyan-400">{user?.organization || '—'}</span>
                  </div>
                  <div className="flex justify-between px-3 py-2 rounded-lg bg-muted/20">
                    <span className="text-muted-foreground">Admin</span>
                    <span className="font-mono text-cyan-400">{user?.email || '—'}</span>
                  </div>
                  <div className="flex justify-between px-3 py-2 rounded-lg bg-muted/20">
                    <span className="text-muted-foreground">Zitadel Tenant</span>
                    <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[9px]">PROVISIONADO</Badge>
                  </div>
                  <div className="flex justify-between px-3 py-2 rounded-lg bg-muted/20">
                    <span className="text-muted-foreground">Role</span>
                    <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-[9px] uppercase">{user?.role || 'user'}</Badge>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2 — Invite Users */}
          {step === 2 && (
            <div className="space-y-5" data-testid="welcome-step-2-content">
              <div className="rounded-2xl border border-border bg-card p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                    <Mail className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">Invita a tu equipo</h2>
                    <p className="text-xs text-muted-foreground">Cada invitado recibe un email con un link mágico para unirse a NeoSC.</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <Label className="text-[11px]">Emails (separados por coma, espacio o línea)</Label>
                    <Textarea
                      value={emailsText}
                      onChange={e => setEmailsText(e.target.value)}
                      placeholder="alice@empresa.com, bob@empresa.com&#10;carol@empresa.com"
                      rows={4}
                      className="text-xs font-mono"
                      data-testid="invite-emails-input"
                    />
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-muted-foreground">
                        {emails.length} detectados · {validCount} válidos
                      </span>
                      {emails.length > 0 && (
                        <div className="flex flex-wrap gap-1 justify-end max-w-sm">
                          {emails.slice(0, 6).map(e => (
                            <Badge
                              key={e}
                              className={`text-[9px] ${/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : 'bg-red-500/10 text-red-400 border-red-500/30'}`}
                            >
                              {e}
                            </Badge>
                          ))}
                          {emails.length > 6 && (
                            <Badge className="bg-muted text-muted-foreground text-[9px]">+{emails.length - 6}</Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-[11px]">Rol asignado</Label>
                      <select
                        value={role}
                        onChange={e => setRole(e.target.value)}
                        className="w-full h-9 rounded-md border border-border bg-background px-2 text-xs"
                        data-testid="invite-role-select"
                      >
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                        <option value="viewer">viewer</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <Label className="text-[11px]">Mensaje personalizado (opcional)</Label>
                    <Input
                      value={welcomeMsg}
                      onChange={e => setWelcomeMsg(e.target.value)}
                      placeholder="Hola, te comparto el acceso al nuevo portal de escritorios..."
                      className="h-9 text-xs"
                      data-testid="invite-welcome-message"
                    />
                  </div>

                  <Button
                    onClick={sendInvites}
                    disabled={sending || validCount === 0}
                    className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold gap-2 w-full"
                    data-testid="send-invites-btn"
                  >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Enviar {validCount > 0 ? `${validCount} ` : ''}invitacion{validCount === 1 ? '' : 'es'}
                  </Button>
                </div>
              </div>

              {/* Recent invites */}
              <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm flex items-center gap-2">
                    <Users className="w-4 h-4 text-purple-400" /> Invitaciones enviadas
                    <Badge variant="secondary" className="text-[9px] h-4 px-1">{invited.length}</Badge>
                  </h3>
                  <Button size="sm" variant="outline" onClick={loadInvited} className="h-7 gap-1">
                    <RefreshCw className="w-3 h-3" />
                  </Button>
                </div>
                {invited.length === 0 ? (
                  <p className="text-center py-6 text-muted-foreground text-xs">Aún no has invitado a nadie</p>
                ) : (
                  <div className="space-y-1.5">
                    {invited.slice(0, 20).map(u => {
                      const matchedEmail = recentEmails.find(e => e.to === u.email && e.category === 'user_invite');
                      return (
                        <div key={u.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/20 text-xs" data-testid={`invited-${u.id}`}>
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center text-[10px] font-bold">
                            {(u.email || '?')[0].toUpperCase()}
                          </div>
                          <span className="font-mono text-xs flex-1 truncate">{u.email}</span>
                          <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-[9px] uppercase">{u.role}</Badge>
                          <Badge
                            className={`text-[9px] ${u.invite_status === 'accepted'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/30'}`}
                          >
                            {u.invite_status || 'pending'}
                          </Badge>
                          {matchedEmail && (
                            <button
                              onClick={() => loadPreview(matchedEmail.id)}
                              className="p-1 rounded hover:bg-muted"
                              title="Ver email"
                              data-testid={`preview-email-${u.id}`}
                            >
                              <Eye className="w-3 h-3 text-muted-foreground hover:text-cyan-400" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <Button
                variant="ghost"
                onClick={() => setStep(1)}
                className="text-xs"
              >
                ← Volver
              </Button>
            </div>
          )}

          {/* Email preview modal */}
          {previewEmail && (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setPreviewEmail(null)}>
              <div className="bg-card border border-border rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()} data-testid="email-preview-modal">
                <div className="flex items-center justify-between p-4 border-b border-border">
                  <div>
                    <h3 className="font-bold text-sm">{previewEmail.subject}</h3>
                    <p className="text-[10px] text-muted-foreground">Para: {previewEmail.to} · {previewEmail.category}</p>
                  </div>
                  <button onClick={() => setPreviewEmail(null)} className="text-muted-foreground hover:text-foreground p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto bg-white">
                  <iframe
                    srcDoc={previewEmail.body_html}
                    className="w-full min-h-[500px] border-0"
                    title="Email preview"
                    sandbox=""
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
