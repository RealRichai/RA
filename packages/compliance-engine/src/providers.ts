/**
 * Compliance Providers
 *
 * External data providers for compliance calculations.
 * Implements deterministic fallback with proper evidence marking.
 */

import type { ICPIProvider, CPIData } from './types';

// ============================================================================
// BLS API Configuration
// ============================================================================

const BLS_API_BASE_URL = 'https://api.bls.gov/publicAPI/v2/timeseries/data/';

/**
 * BLS Series IDs for CPI-U (Consumer Price Index for All Urban Consumers)
 * See: https://www.bls.gov/cpi/
 */
const BLS_SERIES_IDS: Record<string, string> = {
  'nyc': 'CUURS12ASA0', // New York-Newark-Jersey City, NY-NJ-PA
  'us': 'CUUR0000SA0', // U.S. city average
  'la': 'CUURS49ASA0', // Los Angeles-Long Beach-Anaheim, CA
  'chicago': 'CUURS23ASA0', // Chicago-Naperville-Elgin, IL-IN-WI
  'default': 'CUUR0000SA0', // Default to national average
};

// ============================================================================
// Fallback CPI Data
// ============================================================================

/**
 * Deterministic fallback CPI values when external provider is unavailable.
 * Based on historical NYC metropolitan area averages.
 * These values represent year-over-year inflation rates (percentage).
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
// Data Source Evidence Type
// ============================================================================

export interface CPIDataWithEvidence extends CPIData {
  evidence: {
    dataSource: 'bls_api' | 'fallback_deterministic';
    seriesId?: string;
    fetchedAt?: string;
    fallbackReason?: string;
  };
}

// ============================================================================
// Fallback CPI Provider
// ============================================================================

/**
 * Fallback CPI Provider with deterministic values.
 * All decisions are marked with data_source=fallback in evidence.
 */
export class FallbackCPIProvider implements ICPIProvider {
  private logger: (message: string, data?: Record<string, unknown>) => void;

  constructor(logger?: (message: string, data?: Record<string, unknown>) => void) {
    this.logger = logger || console.warn.bind(console);
  }

  async getCurrentCPI(region: string): Promise<CPIDataWithEvidence> {
    const now = new Date();
    return this.getCPIForDate(region, now.getFullYear(), now.getMonth() + 1);
  }

  async getCPIForDate(region: string, year: number, month: number): Promise<CPIDataWithEvidence> {
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
      evidence: {
        dataSource: 'fallback_deterministic',
        fallbackReason: 'External API not configured or unavailable',
      },
    };
  }

  async getAnnualCPIChange(region: string): Promise<{
    percentage: number;
    isFallback: boolean;
    evidence: { dataSource: string; fallbackReason?: string };
  }> {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const currentKey = `${currentYear}-${currentMonth.toString().padStart(2, '0')}`;
    const currentCPI = FALLBACK_CPI_DATA[currentKey] ?? DEFAULT_FALLBACK_CPI;

    // For fallback, we return the current CPI value directly as the annual change
    // since our fallback data represents annual inflation rates
    const percentage = currentCPI;

    this.logger('CPI_ANNUAL_CHANGE_FALLBACK', {
      region,
      calculatedPercentage: percentage,
      source: 'fallback_deterministic',
    });

    return {
      percentage,
      isFallback: true,
      evidence: {
        dataSource: 'fallback_deterministic',
        fallbackReason: 'External API not configured or unavailable',
      },
    };
  }
}

// ============================================================================
// External CPI Provider (BLS API Integration)
// ============================================================================

/**
 * External CPI Provider - connects to Bureau of Labor Statistics API.
 * Falls back to deterministic values if API unavailable or unconfigured.
 * All decisions include evidence with data_source field.
 */
export class ExternalCPIProvider implements ICPIProvider {
  private fallbackProvider: FallbackCPIProvider;
  private apiKey: string | undefined;
  private logger: (message: string, data?: Record<string, unknown>) => void;
  private isConfigured: boolean;

  constructor(
    apiKey?: string,
    logger?: (message: string, data?: Record<string, unknown>) => void
  ) {
    this.apiKey = apiKey;
    this.logger = logger || console.warn.bind(console);
    this.fallbackProvider = new FallbackCPIProvider(logger);
    this.isConfigured = !!apiKey && apiKey.length > 0;
  }

  /**
   * Get the BLS series ID for a region
   */
  private getSeriesId(region: string): string {
    const normalizedRegion = region.toLowerCase().replace(/[^a-z]/g, '');
    return BLS_SERIES_IDS[normalizedRegion] || BLS_SERIES_IDS['default']!;
  }

  /**
   * Fetch CPI data from BLS API
   */
  private async fetchFromBLS(
    seriesId: string,
    startYear: number,
    endYear: number
  ): Promise<BLSResponse | null> {
    if (!this.isConfigured) {
      return null;
    }

    try {
      const requestBody = {
        seriesid: [seriesId],
        startyear: startYear.toString(),
        endyear: endYear.toString(),
        registrationkey: this.apiKey,
      };

      const response = await fetch(BLS_API_BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`BLS API returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as BLSResponse;

      if (data.status !== 'REQUEST_SUCCEEDED') {
        throw new Error(`BLS API error: ${data.message?.join(', ') || 'Unknown error'}`);
      }

      return data;
    } catch (error) {
      this.logger('BLS_API_ERROR', {
        error: error instanceof Error ? error.message : 'Unknown error',
        seriesId,
        startYear,
        endYear,
      });
      return null;
    }
  }

  async getCurrentCPI(region: string): Promise<CPIDataWithEvidence> {
    const now = new Date();
    return this.getCPIForDate(region, now.getFullYear(), now.getMonth() + 1);
  }

  async getCPIForDate(region: string, year: number, month: number): Promise<CPIDataWithEvidence> {
    if (!this.isConfigured) {
      this.logger('CPI_API_NOT_CONFIGURED', {
        reason: 'BLS_API_KEY not set',
        region,
        year,
        month,
      });
      return this.fallbackProvider.getCPIForDate(region, year, month);
    }

    const seriesId = this.getSeriesId(region);

    try {
      const blsData = await this.fetchFromBLS(seriesId, year - 1, year);

      if (!blsData || !blsData.Results?.series?.[0]?.data) {
        return this.fallbackProvider.getCPIForDate(region, year, month);
      }

      const series = blsData.Results.series[0];
      const monthStr = month.toString().padStart(2, '0');

      // Find the data point for the requested month
      const currentData = series.data.find(
        (d) => d.year === year.toString() && d.period === `M${monthStr}`
      );
      const lastYearData = series.data.find(
        (d) => d.year === (year - 1).toString() && d.period === `M${monthStr}`
      );

      if (!currentData || !lastYearData) {
        this.logger('CPI_DATA_NOT_FOUND', {
          seriesId,
          year,
          month,
          availableData: series.data.map((d) => `${d.year}-${d.period}`),
        });
        return this.fallbackProvider.getCPIForDate(region, year, month);
      }

      // Calculate year-over-year percentage change
      const currentValue = parseFloat(currentData.value);
      const lastYearValue = parseFloat(lastYearData.value);
      const percentChange = ((currentValue - lastYearValue) / lastYearValue) * 100;

      this.logger('CPI_FETCHED_FROM_BLS', {
        seriesId,
        year,
        month,
        currentValue,
        lastYearValue,
        percentChange,
      });

      return {
        year,
        month,
        value: Math.round(percentChange * 10) / 10, // Round to 1 decimal
        source: 'bls_api',
        region,
        isFallback: false,
        evidence: {
          dataSource: 'bls_api',
          seriesId,
          fetchedAt: new Date().toISOString(),
        },
      };
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

  async getAnnualCPIChange(region: string): Promise<{
    percentage: number;
    isFallback: boolean;
    evidence: { dataSource: string; seriesId?: string; fetchedAt?: string; fallbackReason?: string };
  }> {
    if (!this.isConfigured) {
      this.logger('CPI_API_NOT_CONFIGURED', {
        reason: 'BLS_API_KEY not set',
        region,
      });
      return this.fallbackProvider.getAnnualCPIChange(region);
    }

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    try {
      const cpiData = await this.getCPIForDate(region, currentYear, currentMonth);

      if (cpiData.isFallback) {
        return this.fallbackProvider.getAnnualCPIChange(region);
      }

      return {
        percentage: cpiData.value,
        isFallback: false,
        evidence: {
          dataSource: 'bls_api',
          seriesId: cpiData.evidence.seriesId,
          fetchedAt: cpiData.evidence.fetchedAt,
        },
      };
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
// BLS API Response Types
// ============================================================================

interface BLSDataPoint {
  year: string;
  period: string;
  periodName: string;
  value: string;
  footnotes: Array<{ code: string; text: string }>;
}

interface BLSSeries {
  seriesID: string;
  data: BLSDataPoint[];
}

interface BLSResponse {
  status: string;
  responseTime: number;
  message?: string[];
  Results?: {
    series: BLSSeries[];
  };
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
