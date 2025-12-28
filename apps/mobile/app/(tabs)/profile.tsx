/**
 * RealRiches Profile Screen
 */

import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Link, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function ProfileScreen() {
  // In production, get from auth state
  const user = {
    firstName: 'Demo',
    lastName: 'User',
    email: 'demo@realriches.com',
    role: 'TENANT',
  };

  const isLoggedIn = true; // Would come from auth state

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: () => {
          // Clear auth state and navigate to login
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  if (!isLoggedIn) {
    return (
      <View style={styles.authContainer}>
        <View style={styles.authContent}>
          <Text style={styles.authTitle}>Welcome to RealRiches</Text>
          <Text style={styles.authSubtitle}>
            Sign in to manage your applications and saved listings
          </Text>
          
          <Link href="/(auth)/login" asChild>
            <TouchableOpacity style={styles.authButton}>
              <Text style={styles.authButtonText}>Sign In</Text>
            </TouchableOpacity>
          </Link>
          
          <Link href="/(auth)/register" asChild>
            <TouchableOpacity style={styles.authButtonOutline}>
              <Text style={styles.authButtonOutlineText}>Create Account</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Profile Header */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user.firstName[0]}{user.lastName[0]}
          </Text>
        </View>
        <Text style={styles.name}>{user.firstName} {user.lastName}</Text>
        <Text style={styles.email}>{user.email}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{user.role}</Text>
        </View>
      </View>

      {/* Menu Items */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        
        <MenuItem
          icon="person-outline"
          label="Edit Profile"
          onPress={() => {}}
        />
        <MenuItem
          icon="document-text-outline"
          label="My Documents"
          onPress={() => {}}
        />
        <MenuItem
          icon="card-outline"
          label="Payment Methods"
          onPress={() => {}}
        />
        <MenuItem
          icon="notifications-outline"
          label="Notifications"
          onPress={() => {}}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Support</Text>
        
        <MenuItem
          icon="help-circle-outline"
          label="Help Center"
          onPress={() => {}}
        />
        <MenuItem
          icon="chatbubble-outline"
          label="Contact Us"
          onPress={() => {}}
        />
        <MenuItem
          icon="information-circle-outline"
          label="About FARE Act"
          onPress={() => {}}
        />
        <MenuItem
          icon="shield-checkmark-outline"
          label="Fair Chance Housing"
          onPress={() => {}}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Legal</Text>
        
        <MenuItem
          icon="document-outline"
          label="Terms of Service"
          onPress={() => {}}
        />
        <MenuItem
          icon="lock-closed-outline"
          label="Privacy Policy"
          onPress={() => {}}
        />
      </View>

      {/* Logout Button */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color="#DC2626" />
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>

      {/* Version */}
      <Text style={styles.version}>RealRiches v3.1.0</Text>
    </ScrollView>
  );
}

function MenuItem({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
      <View style={styles.menuItemLeft}>
        <Ionicons name={icon} size={22} color="#6B7280" />
        <Text style={styles.menuItemLabel}>{label}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  content: {
    paddingBottom: 40,
  },
  authContainer: {
    flex: 1,
    backgroundColor: '#FAF9F6',
    justifyContent: 'center',
    padding: 32,
  },
  authContent: {
    alignItems: 'center',
  },
  authTitle: {
    fontFamily: 'PlayfairDisplay-Bold',
    fontSize: 28,
    color: '#0D1117',
    marginBottom: 8,
    textAlign: 'center',
  },
  authSubtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 32,
  },
  authButton: {
    width: '100%',
    backgroundColor: '#0D9488',
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  authButtonText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  authButtonOutline: {
    width: '100%',
    backgroundColor: 'transparent',
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#0D9488',
  },
  authButtonOutlineText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: '#0D9488',
    textAlign: 'center',
  },
  header: {
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#0D9488',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontFamily: 'Inter-Bold',
    fontSize: 28,
    color: '#FFFFFF',
  },
  name: {
    fontFamily: 'PlayfairDisplay-Bold',
    fontSize: 24,
    color: '#0D1117',
    marginBottom: 4,
  },
  email: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
  },
  roleBadge: {
    backgroundColor: '#F0FDFA',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  roleText: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: '#0D9488',
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuItemLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 16,
    color: '#0D1117',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 32,
    marginHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
  },
  logoutText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: '#DC2626',
  },
  version: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 24,
  },
});
