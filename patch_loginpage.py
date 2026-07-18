#!/usr/bin/env python3
"""
Parchea frontend/src/pages/LoginPage.jsx in-place, quitando las
credenciales hardcodeadas y agregando el formulario de login local.

Corre esto desde ~/NeoSC-site/
    python3 patch_loginpage.py
"""
import shutil
import sys

PATH = "frontend/src/pages/LoginPage.jsx"

with open(PATH, "r", encoding="utf-8") as f:
    content = f.read()

original = content
applied = []

def apply(label, old, new):
    global content
    count = content.count(old)
    if count == 0:
        print(f"❌ NO ENCONTRADO: {label}")
        print("---- snippet buscado ----")
        print(old)
        print("--------------------------")
        sys.exit(1)
    if count > 1:
        print(f"❌ AMBIGUO: '{label}' aparece {count} veces.")
        sys.exit(1)
    content = content.replace(old, new, 1)
    applied.append(label)
    print(f"✅ {label}")


# 1. Imports
apply(
    "imports (Input, íconos)",
    """import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Zap, Crown, Users, Shield } from 'lucide-react';""",
    """import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Shield, Lock, Mail } from 'lucide-react';""",
)

# 2. Quitar QUICK_ACCOUNTS (credenciales en texto plano)
apply(
    "quitar QUICK_ACCOUNTS con credenciales en texto plano",
    """
const QUICK_ACCOUNTS = [
  { email: 'admin@windesk.cloud', password: 'Admin123!', label: 'Platform Admin', role: 'admin', icon: Crown, color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/30 hover:bg-orange-500/20' },
  { email: 'usuario1@windesk.cloud', password: 'Demo123!', label: 'Usuario Demo 1', role: 'user', icon: Users, color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/30 hover:bg-cyan-500/20' },
  { email: 'usuario2@windesk.cloud', password: 'Demo123!', label: 'Usuario Demo 2', role: 'user', icon: Users, color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/30 hover:bg-cyan-500/20' },
  { email: 'usuario3@windesk.cloud', password: 'Demo123!', label: 'Usuario Demo 3', role: 'user', icon: Users, color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/30 hover:bg-cyan-500/20' },
];
""",
    "\n",
)

# 3. State: quitar useState(null) de loading, agregar email/password
apply(
    "state email/password",
    "const [loading, setLoading] = useState(null);",
    """const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');""",
)

# 4. Handler: reemplazar handleQuickLogin por handleLocalLogin
apply(
    "handler de login local",
    """const handleQuickLogin = async (account) => {
    setLoading(account.email);
    try {
      await login(account.email, account.password);
      navigate(from, { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error de autenticación');
    } finally {
      setLoading(null);
    }
  };""",
    """const handleLocalLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Usuario o contraseña incorrectos');
    } finally {
      setLoading(false);
    }
  };""",
)

# 5. JSX: reemplazar bloque de "acceso rápido" por el formulario real
apply(
    "JSX: formulario de login local",
    '''        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-background px-3 text-muted-foreground">o acceso rápido local</span>
          </div>
        </div>

        {/* Quick Access Accounts */}
        <div className="space-y-3" data-testid="quick-access-list">
          {QUICK_ACCOUNTS.map((account) => {
            const Icon = account.icon;
            const isLoading = loading === account.email;
            return (
              <button
                key={account.email}
                onClick={() => handleQuickLogin(account)}
                disabled={loading !== null}
                data-testid={`quick-login-${account.role === 'admin' ? 'admin' : account.email.split('@')[0]}`}
                className={`
                  w-full flex items-center gap-4 p-4 rounded-xl border transition-all duration-200
                  ${account.bg}
                  ${isLoading ? 'ring-2 ring-cyan-500/50' : ''}
                  disabled:opacity-50
                `}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  account.role === 'admin' 
                    ? 'bg-gradient-to-br from-orange-500 to-amber-500' 
                    : 'bg-gradient-to-br from-cyan-500 to-cyan-600'
                }`}>
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Icon className="w-5 h-5 text-white" />
                  )}
                </div>
                <div className="flex-1 text-left">
                  <div className="font-bold text-sm">{account.label}</div>
                  <div className="text-xs text-muted-foreground">{account.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                    account.role === 'admin' 
                      ? 'bg-orange-500/20 text-orange-400' 
                      : 'bg-cyan-500/20 text-cyan-400'
                  }`}>
                    {account.role}
                  </span>
                  <Zap className={`w-4 h-4 ${account.color}`} />
                </div>
              </button>
            );
          })}
        </div>

        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            Bypass local + NeoSC SSO
          </p>
        </div>''',
    '''        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-background px-3 text-muted-foreground">o con cuenta local</span>
          </div>
        </div>

        {/* Local login form */}
        <form onSubmit={handleLocalLogin} className="space-y-3" data-testid="local-login-form">
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="email"
              placeholder="correo@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-9"
              autoComplete="username"
              data-testid="local-login-email"
              required
            />
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-9"
              autoComplete="current-password"
              data-testid="local-login-password"
              required
            />
          </div>
          <Button
            type="submit"
            className="w-full py-5"
            disabled={loading}
            data-testid="local-login-submit"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              'Iniciar sesión'
            )}
          </Button>
        </form>

        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            Las cuentas locales las crea un administrador de la plataforma.
          </p>
        </div>''',
)

if content == original:
    print("Nada cambió — algo salió mal.")
    sys.exit(1)

shutil.copy(PATH, PATH + ".bak-preauth")
with open(PATH, "w", encoding="utf-8") as f:
    f.write(content)

print(f"\n✅ {len(applied)} cambios aplicados. Backup en {PATH}.bak-preauth")
