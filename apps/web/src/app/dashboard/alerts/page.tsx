'use client';

import { useState, useEffect } from 'react';
import {
  Bell,
  AlertTriangle,
  CheckCircle,
  Info,
  Loader2,
  Clock,
  Filter,
  Trash2,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

interface Alert {
  id: string;
  type: 'info' | 'warning' | 'success' | 'error';
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

const DEMO_ALERTS: Alert[] = [
  {
    id: 'alert-1',
    type: 'success',
    title: 'New Hot Lead',
    message: 'Sarah Chen scored 92 and is ready for immediate follow-up.',
    read: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
  {
    id: 'alert-2',
    type: 'warning',
    title: 'Tour Reminder',
    message: 'You have 3 tours scheduled for tomorrow. Review the itinerary.',
    read: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
  },
  {
    id: 'alert-3',
    type: 'info',
    title: 'Weekly Report Ready',
    message: 'Your performance metrics for the week are now available.',
    read: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
  {
    id: 'alert-4',
    type: 'success',
    title: 'Application Approved',
    message: 'Maria Rodriguez application for 123 Main St has been approved.',
    read: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
  },
  {
    id: 'alert-5',
    type: 'error',
    title: 'Export Failed',
    message: 'The Salesforce export failed due to API rate limits. Try again later.',
    read: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
  },
];

const typeIcons = {
  info: Info,
  warning: AlertTriangle,
  success: CheckCircle,
  error: AlertTriangle,
};

const typeColors = {
  info: 'bg-blue-50 text-blue-600 border-blue-200',
  warning: 'bg-amber-50 text-amber-600 border-amber-200',
  success: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  error: 'bg-red-50 text-red-600 border-red-200',
};

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export default function AlertsPage() {
  const { isLoading: authLoading } = useRequireAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [isDemoMode, setIsDemoMode] = useState(false);

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const response = await fetch(`${API_BASE}/alerts`);
        const data = await response.json();

        if (data.data && data.data.length > 0) {
          setAlerts(data.data);
          setIsDemoMode(false);
        } else {
          setAlerts(DEMO_ALERTS);
          setIsDemoMode(true);
        }
      } catch (err) {
        setAlerts(DEMO_ALERTS);
        setIsDemoMode(true);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAlerts();
  }, []);

  const markAsRead = async (id: string) => {
    setAlerts((prev) =>
      prev.map((alert) => (alert.id === id ? { ...alert, read: true } : alert))
    );
  };

  const markAllAsRead = () => {
    setAlerts((prev) => prev.map((alert) => ({ ...alert, read: true })));
  };

  const deleteAlert = (id: string) => {
    setAlerts((prev) => prev.filter((alert) => alert.id !== id));
  };

  const filteredAlerts = alerts.filter((alert) => {
    if (filter === 'unread') return !alert.read;
    if (filter === 'read') return alert.read;
    return true;
  });

  const unreadCount = alerts.filter((a) => !a.read).length;

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
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-surface-900">Alerts</h1>
            <p className="text-surface-600 mt-1">
              {unreadCount > 0 ? `${unreadCount} unread notifications` : 'All caught up!'}
            </p>
          </div>
          {unreadCount > 0 && (
            <Button variant="outline" onClick={markAllAsRead}>
              <Check className="h-4 w-4 mr-2" />
              Mark All Read
            </Button>
          )}
        </div>

        {isDemoMode && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800">Demo Mode</p>
              <p className="text-sm text-amber-600">Showing sample alerts.</p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-4 mb-6">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-40">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Alerts</SelectItem>
              <SelectItem value="unread">Unread</SelectItem>
              <SelectItem value="read">Read</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Alerts List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-luxury-gold" />
          </div>
        ) : filteredAlerts.length > 0 ? (
          <div className="space-y-3">
            {filteredAlerts.map((alert) => {
              const Icon = typeIcons[alert.type];
              return (
                <Card
                  key={alert.id}
                  className={cn(
                    'transition-all',
                    !alert.read && 'ring-2 ring-luxury-gold/20'
                  )}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className={cn('p-2 rounded-lg border', typeColors[alert.type])}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-surface-900">{alert.title}</h3>
                          {!alert.read && (
                            <Badge className="bg-luxury-gold text-white text-xs">New</Badge>
                          )}
                        </div>
                        <p className="text-sm text-surface-600">{alert.message}</p>
                        <div className="flex items-center gap-2 mt-2 text-xs text-surface-400">
                          <Clock className="h-3 w-3" />
                          {formatTimeAgo(alert.createdAt)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!alert.read && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => markAsRead(alert.id)}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteAlert(alert.id)}
                        >
                          <Trash2 className="h-4 w-4 text-surface-400" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="py-16">
            <div className="text-center">
              <Bell className="h-16 w-16 text-surface-300 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-surface-900 mb-2">No Alerts</h2>
              <p className="text-surface-600">
                {filter === 'unread'
                  ? "You're all caught up! No unread alerts."
                  : 'No alerts to display.'}
              </p>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
