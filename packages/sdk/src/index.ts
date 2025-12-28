/**
 * RealRiches API Client SDK
 * Type-safe API client with automatic token refresh
 */

import type { ApiResponse, AuthTokens, User } from '@realriches/shared';

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface SDKConfig {
  baseUrl: string;
  timeout?: number;
  onTokenRefresh?: (tokens: AuthTokens) => void;
  onAuthError?: () => void;
  getAccessToken?: () => string | null;
  getRefreshToken?: () => string | null;
}

// ============================================================================
// HTTP CLIENT
// ============================================================================

export class APIClient {
  private config: Required<SDKConfig>;
  private isRefreshing = false;
  private refreshPromise: Promise<AuthTokens> | null = null;
  
  constructor(config: SDKConfig) {
    this.config = {
      timeout: 30000,
      onTokenRefresh: () => {},
      onAuthError: () => {},
      getAccessToken: () => null,
      getRefreshToken: () => null,
      ...config,
    };
  }
  
  private async request<T>(
    method: string,
    path: string,
    options: {
      body?: unknown;
      headers?: Record<string, string>;
      auth?: boolean;
      retry?: boolean;
    } = {}
  ): Promise<ApiResponse<T>> {
    const { body, headers = {}, auth = true, retry = true } = options;
    
    const url = `${this.config.baseUrl}${path}`;
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };
    
    if (auth) {
      const token = this.config.getAccessToken();
      if (token) {
        requestHeaders['Authorization'] = `Bearer ${token}`;
      }
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
    
    try {
      const init: RequestInit = {
        method,
        headers: requestHeaders,
        signal: controller.signal,
      };
      if (body !== undefined) {
        (init as any).body = JSON.stringify(body);
      }

      const response = await fetch(url, init);
      
      clearTimeout(timeoutId);
      
      const data = await response.json() as ApiResponse<T>;
      
      // Handle 401 - attempt token refresh
      if (response.status === 401 && auth && retry) {
        const refreshed = await this.refreshToken();
        if (refreshed) {
          return this.request<T>(method, path, { ...options, retry: false });
        }
        this.config.onAuthError();
      }
      
      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Request timeout',
            timestamp: new Date().toISOString(),
          },
        };
      }
      
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        },
      };
    }
  }
  
  private async refreshToken(): Promise<boolean> {
    if (this.isRefreshing) {
      await this.refreshPromise;
      return !!this.config.getAccessToken();
    }
    
    const refreshToken = this.config.getRefreshToken();
    if (!refreshToken) return false;
    
    this.isRefreshing = true;
    
    this.refreshPromise = this.request<AuthTokens>('POST', '/auth/refresh', {
      body: { refreshToken },
      auth: false,
      retry: false,
    }).then(response => {
      this.isRefreshing = false;
      this.refreshPromise = null;
      
      if (response.success && response.data) {
        this.config.onTokenRefresh(response.data);
        return response.data;
      }
      
      throw new Error('Token refresh failed');
    });
    
    try {
      await this.refreshPromise;
      return true;
    } catch {
      this.isRefreshing = false;
      this.refreshPromise = null;
      return false;
    }
  }
  
  // HTTP Methods
  get<T>(path: string, options?: { auth?: boolean }) {
    return this.request<T>('GET', path, options);
  }
  
  post<T>(path: string, body?: unknown, options?: { auth?: boolean }) {
    return this.request<T>('POST', path, { body, ...options });
  }
  
  put<T>(path: string, body?: unknown, options?: { auth?: boolean }) {
    return this.request<T>('PUT', path, { body, ...options });
  }
  
  patch<T>(path: string, body?: unknown, options?: { auth?: boolean }) {
    return this.request<T>('PATCH', path, { body, ...options });
  }
  
  delete<T>(path: string, options?: { auth?: boolean }) {
    return this.request<T>('DELETE', path, options);
  }
  
  // File Upload
  async upload<T>(
    path: string,
    file: File | Blob,
    fieldName = 'file'
  ): Promise<ApiResponse<T>> {
    const formData = new FormData();
    formData.append(fieldName, file);
    
    const token = this.config.getAccessToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    try {
      const response = await fetch(`${this.config.baseUrl}${path}`, {
        method: 'POST',
        headers,
        body: formData,
      });
      
      return (await response.json()) as ApiResponse<T>;
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Upload failed',
          timestamp: new Date().toISOString(),
        },
      };
    }
  }
}

// ============================================================================
// API ENDPOINTS
// ============================================================================

export const endpoints = {
  // Auth
  auth: {
    register: '/auth/register',
    login: '/auth/login',
    logout: '/auth/logout',
    refresh: '/auth/refresh',
    forgotPassword: '/auth/forgot-password',
    resetPassword: '/auth/reset-password',
    verifyEmail: '/auth/verify-email',
  },
  
  // Users
  users: {
    me: '/users/me',
    profile: '/users/profile',
    changePassword: '/users/change-password',
    uploadAvatar: '/users/avatar',
    documents: '/users/documents',
    uploadDocument: '/users/documents/upload',
    document: (id: string) => `/users/documents/${id}`,
  },
  
  // Listings
  listings: {
    list: '/listings',
    search: '/listings/search',
    detail: (id: string) => `/listings/${id}`,
    create: '/listings',
    update: (id: string) => `/listings/${id}`,
    delete: (id: string) => `/listings/${id}`,
    images: (id: string) => `/listings/${id}/images`,
    favorites: '/listings/favorites',
    favorite: (id: string) => `/listings/${id}/favorite`,
    fareDisclosure: (id: string) => `/listings/${id}/fare-disclosure`,
  },
  
  // Applications
  applications: {
    list: '/applications',
    detail: (id: string) => `/applications/${id}`,
    create: '/applications',
    update: (id: string) => `/applications/${id}`,
    submit: (id: string) => `/applications/${id}/submit`,
    withdraw: (id: string) => `/applications/${id}/withdraw`,
    documents: (id: string) => `/applications/${id}/documents`,
    review: (id: string) => `/applications/${id}/review`,
    
    // FCHA
    fchaDisclosure: (id: string) => `/applications/${id}/fcha/disclosure`,
    fchaAssessment: (id: string) => `/applications/${id}/fcha/assessment`,
    fchaDispute: (id: string) => `/applications/${id}/fcha/dispute`,
  },
  
  // Leases
  leases: {
    list: '/leases',
    detail: (id: string) => `/leases/${id}`,
    create: '/leases',
    sign: (id: string) => `/leases/${id}/sign`,
    renew: (id: string) => `/leases/${id}/renew`,
    terminate: (id: string) => `/leases/${id}/terminate`,
    documents: (id: string) => `/leases/${id}/documents`,
  },
  
  // Payments
  payments: {
    list: '/payments',
    detail: (id: string) => `/payments/${id}`,
    create: '/payments',
    createIntent: (id: string) => `/payments/${id}/intent`,
    confirm: (id: string) => `/payments/${id}/confirm`,
    refund: (id: string) => `/payments/${id}/refund`,
    methods: '/payments/methods',
    addMethod: '/payments/methods',
    removeMethod: (id: string) => `/payments/methods/${id}`,
    setDefault: (id: string) => `/payments/methods/${id}/default`,
    
    // Autopay
    autopay: '/payments/autopay',
    updateAutopay: '/payments/autopay',
    
    // Landlord
    stripeConnect: '/payments/stripe/connect',
    stripeOnboarding: '/payments/stripe/onboarding',
    payouts: '/payments/payouts',
  },
  
  // Agents
  agents: {
    list: '/agents',
    detail: (id: string) => `/agents/${id}`,
    profile: '/agents/profile',
    updateProfile: '/agents/profile',
    listings: (id: string) => `/agents/${id}/listings`,
    reviews: (id: string) => `/agents/${id}/reviews`,
    createReview: (id: string) => `/agents/${id}/reviews`,
    commissions: '/agents/commissions',
  },
  
  // Messages
  messages: {
    conversations: '/messages/conversations',
    conversation: (id: string) => `/messages/conversations/${id}`,
    createConversation: '/messages/conversations',
    messages: (conversationId: string) => `/messages/conversations/${conversationId}/messages`,
    send: (conversationId: string) => `/messages/conversations/${conversationId}/messages`,
    markRead: (conversationId: string) => `/messages/conversations/${conversationId}/read`,
  },
  
  // Notifications
  notifications: {
    list: '/notifications',
    markRead: (id: string) => `/notifications/${id}/read`,
    markAllRead: '/notifications/read-all',
    settings: '/notifications/settings',
    updateSettings: '/notifications/settings',
  },
  
  // Compliance
  compliance: {
    fareAct: {
      calculate: '/compliance/fare-act/calculate',
      disclosure: '/compliance/fare-act/disclosure',
      validate: '/compliance/fare-act/validate',
    },
    fcha: {
      requirements: '/compliance/fcha/requirements',
      factors: '/compliance/fcha/factors',
    },
  },
  
  // Smart Locks
  smartLocks: {
    devices: '/smart-locks',
    device: (id: string) => `/smart-locks/${id}`,
    createCode: (id: string) => `/smart-locks/${id}/codes`,
    codes: (id: string) => `/smart-locks/${id}/codes`,
    deleteCode: (id: string, codeId: string) => `/smart-locks/${id}/codes/${codeId}`,
    events: (id: string) => `/smart-locks/${id}/events`,
  },
  
  // Admin
  admin: {
    dashboard: '/admin/dashboard',
    users: '/admin/users',
    user: (id: string) => `/admin/users/${id}`,
    listings: '/admin/listings',
    listing: (id: string) => `/admin/listings/${id}`,
    agents: '/admin/agents',
    agent: (id: string) => `/admin/agents/${id}`,
    vetAgent: (id: string) => `/admin/agents/${id}/vet`,
    config: '/admin/config',
    auditLogs: '/admin/audit-logs',
  },
  
  // Markets
  markets: {
    list: '/markets',
    detail: (id: string) => `/markets/${id}`,
  },
  
  // Health
  health: '/health',
};

// ============================================================================
// SDK FACTORY
// ============================================================================

export function createSDK(config: SDKConfig) {
  const client = new APIClient(config);
  
  return {
    client,
    endpoints,
    
    // Auth
    auth: {
      register: (data: Parameters<typeof client.post>[1]) => 
        client.post<{ user: User; tokens: AuthTokens }>(endpoints.auth.register, data, { auth: false }),
      login: (data: Parameters<typeof client.post>[1]) => 
        client.post<{ user: User; tokens: AuthTokens }>(endpoints.auth.login, data, { auth: false }),
      logout: () => client.post(endpoints.auth.logout),
      refresh: (refreshToken: string) => 
        client.post<AuthTokens>(endpoints.auth.refresh, { refreshToken }, { auth: false }),
      forgotPassword: (email: string) => 
        client.post(endpoints.auth.forgotPassword, { email }, { auth: false }),
      resetPassword: (token: string, password: string) => 
        client.post(endpoints.auth.resetPassword, { token, password }, { auth: false }),
      verifyEmail: (token: string) => 
        client.post(endpoints.auth.verifyEmail, { token }, { auth: false }),
    },
    
    // Users
    users: {
      me: () => client.get<User>(endpoints.users.me),
      updateProfile: (data: Parameters<typeof client.patch>[1]) => 
        client.patch<User>(endpoints.users.profile, data),
      changePassword: (currentPassword: string, newPassword: string) => 
        client.post(endpoints.users.changePassword, { currentPassword, newPassword }),
      uploadAvatar: (file: File) => client.upload(endpoints.users.uploadAvatar, file),
    },
    
    // Listings
    listings: {
      list: (params?: Record<string, unknown>) => 
        client.get(`${endpoints.listings.list}?${new URLSearchParams(params as Record<string, string>)}`),
      search: (params: Record<string, unknown>) => 
        client.get(`${endpoints.listings.search}?${new URLSearchParams(params as Record<string, string>)}`),
      get: (id: string) => client.get(endpoints.listings.detail(id)),
      create: (data: Parameters<typeof client.post>[1]) => 
        client.post(endpoints.listings.create, data),
      update: (id: string, data: Parameters<typeof client.patch>[1]) => 
        client.patch(endpoints.listings.update(id), data),
      delete: (id: string) => client.delete(endpoints.listings.delete(id)),
      addFavorite: (id: string) => client.post(endpoints.listings.favorite(id)),
      removeFavorite: (id: string) => client.delete(endpoints.listings.favorite(id)),
      getFavorites: () => client.get(endpoints.listings.favorites),
    },
    
    // Applications
    applications: {
      list: () => client.get(endpoints.applications.list),
      get: (id: string) => client.get(endpoints.applications.detail(id)),
      create: (data: Parameters<typeof client.post>[1]) => 
        client.post(endpoints.applications.create, data),
      update: (id: string, data: Parameters<typeof client.patch>[1]) => 
        client.patch(endpoints.applications.update(id), data),
      submit: (id: string) => client.post(endpoints.applications.submit(id)),
      withdraw: (id: string) => client.post(endpoints.applications.withdraw(id)),
    },
    
    // Leases
    leases: {
      list: () => client.get(endpoints.leases.list),
      get: (id: string) => client.get(endpoints.leases.detail(id)),
      sign: (id: string, signature: string) => 
        client.post(endpoints.leases.sign(id), { signature }),
    },
    
    // Payments
    payments: {
      list: () => client.get(endpoints.payments.list),
      create: (data: Parameters<typeof client.post>[1]) => 
        client.post(endpoints.payments.create, data),
      createIntent: (id: string) => client.post(endpoints.payments.createIntent(id)),
      getMethods: () => client.get(endpoints.payments.methods),
      addMethod: (data: Parameters<typeof client.post>[1]) => 
        client.post(endpoints.payments.addMethod, data),
    },
    
    // Messages
    messages: {
      getConversations: () => client.get(endpoints.messages.conversations),
      getConversation: (id: string) => client.get(endpoints.messages.conversation(id)),
      getMessages: (conversationId: string) => 
        client.get(endpoints.messages.messages(conversationId)),
      send: (conversationId: string, content: string) => 
        client.post(endpoints.messages.send(conversationId), { content }),
      markRead: (conversationId: string) => 
        client.post(endpoints.messages.markRead(conversationId)),
    },
    
    // Agents
    agents: {
      list: (params?: Record<string, unknown>) => 
        client.get(`${endpoints.agents.list}?${new URLSearchParams(params as Record<string, string>)}`),
      get: (id: string) => client.get(endpoints.agents.detail(id)),
      getListings: (id: string) => client.get(endpoints.agents.listings(id)),
      getReviews: (id: string) => client.get(endpoints.agents.reviews(id)),
      createReview: (id: string, data: Parameters<typeof client.post>[1]) => 
        client.post(endpoints.agents.createReview(id), data),
    },
  };
}

export type SDK = ReturnType<typeof createSDK>;
