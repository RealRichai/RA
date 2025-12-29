'use client';

import { useQuery } from '@tanstack/react-query';
import { Building, Users, DollarSign, Wrench, TrendingUp, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { formatCurrency } from '@/lib/utils';
import Link from 'next/link';

interface PortfolioData {
  properties: number;
  units: {
    total: number;
    occupied: number;
    vacant: number;
    occupancyRate: number;
  };
  revenue: {
    monthlyPotential: number;
    collected: number;
    collectionRate: number;
  };
  maintenance: {
    openWorkOrders: number;
  };
}

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);

  const { data: portfolioData, isLoading } = useQuery({
    queryKey: ['portfolio'],
    queryFn: async () => {
      const response = await api.get<PortfolioData>('/analytics/portfolio');
      return response.data;
    },
  });

  const stats = [
    {
      name: 'Total Properties',
      value: portfolioData?.properties || 0,
      icon: Building,
      href: '/dashboard/properties',
    },
    {
      name: 'Total Units',
      value: portfolioData?.units.total || 0,
      description: `${portfolioData?.units.occupancyRate || 0}% occupied`,
      icon: Users,
      href: '/dashboard/properties',
    },
    {
      name: 'Monthly Revenue',
      value: formatCurrency(portfolioData?.revenue.collected || 0),
      description: `${portfolioData?.revenue.collectionRate || 0}% collected`,
      icon: DollarSign,
      href: '/dashboard/payments',
    },
    {
      name: 'Open Work Orders',
      value: portfolioData?.maintenance.openWorkOrders || 0,
      icon: Wrench,
      href: '/dashboard/maintenance',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            Welcome back, {user?.firstName}
          </h1>
          <p className="text-muted-foreground">
            Here's what's happening with your portfolio today.
          </p>
        </div>
        <div className="flex gap-4">
          <Link href="/dashboard/properties/new">
            <Button>Add Property</Button>
          </Link>
          <Link href="/dashboard/listings/new">
            <Button variant="outline">Create Listing</Button>
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Link key={stat.name} href={stat.href}>
            <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.name}</CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                {stat.description && (
                  <p className="text-xs text-muted-foreground">{stat.description}</p>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Compliance Alerts
            </CardTitle>
            <CardDescription>
              Stay compliant with local regulations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-950 rounded-lg">
                <div>
                  <p className="font-medium">FARE Act Compliance</p>
                  <p className="text-sm text-muted-foreground">
                    2 listings need review
                  </p>
                </div>
                <Link href="/dashboard/compliance">
                  <Button size="sm" variant="outline">Review</Button>
                </Link>
              </div>
              <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                <div>
                  <p className="font-medium">Good Cause Eviction</p>
                  <p className="text-sm text-muted-foreground">
                    All leases compliant
                  </p>
                </div>
                <span className="text-green-600 text-sm font-medium">Compliant</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-500" />
              Recent Activity
            </CardTitle>
            <CardDescription>
              Latest updates from your portfolio
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <ActivityItem
                title="New inquiry received"
                description="123 Main St, Unit 4B"
                time="2 hours ago"
              />
              <ActivityItem
                title="Rent payment received"
                description="$2,500 from John Doe"
                time="5 hours ago"
              />
              <ActivityItem
                title="Work order completed"
                description="Plumbing repair - Unit 2A"
                time="1 day ago"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-blue-500" />
              Maintenance Queue
            </CardTitle>
            <CardDescription>
              Pending work orders
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <MaintenanceItem
                title="HVAC not working"
                unit="Unit 3C"
                priority="high"
              />
              <MaintenanceItem
                title="Leaky faucet"
                unit="Unit 1A"
                priority="medium"
              />
              <MaintenanceItem
                title="Light fixture replacement"
                unit="Unit 5B"
                priority="low"
              />
            </div>
            <Link href="/dashboard/maintenance">
              <Button variant="link" className="mt-4 p-0">
                View all work orders
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ActivityItem({
  title,
  description,
  time,
}: {
  title: string;
  description: string;
  time: string;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="w-2 h-2 rounded-full bg-primary mt-2" />
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{title}</p>
        <p className="text-sm text-muted-foreground truncate">{description}</p>
      </div>
      <p className="text-xs text-muted-foreground whitespace-nowrap">{time}</p>
    </div>
  );
}

function MaintenanceItem({
  title,
  unit,
  priority,
}: {
  title: string;
  unit: string;
  priority: 'low' | 'medium' | 'high';
}) {
  const priorityColors = {
    low: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
    medium: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
    high: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
  };

  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{unit}</p>
      </div>
      <span
        className={`text-xs font-medium px-2 py-1 rounded-full ${priorityColors[priority]}`}
      >
        {priority}
      </span>
    </div>
  );
}
