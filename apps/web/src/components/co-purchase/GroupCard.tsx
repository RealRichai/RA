'use client';

import { Users, CheckSquare, FileText, ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface GroupCardProps {
  id: string;
  name: string;
  description?: string | null;
  status: 'forming' | 'verification' | 'document_collection' | 'ready' | 'archived';
  memberCount: number;
  checklistProgress?: {
    completed: number;
    total: number;
  };
  documentCount?: number;
  className?: string;
}

const statusConfig = {
  forming: {
    label: 'Forming',
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
  },
  verification: {
    label: 'Verification',
    color: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400',
  },
  document_collection: {
    label: 'Collecting Documents',
    color: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
  },
  ready: {
    label: 'Ready',
    color: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
  },
  archived: {
    label: 'Archived',
    color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
  },
};

export function GroupCard({
  id,
  name,
  description,
  status,
  memberCount,
  checklistProgress,
  documentCount = 0,
  className,
}: GroupCardProps) {
  const statusInfo = statusConfig[status];

  return (
    <Link href={`/dashboard/groups/${id}`}>
      <Card className={cn('hover:bg-accent/50 transition-colors cursor-pointer group', className)}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg">{name}</CardTitle>
              {description && (
                <CardDescription className="line-clamp-2">{description}</CardDescription>
              )}
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                <span>{memberCount} members</span>
              </div>
              {checklistProgress && (
                <div className="flex items-center gap-1.5">
                  <CheckSquare className="h-4 w-4" />
                  <span>
                    {checklistProgress.completed}/{checklistProgress.total} tasks
                  </span>
                </div>
              )}
              {documentCount > 0 && (
                <div className="flex items-center gap-1.5">
                  <FileText className="h-4 w-4" />
                  <span>{documentCount} docs</span>
                </div>
              )}
            </div>
            <span className={cn('text-xs font-medium px-2.5 py-1 rounded-full', statusInfo.color)}>
              {statusInfo.label}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
