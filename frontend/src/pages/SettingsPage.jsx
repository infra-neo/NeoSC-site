import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/i18n/LanguageContext';
import { toast } from 'sonner';
import { User, Key, Globe, Palette, Shield } from 'lucide-react';

export default function SettingsPage() {
  const { user, getAuthHeader, authMethod } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="lg:ml-56 p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          <h1 className="text-2xl font-bold" data-testid="settings-title">
            {t('Configuración', 'Settings')}
          </h1>

          {/* Profile */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h2 className="font-bold flex items-center gap-2">
              <User className="w-4 h-4 text-cyan-400" />
              {t('Perfil', 'Profile')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">{t('Nombre', 'Name')}</Label>
                <div className="font-medium mt-1">{user?.name || '-'}</div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Email</Label>
                <div className="font-medium mt-1">{user?.email || '-'}</div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{t('Organización', 'Organization')}</Label>
                <div className="font-medium mt-1">{user?.organization || '-'}</div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{t('Rol', 'Role')}</Label>
                <Badge variant="outline" className="mt-1">{user?.role}</Badge>
              </div>
            </div>
          </div>

          {/* Auth Method */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h2 className="font-bold flex items-center gap-2">
              <Shield className="w-4 h-4 text-cyan-400" />
              {t('Autenticación', 'Authentication')}
            </h2>
            <div className="flex items-center gap-3">
              <Badge className={`text-xs ${
                authMethod === 'zitadel' ? 'bg-purple-500/10 text-purple-400 border-purple-500/30' : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
              }`}>
                {authMethod === 'zitadel' ? 'Zitadel SSO' : 'Email / Password'}
              </Badge>
              {user?.mfa_enabled && (
                <Badge className="bg-green-500/10 text-green-400 border-green-500/30 text-xs">MFA</Badge>
              )}
            </div>
          </div>

          {/* Language */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h2 className="font-bold flex items-center gap-2">
              <Globe className="w-4 h-4 text-cyan-400" />
              {t('Idioma', 'Language')}
            </h2>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={language === 'es' ? 'default' : 'outline'}
                onClick={() => language !== 'es' && toggleLanguage()}
                className={language === 'es' ? 'bg-cyan-500 text-black' : ''}
                data-testid="lang-es-btn"
              >
                Español
              </Button>
              <Button
                size="sm"
                variant={language === 'en' ? 'default' : 'outline'}
                onClick={() => language !== 'en' && toggleLanguage()}
                className={language === 'en' ? 'bg-cyan-500 text-black' : ''}
                data-testid="lang-en-btn"
              >
                English
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
