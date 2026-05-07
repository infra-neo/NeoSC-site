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
  const [myOrg, setMyOrg] = useState(null);

  const loadInvited = async () => {
    try {
      const [invRes, emailsRes, orgRes] = await Promise.all([
        axios.get(`${API}/tenants/invited-users`, { headers }).catch(() => ({ data: { users: [] } })),
        axios.get(`${API}/admin/emails`, { headers }).catch(() => ({ data: { emails: [] } })),
        axios.get(`${API}/zitadel/my-org`, { headers }).catch(() => ({ data: null })),
      ]);
      setInvited(invRes.data.users || []);
      setRecentEmails(emailsRes.data.emails || []);
      setMyOrg(orgRes.data);
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
      const delivery = res.data.delivery_mode || 'mock';
      toast.success(`${invited} invitación(es) enviadas vía ${delivery === 'neoguard' ? 'NeoGuard (email nativo)' : 'mock email'}`, {
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
    { id: 3, label: 'Quick Start', icon: Rocket },
  ];

  // Tasks for the Quick Start checklist
  const tasks = [
    {
      id: 'provision-tenant',
      group: 'Onboarding',
      title: 'Tenant provisionado',
      desc: 'Org + Project + App OIDC creados automáticamente en NeoGuard',
      done: !!(myOrg?.org_name && myOrg?.status === 'connected'),
      action: null,
    },
    {
      id: 'invite-users',
      group: 'Onboarding',
      title: 'Invita a tu equipo',
      desc: `${invited.length} invitación(es) enviada(s)`,
      done: invited.length > 0,
      action: () => setStep(2),
      actionLabel: 'Invitar',
    },
    {
      id: 'configure-gateway',
      group: 'NeoMesh Gateway',
      title: 'Configurar Gateway NeoMesh',
      desc: 'Despliega el agente NeoMesh para acceso just-in-time sin VPN',
      done: false,
      sub: '0/2 tareas',
      action: () => navigate('/admin/enroll-tenant'),
      actionLabel: 'How-to',
    },
    {
      id: 'configure-neovdi',
      group: 'NeoVDI Workspaces',
      title: 'Vincular conexiones NeoVDI',
      desc: 'Asocia workspaces a conexiones HTML5 (RDP/VNC/SSH)',
      done: false,
      sub: '0/4 tareas',
      action: () => navigate('/admin/neovdi'),
      actionLabel: 'Configurar',
    },
    {
      id: 'configure-access',
      group: 'NeoVDI Workspaces',
      title: 'Configurar accesos por grupo',
      desc: 'Recurso → Grupo NeoGuard → Usuarios con protocolos permitidos',
      done: false,
      sub: '0/3 tareas',
      action: () => navigate('/admin/neovdi?tab=access'),
      actionLabel: 'Acceso',
    },
    {
      id: 'first-workspace',
      group: 'NeoCloud',
      title: 'Crear tu primer workspace',
      desc: 'Lanza una VM Windows o Container Linux desde NeoCloud',
      done: false,
      sub: '0/3 tareas',
      action: () => navigate('/admin/lxd'),
      actionLabel: 'Crear',
    },
    {
      id: 'view-claims',
      group: 'Observabilidad',
      title: 'Visualizar claims map',
      desc: 'Validar mapeo NeoGuard → NeoMesh → NeoVDI → NeoCloud',
      done: false,
      action: () => navigate('/admin/claims-map'),
      actionLabel: 'Ver mapa',
    },
  ];

  const groupedTasks = tasks.reduce((acc, t) => {
    (acc[t.group] = acc[t.group] || []).push(t);
    return acc;
  }, {});

  const totalDone = tasks.filter(t => t.done).length;
  const overallPct = Math.round((totalDone / tasks.length) * 100);

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
                  Ya tienes un tenant NeoGuard (SSO) provisionado automáticamente. En el próximo paso invitas a tu equipo —
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
                    onClick={() => setStep(3)}
                    className="gap-2"
                    data-testid="welcome-quickstart-btn"
                  >
                    <Rocket className="w-4 h-4" /> Quick Start
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

              {/* Enrollment info — REAL NeoGuard data */}
              <div className="rounded-xl border border-border bg-card p-5 space-y-3" data-testid="enrollment-info">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Enrolamiento completo
                  </h3>
                  {myOrg && (
                    <Badge className={`text-[9px] ${
                      myOrg.status === 'connected' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : myOrg.status === 'not_configured' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      : 'bg-red-500/10 text-red-400 border-red-500/30'
                    }`}>
                      NeoGuard {myOrg.status === 'connected' ? 'conectado' : myOrg.status}
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                  <div className="flex justify-between px-3 py-2 rounded-lg bg-muted/20" data-testid="info-org-name">
                    <span className="text-muted-foreground">Organización</span>
                    <span className="font-mono text-cyan-400 truncate ml-2">{myOrg?.org_name || user?.organization || '—'}</span>
                  </div>
                  <div className="flex justify-between px-3 py-2 rounded-lg bg-muted/20" data-testid="info-admin-email">
                    <span className="text-muted-foreground">Admin</span>
                    <span className="font-mono text-cyan-400 truncate ml-2">{user?.email || '—'}</span>
                  </div>
                  <div className="flex justify-between px-3 py-2 rounded-lg bg-muted/20" data-testid="info-org-id">
                    <span className="text-muted-foreground">Org ID</span>
                    <span className="font-mono text-[10px] text-cyan-400 truncate ml-2">{myOrg?.org_id || '—'}</span>
                  </div>
                  <div className="flex justify-between px-3 py-2 rounded-lg bg-muted/20" data-testid="info-project-id">
                    <span className="text-muted-foreground">Project ID</span>
                    <span className="font-mono text-[10px] text-cyan-400 truncate ml-2">{myOrg?.project_id || '—'}</span>
                  </div>
                  <div className="flex justify-between px-3 py-2 rounded-lg bg-muted/20" data-testid="info-app-client">
                    <span className="text-muted-foreground">App Client ID</span>
                    <span className="font-mono text-[10px] text-cyan-400 truncate ml-2">{myOrg?.app_client_id || '—'}</span>
                  </div>
                  <div className="flex justify-between px-3 py-2 rounded-lg bg-muted/20" data-testid="info-neovdi-client">
                    <span className="text-muted-foreground">NeoVDI Client ID</span>
                    <span className="font-mono text-[10px] text-cyan-400 truncate ml-2">{myOrg?.neovdi_client_id || '—'}</span>
                  </div>
                  <div className="flex justify-between px-3 py-2 rounded-lg bg-muted/20" data-testid="info-primary-domain">
                    <span className="text-muted-foreground">Dominio principal</span>
                    <span className="font-mono text-cyan-400 truncate ml-2">{myOrg?.primary_domain || myOrg?.domain || '—'}</span>
                  </div>
                  <div className="flex justify-between px-3 py-2 rounded-lg bg-muted/20" data-testid="info-user-count">
                    <span className="text-muted-foreground">Usuarios en NeoGuard</span>
                    <span className="font-mono text-cyan-400">{myOrg?.user_count ?? '—'}</span>
                  </div>
                </div>

                {myOrg?.roles?.length > 0 && (
                  <div className="pt-2 border-t border-border">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Roles del proyecto</div>
                    <div className="flex flex-wrap gap-1">
                      {myOrg.roles.map(r => (
                        <Badge key={r.key} className="bg-purple-500/10 text-purple-400 border-purple-500/30 text-[9px]">
                          {r.display_name || r.key}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t border-border flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate('/admin/zitadel')}
                    className="h-7 gap-1 text-xs"
                    data-testid="goto-zitadel-btn"
                  >
                    <ShieldCheck className="w-3 h-3" /> Gestionar NeoGuard SSO
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate('/admin/neovdi?tab=access')}
                    className="h-7 gap-1 text-xs"
                    data-testid="goto-access-btn"
                  >
                    <Server className="w-3 h-3" /> Configurar accesos (Recurso → Grupo → Usuario)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate('/admin/claims-map')}
                    className="h-7 gap-1 text-xs"
                    data-testid="goto-claims-btn"
                  >
                    <Network className="w-3 h-3" /> Ver claims map
                  </Button>
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
                    <p className="text-xs text-muted-foreground">Cada invitado recibe un email de <b>NeoGuard</b> con link para verificar email, setear password y acceder automáticamente.</p>
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
                        {(myOrg?.roles?.length ? myOrg.roles : [{key:'user',display_name:'user'},{key:'admin',display_name:'admin'},{key:'viewer',display_name:'viewer'}]).map(r => (
                          <option key={r.key} value={r.key}>{r.display_name || r.key}</option>
                        ))}
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
                      const isNeoGuard = u.sso_provider === 'neoguard' || u.delivery === 'neoguard';
                      return (
                        <div key={u.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/20 text-xs" data-testid={`invited-${u.id}`}>
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center text-[10px] font-bold">
                            {(u.email || '?')[0].toUpperCase()}
                          </div>
                          <span className="font-mono text-xs flex-1 truncate">{u.email}</span>
                          <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-[9px] uppercase">{u.role}</Badge>
                          {isNeoGuard && (
                            <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/30 text-[9px]" title="Usuario creado en NeoGuard con email nativo de verificación">
                              NeoGuard
                            </Badge>
                          )}
                          <Badge
                            className={`text-[9px] ${u.invite_status === 'accepted'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/30'}`}
                          >
                            {u.invite_status || 'pending'}
                          </Badge>
                          {matchedEmail && !isNeoGuard && (
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

          {/* Step 3 — Quick Start Checklist (inspired by Devolutions Quick Start) */}
          {step === 3 && (
            <div className="space-y-5" data-testid="welcome-step-3-content">
              <div className="rounded-2xl border border-border bg-card p-6">
                <div className="flex items-start gap-4 mb-5">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center">
                    <Rocket className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-xl font-black tracking-tight">Quick Start</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Lista de tareas para configurar NeoSC end-to-end. Marca tareas completas, abre guías "How-to", o ignora con "No haré esto".
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-black text-cyan-400" data-testid="quickstart-progress">{overallPct}%</div>
                    <div className="text-[10px] text-muted-foreground">{totalDone}/{tasks.length}</div>
                  </div>
                </div>

                {/* Overall progress */}
                <div className="w-full h-1.5 bg-muted/40 rounded-full overflow-hidden mb-6">
                  <div className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all duration-500" style={{ width: `${overallPct}%` }} />
                </div>

                {/* Grouped tasks */}
                <div className="space-y-5">
                  {Object.entries(groupedTasks).map(([group, gTasks]) => {
                    const gDone = gTasks.filter(t => t.done).length;
                    return (
                      <div key={group} data-testid={`quickstart-group-${group.toLowerCase().replace(/\s/g,'-')}`}>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">{group}</h3>
                          <span className="text-[10px] text-muted-foreground">{gDone}/{gTasks.length}</span>
                        </div>
                        <div className="space-y-2">
                          {gTasks.map(t => {
                            const dismissedKey = `neosc:qs-dismissed:${t.id}`;
                            const dismissed = localStorage.getItem(dismissedKey) === '1';
                            if (dismissed && !t.done) return null;
                            return (
                              <div
                                key={t.id}
                                className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                                  t.done
                                    ? 'bg-emerald-500/5 border-emerald-500/20'
                                    : 'bg-muted/20 border-border hover:border-cyan-500/30'
                                }`}
                                data-testid={`quickstart-task-${t.id}`}
                              >
                                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                                  t.done ? 'bg-emerald-500 text-black' : 'border border-border bg-background'
                                }`}>
                                  {t.done && <CheckCircle2 className="w-3.5 h-3.5" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-xs font-bold ${t.done ? 'text-foreground line-through opacity-60' : 'text-foreground'}`}>
                                      {t.title}
                                    </span>
                                    {t.sub && !t.done && (
                                      <Badge variant="secondary" className="text-[9px] h-4 px-1.5">{t.sub}</Badge>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-muted-foreground truncate">{t.desc}</p>
                                </div>
                                {!t.done && (
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    {t.action && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={t.action}
                                        className="h-7 text-[11px] gap-1"
                                        data-testid={`quickstart-action-${t.id}`}
                                      >
                                        {t.actionLabel || 'How-to'} <ArrowRight className="w-3 h-3" />
                                      </Button>
                                    )}
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => { localStorage.setItem(dismissedKey, '1'); window.location.reload(); }}
                                      className="h-7 text-[10px] text-muted-foreground hover:text-amber-400"
                                      title="No haré esta tarea (ocultar)"
                                      data-testid={`quickstart-dismiss-${t.id}`}
                                    >
                                      No haré esto
                                    </Button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-6 pt-4 border-t border-border flex gap-2">
                  <Button variant="ghost" onClick={() => setStep(1)} className="text-xs">← Volver al inicio</Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      tasks.forEach(t => localStorage.removeItem(`neosc:qs-dismissed:${t.id}`));
                      window.location.reload();
                    }}
                    className="text-xs ml-auto"
                    data-testid="quickstart-reset-btn"
                  >
                    Restaurar tareas ocultas
                  </Button>
                </div>
              </div>
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
