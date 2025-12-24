/**
 * Auth Hook
 * Convenient hook for auth state and actions
 */

'use client';

import { useAuthStore } from '@/lib/auth-store';

export function useAuth() {
  const {
    user,
    isAuthenticated,
    isLoading,
    login,
    register,
    logout,
    updateUser,
    refreshSession,
  } = useAuthStore();

  return {
    user,
    isAuthenticated,
    isLoading,
    login,
    register,
    logout,
    updateUser,
    refreshSession,

    // Role checks
    isAdmin: user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN',
    isLandlord: user?.role === 'LANDLORD',
    isAgent: user?.role === 'AGENT',
    isTenant: user?.role === 'TENANT',
    isInvestor: user?.role === 'INVESTOR',
  };
}

export default useAuth;
