import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/i18n/LanguageContext';
import { 
  LayoutDashboard, 
  Monitor, 
  Users, 
  Shield, 
  FileText, 
  Settings,
  Building2,
  LogOut,
  Menu,
  X,
  Zap,
  Crown,
  Globe,
  Grid3X3,
  Languages,
  ShoppingCart
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';

// Menu items with role restrictions
const getMenuItems = (isAdmin) => {
  const baseItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard', adminOnly: false },
    { icon: Monitor, label: 'Workspaces', path: '/workspaces', adminOnly: false },
    { icon: Globe, label: 'Aplicaciones', path: '/applications', adminOnly: false },
    { icon: Grid3X3, label: 'Vista Múltiple', path: '/multi-view', adminOnly: false },
    { icon: Zap, label: 'Sesiones Activas', path: '/sessions', adminOnly: false },
    { icon: ShoppingCart, label: 'Windows VDI Market', path: '/market', adminOnly: false, highlight: true },
  ];

  const adminItems = [
    { icon: Building2, label: 'Organizaciones', path: '/organizations', adminOnly: true },
    { icon: Shield, label: 'Políticas', path: '/policies', adminOnly: true },
    { icon: FileText, label: 'Auditoría', path: '/audit-logs', adminOnly: true },
  ];

  const settingsItems = [
    { icon: Settings, label: 'Configuración', path: '/settings', adminOnly: false },
  ];

  if (isAdmin) {
    return [...baseItems, ...adminItems, ...settingsItems];
  }
  return [...baseItems, ...settingsItems];
};

export const Sidebar = () => {
  const location = useLocation();
  const { user, logout, isAdmin, authMethod, userRoles } = useAuth();
  const { language, toggleLanguage } = useLanguage();
  const [mobileOpen, setMobileOpen] = useState(false);

  const menuItems = getMenuItems(isAdmin);

  const handleLogout = async () => {
    await logout();
    window.location.href = '/';
  };

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="p-6 border-b border-border">
        <Link to="/dashboard" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center">
            <span className="text-white font-bold text-lg">N</span>
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground tracking-tight">Neo</span>
              <span className="text-cyan-400 font-bold tracking-tight">génesys</span>
            </div>
            <span className="anniversary-badge">25 Años</span>
          </div>
        </Link>
      </div>

      {/* User Role Badge */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          {isAdmin ? (
            <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">
              <Crown className="w-3 h-3 mr-1" />
              Administrator
            </Badge>
          ) : (
            <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30">
              User
            </Badge>
          )}
          {authMethod === 'zitadel' && (
            <Badge variant="outline" className="text-xs border-green-500/30 text-green-400">
              SSO
            </Badge>
          )}
        </div>
        {userRoles.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {userRoles.slice(0, 3).map((role, idx) => (
              <span key={idx} className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded">
                {role}
              </span>
            ))}
            {userRoles.length > 3 && (
              <span className="text-xs text-muted-foreground">+{userRoles.length - 3}</span>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
          return (
            <Link
              key={item.path}
              to={item.path}
              data-testid={`sidebar-${item.label.toLowerCase().replace(' ', '-')}`}
              className={`
                flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium
                transition-colors duration-200
                ${isActive 
                  ? 'bg-primary/10 text-primary border-l-2 border-primary' 
                  : item.highlight
                  ? 'text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 border border-cyan-500/20 hover:border-cyan-500/40'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }
              `}
              onClick={() => setMobileOpen(false)}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
              {item.adminOnly && (
                <Crown className="w-3 h-3 ml-auto text-orange-400" />
              )}
              {item.highlight && !isActive && (
                <span className="ml-auto text-[10px] bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded font-bold">NEW</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="p-4 border-t border-border">
        {/* Language Toggle */}
        <Button
          variant="ghost"
          className="w-full mb-3 justify-between text-muted-foreground hover:text-foreground"
          onClick={toggleLanguage}
        >
          <div className="flex items-center gap-2">
            <Languages className="w-4 h-4" />
            <span>{language === 'es' ? 'Español' : 'English'}</span>
          </div>
          <Badge variant="outline" className="text-xs">
            {language.toUpperCase()}
          </Badge>
        </Button>

        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-muted/30">
          {user?.picture ? (
            <img 
              src={user.picture} 
              alt={user.name} 
              className="w-9 h-9 rounded-full object-cover"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-500 to-orange-500 flex items-center justify-center">
              <span className="text-white font-semibold text-sm">
                {user?.name?.charAt(0)?.toUpperCase() || 'U'}
              </span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{user?.name}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
        </div>
        
        <Button
          variant="ghost"
          className="w-full mt-3 justify-start text-muted-foreground hover:text-destructive"
          onClick={handleLogout}
          data-testid="logout-button"
        >
          <LogOut className="w-4 h-4 mr-3" />
          {language === 'es' ? 'Cerrar Sesión' : 'Logout'}
        </Button>
      </div>
    </>
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
          fixed top-0 left-0 h-full w-64 bg-card border-r border-border z-40
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
