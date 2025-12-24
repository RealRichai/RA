'use client';

import * as React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatRelativeTime, cn } from '@/lib/utils';
import api from '@/lib/api-client';
import type { Notification } from '@/types';
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  FileText,
  CreditCard,
  Calendar,
  MessageSquare,
  AlertCircle,
  Building2,
} from 'lucide-react';

const NOTIFICATION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  LEASE_EXPIRING: Building2,
  PAYMENT_DUE: CreditCard,
  PAYMENT_RECEIVED: CreditCard,
  NEW_APPLICATION: FileText,
  APPLICATION_UPDATE: FileText,
  TOUR_SCHEDULED: Calendar,
  TOUR_REMINDER: Calendar,
  NEW_MESSAGE: MessageSquare,
  SYSTEM: AlertCircle,
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<'all' | 'unread'>('all');

  React.useEffect(() => {
    async function loadNotifications() {
      try {
        const response = await api.getNotifications({
          read: filter === 'unread' ? false : undefined,
          limit: 50,
        });
        setNotifications(response.notifications || []);
        setUnreadCount(response.unreadCount || 0);
      } catch (error) {
        console.error('Failed to load notifications:', error);
      } finally {
        setLoading(false);
      }
    }

    loadNotifications();
  }, [filter]);

  const handleMarkAsRead = async (id: string) => {
    try {
      await api.markNotificationAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await api.markAllNotificationsAsRead();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() }))
      );
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteNotification(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-muted-foreground">Loading notifications...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Notifications</h1>
          <p className="text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" onClick={handleMarkAllAsRead}>
            <CheckCheck className="h-4 w-4 mr-2" />
            Mark All Read
          </Button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        <Button
          variant={filter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('all')}
        >
          All
        </Button>
        <Button
          variant={filter === 'unread' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('unread')}
        >
          Unread {unreadCount > 0 && `(${unreadCount})`}
        </Button>
      </div>

      {/* Notifications list */}
      {notifications.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Bell className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No notifications</h3>
            <p className="text-muted-foreground">
              {filter === 'unread'
                ? "You're all caught up!"
                : 'Notifications will appear here'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onMarkAsRead={() => handleMarkAsRead(notification.id)}
              onDelete={() => handleDelete(notification.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationItem({
  notification,
  onMarkAsRead,
  onDelete,
}: {
  notification: Notification;
  onMarkAsRead: () => void;
  onDelete: () => void;
}) {
  const Icon = NOTIFICATION_ICONS[notification.type] || Bell;
  const isUnread = !notification.readAt;

  return (
    <Card
      className={cn(
        'transition-colors',
        isUnread && 'bg-primary/5 border-primary/20'
      )}
    >
      <CardContent className="p-4">
        <div className="flex gap-4">
          <div
            className={cn(
              'flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center',
              isUnread ? 'bg-primary/10' : 'bg-muted'
            )}
          >
            <Icon
              className={cn(
                'h-5 w-5',
                isUnread ? 'text-primary' : 'text-muted-foreground'
              )}
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className={cn('font-medium', isUnread && 'text-primary')}>
                  {notification.title}
                </h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {notification.message}
                </p>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {formatRelativeTime(notification.createdAt)}
              </span>
            </div>

            <div className="flex items-center gap-2 mt-3">
              {notification.actionUrl && (
                <Link href={notification.actionUrl}>
                  <Button variant="outline" size="sm">
                    View Details
                  </Button>
                </Link>
              )}
              {isUnread && (
                <Button variant="ghost" size="sm" onClick={onMarkAsRead}>
                  <Check className="h-4 w-4 mr-1" />
                  Mark Read
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={onDelete}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
