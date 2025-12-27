import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@/lib/api';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      setUser: (user) => set({ user, isAuthenticated: !!user, isLoading: false }),
      setLoading: (isLoading) => set({ isLoading }),
      logout: () => set({ user: null, isAuthenticated: false, isLoading: false }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
);

// Role-based access helpers
export const isLandlord = (user: User | null): boolean => user?.role === 'LANDLORD';
export const isTenant = (user: User | null): boolean => user?.role === 'TENANT';
export const isAgent = (user: User | null): boolean => user?.role === 'AGENT';
export const isInvestor = (user: User | null): boolean => user?.role === 'INVESTOR';
export const isAdmin = (user: User | null): boolean => user?.role === 'ADMIN';

export const hasRole = (user: User | null, roles: string[]): boolean => {
  if (!user) return false;
  return roles.includes(user.role);
};

export const canManageListings = (user: User | null): boolean => {
  return hasRole(user, ['LANDLORD', 'AGENT', 'ADMIN']);
};

export const canViewApplications = (user: User | null): boolean => {
  return hasRole(user, ['LANDLORD', 'AGENT', 'ADMIN']);
};

export const canInvest = (user: User | null): boolean => {
  return hasRole(user, ['INVESTOR', 'ADMIN']);
};
