/**
 * RealRiches Market Configuration
 * 11 markets: NYC 5 boroughs + Long Island counties
 */

import { z } from 'zod';

// ============================================================================
// TYPES
// ============================================================================

export interface MarketDefinition {
  id: string;
  name: string;
  displayName: string;
  state: string;
  stateCode: string;
  timezone: string;
  enabled: boolean;
  launchDate: string;
  
  // Regulations
  regulations: {
    fareActApplies: boolean;
    fchaApplies: boolean;
    maxApplicationFee: number;
    maxSecurityDepositMonths: number;
    lateFeeMax: number | null;
    lateFeePercent: number | null;
    rentStabilized: boolean;
  };
  
  // Geography
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  center: {
    lat: number;
    lng: number;
  };
  
  // Neighborhoods
  neighborhoods: string[];
  
  // Stats
  stats: {
    averageRent: number;
    medianRent: number;
    vacancyRate: number;
  };
}

// ============================================================================
// NYC BOROUGHS
// ============================================================================

export const NYC_MARKETS: Record<string, MarketDefinition> = {
  MANHATTAN: {
    id: 'manhattan',
    name: 'Manhattan',
    displayName: 'Manhattan, NY',
    state: 'New York',
    stateCode: 'NY',
    timezone: 'America/New_York',
    enabled: true,
    launchDate: '2025-06-14',
    regulations: {
      fareActApplies: true,
      fchaApplies: true,
      maxApplicationFee: 20,
      maxSecurityDepositMonths: 1,
      lateFeeMax: 50,
      lateFeePercent: 5,
      rentStabilized: true,
    },
    bounds: {
      north: 40.882214,
      south: 40.679548,
      east: -73.907000,
      west: -74.047285,
    },
    center: { lat: 40.7831, lng: -73.9712 },
    neighborhoods: [
      'Upper East Side', 'Upper West Side', 'Midtown', 'Chelsea', 'Greenwich Village',
      'SoHo', 'Tribeca', 'Financial District', 'Harlem', 'East Village',
      'Lower East Side', 'Murray Hill', 'Gramercy', 'Hell\'s Kitchen', 'Morningside Heights',
      'Washington Heights', 'Inwood', 'East Harlem', 'NoHo', 'Flatiron',
    ],
    stats: { averageRent: 4500, medianRent: 4200, vacancyRate: 3.2 },
  },
  
  BROOKLYN: {
    id: 'brooklyn',
    name: 'Brooklyn',
    displayName: 'Brooklyn, NY',
    state: 'New York',
    stateCode: 'NY',
    timezone: 'America/New_York',
    enabled: true,
    launchDate: '2025-06-14',
    regulations: {
      fareActApplies: true,
      fchaApplies: true,
      maxApplicationFee: 20,
      maxSecurityDepositMonths: 1,
      lateFeeMax: 50,
      lateFeePercent: 5,
      rentStabilized: true,
    },
    bounds: {
      north: 40.739446,
      south: 40.551042,
      east: -73.833365,
      west: -74.041878,
    },
    center: { lat: 40.6782, lng: -73.9442 },
    neighborhoods: [
      'Williamsburg', 'DUMBO', 'Brooklyn Heights', 'Park Slope', 'Bushwick',
      'Bed-Stuy', 'Crown Heights', 'Prospect Heights', 'Greenpoint', 'Cobble Hill',
      'Carroll Gardens', 'Boerum Hill', 'Fort Greene', 'Clinton Hill', 'Bay Ridge',
      'Sunset Park', 'Flatbush', 'Bensonhurst', 'Borough Park', 'Brownsville',
    ],
    stats: { averageRent: 3200, medianRent: 2900, vacancyRate: 2.8 },
  },
  
  QUEENS: {
    id: 'queens',
    name: 'Queens',
    displayName: 'Queens, NY',
    state: 'New York',
    stateCode: 'NY',
    timezone: 'America/New_York',
    enabled: true,
    launchDate: '2025-06-14',
    regulations: {
      fareActApplies: true,
      fchaApplies: true,
      maxApplicationFee: 20,
      maxSecurityDepositMonths: 1,
      lateFeeMax: 50,
      lateFeePercent: 5,
      rentStabilized: true,
    },
    bounds: {
      north: 40.800922,
      south: 40.541722,
      east: -73.700272,
      west: -73.962582,
    },
    center: { lat: 40.7282, lng: -73.7949 },
    neighborhoods: [
      'Long Island City', 'Astoria', 'Flushing', 'Jackson Heights', 'Forest Hills',
      'Elmhurst', 'Jamaica', 'Ridgewood', 'Sunnyside', 'Woodside',
      'Rego Park', 'Bayside', 'Fresh Meadows', 'Kew Gardens', 'Corona',
      'Woodhaven', 'Howard Beach', 'Ozone Park', 'Far Rockaway', 'Rockaway Beach',
    ],
    stats: { averageRent: 2400, medianRent: 2200, vacancyRate: 2.5 },
  },
  
  BRONX: {
    id: 'bronx',
    name: 'Bronx',
    displayName: 'Bronx, NY',
    state: 'New York',
    stateCode: 'NY',
    timezone: 'America/New_York',
    enabled: true,
    launchDate: '2025-06-14',
    regulations: {
      fareActApplies: true,
      fchaApplies: true,
      maxApplicationFee: 20,
      maxSecurityDepositMonths: 1,
      lateFeeMax: 50,
      lateFeePercent: 5,
      rentStabilized: true,
    },
    bounds: {
      north: 40.917577,
      south: 40.785743,
      east: -73.765274,
      west: -73.933407,
    },
    center: { lat: 40.8448, lng: -73.8648 },
    neighborhoods: [
      'South Bronx', 'Riverdale', 'Fordham', 'Pelham Bay', 'Throgs Neck',
      'Morris Park', 'Parkchester', 'Hunts Point', 'Mott Haven', 'Highbridge',
      'Kingsbridge', 'Norwood', 'Bedford Park', 'Belmont', 'Tremont',
      'Soundview', 'Castle Hill', 'Westchester Square', 'Co-op City', 'City Island',
    ],
    stats: { averageRent: 1800, medianRent: 1650, vacancyRate: 3.5 },
  },
  
  STATEN_ISLAND: {
    id: 'staten_island',
    name: 'Staten Island',
    displayName: 'Staten Island, NY',
    state: 'New York',
    stateCode: 'NY',
    timezone: 'America/New_York',
    enabled: true,
    launchDate: '2025-06-14',
    regulations: {
      fareActApplies: true,
      fchaApplies: true,
      maxApplicationFee: 20,
      maxSecurityDepositMonths: 1,
      lateFeeMax: 50,
      lateFeePercent: 5,
      rentStabilized: true,
    },
    bounds: {
      north: 40.651812,
      south: 40.495992,
      east: -74.052313,
      west: -74.255735,
    },
    center: { lat: 40.5795, lng: -74.1502 },
    neighborhoods: [
      'St. George', 'Stapleton', 'Tompkinsville', 'New Brighton', 'West Brighton',
      'Port Richmond', 'Mariners Harbor', 'Travis', 'Bulls Head', 'Willowbrook',
      'Grasmere', 'Dongan Hills', 'Grant City', 'New Dorp', 'Oakwood',
      'Great Kills', 'Eltingville', 'Annadale', 'Huguenot', 'Tottenville',
    ],
    stats: { averageRent: 1600, medianRent: 1500, vacancyRate: 4.0 },
  },
};

// ============================================================================
// LONG ISLAND MARKETS
// ============================================================================

export const LONG_ISLAND_MARKETS: Record<string, MarketDefinition> = {
  NASSAU_NORTH: {
    id: 'nassau_north',
    name: 'Nassau County (North Shore)',
    displayName: 'Nassau North Shore, NY',
    state: 'New York',
    stateCode: 'NY',
    timezone: 'America/New_York',
    enabled: true,
    launchDate: '2025-09-01',
    regulations: {
      fareActApplies: false, // FARE Act is NYC only
      fchaApplies: false,
      maxApplicationFee: 100,
      maxSecurityDepositMonths: 2,
      lateFeeMax: null,
      lateFeePercent: null,
      rentStabilized: false,
    },
    bounds: {
      north: 40.93,
      south: 40.75,
      east: -73.42,
      west: -73.75,
    },
    center: { lat: 40.84, lng: -73.58 },
    neighborhoods: [
      'Great Neck', 'Port Washington', 'Manhasset', 'Roslyn', 'Glen Cove',
      'Sea Cliff', 'Oyster Bay', 'Cold Spring Harbor', 'Locust Valley', 'Old Westbury',
    ],
    stats: { averageRent: 3500, medianRent: 3200, vacancyRate: 2.2 },
  },
  
  NASSAU_SOUTH: {
    id: 'nassau_south',
    name: 'Nassau County (South Shore)',
    displayName: 'Nassau South Shore, NY',
    state: 'New York',
    stateCode: 'NY',
    timezone: 'America/New_York',
    enabled: true,
    launchDate: '2025-09-01',
    regulations: {
      fareActApplies: false,
      fchaApplies: false,
      maxApplicationFee: 100,
      maxSecurityDepositMonths: 2,
      lateFeeMax: null,
      lateFeePercent: null,
      rentStabilized: false,
    },
    bounds: {
      north: 40.75,
      south: 40.55,
      east: -73.42,
      west: -73.75,
    },
    center: { lat: 40.65, lng: -73.58 },
    neighborhoods: [
      'Long Beach', 'Freeport', 'Oceanside', 'Rockville Centre', 'Baldwin',
      'Merrick', 'Bellmore', 'Massapequa', 'Lynbrook', 'Valley Stream',
    ],
    stats: { averageRent: 2800, medianRent: 2600, vacancyRate: 2.5 },
  },
  
  NASSAU_CENTRAL: {
    id: 'nassau_central',
    name: 'Nassau County (Central)',
    displayName: 'Nassau Central, NY',
    state: 'New York',
    stateCode: 'NY',
    timezone: 'America/New_York',
    enabled: true,
    launchDate: '2025-09-01',
    regulations: {
      fareActApplies: false,
      fchaApplies: false,
      maxApplicationFee: 100,
      maxSecurityDepositMonths: 2,
      lateFeeMax: null,
      lateFeePercent: null,
      rentStabilized: false,
    },
    bounds: {
      north: 40.82,
      south: 40.68,
      east: -73.42,
      west: -73.68,
    },
    center: { lat: 40.75, lng: -73.55 },
    neighborhoods: [
      'Garden City', 'Mineola', 'Hempstead', 'Westbury', 'Carle Place',
      'New Hyde Park', 'Floral Park', 'Franklin Square', 'Elmont', 'Uniondale',
    ],
    stats: { averageRent: 2600, medianRent: 2400, vacancyRate: 2.8 },
  },
  
  SUFFOLK_WEST: {
    id: 'suffolk_west',
    name: 'Suffolk County (West)',
    displayName: 'Suffolk West, NY',
    state: 'New York',
    stateCode: 'NY',
    timezone: 'America/New_York',
    enabled: true,
    launchDate: '2025-09-01',
    regulations: {
      fareActApplies: false,
      fchaApplies: false,
      maxApplicationFee: 100,
      maxSecurityDepositMonths: 2,
      lateFeeMax: null,
      lateFeePercent: null,
      rentStabilized: false,
    },
    bounds: {
      north: 40.95,
      south: 40.65,
      east: -73.05,
      west: -73.42,
    },
    center: { lat: 40.80, lng: -73.23 },
    neighborhoods: [
      'Huntington', 'Babylon', 'Islip', 'Smithtown', 'Brentwood',
      'Commack', 'Deer Park', 'Lindenhurst', 'West Islip', 'Bay Shore',
    ],
    stats: { averageRent: 2400, medianRent: 2200, vacancyRate: 3.0 },
  },
  
  SUFFOLK_EAST: {
    id: 'suffolk_east',
    name: 'Suffolk County (East)',
    displayName: 'Suffolk East/Hamptons, NY',
    state: 'New York',
    stateCode: 'NY',
    timezone: 'America/New_York',
    enabled: true,
    launchDate: '2025-09-01',
    regulations: {
      fareActApplies: false,
      fchaApplies: false,
      maxApplicationFee: 100,
      maxSecurityDepositMonths: 2,
      lateFeeMax: null,
      lateFeePercent: null,
      rentStabilized: false,
    },
    bounds: {
      north: 41.15,
      south: 40.82,
      east: -71.85,
      west: -73.05,
    },
    center: { lat: 40.98, lng: -72.45 },
    neighborhoods: [
      'Southampton', 'East Hampton', 'Montauk', 'Sag Harbor', 'Bridgehampton',
      'Amagansett', 'Westhampton', 'Quogue', 'Shelter Island', 'Greenport',
      'Riverhead', 'Mattituck', 'Southold', 'Orient', 'North Fork',
    ],
    stats: { averageRent: 5500, medianRent: 4800, vacancyRate: 8.0 },
  },
  
  SUFFOLK_CENTRAL: {
    id: 'suffolk_central',
    name: 'Suffolk County (Central)',
    displayName: 'Suffolk Central, NY',
    state: 'New York',
    stateCode: 'NY',
    timezone: 'America/New_York',
    enabled: true,
    launchDate: '2025-09-01',
    regulations: {
      fareActApplies: false,
      fchaApplies: false,
      maxApplicationFee: 100,
      maxSecurityDepositMonths: 2,
      lateFeeMax: null,
      lateFeePercent: null,
      rentStabilized: false,
    },
    bounds: {
      north: 40.95,
      south: 40.72,
      east: -72.65,
      west: -73.05,
    },
    center: { lat: 40.83, lng: -72.85 },
    neighborhoods: [
      'Patchogue', 'Medford', 'Brookhaven', 'Port Jefferson', 'Stony Brook',
      'Lake Grove', 'Centereach', 'Selden', 'Coram', 'Shirley',
      'Mastic', 'Moriches', 'Bellport', 'Blue Point', 'Sayville',
    ],
    stats: { averageRent: 2200, medianRent: 2000, vacancyRate: 3.5 },
  },
};

// ============================================================================
// ALL MARKETS COMBINED
// ============================================================================

export const ALL_MARKETS: Record<string, MarketDefinition> = {
  ...NYC_MARKETS,
  ...LONG_ISLAND_MARKETS,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getMarketById(marketId: string): MarketDefinition | undefined {
  return ALL_MARKETS[marketId.toUpperCase()] || 
         Object.values(ALL_MARKETS).find(m => m.id === marketId);
}

export function getEnabledMarkets(): MarketDefinition[] {
  return Object.values(ALL_MARKETS).filter(m => m.enabled);
}

export function getNYCMarkets(): MarketDefinition[] {
  return Object.values(NYC_MARKETS);
}

export function getLongIslandMarkets(): MarketDefinition[] {
  return Object.values(LONG_ISLAND_MARKETS);
}

export function getFareActMarkets(): MarketDefinition[] {
  return Object.values(ALL_MARKETS).filter(m => m.regulations.fareActApplies);
}

export function getFCHAMarkets(): MarketDefinition[] {
  return Object.values(ALL_MARKETS).filter(m => m.regulations.fchaApplies);
}

export function getMarketByCoordinates(lat: number, lng: number): MarketDefinition | undefined {
  return Object.values(ALL_MARKETS).find(market => {
    const { bounds } = market;
    return lat >= bounds.south && lat <= bounds.north &&
           lng >= bounds.west && lng <= bounds.east;
  });
}

export function validateApplicationFee(marketId: string, fee: number): boolean {
  const market = getMarketById(marketId);
  if (!market) return false;
  return fee <= market.regulations.maxApplicationFee;
}

export function validateSecurityDeposit(
  marketId: string, 
  deposit: number, 
  monthlyRent: number
): boolean {
  const market = getMarketById(marketId);
  if (!market) return false;
  const maxDeposit = monthlyRent * market.regulations.maxSecurityDepositMonths;
  return deposit <= maxDeposit;
}

export function calculateLateFee(
  marketId: string,
  rentAmount: number
): number {
  const market = getMarketById(marketId);
  if (!market) return 0;
  
  const { lateFeeMax, lateFeePercent } = market.regulations;
  
  if (lateFeeMax === null || lateFeePercent === null) {
    // No regulation, use standard 5%
    return rentAmount * 0.05;
  }
  
  // NYC: Lesser of $50 or 5% of rent
  const percentFee = rentAmount * (lateFeePercent / 100);
  return Math.min(lateFeeMax, percentFee);
}

// ============================================================================
// MARKET COUNTS
// ============================================================================

export const MARKET_COUNTS = {
  total: Object.keys(ALL_MARKETS).length,
  nyc: Object.keys(NYC_MARKETS).length,
  longIsland: Object.keys(LONG_ISLAND_MARKETS).length,
  enabled: getEnabledMarkets().length,
  fareAct: getFareActMarkets().length,
  fcha: getFCHAMarkets().length,
};
