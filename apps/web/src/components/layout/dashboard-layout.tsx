'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/components/providers/theme-provider';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials, cn } from '@/lib/utils';
import {
  Home,
  Building2,
  FileText,
  Scroll,
  CreditCard,
  Users,
  Calendar,
  Bell,
  Settings,
  LogOut,
  Menu,
  X,
  Sun,
  Moon,
  Monitor,
  ChevronDown,
  Shield,
  Flag,
  MapPin,
  ClipboardList,
} from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: string[];
}

const mainNavItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: Home },
  { href: '/dashboard/listings', label: 'Listings', icon: Building2 },
  { href: '/dashboard/applications', label: 'Applications', icon: FileText },
  { href: '/dashboard/leases', label: 'Leases', icon: Scroll },
  { href: '/dashboard/payments', label: 'Payments', icon: CreditCard },
  { href: '/dashboard/leads', label: 'Leads', icon: Users, roles: ['AGENT', 'LANDLORD', 'ADMIN'] },
  { href: '/dashboard/tours', label: 'Tours', icon: Calendar, roles: ['AGENT', 'LANDLORD', 'ADMIN'] },
];

const adminNavItems: NavItem[] = [
  { href: '/dashboard/admin/users', label: 'Users', icon: Users, roles: ['ADMIN', 'SUPER_ADMIN'] },
  { href: '/dashboard/admin/flags', label: 'Feature Flags', icon: Flag, roles: ['ADMIN', 'SUPER_ADMIN'] },
  { href: '/dashboard/admin/markets', label: 'Markets', icon: MapPin, roles: ['ADMIN', 'SUPER_ADMIN'] },
  { href: '/dashboard/admin/audit', label: 'Audit Log', icon: ClipboardList, roles: ['ADMIN', 'SUPER_ADMIN'] },
];

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, isAdmin } = useAuth();
  const { mode, setTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [userMenuOpen, setUserMenuOpen] = React.useState(false);

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  const filteredNavItems = mainNavItems.filter(
    (item) => !item.roles || (user && item.roles.includes(user.role))
  );

  const filteredAdminItems = adminNavItems.filter(
    (item) => !item.roles || (user && item.roles.includes(user.role))
  );

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-50 h-full w-64 bg-card border-r border-border transform transition-transform duration-200 lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="h-16 flex items-center justify-between px-4 border-b border-border">
            <Link href="/dashboard" className="font-heading text-xl font-semibold">
              RealRiches
            </Link>
            <button
              className="lg:hidden p-2 hover:bg-muted rounded-md"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-4 px-3">
            <div className="space-y-1">
              {filteredNavItems.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                    {item.label}
                  </Link>
                );
              })}
            </div>

            {/* Admin section */}
            {isAdmin && filteredAdminItems.length > 0 && (
              <>
                <div className="mt-8 mb-2 px-3">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Administration
                  </span>
                </div>
                <div className="space-y-1">
                  {filteredAdminItems.map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setSidebarOpen(false)}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        )}
                      >
                        <item.icon className="h-5 w-5" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </>
            )}
          </nav>

          {/* Theme switcher */}
          <div className="p-3 border-t border-border">
            <div className="flex items-center justify-center gap-1 p-1 bg-muted rounded-md">
              <button
                onClick={() => setTheme('ivory-light')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-sm transition-colors',
                  mode === 'ivory-light' ? 'bg-card shadow-sm' : 'hover:text-foreground text-muted-foreground'
                )}
              >
                <Sun className="h-4 w-4" />
              </button>
              <button
                onClick={() => setTheme('noir-dark')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-sm transition-colors',
                  mode === 'noir-dark' ? 'bg-card shadow-sm' : 'hover:text-foreground text-muted-foreground'
                )}
              >
                <Moon className="h-4 w-4" />
              </button>
              <button
                onClick={() => setTheme('system')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-sm transition-colors',
                  mode === 'system' ? 'bg-card shadow-sm' : 'hover:text-foreground text-muted-foreground'
                )}
              >
                <Monitor className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-16 bg-card border-b border-border">
          <div className="flex items-center justify-between h-full px-4">
            <button
              className="lg:hidden p-2 hover:bg-muted rounded-md"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="flex-1" />

            <div className="flex items-center gap-3">
              {/* Notifications */}
              <Link href="/dashboard/notifications">
                <Button variant="ghost" size="icon" className="relative">
                  <Bell className="h-5 w-5" />
                  <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-[#C6A76A]" />
                </Button>
              </Link>

              {/* User menu */}
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 p-1.5 hover:bg-muted rounded-md transition-colors"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user?.avatarUrl} alt={user?.firstName} />
                    <AvatarFallback>
                      {user ? getInitials(user.firstName, user.lastName) : '?'}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:block text-sm font-medium">
                    {user?.firstName}
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>

                {userMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setUserMenuOpen(false)}
                    />
                    <div className="absolute right-0 mt-2 w-56 bg-card border border-border rounded-md shadow-lg z-50">
                      <div className="p-3 border-b border-border">
                        <p className="font-medium">{user?.firstName} {user?.lastName}</p>
                        <p className="text-sm text-muted-foreground">{user?.email}</p>
                      </div>
                      <div className="p-1">
                        <Link
                          href="/dashboard/settings"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors"
                        >
                          <Settings className="h-4 w-4" />
                          Settings
                        </Link>
                        <button
                          onClick={handleLogout}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors text-destructive"
                        >
                          <LogOut className="h-4 w-4" />
                          Sign Out
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
