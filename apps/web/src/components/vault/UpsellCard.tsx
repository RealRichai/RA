'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, X, ExternalLink, Sparkles } from 'lucide-react';

import type { UpsellTrigger } from './types';
import { CATEGORY_LABELS, PARTNER_LABELS } from './types';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';

interface UpsellCardProps {
  propertyId: string;
  trigger: UpsellTrigger;
  onDismiss?: () => void;
  onConvert?: (partnerId: string) => void;
}

const TRIGGER_TITLES: Record<string, string> = {
  MISSING_INSURANCE: 'Protect Your Property',
  MISSING_GUARANTOR: 'Secure Your Rent',
  MISSING_DEED: 'Verify Ownership',
  MISSING_LEASE: 'Complete Your Lease Setup',
  EXPIRING_INSURANCE: 'Renew Your Coverage',
  EXPIRING_LEASE: 'Prepare for Renewal',
};

const TRIGGER_DESCRIPTIONS: Record<string, string> = {
  MISSING_INSURANCE:
    'Get comprehensive property insurance from our trusted partners.',
  MISSING_GUARANTOR:
    'Guarantee your rental income with rent guarantee services.',
  MISSING_DEED: 'Secure your deed documentation for ownership verification.',
  MISSING_LEASE: 'Complete your lease documentation for full compliance.',
  EXPIRING_INSURANCE: 'Your insurance policy is expiring soon. Time to renew.',
  EXPIRING_LEASE: 'Start preparing for upcoming lease renewals.',
};

export function UpsellCard({
  propertyId,
  trigger,
  onDismiss,
  onConvert,
}: UpsellCardProps) {
  const queryClient = useQueryClient();

  const dismissMutation = useMutation({
    mutationFn: async () => {
      await api.post(
        `/properties/${propertyId}/vault/upsells/${trigger.id}/dismiss`
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['vault-upsells', propertyId] });
      onDismiss?.();
    },
  });

  const convertMutation = useMutation({
    mutationFn: async (partnerId: string) => {
      await api.post(
        `/properties/${propertyId}/vault/upsells/${trigger.id}/convert`,
        { partnerId }
      );
    },
    onSuccess: (_data, partnerId) => {
      void queryClient.invalidateQueries({ queryKey: ['vault-upsells', propertyId] });
      onConvert?.(partnerId);
    },
  });

  const handlePartnerClick = (partnerId: string) => {
    convertMutation.mutate(partnerId);
  };

  return (
    <Card className="border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-white dark:from-blue-950 dark:to-background">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
              <Sparkles className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-lg">
                {TRIGGER_TITLES[trigger.triggerType] || 'Partner Recommendation'}
              </CardTitle>
              <CardDescription>
                {TRIGGER_DESCRIPTIONS[trigger.triggerType] || ''}
              </CardDescription>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => dismissMutation.mutate()}
            disabled={dismissMutation.isPending}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {trigger.missingCategories.length > 0 && (
          <div className="mb-4">
            <p className="text-sm text-muted-foreground mb-2">
              Missing documents:
            </p>
            <div className="flex flex-wrap gap-2">
              {trigger.missingCategories.map((cat) => (
                <span
                  key={cat}
                  className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400 px-2 py-1 rounded-full"
                >
                  {CATEGORY_LABELS[cat]}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium">Recommended Partners:</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {trigger.eligiblePartners.map((partner) => (
              <Button
                key={partner}
                variant="outline"
                className="justify-between"
                onClick={() => handlePartnerClick(partner)}
                disabled={convertMutation.isPending}
              >
                <span className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-green-500" />
                  {PARTNER_LABELS[partner] || partner}
                </span>
                <ExternalLink className="h-3 w-3" />
              </Button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
