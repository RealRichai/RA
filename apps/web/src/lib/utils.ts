/**
 * Utility Functions
 */

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: string | Date, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options,
  }).format(new Date(date));
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(date));
}

export function formatRelativeTime(date: string | Date): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(date);
}

export function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  return phone;
}

export function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural || `${singular}s`);
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return `${str.slice(0, length)}...`;
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

export function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export function formatAddress(
  address: string,
  unit?: string,
  city?: string,
  state?: string,
  zipCode?: string
): string {
  const parts = [address];
  if (unit) parts[0] += ` #${unit}`;
  if (city) parts.push(city);
  if (state) parts.push(state);
  if (zipCode) parts.push(zipCode);
  return parts.join(', ');
}

export function getPropertyTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    STUDIO: 'Studio',
    ONE_BEDROOM: '1 Bedroom',
    TWO_BEDROOM: '2 Bedrooms',
    THREE_BEDROOM: '3 Bedrooms',
    FOUR_PLUS_BEDROOM: '4+ Bedrooms',
    TOWNHOUSE: 'Townhouse',
    PENTHOUSE: 'Penthouse',
    LOFT: 'Loft',
    DUPLEX: 'Duplex',
    HOUSE: 'House',
    MULTI_FAMILY: 'Multi-Family',
  };
  return labels[type] || type;
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    // Listings
    DRAFT: 'bg-gray-100 text-gray-800',
    PENDING_REVIEW: 'bg-yellow-100 text-yellow-800',
    ACTIVE: 'bg-green-100 text-green-800',
    RENTED: 'bg-blue-100 text-blue-800',
    SOLD: 'bg-purple-100 text-purple-800',
    ARCHIVED: 'bg-gray-100 text-gray-600',
    EXPIRED: 'bg-red-100 text-red-800',
    // Applications
    SUBMITTED: 'bg-blue-100 text-blue-800',
    UNDER_REVIEW: 'bg-yellow-100 text-yellow-800',
    SCREENING: 'bg-orange-100 text-orange-800',
    CONDITIONAL_OFFER: 'bg-purple-100 text-purple-800',
    APPROVED: 'bg-green-100 text-green-800',
    DENIED: 'bg-red-100 text-red-800',
    WITHDRAWN: 'bg-gray-100 text-gray-600',
    LEASE_SENT: 'bg-indigo-100 text-indigo-800',
    LEASE_SIGNED: 'bg-green-100 text-green-800',
    // Payments
    PENDING: 'bg-yellow-100 text-yellow-800',
    PAID: 'bg-green-100 text-green-800',
    FAILED: 'bg-red-100 text-red-800',
    REFUNDED: 'bg-gray-100 text-gray-600',
    CANCELLED: 'bg-gray-100 text-gray-600',
    // Leads
    NEW: 'bg-blue-100 text-blue-800',
    CONTACTED: 'bg-yellow-100 text-yellow-800',
    QUALIFIED: 'bg-green-100 text-green-800',
    SHOWING_SCHEDULED: 'bg-purple-100 text-purple-800',
    APPLICATION_STARTED: 'bg-indigo-100 text-indigo-800',
    CONVERTED: 'bg-green-100 text-green-800',
    LOST: 'bg-red-100 text-red-800',
    // Tours
    SCHEDULED: 'bg-blue-100 text-blue-800',
    CONFIRMED: 'bg-green-100 text-green-800',
    IN_PROGRESS: 'bg-purple-100 text-purple-800',
    COMPLETED: 'bg-gray-100 text-gray-800',
    NO_SHOW: 'bg-red-100 text-red-800',
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
}

export function debounce<T extends (...args: Parameters<T>) => ReturnType<T>>(
  fn: T,
  ms: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return function (...args: Parameters<T>) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  };
}
