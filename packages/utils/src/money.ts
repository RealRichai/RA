export interface Money {
  amount: number; // Amount in cents
  currency: 'USD' | 'EUR' | 'GBP';
}

/**
 * Create a Money object from dollars
 */
export function dollars(amount: number, currency: Money['currency'] = 'USD'): Money {
  return {
    amount: Math.round(amount * 100),
    currency,
  };
}

/**
 * Create a Money object from cents
 */
export function cents(amount: number, currency: Money['currency'] = 'USD'): Money {
  return {
    amount: Math.round(amount),
    currency,
  };
}

/**
 * Convert Money to dollars (for display)
 */
export function toDollars(money: Money): number {
  return money.amount / 100;
}

/**
 * Format Money for display
 */
export function formatMoney(money: Money, options?: Intl.NumberFormatOptions): string {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: money.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...options,
  });

  return formatter.format(money.amount / 100);
}

/**
 * Format Money as compact (e.g., $1.2K, $3.5M)
 */
export function formatMoneyCompact(money: Money): string {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: money.currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  });

  return formatter.format(money.amount / 100);
}

/**
 * Add two Money values
 */
export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(`Cannot add different currencies: ${a.currency} and ${b.currency}`);
  }
  return {
    amount: a.amount + b.amount,
    currency: a.currency,
  };
}

/**
 * Subtract Money values
 */
export function subtractMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(`Cannot subtract different currencies: ${a.currency} and ${b.currency}`);
  }
  return {
    amount: a.amount - b.amount,
    currency: a.currency,
  };
}

/**
 * Multiply Money by a factor
 */
export function multiplyMoney(money: Money, factor: number): Money {
  return {
    amount: Math.round(money.amount * factor),
    currency: money.currency,
  };
}

/**
 * Divide Money by a divisor
 */
export function divideMoney(money: Money, divisor: number): Money {
  if (divisor === 0) {
    throw new Error('Cannot divide by zero');
  }
  return {
    amount: Math.round(money.amount / divisor),
    currency: money.currency,
  };
}

/**
 * Calculate percentage of Money
 */
export function percentageOfMoney(money: Money, percentage: number): Money {
  return {
    amount: Math.round((money.amount * percentage) / 100),
    currency: money.currency,
  };
}

/**
 * Check if Money is zero
 */
export function isZero(money: Money): boolean {
  return money.amount === 0;
}

/**
 * Check if Money is positive
 */
export function isPositive(money: Money): boolean {
  return money.amount > 0;
}

/**
 * Check if Money is negative
 */
export function isNegative(money: Money): boolean {
  return money.amount < 0;
}

/**
 * Compare two Money values
 * Returns: -1 if a < b, 0 if a === b, 1 if a > b
 */
export function compareMoney(a: Money, b: Money): -1 | 0 | 1 {
  if (a.currency !== b.currency) {
    throw new Error(`Cannot compare different currencies: ${a.currency} and ${b.currency}`);
  }
  if (a.amount < b.amount) return -1;
  if (a.amount > b.amount) return 1;
  return 0;
}

/**
 * Sum an array of Money values
 */
export function sumMoney(amounts: Money[]): Money {
  if (amounts.length === 0) {
    return { amount: 0, currency: 'USD' };
  }

  const currency = amounts[0]?.currency ?? 'USD';
  if (!amounts.every((m) => m.currency === currency)) {
    throw new Error('Cannot sum different currencies');
  }

  return {
    amount: amounts.reduce((sum, m) => sum + m.amount, 0),
    currency,
  };
}

/**
 * Calculate rent per square foot (annual)
 */
export function rentPerSqFt(monthlyRent: Money, squareFeet: number): number {
  if (squareFeet <= 0) {
    throw new Error('Square feet must be positive');
  }
  return (toDollars(monthlyRent) * 12) / squareFeet;
}

/**
 * Calculate monthly rent from annual per square foot
 */
export function monthlyRentFromPSF(
  rentPerSqFt: number,
  squareFeet: number,
  currency: Money['currency'] = 'USD'
): Money {
  const annual = rentPerSqFt * squareFeet;
  const monthly = annual / 12;
  return dollars(monthly, currency);
}

/**
 * Calculate pro-rated rent
 */
export function prorateRent(
  monthlyRent: Money,
  daysInMonth: number,
  daysRemaining: number
): Money {
  const dailyRate = monthlyRent.amount / daysInMonth;
  return {
    amount: Math.round(dailyRate * daysRemaining),
    currency: monthlyRent.currency,
  };
}

/**
 * Calculate late fee
 */
export function calculateLateFee(
  rentAmount: Money,
  feeType: 'fixed' | 'percentage',
  feeValue: number
): Money {
  if (feeType === 'fixed') {
    return { amount: Math.round(feeValue * 100), currency: rentAmount.currency };
  }
  return percentageOfMoney(rentAmount, feeValue);
}
