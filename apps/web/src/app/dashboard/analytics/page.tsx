'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  Building2,
  Eye,
  Calendar,
  Clock,
  ArrowRight,
  Download,
  RefreshCw,
  Loader2,
  BarChart3,
  PieChart,
  Activity,
  Target,
  MessageSquare,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Header } from '@/components/layout/header';
import { cn, formatCurrency } from '@/lib/utils';
import { useRequireAuth } from '@/hooks';
import { useAuthStore } from '@/stores/auth';

interface MetricData {
  current: number;
  previous: number;
  change: number;
}

interface AnalyticsData {
  overview: {
    totalListings: MetricData;
    activeListings: MetricData;
    totalViews: MetricData;
    totalInquiries: MetricData;
    avgDaysOnMarket: MetricData;
    conversionRate: MetricData;
  };
  revenue: {
    totalRevenue: number;
    projectedRevenue: number;
    avgRent: number;
    occupancyRate: number;
  };
  listings: {
    id: string;
    title: string;
    views: number;
    inquiries: number;
    daysOnMarket: number;
    status: string;
  }[];
  activity: {
    date: string;
    views: number;
    inquiries: number;
    applications: number;
  }[];
}

const MOCK_ANALYTICS: AnalyticsData = {
  overview: {
    totalListings: { current: 12, previous: 10, change: 20 },
    activeListings: { current: 8, previous: 7, change: 14.3 },
    totalViews: { current: 4523, previous: 3890, change: 16.3 },
    totalInquiries: { current: 187, previous: 156, change: 19.9 },
    avgDaysOnMarket: { current: 18, previous: 24, change: -25 },
    conversionRate: { current: 4.1, previous: 3.8, change: 7.9 },
  },
  revenue: {
    totalRevenue: 42500,
    projectedRevenue: 51000,
    avgRent: 4250,
    occupancyRate: 87.5,
  },
  listings: [
    { id: '1', title: '245 East 72nd Street, 4B', views: 856, inquiries: 42, daysOnMarket: 12, status: 'active' },
    { id: '2', title: '156 North 6th Street, 2A', views: 723, inquiries: 38, daysOnMarket: 8, status: 'active' },
    { id: '3', title: '89 Greenwich Street, 12F', views: 645, inquiries: 31, daysOnMarket: 15, status: 'active' },
    { id: '4', title: '42-15 Crescent Street, 8C', views: 512, inquiries: 24, daysOnMarket: 22, status: 'active' },
    { id: '5', title: '312 Park Place, 1', views: 489, inquiries: 19, daysOnMarket: 28, status: 'pending' },
  ],
  activity: [
    { date: '2024-12-09', views: 145, inquiries: 8, applications: 2 },
    { date: '2024-12-10', views: 178, inquiries: 12, applications: 3 },
    { date: '2024-12-11', views: 156, inquiries: 9, applications: 1 },
    { date: '2024-12-12', views: 203, inquiries: 15, applications: 4 },
    { date: '2024-12-13', views: 189, inquiries: 11, applications: 2 },
    { date: '2024-12-14', views: 167, inquiries: 10, applications: 3 },
    { date: '2024-12-15', views: 142, inquiries: 7, applications: 1 },
  ],
};

function MetricCard({
  title,
  value,
  change,
  format = 'number',
  icon: Icon,
  iconColor = 'text-luxury-bronze',
  iconBg = 'bg-luxury-champagne',
}: {
  title: string;
  value: number;
  change: number;
  format?: 'number' | 'currency' | 'percent' | 'days';
  icon: React.ElementType;
  iconColor?: string;
  iconBg?: string;
}) {
  const formatValue = () => {
    switch (format) {
      case 'currency': return formatCurrency(value);
      case 'percent': return `${value.toFixed(1)}%`;
      case 'days': return `${value} days`;
      default: return value.toLocaleString();
    }
  };

  const isPositive = format === 'days' ? change < 0 : change > 0;
  const absChange = Math.abs(change);

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className={cn('p-2 rounded-lg', iconBg)}>
            <Icon className={cn('h-5 w-5', iconColor)} />
          </div>
          <div className={cn('flex items-center gap-1 text-sm font-medium', isPositive ? 'text-emerald-600' : 'text-red-600')}>
            {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            {absChange.toFixed(1)}%
          </div>
        </div>
        <div className="mt-4">
          <p className="text-sm text-surface-500">{title}</p>
          <p className="text-2xl font-bold text-surface-900 mt-1">{formatValue()}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ActivityChart({ data }: { data: AnalyticsData['activity'] }) {
  const maxViews = Math.max(...data.map(d => d.views));
  
  return (
    <div className="space-y-3">
      {data.map((day, index) => (
        <div key={day.date} className="flex items-center gap-4">
          <div className="w-20 text-xs text-surface-500">
            {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </div>
          <div className="flex-1 flex items-center gap-2">
            <div className="flex-1 h-6 bg-surface-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-luxury-gold to-luxury-bronze rounded-full transition-all"
                style={{ width: `${(day.views / maxViews) * 100}%` }}
              />
            </div>
            <div className="w-16 text-right">
              <span className="text-sm font-medium text-surface-900">{day.views}</span>
              <span className="text-xs text-surface-500 ml-1">views</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TopListingsTable({ listings }: { listings: AnalyticsData['listings'] }) {
  return (
    <div className="space-y-3">
      {listings.map((listing, index) => (
        <div key={listing.id} className="flex items-center gap-4 p-3 bg-surface-50 rounded-lg">
          <div className="w-8 h-8 rounded-full bg-surface-200 flex items-center justify-center text-sm font-bold text-surface-600">
            {index + 1}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-surface-900 truncate">{listing.title}</p>
            <div className="flex items-center gap-4 mt-1 text-xs text-surface-500">
              <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{listing.views} views</span>
              <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{listing.inquiries} inquiries</span>
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{listing.daysOnMarket} days</span>
            </div>
          </div>
          <Badge variant={listing.status === 'active' ? 'success' : 'default'} className="text-xs">
            {listing.status}
          </Badge>
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const router = useRouter();
  const { isLoading: authLoading } = useRequireAuth();
  const { user } = useAuthStore();

  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | '12m'>('30d');
  const [analytics] = useState<AnalyticsData>(MOCK_ANALYTICS);

  if (authLoading) {
    return <div className="min-h-screen bg-surface-50 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-luxury-gold" /></div>;
  }

  return (
    <div className="min-h-screen bg-surface-50">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-surface-900">Analytics</h1>
            <p className="text-surface-600 mt-1">Track your listings performance and insights</p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={timeRange} onValueChange={(v) => setTimeRange(v as typeof timeRange)}>
              <SelectTrigger className="w-36"><Calendar className="h-4 w-4 mr-2" /><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
                <SelectItem value="12m">Last 12 months</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline"><Download className="h-4 w-4 mr-2" />Export</Button>
            <Button variant="outline" size="icon"><RefreshCw className="h-4 w-4" /></Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <MetricCard title="Total Listings" value={analytics.overview.totalListings.current} change={analytics.overview.totalListings.change} icon={Building2} />
          <MetricCard title="Active Listings" value={analytics.overview.activeListings.current} change={analytics.overview.activeListings.change} icon={Activity} iconColor="text-emerald-600" iconBg="bg-emerald-100" />
          <MetricCard title="Total Views" value={analytics.overview.totalViews.current} change={analytics.overview.totalViews.change} icon={Eye} iconColor="text-blue-600" iconBg="bg-blue-100" />
          <MetricCard title="Inquiries" value={analytics.overview.totalInquiries.current} change={analytics.overview.totalInquiries.change} icon={MessageSquare} iconColor="text-purple-600" iconBg="bg-purple-100" />
          <MetricCard title="Avg. Days on Market" value={analytics.overview.avgDaysOnMarket.current} change={analytics.overview.avgDaysOnMarket.change} format="days" icon={Clock} iconColor="text-amber-600" iconBg="bg-amber-100" />
          <MetricCard title="Conversion Rate" value={analytics.overview.conversionRate.current} change={analytics.overview.conversionRate.change} format="percent" icon={Target} iconColor="text-rose-600" iconBg="bg-rose-100" />
        </div>

        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-luxury-bronze" />Daily Activity</CardTitle>
              <CardDescription>Views, inquiries, and applications over time</CardDescription>
            </CardHeader>
            <CardContent><ActivityChart data={analytics.activity} /></CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5 text-emerald-600" />Revenue</CardTitle>
              <CardDescription>Monthly revenue and projections</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-emerald-50 rounded-xl">
                <p className="text-sm text-emerald-700">Current Revenue</p>
                <p className="text-3xl font-bold text-emerald-700">{formatCurrency(analytics.revenue.totalRevenue)}</p>
                <p className="text-xs text-emerald-600 mt-1">This month</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-surface-500">Projected</p>
                  <p className="text-lg font-semibold text-surface-900">{formatCurrency(analytics.revenue.projectedRevenue)}</p>
                </div>
                <div>
                  <p className="text-xs text-surface-500">Avg. Rent</p>
                  <p className="text-lg font-semibold text-surface-900">{formatCurrency(analytics.revenue.avgRent)}</p>
                </div>
              </div>
              <div className="pt-4 border-t">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-surface-600">Occupancy Rate</span>
                  <span className="text-sm font-semibold text-surface-900">{analytics.revenue.occupancyRate}%</span>
                </div>
                <div className="h-2 bg-surface-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full" style={{ width: `${analytics.revenue.occupancyRate}%` }} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-luxury-bronze" />Top Performing Listings</CardTitle>
              <CardDescription>Your most viewed listings this period</CardDescription>
            </div>
            <Button variant="ghost" size="sm" className="text-luxury-bronze">View All<ArrowRight className="h-4 w-4 ml-1" /></Button>
          </CardHeader>
          <CardContent><TopListingsTable listings={analytics.listings} /></CardContent>
        </Card>
      </main>
    </div>
  );
}
