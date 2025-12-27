'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DemoModeState } from '@/components/ui/demo-mode-state';
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
  CheckCheck,
  Loader2,
  ExternalLink,
  Trash2,
  Settings,
  Filter,
  ArrowLeft,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Header } from '@/components/layout/header';
import { cn } from '@/lib/utils';
import { useRequireAuth } from '@/hooks';
import {
  notificationsApi,
  useNotificationStore,
  groupNotificationsByDate,
  formatNotificationTime,
  type Notification,
  type NotificationType,
  NOTIFICATION_COLORS,
} from '@/lib/notifications';
import { toast } from '@/components/ui/toaster';

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

const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  application_received: 'Application Received',
  application_status_changed: 'Application Status',
  tour_scheduled: 'Tour Scheduled',
  tour_reminder: 'Tour Reminder',
  tour_cancelled: 'Tour Cancelled',
  listing_published: 'Listing Published',
  listing_expired: 'Listing Expired',
  lease_ready: 'Lease Ready',
  payment_received: 'Payment Received',
  payment_due: 'Payment Due',
  message_received: 'Message',
  document_uploaded: 'Document',
  verification_complete: 'Verification',
  system_announcement: 'System',
};

// =============================================================================
// NOTIFICATION CARD
// =============================================================================

function NotificationCard({
  notification,
  onMarkAsRead,
  onDelete,
  isDeleting,
}: {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}) {
  const Icon = NotificationIcons[notification.type] || Info;
  const colorClasses = NOTIFICATION_COLORS[notification.type] || 'bg-surface-100 text-surface-600';
  const router = useRouter();

  const handleClick = () => {
    if (!notification.read) {
      onMarkAsRead(notification.id);
    }
    if (notification.actionUrl) {
      router.push(notification.actionUrl as never);
    }
  };

  return (
    <Card
      className={cn(
        'transition-all cursor-pointer hover:shadow-md',
        notification.read
          ? 'bg-white'
          : 'bg-luxury-champagne/10 border-luxury-gold/30'
      )}
      onClick={handleClick}
    >
      <CardContent className="p-4">
        <div className="flex gap-4">
          {/* Icon */}
          <div className={cn(
            'flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center',
            colorClasses
          )}>
            <Icon className="h-6 w-6" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4 mb-1">
              <div className="flex items-center gap-2">
                <h3 className={cn(
                  'text-base',
                  notification.read ? 'font-medium text-surface-800' : 'font-semibold text-surface-900'
                )}>
                  {notification.title}
                </h3>
                {!notification.read && (
                  <Badge variant="gold" className="text-xs">New</Badge>
                )}
              </div>
              <span className="text-sm text-surface-400 flex-shrink-0">
                {formatNotificationTime(notification.createdAt)}
              </span>
            </div>

            <p className="text-sm text-surface-600 mb-3">
              {notification.message}
            </p>

            <div className="flex items-center justify-between">
              <Badge variant="outline" className="text-xs">
                {NOTIFICATION_TYPE_LABELS[notification.type]}
              </Badge>

              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                {!notification.read && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onMarkAsRead(notification.id)}
                    className="text-xs"
                  >
                    <Check className="h-3.5 w-3.5 mr-1" />
                    Mark as read
                  </Button>
                )}
                {notification.actionUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    asChild
                    className="text-xs text-luxury-bronze"
                  >
                    <Link href={notification.actionUrl as never}>
                      {notification.actionLabel || 'View'}
                      <ExternalLink className="h-3.5 w-3.5 ml-1" />
                    </Link>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(notification.id)}
                  disabled={isDeleting}
                  className="text-surface-400 hover:text-red-600 h-8 w-8"
                >
                  {isDeleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function NotificationsPage() {
  const router = useRouter();
  const { isLoading: authLoading } = useRequireAuth();
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

  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Fetch notifications
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['notifications', 'all'],
    queryFn: async () => {
      const response = await notificationsApi.getAll({ limit: 100 });
      if (response.error) {
        throw new Error(response.error.message);
      }
      return response.data;
    },
    retry: 1,
  });

  // Sync to store
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
    onSuccess: () => {
      toast({ title: 'All notifications marked as read', variant: 'success' });
    },
    onError: () => {
      refetch();
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.delete(id),
    onMutate: (id) => {
      setDeletingId(id);
    },
    onSuccess: (_, id) => {
      removeNotification(id);
      toast({ title: 'Notification deleted', variant: 'success' });
    },
    onError: () => {
      refetch();
    },
    onSettled: () => {
      setDeletingId(null);
    },
  });

  // Filter notifications
  const filteredNotifications = notifications
    .filter((n) => {
      if (filter === 'unread' && n.read) return false;
      if (typeFilter !== 'all' && n.type !== typeFilter) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          n.title.toLowerCase().includes(query) ||
          n.message.toLowerCase().includes(query)
        );
      }
      return true;
    });

  const groupedNotifications = groupNotificationsByDate(filteredNotifications);

  // Get unique notification types for filter
  const uniqueTypes = Array.from(new Set(notifications.map((n) => n.type)));

  if (authLoading) {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-luxury-gold" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-50">
      <Header />

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Demo Mode Banner */}
        {isError && (
          <DemoModeState
            title="Notifications"
            message="The notifications API is not available. Unable to load notifications."
            icon={Bell}
          />
        )}

        {/* Header */}
        <div className="mb-8">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-surface-600 hover:text-surface-900 mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-surface-900">Notifications</h1>
              <p className="text-surface-600 mt-1">
                {unreadCount > 0
                  ? `You have ${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`
                  : "You're all caught up!"}
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              {unreadCount > 0 && (
                <Button
                  variant="outline"
                  onClick={() => markAllAsReadMutation.mutate()}
                  disabled={markAllAsReadMutation.isPending}
                >
                  {markAllAsReadMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <CheckCheck className="h-4 w-4 mr-2" />
                  )}
                  Mark all as read
                </Button>
              )}
              <Button variant="outline" asChild>
                <Link href="/dashboard/settings#notifications">
                  <Settings className="h-4 w-4 mr-2" />
                  Preferences
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-surface-400" />
            <Input
              placeholder="Search notifications..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <div className="flex gap-2">
            <Select value={filter} onValueChange={(v) => setFilter(v as 'all' | 'unread')}>
              <SelectTrigger className="w-32">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="unread">Unread</SelectItem>
              </SelectContent>
            </Select>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {uniqueTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {NOTIFICATION_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-surface-900">{notifications.length}</p>
            <p className="text-sm text-surface-500">Total</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-luxury-bronze">{unreadCount}</p>
            <p className="text-sm text-surface-500">Unread</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600">
              {notifications.filter((n) => n.read).length}
            </p>
            <p className="text-sm text-surface-500">Read</p>
          </Card>
        </div>

        {/* Notifications List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-luxury-gold" />
          </div>
        ) : filteredNotifications.length === 0 ? (
          <Card className="py-16">
            <div className="text-center">
              <Bell className="h-16 w-16 text-surface-300 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-surface-900 mb-2">
                {notifications.length === 0
                  ? 'No Notifications Yet'
                  : 'No Matching Notifications'}
              </h2>
              <p className="text-surface-600 mb-6 max-w-md mx-auto">
                {notifications.length === 0
                  ? "We'll notify you when there's activity on your account."
                  : 'Try adjusting your filters to see more notifications.'}
              </p>
              {notifications.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setFilter('all');
                    setTypeFilter('all');
                    setSearchQuery('');
                  }}
                >
                  Clear Filters
                </Button>
              )}
            </div>
          </Card>
        ) : (
          <div className="space-y-6">
            {groupedNotifications.map((group) => (
              <div key={group.date}>
                <h3 className="text-sm font-semibold text-surface-500 uppercase tracking-wide mb-3">
                  {group.date}
                </h3>
                <div className="space-y-3">
                  {group.notifications.map((notification) => (
                    <NotificationCard
                      key={notification.id}
                      notification={notification}
                      onMarkAsRead={(id) => markAsReadMutation.mutate(id)}
                      onDelete={(id) => deleteMutation.mutate(id)}
                      isDeleting={deletingId === notification.id}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
