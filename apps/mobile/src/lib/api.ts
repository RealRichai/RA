import * as SecureStore from 'expo-secure-store';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

interface ApiResponse<T> {
  data: T;
  status: number;
}

interface TokenPayload {
  accessToken: string;
  refreshToken: string;
}

// Token storage
const TOKEN_KEY = 'auth_tokens';

export async function getTokens(): Promise<TokenPayload | null> {
  try {
    const tokens = await SecureStore.getItemAsync(TOKEN_KEY);
    return tokens ? JSON.parse(tokens) : null;
  } catch {
    return null;
  }
}

export async function setTokens(tokens: TokenPayload): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify(tokens));
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

// API client
class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async getAuthHeader(): Promise<Record<string, string>> {
    const tokens = await getTokens();
    if (tokens?.accessToken) {
      return { Authorization: `Bearer ${tokens.accessToken}` };
    }
    return {};
  }

  async request<T>(
    method: string,
    path: string,
    options?: {
      body?: any;
      headers?: Record<string, string>;
      skipAuth?: boolean;
    }
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const authHeader = options?.skipAuth ? {} : await this.getAuthHeader();

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...authHeader,
        ...options?.headers,
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    // Handle token refresh
    if (response.status === 401 && !options?.skipAuth) {
      const refreshed = await this.refreshToken();
      if (refreshed) {
        return this.request(method, path, options);
      }
      await clearTokens();
      throw new Error('Session expired. Please login again.');
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || data.message || 'Request failed');
    }

    return data;
  }

  private async refreshToken(): Promise<boolean> {
    try {
      const tokens = await getTokens();
      if (!tokens?.refreshToken) return false;

      const response = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      });

      if (!response.ok) return false;

      const data = await response.json();
      await setTokens({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      });
      return true;
    } catch {
      return false;
    }
  }

  async get<T>(path: string, options?: { headers?: Record<string, string>; skipAuth?: boolean }): Promise<T> {
    return this.request<T>('GET', path, options);
  }

  async post<T>(path: string, body?: any, options?: { headers?: Record<string, string>; skipAuth?: boolean }): Promise<T> {
    return this.request<T>('POST', path, { body, ...options });
  }

  async put<T>(path: string, body?: any, options?: { headers?: Record<string, string> }): Promise<T> {
    return this.request<T>('PUT', path, { body, ...options });
  }

  async patch<T>(path: string, body?: any, options?: { headers?: Record<string, string> }): Promise<T> {
    return this.request<T>('PATCH', path, { body, ...options });
  }

  async delete<T>(path: string, options?: { headers?: Record<string, string> }): Promise<T> {
    return this.request<T>('DELETE', path, options);
  }
}

export const api = new ApiClient(API_BASE_URL);

// Formatting utilities
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date));
}

export function formatRelativeTime(date: string | Date): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}
