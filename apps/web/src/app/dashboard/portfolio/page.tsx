'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Building2,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Percent,
  Calendar,
  MapPin,
  MoreVertical,
  Plus,
  Download,
  Filter,
  ArrowUpDown,
  Eye,
  Edit,
  Trash2,
  BarChart3,
  PieChart,
  Loader2,
  ArrowLeft,
  ChevronRight,
  Home,
  Wallet,
  Target,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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

// =============================================================================
// TYPES
// =============================================================================

interface Property {
  id: string;
  address: string;
  neighborhood: string;
  borough: string;
  propertyType: 'APARTMENT' | 'CONDO' | 'TOWNHOUSE' | 'MULTI_FAMILY';
  units: number;
  purchaseDate: string;
  purchasePrice: number;
  currentValue: number;
  monthlyRent: number;
  monthlyExpenses: number;
  occupancyRate: number;
  roi: number;
  capRate: number;
  status: 'performing' | 'underperforming' | 'vacant';
}

interface PortfolioMetrics {
  totalValue: number;
  totalEquity: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  netCashFlow: number;
  averageROI: number;
  averageCapRate: number;
  totalUnits: number;
  occupancyRate: number;
  yearOverYearGrowth: number;
}

// =============================================================================
// MOCK DATA
// =============================================================================

const MOCK_PROPERTIES: Property[] = [
  {
    id: '1',
    address: '245 East 72nd Street',
    neighborhood: 'Upper East Side',
    borough: 'Manhattan',
    propertyType: 'CONDO',
    units: 1,
    purchaseDate: '2022-03-15',
    purchasePrice: 1850000,
    currentValue: 2150000,
    monthlyRent: 8500,
    monthlyExpenses: 2800,
    occupancyRate: 100,
    roi: 12.4,
    capRate: 4.2,
    status: 'performing',
  },
  {
    id: '2',
    address: '156 North 6th Street',
    neighborhood: 'Williamsburg',
    borough: 'Brooklyn',
    propertyType: 'MULTI_FAMILY',
    units: 4,
    purchaseDate: '2021-08-20',
    purchasePrice: 2400000,
    currentValue: 2850000,
    monthlyRent: 16000,
    monthlyExpenses: 5200,
    occupancyRate: 75,
    roi: 8.7,
    capRate: 5.1,
    status: 'underperforming',
  },
  {
    id: '3',
    address: '89 Greenwich Street',
    neighborhood: 'Financial District',
    borough: 'Manhattan',
    propertyType: 'APARTMENT',
    units: 1,
    purchaseDate: '2023-01-10',
    purchasePrice: 1250000,
    currentValue: 1380000,
    monthlyRent: 5200,
    monthlyExpenses: 1650,
    occupancyRate: 100,
    roi: 9.8,
    capRate: 3.8,
    status: 'performing',
  },
  {
    id: '4',
    address: '42-15 Crescent Street',
    neighborhood: 'Long Island City',
    borough: 'Queens',
    propertyType: 'CONDO',
    units: 1,
    purchaseDate: '2023-06-05',
    purchasePrice: 780000,
    currentValue: 825000,
    monthlyRent: 3200,
    monthlyExpenses: 980,
    occupancyRate: 100,
    roi: 7.2,
    capRate: 3.4,
    status: 'performing',
  },
  {
    id: '5',
    address: '312 Park Place',
    neighborhood: 'Prospect Heights',
    borough: 'Brooklyn',
    propertyType: 'TOWNHOUSE',
    units: 3,
    purchaseDate: '2020-11-12',
    purchasePrice: 3200000,
    currentValue: 4100000,
    monthlyRent: 14500,
    monthlyExpenses: 4800,
    occupancyRate: 67,
    roi: 11.5,
    capRate: 4.5,
    status: 'underperforming',
  },
];

function calculatePortfolioMetrics(properties: Property[]): PortfolioMetrics {
  const totalValue = properties.reduce((sum, p) => sum + p.currentValue, 0);
  const totalPurchasePrice = properties.reduce((sum, p) => sum + p.purchasePrice, 0);
  const monthlyIncome = properties.reduce((sum, p) => sum + (p.monthlyRent * p.occupancyRate / 100), 0);
  const monthlyExpenses = properties.reduce((sum, p) => sum + p.monthlyExpenses, 0);
  const totalUnits = properties.reduce((sum, p) => sum + p.units, 0);
  const occupiedUnits = properties.reduce((sum, p) => sum + (p.units * p.occupancyRate / 100), 0);

  return {
    totalValue,
    totalEquity: totalValue - (totalPurchasePrice * 0.7), // Assuming 30% down
    monthlyIncome,
    monthlyExpenses,
    netCashFlow: monthlyIncome - monthlyExpenses,
    averageROI: properties.reduce((sum, p) => sum + p.roi, 0) / properties.length,
    averageCapRate: properties.reduce((sum, p) => sum + p.capRate, 0) / properties.length,
    totalUnits,
    occupancyRate: (occupiedUnits / totalUnits) * 100,
    yearOverYearGrowth: ((totalValue - totalPurchasePrice) / totalPurchasePrice) * 100,
  };
}

// =============================================================================
// PROPERTY CARD
// =============================================================================

function PropertyCard({ property }: { property: Property }) {
  const router = useRouter();
  const appreciation = ((property.currentValue - property.purchasePrice) / property.purchasePrice) * 100;
  const netIncome = property.monthlyRent - property.monthlyExpenses;

  const statusConfig = {
    performing: { label: 'Performing', color: 'bg-emerald-100 text-emerald-700' },
    underperforming: { label: 'Underperforming', color: 'bg-amber-100 text-amber-700' },
    vacant: { label: 'Vacant', color: 'bg-red-100 text-red-700' },
  };

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-surface-900">{property.address}</h3>
              <Badge className={cn('text-xs', statusConfig[property.status].color)}>
                {statusConfig[property.status].label}
              </Badge>
            </div>
            <div className="flex items-center gap-4 text-sm text-surface-500">
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {property.neighborhood}, {property.borough}
              </span>
              <span className="flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" />
                {property.units} unit{property.units !== 1 ? 's' : ''}
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
                <BarChart3 className="h-4 w-4 mr-2" />
                Performance Report
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Edit className="h-4 w-4 mr-2" />
                Edit Property
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600">
                <Trash2 className="h-4 w-4 mr-2" />
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div>
            <p className="text-xs text-surface-500 mb-1">Current Value</p>
            <p className="font-semibold text-surface-900">{formatCurrency(property.currentValue)}</p>
            <p className={cn('text-xs flex items-center gap-1', appreciation >= 0 ? 'text-emerald-600' : 'text-red-600')}>
              {appreciation >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {appreciation >= 0 ? '+' : ''}{appreciation.toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-xs text-surface-500 mb-1">Monthly Rent</p>
            <p className="font-semibold text-surface-900">{formatCurrency(property.monthlyRent)}</p>
            <p className="text-xs text-surface-500">{property.occupancyRate}% occupied</p>
          </div>
          <div>
            <p className="text-xs text-surface-500 mb-1">Net Income</p>
            <p className={cn('font-semibold', netIncome >= 0 ? 'text-emerald-600' : 'text-red-600')}>
              {formatCurrency(netIncome)}/mo
            </p>
          </div>
          <div>
            <p className="text-xs text-surface-500 mb-1">ROI / Cap Rate</p>
            <p className="font-semibold text-luxury-bronze">{property.roi.toFixed(1)}%</p>
            <p className="text-xs text-surface-500">{property.capRate.toFixed(1)}% cap</p>
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t">
          <div className="text-xs text-surface-500">
            <Calendar className="h-3.5 w-3.5 inline mr-1" />
            Purchased {new Date(property.purchaseDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
          </div>
          <Button variant="ghost" size="sm" className="text-luxury-bronze">
            View Details
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function PortfolioPage() {
  const router = useRouter();
  const { isLoading: authLoading } = useRequireAuth();
  const { user } = useAuthStore();

  const [properties] = useState<Property[]>(MOCK_PROPERTIES);
  const [sortBy, setSortBy] = useState<'value' | 'roi' | 'income'>('value');
  const [filterBorough, setFilterBorough] = useState<string>('all');

  const metrics = useMemo(() => calculatePortfolioMetrics(properties), [properties]);

  const filteredProperties = useMemo(() => {
    return properties
      .filter(p => filterBorough === 'all' || p.borough === filterBorough)
      .sort((a, b) => {
        switch (sortBy) {
          case 'value': return b.currentValue - a.currentValue;
          case 'roi': return b.roi - a.roi;
          case 'income': return (b.monthlyRent - b.monthlyExpenses) - (a.monthlyRent - a.monthlyExpenses);
          default: return 0;
        }
      });
  }, [properties, sortBy, filterBorough]);

  const uniqueBoroughs = [...new Set(properties.map(p => p.borough))];

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
            <h1 className="text-3xl font-bold text-surface-900">Investment Portfolio</h1>
            <p className="text-surface-600 mt-1">
              Track your real estate investments and performance
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <Button variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export Report
            </Button>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Property
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-8">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-luxury-champagne">
                <Wallet className="h-5 w-5 text-luxury-bronze" />
              </div>
              <div>
                <p className="text-xs text-surface-500">Total Value</p>
                <p className="text-lg font-bold text-surface-900">{formatCurrency(metrics.totalValue)}</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100">
                <DollarSign className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-surface-500">Net Cash Flow</p>
                <p className="text-lg font-bold text-emerald-600">{formatCurrency(metrics.netCashFlow)}/mo</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <Percent className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-surface-500">Avg ROI</p>
                <p className="text-lg font-bold text-surface-900">{metrics.averageROI.toFixed(1)}%</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100">
                <Home className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-surface-500">Occupancy</p>
                <p className="text-lg font-bold text-surface-900">{metrics.occupancyRate.toFixed(0)}%</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className={cn('p-2 rounded-lg', metrics.yearOverYearGrowth >= 0 ? 'bg-emerald-100' : 'bg-red-100')}>
                {metrics.yearOverYearGrowth >= 0 ? (
                  <TrendingUp className="h-5 w-5 text-emerald-600" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-red-600" />
                )}
              </div>
              <div>
                <p className="text-xs text-surface-500">YoY Growth</p>
                <p className={cn('text-lg font-bold', metrics.yearOverYearGrowth >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                  {metrics.yearOverYearGrowth >= 0 ? '+' : ''}{metrics.yearOverYearGrowth.toFixed(1)}%
                </p>
              </div>
            </div>
          </Card>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex gap-2">
            <Select value={filterBorough} onValueChange={setFilterBorough}>
              <SelectTrigger className="w-40">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Borough" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Boroughs</SelectItem>
                {uniqueBoroughs.map(b => (
                  <SelectItem key={b} value={b}>{b}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
              <SelectTrigger className="w-40">
                <ArrowUpDown className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="value">Property Value</SelectItem>
                <SelectItem value="roi">ROI</SelectItem>
                <SelectItem value="income">Net Income</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1" />

          <div className="text-sm text-surface-500 self-center">
            {filteredProperties.length} propert{filteredProperties.length !== 1 ? 'ies' : 'y'} • {metrics.totalUnits} units
          </div>
        </div>

        <div className="space-y-4">
          {filteredProperties.map(property => (
            <PropertyCard key={property.id} property={property} />
          ))}
        </div>

        {filteredProperties.length === 0 && (
          <Card className="py-16">
            <div className="text-center">
              <Building2 className="h-16 w-16 text-surface-300 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-surface-900 mb-2">
                No Properties Found
              </h2>
              <p className="text-surface-600 mb-6">
                {properties.length === 0 
                  ? 'Start building your portfolio by adding your first property.'
                  : 'Try adjusting your filters to see more properties.'}
              </p>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Property
              </Button>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
