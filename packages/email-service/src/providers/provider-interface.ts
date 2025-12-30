/**
 * Email Provider Interface
 *
 * Base interface and abstract class for email provider adapters.
 */

import type { EmailMessage, EmailProvider, EmailProviderConfig, EmailStatus, SendResult } from '../types';

/**
 * Email provider interface that all adapters must implement.
 */
export interface IEmailProvider {
  /** Unique identifier for this provider */
  readonly providerId: EmailProvider;

  /** Check if the provider is properly configured and available */
  isAvailable(): Promise<boolean>;

  /** Validate credentials by making a test API call */
  validateCredentials(): Promise<boolean>;

  /** Send a single email */
  send(message: EmailMessage): Promise<SendResult>;

  /** Send multiple emails in batch */
  sendBatch(messages: EmailMessage[]): Promise<SendResult[]>;

  /** Get delivery status for a sent message (if supported) */
  getDeliveryStatus?(providerMessageId: string): Promise<EmailStatus>;
}

/**
 * Base email provider with common functionality.
 */
export abstract class BaseEmailProvider implements IEmailProvider {
  abstract readonly providerId: EmailProvider;

  protected config: EmailProviderConfig;
  protected isConfigured: boolean = false;

  constructor(config: EmailProviderConfig) {
    this.config = {
      timeout: 30000,
      sandbox: process.env['NODE_ENV'] !== 'production',
      ...config,
    };
    this.isConfigured = this.validateConfig();
  }

  /**
   * Validate that required configuration is present.
   * Subclasses should override this to add provider-specific validation.
   */
  protected validateConfig(): boolean {
    return Boolean(this.config.fromEmail);
  }

  /**
   * Check if the provider is available.
   */
  isAvailable(): Promise<boolean> {
    return Promise.resolve(this.isConfigured);
  }

  /**
   * Validate credentials. Default implementation returns isConfigured.
   * Subclasses should override to make actual API calls.
   */
  validateCredentials(): Promise<boolean> {
    return Promise.resolve(this.isConfigured);
  }

  /**
   * Format an email address for sending.
   */
  protected formatAddress(address: { email: string; name?: string }): string {
    if (address.name) {
      return `${address.name} <${address.email}>`;
    }
    return address.email;
  }

  /**
   * Get the from address for a message.
   */
  protected getFromAddress(message: EmailMessage): { email: string; name?: string } {
    return message.from || {
      email: this.config.fromEmail,
      name: this.config.fromName,
    };
  }

  /**
   * Send a single email. Must be implemented by subclasses.
   */
  abstract send(message: EmailMessage): Promise<SendResult>;

  /**
   * Send multiple emails. Default implementation sends sequentially.
   * Subclasses can override for batch API support.
   */
  async sendBatch(messages: EmailMessage[]): Promise<SendResult[]> {
    return Promise.all(messages.map((m) => this.send(m)));
  }
}

/**
 * Email provider error types.
 */
export class EmailProviderError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly provider: EmailProvider,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'EmailProviderError';
  }
}

export class RateLimitError extends EmailProviderError {
  constructor(provider: EmailProvider, _retryAfterMs?: number) {
    super(
      `Rate limit exceeded for ${provider}`,
      'RATE_LIMIT_EXCEEDED',
      provider,
      true
    );
    this.name = 'RateLimitError';
  }
}

export class AuthenticationError extends EmailProviderError {
  constructor(provider: EmailProvider) {
    super(
      `Authentication failed for ${provider}`,
      'AUTHENTICATION_FAILED',
      provider,
      false
    );
    this.name = 'AuthenticationError';
  }
}

export class InvalidRecipientError extends EmailProviderError {
  constructor(provider: EmailProvider, email: string) {
    super(
      `Invalid recipient: ${email}`,
      'INVALID_RECIPIENT',
      provider,
      false
    );
    this.name = 'InvalidRecipientError';
  }
}
