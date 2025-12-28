/**
 * RealRiches Listings Hooks
 */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from '@/lib/api';
import type { Listing, ListingStatus, PropertyType, Market } from '@realriches/shared';

export interface ListingFilters {
  marketId?: string;
  minPrice?: number;
  maxPrice?: number;
  bedrooms?: number;
  bathrooms?: number;
  propertyType?: PropertyType;
  amenities?: string[];
  noFee?: boolean;
  status?: ListingStatus;
  page?: number;
  limit?: number;
}

// Fetch listings with filters
export function useListings(filters: ListingFilters = {}) {
  return useQuery({
    queryKey: ['listings', filters],
    queryFn: async () => {
      const client = getApiClient();
      const result = await client.listings.search(filters);
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to fetch listings');
      }
      return result.data!;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// Fetch single listing
export function useListing(id: string) {
  return useQuery({
    queryKey: ['listing', id],
    queryFn: async () => {
      const client = getApiClient();
      const result = await client.listings.get(id);
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to fetch listing');
      }
      return result.data!;
    },
    enabled: !!id,
  });
}

// Fetch featured listings for homepage
export function useFeaturedListings(marketId?: string) {
  return useQuery({
    queryKey: ['listings', 'featured', marketId],
    queryFn: async () => {
      const client = getApiClient();
      const result = await client.listings.search({
        marketId,
        status: 'ACTIVE',
        limit: 6,
      });
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to fetch listings');
      }
      return result.data!.listings;
    },
    staleTime: 1000 * 60 * 5,
  });
}

// Create listing mutation
export function useCreateListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<Listing>) => {
      const client = getApiClient();
      const result = await client.listings.create(data);
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to create listing');
      }
      return result.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listings'] });
    },
  });
}

// Update listing mutation
export function useUpdateListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Listing> }) => {
      const client = getApiClient();
      const result = await client.listings.update(id, data);
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to update listing');
      }
      return result.data!;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['listings'] });
      queryClient.invalidateQueries({ queryKey: ['listing', variables.id] });
    },
  });
}

// Toggle favorite mutation
export function useToggleFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ listingId, isFavorite }: { listingId: string; isFavorite: boolean }) => {
      const client = getApiClient();
      if (isFavorite) {
        await client.users.removeFavorite(listingId);
      } else {
        await client.users.addFavorite(listingId);
      }
      return !isFavorite;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
    },
  });
}

// Fetch user favorites
export function useFavorites() {
  return useQuery({
    queryKey: ['favorites'],
    queryFn: async () => {
      const client = getApiClient();
      const result = await client.users.getFavorites();
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to fetch favorites');
      }
      return result.data!;
    },
  });
}

// Fetch markets
export function useMarkets() {
  return useQuery({
    queryKey: ['markets'],
    queryFn: async () => {
      const client = getApiClient();
      const result = await client.markets.list();
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to fetch markets');
      }
      return result.data!;
    },
    staleTime: 1000 * 60 * 60, // 1 hour - markets rarely change
  });
}
