/**
 * Form Validation Utilities
 * 
 * A comprehensive validation library for form fields used across the platform.
 * Includes validators for common field types with consistent error messaging.
 * 
 * @module lib/validation
 */

// =============================================================================
// TYPES
// =============================================================================

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface ValidationOptions {
  required?: boolean;
  fieldName?: string;
}

// =============================================================================
// EMAIL VALIDATION
// =============================================================================

export function validateEmail(email: string): ValidationResult {
  if (!email || email.trim() === '') {
    return { valid: false, error: 'Email is required' };
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return { valid: false, error: 'Please enter a valid email address' };
  }
  
  return { valid: true };
}

// =============================================================================
// PHONE VALIDATION
// =============================================================================

export interface PhoneValidationOptions extends ValidationOptions {
  format?: 'us' | 'international';
}

export function validatePhone(phone: string, options?: PhoneValidationOptions): ValidationResult {
  const { required = false, fieldName = 'Phone number' } = options || {};
  
  if (!phone || phone.trim() === '') {
    if (required) {
      return { valid: false, error: `${fieldName} is required` };
    }
    return { valid: true };
  }
  
  // Remove formatting characters
  const digits = phone.replace(/\D/g, '');
  
  if (digits.length !== 10 && digits.length !== 11) {
    return { valid: false, error: 'Please enter a valid 10-digit phone number' };
  }
  
  return { valid: true };
}

/**
 * Formats a phone number for display
 */
export function formatPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

// =============================================================================
// ZIP CODE VALIDATION
// =============================================================================

export function validateZipCode(zipCode: string, options?: ValidationOptions): ValidationResult {
  const { required = true, fieldName = 'ZIP code' } = options || {};
  
  if (!zipCode || zipCode.trim() === '') {
    if (required) {
      return { valid: false, error: `${fieldName} is required` };
    }
    return { valid: true };
  }
  
  const zipRegex = /^\d{5}(-\d{4})?$/;
  if (!zipRegex.test(zipCode.trim())) {
    return { valid: false, error: 'Please enter a valid ZIP code (e.g., 10001 or 10001-1234)' };
  }
  
  return { valid: true };
}

// =============================================================================
// PRICE/CURRENCY VALIDATION
// =============================================================================

export interface PriceValidationOptions extends ValidationOptions {
  min?: number;
  max?: number;
  allowZero?: boolean;
}

export function validatePrice(
  price: string | number | undefined | null, 
  options?: PriceValidationOptions
): ValidationResult {
  const { required = true, min = 0, max = Infinity, allowZero = true, fieldName = 'Price' } = options || {};
  
  if (price === undefined || price === null || price === '') {
    if (required) {
      return { valid: false, error: `${fieldName} is required` };
    }
    return { valid: true };
  }
  
  const numPrice = typeof price === 'string' ? parseFloat(price) : price;
  
  if (isNaN(numPrice)) {
    return { valid: false, error: 'Please enter a valid number' };
  }
  
  if (!allowZero && numPrice === 0) {
    return { valid: false, error: `${fieldName} must be greater than zero` };
  }
  
  if (numPrice < min) {
    return { valid: false, error: `${fieldName} must be at least $${min.toLocaleString()}` };
  }
  
  if (numPrice > max) {
    return { valid: false, error: `${fieldName} cannot exceed $${max.toLocaleString()}` };
  }
  
  return { valid: true };
}

// =============================================================================
// PASSWORD VALIDATION
// =============================================================================

export interface PasswordValidationOptions {
  minLength?: number;
  requireUppercase?: boolean;
  requireLowercase?: boolean;
  requireNumber?: boolean;
  requireSpecial?: boolean;
}

export function validatePassword(
  password: string, 
  options?: PasswordValidationOptions
): ValidationResult {
  const {
    minLength = 8,
    requireUppercase = true,
    requireLowercase = true,
    requireNumber = true,
    requireSpecial = false,
  } = options || {};
  
  if (!password) {
    return { valid: false, error: 'Password is required' };
  }
  
  if (password.length < minLength) {
    return { valid: false, error: `Password must be at least ${minLength} characters` };
  }
  
  if (requireUppercase && !/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one uppercase letter' };
  }
  
  if (requireLowercase && !/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one lowercase letter' };
  }
  
  if (requireNumber && !/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one number' };
  }
  
  if (requireSpecial && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one special character' };
  }
  
  return { valid: true };
}

/**
 * Calculates password strength (0-100)
 */
export function calculatePasswordStrength(password: string): number {
  if (!password) return 0;
  
  let score = 0;
  
  // Length bonus
  score += Math.min(password.length * 4, 40);
  
  // Character variety
  if (/[a-z]/.test(password)) score += 10;
  if (/[A-Z]/.test(password)) score += 10;
  if (/[0-9]/.test(password)) score += 10;
  if (/[^a-zA-Z0-9]/.test(password)) score += 15;
  
  // Variety bonus
  const uniqueChars = new Set(password.split('')).size;
  score += Math.min(uniqueChars * 2, 15);
  
  return Math.min(score, 100);
}

// =============================================================================
// DATE VALIDATION
// =============================================================================

export interface DateValidationOptions extends ValidationOptions {
  minDate?: Date | string;
  maxDate?: Date | string;
  allowPast?: boolean;
  allowFuture?: boolean;
}

export function validateDate(
  dateString: string | undefined | null,
  options?: DateValidationOptions
): ValidationResult {
  const { 
    required = true, 
    fieldName = 'Date',
    minDate,
    maxDate,
    allowPast = true,
    allowFuture = true,
  } = options || {};
  
  if (!dateString || dateString.trim() === '') {
    if (required) {
      return { valid: false, error: `${fieldName} is required` };
    }
    return { valid: true };
  }
  
  const date = new Date(dateString);
  
  if (isNaN(date.getTime())) {
    return { valid: false, error: 'Please enter a valid date' };
  }
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (!allowPast && date < today) {
    return { valid: false, error: `${fieldName} cannot be in the past` };
  }
  
  if (!allowFuture && date > today) {
    return { valid: false, error: `${fieldName} cannot be in the future` };
  }
  
  if (minDate) {
    const min = typeof minDate === 'string' ? new Date(minDate) : minDate;
    if (date < min) {
      return { valid: false, error: `${fieldName} must be on or after ${min.toLocaleDateString()}` };
    }
  }
  
  if (maxDate) {
    const max = typeof maxDate === 'string' ? new Date(maxDate) : maxDate;
    if (date > max) {
      return { valid: false, error: `${fieldName} must be on or before ${max.toLocaleDateString()}` };
    }
  }
  
  return { valid: true };
}

// =============================================================================
// TEXT FIELD VALIDATION
// =============================================================================

export interface TextValidationOptions extends ValidationOptions {
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  patternMessage?: string;
}

export function validateTextField(
  value: string | undefined | null,
  options?: TextValidationOptions
): ValidationResult {
  const { 
    required = true, 
    minLength = 0, 
    maxLength = Infinity, 
    fieldName = 'Field',
    pattern,
    patternMessage,
  } = options || {};
  
  if (!value || value.trim() === '') {
    if (required) {
      return { valid: false, error: `${fieldName} is required` };
    }
    return { valid: true };
  }
  
  const trimmed = value.trim();
  
  if (trimmed.length < minLength) {
    return { valid: false, error: `${fieldName} must be at least ${minLength} characters` };
  }
  
  if (trimmed.length > maxLength) {
    return { valid: false, error: `${fieldName} cannot exceed ${maxLength} characters` };
  }
  
  if (pattern && !pattern.test(trimmed)) {
    return { valid: false, error: patternMessage || `${fieldName} format is invalid` };
  }
  
  return { valid: true };
}

// =============================================================================
// SELECT/DROPDOWN VALIDATION
// =============================================================================

export function validateSelect(
  value: string | undefined | null,
  options?: ValidationOptions & { allowedValues?: string[] }
): ValidationResult {
  const { required = true, fieldName = 'Selection', allowedValues } = options || {};
  
  if (!value || value === '') {
    if (required) {
      return { valid: false, error: `Please select a ${fieldName.toLowerCase()}` };
    }
    return { valid: true };
  }
  
  if (allowedValues && !allowedValues.includes(value)) {
    return { valid: false, error: `Invalid ${fieldName.toLowerCase()} selected` };
  }
  
  return { valid: true };
}

// =============================================================================
// URL VALIDATION
// =============================================================================

export function validateUrl(url: string, options?: ValidationOptions): ValidationResult {
  const { required = false, fieldName = 'URL' } = options || {};
  
  if (!url || url.trim() === '') {
    if (required) {
      return { valid: false, error: `${fieldName} is required` };
    }
    return { valid: true };
  }
  
  try {
    new URL(url);
    return { valid: true };
  } catch {
    return { valid: false, error: 'Please enter a valid URL' };
  }
}

// =============================================================================
// NYC ADDRESS VALIDATION
// =============================================================================

export interface AddressValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

export function validateNYCAddress(address: {
  street?: string;
  unit?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  borough?: string;
}): AddressValidationResult {
  const errors: Record<string, string> = {};
  
  if (!address.street || address.street.trim() === '') {
    errors.street = 'Street address is required';
  }
  
  if (!address.city || address.city.trim() === '') {
    errors.city = 'City is required';
  }
  
  if (!address.state || address.state.trim() === '') {
    errors.state = 'State is required';
  }
  
  const zipResult = validateZipCode(address.zipCode || '');
  if (!zipResult.valid) {
    errors.zipCode = zipResult.error || 'Invalid ZIP code';
  }
  
  // NYC-specific validation
  const nycZipPrefixes = ['100', '101', '102', '103', '104', '110', '111', '112', '113', '114'];
  if (address.zipCode && nycZipPrefixes.some(p => address.zipCode!.startsWith(p))) {
    if (!address.borough) {
      errors.borough = 'Borough is required for NYC addresses';
    }
  }
  
  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

// =============================================================================
// LISTING VALIDATION
// =============================================================================

export interface ListingValidationResult {
  valid: boolean;
  errors: Record<string, string>;
  warnings: string[];
}

export function validateListing(listing: {
  title?: string;
  description?: string;
  propertyType?: string;
  bedrooms?: string | number;
  bathrooms?: string | number;
  price?: string | number;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    borough?: string;
  };
  availableDate?: string;
  photos?: string[];
}): ListingValidationResult {
  const errors: Record<string, string> = {};
  const warnings: string[] = [];
  
  // Title
  const titleResult = validateTextField(listing.title, { 
    fieldName: 'Title', 
    minLength: 10, 
    maxLength: 100 
  });
  if (!titleResult.valid) errors.title = titleResult.error!;
  
  // Description
  const descResult = validateTextField(listing.description, { 
    fieldName: 'Description', 
    minLength: 50, 
    maxLength: 5000 
  });
  if (!descResult.valid) errors.description = descResult.error!;
  
  // Property Type
  const typeResult = validateSelect(listing.propertyType, { 
    fieldName: 'Property type',
    allowedValues: ['APARTMENT', 'STUDIO', 'CONDO', 'TOWNHOUSE', 'HOUSE', 'LOFT']
  });
  if (!typeResult.valid) errors.propertyType = typeResult.error!;
  
  // Bedrooms
  if (listing.bedrooms === undefined || listing.bedrooms === '') {
    errors.bedrooms = 'Number of bedrooms is required';
  }
  
  // Bathrooms
  if (listing.bathrooms === undefined || listing.bathrooms === '') {
    errors.bathrooms = 'Number of bathrooms is required';
  }
  
  // Price
  const priceResult = validatePrice(listing.price, { 
    fieldName: 'Monthly rent',
    min: 100,
    max: 1000000,
    allowZero: false
  });
  if (!priceResult.valid) errors.price = priceResult.error!;
  
  // Address
  if (listing.address) {
    const addressResult = validateNYCAddress(listing.address);
    if (!addressResult.valid) {
      Object.assign(errors, addressResult.errors);
    }
  } else {
    errors.address = 'Address is required';
  }
  
  // Available Date
  const dateResult = validateDate(listing.availableDate, {
    fieldName: 'Available date',
    allowPast: false
  });
  if (!dateResult.valid) errors.availableDate = dateResult.error!;
  
  // Photos (warning, not error)
  if (!listing.photos || listing.photos.length === 0) {
    warnings.push('Listings with photos receive 10x more inquiries');
  } else if (listing.photos.length < 5) {
    warnings.push('Adding more photos can significantly increase interest');
  }
  
  return {
    valid: Object.keys(errors).length === 0,
    errors,
    warnings,
  };
}

// =============================================================================
// FORM STATE VALIDATOR
// =============================================================================

type ValidatorFn = (value: any) => ValidationResult;

export interface FieldConfig {
  validator: ValidatorFn;
  transform?: (value: any) => any;
}

export function createFormValidator<T extends Record<string, any>>(
  config: Partial<Record<keyof T, FieldConfig>>
) {
  return (formData: T): { valid: boolean; errors: Partial<Record<keyof T, string>> } => {
    const errors: Partial<Record<keyof T, string>> = {};
    
    for (const [field, fieldConfig] of Object.entries(config)) {
      if (!fieldConfig) continue;
      
      let value = formData[field as keyof T];
      if (fieldConfig.transform) {
        value = fieldConfig.transform(value);
      }
      
      const result = fieldConfig.validator(value);
      if (!result.valid && result.error) {
        errors[field as keyof T] = result.error;
      }
    }
    
    return {
      valid: Object.keys(errors).length === 0,
      errors,
    };
  };
}
