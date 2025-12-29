import {
  format,
  formatDistance,
  formatRelative,
  parseISO,
  isValid,
  addDays,
  addMonths,
  addYears,
  differenceInDays,
  differenceInMonths,
  differenceInYears,
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  isBefore,
  isAfter,
  isWithinInterval,
  setDate,
} from 'date-fns';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';

export const DEFAULT_TIMEZONE = 'America/New_York';

/**
 * Format a date to ISO string
 */
export function toISOString(date: Date): string {
  return date.toISOString();
}

/**
 * Parse an ISO date string
 */
export function fromISOString(dateString: string): Date {
  return parseISO(dateString);
}

/**
 * Format a date for display
 */
export function formatDate(date: Date | string, formatStr = 'MMM d, yyyy'): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, formatStr);
}

/**
 * Format a date with time
 */
export function formatDateTime(date: Date | string, formatStr = 'MMM d, yyyy h:mm a'): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, formatStr);
}

/**
 * Format a date in a specific timezone
 */
export function formatInTimezone(
  date: Date | string,
  timezone: string = DEFAULT_TIMEZONE,
  formatStr = 'MMM d, yyyy h:mm a zzz'
): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return formatInTimeZone(d, timezone, formatStr);
}

/**
 * Convert a date to a specific timezone
 */
export function toTimezone(date: Date | string, timezone: string = DEFAULT_TIMEZONE): Date {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return toZonedTime(d, timezone);
}

/**
 * Get relative time (e.g., "2 days ago")
 */
export function getRelativeTime(date: Date | string, baseDate: Date = new Date()): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return formatDistance(d, baseDate, { addSuffix: true });
}

/**
 * Get relative date (e.g., "last Friday at 4:00 PM")
 */
export function getRelativeDate(date: Date | string, baseDate: Date = new Date()): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return formatRelative(d, baseDate);
}

/**
 * Check if a date is valid
 */
export function isValidDate(date: unknown): boolean {
  if (date instanceof Date) {
    return isValid(date);
  }
  if (typeof date === 'string') {
    return isValid(parseISO(date));
  }
  return false;
}

/**
 * Calculate lease end date from start date and term
 */
export function calculateLeaseEndDate(startDate: Date, termMonths: number): Date {
  return addMonths(startDate, termMonths);
}

/**
 * Calculate days until a date
 */
export function daysUntil(date: Date | string): number {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return differenceInDays(d, new Date());
}

/**
 * Check if a lease is expiring within N days
 */
export function isExpiringWithin(endDate: Date | string, days: number): boolean {
  const daysRemaining = daysUntil(endDate);
  return daysRemaining > 0 && daysRemaining <= days;
}

/**
 * Get the next rent due date
 */
export function getNextRentDueDate(dayOfMonth: number, fromDate: Date = new Date()): Date {
  let dueDate = setDate(startOfDay(fromDate), dayOfMonth);

  // If the due date has passed this month, move to next month
  if (isBefore(dueDate, fromDate)) {
    dueDate = setDate(addMonths(dueDate, 1), dayOfMonth);
  }

  return dueDate;
}

/**
 * Check if a date is in the grace period for late fees
 */
export function isInGracePeriod(
  dueDate: Date | string,
  gracePeriodDays: number,
  checkDate: Date = new Date()
): boolean {
  const due = typeof dueDate === 'string' ? parseISO(dueDate) : dueDate;
  const graceEndDate = addDays(due, gracePeriodDays);
  return isWithinInterval(checkDate, { start: due, end: graceEndDate });
}

/**
 * Get date range for a billing period
 */
export function getBillingPeriod(date: Date = new Date()): { start: Date; end: Date } {
  return {
    start: startOfMonth(date),
    end: endOfMonth(date),
  };
}

/**
 * Format a date range
 */
export function formatDateRange(start: Date | string, end: Date | string): string {
  const s = typeof start === 'string' ? parseISO(start) : start;
  const e = typeof end === 'string' ? parseISO(end) : end;

  const startYear = s.getFullYear();
  const endYear = e.getFullYear();

  if (startYear === endYear) {
    return `${format(s, 'MMM d')} - ${format(e, 'MMM d, yyyy')}`;
  }

  return `${format(s, 'MMM d, yyyy')} - ${format(e, 'MMM d, yyyy')}`;
}

// Re-export useful date-fns functions
export {
  addDays,
  addMonths,
  addYears,
  differenceInDays,
  differenceInMonths,
  differenceInYears,
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  isBefore,
  isAfter,
  isWithinInterval,
  parseISO,
};
