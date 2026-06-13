import { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, Package, BarChart2,
  History, Users, Settings, LogOut, Menu,
  ChevronDown, Warehouse, ShoppingBag, Shield, UserCog, Globe,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { LanguageSwitcher } from '@/components/common/LanguageSwitcher';
import type { PermissionKey } from '@/types/types';

interface NavItem {
  labelKey: string;
  path: string;
  icon: React.ElementType;
  permission?: PermissionKey;
  adminOnly?: boolean;
  superAdminOnly?: boolean;
}

const navItems: NavItem[] = [
  { labelKey: 'nav.dashboard',    path: '/dashboard',   icon: LayoutDashboard, permission: 'view_dashboard' },
  { labelKey: 'nav.pos',          path: '/pos',          icon: ShoppingCart,   permission: 'process_sales' },
  { labelKey: 'nav.products',     path: '/products',     icon: Package,        permission: 'manage_products' },
  { labelKey: 'nav.inventory',    path: '/inventory',    icon: Warehouse,      permission: 'manage_inventory' },
  { labelKey: 'nav.transactions', path: '/transactions', icon: History,        permission: 'view_transactions' },
  { labelKey: 'nav.reports',      path: '/reports',      icon: BarChart2,      permission: 'view_reports' },
  { labelKey: 'nav.roles',        path: '/roles',        icon: UserCog,        permission: 'manage_roles' },
  { labelKey: 'nav.users',        path: '/users',        icon: Users,          permission: 'manage_users' },
  { labelKey: 'nav.fraudMonitor', path: '/fraud',        icon: Shield,         permission: 'view_fraud_alerts' },
  { labelKey: 'nav.settings',     path: '/settings',     icon: Settings,       permission: 'manage_settings' },
  { labelKey: 'nav.superAdmin',   path: '/super-admin',  icon: Globe,          superAdminOnly: true },
];

interface SidebarContentProps {
  onClose?: () => void;
}

function SidebarContent({ onClose }: SidebarContentProps) {
  const { profile, store, isAdmin, isSuperAdmin, can, signOut } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = async () => {
    await signOut();
    toast.success(t('nav.logout'));
    navigate('/login');
    onClose?.();
  };

  const filteredNav = navItems.filter(item => {
    if (item.superAdminOnly) return isSuperAdmin;
    if (item.adminOnly) return isAdmin;
    if (item.permission) return can(item.permission);
    return true;
  });

  const getRoleName = () => {
    if (profile?.role === 'super_admin') return t('roleLabel.super_admin');
    if (profile?.role === 'store_owner') return t('roleLabel.store_owner');
    if (profile?.custom_role?.name) return profile.custom_role.name;
    if (profile?.role === 'admin') return t('roleLabel.admin');
    return t('roleLabel.cashier');
  };

  const getRoleColor = () => {
    if (profile?.role === 'super_admin') return '#7C3AED';
    if (profile?.role === 'store_owner') return '#0A6E4C';
    return profile?.custom_role?.color ?? (profile?.role === 'admin' ? '#0A4D3C' : '#3B82F6');
  };

  const roleName = getRoleName();
  const roleColor = getRoleColor();
  const ws = profile?.warning_status || 'normal';

  return (
    <div className="flex flex-col h-full bg-sidebar">
      <div className="flex items-center gap-3 px-4 py-5">
        <div className="w-9 h-9 rounded-lg bg-sidebar-primary flex items-center justify-center shrink-0">
          <ShoppingBag className="w-5 h-5 text-sidebar-primary-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-sidebar-foreground font-semibold text-sm truncate">
            {isSuperAdmin ? 'POS System' : (store?.name || 'ระบบ POS')}
          </p>
          <p className="text-sidebar-foreground/60 text-xs truncate">Point of Sale</p>
        </div>
      </div>
      <Separator className="bg-sidebar-border" />

      <nav className="flex-1 py-3 px-2 overflow-y-auto">
        {filteredNav.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          const isSA = item.superAdminOnly;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onClose}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 text-sm font-medium transition-colors min-h-11 ${
                isActive
                  ? isSA ? 'bg-violet-600 text-white' : 'bg-sidebar-primary text-sidebar-primary-foreground'
                  : isSA
                    ? 'text-violet-500 hover:bg-violet-500/10 hover:text-violet-400'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              }`}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span className="truncate">{t(item.labelKey)}</span>
            </NavLink>
          );
        })}
      </nav>

      <Separator className="bg-sidebar-border" />

      <div className="p-3">
        <div className="flex items-center gap-3 px-2 py-2">
          <Avatar className="w-8 h-8 shrink-0">
            <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs font-semibold">
              {(profile?.username || 'U').charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sidebar-foreground text-sm font-medium truncate">
              {profile?.full_name || profile?.username || 'ผู้ใช้งาน'}
            </p>
            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
              <span
                className="inline-flex items-center rounded px-1.5 py-0 text-xs font-medium"
                style={{ backgroundColor: roleColor + '33', color: roleColor }}
              >
                {roleName}
              </span>
              {ws === 'yellow_card' && (
                <Badge className="bg-yellow-500 text-white text-xs px-1.5 py-0">⚠ ใบเหลือง</Badge>
              )}
            </div>
          </div>
          <Button
            variant="ghost" size="icon"
            onClick={handleSignOut}
            className="shrink-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground w-8 h-8"
            title={t('nav.logout')}
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

interface MainLayoutProps {
  children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { profile } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();

  const currentNav = navItems.find(item => item.path === location.pathname);

  const getRoleLabel = () => {
    if (profile?.role === 'super_admin') return t('roleLabel.super_admin');
    if (profile?.role === 'store_owner') return t('roleLabel.store_owner');
    if (profile?.custom_role?.name) return profile.custom_role.name;
    if (profile?.role === 'admin') return t('roleLabel.admin');
    return t('roleLabel.cashier');
  };

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="hidden lg:flex flex-col w-60 shrink-0 border-r border-border">
        <SidebarContent />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-60 bg-sidebar border-r-sidebar-border">
          <SidebarContent onClose={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 bg-card border-b border-border flex items-center gap-3 px-4 h-14 shrink-0">
          <Button
            variant="ghost" size="icon"
            className="lg:hidden shrink-0"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold text-foreground truncate">
              {currentNav ? t(currentNav.labelKey) : 'ระบบ POS'}
            </h1>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <LanguageSwitcher variant="compact" className="text-foreground hover:bg-accent hover:text-accent-foreground" />
            <div className="hidden md:block">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="gap-2 px-2 h-9">
                    <Avatar className="w-7 h-7">
                      <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                        {(profile?.username || 'U').charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium max-w-[120px] truncate">
                      {profile?.username || 'ผู้ใช้งาน'}
                    </span>
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                    {getRoleLabel()}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
