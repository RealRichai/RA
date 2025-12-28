/**
 * RealRiches Applications Screen
 */

import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  PENDING: { color: '#92400E', bg: '#FEF3C7', label: 'Pending' },
  UNDER_REVIEW: { color: '#1E40AF', bg: '#DBEAFE', label: 'Under Review' },
  APPROVED: { color: '#166534', bg: '#DCFCE7', label: 'Approved' },
  REJECTED: { color: '#991B1B', bg: '#FEE2E2', label: 'Rejected' },
};

// Mock data
const MOCK_APPLICATIONS = [
  {
    id: '1',
    status: 'UNDER_REVIEW',
    listing: {
      title: 'Luxury 2BR in Tribeca',
      address: '123 Hudson St, New York',
      monthlyRent: 850000,
    },
    appliedAt: '2025-01-10T10:00:00Z',
  },
  {
    id: '2',
    status: 'PENDING',
    listing: {
      title: 'Modern Studio in Chelsea',
      address: '456 W 23rd St, New York',
      monthlyRent: 350000,
    },
    appliedAt: '2025-01-08T14:30:00Z',
  },
];

const formatCurrency = (cents: number) => `$${(cents / 100).toLocaleString()}`;

export default function ApplicationsScreen() {
  const applications = MOCK_APPLICATIONS;

  if (applications.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="document-text-outline" size={64} color="#D1D5DB" />
        <Text style={styles.emptyTitle}>No Applications</Text>
        <Text style={styles.emptyText}>
          Apply to listings to track your applications here
        </Text>
        <Link href="/(tabs)/search" style={styles.browseButton}>
          <Text style={styles.browseButtonText}>Browse Listings</Text>
        </Link>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {applications.map((app) => {
        const status = STATUS_CONFIG[app.status] || STATUS_CONFIG.PENDING;
        
        return (
          <TouchableOpacity key={app.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                <Text style={[styles.statusText, { color: status.color }]}>
                  {status.label}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </View>

            <Text style={styles.listingTitle}>{app.listing.title}</Text>
            <Text style={styles.listingAddress}>{app.listing.address}</Text>
            
            <View style={styles.cardFooter}>
              <Text style={styles.price}>
                {formatCurrency(app.listing.monthlyRent)}/mo
              </Text>
              <Text style={styles.date}>
                Applied {new Date(app.appliedAt).toLocaleDateString()}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}

      {/* FCHA Notice */}
      <View style={styles.infoCard}>
        <Ionicons name="shield-checkmark" size={24} color="#0D9488" />
        <Text style={styles.infoText}>
          Fair Chance Housing: Criminal history is only reviewed after a conditional offer.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  content: {
    padding: 16,
    gap: 16,
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: '#FAF9F6',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontFamily: 'PlayfairDisplay-Bold',
    fontSize: 24,
    color: '#0D1117',
    marginTop: 24,
    marginBottom: 8,
  },
  emptyText: {
    fontFamily: 'Inter-Regular',
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 32,
  },
  browseButton: {
    backgroundColor: '#0D9488',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  browseButtonText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: '#FFFFFF',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  statusText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
  },
  listingTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: '#0D1117',
    marginBottom: 4,
  },
  listingAddress: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: '#6B7280',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  price: {
    fontFamily: 'Inter-Bold',
    fontSize: 16,
    color: '#0D9488',
  },
  date: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: '#9CA3AF',
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDFA',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: '#0D9488',
    lineHeight: 18,
  },
});
