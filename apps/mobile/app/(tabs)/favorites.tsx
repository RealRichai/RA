/**
 * RealRiches Favorites Screen
 */

import { View, Text, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function FavoritesScreen() {
  // In production, fetch user's favorites
  const favorites: any[] = [];

  if (favorites.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="heart-outline" size={64} color="#D1D5DB" />
        <Text style={styles.emptyTitle}>No Saved Listings</Text>
        <Text style={styles.emptyText}>
          Tap the heart icon on listings to save them here
        </Text>
        <Link href="/(tabs)/search" style={styles.browseButton}>
          <Text style={styles.browseButtonText}>Browse Listings</Text>
        </Link>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Favorites list would go here */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
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
});
