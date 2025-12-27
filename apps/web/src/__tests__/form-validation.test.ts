/**
 * Form Validation Tests
 * 
 * Tests for common form validation utilities used across the platform.
 */

import { describe, it, expect } from 'vitest';

// =============================================================================
// VALIDATION UTILITIES (extracted for testing)
// =============================================================================

interface ValidationResult {
  valid: boolean;
  error?: string;
}

// Email validation
function validateEmail(email: string): ValidationResult {
  if (!email || email.trim() === '') {
    return { valid: false, error: 'Email is required' };
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, error: 'Please enter a valid email address' };
  }
  
  return { valid: true };
}

// Phone validation (US format)
function validatePhone(phone: string): ValidationResult {
  if (!phone || phone.trim() === '') {
    return { valid: true }; // Phone is optional
  }
  
  // Remove formatting characters
  const digits = phone.replace(/\D/g, '');
  
  if (digits.length !== 10 && digits.length !== 11) {
    return { valid: false, error: 'Please enter a valid 10-digit phone number' };
  }
  
  return { valid: true };
}

// ZIP code validation
function validateZipCode(zipCode: string): ValidationResult {
  if (!zipCode || zipCode.trim() === '') {
    return { valid: false, error: 'ZIP code is required' };
  }
  
  const zipRegex = /^\d{5}(-\d{4})?$/;
  if (!zipRegex.test(zipCode)) {
    return { valid: false, error: 'Please enter a valid ZIP code' };
  }
  
  return { valid: true };
}

// Price validation
function validatePrice(price: string | number, options?: { min?: number; max?: number; required?: boolean }): ValidationResult {
  const { min = 0, max = Infinity, required = true } = options || {};
  
  if (!price && price !== 0) {
    if (required) {
      return { valid: false, error: 'Price is required' };
    }
    return { valid: true };
  }
  
  const numPrice = typeof price === 'string' ? parseFloat(price) : price;
  
  if (isNaN(numPrice)) {
    return { valid: false, error: 'Please enter a valid number' };
  }
  
  if (numPrice < min) {
    return { valid: false, error: `Price must be at least $${min.toLocaleString()}` };
  }
  
  if (numPrice > max) {
    return { valid: false, error: `Price cannot exceed $${max.toLocaleString()}` };
  }
  
  return { valid: true };
}

// Password validation
function validatePassword(password: string): ValidationResult {
  if (!password) {
    return { valid: false, error: 'Password is required' };
  }
  
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters' };
  }
  
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one uppercase letter' };
  }
  
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one lowercase letter' };
  }
  
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one number' };
  }
  
  return { valid: true };
}

// Date validation
function validateDate(dateString: string, options?: { 
  required?: boolean;
  minDate?: Date;
  maxDate?: Date;
}): ValidationResult {
  const { required = true, minDate, maxDate } = options || {};
  
  if (!dateString || dateString.trim() === '') {
    if (required) {
      return { valid: false, error: 'Date is required' };
    }
    return { valid: true };
  }
  
  const date = new Date(dateString);
  
  if (isNaN(date.getTime())) {
    return { valid: false, error: 'Please enter a valid date' };
  }
  
  if (minDate && date < minDate) {
    return { valid: false, error: `Date must be on or after ${minDate.toLocaleDateString()}` };
  }
  
  if (maxDate && date > maxDate) {
    return { valid: false, error: `Date must be on or before ${maxDate.toLocaleDateString()}` };
  }
  
  return { valid: true };
}

// Text field validation
function validateTextField(value: string, options?: {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  fieldName?: string;
}): ValidationResult {
  const { required = true, minLength = 0, maxLength = Infinity, fieldName = 'Field' } = options || {};
  
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
  
  return { valid: true };
}

// =============================================================================
// TESTS
// =============================================================================

describe('Email Validation', () => {
  it('should validate correct email addresses', () => {
    expect(validateEmail('test@example.com').valid).toBe(true);
    expect(validateEmail('user.name@domain.org').valid).toBe(true);
    expect(validateEmail('user+tag@sub.domain.com').valid).toBe(true);
  });

  it('should reject empty email', () => {
    const result = validateEmail('');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Email is required');
  });

  it('should reject invalid email formats', () => {
    expect(validateEmail('notanemail').valid).toBe(false);
    expect(validateEmail('missing@domain').valid).toBe(false);
    expect(validateEmail('@nodomain.com').valid).toBe(false);
    expect(validateEmail('spaces in@email.com').valid).toBe(false);
  });

  it('should reject whitespace-only email', () => {
    const result = validateEmail('   ');
    expect(result.valid).toBe(false);
  });
});

describe('Phone Validation', () => {
  it('should validate correct phone formats', () => {
    expect(validatePhone('(212) 555-0123').valid).toBe(true);
    expect(validatePhone('212-555-0123').valid).toBe(true);
    expect(validatePhone('2125550123').valid).toBe(true);
    expect(validatePhone('1-212-555-0123').valid).toBe(true);
    expect(validatePhone('+1 212 555 0123').valid).toBe(true);
  });

  it('should allow empty phone (optional)', () => {
    expect(validatePhone('').valid).toBe(true);
    expect(validatePhone('   ').valid).toBe(true);
  });

  it('should reject invalid phone numbers', () => {
    expect(validatePhone('123').valid).toBe(false);
    expect(validatePhone('123456789').valid).toBe(false);
    expect(validatePhone('123456789012').valid).toBe(false);
  });
});

describe('ZIP Code Validation', () => {
  it('should validate 5-digit ZIP codes', () => {
    expect(validateZipCode('10001').valid).toBe(true);
    expect(validateZipCode('90210').valid).toBe(true);
    expect(validateZipCode('00501').valid).toBe(true);
  });

  it('should validate ZIP+4 format', () => {
    expect(validateZipCode('10001-1234').valid).toBe(true);
  });

  it('should reject empty ZIP code', () => {
    const result = validateZipCode('');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('ZIP code is required');
  });

  it('should reject invalid ZIP codes', () => {
    expect(validateZipCode('1234').valid).toBe(false);
    expect(validateZipCode('123456').valid).toBe(false);
    expect(validateZipCode('abcde').valid).toBe(false);
    expect(validateZipCode('10001-12').valid).toBe(false);
  });
});

describe('Price Validation', () => {
  it('should validate valid prices', () => {
    expect(validatePrice(1000).valid).toBe(true);
    expect(validatePrice('2500').valid).toBe(true);
    expect(validatePrice('3500.50').valid).toBe(true);
    expect(validatePrice(0, { min: 0 }).valid).toBe(true);
  });

  it('should reject required empty price', () => {
    const result = validatePrice('', { required: true });
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Price is required');
  });

  it('should allow empty price when not required', () => {
    expect(validatePrice('', { required: false }).valid).toBe(true);
  });

  it('should enforce minimum price', () => {
    const result = validatePrice(500, { min: 1000 });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('at least $1,000');
  });

  it('should enforce maximum price', () => {
    const result = validatePrice(100000, { max: 50000 });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('cannot exceed $50,000');
  });

  it('should reject non-numeric values', () => {
    expect(validatePrice('abc').valid).toBe(false);
    expect(validatePrice('12.34.56').valid).toBe(false);
  });
});

describe('Password Validation', () => {
  it('should validate strong passwords', () => {
    expect(validatePassword('Password123').valid).toBe(true);
    expect(validatePassword('MySecure1Pass').valid).toBe(true);
    expect(validatePassword('Abcdefg1').valid).toBe(true);
  });

  it('should reject empty password', () => {
    const result = validatePassword('');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Password is required');
  });

  it('should reject short passwords', () => {
    const result = validatePassword('Pass1');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('at least 8 characters');
  });

  it('should require uppercase letter', () => {
    const result = validatePassword('password123');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('uppercase');
  });

  it('should require lowercase letter', () => {
    const result = validatePassword('PASSWORD123');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('lowercase');
  });

  it('should require number', () => {
    const result = validatePassword('PasswordABC');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('number');
  });
});

describe('Date Validation', () => {
  it('should validate correct date formats', () => {
    expect(validateDate('2025-01-15').valid).toBe(true);
    expect(validateDate('2025-12-31').valid).toBe(true);
  });

  it('should reject empty required date', () => {
    const result = validateDate('', { required: true });
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Date is required');
  });

  it('should allow empty optional date', () => {
    expect(validateDate('', { required: false }).valid).toBe(true);
  });

  it('should enforce minimum date', () => {
    const minDate = new Date('2025-01-01');
    const result = validateDate('2024-12-31', { minDate });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('on or after');
  });

  it('should enforce maximum date', () => {
    const maxDate = new Date('2025-12-31');
    const result = validateDate('2026-01-01', { maxDate });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('on or before');
  });

  it('should reject invalid date formats', () => {
    expect(validateDate('not-a-date').valid).toBe(false);
    expect(validateDate('2025-13-45').valid).toBe(false);
  });
});

describe('Text Field Validation', () => {
  it('should validate text within limits', () => {
    expect(validateTextField('Hello World').valid).toBe(true);
    expect(validateTextField('Test', { minLength: 3, maxLength: 10 }).valid).toBe(true);
  });

  it('should reject empty required field', () => {
    const result = validateTextField('', { fieldName: 'Title' });
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Title is required');
  });

  it('should allow empty optional field', () => {
    expect(validateTextField('', { required: false }).valid).toBe(true);
  });

  it('should enforce minimum length', () => {
    const result = validateTextField('Hi', { minLength: 5, fieldName: 'Description' });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('at least 5 characters');
  });

  it('should enforce maximum length', () => {
    const result = validateTextField('This is a very long text', { maxLength: 10, fieldName: 'Title' });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('cannot exceed 10 characters');
  });

  it('should trim whitespace before validation', () => {
    const result = validateTextField('   ', { required: true });
    expect(result.valid).toBe(false);
  });
});
