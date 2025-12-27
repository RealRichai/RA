'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Menu,
  X,
  Search,
  Heart,
  ChevronDown,
  Home,
  Building2,
  FileText,
  Calendar,
  Users,
  BarChart3,
  Settings,
  LogOut,
  Bell,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/avatar';
import { NotificationDropdown } from '@/components/ui/notification-dropdown';
import { useAuth, useUnreadNotificationCount } from '@/hooks';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const publicNavItems = [
  { href: '/listings', label: 'Browse Rentals', icon: Search },
  { href: '/commercial', label: 'Commercial', icon: Building2 },
  { href: '/agents', label: 'Find an Agent', icon: Users },
  { href: '/landlords', label: 'For Landlords', icon: Building2 },
  { href: '/investors', label: 'For Investors', icon: BarChart3 },
];

const dashboardNavItems: Record<string, { href: string; label: string; icon: React.ElementType }[]> = {
  TENANT: [
    { href: '/dashboard', label: 'Dashboard', icon: Home },
    { href: '/dashboard/saved', label: 'Saved Listings', icon: Heart },
    { href: '/dashboard/applications', label: 'Applications', icon: FileText },
    { href: '/dashboard/tours', label: 'Tours', icon: Calendar },
  ],
  LANDLORD: [
    { href: '/dashboard', label: 'Dashboard', icon: Home },
    { href: '/dashboard/listings', label: 'My Listings', icon: Building2 },
    { href: '/dashboard/applications', label: 'Applications', icon: FileText },
    { href: '/dashboard/tours', label: 'Tours', icon: Calendar },
    { href: '/dashboard/leases', label: 'Leases', icon: FileText },
  ],
  AGENT: [
    { href: '/dashboard', label: 'Dashboard', icon: Home },
    { href: '/dashboard/listings', label: 'Listings', icon: Building2 },
    { href: '/dashboard/leads', label: 'Leads', icon: Users },
    { href: '/dashboard/tours', label: 'Tours', icon: Calendar },
    { href: '/dashboard/analytics', label: 'Performance', icon: BarChart3 },
  ],
  INVESTOR: [
    { href: '/dashboard', label: 'Dashboard', icon: Home },
    { href: '/dashboard/deals', label: 'Deals', icon: Building2 },
    { href: '/dashboard/portfolio', label: 'Portfolio', icon: BarChart3 },
    { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
  ],
  ADMIN: [
    { href: '/dashboard', label: 'Dashboard', icon: Home },
    { href: '/dashboard/users', label: 'Users', icon: Users },
    { href: '/dashboard/listings', label: 'All Listings', icon: Building2 },
    { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
    { href: '/dashboard/settings', label: 'Settings', icon: Settings },
  ],
};

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, isAuthenticated, logout, isLoading } = useAuth();
  const unreadCount = useUnreadNotificationCount();
  const pathname = usePathname();
  const isDashboard = pathname.startsWith('/dashboard');

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  const navItems = isDashboard && user
    ? dashboardNavItems[user.role] || dashboardNavItems.TENANT
    : publicNavItems;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-surface-100 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="container-wide">
        <div className="flex h-14 sm:h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 flex-shrink-0">
            <div className="h-8 w-8 rounded-lg bg-gradient-luxury flex items-center justify-center">
              <span className="text-white font-bold text-sm">RR</span>
            </div>
            <span className="font-display text-lg sm:text-xl font-bold text-surface-900 hidden xs:block">
              RealRiches
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-1">
            {isDashboard && user ? (
              navItems.map((item) => {
                const Icon = 'icon' in item ? item.icon : null;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-luxury-champagne/50 text-luxury-bronze'
                        : 'text-surface-600 hover:text-surface-900 hover:bg-surface-100'
                    )}
                  >
                    {Icon && <Icon className="h-4 w-4" />}
                    {item.label}
                  </Link>
                );
              })
            ) : (
              publicNavItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'px-4 py-2 text-sm font-medium transition-colors',
                    pathname === item.href
                      ? 'text-surface-900'
                      : 'text-surface-600 hover:text-surface-900'
                  )}
                >
                  {item.label}
                </Link>
              ))
            )}
          </nav>

          {/* Right Side Actions */}
          <div className="flex items-center gap-1 sm:gap-2">
            {isLoading ? (
              <div className="h-10 w-20 bg-surface-100 rounded-xl animate-pulse" />
            ) : isAuthenticated && user ? (
              <>
                {/* Desktop: Search Button */}
                <Button variant="ghost" size="icon" className="hidden sm:flex" asChild>
                  <Link href="/listings">
                    <Search className="h-5 w-5" />
                  </Link>
                </Button>

                {/* Desktop: Saved Listings */}
                <Button variant="ghost" size="icon" className="hidden sm:flex" asChild>
                  <Link href="/dashboard/saved">
                    <Heart className="h-5 w-5" />
                  </Link>
                </Button>

                {/* Desktop: Notifications Dropdown */}
                <div className="hidden sm:block">
                  <NotificationDropdown />
                </div>

                {/* Mobile: Notification Icon with Badge */}
                <Button variant="ghost" size="icon" className="sm:hidden relative" asChild>
                  <Link href="/dashboard/notifications">
                    <Bell className="h-5 w-5" />
                    {unreadCount && unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-medium">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </Link>
                </Button>

                {/* User Menu - Desktop */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="gap-2 pl-2 pr-3 hidden sm:flex">
                      <UserAvatar user={user} size="sm" />
                      <span className="hidden md:block text-sm font-medium max-w-[100px] truncate">
                        {user.firstName}
                      </span>
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>
                      <div className="flex flex-col">
                        <span>{user.firstName} {user.lastName}</span>
                        <span className="text-xs font-normal text-surface-500 truncate">{user.email}</span>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/dashboard">
                        <Home className="mr-2 h-4 w-4" />
                        Dashboard
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/dashboard/settings">
                        <Settings className="mr-2 h-4 w-4" />
                        Settings
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => logout()} className="text-red-600">
                      <LogOut className="mr-2 h-4 w-4" />
                      Log out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" className="hidden sm:flex" asChild>
                  <Link href="/login">Log in</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link href="/register">
                    <span className="hidden xs:inline">Get Started</span>
                    <span className="xs:hidden">Join</span>
                  </Link>
                </Button>
              </>
            )}

            {/* Mobile Menu Button */}
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Menu - Full Screen Overlay */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 top-14 sm:top-16 z-50 bg-white overflow-y-auto">
          <div className="container-wide py-4">
            {/* User Info Card (if authenticated) */}
            {isAuthenticated && user && (
              <div className="mb-4 p-4 bg-surface-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <UserAvatar user={user} size="lg" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-surface-900 truncate">
                      {user.firstName} {user.lastName}
                    </p>
                    <p className="text-sm text-surface-500 truncate">{user.email}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Quick Actions (if authenticated) */}
            {isAuthenticated && user && (
              <div className="grid grid-cols-3 gap-2 mb-4">
                <Link
                  href="/listings"
                  className="flex flex-col items-center gap-2 p-3 bg-surface-50 rounded-xl hover:bg-surface-100 transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Search className="h-5 w-5 text-surface-600" />
                  <span className="text-xs font-medium text-surface-600">Search</span>
                </Link>
                <Link
                  href="/dashboard/saved"
                  className="flex flex-col items-center gap-2 p-3 bg-surface-50 rounded-xl hover:bg-surface-100 transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Heart className="h-5 w-5 text-surface-600" />
                  <span className="text-xs font-medium text-surface-600">Saved</span>
                </Link>
                <Link
                  href="/dashboard/notifications"
                  className="flex flex-col items-center gap-2 p-3 bg-surface-50 rounded-xl hover:bg-surface-100 transition-colors relative"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Bell className="h-5 w-5 text-surface-600" />
                  {unreadCount && unreadCount > 0 && (
                    <span className="absolute top-2 right-1/4 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-medium">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                  <span className="text-xs font-medium text-surface-600">Alerts</span>
                </Link>
              </div>
            )}

            {/* Navigation Links */}
            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = 'icon' in item ? item.icon : null;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center justify-between px-4 py-3.5 rounded-xl text-base font-medium transition-colors',
                      isActive
                        ? 'bg-luxury-champagne/50 text-luxury-bronze'
                        : 'text-surface-700 hover:bg-surface-100 active:bg-surface-200'
                    )}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <span className="flex items-center gap-3">
                      {Icon && <Icon className="h-5 w-5" />}
                      {item.label}
                    </span>
                    <ChevronRight className="h-5 w-5 text-surface-400" />
                  </Link>
                );
              })}
            </nav>

            {/* Settings & Logout (if authenticated) */}
            {isAuthenticated && user && (
              <>
                <div className="my-4 border-t border-surface-200" />
                <nav className="space-y-1">
                  <Link
                    href="/dashboard/settings"
                    className="flex items-center justify-between px-4 py-3.5 rounded-xl text-base font-medium text-surface-700 hover:bg-surface-100 active:bg-surface-200 transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <span className="flex items-center gap-3">
                      <Settings className="h-5 w-5" />
                      Settings
                    </span>
                    <ChevronRight className="h-5 w-5 text-surface-400" />
                  </Link>
                  <button
                    onClick={() => {
                      logout();
                      setMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl text-base font-medium text-red-600 hover:bg-red-50 active:bg-red-100 transition-colors"
                  >
                    <span className="flex items-center gap-3">
                      <LogOut className="h-5 w-5" />
                      Log out
                    </span>
                  </button>
                </nav>
              </>
            )}

            {/* Auth Buttons (if not authenticated) */}
            {!isAuthenticated && (
              <div className="mt-6 space-y-3">
                <Button variant="outline" className="w-full h-12 text-base" asChild>
                  <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
                    Log in
                  </Link>
                </Button>
                <Button className="w-full h-12 text-base" asChild>
                  <Link href="/register" onClick={() => setMobileMenuOpen(false)}>
                    Get Started
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
