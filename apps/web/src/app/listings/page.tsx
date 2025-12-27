'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Search,
  SlidersHorizontal,
  MapPin,
  Bed,
  Bath,
  Square,
  Heart,
  Calendar,
  Grid3X3,
  List,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge, FareActBadge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { useSaveListing, useUnsaveListing, useSavedListings } from '@/hooks';
import { useAuthStore } from '@/stores/auth';
import type { Listing } from '@/lib/api';

const boroughs = [
  { value: 'all', label: 'All Boroughs' },
  { value: 'Manhattan', label: 'Manhattan' },
  { value: 'Brooklyn', label: 'Brooklyn' },
  { value: 'Queens', label: 'Queens' },
  { value: 'Bronx', label: 'Bronx' },
  { value: 'Staten Island', label: 'Staten Island' },
  { value: 'Long Island', label: 'Long Island' },
];

const bedroomOptions = [
  { value: 'any', label: 'Any Beds' },
  { value: '0', label: 'Studio' },
  { value: '1', label: '1 Bed' },
  { value: '2', label: '2 Beds' },
  { value: '3', label: '3 Beds' },
  { value: '4', label: '4+ Beds' },
];

const priceRanges = [
  { value: 'any', label: 'Any Price' },
  { value: '0-1500', label: 'Under $1,500' },
  { value: '1500-2500', label: '$1,500 - $2,500' },
  { value: '2500-3500', label: '$2,500 - $3,500' },
  { value: '3500-5000', label: '$3,500 - $5,000' },
  { value: '5000-7500', label: '$5,000 - $7,500' },
  { value: '7500+', label: '$7,500+' },
];

const sortOptions = [
  { value: 'createdAt:desc', label: 'Newest First' },
  { value: 'price:asc', label: 'Price: Low to High' },
  { value: 'price:desc', label: 'Price: High to Low' },
  { value: 'availableDate:asc', label: 'Available Soonest' },
];

const mockListings: Listing[] = [
  {
    id: '1',
    title: 'Stunning 2BR with Manhattan Skyline Views',
    description: 'Beautiful apartment with floor-to-ceiling windows.',
    propertyType: 'APARTMENT',
    status: 'ACTIVE',
    price: 3500,
    bedrooms: 2,
    bathrooms: 1,
    squareFeet: 950,
    address: { street: '123 Bedford Ave', unit: '4B', city: 'Brooklyn', state: 'NY', zipCode: '11211' },
    neighborhood: 'Williamsburg',
    borough: 'Brooklyn',
    amenities: ['Dishwasher', 'Laundry', 'Doorman', 'Gym'],
    photos: [],
    availableDate: '2025-01-15',
    leaseTermMonths: 12,
    petsAllowed: true,
    petPolicy: 'Cats and small dogs allowed',
    applicationFee: 20,
    securityDeposit: 3500,
    brokerFeePaidBy: 'LANDLORD',
    moveInCosts: { firstMonth: 3500, securityDeposit: 3500, brokerFee: 0, applicationFee: 20, total: 7020 },
    fareActCompliant: true,
    landlordId: 'landlord1',
    createdAt: '2024-12-10T10:00:00Z',
    updatedAt: '2024-12-10T10:00:00Z',
  },
  {
    id: '2',
    title: 'Spacious Studio in Historic Brownstone',
    description: 'Charming studio with exposed brick and high ceilings.',
    propertyType: 'STUDIO',
    status: 'ACTIVE',
    price: 2200,
    bedrooms: 0,
    bathrooms: 1,
    squareFeet: 450,
    address: { street: '456 Park Place', city: 'Brooklyn', state: 'NY', zipCode: '11238' },
    neighborhood: 'Prospect Heights',
    borough: 'Brooklyn',
    amenities: ['Laundry', 'Garden', 'Storage'],
    photos: [],
    availableDate: '2025-01-01',
    leaseTermMonths: 12,
    petsAllowed: false,
    applicationFee: 20,
    securityDeposit: 2200,
    brokerFeePaidBy: 'LANDLORD',
    moveInCosts: { firstMonth: 2200, securityDeposit: 2200, brokerFee: 0, applicationFee: 20, total: 4420 },
    fareActCompliant: true,
    landlordId: 'landlord2',
    createdAt: '2024-12-08T10:00:00Z',
    updatedAt: '2024-12-08T10:00:00Z',
  },
  {
    id: '3',
    title: 'Luxury 3BR Penthouse with Terrace',
    description: 'Stunning penthouse with private outdoor space.',
    propertyType: 'APARTMENT',
    status: 'ACTIVE',
    price: 8500,
    bedrooms: 3,
    bathrooms: 2,
    squareFeet: 1800,
    address: { street: '789 West End Ave', unit: 'PH-A', city: 'New York', state: 'NY', zipCode: '10025' },
    neighborhood: 'Upper West Side',
    borough: 'Manhattan',
    amenities: ['Doorman', 'Gym', 'Roof Deck', 'Concierge', 'Parking'],
    photos: [],
    availableDate: '2025-02-01',
    leaseTermMonths: 24,
    petsAllowed: true,
    petPolicy: 'All pets welcome',
    applicationFee: 20,
    securityDeposit: 8500,
    brokerFeePaidBy: 'LANDLORD',
    moveInCosts: { firstMonth: 8500, securityDeposit: 8500, brokerFee: 0, applicationFee: 20, total: 17020 },
    fareActCompliant: true,
    landlordId: 'landlord3',
    createdAt: '2024-12-12T10:00:00Z',
    updatedAt: '2024-12-12T10:00:00Z',
  },
  {
    id: '4',
    title: 'Modern 1BR in Astoria',
    description: 'Recently renovated with stainless steel appliances.',
    propertyType: 'APARTMENT',
    status: 'ACTIVE',
    price: 2400,
    bedrooms: 1,
    bathrooms: 1,
    squareFeet: 650,
    address: { street: '30-15 Steinway St', unit: '3F', city: 'Astoria', state: 'NY', zipCode: '11103' },
    neighborhood: 'Astoria',
    borough: 'Queens',
    amenities: ['Dishwasher', 'Laundry in Building'],
    photos: [],
    availableDate: '2025-01-10',
    leaseTermMonths: 12,
    petsAllowed: true,
    petPolicy: 'Small pets only',
    applicationFee: 20,
    securityDeposit: 2400,
    brokerFeePaidBy: 'LANDLORD',
    moveInCosts: { firstMonth: 2400, securityDeposit: 2400, brokerFee: 0, applicationFee: 20, total: 4820 },
    fareActCompliant: true,
    landlordId: 'landlord4',
    createdAt: '2024-12-11T10:00:00Z',
    updatedAt: '2024-12-11T10:00:00Z',
  },
];

function ListingCard({ listing, isSaved, onToggleSave }: {
  listing: Listing;
  isSaved: boolean;
  onToggleSave: () => void;
}) {
  const { isAuthenticated } = useAuthStore();

  return (
    <Card className="group overflow-hidden hover:shadow-card-hover hover:-translate-y-1 transition-all duration-300">
      <div className="relative aspect-[16/10] bg-surface-100 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-luxury-bronze/20 to-luxury-gold/20 group-hover:scale-105 transition-transform duration-500" />
        <div className="absolute top-4 left-4 flex flex-wrap gap-2">
          {listing.fareActCompliant && <FareActBadge compliant />}
          {listing.petsAllowed && <Badge variant="info">Pet Friendly</Badge>}
        </div>
        {isAuthenticated && (
          <button
            onClick={(e) => { e.preventDefault(); onToggleSave(); }}
            className={cn(
              'absolute top-4 right-4 h-10 w-10 rounded-full flex items-center justify-center transition-all',
              isSaved ? 'bg-red-500 text-white' : 'bg-white/90 text-surface-600 hover:bg-white hover:text-red-500'
            )}
          >
            <Heart className={cn('h-5 w-5', isSaved && 'fill-current')} />
          </button>
        )}
      </div>
      <Link href={`/listings/${listing.id}`} className="block p-5">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-2xl font-display font-bold text-surface-900">{formatCurrency(listing.price)}</span>
          <span className="text-sm text-surface-500">/month</span>
        </div>
        <h3 className="font-semibold text-surface-900 mb-2 line-clamp-1 group-hover:text-luxury-bronze transition-colors">
          {listing.title}
        </h3>
        <div className="flex items-center gap-1 text-sm text-surface-600 mb-3">
          <MapPin className="h-4 w-4" />
          <span>{listing.neighborhood}, {listing.borough}</span>
        </div>
        <div className="flex items-center gap-4 text-sm text-surface-600 mb-4">
          <div className="flex items-center gap-1">
            <Bed className="h-4 w-4" />
            <span>{listing.bedrooms === 0 ? 'Studio' : `${listing.bedrooms} bed`}</span>
          </div>
          <div className="flex items-center gap-1">
            <Bath className="h-4 w-4" />
            <span>{listing.bathrooms} bath</span>
          </div>
          {listing.squareFeet && (
            <div className="flex items-center gap-1">
              <Square className="h-4 w-4" />
              <span>{listing.squareFeet} sqft</span>
            </div>
          )}
        </div>
        <div className="pt-4 border-t border-surface-100">
          <div className="flex justify-between items-center text-sm">
            <span className="text-surface-500">Move-in Cost</span>
            <span className="font-semibold text-surface-900">{formatCurrency(listing.moveInCosts.total)}</span>
          </div>
          <div className="flex items-center gap-1 mt-1 text-xs text-surface-500">
            <Calendar className="h-3 w-3" />
            <span>Available {formatDate(listing.availableDate)}</span>
          </div>
        </div>
      </Link>
    </Card>
  );
}

function ListingsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [query, setQuery] = useState(searchParams.get('query') || '');
  const [borough, setBorough] = useState(searchParams.get('borough') || 'all');
  const [bedrooms, setBedrooms] = useState(searchParams.get('bedrooms') || 'any');
  const [priceRange, setPriceRange] = useState(searchParams.get('price') || 'any');
  const [sort, setSort] = useState(searchParams.get('sort') || 'createdAt:desc');

  const listings = mockListings;
  const isLoading = false;

  const { data: savedListings } = useSavedListings();
  const saveMutation = useSaveListing();
  const unsaveMutation = useUnsaveListing();
  const savedIds = new Set(savedListings?.map((l) => l.id) || []);

  const updateFilters = () => {
    const params = new URLSearchParams();
    if (query) params.set('query', query);
    if (borough !== 'all') params.set('borough', borough);
    if (bedrooms !== 'any') params.set('bedrooms', bedrooms);
    if (priceRange !== 'any') params.set('price', priceRange);
    if (sort !== 'createdAt:desc') params.set('sort', sort);
    router.push(`/listings?${params.toString()}`);
  };

  const clearFilters = () => {
    setQuery('');
    setBorough('all');
    setBedrooms('any');
    setPriceRange('any');
    setSort('createdAt:desc');
    router.push('/listings');
  };

  const activeFilterCount = [borough !== 'all', bedrooms !== 'any', priceRange !== 'any'].filter(Boolean).length;

  return (
    <div className="min-h-screen flex flex-col bg-surface-50">
      <Header />
      <main className="flex-1">
        <div className="sticky top-16 z-30 bg-white border-b border-surface-100 shadow-sm">
          <div className="container-wide py-4">
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-surface-400" />
                <Input
                  type="text"
                  placeholder="Search by neighborhood, address, or ZIP..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && updateFilters()}
                  className="pl-12"
                />
              </div>
              <div className="hidden lg:flex items-center gap-3">
                <Select value={borough} onValueChange={setBorough}>
                  <SelectTrigger className="w-[160px]"><SelectValue placeholder="Borough" /></SelectTrigger>
                  <SelectContent>
                    {boroughs.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={bedrooms} onValueChange={setBedrooms}>
                  <SelectTrigger className="w-[130px]"><SelectValue placeholder="Beds" /></SelectTrigger>
                  <SelectContent>
                    {bedroomOptions.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={priceRange} onValueChange={setPriceRange}>
                  <SelectTrigger className="w-[160px]"><SelectValue placeholder="Price" /></SelectTrigger>
                  <SelectContent>
                    {priceRanges.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button onClick={updateFilters}>Search</Button>
                {activeFilterCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>Clear ({activeFilterCount})</Button>
                )}
              </div>
              <div className="flex lg:hidden gap-2">
                <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="flex-1">
                      <SlidersHorizontal className="h-4 w-4 mr-2" />
                      Filters
                      {activeFilterCount > 0 && <Badge variant="gold" className="ml-2">{activeFilterCount}</Badge>}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader><DialogTitle>Filters</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Borough</label>
                        <Select value={borough} onValueChange={setBorough}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {boroughs.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Bedrooms</label>
                        <Select value={bedrooms} onValueChange={setBedrooms}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {bedroomOptions.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Price Range</label>
                        <Select value={priceRange} onValueChange={setPriceRange}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {priceRanges.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1" onClick={clearFilters}>Clear All</Button>
                      <Button className="flex-1" onClick={() => { updateFilters(); setFiltersOpen(false); }}>Apply</Button>
                    </div>
                  </DialogContent>
                </Dialog>
                <Button onClick={updateFilters}>Search</Button>
              </div>
            </div>
          </div>
        </div>

        <div className="container-wide py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-display font-bold text-surface-900">{listings.length} Rentals Available</h1>
              <p className="text-sm text-surface-500">All listings are FARE Act compliant</p>
            </div>
            <div className="flex items-center gap-3">
              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {sortOptions.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="hidden sm:flex border border-surface-200 rounded-lg p-1">
                <button onClick={() => setViewMode('grid')} className={cn('p-2 rounded-md transition-colors', viewMode === 'grid' ? 'bg-surface-100' : 'hover:bg-surface-50')}>
                  <Grid3X3 className="h-4 w-4" />
                </button>
                <button onClick={() => setViewMode('list')} className={cn('p-2 rounded-md transition-colors', viewMode === 'list' ? 'bg-surface-100' : 'hover:bg-surface-50')}>
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-2xl bg-white overflow-hidden">
                  <div className="aspect-[16/10] bg-surface-100 skeleton" />
                  <div className="p-5 space-y-3">
                    <div className="h-8 bg-surface-100 rounded skeleton" />
                    <div className="h-4 bg-surface-100 rounded w-3/4 skeleton" />
                  </div>
                </div>
              ))}
            </div>
          ) : listings.length === 0 ? (
            <div className="text-center py-16">
              <div className="h-16 w-16 mx-auto mb-4 rounded-full bg-surface-100 flex items-center justify-center">
                <Search className="h-8 w-8 text-surface-400" />
              </div>
              <h3 className="text-lg font-semibold text-surface-900 mb-2">No listings found</h3>
              <p className="text-surface-500 mb-6">Try adjusting your filters or search terms</p>
              <Button variant="outline" onClick={clearFilters}>Clear All Filters</Button>
            </div>
          ) : (
            <div className={cn(viewMode === 'grid' ? 'grid md:grid-cols-2 lg:grid-cols-3 gap-6' : 'space-y-4')}>
              {listings.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  isSaved={savedIds.has(listing.id)}
                  onToggleSave={() => savedIds.has(listing.id) ? unsaveMutation.mutate(listing.id) : saveMutation.mutate(listing.id)}
                />
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

export default function ListingsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <ListingsContent />
    </Suspense>
  );
}
