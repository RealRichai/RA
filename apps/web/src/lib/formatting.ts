/**
 * Locale-Aware Formatting Utilities
 *
 * Provides locale-specific formatting for currency, dates, and numbers.
 */

import type { Locale } from '@/i18n/config';

/**
 * Currency codes per locale
 */
const localeCurrencies: Record<Locale, string> = {
  en: 'USD',
  es: 'USD',
  fr: 'EUR',
};

/**
 * Format a number as currency with locale-specific formatting
 */
export function formatCurrency(amount: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: localeCurrencies[locale],
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format a date with locale-specific formatting
 */
export function formatDate(
  date: Date | string,
  locale: Locale,
  options?: Intl.DateTimeFormatOptions
): string {
  const defaultOptions: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  };
  return new Intl.DateTimeFormat(locale, options || defaultOptions).format(
    new Date(date)
  );
}

/**
 * Format a number with locale-specific separators
 */
export function formatNumber(
  num: number,
  locale: Locale,
  options?: Intl.NumberFormatOptions
): string {
  return new Intl.NumberFormat(locale, options).format(num);
}

/**
 * Format a relative date (e.g., "2 hours ago") with locale awareness
 */
export function formatRelativeTime(
  date: Date | string,
  locale: Locale
): string {
  const now = new Date();
  const target = new Date(date);
  const diffMs = now.getTime() - target.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (diffSeconds < 60) {
    return rtf.format(-diffSeconds, 'second');
  }
  if (diffMinutes < 60) {
    return rtf.format(-diffMinutes, 'minute');
  }
  if (diffHours < 24) {
    return rtf.format(-diffHours, 'hour');
  }
  if (diffDays < 30) {
    return rtf.format(-diffDays, 'day');
  }
  if (diffDays < 365) {
    return rtf.format(-Math.floor(diffDays / 30), 'month');
  }
  return rtf.format(-Math.floor(diffDays / 365), 'year');
}

/**
 * Format a percentage with locale-specific formatting
 */
export function formatPercent(
  value: number,
  locale: Locale,
  options?: Intl.NumberFormatOptions
): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
    ...options,
  }).format(value / 100);
}
