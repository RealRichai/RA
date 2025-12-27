/**
 * Notification System
 * 
 * Provides a comprehensive notification management system including:
 * - Type definitions for various notification categories
 * - API client for fetching/updating notifications
 * - Zustand store for local state management
 * - WebSocket stub for real-time updates
 * 
 * @module lib/notifications
 */

import { api } from '@/lib/api';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// =============================================================================
// TYPES
// =============================================================================

export type NotificationType =
  | 'application_received'
  | 'application_status_changed'
  | 'tour_scheduled'
  | 'tour_reminder'
  | 'tour_cancelled'
  | 'listing_published'
  | 'listing_expired'
  | 'lease_ready'
  | 'payment_received'
  | 'payment_due'
  | 'message_received'
  | 'document_uploaded'
  | 'verification_complete'
  | 'system_announcement';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface Notification {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  read: boolean;
  actionUrl?: string;
  actionLabel?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  expiresAt?: string;
}

export interface NotificationPreferences {
  email: {
    enabled: boolean;
    digest: 'instant' | 'daily' | 'weekly' | 'none';
    types: NotificationType[];
  };
  push: {
    enabled: boolean;
    types: NotificationType[];
  };
  sms: {
    enabled: boolean;
    types: NotificationType[];
  };
}

export interface NotificationGroup {
  date: string;
  notifications: Notification[];
}

// =============================================================================
// NOTIFICATION METADATA
// =============================================================================

export const NOTIFICATION_ICONS: Record<NotificationType, string> = {
  application_received: 'FileText',
  application_status_changed: 'FileCheck',
  tour_scheduled: 'Calendar',
  tour_reminder: 'Clock',
  tour_cancelled: 'CalendarX',
  listing_published: 'Building2',
  listing_expired: 'AlertCircle',
  lease_ready: 'FileSignature',
  payment_received: 'DollarSign',
  payment_due: 'CreditCard',
  message_received: 'MessageSquare',
  document_uploaded: 'Upload',
  verification_complete: 'CheckCircle',
  system_announcement: 'Info',
};

export const NOTIFICATION_COLORS: Record<NotificationType, string> = {
  application_received: 'bg-blue-100 text-blue-600',
  application_status_changed: 'bg-purple-100 text-purple-600',
  tour_scheduled: 'bg-green-100 text-green-600',
  tour_reminder: 'bg-amber-100 text-amber-600',
  tour_cancelled: 'bg-red-100 text-red-600',
  listing_published: 'bg-emerald-100 text-emerald-600',
  listing_expired: 'bg-orange-100 text-orange-600',
  lease_ready: 'bg-indigo-100 text-indigo-600',
  payment_received: 'bg-green-100 text-green-600',
  payment_due: 'bg-amber-100 text-amber-600',
  message_received: 'bg-blue-100 text-blue-600',
  document_uploaded: 'bg-cyan-100 text-cyan-600',
  verification_complete: 'bg-emerald-100 text-emerald-600',
  system_announcement: 'bg-surface-100 text-surface-600',
};

// =============================================================================
// API CLIENT
// =============================================================================

export const notificationsApi = {
  /**
   * Fetch all notifications for the current user
   */
  getAll(params?: { unreadOnly?: boolean; limit?: number; offset?: number }) {
    return api.get<{ notifications: Notification[]; total: number; unreadCount: number }>(
      '/notifications',
      params as Record<string, string | number | boolean>
    );
  },

  /**
   * Get unread notification count
   */
  getUnreadCount() {
    return api.get<{ count: number }>('/notifications/unread-count');
  },

  /**
   * Mark a notification as read
   */
  markAsRead(id: string) {
    return api.patch<Notification>(`/notifications/${id}/read`);
  },

  /**
   * Mark all notifications as read
   */
  markAllAsRead() {
    return api.post<{ success: boolean }>('/notifications/mark-all-read');
  },

  /**
   * Delete a notification
   */
  delete(id: string) {
    return api.delete(`/notifications/${id}`);
  },

  /**
   * Get notification preferences
   */
  getPreferences() {
    return api.get<NotificationPreferences>('/notifications/preferences');
  },

  /**
   * Update notification preferences
   */
  updatePreferences(preferences: Partial<NotificationPreferences>) {
    return api.patch<NotificationPreferences>('/notifications/preferences', preferences);
  },

  /**
   * Subscribe to push notifications (returns subscription info)
   */
  subscribePush(subscription: PushSubscription) {
    return api.post<{ success: boolean }>('/notifications/push/subscribe', {
      endpoint: subscription.endpoint,
      keys: subscription.toJSON().keys,
    });
  },

  /**
   * Unsubscribe from push notifications
   */
  unsubscribePush() {
    return api.post<{ success: boolean }>('/notifications/push/unsubscribe');
  },
};

// =============================================================================
// ZUSTAND STORE
// =============================================================================

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  lastFetched: number | null;
  
  // Actions
  setNotifications: (notifications: Notification[]) => void;
  addNotification: (notification: Notification) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;
  setUnreadCount: (count: number) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initialState = {
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  error: null,
  lastFetched: null,
};

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setNotifications: (notifications) => {
        const unreadCount = notifications.filter((n) => !n.read).length;
        set({ notifications, unreadCount, lastFetched: Date.now() });
      },

      addNotification: (notification) => {
        set((state) => ({
          notifications: [notification, ...state.notifications],
          unreadCount: notification.read ? state.unreadCount : state.unreadCount + 1,
        }));
      },

      markAsRead: (id) => {
        set((state) => {
          const notification = state.notifications.find((n) => n.id === id);
          if (!notification || notification.read) return state;

          return {
            notifications: state.notifications.map((n) =>
              n.id === id ? { ...n, read: true } : n
            ),
            unreadCount: Math.max(0, state.unreadCount - 1),
          };
        });
      },

      markAllAsRead: () => {
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, read: true })),
          unreadCount: 0,
        }));
      },

      removeNotification: (id) => {
        set((state) => {
          const notification = state.notifications.find((n) => n.id === id);
          return {
            notifications: state.notifications.filter((n) => n.id !== id),
            unreadCount: notification && !notification.read
              ? Math.max(0, state.unreadCount - 1)
              : state.unreadCount,
          };
        });
      },

      setUnreadCount: (count) => set({ unreadCount: count }),
      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),
      reset: () => set(initialState),
    }),
    {
      name: 'realriches-notifications',
      partialize: (state) => ({
        notifications: state.notifications.slice(0, 50), // Only persist last 50
        unreadCount: state.unreadCount,
        lastFetched: state.lastFetched,
      }),
    }
  )
);

// =============================================================================
// WEBSOCKET STUB (for future real-time implementation)
// =============================================================================

export class NotificationWebSocket {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private listeners: Map<string, Set<(notification: Notification) => void>> = new Map();

  constructor(private url: string) {}

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('Notification WebSocket connected');
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'notification') {
            this.emit('notification', data.payload);
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      this.ws.onclose = () => {
        console.log('Notification WebSocket disconnected');
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('Notification WebSocket error:', error);
      };
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    setTimeout(() => {
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      this.connect();
    }, delay);
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  on(event: string, callback: (notification: Notification) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: (notification: Notification) => void): void {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, data: Notification): void {
    this.listeners.get(event)?.forEach((callback) => callback(data));
  }
}

// Singleton instance (would be initialized with actual WebSocket URL in production)
let wsInstance: NotificationWebSocket | null = null;

export function getNotificationWebSocket(url?: string): NotificationWebSocket {
  if (!wsInstance && url) {
    wsInstance = new NotificationWebSocket(url);
  }
  return wsInstance!;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Groups notifications by date for display
 */
export function groupNotificationsByDate(notifications: Notification[]): NotificationGroup[] {
  const groups: Map<string, Notification[]> = new Map();

  notifications.forEach((notification) => {
    const date = new Date(notification.createdAt);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let dateKey: string;
    if (date.toDateString() === today.toDateString()) {
      dateKey = 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      dateKey = 'Yesterday';
    } else {
      dateKey = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    }

    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    groups.get(dateKey)!.push(notification);
  });

  return Array.from(groups.entries()).map(([date, notifications]) => ({
    date,
    notifications,
  }));
}

/**
 * Formats relative time for notifications
 */
export function formatNotificationTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Check if notification is expired
 */
export function isNotificationExpired(notification: Notification): boolean {
  if (!notification.expiresAt) return false;
  return new Date(notification.expiresAt) < new Date();
}

/**
 * Filter out expired notifications
 */
export function filterExpiredNotifications(notifications: Notification[]): Notification[] {
  return notifications.filter((n) => !isNotificationExpired(n));
}
