'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  Search,
  Filter,
  Download,
  Calendar,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  Clock,
  RefreshCw,
  Plus,
  Eye,
  Edit,
  Send,
  Bell,
} from 'lucide-react';

type LeaseStatus = 'draft' | 'pending_signature' | 'active' | 'expired' | 'terminated' | 'renewed';

interface Lease {
  id: string;
  propertyAddress: string;
  unit: string;
  tenantName: string;
  landlordName: string;
  status: LeaseStatus;
  monthlyRent: number;
  startDate: string;
  endDate: string;
  securityDeposit: number;
  renewalStatus?: 'pending' | 'accepted' | 'declined';
  daysUntilExpiry?: number;
}

const statusConfig: Record<LeaseStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ElementType }> = {
  draft: { label: 'Draft', variant: 'secondary', icon: FileText },
  pending_signature: { label: 'Pending Signature', variant: 'outline', icon: Clock },
  active: { label: 'Active', variant: 'default', icon: CheckCircle },
  expired: { label: 'Expired', variant: 'destructive', icon: AlertTriangle },
  terminated: { label: 'Terminated', variant: 'destructive', icon: AlertTriangle },
  renewed: { label: 'Renewed', variant: 'default', icon: RefreshCw },
};

const mockLeases: Lease[] = [
  {
    id: 'lease-1',
    propertyAddress: '245 E 24th St',
    unit: '4B',
    tenantName: 'Sarah Chen',
    landlordName: 'Manhattan Properties LLC',
    status: 'active',
    monthlyRent: 3500,
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    securityDeposit: 3500,
    daysUntilExpiry: 45,
    renewalStatus: 'pending',
  },
  {
    id: 'lease-2',
    propertyAddress: '180 Montague St',
    unit: '12A',
    tenantName: 'Michael Rodriguez',
    landlordName: 'Brooklyn Heights Realty',
    status: 'pending_signature',
    monthlyRent: 4200,
    startDate: '2025-01-01',
    endDate: '2025-12-31',
    securityDeposit: 4200,
  },
  {
    id: 'lease-3',
    propertyAddress: '55-10 Queens Blvd',
    unit: '8C',
    tenantName: 'Emily Johnson',
    landlordName: 'Queens Residential Group',
    status: 'active',
    monthlyRent: 2800,
    startDate: '2024-03-01',
    endDate: '2025-02-28',
    securityDeposit: 2800,
    daysUntilExpiry: 90,
  },
  {
    id: 'lease-4',
    propertyAddress: '890 Park Ave',
    unit: 'PH1',
    tenantName: 'James Wilson',
    landlordName: 'Upper East Holdings',
    status: 'expired',
    monthlyRent: 12500,
    startDate: '2023-01-01',
    endDate: '2023-12-31',
    securityDeposit: 12500,
    renewalStatus: 'declined',
  },
  {
    id: 'lease-5',
    propertyAddress: '321 Grand St',
    unit: '2F',
    tenantName: 'Lisa Park',
    landlordName: 'LES Rentals Inc',
    status: 'draft',
    monthlyRent: 3200,
    startDate: '2025-02-01',
    endDate: '2026-01-31',
    securityDeposit: 3200,
  },
];

export default function LeasesPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<LeaseStatus | 'all'>('all');

  const filteredLeases = mockLeases.filter((lease) => {
    const matchesSearch =
      lease.propertyAddress.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lease.tenantName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || lease.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    active: mockLeases.filter((l) => l.status === 'active').length,
    expiringSoon: mockLeases.filter((l) => l.daysUntilExpiry && l.daysUntilExpiry <= 60).length,
    pendingSignature: mockLeases.filter((l) => l.status === 'pending_signature').length,
    totalMonthlyRent: mockLeases
      .filter((l) => l.status === 'active')
      .reduce((sum, l) => sum + l.monthlyRent, 0),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leases</h1>
          <p className="text-muted-foreground">
            Manage lease agreements, renewals, and compliance
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Create Lease
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Leases</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.active}</div>
            <p className="text-xs text-muted-foreground">Currently active</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Expiring Soon</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.expiringSoon}</div>
            <p className="text-xs text-muted-foreground">Within 60 days</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pending Signature</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingSignature}</div>
            <p className="text-xs text-muted-foreground">Awaiting signatures</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${stats.totalMonthlyRent.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">From active leases</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by address or tenant..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as LeaseStatus | 'all')}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="all">All Status</option>
            <option value="draft">Draft</option>
            <option value="pending_signature">Pending Signature</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="terminated">Terminated</option>
            <option value="renewed">Renewed</option>
          </select>
          <Button variant="outline" size="icon">
            <Filter className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon">
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Leases List */}
      <div className="space-y-4">
        {filteredLeases.map((lease) => {
          const config = statusConfig[lease.status];
          const StatusIcon = config.icon;

          return (
            <Card key={lease.id}>
              <CardContent className="p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{lease.propertyAddress}</h3>
                          {lease.unit && (
                            <span className="text-muted-foreground">Unit {lease.unit}</span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          Tenant: {lease.tenantName}
                        </p>
                      </div>
                      <Badge variant={config.variant}>
                        <StatusIcon className="mr-1 h-3 w-3" />
                        {config.label}
                      </Badge>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Monthly Rent</p>
                        <p className="font-medium">${lease.monthlyRent.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Lease Term</p>
                        <p className="font-medium">
                          {new Date(lease.startDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                          {' - '}
                          {new Date(lease.endDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Security Deposit</p>
                        <p className="font-medium">${lease.securityDeposit.toLocaleString()}</p>
                      </div>
                      {lease.daysUntilExpiry !== undefined && (
                        <div>
                          <p className="text-xs text-muted-foreground">Expires In</p>
                          <p className={`font-medium ${lease.daysUntilExpiry <= 30 ? 'text-red-600' : lease.daysUntilExpiry <= 60 ? 'text-amber-600' : ''}`}>
                            {lease.daysUntilExpiry} days
                          </p>
                        </div>
                      )}
                    </div>

                    {lease.renewalStatus && (
                      <div className="flex items-center gap-2">
                        <RefreshCw className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">
                          Renewal: {' '}
                          <Badge variant={
                            lease.renewalStatus === 'accepted' ? 'default' :
                            lease.renewalStatus === 'declined' ? 'destructive' : 'secondary'
                          }>
                            {lease.renewalStatus}
                          </Badge>
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" size="sm">
                      <Eye className="mr-2 h-4 w-4" />
                      View
                    </Button>
                    {lease.status === 'draft' && (
                      <Button variant="outline" size="sm">
                        <Edit className="mr-2 h-4 w-4" />
                        Edit
                      </Button>
                    )}
                    {lease.status === 'draft' && (
                      <Button size="sm">
                        <Send className="mr-2 h-4 w-4" />
                        Send for Signature
                      </Button>
                    )}
                    {lease.status === 'active' && lease.daysUntilExpiry && lease.daysUntilExpiry <= 90 && (
                      <Button size="sm">
                        <Bell className="mr-2 h-4 w-4" />
                        Send Renewal Notice
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filteredLeases.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">No leases found</h3>
            <p className="text-muted-foreground">
              {searchQuery || statusFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Create your first lease to get started'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
