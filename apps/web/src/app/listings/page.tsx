'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, getPropertyTypeLabel } from '@/lib/utils';
import api from '@/lib/api-client';
import type { Listing } from '@/types';
import {
  Search,
  MapPin,
  Bed,
  Bath,
  Square,
  Building2,
  Filter,
  Grid,
  List,
  Heart,
  ChevronDown,
} from 'lucide-react';

export default function ListingsSearchPage() {
  const [listings, setListings] = React.useState<Listing[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [viewMode, setViewMode] = React.useState<'grid' | 'list'>('grid');
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [total, setTotal] = React.useState(0);

  const [filters, setFilters] = React.useState({
    search: '',
    minPrice: '',
    maxPrice: '',
    minBedrooms: '',
    propertyType: '',
    borough: '',
  });

  React.useEffect(() => {
    async function loadListings() {
      try {
        const response = await api.getListings({
          status: 'ACTIVE',
          minPrice: filters.minPrice ? parseInt(filters.minPrice) : undefined,
          maxPrice: filters.maxPrice ? parseInt(filters.maxPrice) : undefined,
          minBedrooms: filters.minBedrooms ? parseInt(filters.minBedrooms) : undefined,
          propertyType: filters.propertyType || undefined,
          borough: filters.borough || undefined,
          page,
          limit: 12,
        });
        setListings(response.listings || []);
        setTotalPages(response.totalPages || 1);
        setTotal(response.total || 0);
      } catch (error) {
        console.error('Failed to load listings:', error);
      } finally {
        setLoading(false);
      }
    }

    loadListings();
  }, [filters, page]);

  const filteredListings = listings.filter((listing) => {
    if (!filters.search) return true;
    const searchLower = filters.search.toLowerCase();
    return (
      listing.address.toLowerCase().includes(searchLower) ||
      listing.city.toLowerCase().includes(searchLower) ||
      listing.neighborhood?.toLowerCase().includes(searchLower) ||
      listing.borough?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/40 bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="font-heading text-2xl font-semibold tracking-tight">
            RealRiches
          </Link>
          <nav className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost" size="sm">Sign In</Button>
            </Link>
            <Link href="/register">
              <Button size="sm">Get Started</Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* Search Hero */}
      <section className="bg-gradient-to-b from-muted/50 to-background py-12">
        <div className="container mx-auto px-4">
          <h1 className="font-heading text-3xl md:text-4xl font-semibold text-center mb-8">
            Find Your Perfect NYC Rental
          </h1>

          {/* Search bar */}
          <div className="max-w-4xl mx-auto">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  placeholder="Search by neighborhood, address, or ZIP..."
                  value={filters.search}
                  onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                  className="pl-10 h-12"
                />
              </div>
              <Button size="lg" className="h-12">
                <Search className="h-4 w-4 mr-2" />
                Search
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Filters and Results */}
      <section className="container mx-auto px-4 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Filters sidebar */}
          <aside className="lg:w-64 space-y-6">
            <div>
              <h3 className="font-medium mb-3">Price Range</h3>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="Min"
                  value={filters.minPrice}
                  onChange={(e) => setFilters((f) => ({ ...f, minPrice: e.target.value }))}
                />
                <Input
                  type="number"
                  placeholder="Max"
                  value={filters.maxPrice}
                  onChange={(e) => setFilters((f) => ({ ...f, maxPrice: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <h3 className="font-medium mb-3">Bedrooms</h3>
              <div className="flex flex-wrap gap-2">
                {['', '0', '1', '2', '3', '4'].map((num) => (
                  <button
                    key={num}
                    onClick={() => setFilters((f) => ({ ...f, minBedrooms: num }))}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                      filters.minBedrooms === num
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    {num === '' ? 'Any' : num === '0' ? 'Studio' : `${num}+`}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h3 className="font-medium mb-3">Borough</h3>
              <select
                value={filters.borough}
                onChange={(e) => setFilters((f) => ({ ...f, borough: e.target.value }))}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
              >
                <option value="">All Boroughs</option>
                <option value="Manhattan">Manhattan</option>
                <option value="Brooklyn">Brooklyn</option>
                <option value="Queens">Queens</option>
                <option value="Bronx">Bronx</option>
                <option value="Staten Island">Staten Island</option>
              </select>
            </div>

            <div>
              <h3 className="font-medium mb-3">Property Type</h3>
              <select
                value={filters.propertyType}
                onChange={(e) => setFilters((f) => ({ ...f, propertyType: e.target.value }))}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
              >
                <option value="">All Types</option>
                <option value="STUDIO">Studio</option>
                <option value="ONE_BEDROOM">1 Bedroom</option>
                <option value="TWO_BEDROOM">2 Bedrooms</option>
                <option value="THREE_BEDROOM">3 Bedrooms</option>
                <option value="FOUR_PLUS_BEDROOM">4+ Bedrooms</option>
                <option value="LOFT">Loft</option>
                <option value="PENTHOUSE">Penthouse</option>
                <option value="TOWNHOUSE">Townhouse</option>
              </select>
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => setFilters({
                search: '',
                minPrice: '',
                maxPrice: '',
                minBedrooms: '',
                propertyType: '',
                borough: '',
              })}
            >
              Clear Filters
            </Button>
          </aside>

          {/* Results */}
          <div className="flex-1">
            {/* Results header */}
            <div className="flex items-center justify-between mb-6">
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">{total}</span> rentals available
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-md ${viewMode === 'grid' ? 'bg-muted' : 'hover:bg-muted'}`}
                >
                  <Grid className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded-md ${viewMode === 'list' ? 'bg-muted' : 'hover:bg-muted'}`}
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Listings */}
            {loading ? (
              <div className="text-center py-12 text-muted-foreground">
                Loading listings...
              </div>
            ) : filteredListings.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No listings found</h3>
                  <p className="text-muted-foreground">
                    Try adjusting your search or filters
                  </p>
                </CardContent>
              </Card>
            ) : viewMode === 'grid' ? (
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredListings.map((listing) => (
                  <ListingCard key={listing.id} listing={listing} />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredListings.map((listing) => (
                  <ListingListItem key={listing.id} listing={listing} />
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function ListingCard({ listing }: { listing: Listing }) {
  return (
    <Link href={`/listings/${listing.id}`}>
      <Card className="overflow-hidden hover:shadow-lg transition-shadow group">
        <div className="relative aspect-[4/3] bg-muted">
          {listing.photos?.[0]?.url ? (
            <img
              src={listing.photos[0].url}
              alt={listing.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Building2 className="h-12 w-12 text-muted-foreground" />
            </div>
          )}
          <button
            onClick={(e) => e.preventDefault()}
            className="absolute top-3 right-3 p-2 bg-card/80 backdrop-blur-sm rounded-full hover:bg-card transition-colors"
          >
            <Heart className="h-4 w-4" />
          </button>
          {listing.fareActCompliant && (
            <Badge className="absolute top-3 left-3 bg-green-500">FARE Compliant</Badge>
          )}
        </div>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <p className="font-heading text-xl font-semibold">
                {formatCurrency(listing.rentPrice || 0)}
                <span className="text-sm font-normal text-muted-foreground">/mo</span>
              </p>
            </div>
          </div>
          <h3 className="font-medium truncate">{listing.address}</h3>
          <div className="flex items-center gap-1 text-sm text-muted-foreground mb-3">
            <MapPin className="h-3.5 w-3.5" />
            <span className="truncate">
              {listing.neighborhood || listing.borough}, {listing.city}
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Bed className="h-4 w-4" />
              {listing.bedrooms} bd
            </span>
            <span className="flex items-center gap-1">
              <Bath className="h-4 w-4" />
              {listing.bathrooms} ba
            </span>
            {listing.squareFeet && (
              <span className="flex items-center gap-1">
                <Square className="h-4 w-4" />
                {listing.squareFeet.toLocaleString()} sqft
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function ListingListItem({ listing }: { listing: Listing }) {
  return (
    <Link href={`/listings/${listing.id}`}>
      <Card className="overflow-hidden hover:shadow-lg transition-shadow">
        <div className="flex">
          <div className="relative w-64 flex-shrink-0 bg-muted">
            {listing.photos?.[0]?.url ? (
              <img
                src={listing.photos[0].url}
                alt={listing.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center aspect-[4/3]">
                <Building2 className="h-12 w-12 text-muted-foreground" />
              </div>
            )}
          </div>
          <CardContent className="flex-1 p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="font-heading text-xl font-semibold">
                  {formatCurrency(listing.rentPrice || 0)}
                  <span className="text-sm font-normal text-muted-foreground">/mo</span>
                </p>
                <h3 className="font-medium">{listing.address}</h3>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  {listing.neighborhood || listing.borough}, {listing.city}
                </div>
              </div>
              <button
                onClick={(e) => e.preventDefault()}
                className="p-2 hover:bg-muted rounded-full transition-colors"
              >
                <Heart className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
              <span className="flex items-center gap-1">
                <Bed className="h-4 w-4" />
                {listing.bedrooms} bd
              </span>
              <span className="flex items-center gap-1">
                <Bath className="h-4 w-4" />
                {listing.bathrooms} ba
              </span>
              {listing.squareFeet && (
                <span className="flex items-center gap-1">
                  <Square className="h-4 w-4" />
                  {listing.squareFeet.toLocaleString()} sqft
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {listing.description || listing.aiDescription}
            </p>
          </CardContent>
        </div>
      </Card>
    </Link>
  );
}
