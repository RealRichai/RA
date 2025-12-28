/**
 * RealRiches Listings Page
 * Browse and search luxury rental properties
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useListings, useMarkets } from '@/hooks/useListings';
import { formatCurrency } from '@/lib/api';

const PROPERTY_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'APARTMENT', label: 'Apartment' },
  { value: 'CONDO', label: 'Condo' },
  { value: 'TOWNHOUSE', label: 'Townhouse' },
  { value: 'HOUSE', label: 'House' },
  { value: 'LOFT', label: 'Loft' },
  { value: 'PENTHOUSE', label: 'Penthouse' },
];

const BEDROOM_OPTIONS = [
  { value: '', label: 'Any' },
  { value: '0', label: 'Studio' },
  { value: '1', label: '1 BR' },
  { value: '2', label: '2 BR' },
  { value: '3', label: '3 BR' },
  { value: '4', label: '4+ BR' },
];

export default function ListingsPage() {
  const [filters, setFilters] = useState({
    marketId: '',
    minPrice: undefined as number | undefined,
    maxPrice: undefined as number | undefined,
    bedrooms: undefined as number | undefined,
    propertyType: '' as string,
    noFee: false,
    page: 1,
    limit: 12,
  });

  const { data: marketsData } = useMarkets();
  const { data: listingsData, isLoading, error } = useListings(filters);

  const handleFilterChange = (key: string, value: any) => {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  };

  return (
    <div className="min-h-screen bg-cream-50">
      {/* Search Header */}
      <div className="bg-charcoal-900 py-12">
        <div className="container mx-auto px-4">
          <h1 className="text-4xl font-display font-bold text-white mb-6">
            Find Your Perfect Home
          </h1>
          
          {/* Filter Bar */}
          <div className="bg-white rounded-lg p-4 shadow-luxury">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
              {/* Market Select */}
              <select
                value={filters.marketId}
                onChange={(e) => handleFilterChange('marketId', e.target.value)}
                className="input"
              >
                <option value="">All Markets</option>
                {marketsData?.map((market: any) => (
                  <option key={market.id} value={market.id}>
                    {market.name}
                  </option>
                ))}
              </select>

              {/* Property Type */}
              <select
                value={filters.propertyType}
                onChange={(e) => handleFilterChange('propertyType', e.target.value)}
                className="input"
              >
                {PROPERTY_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>

              {/* Bedrooms */}
              <select
                value={filters.bedrooms ?? ''}
                onChange={(e) => handleFilterChange('bedrooms', e.target.value ? parseInt(e.target.value) : undefined)}
                className="input"
              >
                {BEDROOM_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              {/* Min Price */}
              <input
                type="number"
                placeholder="Min Price"
                value={filters.minPrice ?? ''}
                onChange={(e) => handleFilterChange('minPrice', e.target.value ? parseInt(e.target.value) * 100 : undefined)}
                className="input"
              />

              {/* Max Price */}
              <input
                type="number"
                placeholder="Max Price"
                value={filters.maxPrice ? filters.maxPrice / 100 : ''}
                onChange={(e) => handleFilterChange('maxPrice', e.target.value ? parseInt(e.target.value) * 100 : undefined)}
                className="input"
              />

              {/* No Fee Toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.noFee}
                  onChange={(e) => handleFilterChange('noFee', e.target.checked)}
                  className="w-5 h-5 rounded border-charcoal-300 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-charcoal-700 font-medium">No Fee Only</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="container mx-auto px-4 py-12">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-teal-600 border-t-transparent"></div>
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-red-600">Failed to load listings. Please try again.</p>
          </div>
        ) : listingsData?.listings.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-charcoal-600 text-lg">No listings found matching your criteria.</p>
            <button
              onClick={() => setFilters({ ...filters, marketId: '', propertyType: '', bedrooms: undefined, minPrice: undefined, maxPrice: undefined, noFee: false })}
              className="mt-4 btn-secondary"
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <>
            <div className="flex justify-between items-center mb-6">
              <p className="text-charcoal-600">
                {listingsData?.total} properties found
              </p>
              <select className="input w-auto">
                <option value="newest">Newest First</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
              </select>
            </div>

            {/* Listings Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {listingsData?.listings.map((listing: any) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>

            {/* Pagination */}
            {listingsData && listingsData.total > filters.limit && (
              <div className="flex justify-center gap-2 mt-12">
                <button
                  onClick={() => handleFilterChange('page', filters.page - 1)}
                  disabled={filters.page === 1}
                  className="btn-outline disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="flex items-center px-4 text-charcoal-600">
                  Page {filters.page} of {Math.ceil(listingsData.total / filters.limit)}
                </span>
                <button
                  onClick={() => handleFilterChange('page', filters.page + 1)}
                  disabled={filters.page >= Math.ceil(listingsData.total / filters.limit)}
                  className="btn-outline disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ListingCard({ listing }: { listing: any }) {
  return (
    <Link href={`/listings/${listing.id}`} className="card-hover group">
      <div className="relative h-56 bg-charcoal-200 rounded-t-lg overflow-hidden">
        {listing.images?.[0] ? (
          <Image
            src={listing.images[0].url}
            alt={listing.title}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-charcoal-400">
            No Image
          </div>
        )}
        
        {/* Badges */}
        <div className="absolute top-3 left-3 flex gap-2">
          {listing.noFee && (
            <span className="bg-teal-600 text-white text-xs font-bold px-2 py-1 rounded">
              NO FEE
            </span>
          )}
          {listing.isNew && (
            <span className="bg-gold-500 text-charcoal-900 text-xs font-bold px-2 py-1 rounded">
              NEW
            </span>
          )}
        </div>
      </div>

      <div className="p-4">
        <div className="flex justify-between items-start mb-2">
          <h3 className="font-display text-xl font-semibold text-charcoal-900 group-hover:text-teal-600 transition-colors">
            {formatCurrency(listing.monthlyRent)}<span className="text-sm font-normal text-charcoal-500">/mo</span>
          </h3>
          <span className="text-xs text-charcoal-500 bg-charcoal-100 px-2 py-1 rounded">
            {listing.propertyType}
          </span>
        </div>

        <p className="text-charcoal-600 text-sm mb-2 line-clamp-1">
          {listing.address}, {listing.city}
        </p>

        <div className="flex gap-4 text-sm text-charcoal-500">
          <span>{listing.bedrooms === 0 ? 'Studio' : `${listing.bedrooms} BR`}</span>
          <span>{listing.bathrooms} BA</span>
          {listing.squareFeet && <span>{listing.squareFeet.toLocaleString()} SF</span>}
        </div>

        {/* FARE Act Compliance Badge */}
        <div className="mt-3 pt-3 border-t border-charcoal-100">
          <span className="text-xs text-teal-600 font-medium">
            ✓ FARE Act Compliant • App Fee: {formatCurrency(listing.applicationFee)}
          </span>
        </div>
      </div>
    </Link>
  );
}
