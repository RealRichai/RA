'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Home,
  Search,
  Heart,
  Bell,
  User,
  Building2,
  FileText,
  Calendar,
  Users,
  BarChart3,
  Briefcase,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth, useUnreadNotificationCount } from '@/hooks';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

const publicNavItems: NavItem[] = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/listings', label: 'Search', icon: Search },
  { href: '/login', label: 'Account', icon: User },
];

const tenantNavItems: NavItem[] = [
  { href: '/dashboard', label: 'Home', icon: Home },
  { href: '/listings', label: 'Search', icon: Search },
  { href: '/dashboard/saved', label: 'Saved', icon: Heart },
  { href: '/dashboard/applications', label: 'Apps', icon: FileText },
  { href: '/dashboard/notifications', label: 'Alerts', icon: Bell },
];

const landlordNavItems: NavItem[] = [
  { href: '/dashboard', label: 'Home', icon: Home },
  { href: '/dashboard/listings', label: 'Listings', icon: Building2 },
  { href: '/dashboard/applications', label: 'Apps', icon: FileText },
  { href: '/dashboard/leases', label: 'Leases', icon: FileText },
  { href: '/dashboard/notifications', label: 'Alerts', icon: Bell },
];

const agentNavItems: NavItem[] = [
  { href: '/dashboard', label: 'Home', icon: Home },
  { href: '/dashboard/listings', label: 'Listings', icon: Building2 },
  { href: '/dashboard/leads', label: 'Leads', icon: Users },
  { href: '/dashboard/tours', label: 'Tours', icon: Calendar },
  { href: '/dashboard/notifications', label: 'Alerts', icon: Bell },
];

const investorNavItems: NavItem[] = [
  { href: '/dashboard', label: 'Home', icon: Home },
  { href: '/dashboard/portfolio', label: 'Portfolio', icon: Briefcase },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/dashboard/deals', label: 'Deals', icon: Building2 },
  { href: '/dashboard/notifications', label: 'Alerts', icon: Bell },
];

const navItemsByRole: Record<string, NavItem[]> = {
  TENANT: tenantNavItems,
  LANDLORD: landlordNavItems,
  AGENT: agentNavItems,
  INVESTOR: investorNavItems,
  ADMIN: landlordNavItems,
};

export function MobileBottomNav() {
  const pathname = usePathname();
  const { user, isAuthenticated } = useAuth();
  const unreadCount = useUnreadNotificationCount();

  const navItems = isAuthenticated && user
    ? navItemsByRole[user.role] || tenantNavItems
    : publicNavItems;

  // Don't show on auth pages
  if (pathname === '/login' || pathname === '/register') {
    return null;
  }

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-surface-200 pb-safe-bottom">
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const isActive = pathname === item.href || 
            (item.href !== '/' && item.href !== '/dashboard' && pathname.startsWith(item.href));
          const Icon = item.icon;
          const isNotification = item.label === 'Alerts';

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center gap-1 w-full h-full min-w-touch px-2 relative',
                'transition-colors active:bg-surface-100',
                isActive ? 'text-luxury-bronze' : 'text-surface-500'
              )}
            >
              <span className="relative">
                <Icon className="h-5 w-5" />
                {isNotification && unreadCount && unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </span>
              <span className={cn(
                'text-[10px] font-medium',
                isActive ? 'text-luxury-bronze' : 'text-surface-500'
              )}>
                {item.label}
              </span>
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-luxury-bronze rounded-full" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
