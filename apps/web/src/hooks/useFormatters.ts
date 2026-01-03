'use client';

import { useLocale } from 'next-intl';
import { useCallback, useMemo } from 'react';

import type { Locale } from '@/i18n/config';
import {
  formatCurrency as formatCurrencyUtil,
  formatDate as formatDateUtil,
  formatNumber as formatNumberUtil,
  formatPercent as formatPercentUtil,
  formatRelativeTime as formatRelativeTimeUtil,
} from '@/lib/formatting';

/**
 * Hook providing locale-aware formatting functions
 *
 * @example
 * ```tsx
 * function PriceDisplay({ amount }: { amount: number }) {
 *   const { formatCurrency } = useFormatters();
 *   return <span>{formatCurrency(amount)}</span>;
 * }
 * ```
 */
export function useFormatters() {
  const locale = useLocale() as Locale;

  const formatCurrency = useCallback(
    (amount: number) => formatCurrencyUtil(amount, locale),
    [locale]
  );

  const formatDate = useCallback(
    (date: Date | string, options?: Intl.DateTimeFormatOptions) =>
      formatDateUtil(date, locale, options),
    [locale]
  );

  const formatNumber = useCallback(
    (num: number, options?: Intl.NumberFormatOptions) =>
      formatNumberUtil(num, locale, options),
    [locale]
  );

  const formatPercent = useCallback(
    (value: number, options?: Intl.NumberFormatOptions) =>
      formatPercentUtil(value, locale, options),
    [locale]
  );

  const formatRelativeTime = useCallback(
    (date: Date | string) => formatRelativeTimeUtil(date, locale),
    [locale]
  );

  return useMemo(
    () => ({
      formatCurrency,
      formatDate,
      formatNumber,
      formatPercent,
      formatRelativeTime,
      locale,
    }),
    [
      formatCurrency,
      formatDate,
      formatNumber,
      formatPercent,
      formatRelativeTime,
      locale,
    ]
  );
}
