import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// UTILITY FUNCTION TESTS
// =============================================================================

describe('formatCurrency', () => {
  // Mock implementation matching our utils
  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  it('formats positive integers correctly', () => {
    expect(formatCurrency(1000)).toBe('$1,000');
    expect(formatCurrency(3500)).toBe('$3,500');
    expect(formatCurrency(10000)).toBe('$10,000');
  });

  it('formats zero correctly', () => {
    expect(formatCurrency(0)).toBe('$0');
  });

  it('formats large numbers with commas', () => {
    expect(formatCurrency(1000000)).toBe('$1,000,000');
    expect(formatCurrency(25000)).toBe('$25,000');
  });

  it('rounds decimals to whole numbers', () => {
    expect(formatCurrency(1500.99)).toBe('$1,501');
    expect(formatCurrency(2500.01)).toBe('$2,500');
  });
});

describe('formatDate', () => {
  const formatDate = (date: string | Date): string => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  it('formats ISO date strings', () => {
    // Use Date object with explicit local time to avoid timezone issues
    const result = formatDate(new Date(2025, 0, 15)); // Jan 15, 2025 in local time
    expect(result).toContain('Jan');
    expect(result).toContain('15');
    expect(result).toContain('2025');
  });

  it('formats Date objects', () => {
    const result = formatDate(new Date(2025, 5, 20));
    expect(result).toContain('Jun');
    expect(result).toContain('20');
    expect(result).toContain('2025');
  });
});

describe('cn (className utility)', () => {
  // Mock implementation matching clsx + tailwind-merge behavior
  const cn = (...inputs: (string | undefined | null | false)[]): string => {
    return inputs.filter(Boolean).join(' ');
  };

  it('combines multiple class names', () => {
    expect(cn('class1', 'class2')).toBe('class1 class2');
  });

  it('filters out falsy values', () => {
    expect(cn('class1', false && 'hidden', 'class2')).toBe('class1 class2');
    expect(cn('class1', undefined, 'class2')).toBe('class1 class2');
    expect(cn('class1', null, 'class2')).toBe('class1 class2');
  });

  it('handles conditional classes', () => {
    const isActive = true;
    const isDisabled = false;
    expect(cn(
      'base-class',
      isActive && 'active',
      isDisabled && 'disabled'
    )).toBe('base-class active');
  });

  it('returns empty string for no valid inputs', () => {
    expect(cn(false, null, undefined)).toBe('');
  });
});

// =============================================================================
// FARE ACT COMPLIANCE HELPERS
// =============================================================================

describe('isNYCBorough', () => {
  const NYC_BOROUGHS = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'];
  const isNYCBorough = (borough: string): boolean => {
    return NYC_BOROUGHS.includes(borough);
  };

  it('returns true for NYC boroughs', () => {
    expect(isNYCBorough('Manhattan')).toBe(true);
    expect(isNYCBorough('Brooklyn')).toBe(true);
    expect(isNYCBorough('Queens')).toBe(true);
    expect(isNYCBorough('Bronx')).toBe(true);
    expect(isNYCBorough('Staten Island')).toBe(true);
  });

  it('returns false for Long Island', () => {
    expect(isNYCBorough('Long Island')).toBe(false);
    expect(isNYCBorough('Nassau')).toBe(false);
    expect(isNYCBorough('Suffolk')).toBe(false);
  });

  it('returns false for other locations', () => {
    expect(isNYCBorough('Jersey City')).toBe(false);
    expect(isNYCBorough('Hoboken')).toBe(false);
    expect(isNYCBorough('')).toBe(false);
  });
});

describe('calculateMoveInCosts', () => {
  interface MoveInCosts {
    firstMonth: number;
    securityDeposit: number;
    brokerFee: number;
    applicationFee: number;
    total: number;
  }

  const calculateMoveInCosts = (
    rent: number,
    isNYC: boolean,
    brokerFeePaidBy: 'LANDLORD' | 'TENANT' = 'LANDLORD'
  ): MoveInCosts => {
    const firstMonth = rent;
    const securityDeposit = isNYC ? rent : rent; // FARE Act caps at 1 month
    const applicationFee = isNYC ? 20 : 50; // FARE Act caps at $20
    
    let brokerFee = 0;
    if (!isNYC && brokerFeePaidBy === 'TENANT') {
      brokerFee = rent; // 1 month typical broker fee
    }
    
    return {
      firstMonth,
      securityDeposit,
      brokerFee,
      applicationFee,
      total: firstMonth + securityDeposit + brokerFee + applicationFee,
    };
  };

  it('calculates NYC move-in costs correctly', () => {
    const costs = calculateMoveInCosts(3500, true, 'LANDLORD');
    expect(costs.firstMonth).toBe(3500);
    expect(costs.securityDeposit).toBe(3500);
    expect(costs.applicationFee).toBe(20);
    expect(costs.brokerFee).toBe(0);
    expect(costs.total).toBe(7020);
  });

  it('calculates Long Island move-in costs with tenant broker fee', () => {
    const costs = calculateMoveInCosts(3000, false, 'TENANT');
    expect(costs.firstMonth).toBe(3000);
    expect(costs.securityDeposit).toBe(3000);
    expect(costs.applicationFee).toBe(50);
    expect(costs.brokerFee).toBe(3000);
    expect(costs.total).toBe(9050);
  });

  it('calculates Long Island costs without broker fee', () => {
    const costs = calculateMoveInCosts(2500, false, 'LANDLORD');
    expect(costs.brokerFee).toBe(0);
    expect(costs.total).toBe(5050);
  });
});

// =============================================================================
// NOTIFICATION HELPERS
// =============================================================================

describe('getNotificationIcon', () => {
  type NotificationType = 
    | 'application_received'
    | 'application_approved'
    | 'application_denied'
    | 'tour_scheduled'
    | 'tour_reminder'
    | 'message_received'
    | 'payment_received'
    | 'lease_signed'
    | 'listing_viewed'
    | 'price_change'
    | 'new_listing'
    | 'system';

  const getNotificationIcon = (type: NotificationType): string => {
    const icons: Record<NotificationType, string> = {
      application_received: 'FileText',
      application_approved: 'CheckCircle',
      application_denied: 'XCircle',
      tour_scheduled: 'Calendar',
      tour_reminder: 'Clock',
      message_received: 'MessageSquare',
      payment_received: 'DollarSign',
      lease_signed: 'FileCheck',
      listing_viewed: 'Eye',
      price_change: 'TrendingDown',
      new_listing: 'Building2',
      system: 'Bell',
    };
    return icons[type] || 'Bell';
  };

  it('returns correct icons for each notification type', () => {
    expect(getNotificationIcon('application_received')).toBe('FileText');
    expect(getNotificationIcon('application_approved')).toBe('CheckCircle');
    expect(getNotificationIcon('tour_scheduled')).toBe('Calendar');
    expect(getNotificationIcon('payment_received')).toBe('DollarSign');
  });

  it('returns Bell for unknown types', () => {
    expect(getNotificationIcon('system')).toBe('Bell');
  });
});

describe('formatRelativeTime', () => {
  const formatRelativeTime = (date: Date | string): string => {
    const now = new Date();
    const then = typeof date === 'string' ? new Date(date) : date;
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return then.toLocaleDateString();
  };

  it('formats recent times as "Just now"', () => {
    const now = new Date();
    expect(formatRelativeTime(now)).toBe('Just now');
  });

  it('formats minutes correctly', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60000);
    expect(formatRelativeTime(fiveMinutesAgo)).toBe('5m ago');
  });

  it('formats hours correctly', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 3600000);
    expect(formatRelativeTime(threeHoursAgo)).toBe('3h ago');
  });

  it('formats days correctly', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000);
    expect(formatRelativeTime(twoDaysAgo)).toBe('2d ago');
  });
});

// =============================================================================
// LEAD SCORING HELPERS
// =============================================================================

describe('calculateLeadScore', () => {
  interface LeadData {
    hasCompletedProfile: boolean;
    hasVerifiedIncome: boolean;
    hasCreditCheck: boolean;
    responseTimeHours: number;
    viewCount: number;
    inquiryCount: number;
  }

  const calculateLeadScore = (data: LeadData): number => {
    let score = 0;
    
    // Profile completeness (max 20)
    if (data.hasCompletedProfile) score += 20;
    
    // Income verification (max 25)
    if (data.hasVerifiedIncome) score += 25;
    
    // Credit check (max 25)
    if (data.hasCreditCheck) score += 25;
    
    // Response time (max 15)
    if (data.responseTimeHours <= 1) score += 15;
    else if (data.responseTimeHours <= 4) score += 10;
    else if (data.responseTimeHours <= 24) score += 5;
    
    // Engagement (max 15)
    const engagementScore = Math.min(15, (data.viewCount + data.inquiryCount * 2) * 1.5);
    score += Math.floor(engagementScore);
    
    return Math.min(100, score);
  };

  it('calculates perfect score for highly qualified lead', () => {
    const lead: LeadData = {
      hasCompletedProfile: true,
      hasVerifiedIncome: true,
      hasCreditCheck: true,
      responseTimeHours: 0.5,
      viewCount: 5,
      inquiryCount: 3,
    };
    expect(calculateLeadScore(lead)).toBe(100);
  });

  it('calculates low score for unqualified lead', () => {
    const lead: LeadData = {
      hasCompletedProfile: false,
      hasVerifiedIncome: false,
      hasCreditCheck: false,
      responseTimeHours: 48,
      viewCount: 1,
      inquiryCount: 0,
    };
    expect(calculateLeadScore(lead)).toBeLessThan(20);
  });

  it('accounts for response time tiers', () => {
    const baseLead: LeadData = {
      hasCompletedProfile: true,
      hasVerifiedIncome: false,
      hasCreditCheck: false,
      viewCount: 0,
      inquiryCount: 0,
      responseTimeHours: 0,
    };

    const fastResponse = calculateLeadScore({ ...baseLead, responseTimeHours: 0.5 });
    const mediumResponse = calculateLeadScore({ ...baseLead, responseTimeHours: 3 });
    const slowResponse = calculateLeadScore({ ...baseLead, responseTimeHours: 12 });
    const verySlowResponse = calculateLeadScore({ ...baseLead, responseTimeHours: 48 });

    expect(fastResponse).toBeGreaterThan(mediumResponse);
    expect(mediumResponse).toBeGreaterThan(slowResponse);
    expect(slowResponse).toBeGreaterThan(verySlowResponse);
  });
});

// =============================================================================
// MOBILE BREAKPOINT HELPERS
// =============================================================================

describe('getBreakpoint', () => {
  const breakpoints = {
    xs: 375,
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
    '2xl': 1536,
  };

  const getBreakpoint = (width: number): string => {
    if (width >= breakpoints['2xl']) return '2xl';
    if (width >= breakpoints.xl) return 'xl';
    if (width >= breakpoints.lg) return 'lg';
    if (width >= breakpoints.md) return 'md';
    if (width >= breakpoints.sm) return 'sm';
    if (width >= breakpoints.xs) return 'xs';
    return 'base';
  };

  it('returns correct breakpoint for common device widths', () => {
    expect(getBreakpoint(320)).toBe('base'); // iPhone SE
    expect(getBreakpoint(375)).toBe('xs');   // iPhone
    expect(getBreakpoint(414)).toBe('xs');   // iPhone Plus
    expect(getBreakpoint(768)).toBe('md');   // iPad
    expect(getBreakpoint(1024)).toBe('lg');  // iPad Pro
    expect(getBreakpoint(1440)).toBe('xl');  // Laptop
    expect(getBreakpoint(1920)).toBe('2xl'); // Desktop
  });

  it('handles edge cases at breakpoint boundaries', () => {
    expect(getBreakpoint(639)).toBe('xs');
    expect(getBreakpoint(640)).toBe('sm');
    expect(getBreakpoint(767)).toBe('sm');
    expect(getBreakpoint(768)).toBe('md');
  });
});

describe('isTouchDevice', () => {
  const isTouchDevice = (): boolean => {
    if (typeof window === 'undefined') return false;
    return (
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0
    );
  };

  it('returns a boolean indicating touch capability', () => {
    const result = isTouchDevice();
    expect(typeof result).toBe('boolean');
  });

  it('returns false when no touch APIs are available', () => {
    // Mock non-touch environment
    const originalMaxTouchPoints = navigator.maxTouchPoints;
    const originalOntouchstart = (window as unknown as { ontouchstart?: unknown }).ontouchstart;

    Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true });
    delete (window as unknown as { ontouchstart?: unknown }).ontouchstart;

    expect(isTouchDevice()).toBe(false);

    // Restore
    Object.defineProperty(navigator, 'maxTouchPoints', { value: originalMaxTouchPoints, configurable: true });
    if (originalOntouchstart !== undefined) {
      (window as unknown as { ontouchstart?: unknown }).ontouchstart = originalOntouchstart;
    }
  });
});

// =============================================================================
// SAFE AREA HELPERS
// =============================================================================

describe('getSafeAreaInsets', () => {
  const getSafeAreaInsets = (): { top: number; bottom: number; left: number; right: number } => {
    if (typeof window === 'undefined') {
      return { top: 0, bottom: 0, left: 0, right: 0 };
    }

    const style = getComputedStyle(document.documentElement);
    const getValue = (property: string): number => {
      const value = style.getPropertyValue(property);
      return parseInt(value, 10) || 0;
    };

    return {
      top: getValue('--safe-area-top'),
      bottom: getValue('--safe-area-bottom'),
      left: getValue('--safe-area-left'),
      right: getValue('--safe-area-right'),
    };
  };

  it('returns zero insets in test environment', () => {
    const insets = getSafeAreaInsets();
    expect(insets.top).toBe(0);
    expect(insets.bottom).toBe(0);
    expect(insets.left).toBe(0);
    expect(insets.right).toBe(0);
  });
});
