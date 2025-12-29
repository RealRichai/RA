/**
 * Partner Provider Interface
 *
 * Standard contract interface for all partner integrations:
 * Quote -> Bind -> Policy/Contract Artifact -> Cancel/Renew
 */

import type {
  BindRequest,
  CancelRequest,
  CancelResponse,
  PartnerProvider,
  PartnerProductType,
  PolicyArtifact,
  QuoteRequest,
  QuoteResponse,
  RenewRequest,
} from '../types';

// =============================================================================
// Provider Interface
// =============================================================================

/**
 * Standard interface that all partner providers must implement.
 */
export interface IPartnerProvider {
  /** Provider identifier */
  readonly providerId: PartnerProvider;

  /** Product types this provider supports */
  readonly supportedProducts: PartnerProductType[];

  /** Whether the provider is available */
  isAvailable(): Promise<boolean>;

  /** Get a quote for coverage */
  getQuote(request: QuoteRequest): Promise<QuoteResponse>;

  /** Bind a quote to create a policy */
  bind(request: BindRequest): Promise<PolicyArtifact>;

  /** Cancel an existing policy */
  cancel(request: CancelRequest): Promise<CancelResponse>;

  /** Renew an existing policy */
  renew(request: RenewRequest): Promise<QuoteResponse>;

  /** Get policy status */
  getPolicyStatus(providerPolicyId: string): Promise<PolicyArtifact | null>;

  /** Validate provider credentials */
  validateCredentials(): Promise<boolean>;
}

// =============================================================================
// Provider Configuration
// =============================================================================

export interface ProviderConfig {
  apiKey: string;
  apiUrl: string;
  webhookSecret?: string;
  timeout?: number;
  retryAttempts?: number;
  sandbox?: boolean;
}

export interface ProviderCredentials {
  apiKey: string;
  apiSecret?: string;
  partnerId?: string;
  webhookSecret?: string;
}

// =============================================================================
// Base Provider Class
// =============================================================================

/**
 * Abstract base class for partner providers with common functionality.
 */
export abstract class BasePartnerProvider implements IPartnerProvider {
  abstract readonly providerId: PartnerProvider;
  abstract readonly supportedProducts: PartnerProductType[];

  protected config: ProviderConfig;
  protected isConfigured: boolean = false;

  constructor(config: ProviderConfig) {
    this.config = {
      timeout: 30000,
      retryAttempts: 3,
      sandbox: process.env.NODE_ENV !== 'production',
      ...config,
    };
    this.isConfigured = !!config.apiKey && !!config.apiUrl;
  }

  /**
   * Check if the provider is available (has valid config).
   */
  isAvailable(): Promise<boolean> {
    return Promise.resolve(this.isConfigured);
  }

  /**
   * Validate credentials by making a test API call.
   */
  validateCredentials(): Promise<boolean> {
    if (!this.isConfigured) return Promise.resolve(false);
    // Subclasses should override with actual validation
    return Promise.resolve(true);
  }

  /**
   * Make an HTTP request to the provider API.
   */
  protected async makeRequest<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.config.apiUrl}${endpoint}`;

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        'X-Api-Key': this.config.apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(this.config.timeout || 30000),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Provider API error: ${response.status} - ${error}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Log provider activity for debugging.
   */
  protected log(message: string, data?: unknown): void {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[${this.providerId}] ${message}`, data || '');
    }
  }

  // Abstract methods to be implemented by each provider
  abstract getQuote(request: QuoteRequest): Promise<QuoteResponse>;
  abstract bind(request: BindRequest): Promise<PolicyArtifact>;
  abstract cancel(request: CancelRequest): Promise<CancelResponse>;
  abstract renew(request: RenewRequest): Promise<QuoteResponse>;
  abstract getPolicyStatus(providerPolicyId: string): Promise<PolicyArtifact | null>;
}

// =============================================================================
// Provider Error Types
// =============================================================================

export class ProviderError extends Error {
  constructor(
    public readonly provider: PartnerProvider,
    public readonly code: string,
    message: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export class QuoteDeclinedError extends ProviderError {
  constructor(
    provider: PartnerProvider,
    public readonly reason: string,
    public readonly declineCode?: string
  ) {
    super(provider, 'QUOTE_DECLINED', reason);
    this.name = 'QuoteDeclinedError';
  }
}

export class BindFailedError extends ProviderError {
  constructor(provider: PartnerProvider, reason: string) {
    super(provider, 'BIND_FAILED', reason);
    this.name = 'BindFailedError';
  }
}

export class ProviderUnavailableError extends ProviderError {
  constructor(provider: PartnerProvider) {
    super(provider, 'PROVIDER_UNAVAILABLE', `Provider ${provider} is not available`);
    this.name = 'ProviderUnavailableError';
  }
}

// =============================================================================
// Provider Response Mappers
// =============================================================================

/**
 * Map provider-specific responses to standard format.
 */
export interface ResponseMapper<TProviderQuote, TProviderPolicy> {
  mapQuoteResponse(providerResponse: TProviderQuote): QuoteResponse;
  mapPolicyArtifact(providerResponse: TProviderPolicy): PolicyArtifact;
}
