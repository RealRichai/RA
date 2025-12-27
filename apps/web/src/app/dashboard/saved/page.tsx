'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Heart,
  MapPin,
  Bed,
  Bath,
  Square,
  Calendar,
  Building2,
  ExternalLink,
  Trash2,
  Search,
  SlidersHorizontal,
  Loader2,
  HeartOff,
  AlertCircle,
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
import { Header } from '@/components/layout/header';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { useRequireAuth, useSavedListings, useUnsaveListing } from '@/hooks';
import { DemoModeState } from '@/components/ui/demo-mode-state';
import type { Listing } from '@/lib/api';

// Demo saved listings for when API is unavailable
const DEMO_SAVED_LISTINGS: Listing[] = [
  {
    id: 'saved-1',
    title: 'Stunning 2BR with Manhattan Skyline Views',
    price: 4500,
    bedrooms: 2,
    bathrooms: 1,
    squareFeet: 950,
    address: { street: '123 Bedford Ave', unit: '4B', city: 'Brooklyn', state: 'NY', zipCode: '11211' },
    borough: 'Brooklyn',
    neighborhood: 'Williamsburg',
    photos: [],
    amenities: ['DISHWASHER', 'IN_UNIT_LAUNDRY', 'ROOFTOP_ACCESS'],
    status: 'ACTIVE',
    availableDate: '2025-01-15',
    fareActCompliant: true,
    moveInCosts: { total: 9000 },
    createdAt: '2024-12-20',
  },
  {
    id: 'saved-2',
    title: 'Spacious Studio in Historic Brownstone',
    price: 2800,
    bedrooms: 0,
    bathrooms: 1,
    squareFeet: 550,
    address: { street: '456 Park Place', unit: '', city: 'Brooklyn', state: 'NY', zipCode: '11238' },
    borough: 'Brooklyn',
    neighborhood: 'Prospect Heights',
    photos: [],
    amenities: ['GARDEN_ACCESS', 'PET_FRIENDLY'],
    status: 'ACTIVE',
    availableDate: '2025-02-01',
    fareActCompliant: true,
    moveInCosts: { total: 5600 },
    createdAt: '2024-12-18',
  },
  {
    id: 'saved-3',
    title: 'Modern 1BR in Astoria',
    price: 2400,
    bedrooms: 1,
    bathrooms: 1,
    squareFeet: 680,
    address: { street: '30-15 Steinway St', unit: '3F', city: 'Astoria', state: 'NY', zipCode: '11103' },
    borough: 'Queens',
    neighborhood: 'Astoria',
    photos: [],
    amenities: ['DOORMAN', 'GYM', 'ELEVATOR'],
    status: 'ACTIVE',
    availableDate: '2025-01-01',
    fareActCompliant: false,
    moveInCosts: { total: 4800 },
    createdAt: '2024-12-15',
  },
  {
    id: 'saved-4',
    title: 'Luxury 3BR Penthouse with Terrace',
    price: 8500,
    bedrooms: 3,
    bathrooms: 2,
    squareFeet: 1800,
    address: { street: '245 East 72nd St', unit: 'PH', city: 'New York', state: 'NY', zipCode: '10021' },
    borough: 'Manhattan',
    neighborhood: 'Upper East Side',
    photos: [],
    amenities: ['PRIVATE_TERRACE', 'DOORMAN', 'CONCIERGE', 'GYM'],
    status: 'ACTIVE',
    availableDate: '2025-01-20',
    fareActCompliant: true,
    moveInCosts: { total: 17000 },
    createdAt: '2024-12-10',
  },
] as unknown as Listing[];

// =============================================================================
// SAVED LISTING CARD
// =============================================================================

function SavedListingCard({
  listing,
  onUnsave,
  isUnsaving,
}: {
  listing: Listing;
  onUnsave: () => void;
  isUnsaving: boolean;
}) {
  const router = useRouter();

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow">
      <div className="flex flex-col md:flex-row">
        {/* Image */}
        <div
          className="relative w-full md:w-64 h-48 md:h-auto cursor-pointer"
          onClick={() => router.push(`/listings/${listing.id}`)}
        >
          {listing.photos?.[0] ? (
            <img
              src={listing.photos[0]}
              alt={listing.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-surface-100 flex items-center justify-center">
              <Building2 className="h-12 w-12 text-surface-300" />
            </div>
          )}
          
          {/* Status Badge */}
          <div className="absolute top-3 left-3">
            <Badge
              variant={listing.status === 'ACTIVE' ? 'success' : 'default'}
            >
              {listing.status === 'ACTIVE' ? 'Available' : listing.status}
            </Badge>
          </div>

          {/* FARE Act Badge */}
          {listing.fareActCompliant && (
            <div className="absolute top-3 right-3">
              <Badge variant="outline" className="bg-white/90 text-xs">
                FARE Act
              </Badge>
            </div>
          )}
        </div>

        {/* Content */}
        <CardContent className="flex-1 p-5">
          <div className="flex justify-between items-start mb-3">
            <div className="flex-1 min-w-0">
              <Link
                href={`/listings/${listing.id}`}
                className="hover:text-luxury-bronze transition-colors"
              >
                <h3 className="font-semibold text-lg text-surface-900 truncate">
                  {listing.title}
                </h3>
              </Link>
              <div className="flex items-center text-surface-500 text-sm mt-1">
                <MapPin className="h-4 w-4 mr-1 flex-shrink-0" />
                <span className="truncate">
                  {listing.neighborhood || listing.borough}, {listing.address.city}
                </span>
              </div>
            </div>
            
            <div className="text-right flex-shrink-0 ml-4">
              <p className="text-2xl font-bold text-luxury-bronze">
                {formatCurrency(listing.price)}
              </p>
              <p className="text-xs text-surface-500">/month</p>
            </div>
          </div>

          {/* Property Details */}
          <div className="flex flex-wrap gap-4 text-sm text-surface-600 mb-4">
            <div className="flex items-center gap-1">
              <Bed className="h-4 w-4" />
              <span>{listing.bedrooms === 0 ? 'Studio' : `${listing.bedrooms} BR`}</span>
            </div>
            <div className="flex items-center gap-1">
              <Bath className="h-4 w-4" />
              <span>{listing.bathrooms} BA</span>
            </div>
            {listing.squareFeet && (
              <div className="flex items-center gap-1">
                <Square className="h-4 w-4" />
                <span>{listing.squareFeet.toLocaleString()} sqft</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              <span>Available {formatDate(listing.availableDate)}</span>
            </div>
          </div>

          {/* Move-in Costs */}
          <div className="bg-surface-50 rounded-lg p-3 mb-4">
            <p className="text-xs text-surface-500 mb-1">Move-in Cost</p>
            <p className="font-semibold text-surface-900">
              {formatCurrency(listing.moveInCosts?.total || listing.price * 2)}
            </p>
          </div>

          {/* Amenities Preview */}
          {listing.amenities?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {listing.amenities.slice(0, 4).map((amenity) => (
                <Badge key={amenity} variant="default" className="text-xs">
                  {amenity.replace(/_/g, ' ')}
                </Badge>
              ))}
              {listing.amenities.length > 4 && (
                <Badge variant="outline" className="text-xs">
                  +{listing.amenities.length - 4} more
                </Badge>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-3 border-t">
            <Button
              asChild
              className="flex-1"
            >
              <Link href={`/listings/${listing.id}`}>
                View Details
                <ExternalLink className="h-4 w-4 ml-2" />
              </Link>
            </Button>
            
            {listing.status === 'ACTIVE' && (
              <Button
                variant="outline"
                asChild
              >
                <Link href={`/listings/${listing.id}/apply`}>
                  Apply Now
                </Link>
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              onClick={onUnsave}
              disabled={isUnsaving}
              className="text-red-500 hover:text-red-600 hover:bg-red-50"
            >
              {isUnsaving ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Trash2 className="h-5 w-5" />
              )}
            </Button>
          </div>
        </CardContent>
      </div>
    </Card>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function SavedListingsPage() {
  const router = useRouter();
  const { isLoading: authLoading } = useRequireAuth();
  const { data: savedListings, isLoading: listingsLoading, isError, refetch } = useSavedListings();
  const { mutate: unsaveListing, isPending: isUnsaving } = useUnsaveListing();

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'price_asc' | 'price_desc'>('date');
  const [unsavingId, setUnsavingId] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);

  const isLoading = authLoading || listingsLoading;

  // Determine if we should use demo data (API error or empty response with error)
  useEffect(() => {
    if (!listingsLoading && isError) {
      setIsDemoMode(true);
    }
  }, [listingsLoading, isError]);

  // Use demo data if API failed
  const displayListings = isDemoMode ? DEMO_SAVED_LISTINGS : savedListings;

  // Filter and sort listings
  const filteredListings = (displayListings || [])
    .filter((listing) => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        listing.title.toLowerCase().includes(query) ||
        listing.address.street.toLowerCase().includes(query) ||
        listing.neighborhood?.toLowerCase().includes(query) ||
        listing.borough?.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'price_asc':
          return a.price - b.price;
        case 'price_desc':
          return b.price - a.price;
        case 'date':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

  const handleUnsave = (listingId: string) => {
    setUnsavingId(listingId);
    unsaveListing(listingId, {
      onSettled: () => {
        setUnsavingId(null);
        refetch();
      },
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface-50">
        <Header />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-luxury-gold" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-50">
      <Header />

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Demo Mode Banner */}
        {isDemoMode && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800">Demo Mode</p>
              <p className="text-sm text-amber-600">Showing sample saved listings. Connect to the API for real data.</p>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-surface-900 mb-2">
            Saved Listings
          </h1>
          <p className="text-surface-600">
            Properties you've saved for later. {displayListings?.length || 0} saved.
          </p>
        </div>

        {/* Filters */}
        {(displayListings?.length || 0) > 0 && (
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-surface-400" />
              <Input
                placeholder="Search saved listings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
              <SelectTrigger className="w-48">
                <SlidersHorizontal className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date">Recently Saved</SelectItem>
                <SelectItem value="price_asc">Price: Low to High</SelectItem>
                <SelectItem value="price_desc">Price: High to Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Listings */}
        {filteredListings.length > 0 ? (
          <div className="space-y-4">
            {filteredListings.map((listing) => (
              <SavedListingCard
                key={listing.id}
                listing={listing}
                onUnsave={() => handleUnsave(listing.id)}
                isUnsaving={unsavingId === listing.id}
              />
            ))}
          </div>
        ) : displayListings?.length === 0 && !isDemoMode ? (
          /* Empty State */
          <Card className="py-16">
            <div className="text-center">
              <div className="w-20 h-20 bg-surface-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <HeartOff className="h-10 w-10 text-surface-400" />
              </div>
              <h2 className="text-xl font-semibold text-surface-900 mb-2">
                No Saved Listings Yet
              </h2>
              <p className="text-surface-600 mb-6 max-w-md mx-auto">
                Start exploring available properties and save the ones you like by clicking the heart icon.
              </p>
              <Button onClick={() => router.push('/listings')}>
                <Search className="h-4 w-4 mr-2" />
                Browse Listings
              </Button>
            </div>
          </Card>
        ) : (
          /* No Results from Search */
          <Card className="py-12">
            <div className="text-center">
              <Search className="h-12 w-12 text-surface-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-surface-900 mb-2">
                No Matching Listings
              </h3>
              <p className="text-surface-600 mb-4">
                Try adjusting your search terms.
              </p>
              <Button variant="outline" onClick={() => setSearchQuery('')}>
                Clear Search
              </Button>
            </div>
          </Card>
        )}

        {/* Quick Stats */}
        {(displayListings?.length || 0) > 0 && (
          <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4 text-center">
              <p className="text-2xl font-bold text-surface-900">
                {displayListings?.length || 0}
              </p>
              <p className="text-sm text-surface-500">Saved</p>
            </Card>
            <Card className="p-4 text-center">
              <p className="text-2xl font-bold text-emerald-600">
                {displayListings?.filter(l => l.status === 'ACTIVE').length || 0}
              </p>
              <p className="text-sm text-surface-500">Available</p>
            </Card>
            <Card className="p-4 text-center">
              <p className="text-2xl font-bold text-luxury-bronze">
                {displayListings && displayListings.length > 0
                  ? formatCurrency(
                      Math.round(
                        displayListings.reduce((sum, l) => sum + l.price, 0) / displayListings.length
                      )
                    )
                  : '$0'}
              </p>
              <p className="text-sm text-surface-500">Avg. Price</p>
            </Card>
            <Card className="p-4 text-center">
              <p className="text-2xl font-bold text-surface-900">
                {displayListings?.filter(l => l.fareActCompliant).length || 0}
              </p>
              <p className="text-sm text-surface-500">FARE Act</p>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
