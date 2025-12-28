/**
 * RealRiches Auth Utilities
 */

import { getApiClient } from './api';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'TENANT' | 'LANDLORD' | 'AGENT' | 'ADMIN';
  profileComplete: boolean;
}

// Check if user is authenticated
export function isAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem('accessToken');
}

// Get current user from storage
export function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const user = localStorage.getItem('user');
  return user ? JSON.parse(user) : null;
}

// Store user data
export function storeUser(user: AuthUser): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('user', JSON.stringify(user));
  }
}

// Clear auth data
export function clearAuth(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
  }
}

// Login helper
export async function login(
  email: string,
  password: string
): Promise<AuthUser> {
  const client = getApiClient();
  const result = await client.auth.login({ email, password });

  if (!result.success) {
    throw new Error(result.error?.message || 'Login failed');
  }

  const user: AuthUser = {
    id: result.data!.user.id,
    email: result.data!.user.email,
    firstName: result.data!.user.firstName,
    lastName: result.data!.user.lastName,
    role: result.data!.user.role,
    profileComplete: result.data!.user.profileComplete,
  };

  storeUser(user);
  return user;
}

// Register helper
export async function register(data: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'TENANT' | 'LANDLORD' | 'AGENT';
}): Promise<AuthUser> {
  const client = getApiClient();
  const result = await client.auth.register(data);

  if (!result.success) {
    throw new Error(result.error?.message || 'Registration failed');
  }

  const user: AuthUser = {
    id: result.data!.user.id,
    email: result.data!.user.email,
    firstName: result.data!.user.firstName,
    lastName: result.data!.user.lastName,
    role: result.data!.user.role,
    profileComplete: result.data!.user.profileComplete,
  };

  storeUser(user);
  return user;
}

// Logout helper
export async function logout(): Promise<void> {
  try {
    const client = getApiClient();
    await client.auth.logout();
  } finally {
    clearAuth();
  }
}

// Role-based access helpers
export function canManageListings(user: AuthUser | null): boolean {
  return user?.role === 'LANDLORD' || user?.role === 'AGENT' || user?.role === 'ADMIN';
}

export function canApplyToListings(user: AuthUser | null): boolean {
  return user?.role === 'TENANT';
}

export function canManageAgents(user: AuthUser | null): boolean {
  return user?.role === 'ADMIN';
}

export function canViewAnalytics(user: AuthUser | null): boolean {
  return user?.role === 'LANDLORD' || user?.role === 'ADMIN';
}
