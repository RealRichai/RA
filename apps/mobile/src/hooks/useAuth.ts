import { create } from 'zustand';
import { api, getTokens, setTokens, clearTokens } from '../lib/api';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'TENANT' | 'LANDLORD' | 'AGENT' | 'ADMIN';
  avatarUrl?: string;
  phone?: string;
  createdAt: string;
}

interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'TENANT' | 'LANDLORD' | 'AGENT';
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;

  // Actions
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: Partial<User>) => void;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  isInitialized: false,

  initialize: async () => {
    try {
      const tokens = await getTokens();
      if (tokens?.accessToken) {
        const data = await api.get<{ user: User }>('/users/me');
        set({ user: data.user, isAuthenticated: true, isInitialized: true });
      } else {
        set({ isInitialized: true });
      }
    } catch {
      await clearTokens();
      set({ user: null, isAuthenticated: false, isInitialized: true });
    }
  },

  login: async (email: string, password: string) => {
    set({ isLoading: true });
    try {
      const data = await api.post<{
        user: User;
        accessToken: string;
        refreshToken: string;
      }>('/auth/login', { email, password }, { skipAuth: true });

      await setTokens({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      });

      set({ user: data.user, isAuthenticated: true, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  register: async (registerData: RegisterData) => {
    set({ isLoading: true });
    try {
      const data = await api.post<{
        user: User;
        accessToken: string;
        refreshToken: string;
      }>('/auth/register', registerData, { skipAuth: true });

      await setTokens({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      });

      set({ user: data.user, isAuthenticated: true, isLoading: false });
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
    }
    await clearTokens();
    set({ user: null, isAuthenticated: false });
  },

  updateUser: (updates: Partial<User>) => {
    const { user } = get();
    if (user) {
      set({ user: { ...user, ...updates } });
    }
  },
}));

// Initialize auth on module load
useAuth.getState().initialize();
