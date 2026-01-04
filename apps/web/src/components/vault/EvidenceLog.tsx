'use client';

import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
  Upload,
  Download,
  Eye,
  Trash2,
  Share2,
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
} from 'lucide-react';

import type { EvidenceRecord } from './types';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';

interface EvidenceLogProps {
  propertyId: string;
  limit?: number;
}

const EVENT_ICONS: Record<string, typeof Upload> = {
  UPLOAD: Upload,
  DOWNLOAD: Download,
  VIEW: Eye,
  DELETE: Trash2,
  SHARE: Share2,
  ACL_CHECK: ShieldCheck,
  UPSELL_VIEW: Eye,
  UPSELL_CONVERT: ShieldCheck,
  UPSELL_DISMISS: AlertCircle,
};

const EVENT_LABELS: Record<string, string> = {
  UPLOAD: 'Document Uploaded',
  DOWNLOAD: 'Document Downloaded',
  VIEW: 'Document Viewed',
  DELETE: 'Document Deleted',
  SHARE: 'Document Shared',
  ACL_CHECK: 'Access Check',
  UPSELL_VIEW: 'Upsell Viewed',
  UPSELL_CONVERT: 'Partner Selected',
  UPSELL_DISMISS: 'Upsell Dismissed',
};

const OUTCOME_STYLES: Record<string, string> = {
  SUCCESS: 'text-green-600 dark:text-green-400',
  DENIED: 'text-red-600 dark:text-red-400',
  FAILED: 'text-amber-600 dark:text-amber-400',
};

export function EvidenceLog({ propertyId, limit = 10 }: EvidenceLogProps) {
  const { data: evidence, isLoading } = useQuery({
    queryKey: ['vault-evidence', propertyId, limit],
    queryFn: async () => {
      const response = await api.get<{ data: EvidenceRecord[] }>(
        `/properties/${propertyId}/vault/evidence?limit=${limit}`
      );
      return response.data?.data ?? [];
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Access Log</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!evidence || evidence.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Access Log</CardTitle>
          <CardDescription>No activity recorded yet</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-green-500" />
          Access Log
        </CardTitle>
        <CardDescription>
          SOC2-compliant audit trail of vault access
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {evidence.map((record) => {
            const Icon = EVENT_ICONS[record.eventType] || Eye;
            const isSuccess = record.eventOutcome === 'SUCCESS';
            const isDenied = record.eventOutcome === 'DENIED';

            return (
              <div
                key={record.id}
                className={`flex items-start gap-3 p-3 rounded-lg ${
                  isDenied
                    ? 'bg-red-50 dark:bg-red-950/30'
                    : 'bg-muted/50'
                }`}
              >
                <div
                  className={`p-2 rounded-lg ${
                    isSuccess
                      ? 'bg-green-100 dark:bg-green-900'
                      : isDenied
                        ? 'bg-red-100 dark:bg-red-900'
                        : 'bg-amber-100 dark:bg-amber-900'
                  }`}
                >
                  {isDenied ? (
                    <ShieldAlert className="h-4 w-4 text-red-600 dark:text-red-400" />
                  ) : (
                    <Icon
                      className={`h-4 w-4 ${
                        isSuccess
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-sm">
                      {EVENT_LABELS[record.eventType] || record.eventType}
                    </p>
                    <span
                      className={`text-xs font-medium ${
                        OUTCOME_STYLES[record.eventOutcome] || ''
                      }`}
                    >
                      {record.eventOutcome}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {record.actorEmail} ({record.actorRole})
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(record.timestamp), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
