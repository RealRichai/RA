/**
 * RealRiches Home Screen
 */

import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { Link } from 'expo-router';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width * 0.8;

// NYC Markets
const MARKETS = [
  { id: 'manhattan', name: 'Manhattan', image: 'https://images.unsplash.com/photo-1534430480872-3498386e7856?w=400' },
  { id: 'brooklyn', name: 'Brooklyn', image: 'https://images.unsplash.com/photo-1555109307-f7d9da25c244?w=400' },
  { id: 'queens', name: 'Queens', image: 'https://images.unsplash.com/photo-1582555172866-f73bb12a2ab3?w=400' },
  { id: 'bronx', name: 'The Bronx', image: 'https://images.unsplash.com/photo-1569288052389-dac9b01c9c05?w=400' },
];

export default function HomeScreen() {
  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Hero Section */}
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Find Your{'\n'}Perfect Home</Text>
        <Text style={styles.heroSubtitle}>
          Luxury NYC rentals with transparent pricing
        </Text>
        
        {/* Quick Search */}
        <Link href="/(tabs)/search" asChild>
          <TouchableOpacity style={styles.searchButton}>
            <Text style={styles.searchButtonText}>Start Your Search</Text>
          </TouchableOpacity>
        </Link>
      </View>

      {/* Markets Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Explore Markets</Text>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.marketsContainer}
        >
          {MARKETS.map((market) => (
            <Link key={market.id} href={`/(tabs)/search?market=${market.id}`} asChild>
              <TouchableOpacity style={styles.marketCard}>
                <Image
                  source={{ uri: market.image }}
                  style={styles.marketImage}
                  contentFit="cover"
                />
                <View style={styles.marketOverlay}>
                  <Text style={styles.marketName}>{market.name}</Text>
                </View>
              </TouchableOpacity>
            </Link>
          ))}
        </ScrollView>
      </View>

      {/* Features Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Why RealRiches?</Text>
        
        <View style={styles.featureCard}>
          <Text style={styles.featureIcon}>✓</Text>
          <View style={styles.featureContent}>
            <Text style={styles.featureTitle}>FARE Act Compliant</Text>
            <Text style={styles.featureDescription}>
              Application fees capped at $20. Transparent broker fee disclosure.
            </Text>
          </View>
        </View>

        <View style={styles.featureCard}>
          <Text style={styles.featureIcon}>🔒</Text>
          <View style={styles.featureContent}>
            <Text style={styles.featureTitle}>Fair Chance Housing</Text>
            <Text style={styles.featureDescription}>
              Criminal history only reviewed after conditional offer.
            </Text>
          </View>
        </View>

        <View style={styles.featureCard}>
          <Text style={styles.featureIcon}>🏠</Text>
          <View style={styles.featureContent}>
            <Text style={styles.featureTitle}>Smart Lock Access</Text>
            <Text style={styles.featureDescription}>
              Self-guided tours with secure, time-limited access codes.
            </Text>
          </View>
        </View>
      </View>

      {/* CTA Section */}
      <View style={styles.ctaSection}>
        <Text style={styles.ctaTitle}>Ready to find your home?</Text>
        <Link href="/(tabs)/search" asChild>
          <TouchableOpacity style={styles.ctaButton}>
            <Text style={styles.ctaButtonText}>Browse Listings</Text>
          </TouchableOpacity>
        </Link>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  hero: {
    backgroundColor: '#0D1117',
    padding: 24,
    paddingTop: 40,
    paddingBottom: 48,
  },
  heroTitle: {
    fontFamily: 'PlayfairDisplay-Bold',
    fontSize: 36,
    color: '#FFFFFF',
    lineHeight: 44,
    marginBottom: 12,
  },
  heroSubtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 16,
    color: '#9CA3AF',
    marginBottom: 24,
  },
  searchButton: {
    backgroundColor: '#0D9488',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  searchButtonText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: '#FFFFFF',
  },
  section: {
    padding: 24,
  },
  sectionTitle: {
    fontFamily: 'PlayfairDisplay-Bold',
    fontSize: 24,
    color: '#0D1117',
    marginBottom: 16,
  },
  marketsContainer: {
    paddingRight: 24,
    gap: 16,
  },
  marketCard: {
    width: 160,
    height: 120,
    borderRadius: 12,
    overflow: 'hidden',
  },
  marketImage: {
    width: '100%',
    height: '100%',
  },
  marketOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-end',
    padding: 12,
  },
  marketName: {
    fontFamily: 'Inter-Bold',
    fontSize: 16,
    color: '#FFFFFF',
  },
  featureCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  featureIcon: {
    fontSize: 24,
    marginRight: 16,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: '#0D1117',
    marginBottom: 4,
  },
  featureDescription: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  ctaSection: {
    backgroundColor: '#0D9488',
    margin: 24,
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
  },
  ctaTitle: {
    fontFamily: 'PlayfairDisplay-Bold',
    fontSize: 20,
    color: '#FFFFFF',
    marginBottom: 16,
    textAlign: 'center',
  },
  ctaButton: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  ctaButtonText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: '#0D9488',
  },
});
