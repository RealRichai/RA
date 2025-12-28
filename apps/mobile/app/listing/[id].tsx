import { useLocalSearchParams, router } from 'expo-router';
import { View, Text, ScrollView, Image, TouchableOpacity, StyleSheet, Dimensions, ActivityIndicator } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/hooks/useAuth';
import { api, formatCurrency, formatDate } from '../src/lib/api';

const { width } = Dimensions.get('window');

interface Listing {
  id: string;
  title: string;
  description: string;
  price: number;
  address: string;
  unit?: string;
  bedrooms: number;
  bathrooms: number;
  sqft?: number;
  propertyType: string;
  images: string[];
  amenities: string[];
  noFee: boolean;
  availableDate: string;
  fareActDisclosure?: {
    brokerFee?: number;
    responsibleParty: string;
    disclosureText: string;
  };
  agent?: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    avatarUrl?: string;
    licenseNumber: string;
  };
  market: {
    name: string;
    borough?: string;
  };
  isFavorite: boolean;
  createdAt: string;
}

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const scrollRef = useRef<ScrollView>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showApplyModal, setShowApplyModal] = useState(false);

  const { data: listing, isLoading, error } = useQuery({
    queryKey: ['listing', id],
    queryFn: () => api.get<{ listing: Listing }>(`/listings/${id}`).then(r => r.listing),
    enabled: !!id,
  });

  const toggleFavorite = useMutation({
    mutationFn: () => api.post(`/listings/${id}/favorite`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listing', id] });
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
    },
  });

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0D9488" />
      </View>
    );
  }

  if (error || !listing) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
        <Text style={styles.errorText}>Failed to load listing</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => router.back()}>
          <Text style={styles.retryButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleApply = () => {
    if (!isAuthenticated) {
      router.push('/auth/login');
      return;
    }
    setShowApplyModal(true);
  };

  const handleImageScroll = (event: any) => {
    const offset = event.nativeEvent.contentOffset.x;
    const index = Math.round(offset / width);
    setCurrentImageIndex(index);
  };

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Image Gallery */}
        <View style={styles.imageContainer}>
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={handleImageScroll}
            scrollEventThrottle={16}
          >
            {listing.images.length > 0 ? (
              listing.images.map((image, index) => (
                <Image
                  key={index}
                  source={{ uri: image }}
                  style={styles.image}
                  resizeMode="cover"
                />
              ))
            ) : (
              <View style={[styles.image, styles.noImage]}>
                <Ionicons name="image-outline" size={48} color="#9CA3AF" />
                <Text style={styles.noImageText}>No Images</Text>
              </View>
            )}
          </ScrollView>

          {/* Image Indicators */}
          {listing.images.length > 1 && (
            <View style={styles.imageIndicators}>
              {listing.images.map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.indicator,
                    index === currentImageIndex && styles.indicatorActive,
                  ]}
                />
              ))}
            </View>
          )}

          {/* Back Button */}
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>

          {/* Favorite Button */}
          <TouchableOpacity
            style={styles.favoriteButton}
            onPress={() => toggleFavorite.mutate()}
          >
            <Ionicons
              name={listing.isFavorite ? 'heart' : 'heart-outline'}
              size={24}
              color={listing.isFavorite ? '#EF4444' : '#FFFFFF'}
            />
          </TouchableOpacity>

          {/* No Fee Badge */}
          {listing.noFee && (
            <View style={styles.noFeeBadge}>
              <Text style={styles.noFeeBadgeText}>NO FEE</Text>
            </View>
          )}
        </View>

        {/* Content */}
        <View style={styles.content}>
          {/* Price & Title */}
          <View style={styles.header}>
            <Text style={styles.price}>{formatCurrency(listing.price)}/mo</Text>
            <Text style={styles.title}>{listing.title}</Text>
            <Text style={styles.address}>
              {listing.address}
              {listing.unit && `, Unit ${listing.unit}`}
            </Text>
            <Text style={styles.market}>{listing.market.name}</Text>
          </View>

          {/* Stats */}
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Ionicons name="bed-outline" size={20} color="#6B7280" />
              <Text style={styles.statValue}>{listing.bedrooms}</Text>
              <Text style={styles.statLabel}>Beds</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Ionicons name="water-outline" size={20} color="#6B7280" />
              <Text style={styles.statValue}>{listing.bathrooms}</Text>
              <Text style={styles.statLabel}>Baths</Text>
            </View>
            {listing.sqft && (
              <>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Ionicons name="resize-outline" size={20} color="#6B7280" />
                  <Text style={styles.statValue}>{listing.sqft.toLocaleString()}</Text>
                  <Text style={styles.statLabel}>Sq Ft</Text>
                </View>
              </>
            )}
          </View>

          {/* FARE Act Disclosure */}
          {listing.fareActDisclosure && (
            <View style={styles.fareActCard}>
              <View style={styles.fareActHeader}>
                <Ionicons name="shield-checkmark" size={20} color="#0D9488" />
                <Text style={styles.fareActTitle}>FARE Act Disclosure</Text>
              </View>
              <Text style={styles.fareActText}>
                {listing.fareActDisclosure.disclosureText}
              </Text>
              {listing.fareActDisclosure.brokerFee && (
                <Text style={styles.fareActFee}>
                  Broker Fee: {formatCurrency(listing.fareActDisclosure.brokerFee)} 
                  ({listing.fareActDisclosure.responsibleParty} pays)
                </Text>
              )}
            </View>
          )}

          {/* Description */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.description}>{listing.description}</Text>
          </View>

          {/* Details */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Details</Text>
            <View style={styles.detailsGrid}>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Property Type</Text>
                <Text style={styles.detailValue}>{listing.propertyType}</Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Available</Text>
                <Text style={styles.detailValue}>{formatDate(listing.availableDate)}</Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Listed</Text>
                <Text style={styles.detailValue}>{formatDate(listing.createdAt)}</Text>
              </View>
            </View>
          </View>

          {/* Amenities */}
          {listing.amenities.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Amenities</Text>
              <View style={styles.amenitiesGrid}>
                {listing.amenities.map((amenity, index) => (
                  <View key={index} style={styles.amenityItem}>
                    <Ionicons name="checkmark-circle" size={16} color="#0D9488" />
                    <Text style={styles.amenityText}>{amenity}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Agent Info */}
          {listing.agent && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Listed By</Text>
              <View style={styles.agentCard}>
                <View style={styles.agentAvatar}>
                  {listing.agent.avatarUrl ? (
                    <Image
                      source={{ uri: listing.agent.avatarUrl }}
                      style={styles.agentImage}
                    />
                  ) : (
                    <Ionicons name="person" size={24} color="#9CA3AF" />
                  )}
                </View>
                <View style={styles.agentInfo}>
                  <Text style={styles.agentName}>
                    {listing.agent.firstName} {listing.agent.lastName}
                  </Text>
                  <Text style={styles.agentLicense}>
                    License: {listing.agent.licenseNumber}
                  </Text>
                </View>
                <View style={styles.agentActions}>
                  <TouchableOpacity style={styles.agentButton}>
                    <Ionicons name="call" size={20} color="#0D9488" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.agentButton}>
                    <Ionicons name="mail" size={20} color="#0D9488" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* Spacer for bottom bar */}
          <View style={{ height: 100 }} />
        </View>
      </ScrollView>

      {/* Bottom Bar */}
      <View style={styles.bottomBar}>
        <View style={styles.bottomPrice}>
          <Text style={styles.bottomPriceValue}>{formatCurrency(listing.price)}</Text>
          <Text style={styles.bottomPriceLabel}>/month</Text>
        </View>
        <TouchableOpacity style={styles.applyButton} onPress={handleApply}>
          <Text style={styles.applyButtonText}>Apply Now</Text>
        </TouchableOpacity>
      </View>

      {/* Apply Modal */}
      {showApplyModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Apply for this listing</Text>
            <Text style={styles.modalText}>
              You'll be redirected to complete your application. The application fee is capped at $20 per NYC Local Law 18.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowApplyModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmButton}
                onPress={() => {
                  setShowApplyModal(false);
                  router.push(`/apply/${id}`);
                }}
              >
                <Text style={styles.modalConfirmText}>Continue</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 12,
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#0D9488',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  imageContainer: {
    position: 'relative',
    height: 300,
  },
  image: {
    width: width,
    height: 300,
  },
  noImage: {
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  noImageText: {
    color: '#9CA3AF',
    marginTop: 8,
  },
  imageIndicators: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  indicatorActive: {
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  favoriteButton: {
    position: 'absolute',
    top: 50,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  noFeeBadge: {
    position: 'absolute',
    top: 50,
    right: 66,
    backgroundColor: '#0D9488',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  noFeeBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  content: {
    padding: 20,
  },
  header: {
    marginBottom: 20,
  },
  price: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0D9488',
    fontFamily: 'PlayfairDisplay-Bold',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#0D1117',
    marginTop: 8,
  },
  address: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  market: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0D1117',
    marginTop: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#E5E7EB',
  },
  fareActCard: {
    backgroundColor: '#F0FDFA',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#99F6E4',
  },
  fareActHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  fareActTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0D9488',
  },
  fareActText: {
    fontSize: 13,
    color: '#374151',
    lineHeight: 20,
  },
  fareActFee: {
    fontSize: 12,
    color: '#0D9488',
    fontWeight: '500',
    marginTop: 8,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0D1117',
    marginBottom: 12,
    fontFamily: 'PlayfairDisplay-SemiBold',
  },
  description: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 22,
  },
  detailsGrid: {
    gap: 12,
  },
  detailItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  detailValue: {
    fontSize: 14,
    color: '#0D1117',
    fontWeight: '500',
  },
  amenitiesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  amenityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: '45%',
  },
  amenityText: {
    fontSize: 13,
    color: '#4B5563',
  },
  agentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
  },
  agentAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  agentImage: {
    width: 48,
    height: 48,
  },
  agentInfo: {
    flex: 1,
    marginLeft: 12,
  },
  agentName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0D1117',
  },
  agentLicense: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  agentActions: {
    flexDirection: 'row',
    gap: 8,
  },
  agentButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  bottomPrice: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  bottomPriceValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0D1117',
  },
  bottomPriceLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 2,
  },
  applyButton: {
    backgroundColor: '#0D9488',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  applyButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 350,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0D1117',
    marginBottom: 12,
  },
  modalText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 22,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#6B7280',
    fontWeight: '500',
  },
  modalConfirmButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#0D9488',
    alignItems: 'center',
  },
  modalConfirmText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
