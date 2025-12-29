import type { Role, Permission } from '@realriches/types';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { api } from '@/lib/api';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  permissions: Permission[];
  phone?: string;
  avatarUrl?: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  updateUser: (data: Partial<User>) => void;
}

interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: Role;
  phone?: string;
}

interface AuthResponse {
  user: User;
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (email: string, password: string) => {
        set({ isLoading: true });
        try {
          const response = await api.post<AuthResponse>('/auth/login', {
            email,
            password,
          });

          if (response.data) {
            api.setAccessToken(response.data.tokens.accessToken);
            localStorage.setItem('refreshToken', response.data.tokens.refreshToken);

            set({
              user: response.data.user,
              isAuthenticated: true,
              isLoading: false,
            });
          }
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      register: async (data: RegisterData) => {
        set({ isLoading: true });
        try {
          const response = await api.post<AuthResponse>('/auth/register', data);

          if (response.data) {
            api.setAccessToken(response.data.tokens.accessToken);
            localStorage.setItem('refreshToken', response.data.tokens.refreshToken);

            set({
              user: response.data.user,
              isAuthenticated: true,
              isLoading: false,
            });
          }
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      logout: async () => {
        try {
          await api.post('/auth/logout');
        } catch {
          // Ignore logout errors
        } finally {
          api.setAccessToken(null);
          localStorage.removeItem('refreshToken');
          set({ user: null, isAuthenticated: false });
        }
      },

      refresh: async () => {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) {
          set({ user: null, isAuthenticated: false });
          return;
        }

        try {
          const response = await api.post<{
            accessToken: string;
            refreshToken: string;
            expiresIn: number;
          }>('/auth/refresh', { refreshToken });

          if (response.data) {
            api.setAccessToken(response.data.accessToken);
            localStorage.setItem('refreshToken', response.data.refreshToken);
          }
        } catch {
          api.setAccessToken(null);
          localStorage.removeItem('refreshToken');
          set({ user: null, isAuthenticated: false });
        }
      },

      updateUser: (data: Partial<User>) => {
        const current = get().user;
        if (current) {
          set({ user: { ...current, ...data } });
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
