/**
 * Capitalize the first letter of a string
 */
export function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Capitalize each word in a string
 */
export function titleCase(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => capitalize(word))
    .join(' ');
}

/**
 * Convert string to snake_case
 */
export function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '')
    .replace(/\s+/g, '_')
    .replace(/-/g, '_')
    .replace(/__+/g, '_');
}

/**
 * Convert string to camelCase
 */
export function toCamelCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^[A-Z]/, (c) => c.toLowerCase());
}

/**
 * Convert string to PascalCase
 */
export function toPascalCase(str: string): string {
  const camel = toCamelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

/**
 * Convert string to kebab-case
 */
export function toKebabCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '')
    .replace(/\s+/g, '-')
    .replace(/_/g, '-')
    .replace(/--+/g, '-');
}

/**
 * Truncate a string to a maximum length
 */
export function truncate(str: string, maxLength: number, suffix = '...'): string {
  if (!str || str.length <= maxLength) return str;
  return str.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * Generate initials from a name
 */
export function getInitials(name: string, maxLength = 2): string {
  if (!name) return '';
  return name
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase())
    .slice(0, maxLength)
    .join('');
}

/**
 * Slugify a string (URL-safe)
 */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Mask sensitive data (e.g., SSN, credit card)
 */
export function maskString(
  str: string,
  visibleStart = 0,
  visibleEnd = 4,
  maskChar = '*'
): string {
  if (!str) return '';
  const len = str.length;
  if (len <= visibleStart + visibleEnd) return str;

  const start = str.slice(0, visibleStart);
  const end = str.slice(-visibleEnd);
  const masked = maskChar.repeat(len - visibleStart - visibleEnd);

  return start + masked + end;
}

/**
 * Mask an email address
 */
export function maskEmail(email: string): string {
  if (!email) return '';
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;

  const maskedLocal =
    local.length <= 2 ? local : local.charAt(0) + '*'.repeat(local.length - 2) + local.slice(-1);

  return `${maskedLocal}@${domain}`;
}

/**
 * Mask a phone number
 */
export function maskPhone(phone: string): string {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length < 4) return phone;
  return '*'.repeat(cleaned.length - 4) + cleaned.slice(-4);
}

/**
 * Format a phone number for display
 */
export function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');

  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }

  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }

  return phone;
}

/**
 * Format a SSN for display
 */
export function formatSSN(ssn: string): string {
  const cleaned = ssn.replace(/\D/g, '');
  if (cleaned.length !== 9) return ssn;
  return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 5)}-${cleaned.slice(5)}`;
}

/**
 * Check if a string is a valid email
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Check if a string is a valid phone number
 */
export function isValidPhone(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length >= 10 && cleaned.length <= 15;
}

/**
 * Pluralize a word based on count
 */
export function pluralize(word: string, count: number, plural?: string): string {
  if (count === 1) return word;
  return plural || `${word}s`;
}

/**
 * Format a count with label (e.g., "5 items")
 */
export function formatCount(count: number, singular: string, plural?: string): string {
  return `${count} ${pluralize(singular, count, plural)}`;
}

/**
 * Generate a human-readable list (e.g., "a, b, and c")
 */
export function humanList(items: string[], conjunction = 'and'): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0] ?? '';
  if (items.length === 2) return items.join(` ${conjunction} `);

  const last = items[items.length - 1];
  const rest = items.slice(0, -1);
  return `${rest.join(', ')}, ${conjunction} ${last}`;
}

/**
 * Remove extra whitespace
 */
export function normalizeWhitespace(str: string): string {
  return str.replace(/\s+/g, ' ').trim();
}

/**
 * Check if string is empty or whitespace only
 */
export function isBlank(str: string | null | undefined): boolean {
  return !str || /^\s*$/.test(str);
}

/**
 * Extract numbers from a string
 */
export function extractNumbers(str: string): string {
  return str.replace(/\D/g, '');
}

/**
 * Format an address for display
 */
export function formatAddress(address: {
  street1: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
}): string {
  const lines = [
    address.street1,
    address.street2,
    `${address.city}, ${address.state} ${address.postalCode}`,
    address.country && address.country !== 'US' ? address.country : null,
  ].filter(Boolean);

  return lines.join('\n');
}

/**
 * Format an address as a single line
 */
export function formatAddressSingleLine(address: {
  street1: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
}): string {
  const streetParts = [address.street1, address.street2].filter(Boolean).join(', ');
  return `${streetParts}, ${address.city}, ${address.state} ${address.postalCode}`;
}
