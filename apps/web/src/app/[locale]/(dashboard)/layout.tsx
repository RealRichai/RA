'use client';

import {
  Building2,
  Home,
  Building,
  FileText,
  Wrench,
  CreditCard,
  BarChart3,
  Settings,
  LogOut,
  MessageSquare,
  Users,
  Shield,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';

const navigationItems = [
  { key: 'dashboard', href: '/dashboard', icon: Home },
  { key: 'properties', href: '/dashboard/properties', icon: Building },
  { key: 'listings', href: '/dashboard/listings', icon: FileText },
  { key: 'leases', href: '/dashboard/leases', icon: FileText },
  { key: 'maintenance', href: '/dashboard/maintenance', icon: Wrench },
  { key: 'payments', href: '/dashboard/payments', icon: CreditCard },
  { key: 'aiAssistant', href: '/dashboard/ai', icon: MessageSquare },
  { key: 'analytics', href: '/dashboard/analytics', icon: BarChart3 },
  { key: 'compliance', href: '/dashboard/compliance', icon: Shield },
  { key: 'team', href: '/dashboard/team', icon: Users },
  { key: 'settings', href: '/dashboard/settings', icon: Settings },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, logout } = useAuthStore();
  const t = useTranslations('navigation');
  const tAuth = useTranslations('auth');

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, router]);

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-card flex flex-col">
        <div className="p-6">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Building2 className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold">RealRiches</span>
          </Link>
        </div>
        <nav className="flex-1 px-4 space-y-1">
          {navigationItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.key}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <item.icon className="h-5 w-5" />
                {t(item.key)}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t space-y-3">
          <LanguageSwitcher className="w-full justify-start" />
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-sm font-medium">
                {user?.firstName?.[0]}
                {user?.lastName?.[0]}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={() => void handleLogout()}
          >
            <LogOut className="h-4 w-4 mr-2" />
            {tAuth('signOut')}
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}
