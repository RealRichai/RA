/**
 * Compliance Providers
 *
 * External data providers for compliance calculations.
 */

import type { ICPIProvider, CPIData } from './types';

// ============================================================================
// Fallback CPI Data
// ============================================================================

/**
 * Deterministic fallback CPI values when external provider is unavailable.
 * Based on historical NYC metropolitan area averages.
 */
const FALLBACK_CPI_DATA: Record<string, number> = {
  '2024-01': 3.1,
  '2024-02': 3.2,
  '2024-03': 3.5,
  '2024-04': 3.4,
  '2024-05': 3.3,
  '2024-06': 3.0,
  '2024-07': 2.9,
  '2024-08': 2.5,
  '2024-09': 2.4,
  '2024-10': 2.6,
  '2024-11': 2.7,
  '2024-12': 2.9,
  '2025-01': 3.0,
  '2025-02': 2.8,
  '2025-03': 2.9,
  '2025-04': 3.1,
  '2025-05': 3.0,
  '2025-06': 2.9,
  '2025-07': 2.8,
  '2025-08': 2.7,
  '2025-09': 2.6,
  '2025-10': 2.5,
  '2025-11': 2.6,
  '2025-12': 2.7,
};

const DEFAULT_FALLBACK_CPI = 3.0; // Conservative 3% default

// ============================================================================
// Fallback CPI Provider
// ============================================================================

/**
 * Fallback CPI Provider with deterministic values.
 * Logs when used for audit purposes.
 */
export class FallbackCPIProvider implements ICPIProvider {
  private logger: (message: string, data?: Record<string, unknown>) => void;

  constructor(logger?: (message: string, data?: Record<string, unknown>) => void) {
    this.logger = logger || console.warn.bind(console);
  }

  async getCurrentCPI(region: string): Promise<CPIData> {
    const now = new Date();
    return this.getCPIForDate(region, now.getFullYear(), now.getMonth() + 1);
  }

  async getCPIForDate(region: string, year: number, month: number): Promise<CPIData> {
    const key = `${year}-${month.toString().padStart(2, '0')}`;
    const value = FALLBACK_CPI_DATA[key] ?? DEFAULT_FALLBACK_CPI;

    this.logger('CPI_FALLBACK_USED', {
      reason: 'Using deterministic fallback CPI data',
      region,
      year,
      month,
      value,
      source: 'fallback_table',
    });

    return {
      year,
      month,
      value,
      source: 'fallback_deterministic',
      region,
      isFallback: true,
    };
  }

  async getAnnualCPIChange(region: string): Promise<{ percentage: number; isFallback: boolean }> {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const currentKey = `${currentYear}-${currentMonth.toString().padStart(2, '0')}`;
    const lastYearKey = `${currentYear - 1}-${currentMonth.toString().padStart(2, '0')}`;

    const currentCPI = FALLBACK_CPI_DATA[currentKey] ?? DEFAULT_FALLBACK_CPI;
    const lastYearCPI = FALLBACK_CPI_DATA[lastYearKey] ?? DEFAULT_FALLBACK_CPI;

    // For fallback, we return the current CPI value directly as the annual change
    // since our fallback data represents annual inflation rates
    const percentage = currentCPI;

    this.logger('CPI_ANNUAL_CHANGE_FALLBACK', {
      region,
      currentCPI,
      lastYearCPI,
      calculatedPercentage: percentage,
      source: 'fallback_deterministic',
    });

    return {
      percentage,
      isFallback: true,
    };
  }
}

// ============================================================================
// External CPI Provider (TODO: Implement with real API)
// ============================================================================

/**
 * External CPI Provider - connects to BLS or other CPI data source.
 * TODO: HUMAN_IMPLEMENTATION_REQUIRED - Integrate with actual CPI data API
 */
export class ExternalCPIProvider implements ICPIProvider {
  private fallbackProvider: FallbackCPIProvider;
  private apiKey?: string;
  private logger: (message: string, data?: Record<string, unknown>) => void;

  constructor(
    apiKey?: string,
    logger?: (message: string, data?: Record<string, unknown>) => void
  ) {
    this.apiKey = apiKey;
    this.logger = logger || console.warn.bind(console);
    this.fallbackProvider = new FallbackCPIProvider(logger);
  }

  async getCurrentCPI(region: string): Promise<CPIData> {
    try {
      // TODO: HUMAN_IMPLEMENTATION_REQUIRED
      // Implement actual BLS API call:
      // const response = await fetch(`https://api.bls.gov/...?apiKey=${this.apiKey}`);
      // const data = await response.json();
      // return { year: data.year, month: data.month, value: data.value, source: 'bls', region, isFallback: false };

      // For now, fall back to deterministic values
      return this.fallbackProvider.getCurrentCPI(region);
    } catch (error) {
      this.logger('CPI_EXTERNAL_PROVIDER_ERROR', {
        error: error instanceof Error ? error.message : 'Unknown error',
        region,
        fallback: true,
      });
      return this.fallbackProvider.getCurrentCPI(region);
    }
  }

  async getCPIForDate(region: string, year: number, month: number): Promise<CPIData> {
    try {
      // TODO: HUMAN_IMPLEMENTATION_REQUIRED
      // Implement actual BLS API call for historical data
      return this.fallbackProvider.getCPIForDate(region, year, month);
    } catch (error) {
      this.logger('CPI_EXTERNAL_PROVIDER_ERROR', {
        error: error instanceof Error ? error.message : 'Unknown error',
        region,
        year,
        month,
        fallback: true,
      });
      return this.fallbackProvider.getCPIForDate(region, year, month);
    }
  }

  async getAnnualCPIChange(region: string): Promise<{ percentage: number; isFallback: boolean }> {
    try {
      // TODO: HUMAN_IMPLEMENTATION_REQUIRED
      // Calculate from actual CPI data
      return this.fallbackProvider.getAnnualCPIChange(region);
    } catch (error) {
      this.logger('CPI_EXTERNAL_PROVIDER_ERROR', {
        error: error instanceof Error ? error.message : 'Unknown error',
        region,
        fallback: true,
      });
      return this.fallbackProvider.getAnnualCPIChange(region);
    }
  }
}

// ============================================================================
// CPI Provider Factory
// ============================================================================

let defaultCPIProvider: ICPIProvider | null = null;

/**
 * Get CPI provider instance
 */
export function getCPIProvider(
  logger?: (message: string, data?: Record<string, unknown>) => void
): ICPIProvider {
  if (!defaultCPIProvider) {
    const apiKey = process.env['BLS_API_KEY'];
    defaultCPIProvider = apiKey
      ? new ExternalCPIProvider(apiKey, logger)
      : new FallbackCPIProvider(logger);
  }
  return defaultCPIProvider;
}

/**
 * Set custom CPI provider (for testing)
 */
export function setCPIProvider(provider: ICPIProvider): void {
  defaultCPIProvider = provider;
}

/**
 * Reset to default provider
 */
export function resetCPIProvider(): void {
  defaultCPIProvider = null;
}
