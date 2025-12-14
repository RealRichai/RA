/**
 * Market Configuration System
 * Supports multi-market deployment with regulatory compliance per jurisdiction
 * 
 * Markets: NYC (5 boroughs), Long Island (Nassau, Suffolk)
 * Designed for investor optionality - all markets launch-ready
 */

// =============================================================================
// TYPES
// =============================================================================

export interface MarketRegulations {
  /** Maximum application fee allowed */
  maxApplicationFee: number;
  /** Maximum security deposit in months of rent */
  maxSecurityDepositMonths: number;
  /** Whether broker fee disclosure is required */
  brokerFeeDisclosureRequired: boolean;
  /** Who pays broker fee by default */
  defaultBrokerFeePayer: 'tenant' | 'landlord' | 'negotiable';
  /** Whether rent stabilization applies */
  rentStabilizationApplies: boolean;
  /** Whether good cause eviction law applies */
  goodCauseEvictionApplies: boolean;
  /** Whether Fair Chance Housing Act applies (criminal history deferral) */
  fairChanceHousingApplies: boolean;
  /** Whether source of income discrimination is prohibited */
  sourceOfIncomeProtection: boolean;
  /** Required disclosures */
  requiredDisclosures: string[];
  /** Eviction process timeline (days) */
  evictionTimelineDays: number;
  /** Local housing authority */
  housingAuthority: string;
  /** Regulatory notes for agents */
  regulatoryNotes: string[];
}

export interface MarketPricing {
  /** Median rent for 1BR */
  medianRent1BR: number;
  /** Median rent for 2BR */
  medianRent2BR: number;
  /** Median rent for 3BR */
  medianRent3BR: number;
  /** Average broker fee percentage */
  avgBrokerFeePercent: number;
  /** Average days on market */
  avgDaysOnMarket: number;
  /** Vacancy rate percentage */
  vacancyRatePercent: number;
  /** Year-over-year rent change percentage */
  yoyRentChangePercent: number;
  /** Price tier (affects platform fees) */
  priceTier: 'standard' | 'premium' | 'luxury';
}

export interface MarketDemographics {
  /** Total rental units in market */
  totalRentalUnits: number;
  /** Estimated self-managing landlords */
  selfManagingLandlords: number;
  /** Renter population */
  renterPopulation: number;
  /** Median household income */
  medianHouseholdIncome: number;
  /** Primary employment sectors */
  employmentSectors: string[];
  /** Major employers */
  majorEmployers: string[];
  /** Commuter percentage to NYC */
  nycCommuterPercent: number;
}

export interface Submarket {
  id: string;
  name: string;
  type: 'neighborhood' | 'village' | 'town' | 'city' | 'hamlet';
  /** Parent market ID */
  marketId: string;
  /** ZIP codes covered */
  zipCodes: string[];
  /** Priority tier for launch (1 = highest) */
  launchPriority: 1 | 2 | 3;
  /** Pricing data */
  pricing: Partial<MarketPricing>;
  /** Special characteristics */
  characteristics: string[];
  /** Whether this is a luxury submarket */
  isLuxury: boolean;
  /** Seasonal rental market (e.g., Hamptons) */
  isSeasonal: boolean;
  /** Peak season months (1-12) */
  peakSeasonMonths?: number[];
}

export interface Market {
  id: string;
  name: string;
  state: string;
  /** Whether market is enabled for launch */
  enabled: boolean;
  /** Counties included */
  counties: string[];
  /** Regulatory framework */
  regulations: MarketRegulations;
  /** Market pricing data */
  pricing: MarketPricing;
  /** Demographics */
  demographics: MarketDemographics;
  /** Submarkets */
  submarkets: Submarket[];
  /** MLS systems used */
  mlsSystems: string[];
  /** Local real estate boards */
  realEstateBoards: string[];
  /** Platform launch date (null = not launched) */
  launchDate: Date | null;
  /** Feature flags specific to this market */
  featureFlags: Record<string, boolean>;
}

// =============================================================================
// NYC MARKET CONFIGURATION
// =============================================================================

export const NYC_MARKET: Market = {
  id: 'nyc',
  name: 'New York City',
  state: 'NY',
  enabled: true,
  counties: ['New York', 'Kings', 'Queens', 'Bronx', 'Richmond'],
  
  regulations: {
    maxApplicationFee: 20,
    maxSecurityDepositMonths: 1,
    brokerFeeDisclosureRequired: true,
    defaultBrokerFeePayer: 'negotiable', // FARE Act
    rentStabilizationApplies: true,
    goodCauseEvictionApplies: true,
    fairChanceHousingApplies: true,
    sourceOfIncomeProtection: true,
    requiredDisclosures: [
      'FARE Act fee disclosure',
      'Lead paint disclosure (pre-1978)',
      'Bedbug history disclosure',
      'Flood zone disclosure',
      'Rent stabilization status',
      'Building violations (HPD)',
      'Sprinkler system disclosure',
      'Window guard notice',
      'Smoke/CO detector notice',
    ],
    evictionTimelineDays: 90, // Can extend to 6+ months
    housingAuthority: 'NYC HPD / HCR',
    regulatoryNotes: [
      'FARE Act (Local Law 18 of 2024) requires broker fee disclosure',
      'Fair Chance Housing Act delays criminal history inquiry until conditional offer',
      'Good Cause Eviction limits rent increases and eviction grounds',
      'Source of income discrimination prohibited including Section 8',
      'Security deposit max 1 month per Housing Stability and Tenant Protection Act',
      'Application fee max $20 per NY Tenant Protection Act',
    ],
  },
  
  pricing: {
    medianRent1BR: 3800,
    medianRent2BR: 5200,
    medianRent3BR: 6800,
    avgBrokerFeePercent: 12, // Typically 12-15% or one month
    avgDaysOnMarket: 21,
    vacancyRatePercent: 3.2,
    yoyRentChangePercent: 4.5,
    priceTier: 'premium',
  },
  
  demographics: {
    totalRentalUnits: 2100000,
    selfManagingLandlords: 180000,
    renterPopulation: 5400000,
    medianHouseholdIncome: 67000,
    employmentSectors: ['Finance', 'Healthcare', 'Technology', 'Media', 'Professional Services'],
    majorEmployers: ['NYC Government', 'NYCHA', 'JP Morgan', 'Citi', 'NYU', 'Columbia', 'Mount Sinai'],
    nycCommuterPercent: 0, // This IS NYC
  },
  
  submarkets: [
    // Manhattan
    {
      id: 'manhattan-upper-east',
      name: 'Upper East Side',
      type: 'neighborhood',
      marketId: 'nyc',
      zipCodes: ['10021', '10028', '10065', '10075', '10128'],
      launchPriority: 1,
      pricing: { medianRent1BR: 3200, medianRent2BR: 4800 },
      characteristics: ['Museum Mile', 'Luxury co-ops', 'Family-friendly'],
      isLuxury: true,
      isSeasonal: false,
    },
    {
      id: 'manhattan-upper-west',
      name: 'Upper West Side',
      type: 'neighborhood',
      marketId: 'nyc',
      zipCodes: ['10023', '10024', '10025', '10069'],
      launchPriority: 1,
      pricing: { medianRent1BR: 3100, medianRent2BR: 4500 },
      characteristics: ['Central Park access', 'Cultural institutions', 'Pre-war buildings'],
      isLuxury: true,
      isSeasonal: false,
    },
    {
      id: 'manhattan-midtown',
      name: 'Midtown',
      type: 'neighborhood',
      marketId: 'nyc',
      zipCodes: ['10017', '10018', '10019', '10020', '10022', '10036'],
      launchPriority: 1,
      pricing: { medianRent1BR: 3800, medianRent2BR: 5500 },
      characteristics: ['Corporate proximity', 'New developments', 'High-rise living'],
      isLuxury: true,
      isSeasonal: false,
    },
    {
      id: 'manhattan-chelsea',
      name: 'Chelsea',
      type: 'neighborhood',
      marketId: 'nyc',
      zipCodes: ['10001', '10011'],
      launchPriority: 1,
      pricing: { medianRent1BR: 3500, medianRent2BR: 5000 },
      characteristics: ['Art galleries', 'High Line', 'LGBTQ+ friendly'],
      isLuxury: true,
      isSeasonal: false,
    },
    // Brooklyn
    {
      id: 'brooklyn-williamsburg',
      name: 'Williamsburg',
      type: 'neighborhood',
      marketId: 'nyc',
      zipCodes: ['11211', '11249'],
      launchPriority: 1,
      pricing: { medianRent1BR: 3200, medianRent2BR: 4200 },
      characteristics: ['Young professionals', 'Nightlife', 'Waterfront'],
      isLuxury: false,
      isSeasonal: false,
    },
    {
      id: 'brooklyn-park-slope',
      name: 'Park Slope',
      type: 'neighborhood',
      marketId: 'nyc',
      zipCodes: ['11215', '11217'],
      launchPriority: 1,
      pricing: { medianRent1BR: 2800, medianRent2BR: 3800 },
      characteristics: ['Family-friendly', 'Brownstones', 'Prospect Park'],
      isLuxury: false,
      isSeasonal: false,
    },
    {
      id: 'brooklyn-dumbo',
      name: 'DUMBO',
      type: 'neighborhood',
      marketId: 'nyc',
      zipCodes: ['11201'],
      launchPriority: 1,
      pricing: { medianRent1BR: 4000, medianRent2BR: 5500 },
      characteristics: ['Tech hub', 'Waterfront views', 'Luxury lofts'],
      isLuxury: true,
      isSeasonal: false,
    },
    // Queens
    {
      id: 'queens-astoria',
      name: 'Astoria',
      type: 'neighborhood',
      marketId: 'nyc',
      zipCodes: ['11102', '11103', '11105', '11106'],
      launchPriority: 2,
      pricing: { medianRent1BR: 2200, medianRent2BR: 2800 },
      characteristics: ['Diverse dining', 'Young professionals', 'Good transit'],
      isLuxury: false,
      isSeasonal: false,
    },
    {
      id: 'queens-lic',
      name: 'Long Island City',
      type: 'neighborhood',
      marketId: 'nyc',
      zipCodes: ['11101', '11109'],
      launchPriority: 1,
      pricing: { medianRent1BR: 3000, medianRent2BR: 4000 },
      characteristics: ['New developments', 'Waterfront', 'Manhattan views'],
      isLuxury: true,
      isSeasonal: false,
    },
  ],
  
  mlsSystems: ['REBNY RLS'],
  realEstateBoards: ['Real Estate Board of New York (REBNY)'],
  launchDate: null, // Set when launched
  
  featureFlags: {
    fareActCompliance: true,
    fairChanceHousing: true,
    goodCauseEviction: true,
    rentStabilizationCheck: true,
    hpdViolationCheck: true,
    theGuarantorsIntegration: true,
    jeevaIntegration: true,
  },
};

// =============================================================================
// LONG ISLAND MARKET CONFIGURATION
// =============================================================================

export const LONG_ISLAND_MARKET: Market = {
  id: 'long-island',
  name: 'Long Island',
  state: 'NY',
  enabled: true, // Investor-ready at launch
  counties: ['Nassau', 'Suffolk'],
  
  regulations: {
    maxApplicationFee: 20, // NY state law applies
    maxSecurityDepositMonths: 1, // NY state law applies
    brokerFeeDisclosureRequired: false, // FARE Act is NYC only
    defaultBrokerFeePayer: 'tenant', // Traditional LI practice
    rentStabilizationApplies: false, // Not applicable outside NYC
    goodCauseEvictionApplies: false, // NYC only currently
    fairChanceHousingApplies: false, // NYC local law only
    sourceOfIncomeProtection: true, // NY state law
    requiredDisclosures: [
      'Lead paint disclosure (pre-1978)',
      'Flood zone disclosure',
      'Property condition disclosure (NY DOS-2156)',
      'Smoke/CO detector notice',
      'Sex offender registry notice',
      'Mold disclosure',
    ],
    evictionTimelineDays: 45, // Faster than NYC
    housingAuthority: 'Nassau County OCD / Suffolk County Dept of Economic Development',
    regulatoryNotes: [
      'NY State laws apply but not NYC local laws',
      'No rent stabilization - market rate rents',
      'No Fair Chance Housing - standard screening allowed',
      'No Good Cause Eviction - standard eviction grounds',
      'Broker fees traditionally paid by tenant (typically one month)',
      'Source of income protection per NY State Human Rights Law',
      'Security deposit max 1 month per NY state law',
      'Faster eviction timeline than NYC (30-45 days typical)',
    ],
  },
  
  pricing: {
    medianRent1BR: 2200,
    medianRent2BR: 2800,
    medianRent3BR: 3400,
    avgBrokerFeePercent: 8.33, // One month rent (8.33% annual)
    avgDaysOnMarket: 28,
    vacancyRatePercent: 4.1,
    yoyRentChangePercent: 6.2, // Higher growth than NYC
    priceTier: 'standard',
  },
  
  demographics: {
    totalRentalUnits: 195500,
    selfManagingLandlords: 67500, // 63,000-72,000 per research
    renterPopulation: 520000,
    medianHouseholdIncome: 115000, // Significantly higher than NYC
    employmentSectors: ['Healthcare', 'Education', 'Retail', 'Finance', 'Government'],
    majorEmployers: [
      'Northwell Health',
      'Catholic Health',
      'SUNY Stony Brook',
      'Hofstra University',
      'Nassau County Government',
      'Suffolk County Government',
      'Brookhaven National Laboratory',
    ],
    nycCommuterPercent: 35, // Significant commuter population
  },
  
  submarkets: [
    // Nassau County - Priority 1 (Gold Coast / High Value)
    {
      id: 'nassau-great-neck',
      name: 'Great Neck',
      type: 'village',
      marketId: 'long-island',
      zipCodes: ['11020', '11021', '11023', '11024', '11025', '11026', '11027'],
      launchPriority: 1,
      pricing: { medianRent1BR: 2800, medianRent2BR: 3600, priceTier: 'luxury' },
      characteristics: ['Gold Coast', 'Excellent schools', 'LIRR access', 'Affluent'],
      isLuxury: true,
      isSeasonal: false,
    },
    {
      id: 'nassau-manhasset',
      name: 'Manhasset',
      type: 'hamlet',
      marketId: 'long-island',
      zipCodes: ['11030'],
      launchPriority: 1,
      pricing: { medianRent1BR: 2600, medianRent2BR: 3400, priceTier: 'luxury' },
      characteristics: ['Gold Coast', 'Americana Manhasset shopping', 'Top schools'],
      isLuxury: true,
      isSeasonal: false,
    },
    {
      id: 'nassau-garden-city',
      name: 'Garden City',
      type: 'village',
      marketId: 'long-island',
      zipCodes: ['11530', '11531', '11599'],
      launchPriority: 1,
      pricing: { medianRent1BR: 2400, medianRent2BR: 3200, priceTier: 'premium' },
      characteristics: ['Planned community', 'Cathedral', 'Roosevelt Field proximity'],
      isLuxury: true,
      isSeasonal: false,
    },
    {
      id: 'nassau-rockville-centre',
      name: 'Rockville Centre',
      type: 'village',
      marketId: 'long-island',
      zipCodes: ['11570', '11571'],
      launchPriority: 1,
      pricing: { medianRent1BR: 2200, medianRent2BR: 2900, priceTier: 'premium' },
      characteristics: ['Vibrant downtown', 'LIRR express', 'Young professionals'],
      isLuxury: false,
      isSeasonal: false,
    },
    {
      id: 'nassau-long-beach',
      name: 'Long Beach',
      type: 'city',
      marketId: 'long-island',
      zipCodes: ['11561'],
      launchPriority: 1,
      pricing: { medianRent1BR: 2100, medianRent2BR: 2700, priceTier: 'premium' },
      characteristics: ['Beachfront', 'Boardwalk', 'Young professionals', 'LIRR access'],
      isLuxury: false,
      isSeasonal: true,
      peakSeasonMonths: [5, 6, 7, 8, 9],
    },
    // Nassau County - Priority 2
    {
      id: 'nassau-mineola',
      name: 'Mineola',
      type: 'village',
      marketId: 'long-island',
      zipCodes: ['11501'],
      launchPriority: 2,
      pricing: { medianRent1BR: 2000, medianRent2BR: 2600 },
      characteristics: ['County seat', 'LIRR hub', 'Hospital proximity'],
      isLuxury: false,
      isSeasonal: false,
    },
    {
      id: 'nassau-freeport',
      name: 'Freeport',
      type: 'village',
      marketId: 'long-island',
      zipCodes: ['11520'],
      launchPriority: 2,
      pricing: { medianRent1BR: 1900, medianRent2BR: 2400 },
      characteristics: ['Nautical Mile', 'Diverse community', 'Waterfront dining'],
      isLuxury: false,
      isSeasonal: false,
    },
    {
      id: 'nassau-valley-stream',
      name: 'Valley Stream',
      type: 'village',
      marketId: 'long-island',
      zipCodes: ['11580', '11581', '11582'],
      launchPriority: 2,
      pricing: { medianRent1BR: 1800, medianRent2BR: 2300 },
      characteristics: ['Queens border', 'Green Acres Mall', 'Diverse'],
      isLuxury: false,
      isSeasonal: false,
    },
    // Suffolk County - Priority 1
    {
      id: 'suffolk-huntington',
      name: 'Huntington',
      type: 'town',
      marketId: 'long-island',
      zipCodes: ['11743', '11746'],
      launchPriority: 1,
      pricing: { medianRent1BR: 2300, medianRent2BR: 3000, priceTier: 'premium' },
      characteristics: ['Huntington Village', 'Arts scene', 'Waterfront'],
      isLuxury: false,
      isSeasonal: false,
    },
    {
      id: 'suffolk-port-jefferson',
      name: 'Port Jefferson',
      type: 'village',
      marketId: 'long-island',
      zipCodes: ['11777'],
      launchPriority: 1,
      pricing: { medianRent1BR: 2100, medianRent2BR: 2700, priceTier: 'premium' },
      characteristics: ['Ferry terminal', 'Historic village', 'Stony Brook proximity'],
      isLuxury: false,
      isSeasonal: true,
      peakSeasonMonths: [5, 6, 7, 8, 9],
    },
    {
      id: 'suffolk-stony-brook',
      name: 'Stony Brook',
      type: 'hamlet',
      marketId: 'long-island',
      zipCodes: ['11790'],
      launchPriority: 1,
      pricing: { medianRent1BR: 1900, medianRent2BR: 2400 },
      characteristics: ['University town', 'Hospital', 'Research corridor'],
      isLuxury: false,
      isSeasonal: false,
    },
    {
      id: 'suffolk-patchogue',
      name: 'Patchogue',
      type: 'village',
      marketId: 'long-island',
      zipCodes: ['11772'],
      launchPriority: 2,
      pricing: { medianRent1BR: 1800, medianRent2BR: 2300 },
      characteristics: ['Revitalized downtown', 'Arts district', 'Affordable'],
      isLuxury: false,
      isSeasonal: false,
    },
    // Suffolk County - East End (Seasonal/Luxury)
    {
      id: 'suffolk-hamptons',
      name: 'The Hamptons',
      type: 'hamlet',
      marketId: 'long-island',
      zipCodes: ['11932', '11937', '11946', '11954', '11963', '11968', '11976'],
      launchPriority: 3, // Lower priority due to seasonal nature
      pricing: { medianRent1BR: 3500, medianRent2BR: 5500, priceTier: 'luxury' },
      characteristics: ['Luxury seasonal', 'Beach estates', 'Celebrity clientele'],
      isLuxury: true,
      isSeasonal: true,
      peakSeasonMonths: [5, 6, 7, 8, 9],
    },
    {
      id: 'suffolk-north-fork',
      name: 'North Fork',
      type: 'hamlet',
      marketId: 'long-island',
      zipCodes: ['11935', '11944', '11952', '11956', '11957', '11971'],
      launchPriority: 3,
      pricing: { medianRent1BR: 2200, medianRent2BR: 2900, priceTier: 'premium' },
      characteristics: ['Wine country', 'Farmland', 'Quieter alternative to Hamptons'],
      isLuxury: false,
      isSeasonal: true,
      peakSeasonMonths: [5, 6, 7, 8, 9, 10],
    },
  ],
  
  mlsSystems: ['MLSLI (Multiple Listing Service of Long Island)'],
  realEstateBoards: ['Long Island Board of Realtors (LIBOR)'],
  launchDate: null,
  
  featureFlags: {
    fareActCompliance: false, // NYC only
    fairChanceHousing: false, // NYC only
    goodCauseEviction: false, // NYC only
    rentStabilizationCheck: false, // Not applicable
    hpdViolationCheck: false, // NYC only
    theGuarantorsIntegration: true,
    jeevaIntegration: true,
    seasonalRentalSupport: true, // LI specific
    nycCommuterFeatures: true, // LI specific
  },
};

// =============================================================================
// MARKET REGISTRY
// =============================================================================

export const MARKETS: Record<string, Market> = {
  'nyc': NYC_MARKET,
  'long-island': LONG_ISLAND_MARKET,
};

export const ENABLED_MARKETS = Object.values(MARKETS).filter(m => m.enabled);

// =============================================================================
// MARKET UTILITIES
// =============================================================================

/**
 * Get market by ZIP code
 */
export function getMarketByZipCode(zipCode: string): Market | null {
  for (const market of Object.values(MARKETS)) {
    for (const submarket of market.submarkets) {
      if (submarket.zipCodes.includes(zipCode)) {
        return market;
      }
    }
  }
  return null;
}

/**
 * Get submarket by ZIP code
 */
export function getSubmarketByZipCode(zipCode: string): Submarket | null {
  for (const market of Object.values(MARKETS)) {
    for (const submarket of market.submarkets) {
      if (submarket.zipCodes.includes(zipCode)) {
        return submarket;
      }
    }
  }
  return null;
}

/**
 * Get market by ID
 */
export function getMarketById(marketId: string): Market | null {
  return MARKETS[marketId] || null;
}

/**
 * Check if a market feature is enabled
 */
export function isMarketFeatureEnabled(marketId: string, feature: string): boolean {
  const market = MARKETS[marketId];
  if (!market) return false;
  return market.featureFlags[feature] ?? false;
}

/**
 * Get required disclosures for a market
 */
export function getRequiredDisclosures(marketId: string): string[] {
  const market = MARKETS[marketId];
  if (!market) return [];
  return market.regulations.requiredDisclosures;
}

/**
 * Get max application fee for a market
 */
export function getMaxApplicationFee(marketId: string): number {
  const market = MARKETS[marketId];
  return market?.regulations.maxApplicationFee ?? 20; // NY state default
}

/**
 * Get max security deposit months for a market
 */
export function getMaxSecurityDepositMonths(marketId: string): number {
  const market = MARKETS[marketId];
  return market?.regulations.maxSecurityDepositMonths ?? 1; // NY state default
}

/**
 * Check if Fair Chance Housing applies (affects screening workflow)
 */
export function requiresFairChanceHousing(marketId: string): boolean {
  const market = MARKETS[marketId];
  return market?.regulations.fairChanceHousingApplies ?? false;
}

/**
 * Check if FARE Act compliance applies (affects fee disclosure)
 */
export function requiresFareActCompliance(marketId: string): boolean {
  return isMarketFeatureEnabled(marketId, 'fareActCompliance');
}

/**
 * Get all submarkets for a market, sorted by launch priority
 */
export function getSubmarketsByPriority(marketId: string): Submarket[] {
  const market = MARKETS[marketId];
  if (!market) return [];
  return [...market.submarkets].sort((a, b) => a.launchPriority - b.launchPriority);
}

/**
 * Get seasonal submarkets
 */
export function getSeasonalSubmarkets(marketId: string): Submarket[] {
  const market = MARKETS[marketId];
  if (!market) return [];
  return market.submarkets.filter(s => s.isSeasonal);
}

/**
 * Check if current month is peak season for a submarket
 */
export function isInPeakSeason(submarket: Submarket): boolean {
  if (!submarket.isSeasonal || !submarket.peakSeasonMonths) return true;
  const currentMonth = new Date().getMonth() + 1; // 1-12
  return submarket.peakSeasonMonths.includes(currentMonth);
}

/**
 * Get regulatory comparison between two markets
 */
export function compareMarketRegulations(
  marketId1: string,
  marketId2: string
): { field: string; market1: string; value1: unknown; market2: string; value2: unknown }[] {
  const market1 = MARKETS[marketId1];
  const market2 = MARKETS[marketId2];
  
  if (!market1 || !market2) return [];
  
  const differences: { field: string; market1: string; value1: unknown; market2: string; value2: unknown }[] = [];
  
  const reg1 = market1.regulations;
  const reg2 = market2.regulations;
  
  for (const key of Object.keys(reg1) as (keyof MarketRegulations)[]) {
    if (JSON.stringify(reg1[key]) !== JSON.stringify(reg2[key])) {
      differences.push({
        field: key,
        market1: market1.name,
        value1: reg1[key],
        market2: market2.name,
        value2: reg2[key],
      });
    }
  }
  
  return differences;
}

// =============================================================================
// INVESTOR METRICS
// =============================================================================

export interface MarketOpportunityMetrics {
  marketId: string;
  marketName: string;
  totalAddressableMarket: number; // TAM in dollars
  selfManagingLandlords: number;
  avgRevenuePerLandlord: number;
  competitionIntensity: 'low' | 'medium' | 'high';
  regulatoryComplexity: 'low' | 'medium' | 'high';
  launchReadiness: 'ready' | 'needs-work' | 'not-ready';
}

/**
 * Calculate market opportunity metrics for investor presentation
 */
export function calculateMarketOpportunityMetrics(marketId: string): MarketOpportunityMetrics | null {
  const market = MARKETS[marketId];
  if (!market) return null;
  
  // Calculate TAM: self-managing landlords × average annual value
  const avgAnnualValuePerLandlord = 
    (market.pricing.medianRent2BR * 12 * 0.08) + // 8% of annual rent as platform fees
    (200); // Additional services revenue
  
  const tam = market.demographics.selfManagingLandlords * avgAnnualValuePerLandlord;
  
  // Determine competition intensity
  let competitionIntensity: 'low' | 'medium' | 'high' = 'medium';
  if (marketId === 'nyc') {
    competitionIntensity = 'high'; // StreetEasy, Zillow, etc.
  } else if (marketId === 'long-island') {
    competitionIntensity = 'low'; // Less platform competition
  }
  
  // Determine regulatory complexity
  let regulatoryComplexity: 'low' | 'medium' | 'high' = 'medium';
  if (market.regulations.fareActCompliance || market.regulations.fairChanceHousingApplies) {
    regulatoryComplexity = 'high';
  } else if (!market.regulations.rentStabilizationApplies) {
    regulatoryComplexity = 'low';
  }
  
  return {
    marketId,
    marketName: market.name,
    totalAddressableMarket: Math.round(tam),
    selfManagingLandlords: market.demographics.selfManagingLandlords,
    avgRevenuePerLandlord: Math.round(avgAnnualValuePerLandlord),
    competitionIntensity,
    regulatoryComplexity,
    launchReadiness: market.enabled ? 'ready' : 'not-ready',
  };
}

/**
 * Get combined market opportunity for all enabled markets
 */
export function getCombinedMarketOpportunity(): {
  totalTAM: number;
  totalLandlords: number;
  markets: MarketOpportunityMetrics[];
} {
  const metrics = ENABLED_MARKETS
    .map(m => calculateMarketOpportunityMetrics(m.id))
    .filter((m): m is MarketOpportunityMetrics => m !== null);
  
  return {
    totalTAM: metrics.reduce((sum, m) => sum + m.totalAddressableMarket, 0),
    totalLandlords: metrics.reduce((sum, m) => sum + m.selfManagingLandlords, 0),
    markets: metrics,
  };
}
