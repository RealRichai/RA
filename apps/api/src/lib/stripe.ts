/**
 * Stripe Client
 *
 * Centralized Stripe SDK initialization with logging and PII redaction.
 */

import { getConfig } from '@realriches/config';
import { AppError } from '@realriches/utils';
import Stripe from 'stripe';

// Singleton stripe instance
let stripeInstance: Stripe | null = null;

/**
 * Get the Stripe client instance.
 * Throws if Stripe is not configured.
 */
export function getStripe(): Stripe {
  if (stripeInstance) {
    return stripeInstance;
  }

  const config = getConfig();

  if (!config.stripe?.secretKey) {
    throw new AppError(
      'Stripe is not configured. Set STRIPE_SECRET_KEY environment variable.',
      'STRIPE_NOT_CONFIGURED',
      500
    );
  }

  stripeInstance = new Stripe(config.stripe.secretKey, {
    apiVersion: '2023-10-16',
    typescript: true,
    maxNetworkRetries: 2,
    timeout: 30000,
  });

  return stripeInstance;
}

/**
 * Get the Stripe webhook secret.
 * Throws if not configured.
 */
export function getWebhookSecret(): string {
  const config = getConfig();

  if (!config.stripe?.webhookSecret) {
    throw new AppError(
      'Stripe webhook secret is not configured. Set STRIPE_WEBHOOK_SECRET environment variable.',
      'STRIPE_WEBHOOK_SECRET_NOT_CONFIGURED',
      500
    );
  }

  return config.stripe.webhookSecret;
}

/**
 * Check if Stripe is configured.
 */
export function isStripeConfigured(): boolean {
  const config = getConfig();
  return Boolean(config.stripe?.secretKey);
}

/**
 * Fields that should be redacted in logs.
 */
export const STRIPE_SENSITIVE_FIELDS = [
  'card',
  'cvc',
  'exp_month',
  'exp_year',
  'number',
  'client_secret',
  'customer',
  'payment_method',
  'source',
  'bank_account',
  'account_number',
  'routing_number',
  'id_number',
  'ssn_last_4',
] as const;

/**
 * Redact sensitive fields from a Stripe object for logging.
 */
export function redactStripeData(data: unknown): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(redactStripeData);
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (STRIPE_SENSITIVE_FIELDS.includes(key as typeof STRIPE_SENSITIVE_FIELDS[number])) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      result[key] = redactStripeData(value);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Create or retrieve a Stripe customer for a user.
 */
export async function getOrCreateCustomer(
  userId: string,
  email: string,
  name?: string,
  existingStripeCustomerId?: string | null
): Promise<string> {
  const stripe = getStripe();

  // If we have an existing customer ID, verify it still exists
  if (existingStripeCustomerId) {
    try {
      const customer = await stripe.customers.retrieve(existingStripeCustomerId);
      if (!customer.deleted) {
        return existingStripeCustomerId;
      }
    } catch {
      // Customer not found, create new one
    }
  }

  // Create new customer
  const customer = await stripe.customers.create({
    email,
    name,
    metadata: {
      userId,
      platform: 'realriches',
    },
  });

  return customer.id;
}

/**
 * Create a PaymentIntent for a payment.
 */
export interface CreatePaymentIntentParams {
  amount: number; // In cents
  currency?: string;
  customerId: string;
  paymentMethodId: string;
  paymentId: string; // Internal payment ID for metadata
  description?: string;
  confirm?: boolean;
}

export async function createPaymentIntent(
  params: CreatePaymentIntentParams
): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();

  const paymentIntent = await stripe.paymentIntents.create({
    amount: params.amount,
    currency: params.currency || 'usd',
    customer: params.customerId,
    payment_method: params.paymentMethodId,
    confirm: params.confirm ?? true,
    automatic_payment_methods: {
      enabled: true,
      allow_redirects: 'never',
    },
    metadata: {
      payment_id: params.paymentId,
      platform: 'realriches',
    },
    description: params.description,
  });

  return paymentIntent;
}

/**
 * Retrieve and validate a payment method.
 */
export async function retrievePaymentMethod(
  paymentMethodId: string
): Promise<Stripe.PaymentMethod> {
  const stripe = getStripe();
  return stripe.paymentMethods.retrieve(paymentMethodId);
}

/**
 * Attach a payment method to a customer.
 */
export async function attachPaymentMethod(
  paymentMethodId: string,
  customerId: string
): Promise<Stripe.PaymentMethod> {
  const stripe = getStripe();
  return stripe.paymentMethods.attach(paymentMethodId, {
    customer: customerId,
  });
}

/**
 * Create a refund for a payment.
 */
export interface CreateRefundParams {
  paymentIntentId: string;
  amount?: number; // In cents, omit for full refund
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
}

export async function createRefund(params: CreateRefundParams): Promise<Stripe.Refund> {
  const stripe = getStripe();

  return stripe.refunds.create({
    payment_intent: params.paymentIntentId,
    amount: params.amount,
    reason: params.reason,
  });
}

/**
 * Construct a webhook event from payload and signature.
 * Uses Stripe's built-in verification.
 */
export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string
): Stripe.Event {
  const stripe = getStripe();
  const webhookSecret = getWebhookSecret();

  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}
