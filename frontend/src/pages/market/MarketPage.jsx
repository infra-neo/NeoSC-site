import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Monitor, Server, Wifi, Shield, ArrowRight, Cloud,
  AppWindow, Container, Globe, Zap, ChevronRight,
  Building2, Network, Lock, Laptop, Terminal
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function MarketPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const portals = [
    {
      id: 'neocloud',
      title: 'NeoCloud',
      subtitle: 'Escritorios y Apps en la nube',
      desc: 'Despliega escritorios Windows/Linux, apps como VSCode, Office, navegadores en modo kiosko. Acceso HTML5 desde cualquier lugar.',
      color: 'cyan',
      gradient: 'from-cyan-500/20 to-blue-500/20',
      border: 'border-cyan-500/40 hover:border-cyan-400/60',
      icon: Cloud,
      path: '/market/neocloud',
      features: [
        { icon: Monitor, text: 'Windows & Ubuntu Desktop' },
        { icon: AppWindow, text: 'VSCode, Office, Navegador Kiosko' },
        { icon: Container, text: 'Containers on-demand (LXC)' },
        { icon: Shield, text: 'SSO + MFA incluido' },
        { icon: Globe, text: 'Acceso HTML5 sin cliente' },
        { icon: Zap, text: 'Escala bajo demanda' },
      ],
      plans: ['Starter $29/mes', 'Plus $79/mes', 'Enterprise custom'],
      cta: 'Explorar NeoCloud',
      audience: 'Para equipos que necesitan apps y escritorios remotos sin infraestructura propia',
    },
    {
      id: 'neoconnect',
      title: 'NeoConnect',
      subtitle: 'Conecta tu TSplus existente',
      desc: 'Ya tienes servidores Windows con TSplus. Nosotros agregamos SSO, VPN Zero Trust y acceso HTML5 seguro sin abrir puertos.',
      color: 'purple',
      gradient: 'from-purple-500/20 to-pink-500/20',
      border: 'border-purple-500/40 hover:border-purple-400/60',
      icon: Network,
      path: '/market/neoconnect',
      features: [
        { icon: Lock, text: 'NeoGuard SSO + MFA (Zitadel)' },
        { icon: Wifi, text: 'NeoMesh VPN Zero Trust (NetBird)' },
        { icon: Server, text: 'Conector relay sin abrir puertos' },
        { icon: Globe, text: 'DNS propio o subdominio NeoSC' },
        { icon: Shield, text: 'Descubrimiento de IPs en LAN' },
        { icon: Laptop, text: 'HTML5 o cliente nativo' },
      ],
      plans: ['Plus $79/mes', 'Enterprise custom'],
      cta: 'Conectar mi TSplus',
      audience: 'Para empresas que ya tienen TSplus y quieren agregar seguridad zero trust',
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border bg-card/50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center">
              <span className="text-white font-bold">N</span>
            </div>
            <span className="font-semibold">Neo<span className="text-cyan-400">SC</span></span>
          </div>
          <div className="flex gap-3">
            {isAuthenticated ? (
              <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')} className="gap-1">
                <Monitor className="w-3.5 h-3.5" /> Dashboard
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => navigate('/login')} className="gap-1">
                <Lock className="w-3.5 h-3.5" /> Iniciar sesion
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Hero */}
      <div className="max-w-6xl mx-auto px-6 pt-16 pb-10 text-center">
        <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 mb-4">
          Escritorios seguros en la nube
        </Badge>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight" data-testid="market-title">
          Elige tu camino a
          <span className="bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent"> NeoSC</span>
        </h1>
        <p className="text-muted-foreground mt-4 max-w-2xl mx-auto text-base">
          Dos formas de acceder a escritorios remotos seguros. Elige la que mejor se adapte a tu empresa.
        </p>
      </div>

      {/* Portal Cards */}
      <div className="max-w-6xl mx-auto px-6 pb-20">
        <div className="grid md:grid-cols-2 gap-8">
          {portals.map(portal => {
            const Icon = portal.icon;
            return (
              <div
                key={portal.id}
                className={`rounded-2xl border ${portal.border} bg-gradient-to-br ${portal.gradient} p-1 transition-all duration-300 cursor-pointer group`}
                onClick={() => navigate(portal.path)}
                data-testid={`portal-${portal.id}`}
              >
                <div className="rounded-xl bg-card p-8 h-full flex flex-col">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-6">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`w-12 h-12 rounded-xl bg-${portal.color}-500/10 flex items-center justify-center`}>
                          <Icon className={`w-6 h-6 text-${portal.color}-400`} />
                        </div>
                        <div>
                          <h2 className="text-2xl font-bold">{portal.title}</h2>
                          <p className={`text-sm text-${portal.color}-400 font-medium`}>{portal.subtitle}</p>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{portal.desc}</p>
                    </div>
                  </div>

                  {/* Features */}
                  <div className="grid grid-cols-2 gap-2 mb-6 flex-1">
                    {portal.features.map((feat, i) => {
                      const FIcon = feat.icon;
                      return (
                        <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <FIcon className={`w-3.5 h-3.5 text-${portal.color}-400 flex-shrink-0`} />
                          <span>{feat.text}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Plans */}
                  <div className="flex flex-wrap gap-2 mb-6">
                    {portal.plans.map((plan, i) => (
                      <Badge key={i} variant="outline" className="text-[10px]">{plan}</Badge>
                    ))}
                  </div>

                  {/* Audience */}
                  <p className="text-[11px] text-muted-foreground mb-4 italic">{portal.audience}</p>

                  {/* CTA */}
                  <Button
                    className={`w-full bg-${portal.color}-500 hover:bg-${portal.color}-400 text-black font-bold py-5 gap-2 group-hover:gap-3 transition-all`}
                    data-testid={`cta-${portal.id}`}
                  >
                    {portal.cta} <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom comparison */}
        <div className="mt-16 rounded-2xl border border-border bg-card p-8">
          <h3 className="font-bold text-lg mb-6 text-center">Comparativa rapida</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Caracteristica</th>
                  <th className="text-center py-3 px-4 text-cyan-400 font-bold">NeoCloud</th>
                  <th className="text-center py-3 px-4 text-purple-400 font-bold">NeoConnect</th>
                </tr>
              </thead>
              <tbody className="text-xs">
                {[
                  ['Requiere infraestructura propia', 'No', 'Si (TSplus)'],
                  ['Escritorio Windows', 'VM en nuestro cloud', 'Tu servidor existente'],
                  ['Escritorio Ubuntu/Linux', 'Container LXC', '-'],
                  ['Apps (VSCode, Office, Browser)', 'Incluido', '-'],
                  ['SSO + MFA (NeoGuard)', 'Incluido', 'Incluido'],
                  ['VPN Zero Trust (NeoMesh)', 'Incluido', 'Incluido'],
                  ['Acceso HTML5', 'Guacamole', 'TSplus HTML5'],
                  ['Conector relay', 'No necesario', 'NetBird Agent/Container'],
                  ['Dominio propio', 'Enterprise', 'Plus+'],
                  ['Escala on-demand', 'Si', 'Depende de tu infra'],
                ].map(([feat, cloud, connect], i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="py-2.5 px-4 text-muted-foreground">{feat}</td>
                    <td className="py-2.5 px-4 text-center">{cloud}</td>
                    <td className="py-2.5 px-4 text-center">{connect}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
