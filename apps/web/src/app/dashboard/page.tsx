'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Home,
  Building2,
  FileText,
  Calendar,
  Heart,
  Users,
  BarChart3,
  Settings,
  Plus,
  TrendingUp,
  DollarSign,
  Clock,
  Search,
} from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UserAvatar } from '@/components/ui/avatar';
import { cn, formatCurrency, formatDate, formatRelativeTime } from '@/lib/utils';
import { useAuth, useRequireAuth, useMyApplications, useMyTours, useSavedListings } from '@/hooks';
import { useAuthStore, isLandlord, isTenant, isAgent, isInvestor } from '@/stores/auth';

function StatCard({ title, value, change, icon: Icon, trend }: {
  title: string;
  value: string | number;
  change?: string;
  icon: React.ElementType;
  trend?: 'up' | 'down' | 'neutral';
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-surface-500 mb-1">{title}</p>
            <p className="text-3xl font-display font-bold text-surface-900">{value}</p>
            {change && (
              <p className={cn(
                'text-sm mt-1 flex items-center gap-1',
                trend === 'up' && 'text-emerald-600',
                trend === 'down' && 'text-red-600',
                trend === 'neutral' && 'text-surface-500'
              )}>
                {trend === 'up' && <TrendingUp className="h-3 w-3" />}
                {change}
              </p>
            )}
          </div>
          <div className="h-12 w-12 rounded-xl bg-luxury-champagne/50 flex items-center justify-center">
            <Icon className="h-6 w-6 text-luxury-bronze" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TenantDashboard() {
  const { data: applications } = useMyApplications();
  const { data: tours } = useMyTours();
  const { data: savedListings } = useSavedListings();

  const pendingApps = applications?.filter(a => ['SUBMITTED', 'UNDER_REVIEW', 'SCREENING'].includes(a.status)).length || 0;
  const upcomingTours = tours?.filter(t => t.status === 'SCHEDULED' || t.status === 'CONFIRMED').length || 0;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-surface-900">Dashboard</h1>
          <p className="text-surface-500">Welcome back! Here's what's happening with your rental search.</p>
        </div>
        <Button asChild>
          <Link href="/listings"><Search className="h-4 w-4 mr-2" />Browse Listings</Link>
        </Button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Saved Listings" value={savedListings?.length || 0} icon={Heart} />
        <StatCard title="Applications" value={applications?.length || 0} icon={FileText} />
        <StatCard title="Pending Review" value={pendingApps} icon={Clock} />
        <StatCard title="Upcoming Tours" value={upcomingTours} icon={Calendar} />
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Applications</CardTitle>
            <Button variant="ghost" size="sm" asChild><Link href="/dashboard/applications">View All</Link></Button>
          </CardHeader>
          <CardContent>
            {applications && applications.length > 0 ? (
              <div className="space-y-4">
                {applications.slice(0, 3).map(app => (
                  <Link key={app.id} href={`/applications/${app.id}`} className="flex items-center justify-between p-4 rounded-xl bg-surface-50 hover:bg-surface-100 transition-colors">
                    <div>
                      <p className="font-medium text-surface-900">{app.listing?.title || 'Listing'}</p>
                      <p className="text-sm text-surface-500">Applied {formatRelativeTime(app.createdAt)}</p>
                    </div>
                    <Badge variant={app.status === 'APPROVED' ? 'success' : app.status === 'DENIED' ? 'error' : 'default'}>{app.status.replace(/_/g, ' ')}</Badge>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <FileText className="h-12 w-12 text-surface-300 mx-auto mb-3" />
                <p className="text-surface-500">No applications yet</p>
                <Button variant="outline" size="sm" className="mt-3" asChild><Link href="/listings">Start Searching</Link></Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Upcoming Tours</CardTitle>
            <Button variant="ghost" size="sm" asChild><Link href="/dashboard/tours">View All</Link></Button>
          </CardHeader>
          <CardContent>
            {tours && tours.length > 0 ? (
              <div className="space-y-4">
                {tours.filter(t => ['SCHEDULED', 'CONFIRMED'].includes(t.status)).slice(0, 3).map(tour => (
                  <div key={tour.id} className="flex items-center justify-between p-4 rounded-xl bg-surface-50">
                    <div>
                      <p className="font-medium text-surface-900">{tour.listing?.title || 'Property Tour'}</p>
                      <p className="text-sm text-surface-500">{formatDate(tour.scheduledAt, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
                    </div>
                    <Badge variant={tour.type === 'SELF_GUIDED' ? 'info' : 'default'}>{tour.type === 'SELF_GUIDED' ? 'Self-Guided' : 'Agent-Led'}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Calendar className="h-12 w-12 text-surface-300 mx-auto mb-3" />
                <p className="text-surface-500">No upcoming tours</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LandlordDashboard() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-surface-900">Landlord Dashboard</h1>
          <p className="text-surface-500">Manage your properties and applications.</p>
        </div>
        <Button asChild><Link href="/dashboard/listings/new"><Plus className="h-4 w-4 mr-2" />Add Listing</Link></Button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Active Listings" value={5} icon={Building2} />
        <StatCard title="New Applications" value={12} change="+3 this week" trend="up" icon={FileText} />
        <StatCard title="Scheduled Tours" value={8} icon={Calendar} />
        <StatCard title="Monthly Revenue" value={formatCurrency(24500)} change="+5.2%" trend="up" icon={DollarSign} />
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Applications</CardTitle>
            <Button variant="ghost" size="sm" asChild><Link href="/dashboard/applications">View All</Link></Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { name: 'Sarah Johnson', property: '123 Bedford Ave, #4B', status: 'SCREENING', time: '2 hours ago' },
                { name: 'Michael Chen', property: '456 Park Place', status: 'UNDER_REVIEW', time: '5 hours ago' },
                { name: 'Emily Davis', property: '789 West End Ave', status: 'SUBMITTED', time: '1 day ago' },
              ].map((app, i) => (
                <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-surface-50">
                  <div className="flex items-center gap-3">
                    <UserAvatar user={{ firstName: app.name.split(' ')[0], lastName: app.name.split(' ')[1] }} />
                    <div>
                      <p className="font-medium text-surface-900">{app.name}</p>
                      <p className="text-sm text-surface-500">{app.property}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant="warning">{app.status.replace(/_/g, ' ')}</Badge>
                    <p className="text-xs text-surface-500 mt-1">{app.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Property Performance</CardTitle>
            <Button variant="ghost" size="sm" asChild><Link href="/dashboard/analytics">View Analytics</Link></Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { address: '123 Bedford Ave, #4B', views: 234, inquiries: 18, status: 'Active' },
                { address: '456 Park Place', views: 156, inquiries: 12, status: 'Active' },
                { address: '789 West End Ave', views: 89, inquiries: 5, status: 'Pending' },
              ].map((prop, i) => (
                <div key={i} className="p-4 rounded-xl bg-surface-50">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium text-surface-900">{prop.address}</p>
                    <Badge variant={prop.status === 'Active' ? 'success' : 'warning'}>{prop.status}</Badge>
                  </div>
                  <div className="flex gap-4 text-sm text-surface-500">
                    <span>{prop.views} views</span>
                    <span>{prop.inquiries} inquiries</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AgentDashboard() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-surface-900">Agent Dashboard</h1>
          <p className="text-surface-500">Track your leads, tours, and performance.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" asChild><Link href="/dashboard/leads">View Leads</Link></Button>
          <Button asChild><Link href="/dashboard/listings/new"><Plus className="h-4 w-4 mr-2" />Add Listing</Link></Button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Active Leads" value={24} change="+5 this week" trend="up" icon={Users} />
        <StatCard title="Tours This Week" value={12} icon={Calendar} />
        <StatCard title="Conversion Rate" value="32%" change="+2.1%" trend="up" icon={TrendingUp} />
        <StatCard title="Commission MTD" value={formatCurrency(8750)} change="+12%" trend="up" icon={DollarSign} />
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        <Card>
          <CardHeader><CardTitle>Today's Schedule</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { time: '10:00 AM', client: 'Jennifer Lee', property: '123 Bedford Ave', type: 'Tour' },
                { time: '12:30 PM', client: 'David Kim', property: '456 Park Place', type: 'Follow-up' },
                { time: '3:00 PM', client: 'Amanda Chen', property: '789 West End Ave', type: 'Tour' },
              ].map((event, i) => (
                <div key={i} className="flex items-center gap-4 p-4 rounded-xl bg-surface-50">
                  <div className="text-center min-w-[60px]">
                    <p className="text-sm font-medium text-luxury-bronze">{event.time}</p>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-surface-900">{event.client}</p>
                    <p className="text-sm text-surface-500">{event.property}</p>
                  </div>
                  <Badge variant={event.type === 'Tour' ? 'gold' : 'default'}>{event.type}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Hot Leads</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { name: 'Marcus Williams', budget: '$3,500', area: 'Brooklyn', score: 92 },
                { name: 'Lisa Park', budget: '$5,000', area: 'Manhattan', score: 88 },
                { name: 'James Rodriguez', budget: '$2,800', area: 'Queens', score: 85 },
              ].map((lead, i) => (
                <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-surface-50">
                  <div className="flex items-center gap-3">
                    <UserAvatar user={{ firstName: lead.name.split(' ')[0], lastName: lead.name.split(' ')[1] }} />
                    <div>
                      <p className="font-medium text-surface-900">{lead.name}</p>
                      <p className="text-sm text-surface-500">{lead.budget} • {lead.area}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-emerald-600">{lead.score}</div>
                    <p className="text-xs text-surface-500">Lead Score</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InvestorDashboard() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-surface-900">Investor Dashboard</h1>
          <p className="text-surface-500">Discover opportunities and track your portfolio.</p>
        </div>
        <Button asChild><Link href="/dashboard/deals"><Search className="h-4 w-4 mr-2" />Find Deals</Link></Button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Portfolio Value" value={formatCurrency(2450000)} change="+8.3% YTD" trend="up" icon={Building2} />
        <StatCard title="Properties" value={6} icon={Home} />
        <StatCard title="Monthly NOI" value={formatCurrency(18500)} change="+3.2%" trend="up" icon={DollarSign} />
        <StatCard title="Avg Cap Rate" value="5.8%" icon={TrendingUp} />
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Hidden Gems</CardTitle>
            <Badge variant="gold">AI-Powered</Badge>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { address: '542 Nostrand Ave, Brooklyn', price: 1250000, cap: '6.2%', score: 94 },
                { address: '18-22 Astoria Blvd, Queens', price: 890000, cap: '5.9%', score: 91 },
                { address: '1847 Grand Concourse, Bronx', price: 750000, cap: '7.1%', score: 88 },
              ].map((deal, i) => (
                <div key={i} className="p-4 rounded-xl bg-surface-50 hover:bg-surface-100 transition-colors cursor-pointer">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-medium text-surface-900">{deal.address}</p>
                      <p className="text-sm text-surface-500">{formatCurrency(deal.price)} • {deal.cap} Cap</p>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-luxury-bronze">{deal.score}</div>
                      <p className="text-xs text-surface-500">Score</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Portfolio Performance</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { address: '123 Atlantic Ave', units: 8, occupancy: '100%', noi: 4200 },
                { address: '456 Flatbush Ave', units: 12, occupancy: '92%', noi: 6800 },
                { address: '789 Jamaica Ave', units: 6, occupancy: '100%', noi: 3500 },
              ].map((prop, i) => (
                <div key={i} className="p-4 rounded-xl bg-surface-50">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium text-surface-900">{prop.address}</p>
                    <Badge variant="success">{prop.occupancy}</Badge>
                  </div>
                  <div className="flex gap-4 text-sm text-surface-500">
                    <span>{prop.units} units</span>
                    <span>{formatCurrency(prop.noi)}/mo NOI</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { isAuthenticated, isLoading } = useRequireAuth();
  const { user } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface-50">
        <Header />
        <main className="container-wide py-8">
          <div className="animate-pulse space-y-8">
            <div className="h-12 w-64 bg-surface-200 rounded" />
            <div className="grid md:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-surface-200 rounded-2xl" />)}
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!isAuthenticated || !user) return null;

  return (
    <div className="min-h-screen bg-surface-50">
      <Header />
      <main className="container-wide py-8">
        {isTenant(user) && <TenantDashboard />}
        {isLandlord(user) && <LandlordDashboard />}
        {isAgent(user) && <AgentDashboard />}
        {isInvestor(user) && <InvestorDashboard />}
      </main>
    </div>
  );
}
