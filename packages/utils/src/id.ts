import { randomUUID } from 'crypto';

import { nanoid } from 'nanoid';

/**
 * Generate a new UUID v4
 */
export function generateId(): string {
  return randomUUID();
}

/**
 * Generate a short, URL-safe ID
 * @param size - Length of the ID (default: 21)
 */
export function generateShortId(size = 21): string {
  return nanoid(size);
}

/**
 * Generate a prefixed ID (e.g., 'usr_abc123')
 * @param prefix - Prefix for the ID
 * @param size - Length of the random part (default: 12)
 */
export function generatePrefixedId(prefix: string, size = 12): string {
  return `${prefix}_${nanoid(size)}`;
}

/**
 * Generate a lease number
 * @param propertyCode - Short code for the property
 */
export function generateLeaseNumber(propertyCode: string): string {
  const year = new Date().getFullYear().toString().slice(-2);
  const random = nanoid(6).toUpperCase();
  return `${propertyCode}-${year}-${random}`;
}

/**
 * Generate a work order number
 */
export function generateWorkOrderNumber(): string {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const random = nanoid(6).toUpperCase();
  return `WO-${year}${month}-${random}`;
}

/**
 * Generate an invoice number
 */
export function generateInvoiceNumber(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const random = nanoid(8).toUpperCase();
  return `INV-${year}${month}-${random}`;
}

/**
 * Generate a confirmation code (6 characters, alphanumeric)
 */
export function generateConfirmationCode(): string {
  return nanoid(6).toUpperCase();
}

/**
 * Generate a verification code (6 digits)
 */
export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Validate if a string is a valid UUID
 */
export function isValidUUID(id: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}
