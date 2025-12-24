/**
 * Auth Store
 * Zustand store for authentication state
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, AuthTokens } from '@/types';
import api from './api-client';

interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  // Actions
  setAuth: (user: User, tokens: AuthTokens) => void;
  clearAuth: () => void;
  updateUser: (user: Partial<User>) => void;

  // Async actions
  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; password: string; firstName: string; lastName: string; role?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  fetchUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      tokens: null,
      isLoading: false,
      isAuthenticated: false,

      setAuth: (user, tokens) => {
        api.setAccessToken(tokens.accessToken);
        set({ user, tokens, isAuthenticated: true });
      },

      clearAuth: () => {
        api.setAccessToken(null);
        set({ user: null, tokens: null, isAuthenticated: false });
      },

      updateUser: (userData) => {
        const { user } = get();
        if (user) {
          set({ user: { ...user, ...userData } });
        }
      },

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const response = await api.login(email, password);
          get().setAuth(response.user, response.tokens);
        } finally {
          set({ isLoading: false });
        }
      },

      register: async (data) => {
        set({ isLoading: true });
        try {
          const response = await api.register(data);
          get().setAuth(response.user, response.tokens);
        } finally {
          set({ isLoading: false });
        }
      },

      logout: async () => {
        set({ isLoading: true });
        try {
          await api.logout();
        } catch {
          // Ignore logout errors
        } finally {
          get().clearAuth();
          set({ isLoading: false });
        }
      },

      refreshSession: async () => {
        try {
          const response = await api.refreshTokens();
          get().setAuth(response.user, response.tokens);
        } catch {
          get().clearAuth();
        }
      },

      fetchUser: async () => {
        const { tokens } = get();
        if (!tokens) return;

        api.setAccessToken(tokens.accessToken);
        try {
          const response = await api.getMe();
          set({ user: response.user, isAuthenticated: true });
        } catch {
          get().clearAuth();
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        tokens: state.tokens,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.tokens) {
          api.setAccessToken(state.tokens.accessToken);
          state.fetchUser();
        }
      },
    }
  )
);

export default useAuthStore;
