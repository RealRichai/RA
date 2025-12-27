'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Building2,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Calendar,
  MapPin,
  MoreVertical,
  Plus,
  Filter,
  ArrowUpDown,
  Eye,
  FileText,
  Loader2,
  ChevronRight,
  Target,
  Clock,
  CheckCircle,
  AlertCircle,
  Briefcase,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { cn, formatCurrency } from '@/lib/utils';
import { useRequireAuth } from '@/hooks';
import { useAuthStore } from '@/stores/auth';

interface Deal {
  id: string;
  title: string;
  address: string;
  neighborhood: string;
  borough: string;
  propertyType: 'APARTMENT' | 'CONDO' | 'TOWNHOUSE' | 'MULTI_FAMILY' | 'COMMERCIAL';
  askingPrice: number;
  estimatedValue: number;
  projectedROI: number;
  capRate: number;
  units: number;
  status: 'new' | 'under_review' | 'due_diligence' | 'negotiating' | 'closed' | 'passed';
  listedDate: string;
  daysOnMarket: number;
  notes?: string;
}

const MOCK_DEALS: Deal[] = [
  {
    id: '1',
    title: 'Prime Upper East Side Condo',
    address: '785 Park Avenue, #12B',
    neighborhood: 'Upper East Side',
    borough: 'Manhattan',
    propertyType: 'CONDO',
    askingPrice: 2450000,
    estimatedValue: 2650000,
    projectedROI: 14.2,
    capRate: 4.8,
    units: 1,
    status: 'due_diligence',
    listedDate: '2024-12-01',
    daysOnMarket: 25,
    notes: 'Strong rental history, below market asking',
  },
  {
    id: '2',
    title: 'Williamsburg Multi-Family',
    address: '234 Berry Street',
    neighborhood: 'Williamsburg',
    borough: 'Brooklyn',
    propertyType: 'MULTI_FAMILY',
    askingPrice: 3800000,
    estimatedValue: 4200000,
    projectedROI: 11.5,
    capRate: 5.2,
    units: 6,
    status: 'negotiating',
    listedDate: '2024-11-15',
    daysOnMarket: 41,
    notes: 'Seller motivated, potential value-add opportunity',
  },
  {
    id: '3',
    title: 'LIC Development Opportunity',
    address: '45-12 Court Square',
    neighborhood: 'Long Island City',
    borough: 'Queens',
    propertyType: 'COMMERCIAL',
    askingPrice: 5200000,
    estimatedValue: 5800000,
    projectedROI: 16.8,
    capRate: 6.1,
    units: 8,
    status: 'under_review',
    listedDate: '2024-12-10',
    daysOnMarket: 16,
    notes: 'Zoning allows for additional floors',
  },
  {
    id: '4',
    title: 'Prospect Heights Brownstone',
    address: '512 Sterling Place',
    neighborhood: 'Prospect Heights',
    borough: 'Brooklyn',
    propertyType: 'TOWNHOUSE',
    askingPrice: 2950000,
    estimatedValue: 3100000,
    projectedROI: 9.2,
    capRate: 4.1,
    units: 3,
    status: 'new',
    listedDate: '2024-12-20',
    daysOnMarket: 6,
  },
  {
    id: '5',
    title: 'Financial District Studio Package',
    address: '88 Greenwich Street',
    neighborhood: 'Financial District',
    borough: 'Manhattan',
    propertyType: 'APARTMENT',
    askingPrice: 1850000,
    estimatedValue: 1750000,
    projectedROI: 6.4,
    capRate: 3.2,
    units: 4,
    status: 'passed',
    listedDate: '2024-11-01',
    daysOnMarket: 55,
    notes: 'Overpriced for current market conditions',
  },
];

const statusConfig: Record<Deal['status'], { label: string; color: string; icon: React.ElementType }> = {
  new: { label: 'New', color: 'bg-blue-100 text-blue-700', icon: AlertCircle },
  under_review: { label: 'Under Review', color: 'bg-purple-100 text-purple-700', icon: Eye },
  due_diligence: { label: 'Due Diligence', color: 'bg-amber-100 text-amber-700', icon: FileText },
  negotiating: { label: 'Negotiating', color: 'bg-orange-100 text-orange-700', icon: Target },
  closed: { label: 'Closed', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  passed: { label: 'Passed', color: 'bg-surface-100 text-surface-500', icon: Clock },
};

function DealCard({ deal }: { deal: Deal }) {
  const discount = ((deal.estimatedValue - deal.askingPrice) / deal.estimatedValue) * 100;
  const StatusIcon = statusConfig[deal.status].icon;

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-surface-900">{deal.title}</h3>
              <Badge className={cn('text-xs', statusConfig[deal.status].color)}>
                <StatusIcon className="h-3 w-3 mr-1" />
                {statusConfig[deal.status].label}
              </Badge>
            </div>
            <div className="flex items-center gap-4 text-sm text-surface-500">
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {deal.neighborhood}, {deal.borough}
              </span>
              <span className="flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" />
                {deal.units} unit{deal.units !== 1 ? 's' : ''}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {deal.daysOnMarket} days
              </span>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                <Eye className="h-4 w-4 mr-2" />
                View Details
              </DropdownMenuItem>
              <DropdownMenuItem>
                <FileText className="h-4 w-4 mr-2" />
                Analysis Report
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <Target className="h-4 w-4 mr-2" />
                Move to Negotiating
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div>
            <p className="text-xs text-surface-500 mb-1">Asking Price</p>
            <p className="font-semibold text-surface-900">{formatCurrency(deal.askingPrice)}</p>
          </div>
          <div>
            <p className="text-xs text-surface-500 mb-1">Est. Value</p>
            <p className="font-semibold text-surface-900">{formatCurrency(deal.estimatedValue)}</p>
            <p className={cn('text-xs flex items-center gap-1', discount > 0 ? 'text-emerald-600' : 'text-red-600')}>
              {discount > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {discount > 0 ? '+' : ''}{discount.toFixed(1)}% {discount > 0 ? 'below' : 'above'}
            </p>
          </div>
          <div>
            <p className="text-xs text-surface-500 mb-1">Projected ROI</p>
            <p className="font-semibold text-luxury-bronze">{deal.projectedROI.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-xs text-surface-500 mb-1">Cap Rate</p>
            <p className="font-semibold text-surface-900">{deal.capRate.toFixed(1)}%</p>
          </div>
        </div>

        {deal.notes && (
          <div className="p-3 bg-surface-50 rounded-lg mb-4">
            <p className="text-sm text-surface-600">{deal.notes}</p>
          </div>
        )}

        <div className="flex items-center justify-between pt-4 border-t">
          <div className="text-xs text-surface-500">
            <Calendar className="h-3.5 w-3.5 inline mr-1" />
            Listed {new Date(deal.listedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
          <Button variant="ghost" size="sm" className="text-luxury-bronze">
            View Analysis
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DealsPage() {
  const router = useRouter();
  const { isLoading: authLoading } = useRequireAuth();
  const { user } = useAuthStore();

  const [deals] = useState<Deal[]>(MOCK_DEALS);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date' | 'price' | 'roi'>('date');

  const activeDeals = deals.filter(d => !['closed', 'passed'].includes(d.status));
  const pipelineValue = activeDeals.reduce((sum, d) => sum + d.askingPrice, 0);

  const filteredDeals = useMemo(() => {
    return deals
      .filter(d => statusFilter === 'all' || d.status === statusFilter)
      .sort((a, b) => {
        switch (sortBy) {
          case 'date': return new Date(b.listedDate).getTime() - new Date(a.listedDate).getTime();
          case 'price': return b.askingPrice - a.askingPrice;
          case 'roi': return b.projectedROI - a.projectedROI;
          default: return 0;
        }
      });
  }, [deals, statusFilter, sortBy]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-luxury-gold" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-50">
      <Header />

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-surface-900">Investment Deals</h1>
            <p className="text-surface-600 mt-1">
              Track and manage your investment opportunities
            </p>
          </div>

          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Deal
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <Briefcase className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-surface-500">Active Deals</p>
                <p className="text-lg font-bold text-surface-900">{activeDeals.length}</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-luxury-champagne">
                <DollarSign className="h-5 w-5 text-luxury-bronze" />
              </div>
              <div>
                <p className="text-xs text-surface-500">Pipeline Value</p>
                <p className="text-lg font-bold text-surface-900">{formatCurrency(pipelineValue)}</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100">
                <Target className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-surface-500">In Negotiation</p>
                <p className="text-lg font-bold text-surface-900">{deals.filter(d => d.status === 'negotiating').length}</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100">
                <CheckCircle className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-surface-500">Closed Deals</p>
                <p className="text-lg font-bold text-surface-900">{deals.filter(d => d.status === 'closed').length}</p>
              </div>
            </div>
          </Card>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="under_review">Under Review</SelectItem>
                <SelectItem value="due_diligence">Due Diligence</SelectItem>
                <SelectItem value="negotiating">Negotiating</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="passed">Passed</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
              <SelectTrigger className="w-40">
                <ArrowUpDown className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date">Newest First</SelectItem>
                <SelectItem value="price">Highest Price</SelectItem>
                <SelectItem value="roi">Highest ROI</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1" />

          <div className="text-sm text-surface-500 self-center">
            {filteredDeals.length} deal{filteredDeals.length !== 1 ? 's' : ''}
          </div>
        </div>

        <div className="space-y-4">
          {filteredDeals.map(deal => (
            <DealCard key={deal.id} deal={deal} />
          ))}
        </div>

        {filteredDeals.length === 0 && (
          <Card className="py-16">
            <div className="text-center">
              <Briefcase className="h-16 w-16 text-surface-300 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-surface-900 mb-2">
                No Deals Found
              </h2>
              <p className="text-surface-600 mb-6">
                {deals.length === 0
                  ? 'Start tracking investment opportunities by adding your first deal.'
                  : 'Try adjusting your filters to see more deals.'}
              </p>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Deal
              </Button>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
