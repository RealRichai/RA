'use client';

import { useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  FileText,
  FileCheck,
  Calendar,
  Clock,
  CalendarX,
  Building2,
  AlertCircle,
  FileSignature,
  DollarSign,
  CreditCard,
  MessageSquare,
  Upload,
  CheckCircle,
  Info,
  Check,
  Loader2,
  ExternalLink,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  notificationsApi,
  useNotificationStore,
  groupNotificationsByDate,
  formatNotificationTime,
  type Notification,
  type NotificationType,
  NOTIFICATION_COLORS,
} from '@/lib/notifications';

// =============================================================================
// ICON MAPPING
// =============================================================================

const NotificationIcons: Record<NotificationType, React.ElementType> = {
  application_received: FileText,
  application_status_changed: FileCheck,
  tour_scheduled: Calendar,
  tour_reminder: Clock,
  tour_cancelled: CalendarX,
  listing_published: Building2,
  listing_expired: AlertCircle,
  lease_ready: FileSignature,
  payment_received: DollarSign,
  payment_due: CreditCard,
  message_received: MessageSquare,
  document_uploaded: Upload,
  verification_complete: CheckCircle,
  system_announcement: Info,
};

// =============================================================================
// NOTIFICATION ITEM
// =============================================================================

function NotificationItem({
  notification,
  onMarkAsRead,
  onDelete,
}: {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const Icon = NotificationIcons[notification.type] || Info;
  const colorClasses = NOTIFICATION_COLORS[notification.type] || 'bg-surface-100 text-surface-600';

  return (
    <div
      className={cn(
        'group relative flex gap-3 p-3 rounded-lg transition-colors',
        notification.read
          ? 'bg-white hover:bg-surface-50'
          : 'bg-luxury-champagne/20 hover:bg-luxury-champagne/30'
      )}
    >
      {/* Icon */}
      <div className={cn('flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center', colorClasses)}>
        <Icon className="h-4 w-4" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={cn(
            'text-sm line-clamp-1',
            notification.read ? 'text-surface-700' : 'text-surface-900 font-medium'
          )}>
            {notification.title}
          </p>
          <span className="text-xs text-surface-400 flex-shrink-0">
            {formatNotificationTime(notification.createdAt)}
          </span>
        </div>
        
        <p className="text-xs text-surface-500 mt-0.5 line-clamp-2">
          {notification.message}
        </p>

        {/* Action Link */}
        {notification.actionUrl && (
          <Link
            href={notification.actionUrl}
            className="inline-flex items-center gap-1 text-xs text-luxury-bronze hover:underline mt-1.5"
            onClick={() => onMarkAsRead(notification.id)}
          >
            {notification.actionLabel || 'View Details'}
            <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </div>

      {/* Unread Indicator */}
      {!notification.read && (
        <div className="absolute top-3 right-3">
          <div className="h-2 w-2 rounded-full bg-luxury-gold" />
        </div>
      )}

      {/* Hover Actions */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
        {!notification.read && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMarkAsRead(notification.id);
            }}
            className="p-1.5 rounded-md hover:bg-surface-200 text-surface-500 hover:text-surface-700"
            title="Mark as read"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(notification.id);
          }}
          className="p-1.5 rounded-md hover:bg-red-100 text-surface-500 hover:text-red-600"
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// NOTIFICATION DROPDOWN
// =============================================================================

export function NotificationDropdown() {
  const queryClient = useQueryClient();
  const {
    notifications,
    unreadCount,
    setNotifications,
    setUnreadCount,
    markAsRead: markAsReadLocal,
    markAllAsRead: markAllAsReadLocal,
    removeNotification,
  } = useNotificationStore();

  // Fetch notifications
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const response = await notificationsApi.getAll({ limit: 20 });
      return response.data;
    },
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Refetch every minute
  });

  // Sync fetched data to store
  useEffect(() => {
    if (data) {
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    }
  }, [data, setNotifications, setUnreadCount]);

  // Mark as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.markAsRead(id),
    onMutate: (id) => {
      markAsReadLocal(id);
    },
    onError: () => {
      refetch();
    },
  });

  // Mark all as read mutation
  const markAllAsReadMutation = useMutation({
    mutationFn: () => notificationsApi.markAllAsRead(),
    onMutate: () => {
      markAllAsReadLocal();
    },
    onError: () => {
      refetch();
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.delete(id),
    onMutate: (id) => {
      removeNotification(id);
    },
    onError: () => {
      refetch();
    },
  });

  const handleMarkAsRead = useCallback((id: string) => {
    markAsReadMutation.mutate(id);
  }, [markAsReadMutation]);

  const handleMarkAllAsRead = useCallback(() => {
    markAllAsReadMutation.mutate();
  }, [markAllAsReadMutation]);

  const handleDelete = useCallback((id: string) => {
    deleteMutation.mutate(id);
  }, [deleteMutation]);

  const groupedNotifications = groupNotificationsByDate(notifications);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-5 w-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-96 p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold text-surface-900">Notifications</h3>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMarkAllAsRead}
                disabled={markAllAsReadMutation.isPending}
                className="text-xs h-7"
              >
                {markAllAsReadMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  'Mark all read'
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Notification List */}
        <div className="max-h-[400px] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-surface-400" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-8">
              <Bell className="h-10 w-10 text-surface-300 mx-auto mb-3" />
              <p className="text-surface-500 text-sm">No notifications yet</p>
              <p className="text-surface-400 text-xs mt-1">
                We'll notify you when something happens
              </p>
            </div>
          ) : (
            <div className="py-2">
              {groupedNotifications.map((group) => (
                <div key={group.date}>
                  <div className="px-4 py-2">
                    <p className="text-xs font-medium text-surface-400 uppercase tracking-wide">
                      {group.date}
                    </p>
                  </div>
                  <div className="px-2 space-y-1">
                    {group.notifications.map((notification) => (
                      <NotificationItem
                        key={notification.id}
                        notification={notification}
                        onMarkAsRead={handleMarkAsRead}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="border-t px-4 py-3">
            <Link
              href="/dashboard/notifications"
              className="text-sm text-luxury-bronze hover:underline flex items-center justify-center gap-1"
            >
              View all notifications
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default NotificationDropdown;
