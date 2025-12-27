import { type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-surface-100 text-surface-800',
        gold: 'bg-luxury-champagne text-luxury-bronze',
        success: 'bg-emerald-100 text-emerald-800',
        warning: 'bg-amber-100 text-amber-800',
        error: 'bg-red-100 text-red-800',
        info: 'bg-blue-100 text-blue-800',
        outline: 'border border-surface-200 text-surface-700',
        'outline-gold': 'border-2 border-luxury-gold text-luxury-bronze',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

// Application status badge mapping
const applicationStatusVariants: Record<string, VariantProps<typeof badgeVariants>['variant']> = {
  DRAFT: 'default',
  SUBMITTED: 'info',
  UNDER_REVIEW: 'warning',
  SCREENING: 'warning',
  CONDITIONAL_OFFER: 'gold',
  APPROVED: 'success',
  DENIED: 'error',
  WITHDRAWN: 'default',
};

function ApplicationStatusBadge({ status }: { status: string }) {
  const variant = applicationStatusVariants[status] || 'default';
  const label = status.replace(/_/g, ' ');
  return <Badge variant={variant}>{label}</Badge>;
}

// Listing status badge mapping
const listingStatusVariants: Record<string, VariantProps<typeof badgeVariants>['variant']> = {
  DRAFT: 'default',
  ACTIVE: 'success',
  PENDING: 'warning',
  LEASED: 'info',
  INACTIVE: 'default',
};

function ListingStatusBadge({ status }: { status: string }) {
  const variant = listingStatusVariants[status] || 'default';
  return <Badge variant={variant}>{status}</Badge>;
}

// FARE Act compliance badge
function FareActBadge({ compliant }: { compliant: boolean }) {
  if (!compliant) return null;
  return (
    <Badge variant="success" className="gap-1">
      <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
          clipRule="evenodd"
        />
      </svg>
      FARE Act Compliant
    </Badge>
  );
}

export { Badge, badgeVariants, ApplicationStatusBadge, ListingStatusBadge, FareActBadge };
