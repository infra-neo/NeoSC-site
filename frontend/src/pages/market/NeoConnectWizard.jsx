import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import axios from 'axios';
import {
  ArrowRight, ArrowLeft, CheckCircle2, Loader2, Shield, Lock,
  Wifi, Server, Network, Globe, Monitor, Terminal, Container,
  Download, Copy, Key, Building2, ChevronRight, ExternalLink,
  Search, Plus, Trash2, AlertTriangle
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function NeoConnectWizard() {
  const navigate = useNavigate();
  const { user, getAuthHeader, isAuthenticated } = useAuth();
  const headers = isAuthenticated ? getAuthHeader() : {};

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [tenantId, setTenantId] = useState(null);
  const [enrollResult, setEnrollResult] = useState(null);
  const [neoconnectInfo, setNeoconnectInfo] = useState(null);
  const [connectorTab, setConnectorTab] = useState('agent');

  const [form, setForm] = useState({
    org_name: '', slug: '', rfc: '', email_admin: '',
    access_mode: 'tsplus_html5', // 'tsplus_html5' | 'direct_rdp'
    tsplus_host: '', tsplus_port: 443, tsplus_license: '',
    max_users: 10, has_ldap: false,
  });

  const [windowsHosts, setWindowsHosts] = useState([{ ip: '', name: '', rdp_port: 3389 }]);
  const [dnsConfig, setDnsConfig] = useState({ domain: '', use_own_dns: false, cname_target: '' });
  const [gatewayToken, setGatewayToken] = useState(null);
  const [gatewayTokenLoading, setGatewayTokenLoading] = useState(false);

  const generateGatewayToken = async () => {
    if (!tenantId) return;
    setGatewayTokenLoading(true);
    try {
      const res = await axios.post(`${API}/admin/gateways/generate-token`, { tenant_id: tenantId }, { headers });
      setGatewayToken(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error generando token');
    }
    setGatewayTokenLoading(false);
  };

  const steps = [
    { label: 'Empresa', icon: Building2 },
    { label: 'TSplus', icon: Server },
    { label: 'Conector', icon: Wifi },
    { label: 'Hosts', icon: Search },
    { label: 'Activar', icon: CheckCircle2 },
  ];

  const updateForm = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const addHost = () => setWindowsHosts(prev => [...prev, { ip: '', name: '', rdp_port: 3389 }]);
  const removeHost = (i) => setWindowsHosts(prev => prev.filter((_, idx) => idx !== i));
  const updateHost = (i, k, v) => setWindowsHosts(prev => prev.map((h, idx) => idx === i ? { ...h, [k]: v } : h));

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado');
  };

  // Step 2: Create tenant + auto-provision (Zitadel + NetBird)
  const startProvisioning = async () => {
    if (!isAuthenticated) { toast.error('Inicia sesion primero'); navigate('/login'); return; }
    setLoading(true);
    try {
      // 1. Create tenant
      const enrollRes = await axios.post(`${API}/admin/tenants/enroll`, {
        ...form, tier: 'plus',
      }, { headers });
      const tid = enrollRes.data.id;
      setTenantId(tid);

      // 2. Auto-provision (Zitadel + NetBird)
      const provRes = await axios.post(`${API}/admin/tenants/${tid}/auto-provision`, {}, { headers });
      setEnrollResult(provRes.data);

      // 3. Get NeoConnect info
      const infoRes = await axios.get(`${API}/admin/tenants/${tid}/neoconnect-info`, { headers });
      setNeoconnectInfo(infoRes.data);

      toast.success('Provisioning completado');
      setStep(2);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error en provisioning');
    }
    setLoading(false);
  };

  // Step 4: Register infra + finalize
  const finalizeSetup = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      // Register infrastructure
      await axios.post(`${API}/admin/tenants/${tenantId}/step/register-infra`, {
        access_mode: form.access_mode,
        tsplus_host: form.tsplus_host,
        tsplus_port: form.tsplus_port,
        tsplus_license: form.tsplus_license,
        has_ldap: form.has_ldap,
        windows_hosts: windowsHosts.filter(h => h.ip),
        dns_config: dnsConfig,
      }, { headers });

      // Finalize
      await axios.post(`${API}/admin/tenants/${tenantId}/step/finalize`, {}, { headers });
      toast.success('NeoConnect activado');
      setStep(4);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error finalizando');
    }
    setLoading(false);
  };

  const canNext = () => {
    if (step === 0) return form.org_name && form.email_admin && isAuthenticated;
    if (step === 1) return form.access_mode === 'direct_rdp' || form.tsplus_host;
    return true;
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border bg-card/50">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/market')}>
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">N</span>
            </div>
            <span className="font-semibold">Neo<span className="text-purple-400">Connect</span></span>
          </div>
          <div className="hidden md:flex items-center gap-1">
            {steps.map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={i} className="flex items-center gap-1">
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
                    i === step ? 'bg-purple-500/20 text-purple-400' :
                    i < step ? 'bg-emerald-500/10 text-emerald-400' : 'text-muted-foreground'
                  }`}>
                    {i < step ? <CheckCircle2 className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
                    {s.label}
                  </div>
                  {i < steps.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Step 0: Company Info */}
        {step === 0 && (
          <div className="space-y-6" data-testid="neoconnect-step-0">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold">Datos de tu empresa</h2>
              <p className="text-muted-foreground text-sm mt-1">Estos datos se usan para configurar tu SSO y VPN</p>
            </div>

            {!isAuthenticated && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <div className="flex-1 text-sm">Necesitas una cuenta para continuar</div>
                <Button size="sm" onClick={() => navigate('/login')} className="bg-amber-500 hover:bg-amber-400 text-black gap-1">
                  <Lock className="w-3 h-3" /> Iniciar sesion
                </Button>
              </div>
            )}

            <div className="rounded-xl border border-border bg-card p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Nombre empresa *</Label>
                  <Input value={form.org_name} onChange={e => updateForm('org_name', e.target.value)} placeholder="Mi Empresa SA" data-testid="nc-org-name" />
                </div>
                <div>
                  <Label className="text-xs">Email admin *</Label>
                  <Input type="email" value={form.email_admin} onChange={e => updateForm('email_admin', e.target.value)} placeholder="admin@empresa.com" data-testid="nc-email" />
                </div>
                <div>
                  <Label className="text-xs">RFC</Label>
                  <Input value={form.rfc} onChange={e => updateForm('rfc', e.target.value)} placeholder="XAXX010101000" />
                </div>
                <div>
                  <Label className="text-xs">Usuarios TSplus</Label>
                  <Input type="number" value={form.max_users} onChange={e => updateForm('max_users', parseInt(e.target.value) || 5)} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 1: TSplus Info */}
        {step === 1 && (
          <div className="space-y-6" data-testid="neoconnect-step-1">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold">Como acceden tus usuarios</h2>
              <p className="text-muted-foreground text-sm mt-1">Elige el modo de acceso para tu infraestructura</p>
            </div>

            {/* Access mode toggle */}
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => updateForm('access_mode', 'tsplus_html5')}
                className={`text-left rounded-xl border p-4 transition-all ${
                  form.access_mode === 'tsplus_html5' ? 'border-purple-500 bg-purple-500/10' : 'border-border bg-card hover:border-border/80'
                }`} data-testid="nc-mode-tsplus">
                <div className="flex items-center gap-2 mb-1">
                  <Globe className="w-4 h-4 text-purple-400" />
                  <span className="font-bold text-sm">Con TSplus (HTML5)</span>
                </div>
                <p className="text-xs text-muted-foreground">Acceso clientless desde el navegador. Necesitas un servidor TSplus.</p>
              </button>
              <button onClick={() => updateForm('access_mode', 'direct_rdp')}
                className={`text-left rounded-xl border p-4 transition-all ${
                  form.access_mode === 'direct_rdp' ? 'border-purple-500 bg-purple-500/10' : 'border-border bg-card hover:border-border/80'
                }`} data-testid="nc-mode-rdp">
                <div className="flex items-center gap-2 mb-1">
                  <Monitor className="w-4 h-4 text-purple-400" />
                  <span className="font-bold text-sm">RDP directo (sin TSplus)</span>
                </div>
                <p className="text-xs text-muted-foreground">Tus empleados usan su cliente RDP normal, protegido por el tunel NeoMesh.</p>
              </button>
            </div>

            {form.access_mode === 'tsplus_html5' ? (
              <div className="rounded-xl border border-border bg-card p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs">Host / IP del servidor TSplus *</Label>
                    <Input value={form.tsplus_host} onChange={e => updateForm('tsplus_host', e.target.value)}
                      placeholder="10.100.10.152 o tsplus.empresa.com" data-testid="nc-tsplus-host" />
                  </div>
                  <div>
                    <Label className="text-xs">Puerto HTML5</Label>
                    <Input type="number" value={form.tsplus_port} onChange={e => updateForm('tsplus_port', parseInt(e.target.value) || 443)} />
                  </div>
                  <div>
                    <Label className="text-xs">Licencia TSplus</Label>
                    <Input value={form.tsplus_license} onChange={e => updateForm('tsplus_license', e.target.value)} placeholder="TSP-XXXX-XXXX" />
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-sm pb-2">
                      <input type="checkbox" checked={form.has_ldap} onChange={e => updateForm('has_ldap', e.target.checked)} className="rounded" />
                      Usa Active Directory / LDAP
                    </label>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card p-6 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Sin TSplus, tus empleados abren su cliente RDP normal (Escritorio Remoto de Windows,
                  Microsoft Remote Desktop en Mac) y se conectan directo a la IP interna de cada equipo,
                  tunelizado por NeoMesh. No hay portal web HTML5 en este modo.
                </p>
                <p className="text-xs text-muted-foreground">
                  En el siguiente paso vas a registrar las maquinas Windows a las que quieres dar acceso
                  (paso "Hosts") — esa lista es la que va a determinar exactamente a que pueden conectarse
                  tus usuarios, nada mas.
                </p>
              </div>
            )}

            {/* What happens next */}
            <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-5">
              <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
                <Shield className="w-4 h-4 text-purple-400" /> Al continuar se configurara automaticamente:
              </h3>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-purple-400" /> Proyecto SSO en Zitadel (NeoGuard)</div>
                <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-purple-400" /> 3 roles: Admin, Usuario, Viewer</div>
                <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-purple-400" /> App OIDC para tu dominio</div>
                <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-purple-400" /> Grupo VPN aislado (NeoMesh)</div>
                <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-purple-400" /> Setup Key para conector</div>
                <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-purple-400" />
                  {form.access_mode === 'direct_rdp' ? 'Policy restringida solo a RDP (3389)' : 'Policy de acceso intra-grupo'}
                </div>
              </div>
            </div>

            <Button onClick={startProvisioning} disabled={loading || (form.access_mode === 'tsplus_html5' && !form.tsplus_host)}
              className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-5 gap-2" data-testid="nc-provision">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Provisionar SSO + VPN automaticamente
            </Button>
          </div>
        )}

        {/* Step 2: Install Connector */}
        {step === 2 && neoconnectInfo && (
          <div className="space-y-6" data-testid="neoconnect-step-2">
            <div className="text-center mb-6">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <h2 className="text-2xl font-bold">SSO y VPN configurados</h2>
              <p className="text-muted-foreground text-sm mt-1">Ahora instala el conector en tu red para conectar NeoSC con tu infraestructura</p>
            </div>

            {/* Connector options tabs */}
            <div className="flex gap-1 p-1 rounded-lg bg-muted/30 border border-border">
              {[
                { id: 'agent', label: 'NetBird Agent', icon: Download, desc: 'Instalar en Windows/Linux' },
                { id: 'gateway', label: 'NeoSC Gateway', icon: Key, desc: 'VM Windows existente como Gateway' },
                { id: 'container', label: 'Docker Container', icon: Container, desc: 'Levantar container relay' },
                { id: 'dns', label: 'DNS Redirect', icon: Globe, desc: 'Usar tu dominio propio' },
              ].map(tab => {
                const Icon = tab.icon;
                return (
                  <button key={tab.id} onClick={() => setConnectorTab(tab.id)}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-md text-xs font-medium transition-all ${
                      connectorTab === tab.id ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'text-muted-foreground hover:text-foreground'
                    }`}>
                    <Icon className="w-3.5 h-3.5" />
                    <div className="text-left">
                      <div>{tab.label}</div>
                      <div className="text-[10px] text-muted-foreground font-normal">{tab.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Agent tab */}
            {connectorTab === 'agent' && (
              <div className="rounded-xl border border-border bg-card p-6 space-y-4">
                <h3 className="font-bold text-sm">Opcion A: Instalar NetBird Agent</h3>
                <p className="text-xs text-muted-foreground">
                  Instala el agente en una maquina Windows o Linux dentro de tu red.
                  El agente crea un tunel seguro sin abrir puertos.
                </p>

                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-purple-400">Windows (.exe)</Label>
                    <a href={neoconnectInfo.downloads?.windows?.exe_url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold mt-1">
                      <Download className="w-3 h-3" /> Descargar NetBird.exe <ExternalLink className="w-3 h-3" />
                    </a>
                    <div className="relative mt-2">
                      <pre className="p-3 rounded-lg bg-black/40 text-[11px] text-green-400 font-mono overflow-x-auto">
                        {neoconnectInfo.downloads?.windows?.instructions}
                      </pre>
                      <button onClick={() => copyToClipboard(neoconnectInfo.downloads?.windows?.instructions)}
                        className="absolute top-2 right-2 p-1 rounded bg-white/10 hover:bg-white/20">
                        <Copy className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs text-green-400">Linux (script)</Label>
                    <div className="relative mt-1">
                      <pre className="p-3 rounded-lg bg-black/40 text-[11px] text-green-400 font-mono overflow-x-auto whitespace-pre-wrap">
                        {neoconnectInfo.downloads?.linux?.script}
                      </pre>
                      <button onClick={() => copyToClipboard(neoconnectInfo.downloads?.linux?.script)}
                        className="absolute top-2 right-2 p-1 rounded bg-white/10 hover:bg-white/20">
                        <Copy className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Gateway (Route Installer) tab */}
            {connectorTab === 'gateway' && (
              <div className="rounded-xl border border-border bg-card p-6 space-y-4">
                <h3 className="font-bold text-sm">NeoSC Gateway — usa una VM Windows existente</h3>
                <p className="text-xs text-muted-foreground">
                  Si no tienes el mini-PC dedicado, puedes convertir cualquier VM Windows que ya
                  tengas en tu red en el Gateway de NeoSC. Genera un token de activacion de un
                  solo uso, descarga el instalador, y correlo en esa VM.
                </p>

                {!gatewayToken ? (
                  <Button onClick={generateGatewayToken} disabled={gatewayTokenLoading || !tenantId}
                    className="bg-purple-600 hover:bg-purple-500 text-white font-bold gap-2" data-testid="nc-gen-gw-token">
                    {gatewayTokenLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                    Generar token de activacion
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-amber-500/30 bg-amber-500/5 text-xs">
                      <Key className="w-4 h-4 text-amber-400 shrink-0" />
                      <div className="flex-1">
                        <div className="text-muted-foreground">Token de activacion (un solo uso, expira en 48h):</div>
                        <code className="text-amber-300 font-mono text-sm">{gatewayToken.token}</code>
                      </div>
                      <button onClick={() => copyToClipboard(gatewayToken.token)} className="p-1 rounded hover:bg-white/10">
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>

                    <div>
                      <a href="/downloads/Route-Installer.ps1" download
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold">
                        <Download className="w-3 h-3" /> Descargar Route-Installer.ps1
                      </a>
                    </div>

                    <div className="relative">
                      <pre className="p-3 rounded-lg bg-black/40 text-[11px] text-green-400 font-mono overflow-x-auto">
{`# Corre esto como Administrador en la VM Windows que sera tu Gateway:
.\\Route-Installer.ps1 -Token "${gatewayToken.token}"`}
                      </pre>
                      <button onClick={() => copyToClipboard(`.\\Route-Installer.ps1 -Token "${gatewayToken.token}"`)}
                        className="absolute top-2 right-2 p-1 rounded bg-white/10 hover:bg-white/20">
                        <Copy className="w-3 h-3 text-white" />
                      </button>
                    </div>

                    <p className="text-[10px] text-muted-foreground">
                      El instalador te va a pedir confirmar la subred de tu red local (ej. 192.168.10.0/24) —
                      esa es la red que tus empleados van a poder alcanzar via RDP, tunelizado por NeoMesh.
                      No se abre ningun puerto en tu firewall.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Container tab */}
            {connectorTab === 'container' && (
              <div className="rounded-xl border border-border bg-card p-6 space-y-4">
                <h3 className="font-bold text-sm">Opcion B: Levantar container relay</h3>
                <p className="text-xs text-muted-foreground">
                  Despliega un container Docker en tu red que actua como puente.
                  Ideal si no quieres instalar software en tus servidores Windows.
                </p>
                <div className="relative">
                  <pre className="p-3 rounded-lg bg-black/40 text-[11px] text-green-400 font-mono overflow-x-auto whitespace-pre-wrap">
                    {neoconnectInfo.downloads?.docker?.run}
                  </pre>
                  <button onClick={() => copyToClipboard(neoconnectInfo.downloads?.docker?.run)}
                    className="absolute top-2 right-2 p-1 rounded bg-white/10 hover:bg-white/20">
                    <Copy className="w-3 h-3 text-white" />
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Requisitos: Docker instalado, acceso a internet para el tunel, acceso LAN a tus Windows.
                </p>
              </div>
            )}

            {/* DNS tab */}
            {connectorTab === 'dns' && (
              <div className="rounded-xl border border-border bg-card p-6 space-y-4">
                <h3 className="font-bold text-sm">Opcion C: Redireccion DNS</h3>
                <p className="text-xs text-muted-foreground">
                  Si prefieres usar tu propio dominio, configura un CNAME apuntando a nuestro proxy.
                  Los usuarios acceden via <code className="text-purple-400">tudominio.com</code> con SSO.
                </p>
                <div className="rounded-lg bg-muted/30 p-4 space-y-3">
                  <div>
                    <Label className="text-xs">Tu dominio actual</Label>
                    <Input value={dnsConfig.domain} onChange={e => setDnsConfig(p => ({...p, domain: e.target.value}))}
                      placeholder="escritorios.miempresa.com" className="font-mono" />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Agrega este registro en tu DNS hosting:
                  </div>
                  <div className="relative">
                    <pre className="p-3 rounded-lg bg-black/40 text-[11px] text-green-400 font-mono">
{`Tipo:   CNAME
Nombre: ${dnsConfig.domain || 'escritorios.miempresa.com'}
Valor:  proxy.neosc.cloud
TTL:    300`}</pre>
                    <button onClick={() => copyToClipboard(`CNAME ${dnsConfig.domain || 'escritorios'} proxy.neosc.cloud`)}
                      className="absolute top-2 right-2 p-1 rounded bg-white/10 hover:bg-white/20">
                      <Copy className="w-3 h-3 text-white" />
                    </button>
                  </div>
                  <p className="text-[10px] text-amber-400">
                    Nota: Aun necesitas el conector (Agent o Container) para que NeoSC pueda llegar a tus Windows internos.
                    El DNS solo resuelve el acceso externo con tu dominio.
                  </p>
                </div>
              </div>
            )}

            {/* Setup Key */}
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-muted/20 text-xs">
              <Key className="w-4 h-4 text-purple-400" />
              <span className="text-muted-foreground">Setup Key:</span>
              <code className="text-purple-400 font-mono">{neoconnectInfo.setup_key}</code>
              <button onClick={() => copyToClipboard(neoconnectInfo.setup_key)} className="p-1 rounded hover:bg-white/10">
                <Copy className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Register Windows Hosts */}
        {step === 3 && (
          <div className="space-y-6" data-testid="neoconnect-step-3">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold">
                {form.access_mode === 'direct_rdp' ? 'Que maquinas pueden acceder tus usuarios' : 'Registra tus servidores Windows'}
              </h2>
              <p className="text-muted-foreground text-sm mt-1">
                {form.access_mode === 'direct_rdp'
                  ? 'Esta lista es tu control de acceso: solo estas IPs y puertos quedaran permitidos por la policy de NeoMesh.'
                  : 'Agrega las IPs o dominios de tus maquinas Windows con TSplus / RDP'}
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-6 space-y-3">
              {windowsHosts.map((host, i) => (
                <div key={i} className="flex items-end gap-2">
                  <div className="flex-1">
                    <Label className="text-[10px]">IP / Hostname</Label>
                    <Input value={host.ip} onChange={e => updateHost(i, 'ip', e.target.value)}
                      placeholder="10.100.10.152" className="h-8 text-xs font-mono" />
                  </div>
                  <div className="w-40">
                    <Label className="text-[10px]">Nombre</Label>
                    <Input value={host.name} onChange={e => updateHost(i, 'name', e.target.value)}
                      placeholder="Win-Server-01" className="h-8 text-xs" />
                  </div>
                  <div className="w-24">
                    <Label className="text-[10px]">Puerto RDP</Label>
                    <Input type="number" value={host.rdp_port} onChange={e => updateHost(i, 'rdp_port', parseInt(e.target.value) || 3389)}
                      className="h-8 text-xs" />
                  </div>
                  {windowsHosts.length > 1 && (
                    <Button size="sm" variant="ghost" onClick={() => removeHost(i)} className="h-8 w-8 p-0 text-red-400">
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={addHost} className="gap-1 text-xs">
                <Plus className="w-3 h-3" /> Agregar otro servidor
              </Button>
            </div>

            <Button onClick={finalizeSetup} disabled={loading}
              className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-5 gap-2" data-testid="nc-finalize">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Activar NeoConnect
            </Button>
          </div>
        )}

        {/* Step 4: Done */}
        {step === 4 && (
          <div className="space-y-6 text-center" data-testid="neoconnect-step-4">
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-10 space-y-4">
              <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto" />
              <h2 className="text-3xl font-bold text-emerald-400">NeoConnect Activo</h2>
              {form.access_mode === 'direct_rdp' ? (
                <>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    Tu infraestructura esta protegida con NeoGuard SSO + NeoMesh VPN.
                    Tus empleados abren su cliente RDP normal y se conectan directo a las
                    maquinas que registraste, tunelizado y sin exponer puertos a internet.
                  </p>
                  {windowsHosts.filter(h => h.ip).length > 0 && (
                    <div className="text-left max-w-md mx-auto rounded-lg bg-muted/30 p-4 text-xs font-mono space-y-1">
                      {windowsHosts.filter(h => h.ip).map((h, i) => (
                        <div key={i} className="text-emerald-300">{h.name || h.ip} → {h.ip}:{h.rdp_port}</div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground max-w-md mx-auto">
                  Tu infraestructura TSplus esta protegida con NeoGuard SSO + NeoMesh VPN.
                  Los usuarios pueden acceder via HTML5 con autenticacion segura.
                </p>
              )}
              <div className="flex gap-3 justify-center pt-4">
                <Button onClick={() => navigate('/workspaces')} className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold gap-2">
                  <Monitor className="w-4 h-4" /> Ir a Workspaces
                </Button>
                <Button variant="outline" onClick={() => navigate('/dashboard')} className="gap-2">
                  Dashboard
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Navigation (except step 1 which has its own button, and step 4 which is done) */}
        {step !== 4 && (
          <div className="flex justify-between mt-10 pt-6 border-t border-border">
            <Button variant="ghost" onClick={() => step > 0 ? setStep(step - 1) : navigate('/market')} className="gap-2">
              <ArrowLeft className="w-4 h-4" /> {step > 0 ? 'Anterior' : 'Volver'}
            </Button>
            {step !== 1 && step < 3 && (
              <Button onClick={() => setStep(step + 1)} disabled={!canNext()}
                className="bg-purple-600 hover:bg-purple-500 text-white font-bold gap-2" data-testid="nc-next">
                Siguiente <ArrowRight className="w-4 h-4" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const Zap = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>
  </svg>
);
