/**
 * RealRiches API Client for Web
 * Wraps SDK with Next.js specific features
 */

import { RealRichesClient } from '@realriches/sdk';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Singleton client instance
let clientInstance: RealRichesClient | null = null;

export function getApiClient(): RealRichesClient {
  if (!clientInstance) {
    clientInstance = new RealRichesClient({
      baseUrl: API_URL,
      onTokenRefresh: async (tokens) => {
        // Store tokens in localStorage for persistence
        if (typeof window !== 'undefined') {
          localStorage.setItem('accessToken', tokens.accessToken);
          localStorage.setItem('refreshToken', tokens.refreshToken);
        }
      },
    });

    // Restore tokens from localStorage on init
    if (typeof window !== 'undefined') {
      const accessToken = localStorage.getItem('accessToken');
      const refreshToken = localStorage.getItem('refreshToken');
      if (accessToken && refreshToken) {
        clientInstance.setTokens(accessToken, refreshToken);
      }
    }
  }
  return clientInstance;
}

// Singleton export for convenience
export const apiClient = getApiClient();

// Server-side fetch helper for RSC
export async function serverFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    next: { revalidate: 60 }, // Cache for 60 seconds
  });

  if (!res.ok) {
    throw new Error(`API Error: ${res.status}`);
  }

  return res.json();
}

// Format currency for display
export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

// Format date for display
export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(date));
}

// Format relative time
export function formatRelativeTime(date: string | Date): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(date);
}
