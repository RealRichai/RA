'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  FileText,
  Search,
  Filter,
  Plus,
  Download,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  User,
  Building2,
  DollarSign,
  MoreVertical,
  Eye,
  Send,
  RefreshCw,
  Loader2,
  ArrowUpDown,
  FileSignature,
  Mail,
  Phone,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Header } from '@/components/layout/header';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { useRequireAuth } from '@/hooks';
import { useAuthStore, isLandlord } from '@/stores/auth';

type LeaseStatus = 'draft' | 'pending_signature' | 'active' | 'expiring_soon' | 'expired' | 'terminated';

interface Lease {
  id: string;
  listingId: string;
  propertyAddress: string;
  unit?: string;
  tenant: { id: string; name: string; email: string; phone?: string };
  status: LeaseStatus;
  startDate: string;
  endDate: string;
  monthlyRent: number;
  securityDeposit: number;
  rentDueDay: number;
  paymentStatus: 'current' | 'late' | 'overdue';
  documents: { id: string; name: string; type: string; signedAt?: string }[];
  createdAt: string;
  updatedAt: string;
}

const MOCK_LEASES: Lease[] = [
  {
    id: '1', listingId: 'listing-1', propertyAddress: '245 East 72nd Street', unit: '4B',
    tenant: { id: 'tenant-1', name: 'Sarah Johnson', email: 'sarah.j@email.com', phone: '(212) 555-0123' },
    status: 'active', startDate: '2024-06-01', endDate: '2025-05-31', monthlyRent: 3500, securityDeposit: 3500,
    rentDueDay: 1, paymentStatus: 'current',
    documents: [{ id: 'd1', name: 'Lease Agreement', type: 'lease', signedAt: '2024-05-25' }],
    createdAt: '2024-05-20', updatedAt: '2024-06-01',
  },
  {
    id: '2', listingId: 'listing-2', propertyAddress: '156 North 6th Street', unit: '2A',
    tenant: { id: 'tenant-2', name: 'Michael Chen', email: 'mchen@techcorp.com', phone: '(646) 555-0456' },
    status: 'expiring_soon', startDate: '2024-01-15', endDate: '2025-01-14', monthlyRent: 4200, securityDeposit: 4200,
    rentDueDay: 15, paymentStatus: 'current',
    documents: [{ id: 'd3', name: 'Lease Agreement', type: 'lease', signedAt: '2024-01-10' }],
    createdAt: '2024-01-05', updatedAt: '2024-12-01',
  },
  {
    id: '3', listingId: 'listing-3', propertyAddress: '89 Greenwich Street', unit: '12F',
    tenant: { id: 'tenant-3', name: 'Emily Rodriguez', email: 'emily.r@gmail.com' },
    status: 'pending_signature', startDate: '2025-01-01', endDate: '2025-12-31', monthlyRent: 5200, securityDeposit: 5200,
    rentDueDay: 1, paymentStatus: 'current',
    documents: [{ id: 'd4', name: 'Lease Agreement', type: 'lease' }],
    createdAt: '2024-12-10', updatedAt: '2024-12-14',
  },
  {
    id: '4', listingId: 'listing-4', propertyAddress: '42-15 Crescent Street', unit: '8C',
    tenant: { id: 'tenant-4', name: 'David Park', email: 'dpark@investment.com', phone: '(917) 555-0789' },
    status: 'active', startDate: '2024-09-01', endDate: '2025-08-31', monthlyRent: 3200, securityDeposit: 3200,
    rentDueDay: 1, paymentStatus: 'late',
    documents: [{ id: 'd6', name: 'Lease Agreement', type: 'lease', signedAt: '2024-08-28' }],
    createdAt: '2024-08-20', updatedAt: '2024-12-10',
  },
  {
    id: '5', listingId: 'listing-5', propertyAddress: '312 Park Place', unit: '1',
    tenant: { id: 'tenant-5', name: 'Jessica Williams', email: 'jwilliams@law.com', phone: '(212) 555-0321' },
    status: 'expired', startDate: '2023-12-01', endDate: '2024-11-30', monthlyRent: 4800, securityDeposit: 4800,
    rentDueDay: 1, paymentStatus: 'current',
    documents: [{ id: 'd7', name: 'Lease Agreement', type: 'lease', signedAt: '2023-11-25' }],
    createdAt: '2023-11-20', updatedAt: '2024-12-01',
  },
];

const STATUS_CONFIG: Record<LeaseStatus, { label: string; color: string; icon: React.ElementType }> = {
  draft: { label: 'Draft', color: 'bg-surface-100 text-surface-600', icon: FileText },
  pending_signature: { label: 'Pending Signature', color: 'bg-amber-100 text-amber-700', icon: FileSignature },
  active: { label: 'Active', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  expiring_soon: { label: 'Expiring Soon', color: 'bg-orange-100 text-orange-700', icon: Clock },
  expired: { label: 'Expired', color: 'bg-red-100 text-red-700', icon: XCircle },
  terminated: { label: 'Terminated', color: 'bg-surface-100 text-surface-500', icon: XCircle },
};

const PAYMENT_CONFIG: Record<string, { label: string; color: string }> = {
  current: { label: 'Current', color: 'text-emerald-600' },
  late: { label: 'Late', color: 'text-amber-600' },
  overdue: { label: 'Overdue', color: 'text-red-600' },
};

function LeaseCard({ lease }: { lease: Lease }) {
  const statusConfig = STATUS_CONFIG[lease.status];
  const StatusIcon = statusConfig.icon;
  const paymentConfig = PAYMENT_CONFIG[lease.paymentStatus];
  const daysUntilExpiry = Math.ceil((new Date(lease.endDate).getTime() - Date.now()) / 86400000);

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-surface-100 flex items-center justify-center">
            <Building2 className="h-6 w-6 text-surface-500" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4 mb-2">
              <div>
                <h3 className="font-semibold text-surface-900">
                  {lease.propertyAddress}{lease.unit && `, ${lease.unit}`}
                </h3>
                <div className="flex items-center gap-4 text-sm text-surface-500 mt-1">
                  <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" />{lease.tenant.name}</span>
                  <span className="flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" />{formatCurrency(lease.monthlyRent)}/mo</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge className={cn('text-xs', statusConfig.color)}>
                  <StatusIcon className="h-3 w-3 mr-1" />{statusConfig.label}
                </Badge>
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem><Eye className="h-4 w-4 mr-2" />View Details</DropdownMenuItem>
                    <DropdownMenuItem><Download className="h-4 w-4 mr-2" />Download Lease</DropdownMenuItem>
                    <DropdownMenuItem><Mail className="h-4 w-4 mr-2" />Email Tenant</DropdownMenuItem>
                    {lease.status === 'pending_signature' && (
                      <DropdownMenuItem><Send className="h-4 w-4 mr-2" />Resend for Signature</DropdownMenuItem>
                    )}
                    {(lease.status === 'expiring_soon' || lease.status === 'expired') && (
                      <DropdownMenuItem><RefreshCw className="h-4 w-4 mr-2" />Create Renewal</DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-red-600"><XCircle className="h-4 w-4 mr-2" />Terminate</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3 text-sm">
              <div><p className="text-surface-500 text-xs">Lease Period</p><p className="text-surface-900">{formatDate(lease.startDate)} - {formatDate(lease.endDate)}</p></div>
              <div><p className="text-surface-500 text-xs">Security Deposit</p><p className="text-surface-900">{formatCurrency(lease.securityDeposit)}</p></div>
              <div><p className="text-surface-500 text-xs">Rent Due</p><p className="text-surface-900">{lease.rentDueDay === 1 ? '1st' : `${lease.rentDueDay}th`} of month</p></div>
              <div><p className="text-surface-500 text-xs">Payment Status</p><p className={cn('font-medium', paymentConfig.color)}>{paymentConfig.label}</p></div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t">
              <div className="flex items-center gap-4 text-xs text-surface-500">
                {lease.tenant.email && <a href={`mailto:${lease.tenant.email}`} className="flex items-center gap-1 hover:text-surface-700"><Mail className="h-3.5 w-3.5" />{lease.tenant.email}</a>}
                {lease.tenant.phone && <a href={`tel:${lease.tenant.phone}`} className="flex items-center gap-1 hover:text-surface-700"><Phone className="h-3.5 w-3.5" />{lease.tenant.phone}</a>}
              </div>
              {lease.status === 'active' && daysUntilExpiry <= 90 && daysUntilExpiry > 0 && (
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-300"><Clock className="h-3 w-3 mr-1" />{daysUntilExpiry} days remaining</Badge>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function LeasesPage() {
  const router = useRouter();
  const { isLoading: authLoading } = useRequireAuth();
  const { user } = useAuthStore();

  const [leases] = useState<Lease[]>(MOCK_LEASES);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'endDate' | 'rent' | 'recent'>('endDate');

  if (!authLoading && user && !isLandlord(user)) {
    router.push('/dashboard');
    return null;
  }

  const filteredLeases = useMemo(() => {
    return leases
      .filter((lease) => {
        if (statusFilter !== 'all' && lease.status !== statusFilter) return false;
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          return lease.propertyAddress.toLowerCase().includes(query) || lease.tenant.name.toLowerCase().includes(query) || lease.tenant.email.toLowerCase().includes(query);
        }
        return true;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'endDate': return new Date(a.endDate).getTime() - new Date(b.endDate).getTime();
          case 'rent': return b.monthlyRent - a.monthlyRent;
          case 'recent': return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
          default: return 0;
        }
      });
  }, [leases, searchQuery, statusFilter, sortBy]);

  const stats = useMemo(() => ({
    total: leases.length,
    active: leases.filter(l => l.status === 'active').length,
    expiringSoon: leases.filter(l => l.status === 'expiring_soon').length,
    pendingSignature: leases.filter(l => l.status === 'pending_signature').length,
    monthlyRevenue: leases.filter(l => l.status === 'active').reduce((sum, l) => sum + l.monthlyRent, 0),
  }), [leases]);

  if (authLoading) {
    return <div className="min-h-screen bg-surface-50 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-luxury-gold" /></div>;
  }

  return (
    <div className="min-h-screen bg-surface-50">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-surface-900">Leases</h1>
            <p className="text-surface-600 mt-1">Manage your rental agreements and tenants</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline"><Download className="h-4 w-4 mr-2" />Export</Button>
            <Button><Plus className="h-4 w-4 mr-2" />New Lease</Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <Card className="p-4"><p className="text-sm text-surface-500">Total Leases</p><p className="text-2xl font-bold text-surface-900">{stats.total}</p></Card>
          <Card className="p-4"><p className="text-sm text-surface-500">Active</p><p className="text-2xl font-bold text-emerald-600">{stats.active}</p></Card>
          <Card className="p-4"><p className="text-sm text-surface-500">Expiring Soon</p><p className="text-2xl font-bold text-orange-600">{stats.expiringSoon}</p></Card>
          <Card className="p-4"><p className="text-sm text-surface-500">Pending Signature</p><p className="text-2xl font-bold text-amber-600">{stats.pendingSignature}</p></Card>
          <Card className="p-4"><p className="text-sm text-surface-500">Monthly Revenue</p><p className="text-2xl font-bold text-luxury-bronze">{formatCurrency(stats.monthlyRevenue)}</p></Card>
        </div>

        <div className="flex flex-col lg:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-surface-400" />
            <Input placeholder="Search by property or tenant..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
          </div>
          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44"><Filter className="h-4 w-4 mr-2" /><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {Object.entries(STATUS_CONFIG).map(([key, config]) => (<SelectItem key={key} value={key}>{config.label}</SelectItem>))}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
              <SelectTrigger className="w-36"><ArrowUpDown className="h-4 w-4 mr-2" /><SelectValue placeholder="Sort by" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="endDate">End Date</SelectItem>
                <SelectItem value="rent">Rent Amount</SelectItem>
                <SelectItem value="recent">Recently Updated</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {filteredLeases.length === 0 ? (
          <Card className="py-16">
            <div className="text-center">
              <FileText className="h-16 w-16 text-surface-300 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-surface-900 mb-2">{leases.length === 0 ? 'No Leases Yet' : 'No Matching Leases'}</h2>
              <p className="text-surface-600 mb-6">{leases.length === 0 ? 'Create your first lease to start managing your rentals.' : 'Try adjusting your filters to see more leases.'}</p>
              <Button><Plus className="h-4 w-4 mr-2" />Create Lease</Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-surface-500">Showing {filteredLeases.length} of {leases.length} leases</p>
            {filteredLeases.map((lease) => (<LeaseCard key={lease.id} lease={lease} />))}
          </div>
        )}
      </main>
    </div>
  );
}
