'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { DemoModeState } from '@/components/ui/demo-mode-state';
import {
  Plus,
  Search,
  MoreVertical,
  Eye,
  Edit,
  Trash2,
  Archive,
  Building2,
  MapPin,
  Bed,
  Bath,
  Calendar,
  DollarSign,
  Users,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  Pause,
} from 'lucide-react';
import { Header } from '@/components/layout/header';
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
import { cn, formatCurrency, formatDate, formatRelativeTime } from '@/lib/utils';
import { useRequireAuth } from '@/hooks';
import { useAuthStore, isLandlord, isAgent } from '@/stores/auth';
import { toast } from '@/components/ui/toaster';
import type { Listing } from '@/lib/api';

// =============================================================================
// MOCK DATA
// =============================================================================

const MOCK_LISTINGS: Listing[] = [
  {
    id: '1',
    title: 'Stunning 2BR with Manhattan Skyline Views',
    description: 'Beautiful apartment with amazing views of the Manhattan skyline.',
    propertyType: 'APARTMENT',
    status: 'ACTIVE',
    price: 3500,
    bedrooms: 2,
    bathrooms: 1,
    squareFeet: 1100,
    address: { street: '123 Bedford Ave', unit: '4B', city: 'Brooklyn', state: 'NY', zipCode: '11211' },
    neighborhood: 'Williamsburg',
    borough: 'Brooklyn',
    amenities: ['washer_dryer', 'dishwasher', 'hardwood_floors', 'near_subway'],
    photos: ['https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800'],
    availableDate: '2025-01-15',
    leaseTermMonths: 12,
    petsAllowed: true,
    petPolicy: 'Dogs under 25 lbs',
    applicationFee: 20,
    securityDeposit: 3500,
    brokerFee: 0,
    brokerFeePaidBy: 'LANDLORD',
    moveInCosts: { firstMonth: 3500, securityDeposit: 3500, brokerFee: 0, applicationFee: 20, total: 7020 },
    fareActCompliant: true,
    landlordId: 'landlord-1',
    createdAt: '2024-12-01T10:00:00Z',
    updatedAt: '2024-12-10T15:30:00Z',
  },
  {
    id: '2',
    title: 'Cozy Studio in Chelsea',
    description: 'Perfect starter apartment in the heart of Chelsea.',
    propertyType: 'STUDIO',
    status: 'ACTIVE',
    price: 2200,
    bedrooms: 0,
    bathrooms: 1,
    squareFeet: 450,
    address: { street: '456 W 23rd St', unit: '2A', city: 'New York', state: 'NY', zipCode: '10011' },
    neighborhood: 'Chelsea',
    borough: 'Manhattan',
    amenities: ['elevator', 'laundry_building', 'near_subway'],
    photos: ['https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800'],
    availableDate: '2025-02-01',
    leaseTermMonths: 12,
    petsAllowed: false,
    applicationFee: 20,
    securityDeposit: 2200,
    brokerFee: 0,
    brokerFeePaidBy: 'LANDLORD',
    moveInCosts: { firstMonth: 2200, securityDeposit: 2200, brokerFee: 0, applicationFee: 20, total: 4420 },
    fareActCompliant: true,
    landlordId: 'landlord-1',
    createdAt: '2024-11-15T14:00:00Z',
    updatedAt: '2024-12-08T09:00:00Z',
  },
  {
    id: '3',
    title: 'Spacious 3BR Family Home',
    description: 'Large family apartment with plenty of natural light.',
    propertyType: 'APARTMENT',
    status: 'PENDING',
    price: 4800,
    bedrooms: 3,
    bathrooms: 2,
    squareFeet: 1600,
    address: { street: '789 Park Place', unit: '1', city: 'Brooklyn', state: 'NY', zipCode: '11238' },
    neighborhood: 'Prospect Heights',
    borough: 'Brooklyn',
    amenities: ['washer_dryer', 'dishwasher', 'central_ac', 'private_outdoor', 'hardwood_floors'],
    photos: ['https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800'],
    availableDate: '2025-01-01',
    leaseTermMonths: 12,
    petsAllowed: true,
    petPolicy: 'All pets welcome',
    applicationFee: 20,
    securityDeposit: 4800,
    brokerFee: 0,
    brokerFeePaidBy: 'LANDLORD',
    moveInCosts: { firstMonth: 4800, securityDeposit: 4800, brokerFee: 0, applicationFee: 20, total: 9620 },
    fareActCompliant: true,
    landlordId: 'landlord-1',
    createdAt: '2024-12-05T11:00:00Z',
    updatedAt: '2024-12-12T16:00:00Z',
  },
  {
    id: '4',
    title: 'Modern Loft in DUMBO',
    description: 'Stunning converted warehouse with exposed brick and high ceilings.',
    propertyType: 'LOFT',
    status: 'DRAFT',
    price: 5500,
    bedrooms: 1,
    bathrooms: 1.5,
    squareFeet: 1400,
    address: { street: '100 Water St', unit: 'PH', city: 'Brooklyn', state: 'NY', zipCode: '11201' },
    neighborhood: 'DUMBO',
    borough: 'Brooklyn',
    amenities: ['doorman', 'gym', 'roof_deck', 'high_ceilings', 'exposed_brick', 'city_view'],
    photos: [],
    availableDate: '2025-03-01',
    leaseTermMonths: 12,
    petsAllowed: false,
    applicationFee: 20,
    securityDeposit: 5500,
    brokerFee: 0,
    brokerFeePaidBy: 'LANDLORD',
    moveInCosts: { firstMonth: 5500, securityDeposit: 5500, brokerFee: 0, applicationFee: 20, total: 11020 },
    fareActCompliant: true,
    landlordId: 'landlord-1',
    createdAt: '2024-12-14T08:00:00Z',
    updatedAt: '2024-12-14T08:00:00Z',
  },
  {
    id: '5',
    title: 'Classic 1BR Upper West Side',
    description: 'Pre-war charm with modern updates.',
    propertyType: 'APARTMENT',
    status: 'LEASED',
    price: 2900,
    bedrooms: 1,
    bathrooms: 1,
    squareFeet: 750,
    address: { street: '245 W 86th St', unit: '5C', city: 'New York', state: 'NY', zipCode: '10024' },
    neighborhood: 'Upper West Side',
    borough: 'Manhattan',
    amenities: ['elevator', 'laundry_building', 'live_in_super', 'hardwood_floors', 'near_park'],
    photos: ['https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800'],
    availableDate: '2024-11-01',
    leaseTermMonths: 12,
    petsAllowed: true,
    petPolicy: 'Cats only',
    applicationFee: 20,
    securityDeposit: 2900,
    brokerFee: 0,
    brokerFeePaidBy: 'LANDLORD',
    moveInCosts: { firstMonth: 2900, securityDeposit: 2900, brokerFee: 0, applicationFee: 20, total: 5820 },
    fareActCompliant: true,
    landlordId: 'landlord-1',
    createdAt: '2024-10-01T10:00:00Z',
    updatedAt: '2024-11-15T12:00:00Z',
  },
];

const MOCK_STATS = {
  totalListings: 5,
  activeListings: 2,
  pendingApplications: 8,
  monthlyRevenue: 18900,
  averageDaysToLease: 21,
  viewsThisWeek: 342,
};

// =============================================================================
// COMPONENTS
// =============================================================================

function StatCard({
  title,
  value,
  change,
  icon: Icon,
  trend,
}: {
  title: string;
  value: string | number;
  change?: string;
  icon: React.ElementType;
  trend?: 'up' | 'down' | 'neutral';
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-surface-500 mb-1">{title}</p>
            <p className="text-2xl font-display font-bold text-surface-900">{value}</p>
            {change && (
              <p className={cn(
                'text-xs mt-1',
                trend === 'up' && 'text-emerald-600',
                trend === 'down' && 'text-red-600',
                trend === 'neutral' && 'text-surface-500'
              )}>
                {trend === 'up' && '↑'} {change}
              </p>
            )}
          </div>
          <div className="h-10 w-10 rounded-xl bg-luxury-champagne/50 flex items-center justify-center">
            <Icon className="h-5 w-5 text-luxury-bronze" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: Listing['status'] }) {
  const config = {
    DRAFT: { label: 'Draft', variant: 'default' as const, icon: Edit },
    ACTIVE: { label: 'Active', variant: 'success' as const, icon: CheckCircle },
    PENDING: { label: 'Pending', variant: 'warning' as const, icon: Clock },
    LEASED: { label: 'Leased', variant: 'info' as const, icon: Users },
    INACTIVE: { label: 'Inactive', variant: 'default' as const, icon: Pause },
  };
  const { label, variant, icon: Icon } = config[status] || config.DRAFT;
  return (
    <Badge variant={variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}

function ListingCard({
  listing,
  onAction,
}: {
  listing: Listing;
  onAction: (action: string, listing: Listing) => void;
}) {
  const hasPhoto = listing.photos && listing.photos.length > 0;

  return (
    <Card className="overflow-hidden hover:shadow-card-hover transition-all">
      <div className="flex">
        <div className="w-48 h-40 flex-shrink-0 bg-surface-100">
          {hasPhoto ? (
            <img src={listing.photos[0]} alt={listing.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Building2 className="h-12 w-12 text-surface-300" />
            </div>
          )}
        </div>
        <div className="flex-1 p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <StatusBadge status={listing.status} />
                {listing.fareActCompliant && <Badge variant="gold" className="text-xs">FARE Act</Badge>}
              </div>
              <h3 className="font-semibold text-surface-900 truncate">{listing.title}</h3>
              <p className="text-sm text-surface-500 flex items-center gap-1 mt-0.5">
                <MapPin className="h-3 w-3" />
                {listing.neighborhood || listing.borough}, {listing.address.city}
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onAction('view', listing)}>
                  <Eye className="h-4 w-4 mr-2" />View Listing
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onAction('edit', listing)}>
                  <Edit className="h-4 w-4 mr-2" />Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {listing.status === 'DRAFT' && (
                  <DropdownMenuItem onClick={() => onAction('publish', listing)}>
                    <CheckCircle className="h-4 w-4 mr-2" />Publish
                  </DropdownMenuItem>
                )}
                {listing.status === 'ACTIVE' && (
                  <DropdownMenuItem onClick={() => onAction('unpublish', listing)}>
                    <Pause className="h-4 w-4 mr-2" />Unpublish
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => onAction('archive', listing)}>
                  <Archive className="h-4 w-4 mr-2" />Archive
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onAction('delete', listing)} className="text-red-600">
                  <Trash2 className="h-4 w-4 mr-2" />Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex items-center gap-4 mt-3 text-sm text-surface-600">
            <span className="flex items-center gap-1">
              <Bed className="h-4 w-4 text-surface-400" />
              {listing.bedrooms === 0 ? 'Studio' : listing.bedrooms}
            </span>
            <span className="flex items-center gap-1">
              <Bath className="h-4 w-4 text-surface-400" />
              {listing.bathrooms}
            </span>
            {listing.squareFeet && <span>{listing.squareFeet.toLocaleString()} sqft</span>}
          </div>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-surface-100">
            <div>
              <p className="text-xl font-display font-bold text-surface-900">
                {formatCurrency(listing.price)}
                <span className="text-sm font-normal text-surface-400">/mo</span>
              </p>
            </div>
            <div className="text-right text-xs text-surface-400">
              <p>Updated {formatRelativeTime(listing.updatedAt)}</p>
              {listing.status === 'ACTIVE' && (
                <p className="text-emerald-600">Available {formatDate(listing.availableDate)}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export default function ListingsManagementPage() {
  const { isAuthenticated, isLoading: authLoading } = useRequireAuth('/dashboard/listings');
  const { user } = useAuthStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('updatedAt');
  const [listings, setListings] = useState<Listing[]>(MOCK_LISTINGS);
  const [apiError, setApiError] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);

  // Attempt to fetch listings from API
  useEffect(() => {
    const fetchListings = async () => {
      try {
        const response = await fetch(`${API_BASE}/listings/my`, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('accessToken') || ''}`,
          },
        });
        if (!response.ok) {
          throw new Error('API request failed');
        }
        const data = await response.json();
        if (data.data?.listings) {
          setListings(data.data.listings);
        }
        setApiError(false);
      } catch {
        setApiError(true);
        setListings(MOCK_LISTINGS);
      } finally {
        setIsLoadingData(false);
      }
    };
    fetchListings();
  }, []);

  const filteredListings = useMemo(() => {
    let filtered = [...listings];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (l) =>
          l.title.toLowerCase().includes(query) ||
          l.address.street.toLowerCase().includes(query) ||
          l.neighborhood?.toLowerCase().includes(query) ||
          l.borough?.toLowerCase().includes(query)
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter((l) => l.status === statusFilter);
    }

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'price-asc': return a.price - b.price;
        case 'price-desc': return b.price - a.price;
        case 'createdAt': return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'updatedAt':
        default: return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
    });

    return filtered;
  }, [listings, searchQuery, statusFilter, sortBy]);

  const handleListingAction = (action: string, listing: Listing) => {
    switch (action) {
      case 'view':
        window.location.href = `/listings/${listing.id}`;
        break;
      case 'edit':
        window.location.href = `/dashboard/listings/${listing.id}/edit`;
        break;
      case 'publish':
        toast({ title: 'Listing published!', variant: 'success' });
        break;
      case 'unpublish':
        toast({ title: 'Listing unpublished', variant: 'info' });
        break;
      case 'archive':
        toast({ title: 'Listing archived', variant: 'info' });
        break;
      case 'delete':
        toast({ title: 'Listing deleted', variant: 'success' });
        break;
    }
  };

  if (authLoading || isLoadingData) {
    return (
      <div className="min-h-screen bg-surface-50">
        <Header />
        <main className="container-wide py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-10 w-64 bg-surface-200 rounded" />
            <div className="grid grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 bg-surface-200 rounded-xl" />)}
            </div>
            <div className="space-y-4">
              {[1, 2, 3].map((i) => <div key={i} className="h-40 bg-surface-200 rounded-xl" />)}
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!isAuthenticated || !user) return null;

  if (!isLandlord(user) && !isAgent(user)) {
    return (
      <div className="min-h-screen bg-surface-50">
        <Header />
        <main className="container-wide py-8">
          <Card className="max-w-lg mx-auto">
            <CardContent className="p-8 text-center">
              <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
              <h2 className="text-xl font-display font-semibold mb-2">Access Restricted</h2>
              <p className="text-surface-500 mb-4">Only landlords and agents can manage property listings.</p>
              <Button asChild><Link href="/dashboard">Return to Dashboard</Link></Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const statusCounts = {
    all: listings.length,
    ACTIVE: listings.filter((l) => l.status === 'ACTIVE').length,
    PENDING: listings.filter((l) => l.status === 'PENDING').length,
    DRAFT: listings.filter((l) => l.status === 'DRAFT').length,
    LEASED: listings.filter((l) => l.status === 'LEASED').length,
  };

  return (
    <div className="min-h-screen bg-surface-50">
      <Header />
      <main className="container-wide py-8">
        {/* Demo Mode Banner */}
        {apiError && (
          <DemoModeState
            title="My Listings"
            message="The listings API is not available. Showing demo data below."
            icon={Building2}
          />
        )}

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold text-surface-900">My Listings</h1>
            <p className="text-surface-500 mt-1">Manage your property listings and track performance.</p>
          </div>
          <Button asChild>
            <Link href="/dashboard/listings/new"><Plus className="h-4 w-4 mr-2" />Add Listing</Link>
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
          <StatCard title="Total Listings" value={MOCK_STATS.totalListings} icon={Building2} />
          <StatCard title="Active" value={MOCK_STATS.activeListings} icon={CheckCircle} />
          <StatCard title="Applications" value={MOCK_STATS.pendingApplications} change="+3 this week" trend="up" icon={Users} />
          <StatCard title="Monthly Revenue" value={formatCurrency(MOCK_STATS.monthlyRevenue)} icon={DollarSign} />
          <StatCard title="Avg. Days to Lease" value={MOCK_STATS.averageDaysToLease} change="-2 days" trend="up" icon={Calendar} />
          <StatCard title="Views This Week" value={MOCK_STATS.viewsThisWeek} change="+12%" trend="up" icon={TrendingUp} />
        </div>

        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-surface-400" />
                <Input
                  placeholder="Search by address, neighborhood..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2">
                {(['all', 'ACTIVE', 'PENDING', 'DRAFT', 'LEASED'] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={cn(
                      'px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      statusFilter === status
                        ? 'bg-luxury-bronze text-white'
                        : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
                    )}
                  >
                    {status === 'all' ? 'All' : status.charAt(0) + status.slice(1).toLowerCase()}
                    <span className="ml-1 text-xs opacity-70">({statusCounts[status]})</span>
                  </button>
                ))}
              </div>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="updatedAt">Recently Updated</SelectItem>
                  <SelectItem value="createdAt">Recently Created</SelectItem>
                  <SelectItem value="price-desc">Price: High to Low</SelectItem>
                  <SelectItem value="price-asc">Price: Low to High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {filteredListings.length > 0 ? (
          <div className="space-y-4">
            {filteredListings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} onAction={handleListingAction} />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-12 text-center">
              <Building2 className="h-16 w-16 text-surface-300 mx-auto mb-4" />
              <h3 className="text-xl font-display font-semibold text-surface-900 mb-2">
                {searchQuery || statusFilter !== 'all' ? 'No listings match your filters' : 'No listings yet'}
              </h3>
              <p className="text-surface-500 mb-6 max-w-md mx-auto">
                {searchQuery || statusFilter !== 'all'
                  ? 'Try adjusting your search or filters to find what you\'re looking for.'
                  : 'Create your first listing to start receiving applications from qualified tenants.'}
              </p>
              {!(searchQuery || statusFilter !== 'all') && (
                <Button asChild>
                  <Link href="/dashboard/listings/new"><Plus className="h-4 w-4 mr-2" />Create Your First Listing</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {filteredListings.length > 0 && (
          <div className="mt-8 p-6 bg-luxury-champagne/30 rounded-2xl border border-luxury-gold/20">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display font-semibold text-surface-900">Need help managing your listings?</h3>
                <p className="text-sm text-surface-600 mt-1">
                  Our AI assistant can help optimize your listings for better visibility and faster leasing.
                </p>
              </div>
              <Button variant="outline">Get AI Recommendations</Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
