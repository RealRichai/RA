/**
 * RealRiches Search Screen
 */

import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { Link } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';

// Mock data for demo
const MOCK_LISTINGS = [
  {
    id: '1',
    title: 'Luxury 2BR in Tribeca',
    address: '123 Hudson St',
    city: 'New York',
    monthlyRent: 850000,
    bedrooms: 2,
    bathrooms: 2,
    squareFeet: 1200,
    noFee: true,
    image: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=400',
  },
  {
    id: '2',
    title: 'Modern Studio in Chelsea',
    address: '456 W 23rd St',
    city: 'New York',
    monthlyRent: 350000,
    bedrooms: 0,
    bathrooms: 1,
    squareFeet: 550,
    noFee: false,
    image: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=400',
  },
  {
    id: '3',
    title: 'Spacious 3BR in Park Slope',
    address: '789 7th Ave',
    city: 'Brooklyn',
    monthlyRent: 650000,
    bedrooms: 3,
    bathrooms: 2,
    squareFeet: 1800,
    noFee: true,
    image: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=400',
  },
];

const formatCurrency = (cents: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
};

export default function SearchScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // In production, this would fetch from API
  const { data: listings, isLoading } = useQuery({
    queryKey: ['listings', searchQuery],
    queryFn: async () => {
      // Simulate API delay
      await new Promise((resolve) => setTimeout(resolve, 500));
      return MOCK_LISTINGS.filter(
        (l) =>
          l.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          l.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
          l.city.toLowerCase().includes(searchQuery.toLowerCase())
      );
    },
  });

  const renderListing = useCallback(
    ({ item }: { item: typeof MOCK_LISTINGS[0] }) => (
      <Link href={`/listing/${item.id}`} asChild>
        <TouchableOpacity style={styles.listingCard}>
          <Image source={{ uri: item.image }} style={styles.listingImage} contentFit="cover" />
          
          {item.noFee && (
            <View style={styles.noFeeBadge}>
              <Text style={styles.noFeeText}>NO FEE</Text>
            </View>
          )}

          <View style={styles.listingContent}>
            <Text style={styles.listingPrice}>
              {formatCurrency(item.monthlyRent)}
              <Text style={styles.listingPriceMonth}>/mo</Text>
            </Text>
            
            <Text style={styles.listingTitle} numberOfLines={1}>
              {item.title}
            </Text>
            
            <Text style={styles.listingAddress} numberOfLines={1}>
              {item.address}, {item.city}
            </Text>

            <View style={styles.listingStats}>
              <Text style={styles.listingStat}>
                {item.bedrooms === 0 ? 'Studio' : `${item.bedrooms} BR`}
              </Text>
              <Text style={styles.listingStatDivider}>•</Text>
              <Text style={styles.listingStat}>{item.bathrooms} BA</Text>
              <Text style={styles.listingStatDivider}>•</Text>
              <Text style={styles.listingStat}>{item.squareFeet.toLocaleString()} SF</Text>
            </View>
          </View>
        </TouchableOpacity>
      </Link>
    ),
    []
  );

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="#9CA3AF" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by location, address..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>
        
        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => setShowFilters(!showFilters)}
        >
          <Ionicons name="options" size={20} color="#0D9488" />
        </TouchableOpacity>
      </View>

      {/* Quick Filters */}
      <View style={styles.quickFilters}>
        <TouchableOpacity style={[styles.quickFilter, styles.quickFilterActive]}>
          <Text style={[styles.quickFilterText, styles.quickFilterTextActive]}>All</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickFilter}>
          <Text style={styles.quickFilterText}>No Fee</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickFilter}>
          <Text style={styles.quickFilterText}>1 BR</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickFilter}>
          <Text style={styles.quickFilterText}>2+ BR</Text>
        </TouchableOpacity>
      </View>

      {/* Results */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0D9488" />
        </View>
      ) : (
        <FlatList
          data={listings}
          renderItem={renderListing}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="home-outline" size={48} color="#9CA3AF" />
              <Text style={styles.emptyText}>No listings found</Text>
              <Text style={styles.emptySubtext}>Try adjusting your search</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  searchContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 16,
    color: '#0D1117',
    paddingVertical: 12,
  },
  filterButton: {
    width: 48,
    height: 48,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickFilters: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
    backgroundColor: '#FFFFFF',
  },
  quickFilter: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  quickFilterActive: {
    backgroundColor: '#0D9488',
  },
  quickFilterText: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: '#6B7280',
  },
  quickFilterTextActive: {
    color: '#FFFFFF',
  },
  listContainer: {
    padding: 16,
    gap: 16,
  },
  listingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 16,
  },
  listingImage: {
    width: '100%',
    height: 200,
  },
  noFeeBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: '#0D9488',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  noFeeText: {
    fontFamily: 'Inter-Bold',
    fontSize: 11,
    color: '#FFFFFF',
  },
  listingContent: {
    padding: 16,
  },
  listingPrice: {
    fontFamily: 'PlayfairDisplay-Bold',
    fontSize: 24,
    color: '#0D1117',
  },
  listingPriceMonth: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: '#6B7280',
  },
  listingTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: '#0D1117',
    marginTop: 4,
  },
  listingAddress: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  listingStats: {
    flexDirection: 'row',
    marginTop: 12,
  },
  listingStat: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: '#6B7280',
  },
  listingStatDivider: {
    marginHorizontal: 8,
    color: '#D1D5DB',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 18,
    color: '#0D1117',
    marginTop: 16,
  },
  emptySubtext: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
});
