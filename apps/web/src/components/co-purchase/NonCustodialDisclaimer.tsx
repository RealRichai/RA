'use client';

import { AlertTriangle } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface NonCustodialDisclaimerProps {
  className?: string;
  compact?: boolean;
}

export function NonCustodialDisclaimer({
  className,
  compact = false,
}: NonCustodialDisclaimerProps) {
  if (compact) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-3 py-2 rounded-md',
          className
        )}
      >
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
        <span>Non-custodial platform - We do not hold funds or execute purchases</span>
      </div>
    );
  }

  return (
    <Card className={cn('border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800', className)}>
      <CardContent className="pt-6">
        <div className="flex gap-4">
          <div className="flex-shrink-0">
            <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-amber-900 dark:text-amber-100">
              Non-Custodial Collaboration Platform
            </h3>
            <p className="text-sm text-amber-800 dark:text-amber-200">
              RealRiches Co-Purchase Groups is a <strong>collaboration workspace only</strong>.
              We help groups organize, collect documents, and track progress together.
            </p>
            <div className="text-sm text-amber-700 dark:text-amber-300 space-y-1">
              <p className="font-medium">We DO NOT provide:</p>
              <ul className="list-disc list-inside pl-2 space-y-0.5">
                <li>Escrow or funds holding services</li>
                <li>Investment marketplace or solicitation</li>
                <li>Property purchase execution</li>
                <li>Payment processing between members</li>
                <li>Legal or financial advice</li>
              </ul>
            </div>
            <p className="text-xs text-amber-600 dark:text-amber-400 pt-2">
              For property purchases, work with licensed real estate attorneys and title companies.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
