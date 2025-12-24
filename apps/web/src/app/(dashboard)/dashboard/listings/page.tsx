'use client';

import * as React from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { formatCurrency, formatDate, getStatusColor, getPropertyTypeLabel } from '@/lib/utils';
import api from '@/lib/api-client';
import type { Listing } from '@/types';
import {
  Plus,
  Search,
  Filter,
  MoreVertical,
  Eye,
  Edit,
  Trash2,
  Building2,
  MapPin,
  Bed,
  Bath,
  Square,
} from 'lucide-react';

export default function ListingsPage() {
  const { isLandlord, isAgent } = useAuth();
  const [listings, setListings] = React.useState<Listing[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('');
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);

  React.useEffect(() => {
    async function loadListings() {
      try {
        const response = await api.getMyListings({
          status: statusFilter || undefined,
          page,
          limit: 12,
        });
        setListings(response.listings || []);
        setTotalPages(response.totalPages || 1);
      } catch (error) {
        console.error('Failed to load listings:', error);
      } finally {
        setLoading(false);
      }
    }

    loadListings();
  }, [statusFilter, page]);

  const filteredListings = listings.filter((listing) =>
    listing.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
    listing.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
    listing.neighborhood?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this listing?')) return;

    try {
      await api.deleteListing(id);
      setListings((prev) => prev.filter((l) => l.id !== id));
    } catch (error) {
      console.error('Failed to delete listing:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-muted-foreground">Loading listings...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Listings</h1>
          <p className="text-muted-foreground">
            Manage your property listings
          </p>
        </div>
        {(isLandlord || isAgent) && (
          <Link href="/dashboard/listings/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Listing
            </Button>
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by address, city, or neighborhood..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-10 px-3 rounded-md border border-input bg-background text-sm"
        >
          <option value="">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="PENDING_REVIEW">Pending Review</option>
          <option value="ACTIVE">Active</option>
          <option value="RENTED">Rented</option>
          <option value="ARCHIVED">Archived</option>
        </select>
      </div>

      {/* Listings grid */}
      {filteredListings.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No listings found</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery || statusFilter
                ? 'Try adjusting your search or filters'
                : 'Create your first listing to get started'}
            </p>
            {(isLandlord || isAgent) && !searchQuery && !statusFilter && (
              <Link href="/dashboard/listings/new">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Listing
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredListings.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              onDelete={() => handleDelete(listing.id)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
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
  );
}

function ListingCard({
  listing,
  onDelete,
}: {
  listing: Listing;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      {/* Image */}
      <div className="relative aspect-[4/3] bg-muted">
        {listing.photos?.[0]?.url ? (
          <img
            src={listing.photos[0].url}
            alt={listing.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Building2 className="h-12 w-12 text-muted-foreground" />
          </div>
        )}
        <Badge className={`absolute top-2 left-2 ${getStatusColor(listing.status)}`}>
          {listing.status.replace(/_/g, ' ')}
        </Badge>
        <div className="absolute top-2 right-2">
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-1.5 bg-card/80 backdrop-blur-sm rounded-md hover:bg-card transition-colors"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute right-0 mt-1 w-40 bg-card border border-border rounded-md shadow-lg z-20">
                  <Link
                    href={`/listings/${listing.id}`}
                    className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors"
                  >
                    <Eye className="h-4 w-4" />
                    View
                  </Link>
                  <Link
                    href={`/dashboard/listings/${listing.id}/edit`}
                    className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors"
                  >
                    <Edit className="h-4 w-4" />
                    Edit
                  </Link>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <CardContent className="p-4">
        <div className="mb-2">
          <h3 className="font-medium truncate">{listing.title || listing.address}</h3>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            <span className="truncate">
              {listing.neighborhood || listing.city}, {listing.state}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
          <span className="flex items-center gap-1">
            <Bed className="h-4 w-4" />
            {listing.bedrooms}
          </span>
          <span className="flex items-center gap-1">
            <Bath className="h-4 w-4" />
            {listing.bathrooms}
          </span>
          {listing.squareFeet && (
            <span className="flex items-center gap-1">
              <Square className="h-4 w-4" />
              {listing.squareFeet.toLocaleString()} sqft
            </span>
          )}
        </div>

        <div className="flex items-center justify-between">
          <span className="font-heading text-lg font-semibold">
            {formatCurrency(listing.rentPrice || 0)}
            <span className="text-sm font-normal text-muted-foreground">/mo</span>
          </span>
          <span className="text-xs text-muted-foreground">
            {listing.viewCount} views
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
