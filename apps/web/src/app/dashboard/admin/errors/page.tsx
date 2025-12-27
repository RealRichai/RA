'use client';

import { useState, useEffect } from 'react';
import {
  AlertTriangle,
  AlertCircle,
  Clock,
  Filter,
  RefreshCw,
  Loader2,
  CheckCircle,
  XCircle,
  FileCode,
  Server,
  Globe,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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

interface ErrorLog {
  id: string;
  type: 'api' | 'client' | 'server';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  stack?: string;
  endpoint?: string;
  userId?: string;
  timestamp: string;
  resolved: boolean;
}

const DEMO_ERRORS: ErrorLog[] = [
  {
    id: 'err-1',
    type: 'api',
    severity: 'high',
    message: 'Failed to connect to scoring service',
    endpoint: '/api/v1/score/lead',
    timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    resolved: false,
  },
  {
    id: 'err-2',
    type: 'client',
    severity: 'medium',
    message: 'Unhandled promise rejection in LeadCard component',
    stack: 'TypeError: Cannot read property "score" of undefined\n  at LeadCard (leads/page.tsx:142)',
    timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    resolved: true,
  },
  {
    id: 'err-3',
    type: 'server',
    severity: 'low',
    message: 'Database connection pool exhausted temporarily',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    resolved: true,
  },
  {
    id: 'err-4',
    type: 'api',
    severity: 'critical',
    message: 'Authentication service timeout',
    endpoint: '/api/v1/auth/verify',
    userId: 'user-123',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    resolved: true,
  },
];

const typeIcons = {
  api: Globe,
  client: FileCode,
  server: Server,
};

const severityColors = {
  low: 'bg-blue-100 text-blue-700 border-blue-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  critical: 'bg-red-100 text-red-700 border-red-200',
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

export default function ErrorViewerPage() {
  const { isLoading: authLoading } = useRequireAuth();
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [showResolved, setShowResolved] = useState(true);

  const fetchErrors = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/admin/errors`);
      const data = await response.json();

      if (data.data && data.data.length > 0) {
        setErrors(data.data);
        setIsDemoMode(false);
      } else {
        setErrors(DEMO_ERRORS);
        setIsDemoMode(true);
      }
    } catch {
      setErrors(DEMO_ERRORS);
      setIsDemoMode(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchErrors();
  }, []);

  const markResolved = (id: string) => {
    setErrors((prev) =>
      prev.map((err) => (err.id === id ? { ...err, resolved: true } : err))
    );
  };

  const filteredErrors = errors.filter((err) => {
    if (!showResolved && err.resolved) return false;
    if (typeFilter !== 'all' && err.type !== typeFilter) return false;
    if (severityFilter !== 'all' && err.severity !== severityFilter) return false;
    return true;
  });

  const unresolvedCount = errors.filter((e) => !e.resolved).length;
  const criticalCount = errors.filter((e) => e.severity === 'critical' && !e.resolved).length;

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

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-surface-900">Error Viewer</h1>
            <p className="text-surface-600 mt-1">Monitor and resolve application errors</p>
          </div>
          <Button variant="outline" onClick={fetchErrors} disabled={isLoading}>
            <RefreshCw className={cn('h-4 w-4 mr-2', isLoading && 'animate-spin')} />
            Refresh
          </Button>
        </div>

        {isDemoMode && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800">Demo Mode</p>
              <p className="text-sm text-amber-600">Showing sample error logs.</p>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="p-4">
            <p className="text-sm text-surface-500">Total Errors</p>
            <p className="text-2xl font-bold text-surface-900">{errors.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-surface-500">Unresolved</p>
            <p className="text-2xl font-bold text-amber-600">{unresolvedCount}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-surface-500">Critical</p>
            <p className="text-2xl font-bold text-red-600">{criticalCount}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-surface-500">Resolved</p>
            <p className="text-2xl font-bold text-emerald-600">{errors.length - unresolvedCount}</p>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-36">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="api">API</SelectItem>
              <SelectItem value="client">Client</SelectItem>
              <SelectItem value="server">Server</SelectItem>
            </SelectContent>
          </Select>

          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Severities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant={showResolved ? 'default' : 'outline'}
            onClick={() => setShowResolved(!showResolved)}
          >
            {showResolved ? 'Showing Resolved' : 'Hiding Resolved'}
          </Button>
        </div>

        {/* Error List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-luxury-gold" />
          </div>
        ) : filteredErrors.length > 0 ? (
          <div className="space-y-3">
            {filteredErrors.map((error) => {
              const TypeIcon = typeIcons[error.type];
              return (
                <Card
                  key={error.id}
                  className={cn(
                    'transition-all',
                    error.resolved && 'opacity-60'
                  )}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className={cn(
                        'p-2 rounded-lg',
                        error.severity === 'critical' ? 'bg-red-100 text-red-600' :
                        error.severity === 'high' ? 'bg-orange-100 text-orange-600' :
                        error.severity === 'medium' ? 'bg-amber-100 text-amber-600' :
                        'bg-blue-100 text-blue-600'
                      )}>
                        <TypeIcon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge className={cn('text-xs', severityColors[error.severity])}>
                            {error.severity.toUpperCase()}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {error.type}
                          </Badge>
                          {error.resolved && (
                            <Badge variant="outline" className="text-xs text-emerald-600">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Resolved
                            </Badge>
                          )}
                        </div>
                        <p className="font-medium text-surface-900">{error.message}</p>
                        {error.endpoint && (
                          <p className="text-xs text-surface-500 mt-1">
                            Endpoint: <code className="bg-surface-100 px-1 rounded">{error.endpoint}</code>
                          </p>
                        )}
                        {error.stack && (
                          <pre className="text-xs text-surface-500 mt-2 p-2 bg-surface-50 rounded overflow-x-auto">
                            {error.stack}
                          </pre>
                        )}
                        <div className="flex items-center gap-2 mt-2 text-xs text-surface-400">
                          <Clock className="h-3 w-3" />
                          {formatTimeAgo(error.timestamp)}
                        </div>
                      </div>
                      {!error.resolved && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => markResolved(error.id)}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Resolve
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="py-16">
            <div className="text-center">
              <CheckCircle className="h-16 w-16 text-emerald-300 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-surface-900 mb-2">No Errors Found</h2>
              <p className="text-surface-600">
                {errors.length === 0
                  ? 'No errors have been logged yet.'
                  : 'All errors matching your filters have been resolved.'}
              </p>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
