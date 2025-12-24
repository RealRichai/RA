'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Users,
  Building2,
  FileText,
  DollarSign,
  Activity,
  CheckCircle,
  AlertTriangle,
  XCircle,
  TrendingUp,
  Clock,
} from 'lucide-react';

const mockStats = {
  users: {
    total: 1847,
    active: 1523,
    pending: 124,
    suspended: 12,
    newThisMonth: 156,
  },
  listings: {
    total: 892,
    active: 654,
    draft: 89,
    rented: 149,
  },
  applications: {
    total: 423,
    pending: 87,
    approved: 298,
    denied: 38,
  },
  revenue: {
    thisMonth: 245000,
    lastMonth: 218000,
    growth: 12.4,
  },
  integrations: {
    total: 8,
    configured: 4,
    partial: 2,
    notConfigured: 2,
  },
};

const recentActivity = [
  { id: 1, action: 'User registered', user: 'jennifer.martinez@email.com', time: '2 min ago', type: 'user' },
  { id: 2, action: 'Feature flag enabled', user: 'admin@realriches.com', time: '15 min ago', type: 'feature' },
  { id: 3, action: 'Market updated', user: 'admin@realriches.com', time: '1 hour ago', type: 'market' },
  { id: 4, action: 'Integration configured', user: 'admin@realriches.com', time: '2 hours ago', type: 'integration' },
  { id: 5, action: 'User suspended', user: 'admin@realriches.com', time: '3 hours ago', type: 'user' },
];

const systemHealth = [
  { name: 'API Server', status: 'healthy', latency: '45ms' },
  { name: 'Database', status: 'healthy', latency: '12ms' },
  { name: 'Redis Cache', status: 'healthy', latency: '3ms' },
  { name: 'SendGrid', status: 'partial', latency: '--' },
  { name: 'Twilio', status: 'not-configured', latency: '--' },
];

export default function AdminOverviewPage() {
  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockStats.users.total.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              <span className="text-green-600">+{mockStats.users.newThisMonth}</span> this month
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Listings</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockStats.listings.active}</div>
            <p className="text-xs text-muted-foreground">
              {mockStats.listings.draft} drafts, {mockStats.listings.rented} rented
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pending Applications</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockStats.applications.pending}</div>
            <p className="text-xs text-muted-foreground">
              {mockStats.applications.total} total applications
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${(mockStats.revenue.thisMonth / 1000).toFixed(0)}K</div>
            <p className="text-xs text-muted-foreground">
              <span className="text-green-600">+{mockStats.revenue.growth}%</span> from last month
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* System Health */}
        <Card>
          <CardHeader>
            <CardTitle>System Health</CardTitle>
            <CardDescription>Status of platform services and integrations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {systemHealth.map((service) => (
                <div key={service.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {service.status === 'healthy' && (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    )}
                    {service.status === 'partial' && (
                      <AlertTriangle className="h-5 w-5 text-amber-500" />
                    )}
                    {service.status === 'not-configured' && (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                    <span className="font-medium">{service.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {service.latency !== '--' && (
                      <span className="text-sm text-muted-foreground">{service.latency}</span>
                    )}
                    <Badge
                      variant={
                        service.status === 'healthy' ? 'default' :
                        service.status === 'partial' ? 'secondary' : 'destructive'
                      }
                    >
                      {service.status === 'healthy' ? 'Healthy' :
                       service.status === 'partial' ? 'Partial' : 'Not Configured'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest administrative actions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.map((activity) => (
                <div key={activity.id} className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      <Activity className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium">{activity.action}</p>
                      <p className="text-sm text-muted-foreground">{activity.user}</p>
                    </div>
                  </div>
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {activity.time}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* User Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>User Distribution by Role</CardTitle>
          <CardDescription>Breakdown of registered users</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { role: 'Tenants', count: 1245, color: 'bg-blue-500' },
              { role: 'Landlords', count: 342, color: 'bg-green-500' },
              { role: 'Agents', count: 189, color: 'bg-purple-500' },
              { role: 'Investors', count: 58, color: 'bg-amber-500' },
              { role: 'Admins', count: 13, color: 'bg-red-500' },
            ].map((item) => (
              <div key={item.role} className="text-center">
                <div className={`mx-auto mb-2 h-2 w-full rounded-full ${item.color}`} />
                <p className="text-2xl font-bold">{item.count}</p>
                <p className="text-sm text-muted-foreground">{item.role}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Integration Status */}
      <Card>
        <CardHeader>
          <CardTitle>Integration Status</CardTitle>
          <CardDescription>Third-party service configuration status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="text-center p-4 bg-green-50 dark:bg-green-950 rounded-lg">
              <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
              <p className="text-2xl font-bold">{mockStats.integrations.configured}</p>
              <p className="text-sm text-muted-foreground">Fully Configured</p>
            </div>
            <div className="text-center p-4 bg-amber-50 dark:bg-amber-950 rounded-lg">
              <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
              <p className="text-2xl font-bold">{mockStats.integrations.partial}</p>
              <p className="text-sm text-muted-foreground">Partially Configured</p>
            </div>
            <div className="text-center p-4 bg-red-50 dark:bg-red-950 rounded-lg">
              <XCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
              <p className="text-2xl font-bold">{mockStats.integrations.notConfigured}</p>
              <p className="text-sm text-muted-foreground">Not Configured</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
