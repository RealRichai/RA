'use client';

import * as React from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate, getStatusColor } from '@/lib/utils';
import api from '@/lib/api-client';
import type { Listing, Application, Lease, Payment, Tour } from '@/types';
import {
  Building2,
  FileText,
  Scroll,
  CreditCard,
  Calendar,
  TrendingUp,
  Clock,
  AlertCircle,
  Plus,
  ArrowRight,
} from 'lucide-react';

export default function DashboardPage() {
  const { user, isLandlord, isAgent, isTenant } = useAuth();
  const [stats, setStats] = React.useState({
    activeListings: 0,
    pendingApplications: 0,
    activeLeases: 0,
    pendingPayments: 0,
    upcomingTours: 0,
  });
  const [recentItems, setRecentItems] = React.useState<{
    listings: Listing[];
    applications: Application[];
    payments: Payment[];
    tours: Tour[];
  }>({
    listings: [],
    applications: [],
    payments: [],
    tours: [],
  });
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function loadDashboardData() {
      try {
        const [listingsRes, applicationsRes, leasesRes, paymentsRes, toursRes] = await Promise.all([
          api.getMyListings({ status: 'ACTIVE', limit: 5 }).catch(() => ({ listings: [], total: 0 })),
          api.getMyApplications({ limit: 5 }).catch(() => ({ applications: [], total: 0 })),
          api.getMyLeases({ status: 'ACTIVE' }).catch(() => ({ leases: [], total: 0 })),
          api.getMyPayments({ status: 'PENDING', limit: 5 }).catch(() => ({ payments: [], total: 0 })),
          api.getUpcomingTours(7).catch(() => ({ tours: [] })),
        ]);

        setStats({
          activeListings: listingsRes.total || 0,
          pendingApplications: applicationsRes.total || 0,
          activeLeases: leasesRes.total || 0,
          pendingPayments: paymentsRes.total || 0,
          upcomingTours: toursRes.tours?.length || 0,
        });

        setRecentItems({
          listings: listingsRes.listings || [],
          applications: applicationsRes.applications || [],
          payments: paymentsRes.payments || [],
          tours: toursRes.tours || [],
        });
      } catch (error) {
        console.error('Failed to load dashboard data:', error);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-muted-foreground">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Welcome header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-semibold">
            Welcome back, {user?.firstName}
          </h1>
          <p className="text-muted-foreground mt-1">
            Here&apos;s what&apos;s happening with your properties today.
          </p>
        </div>
        {(isLandlord || isAgent) && (
          <Link href="/dashboard/listings/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Listing
            </Button>
          </Link>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <StatCard
          title="Active Listings"
          value={stats.activeListings}
          icon={Building2}
          href="/dashboard/listings"
        />
        <StatCard
          title="Applications"
          value={stats.pendingApplications}
          icon={FileText}
          href="/dashboard/applications"
        />
        <StatCard
          title="Active Leases"
          value={stats.activeLeases}
          icon={Scroll}
          href="/dashboard/leases"
        />
        <StatCard
          title="Pending Payments"
          value={stats.pendingPayments}
          icon={CreditCard}
          href="/dashboard/payments"
          alert={stats.pendingPayments > 0}
        />
        <StatCard
          title="Upcoming Tours"
          value={stats.upcomingTours}
          icon={Calendar}
          href="/dashboard/tours"
        />
      </div>

      {/* Content grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Applications */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Recent Applications</CardTitle>
            <Link href="/dashboard/applications">
              <Button variant="ghost" size="sm">
                View All <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {recentItems.applications.length === 0 ? (
              <p className="text-muted-foreground text-sm">No recent applications</p>
            ) : (
              <div className="space-y-3">
                {recentItems.applications.slice(0, 4).map((app) => (
                  <Link
                    key={app.id}
                    href={`/dashboard/applications/${app.id}`}
                    className="flex items-center justify-between p-3 rounded-md hover:bg-muted transition-colors"
                  >
                    <div>
                      <p className="font-medium text-sm">
                        {app.listing?.address || 'Unknown Property'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(app.createdAt)}
                      </p>
                    </div>
                    <Badge className={getStatusColor(app.status)}>
                      {app.status.replace(/_/g, ' ')}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pending Payments */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Pending Payments</CardTitle>
            <Link href="/dashboard/payments">
              <Button variant="ghost" size="sm">
                View All <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {recentItems.payments.length === 0 ? (
              <p className="text-muted-foreground text-sm">No pending payments</p>
            ) : (
              <div className="space-y-3">
                {recentItems.payments.slice(0, 4).map((payment) => (
                  <Link
                    key={payment.id}
                    href={`/dashboard/payments/${payment.id}`}
                    className="flex items-center justify-between p-3 rounded-md hover:bg-muted transition-colors"
                  >
                    <div>
                      <p className="font-medium text-sm">
                        {payment.type.replace(/_/g, ' ')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Due {formatDate(payment.dueDate)}
                      </p>
                    </div>
                    <span className="font-semibold">
                      {formatCurrency(payment.amount)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Tours */}
        {(isLandlord || isAgent) && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Upcoming Tours</CardTitle>
              <Link href="/dashboard/tours">
                <Button variant="ghost" size="sm">
                  View All <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {recentItems.tours.length === 0 ? (
                <p className="text-muted-foreground text-sm">No upcoming tours</p>
              ) : (
                <div className="space-y-3">
                  {recentItems.tours.slice(0, 4).map((tour) => (
                    <Link
                      key={tour.id}
                      href={`/dashboard/tours/${tour.id}`}
                      className="flex items-center justify-between p-3 rounded-md hover:bg-muted transition-colors"
                    >
                      <div>
                        <p className="font-medium text-sm">
                          {tour.listing?.address || 'Unknown Property'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(tour.scheduledAt, {
                            weekday: 'short',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                      <Badge className={getStatusColor(tour.status)}>
                        {tour.status}
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Recent Listings */}
        {(isLandlord || isAgent) && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Your Listings</CardTitle>
              <Link href="/dashboard/listings">
                <Button variant="ghost" size="sm">
                  View All <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {recentItems.listings.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-muted-foreground text-sm mb-4">No listings yet</p>
                  <Link href="/dashboard/listings/new">
                    <Button variant="outline" size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Listing
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentItems.listings.slice(0, 4).map((listing) => (
                    <Link
                      key={listing.id}
                      href={`/dashboard/listings/${listing.id}`}
                      className="flex items-center justify-between p-3 rounded-md hover:bg-muted transition-colors"
                    >
                      <div>
                        <p className="font-medium text-sm">{listing.address}</p>
                        <p className="text-xs text-muted-foreground">
                          {listing.bedrooms} BR &bull; {formatCurrency(listing.rentPrice || 0)}/mo
                        </p>
                      </div>
                      <Badge className={getStatusColor(listing.status)}>
                        {listing.status}
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  href,
  alert,
}: {
  title: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  alert?: boolean;
}) {
  return (
    <Link href={href}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">{title}</p>
              <p className="text-3xl font-bold mt-1">{value}</p>
            </div>
            <div className={`p-3 rounded-full ${alert ? 'bg-destructive/10' : 'bg-muted'}`}>
              <Icon className={`h-6 w-6 ${alert ? 'text-destructive' : 'text-muted-foreground'}`} />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
