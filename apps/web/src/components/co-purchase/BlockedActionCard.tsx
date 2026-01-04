'use client';

import { Lock, type LucideIcon } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface BlockedActionCardProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  className?: string;
}

export function BlockedActionCard({
  title,
  description,
  icon: Icon = Lock,
  className,
}: BlockedActionCardProps) {
  return (
    <Card className={cn('opacity-60 cursor-not-allowed relative overflow-hidden', className)}>
      <div className="absolute inset-0 bg-gradient-to-br from-gray-100/50 to-gray-200/50 dark:from-gray-800/50 dark:to-gray-900/50" />
      <CardHeader className="relative">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2 text-muted-foreground">
            <Icon className="h-5 w-5" />
            {title}
          </CardTitle>
          <div className="flex items-center gap-1 text-xs bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded-full">
            <Lock className="h-3 w-3" />
            <span>Not Available</span>
          </div>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="relative">
        <p className="text-xs text-muted-foreground">
          This feature requires custodial services which RealRiches does not provide.
          Please work with licensed professionals for these services.
        </p>
      </CardContent>
    </Card>
  );
}
