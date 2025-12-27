'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { DemoModeState } from '@/components/ui/demo-mode-state';
import {
  Search,
  Filter,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronRight,
  Building2,
  Calendar,
  DollarSign,
} from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, ApplicationStatusBadge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn, formatCurrency, formatDate, formatRelativeTime } from '@/lib/utils';
import { useRequireAuth, useMyApplications } from '@/hooks';
import { useAuthStore, isLandlord, isTenant } from '@/stores/auth';

const statusFilters = [
  { value: 'all', label: 'All Applications' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'UNDER_REVIEW', label: 'Under Review' },
  { value: 'SCREENING', label: 'Screening' },
  { value: 'CONDITIONAL_OFFER', label: 'Conditional Offer' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'DENIED', label: 'Denied' },
];

const mockApplicationsTenant = [
  {
    id: 'app1',
    listing: { id: 'l1', title: 'Stunning 2BR with Manhattan Skyline Views', address: { street: '123 Bedford Ave', unit: '4B', city: 'Brooklyn' }, price: 3500 },
    status: 'UNDER_REVIEW',
    applicationFeeStatus: 'PAID',
    createdAt: '2024-12-10T10:00:00Z',
    updatedAt: '2024-12-12T14:30:00Z',
  },
  {
    id: 'app2',
    listing: { id: 'l2', title: 'Spacious Studio in Historic Brownstone', address: { street: '456 Park Place', city: 'Brooklyn' }, price: 2200 },
    status: 'SCREENING',
    applicationFeeStatus: 'PAID',
    createdAt: '2024-12-08T09:00:00Z',
    updatedAt: '2024-12-11T16:00:00Z',
  },
  {
    id: 'app3',
    listing: { id: 'l3', title: 'Modern 1BR in Astoria', address: { street: '30-15 Steinway St', unit: '3F', city: 'Astoria' }, price: 2400 },
    status: 'APPROVED',
    applicationFeeStatus: 'PAID',
    createdAt: '2024-12-01T11:00:00Z',
    updatedAt: '2024-12-09T10:00:00Z',
  },
];

const mockApplicationsLandlord = [
  {
    id: 'app1',
    tenant: { id: 't1', firstName: 'Sarah', lastName: 'Johnson', email: 'sarah@example.com' },
    listing: { id: 'l1', title: '123 Bedford Ave, #4B', price: 3500 },
    status: 'SUBMITTED',
    employmentInfo: { employer: 'Tech Corp', annualIncome: 120000 },
    createdAt: '2024-12-12T10:00:00Z',
  },
  {
    id: 'app2',
    tenant: { id: 't2', firstName: 'Michael', lastName: 'Chen', email: 'michael@example.com' },
    listing: { id: 'l1', title: '123 Bedford Ave, #4B', price: 3500 },
    status: 'UNDER_REVIEW',
    employmentInfo: { employer: 'Finance Inc', annualIncome: 95000 },
    createdAt: '2024-12-11T14:00:00Z',
  },
  {
    id: 'app3',
    tenant: { id: 't3', firstName: 'Emily', lastName: 'Davis', email: 'emily@example.com' },
    listing: { id: 'l2', title: '456 Park Place', price: 2200 },
    status: 'SCREENING',
    employmentInfo: { employer: 'Design Studio', annualIncome: 85000 },
    createdAt: '2024-12-10T09:00:00Z',
  },
];

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

function TenantApplicationsView() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [applications, setApplications] = useState(mockApplicationsTenant);
  const [apiError, setApiError] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);

  useEffect(() => {
    const fetchApplications = async () => {
      try {
        const response = await fetch(`${API_BASE}/applications/me`, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('accessToken') || ''}`,
          },
        });
        if (!response.ok) {
          throw new Error('API request failed');
        }
        const data = await response.json();
        if (data.data) {
          setApplications(data.data);
        }
        setApiError(false);
      } catch {
        setApiError(true);
        setApplications(mockApplicationsTenant);
      } finally {
        setIsLoadingData(false);
      }
    };
    fetchApplications();
  }, []);

  if (isLoadingData) {
    return (
      <div className="animate-pulse space-y-8">
        <div className="h-12 w-64 bg-surface-200 rounded" />
        <div className="grid md:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-surface-200 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  const filteredApps = applications.filter(app => {
    if (statusFilter !== 'all' && app.status !== statusFilter) return false;
    if (searchQuery && !app.listing.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const stats = {
    total: applications.length,
    pending: applications.filter(a => ['SUBMITTED', 'UNDER_REVIEW', 'SCREENING'].includes(a.status)).length,
    approved: applications.filter(a => a.status === 'APPROVED').length,
  };

  return (
    <div className="space-y-8">
      {/* Demo Mode Banner */}
      {apiError && (
        <DemoModeState
          title="My Applications"
          message="The applications API is not available. Showing demo data below."
          icon={FileText}
        />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-surface-900">My Applications</h1>
          <p className="text-surface-500">Track the status of your rental applications</p>
        </div>
        <Button asChild>
          <Link href="/listings">Browse More Listings</Link>
        </Button>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-surface-500">Total Applications</p>
                <p className="text-3xl font-display font-bold text-surface-900">{stats.total}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-surface-100 flex items-center justify-center">
                <FileText className="h-6 w-6 text-surface-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-surface-500">Pending Review</p>
                <p className="text-3xl font-display font-bold text-amber-600">{stats.pending}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-amber-100 flex items-center justify-center">
                <Clock className="h-6 w-6 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-surface-500">Approved</p>
                <p className="text-3xl font-display font-bold text-emerald-600">{stats.approved}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <CardTitle>Applications</CardTitle>
            <div className="flex gap-3">
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-surface-400" />
                <Input
                  placeholder="Search properties..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusFilters.map(f => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredApps.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-surface-300 mx-auto mb-3" />
              <p className="text-surface-500">No applications found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredApps.map(app => (
                <Link
                  key={app.id}
                  href={`/dashboard/applications/${app.id}`}
                  className="block p-4 rounded-xl border border-surface-100 hover:border-surface-200 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-xl bg-surface-100 flex items-center justify-center">
                        <Building2 className="h-6 w-6 text-surface-500" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-surface-900">{app.listing.title}</h3>
                        <p className="text-sm text-surface-500">
                          {app.listing.address.street}{app.listing.address.unit ? `, ${app.listing.address.unit}` : ''}, {app.listing.address.city}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right hidden sm:block">
                        <p className="font-semibold text-surface-900">{formatCurrency(app.listing.price)}/mo</p>
                        <p className="text-xs text-surface-500">Applied {formatRelativeTime(app.createdAt)}</p>
                      </div>
                      <ApplicationStatusBadge status={app.status} />
                      <ChevronRight className="h-5 w-5 text-surface-400" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function LandlordApplicationsView() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [applications, setApplications] = useState(mockApplicationsLandlord);
  const [apiError, setApiError] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);

  useEffect(() => {
    const fetchApplications = async () => {
      try {
        const response = await fetch(`${API_BASE}/applications/received`, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('accessToken') || ''}`,
          },
        });
        if (!response.ok) {
          throw new Error('API request failed');
        }
        const data = await response.json();
        if (data.data) {
          setApplications(data.data);
        }
        setApiError(false);
      } catch {
        setApiError(true);
        setApplications(mockApplicationsLandlord);
      } finally {
        setIsLoadingData(false);
      }
    };
    fetchApplications();
  }, []);

  if (isLoadingData) {
    return (
      <div className="animate-pulse space-y-8">
        <div className="h-12 w-64 bg-surface-200 rounded" />
        <div className="grid md:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-surface-200 rounded-2xl" />)}
        </div>
      </div>
    );
  }
  const filteredApps = applications.filter(app => {
    if (statusFilter !== 'all' && app.status !== statusFilter) return false;
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      if (!app.tenant.firstName.toLowerCase().includes(searchLower) &&
          !app.tenant.lastName.toLowerCase().includes(searchLower) &&
          !app.listing.title.toLowerCase().includes(searchLower)) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="space-y-8">
      {/* Demo Mode Banner */}
      {apiError && (
        <DemoModeState
          title="Applications"
          message="The applications API is not available. Showing demo data below."
          icon={FileText}
        />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-surface-900">Applications</h1>
          <p className="text-surface-500">Review and manage tenant applications</p>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-surface-500">New</p>
                <p className="text-2xl font-display font-bold text-surface-900">
                  {applications.filter(a => a.status === 'SUBMITTED').length}
                </p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <FileText className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-surface-500">In Review</p>
                <p className="text-2xl font-display font-bold text-amber-600">
                  {applications.filter(a => a.status === 'UNDER_REVIEW').length}
                </p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-surface-500">Screening</p>
                <p className="text-2xl font-display font-bold text-purple-600">
                  {applications.filter(a => a.status === 'SCREENING').length}
                </p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <AlertCircle className="h-5 w-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-surface-500">Approved</p>
                <p className="text-2xl font-display font-bold text-emerald-600">
                  {applications.filter(a => a.status === 'APPROVED').length}
                </p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <CardTitle>All Applications</CardTitle>
            <div className="flex gap-3">
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-surface-400" />
                <Input
                  placeholder="Search applicants..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusFilters.map(f => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredApps.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-surface-300 mx-auto mb-3" />
              <p className="text-surface-500">No applications found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-surface-100">
                    <th className="text-left py-3 px-4 text-sm font-medium text-surface-500">Applicant</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-surface-500">Property</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-surface-500">Income</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-surface-500">Applied</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-surface-500">Status</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-surface-500">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredApps.map(app => (
                    <tr key={app.id} className="border-b border-surface-50 hover:bg-surface-50">
                      <td className="py-4 px-4">
                        <div>
                          <p className="font-medium text-surface-900">{app.tenant.firstName} {app.tenant.lastName}</p>
                          <p className="text-sm text-surface-500">{app.tenant.email}</p>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <p className="text-surface-900">{app.listing.title}</p>
                        <p className="text-sm text-surface-500">{formatCurrency(app.listing.price)}/mo</p>
                      </td>
                      <td className="py-4 px-4">
                        <p className="text-surface-900">{formatCurrency(app.employmentInfo.annualIncome)}/yr</p>
                        <p className="text-sm text-surface-500">{app.employmentInfo.employer}</p>
                      </td>
                      <td className="py-4 px-4">
                        <p className="text-surface-600">{formatRelativeTime(app.createdAt)}</p>
                      </td>
                      <td className="py-4 px-4">
                        <ApplicationStatusBadge status={app.status} />
                      </td>
                      <td className="py-4 px-4 text-right">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/dashboard/applications/${app.id}`}>Review</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ApplicationsPage() {
  const { isAuthenticated, isLoading } = useRequireAuth();
  const { user } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface-50">
        <Header />
        <main className="container-wide py-8">
          <div className="animate-pulse space-y-8">
            <div className="h-12 w-64 bg-surface-200 rounded" />
            <div className="grid md:grid-cols-3 gap-6">
              {[1, 2, 3].map(i => <div key={i} className="h-24 bg-surface-200 rounded-2xl" />)}
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
        {isTenant(user) && <TenantApplicationsView />}
        {isLandlord(user) && <LandlordApplicationsView />}
      </main>
    </div>
  );
}
