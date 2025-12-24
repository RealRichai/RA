'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Users,
  Flag,
  MapPin,
  Settings,
  Shield,
  Plug,
  FileText,
  BarChart3,
} from 'lucide-react';

interface AdminLayoutProps {
  children: ReactNode;
}

const adminNavItems = [
  { href: '/admin', label: 'Overview', icon: BarChart3 },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/feature-flags', label: 'Feature Flags', icon: Flag },
  { href: '/admin/markets', label: 'Markets', icon: MapPin },
  { href: '/admin/integrations', label: 'Integrations', icon: Plug },
  { href: '/admin/audit-log', label: 'Audit Log', icon: FileText },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];

export default function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      {/* Admin Header */}
      <div className="flex items-center gap-2 border-b pb-4">
        <Shield className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold">Admin Panel</h1>
      </div>

      {/* Admin Navigation */}
      <div className="flex flex-wrap gap-2 border-b pb-4">
        {adminNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </div>

      {/* Admin Content */}
      {children}
    </div>
  );
}
