'use client';

import { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, Loader2, RefreshCw, Server } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DemoModeStateProps {
  title: string;
  message?: string;
  icon?: React.ElementType;
}

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export function DemoModeState({
  title,
  message = 'The API server is not available. Showing demo mode with sample data.',
  icon: Icon = AlertCircle
}: DemoModeStateProps) {
  const [healthStatus, setHealthStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const [isRetrying, setIsRetrying] = useState(false);

  const checkHealth = async () => {
    setHealthStatus('checking');
    try {
      const response = await fetch(`${API_BASE}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.ok) {
        setHealthStatus('ok');
      } else {
        setHealthStatus('error');
      }
    } catch {
      setHealthStatus('error');
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  const handleRetry = async () => {
    setIsRetrying(true);
    await checkHealth();
    setIsRetrying(false);
    if (healthStatus === 'ok') {
      window.location.reload();
    }
  };

  return (
    <Card className="max-w-lg mx-auto mt-8">
      <CardContent className="p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-amber-100 flex items-center justify-center">
          <Icon className="h-8 w-8 text-amber-600" />
        </div>

        <h2 className="text-2xl font-display font-bold text-surface-900 mb-2">
          {title}
        </h2>

        <p className="text-surface-500 mb-6">
          {message}
        </p>

        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface-50 border border-surface-200 mb-6">
          <Server className="h-4 w-4 text-surface-500" />
          <span className="text-sm font-medium text-surface-700">Health Check:</span>
          {healthStatus === 'checking' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-surface-400" />
              <span className="text-sm text-surface-500">Checking...</span>
            </>
          ) : healthStatus === 'ok' ? (
            <>
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              <span className="text-sm text-emerald-600 font-medium">OK</span>
            </>
          ) : (
            <>
              <AlertCircle className="h-4 w-4 text-red-500" />
              <span className="text-sm text-red-600 font-medium">Unavailable</span>
            </>
          )}
        </div>

        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            onClick={handleRetry}
            disabled={isRetrying}
          >
            {isRetrying ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Retry Connection
          </Button>
        </div>

        <div className="mt-6 pt-6 border-t border-surface-100">
          <p className="text-xs text-surface-400">
            Demo Mode - Displaying sample data
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

interface ApiErrorBoundaryProps {
  children: React.ReactNode;
  error: Error | null;
  title: string;
  icon?: React.ElementType;
}

export function ApiErrorBoundary({ children, error, title, icon }: ApiErrorBoundaryProps) {
  if (error) {
    return <DemoModeState title={title} icon={icon} />;
  }
  return <>{children}</>;
}
