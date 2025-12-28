/**
 * RealRiches Auth Hook
 */

'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getApiClient } from '@/lib/api';
import type { AuthUser } from '@/lib/auth';

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  
  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role: 'TENANT' | 'LANDLORD' | 'AGENT';
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: false,
      isAuthenticated: false,

      login: async (email, password) => {
        set({ isLoading: true });
        try {
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

          set({ user, isAuthenticated: true, isLoading: false });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      register: async (data) => {
        set({ isLoading: true });
        try {
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

          set({ user, isAuthenticated: true, isLoading: false });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      logout: async () => {
        try {
          const client = getApiClient();
          await client.auth.logout();
        } finally {
          set({ user: null, isAuthenticated: false });
          if (typeof window !== 'undefined') {
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
          }
        }
      },

      refreshUser: async () => {
        set({ isLoading: true });
        try {
          const client = getApiClient();
          const result = await client.auth.me();
          
          if (result.success && result.data) {
            const user: AuthUser = {
              id: result.data.id,
              email: result.data.email,
              firstName: result.data.firstName,
              lastName: result.data.lastName,
              role: result.data.role,
              profileComplete: result.data.profileComplete,
            };
            set({ user, isAuthenticated: true, isLoading: false });
          } else {
            set({ user: null, isAuthenticated: false, isLoading: false });
          }
        } catch {
          set({ user: null, isAuthenticated: false, isLoading: false });
        }
      },

      setUser: (user) => {
        set({ user, isAuthenticated: !!user });
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
);

// Selector hooks for performance
export const useUser = () => useAuth((state) => state.user);
export const useIsAuthenticated = () => useAuth((state) => state.isAuthenticated);
export const useIsLoading = () => useAuth((state) => state.isLoading);
