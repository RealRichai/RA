'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  CreditCard,
  Search,
  Filter,
  Download,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
  RefreshCw,
  Plus,
  Eye,
  Send,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
} from 'lucide-react';

type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled';
type PaymentType = 'rent' | 'security_deposit' | 'broker_fee' | 'application_fee' | 'late_fee' | 'utility' | 'maintenance' | 'other';

interface Payment {
  id: string;
  leaseId: string;
  propertyAddress: string;
  unit: string;
  tenantName: string;
  type: PaymentType;
  amount: number;
  status: PaymentStatus;
  dueDate: string;
  paidAt?: string;
  description?: string;
  failureReason?: string;
}

const statusConfig: Record<PaymentStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ElementType }> = {
  pending: { label: 'Pending', variant: 'outline', icon: Clock },
  paid: { label: 'Paid', variant: 'default', icon: CheckCircle },
  failed: { label: 'Failed', variant: 'destructive', icon: XCircle },
  refunded: { label: 'Refunded', variant: 'secondary', icon: RefreshCw },
  cancelled: { label: 'Cancelled', variant: 'secondary', icon: XCircle },
};

const typeLabels: Record<PaymentType, string> = {
  rent: 'Rent',
  security_deposit: 'Security Deposit',
  broker_fee: 'Broker Fee',
  application_fee: 'Application Fee',
  late_fee: 'Late Fee',
  utility: 'Utility',
  maintenance: 'Maintenance',
  other: 'Other',
};

const mockPayments: Payment[] = [
  {
    id: 'pay-1',
    leaseId: 'lease-1',
    propertyAddress: '245 E 24th St',
    unit: '4B',
    tenantName: 'Sarah Chen',
    type: 'rent',
    amount: 3500,
    status: 'paid',
    dueDate: '2024-12-01',
    paidAt: '2024-11-28',
    description: 'December 2024 Rent',
  },
  {
    id: 'pay-2',
    leaseId: 'lease-1',
    propertyAddress: '245 E 24th St',
    unit: '4B',
    tenantName: 'Sarah Chen',
    type: 'rent',
    amount: 3500,
    status: 'pending',
    dueDate: '2025-01-01',
    description: 'January 2025 Rent',
  },
  {
    id: 'pay-3',
    leaseId: 'lease-2',
    propertyAddress: '180 Montague St',
    unit: '12A',
    tenantName: 'Michael Rodriguez',
    type: 'security_deposit',
    amount: 4200,
    status: 'paid',
    dueDate: '2024-12-15',
    paidAt: '2024-12-14',
    description: 'Security deposit for lease',
  },
  {
    id: 'pay-4',
    leaseId: 'lease-3',
    propertyAddress: '55-10 Queens Blvd',
    unit: '8C',
    tenantName: 'Emily Johnson',
    type: 'rent',
    amount: 2800,
    status: 'failed',
    dueDate: '2024-12-01',
    failureReason: 'Insufficient funds',
    description: 'December 2024 Rent',
  },
  {
    id: 'pay-5',
    leaseId: 'lease-3',
    propertyAddress: '55-10 Queens Blvd',
    unit: '8C',
    tenantName: 'Emily Johnson',
    type: 'late_fee',
    amount: 75,
    status: 'pending',
    dueDate: '2024-12-06',
    description: 'Late fee for December rent',
  },
  {
    id: 'pay-6',
    leaseId: 'lease-4',
    propertyAddress: '890 Park Ave',
    unit: 'PH1',
    tenantName: 'James Wilson',
    type: 'broker_fee',
    amount: 18750,
    status: 'paid',
    dueDate: '2023-01-01',
    paidAt: '2023-01-02',
    description: 'Broker fee (15% of annual rent)',
  },
  {
    id: 'pay-7',
    leaseId: 'lease-5',
    propertyAddress: '321 Grand St',
    unit: '2F',
    tenantName: 'Lisa Park',
    type: 'application_fee',
    amount: 20,
    status: 'paid',
    dueDate: '2024-12-10',
    paidAt: '2024-12-10',
    description: 'Application processing fee',
  },
];

export default function PaymentsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<PaymentType | 'all'>('all');

  const filteredPayments = mockPayments.filter((payment) => {
    const matchesSearch =
      payment.propertyAddress.toLowerCase().includes(searchQuery.toLowerCase()) ||
      payment.tenantName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || payment.status === statusFilter;
    const matchesType = typeFilter === 'all' || payment.type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  const stats = {
    totalCollected: mockPayments
      .filter((p) => p.status === 'paid')
      .reduce((sum, p) => sum + p.amount, 0),
    totalPending: mockPayments
      .filter((p) => p.status === 'pending')
      .reduce((sum, p) => sum + p.amount, 0),
    totalFailed: mockPayments
      .filter((p) => p.status === 'failed')
      .reduce((sum, p) => sum + p.amount, 0),
    successRate: Math.round(
      (mockPayments.filter((p) => p.status === 'paid').length /
        mockPayments.filter((p) => ['paid', 'failed'].includes(p.status)).length) * 100
    ),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payments</h1>
          <p className="text-muted-foreground">
            Track rent payments, deposits, and fees
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Record Payment
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Collected</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats.totalCollected.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">This period</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats.totalPending.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Awaiting payment</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
            <ArrowDownRight className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats.totalFailed.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Needs attention</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.successRate}%</div>
            <p className="text-xs text-muted-foreground">Payment success</p>
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
            onChange={(e) => setStatusFilter(e.target.value as PaymentStatus | 'all')}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="failed">Failed</option>
            <option value="refunded">Refunded</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as PaymentType | 'all')}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="all">All Types</option>
            <option value="rent">Rent</option>
            <option value="security_deposit">Security Deposit</option>
            <option value="broker_fee">Broker Fee</option>
            <option value="application_fee">Application Fee</option>
            <option value="late_fee">Late Fee</option>
            <option value="utility">Utility</option>
            <option value="maintenance">Maintenance</option>
          </select>
          <Button variant="outline" size="icon">
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Payments List */}
      <div className="space-y-4">
        {filteredPayments.map((payment) => {
          const config = statusConfig[payment.status];
          const StatusIcon = config.icon;

          return (
            <Card key={payment.id}>
              <CardContent className="p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{payment.propertyAddress}</h3>
                          {payment.unit && (
                            <span className="text-muted-foreground">Unit {payment.unit}</span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {payment.tenantName} • {payment.description}
                        </p>
                      </div>
                      <Badge variant={config.variant}>
                        <StatusIcon className="mr-1 h-3 w-3" />
                        {config.label}
                      </Badge>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Amount</p>
                        <p className="text-lg font-bold">${payment.amount.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Type</p>
                        <p className="font-medium">{typeLabels[payment.type]}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Due Date</p>
                        <p className="font-medium">
                          {new Date(payment.dueDate).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </p>
                      </div>
                      {payment.paidAt && (
                        <div>
                          <p className="text-xs text-muted-foreground">Paid On</p>
                          <p className="font-medium text-green-600">
                            {new Date(payment.paidAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </p>
                        </div>
                      )}
                    </div>

                    {payment.failureReason && (
                      <div className="flex items-center gap-2 text-red-600">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="text-sm">Failed: {payment.failureReason}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" size="sm">
                      <Eye className="mr-2 h-4 w-4" />
                      Details
                    </Button>
                    {payment.status === 'pending' && (
                      <Button size="sm">
                        <Send className="mr-2 h-4 w-4" />
                        Send Reminder
                      </Button>
                    )}
                    {payment.status === 'failed' && (
                      <Button size="sm" variant="destructive">
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Retry
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filteredPayments.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CreditCard className="h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">No payments found</h3>
            <p className="text-muted-foreground">
              {searchQuery || statusFilter !== 'all' || typeFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Payments will appear here once recorded'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
