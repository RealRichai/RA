/**
 * Markets Configuration
 * All supported markets with compliance requirements
 */

export interface Market {
  id: string;
  name: string;
  state: string;
  region: 'nyc' | 'long-island' | 'westchester' | 'hudson-valley';
  timezone: string;
  zipCodePrefixes: string[];
  compliance: MarketCompliance;
  fees: MarketFees;
  enabled: boolean;
}

export interface MarketCompliance {
  fareActRequired: boolean;
  fairChanceRequired: boolean;
  sourceOfIncomeProtection: boolean;
  securityDepositLimit: number; // months of rent
  applicationFeeCap: number; // dollars
  brokerFeeRules: 'negotiable' | 'tenant-optional' | 'landlord-pays';
  rentStabilization: boolean;
}

export interface MarketFees {
  defaultApplicationFee: number;
  defaultSecurityDeposit: number; // months
  typicalBrokerFeePercent: number;
}

/**
 * All supported markets
 */
export const MARKETS: Record<string, Market> = {
  'nyc-manhattan': {
    id: 'nyc-manhattan',
    name: 'Manhattan',
    state: 'NY',
    region: 'nyc',
    timezone: 'America/New_York',
    zipCodePrefixes: ['100', '101', '102'],
    compliance: {
      fareActRequired: true,
      fairChanceRequired: true,
      sourceOfIncomeProtection: true,
      securityDepositLimit: 1,
      applicationFeeCap: 20,
      brokerFeeRules: 'tenant-optional',
      rentStabilization: true,
    },
    fees: {
      defaultApplicationFee: 20,
      defaultSecurityDeposit: 1,
      typicalBrokerFeePercent: 15,
    },
    enabled: true,
  },
  'nyc-brooklyn': {
    id: 'nyc-brooklyn',
    name: 'Brooklyn',
    state: 'NY',
    region: 'nyc',
    timezone: 'America/New_York',
    zipCodePrefixes: ['112'],
    compliance: {
      fareActRequired: true,
      fairChanceRequired: true,
      sourceOfIncomeProtection: true,
      securityDepositLimit: 1,
      applicationFeeCap: 20,
      brokerFeeRules: 'tenant-optional',
      rentStabilization: true,
    },
    fees: {
      defaultApplicationFee: 20,
      defaultSecurityDeposit: 1,
      typicalBrokerFeePercent: 15,
    },
    enabled: true,
  },
  'nyc-queens': {
    id: 'nyc-queens',
    name: 'Queens',
    state: 'NY',
    region: 'nyc',
    timezone: 'America/New_York',
    zipCodePrefixes: ['110', '111', '113', '114', '116'],
    compliance: {
      fareActRequired: true,
      fairChanceRequired: true,
      sourceOfIncomeProtection: true,
      securityDepositLimit: 1,
      applicationFeeCap: 20,
      brokerFeeRules: 'tenant-optional',
      rentStabilization: true,
    },
    fees: {
      defaultApplicationFee: 20,
      defaultSecurityDeposit: 1,
      typicalBrokerFeePercent: 15,
    },
    enabled: true,
  },
  'nyc-bronx': {
    id: 'nyc-bronx',
    name: 'Bronx',
    state: 'NY',
    region: 'nyc',
    timezone: 'America/New_York',
    zipCodePrefixes: ['104'],
    compliance: {
      fareActRequired: true,
      fairChanceRequired: true,
      sourceOfIncomeProtection: true,
      securityDepositLimit: 1,
      applicationFeeCap: 20,
      brokerFeeRules: 'tenant-optional',
      rentStabilization: true,
    },
    fees: {
      defaultApplicationFee: 20,
      defaultSecurityDeposit: 1,
      typicalBrokerFeePercent: 12,
    },
    enabled: true,
  },
  'nyc-staten-island': {
    id: 'nyc-staten-island',
    name: 'Staten Island',
    state: 'NY',
    region: 'nyc',
    timezone: 'America/New_York',
    zipCodePrefixes: ['103'],
    compliance: {
      fareActRequired: true,
      fairChanceRequired: true,
      sourceOfIncomeProtection: true,
      securityDepositLimit: 1,
      applicationFeeCap: 20,
      brokerFeeRules: 'tenant-optional',
      rentStabilization: true,
    },
    fees: {
      defaultApplicationFee: 20,
      defaultSecurityDeposit: 1,
      typicalBrokerFeePercent: 12,
    },
    enabled: true,
  },
  'li-nassau': {
    id: 'li-nassau',
    name: 'Nassau County',
    state: 'NY',
    region: 'long-island',
    timezone: 'America/New_York',
    zipCodePrefixes: ['110', '115', '116'],
    compliance: {
      fareActRequired: false,
      fairChanceRequired: false,
      sourceOfIncomeProtection: true,
      securityDepositLimit: 1,
      applicationFeeCap: 50,
      brokerFeeRules: 'negotiable',
      rentStabilization: false,
    },
    fees: {
      defaultApplicationFee: 50,
      defaultSecurityDeposit: 1,
      typicalBrokerFeePercent: 15,
    },
    enabled: true,
  },
  'li-suffolk': {
    id: 'li-suffolk',
    name: 'Suffolk County',
    state: 'NY',
    region: 'long-island',
    timezone: 'America/New_York',
    zipCodePrefixes: ['117', '118', '119'],
    compliance: {
      fareActRequired: false,
      fairChanceRequired: false,
      sourceOfIncomeProtection: true,
      securityDepositLimit: 1,
      applicationFeeCap: 50,
      brokerFeeRules: 'negotiable',
      rentStabilization: false,
    },
    fees: {
      defaultApplicationFee: 50,
      defaultSecurityDeposit: 1,
      typicalBrokerFeePercent: 15,
    },
    enabled: true,
  },
  'westchester': {
    id: 'westchester',
    name: 'Westchester County',
    state: 'NY',
    region: 'westchester',
    timezone: 'America/New_York',
    zipCodePrefixes: ['105', '106', '107', '108', '109'],
    compliance: {
      fareActRequired: false,
      fairChanceRequired: false,
      sourceOfIncomeProtection: true,
      securityDepositLimit: 1,
      applicationFeeCap: 50,
      brokerFeeRules: 'negotiable',
      rentStabilization: false,
    },
    fees: {
      defaultApplicationFee: 50,
      defaultSecurityDeposit: 1,
      typicalBrokerFeePercent: 15,
    },
    enabled: true,
  },
  'jersey-city': {
    id: 'jersey-city',
    name: 'Jersey City',
    state: 'NJ',
    region: 'hudson-valley',
    timezone: 'America/New_York',
    zipCodePrefixes: ['073'],
    compliance: {
      fareActRequired: false,
      fairChanceRequired: false,
      sourceOfIncomeProtection: true,
      securityDepositLimit: 1.5,
      applicationFeeCap: 50,
      brokerFeeRules: 'negotiable',
      rentStabilization: false,
    },
    fees: {
      defaultApplicationFee: 50,
      defaultSecurityDeposit: 1.5,
      typicalBrokerFeePercent: 15,
    },
    enabled: false,
  },
  'hoboken': {
    id: 'hoboken',
    name: 'Hoboken',
    state: 'NJ',
    region: 'hudson-valley',
    timezone: 'America/New_York',
    zipCodePrefixes: ['070'],
    compliance: {
      fareActRequired: false,
      fairChanceRequired: false,
      sourceOfIncomeProtection: true,
      securityDepositLimit: 1.5,
      applicationFeeCap: 50,
      brokerFeeRules: 'negotiable',
      rentStabilization: false,
    },
    fees: {
      defaultApplicationFee: 50,
      defaultSecurityDeposit: 1.5,
      typicalBrokerFeePercent: 15,
    },
    enabled: false,
  },
  'newark': {
    id: 'newark',
    name: 'Newark',
    state: 'NJ',
    region: 'hudson-valley',
    timezone: 'America/New_York',
    zipCodePrefixes: ['071'],
    compliance: {
      fareActRequired: false,
      fairChanceRequired: false,
      sourceOfIncomeProtection: true,
      securityDepositLimit: 1.5,
      applicationFeeCap: 50,
      brokerFeeRules: 'negotiable',
      rentStabilization: false,
    },
    fees: {
      defaultApplicationFee: 50,
      defaultSecurityDeposit: 1.5,
      typicalBrokerFeePercent: 12,
    },
    enabled: false,
  },
};

/**
 * Get market by ZIP code
 */
export function getMarketByZip(zipCode: string): Market | null {
  const prefix = zipCode.substring(0, 3);
  for (const market of Object.values(MARKETS)) {
    if (market.enabled && market.zipCodePrefixes.includes(prefix)) {
      return market;
    }
  }
  return null;
}

/**
 * Get all enabled markets
 */
export function getEnabledMarkets(): Market[] {
  return Object.values(MARKETS).filter((m) => m.enabled);
}

/**
 * Get markets by region
 */
export function getMarketsByRegion(region: Market['region']): Market[] {
  return Object.values(MARKETS).filter((m) => m.region === region);
}

/**
 * Check if market requires FARE Act compliance
 */
export function requiresFareAct(marketId: string): boolean {
  return MARKETS[marketId]?.compliance.fareActRequired ?? false;
}

/**
 * Check if market requires Fair Chance Housing compliance
 */
export function requiresFairChance(marketId: string): boolean {
  return MARKETS[marketId]?.compliance.fairChanceRequired ?? false;
}
