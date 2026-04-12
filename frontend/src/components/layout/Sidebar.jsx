import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/i18n/LanguageContext';
import {
  LayoutDashboard,
  Monitor,
  Shield,
  Settings,
  LogOut,
  Menu,
  X,
  Crown,
  Languages,
  ShoppingCart,
  Gauge,
  Wifi,
  Users,
  ChevronDown,
  ChevronRight,
  Server,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';

const userMenuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
  { icon: Monitor, label: 'Workspaces', path: '/workspaces' },
  { icon: ShoppingCart, label: 'VDI Market', path: '/market', highlight: true },
];

const adminMenuItems = [
  { icon: Gauge, label: 'Panel Global', path: '/admin' },
  { icon: Users, label: 'Enrolar Tenant', path: '/admin/enroll-tenant' },
  { icon: Server, label: 'NeoCloud LXD', path: '/admin/lxd' },
  { icon: Shield, label: 'NeoGuard SSO', path: '/admin/zitadel' },
  { icon: Wifi, label: 'NeoMesh VPN', path: '/admin/netbird' },
];

export const Sidebar = () => {
  const location = useLocation();
  const { user, logout, isAdmin, authMethod } = useAuth();
  const { language, toggleLanguage } = useLanguage();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(true);

  const handleLogout = async () => {
    await logout();
    window.location.href = '/';
  };

  const NavLink = ({ item }) => {
    const isActive = location.pathname === item.path;
    return (
      <Link
        to={item.path}
        data-testid={`sidebar-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
        className={`
          flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm
          transition-colors duration-150
          ${isActive
            ? 'bg-cyan-500/10 text-cyan-400 font-medium'
            : item.highlight
            ? 'text-cyan-400/80 hover:text-cyan-300 hover:bg-cyan-500/5'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }
        `}
        onClick={() => setMobileOpen(false)}
      >
        <item.icon className="w-4 h-4 flex-shrink-0" />
        <span className="truncate">{item.label}</span>
        {item.highlight && !isActive && (
          <span className="ml-auto text-[9px] bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded font-bold">NEW</span>
        )}
      </Link>
    );
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo - compact */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-2.5">
        <Link to="/dashboard" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-sm">N</span>
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">
              Neo <span className="text-cyan-400">SC</span>
            </span>
            <span className="text-[10px] text-muted-foreground">Neogénesys</span>
          </div>
        </Link>
        {isAdmin && (
          <Badge className="ml-auto bg-orange-500/20 text-orange-400 border-orange-500/30 text-[9px] px-1.5">
            ADMIN
          </Badge>
        )}
      </div>

      {/* Scrollable nav */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1" data-testid="sidebar-nav">
        {/* User items */}
        {userMenuItems.map((item) => (
          <NavLink key={item.path} item={item} />
        ))}

        {/* Admin section */}
        {isAdmin && (
          <>
            <button
              onClick={() => setAdminOpen(!adminOpen)}
              className="flex items-center gap-2 w-full px-3 py-2 mt-2 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
              data-testid="sidebar-admin-toggle"
            >
              <Crown className="w-3 h-3 text-orange-400" />
              Administración
              {adminOpen ? <ChevronDown className="w-3 h-3 ml-auto" /> : <ChevronRight className="w-3 h-3 ml-auto" />}
            </button>
            {adminOpen && (
              <div className="space-y-0.5 ml-1 border-l border-border/50 pl-2">
                {adminMenuItems.map((item) => (
                  <NavLink key={item.path} item={item} />
                ))}
              </div>
            )}
          </>
        )}
      </nav>

      {/* Footer - compact */}
      <div className="p-3 border-t border-border space-y-2">
        <button
          onClick={toggleLanguage}
          className="flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <Languages className="w-3.5 h-3.5" />
          <span>{language === 'es' ? 'Español' : 'English'}</span>
          <Badge variant="outline" className="ml-auto text-[9px] px-1">
            {language.toUpperCase()}
          </Badge>
        </button>

        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-muted/20">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-500 to-orange-500 flex items-center justify-center flex-shrink-0">
            <span className="text-white font-semibold text-xs">
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-foreground truncate">{user?.name}</p>
            <p className="text-[10px] text-muted-foreground truncate">{user?.email}</p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-red-400 hover:bg-red-500/5 transition-colors"
          data-testid="logout-button"
        >
          <LogOut className="w-3.5 h-3.5" />
          {language === 'es' ? 'Cerrar Sesión' : 'Logout'}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-card border border-border"
        onClick={() => setMobileOpen(!mobileOpen)}
        data-testid="mobile-menu-toggle"
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 h-full w-56 bg-card border-r border-border z-40
          flex flex-col
          transition-transform duration-300 ease-in-out
          lg:translate-x-0
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <SidebarContent />
      </aside>
    </>
  );
};

export default Sidebar;
