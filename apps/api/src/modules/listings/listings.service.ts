/**
 * Listings Service
 * Market-aware listing management with regulatory compliance per jurisdiction
 * Supports NYC (FARE Act, Fair Chance Housing) and Long Island (standard NY state)
 */

import { Prisma, Listing, ListingStatus, ListingType, PropertyType } from '@prisma/client';
import { prisma } from '../../lib/database.js';
import { Result, ok, err } from '../../lib/result.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import {
  getMarketByZipCode,
  getSubmarketByZipCode,
  requiresFareActCompliance,
  getMaxApplicationFee,
  getMaxSecurityDepositMonths,
  getRequiredDisclosures,
  isInPeakSeason,
  Market,
  Submarket,
} from '../../config/markets/index.js';

// =============================================================================
// TYPES
// =============================================================================

export interface CreateListingInput {
  ownerId: string;
  agentId?: string;
  type: ListingType;
  propertyType: PropertyType;
  title: string;
  description: string;
  address: string;
  unit?: string;
  city: string;
  state: string;
  zipCode: string;
  neighborhood?: string;
  borough?: string;
  bedrooms: number;
  bathrooms: number;
  squareFeet?: number;
  floor?: number;
  totalFloors?: number;
  yearBuilt?: number;
  rentPrice?: number;
  salePrice?: number;
  securityDeposit?: number;
  brokerFee?: number;
  brokerFeePercent?: number;
  applicationFee?: number;
  availableDate?: Date;
  leaseTermMonths?: number;
  amenities?: string[];
  utilitiesIncluded?: string[];
  petPolicy?: string;
  photos?: Prisma.JsonValue[];
  virtualTourUrl?: string;
  floorPlanUrl?: string;
  videoUrl?: string;
}

export interface ListingWithMarketData extends Listing {
  market: Market | null;
  submarket: Submarket | null;
  complianceStatus: ComplianceStatus;
}

export interface ComplianceStatus {
  isCompliant: boolean;
  marketId: string | null;
  fareActRequired: boolean;
  fareActCompliant: boolean;
  applicationFeeCompliant: boolean;
  securityDepositCompliant: boolean;
  disclosuresComplete: boolean;
  missingDisclosures: string[];
  warnings: string[];
  errors: string[];
}

export interface MoveInCosts {
  firstMonthRent: number;
  securityDeposit: number;
  brokerFee: number;
  applicationFee: number;
  totalMoveIn: number;
  breakdown: {
    item: string;
    amount: number;
    required: boolean;
    notes?: string;
  }[];
}

export interface FareActDisclosure {
  generatedAt: Date;
  marketId: string;
  totalMoveInCost: number;
  brokerFeeAmount: number;
  brokerFeePaidBy: 'tenant' | 'landlord' | 'split';
  brokerFeeDisclosure: string;
  applicationFee: number;
  securityDeposit: number;
  additionalFees: { name: string; amount: number }[];
  disclosureText: string;
}

// =============================================================================
// COMPLIANCE VALIDATION
// =============================================================================

/**
 * Validate listing compliance with market regulations
 */
export function validateListingCompliance(
  listing: Partial<CreateListingInput> & { zipCode: string }
): ComplianceStatus {
  const market = getMarketByZipCode(listing.zipCode);
  const marketId = market?.id || null;
  const fareActRequired = marketId ? requiresFareActCompliance(marketId) : false;
  
  const warnings: string[] = [];
  const errors: string[] = [];
  
  // Application fee validation
  const maxAppFee = marketId ? getMaxApplicationFee(marketId) : 20;
  const applicationFeeCompliant = 
    !listing.applicationFee || listing.applicationFee <= maxAppFee;
  
  if (!applicationFeeCompliant) {
    errors.push(`Application fee $${listing.applicationFee} exceeds maximum $${maxAppFee}`);
  }
  
  // Security deposit validation
  const maxDepositMonths = marketId ? getMaxSecurityDepositMonths(marketId) : 1;
  const rentPrice = listing.rentPrice || 0;
  const maxDeposit = rentPrice * maxDepositMonths;
  const securityDepositCompliant = 
    !listing.securityDeposit || listing.securityDeposit <= maxDeposit;
  
  if (!securityDepositCompliant) {
    errors.push(
      `Security deposit $${listing.securityDeposit} exceeds maximum ` +
      `$${maxDeposit} (${maxDepositMonths} month${maxDepositMonths > 1 ? 's' : ''} rent)`
    );
  }
  
  // FARE Act compliance (NYC only)
  let fareActCompliant = true;
  if (fareActRequired) {
    // Must have broker fee disclosed
    if (listing.brokerFee === undefined && listing.brokerFeePercent === undefined) {
      warnings.push('FARE Act requires broker fee disclosure. Set to 0 if no broker fee.');
      fareActCompliant = false;
    }
  }
  
  // Required disclosures check
  const requiredDisclosures = marketId ? getRequiredDisclosures(marketId) : [];
  // For now, we track which disclosures are required but don't enforce completion
  // This would integrate with a separate disclosure tracking system
  const missingDisclosures = requiredDisclosures; // Placeholder - actual implementation would check
  const disclosuresComplete = missingDisclosures.length === 0;
  
  // Additional market-specific warnings
  if (market?.id === 'long-island') {
    const submarket = getSubmarketByZipCode(listing.zipCode);
    if (submarket?.isSeasonal && !isInPeakSeason(submarket)) {
      warnings.push(
        `${submarket.name} is a seasonal market. Current month is outside peak season ` +
        `(${submarket.peakSeasonMonths?.join(', ')}). Consider adjusted pricing.`
      );
    }
  }
  
  const isCompliant = 
    applicationFeeCompliant && 
    securityDepositCompliant && 
    (fareActRequired ? fareActCompliant : true);
  
  return {
    isCompliant,
    marketId,
    fareActRequired,
    fareActCompliant,
    applicationFeeCompliant,
    securityDepositCompliant,
    disclosuresComplete,
    missingDisclosures,
    warnings,
    errors,
  };
}

/**
 * Calculate move-in costs with market-specific compliance
 */
export function calculateMoveInCosts(
  rentPrice: number,
  securityDeposit: number,
  brokerFee: number,
  applicationFee: number,
  zipCode: string
): MoveInCosts {
  const market = getMarketByZipCode(zipCode);
  const marketId = market?.id || 'unknown';
  
  const breakdown: MoveInCosts['breakdown'] = [
    {
      item: 'First Month Rent',
      amount: rentPrice,
      required: true,
    },
    {
      item: 'Security Deposit',
      amount: securityDeposit,
      required: true,
      notes: `Maximum ${market?.regulations.maxSecurityDepositMonths || 1} month(s) per NY law`,
    },
  ];
  
  if (brokerFee > 0) {
    breakdown.push({
      item: 'Broker Fee',
      amount: brokerFee,
      required: false,
      notes: marketId === 'nyc' 
        ? 'FARE Act requires disclosure of who pays' 
        : 'Traditional Long Island practice: tenant pays',
    });
  }
  
  if (applicationFee > 0) {
    breakdown.push({
      item: 'Application Fee',
      amount: applicationFee,
      required: true,
      notes: `Maximum $${market?.regulations.maxApplicationFee || 20} per NY law`,
    });
  }
  
  const totalMoveIn = rentPrice + securityDeposit + brokerFee + applicationFee;
  
  return {
    firstMonthRent: rentPrice,
    securityDeposit,
    brokerFee,
    applicationFee,
    totalMoveIn,
    breakdown,
  };
}

/**
 * Generate FARE Act disclosure document (NYC only)
 */
export function generateFareActDisclosure(
  listing: Listing,
  brokerFeePaidBy: 'tenant' | 'landlord' | 'split'
): FareActDisclosure | null {
  const market = getMarketByZipCode(listing.zipCode);
  if (!market || market.id !== 'nyc') {
    return null; // FARE Act only applies to NYC
  }
  
  const brokerFeeAmount = Number(listing.brokerFee || 0);
  const securityDeposit = Number(listing.securityDeposit || 0);
  const applicationFee = Number(listing.applicationFee || 20);
  const rentPrice = Number(listing.rentPrice || 0);
  
  const totalMoveInCost = rentPrice + securityDeposit + 
    (brokerFeePaidBy === 'tenant' ? brokerFeeAmount : 0) + applicationFee;
  
  let brokerFeeDisclosure: string;
  switch (brokerFeePaidBy) {
    case 'tenant':
      brokerFeeDisclosure = `Tenant pays broker fee of $${brokerFeeAmount.toLocaleString()}`;
      break;
    case 'landlord':
      brokerFeeDisclosure = `Landlord pays broker fee. No broker fee charged to tenant.`;
      break;
    case 'split':
      brokerFeeDisclosure = `Broker fee of $${brokerFeeAmount.toLocaleString()} split between landlord and tenant`;
      break;
  }
  
  const disclosureText = `
FARE ACT DISCLOSURE (NYC Local Law 18 of 2024)

Property: ${listing.address}${listing.unit ? `, Unit ${listing.unit}` : ''}
Monthly Rent: $${rentPrice.toLocaleString()}

MOVE-IN COST BREAKDOWN:
- First Month's Rent: $${rentPrice.toLocaleString()}
- Security Deposit: $${securityDeposit.toLocaleString()} (maximum 1 month per NY law)
- Application Fee: $${applicationFee.toLocaleString()} (maximum $20 per NY law)
- Broker Fee: ${brokerFeeDisclosure}

TOTAL MOVE-IN COST TO TENANT: $${totalMoveInCost.toLocaleString()}

BROKER FEE DISCLOSURE:
${brokerFeeDisclosure}

This disclosure is required by the NYC Fairness in Apartment Rentals and Sales (FARE) Act.
Generated: ${new Date().toISOString()}
  `.trim();
  
  return {
    generatedAt: new Date(),
    marketId: 'nyc',
    totalMoveInCost,
    brokerFeeAmount,
    brokerFeePaidBy,
    brokerFeeDisclosure,
    applicationFee,
    securityDeposit,
    additionalFees: [],
    disclosureText,
  };
}

// =============================================================================
// LISTINGS REPOSITORY
// =============================================================================

export class ListingsRepository {
  /**
   * Create a new listing with market compliance validation
   */
  async create(input: CreateListingInput): Promise<Result<ListingWithMarketData, AppError>> {
    try {
      // Validate compliance before creation
      const compliance = validateListingCompliance(input);
      
      if (!compliance.isCompliant) {
        logger.warn({ 
          input, 
          compliance 
        }, 'Listing creation blocked due to compliance violations');
        
        return err(new AppError(
          ErrorCodes.LISTING_VALIDATION_FAILED,
          `Listing does not meet regulatory requirements: ${compliance.errors.join('; ')}`
        ));
      }
      
      const market = getMarketByZipCode(input.zipCode);
      const submarket = getSubmarketByZipCode(input.zipCode);
      
      // Calculate move-in costs
      const moveInCosts = calculateMoveInCosts(
        input.rentPrice || 0,
        input.securityDeposit || 0,
        input.brokerFee || 0,
        input.applicationFee || 20,
        input.zipCode
      );
      
      // Generate FARE Act disclosure if required
      let fareActDisclosures: Prisma.JsonValue | null = null;
      if (market?.id === 'nyc' && requiresFareActCompliance('nyc')) {
        // Default to tenant pays unless specified otherwise
        // This would be set by the agent/landlord in the full implementation
        fareActDisclosures = { pending: true, brokerFeePayer: 'tenant' };
      }
      
      const listing = await prisma.listing.create({
        data: {
          ownerId: input.ownerId,
          agentId: input.agentId,
          type: input.type,
          propertyType: input.propertyType,
          status: ListingStatus.DRAFT,
          title: input.title,
          description: input.description,
          address: input.address,
          unit: input.unit,
          city: input.city,
          state: input.state,
          zipCode: input.zipCode,
          neighborhood: input.neighborhood || submarket?.name,
          borough: input.borough,
          bedrooms: input.bedrooms,
          bathrooms: input.bathrooms,
          squareFeet: input.squareFeet,
          floor: input.floor,
          totalFloors: input.totalFloors,
          yearBuilt: input.yearBuilt,
          rentPrice: input.rentPrice,
          salePrice: input.salePrice,
          securityDeposit: input.securityDeposit,
          brokerFee: input.brokerFee,
          brokerFeePercent: input.brokerFeePercent,
          applicationFee: input.applicationFee || 20,
          moveInCosts: moveInCosts as unknown as Prisma.JsonValue,
          fareActCompliant: compliance.fareActCompliant,
          fareActDisclosures,
          availableDate: input.availableDate,
          leaseTermMonths: input.leaseTermMonths || 12,
          amenities: input.amenities || [],
          utilitiesIncluded: input.utilitiesIncluded || [],
          petPolicy: input.petPolicy,
          photos: input.photos || [],
          virtualTourUrl: input.virtualTourUrl,
          floorPlanUrl: input.floorPlanUrl,
          videoUrl: input.videoUrl,
        },
      });
      
      logger.info({
        listingId: listing.id,
        marketId: market?.id,
        submarket: submarket?.name,
        compliance,
      }, 'Listing created');
      
      return ok({
        ...listing,
        market,
        submarket,
        complianceStatus: compliance,
      });
    } catch (error) {
      logger.error({ error, input }, 'Failed to create listing');
      return err(new AppError(ErrorCodes.DATABASE_ERROR, 'Failed to create listing'));
    }
  }
  
  /**
   * Find listing by ID with market data
   */
  async findById(id: string): Promise<Result<ListingWithMarketData | null, AppError>> {
    try {
      const listing = await prisma.listing.findUnique({
        where: { id, deletedAt: null },
      });
      
      if (!listing) {
        return ok(null);
      }
      
      const market = getMarketByZipCode(listing.zipCode);
      const submarket = getSubmarketByZipCode(listing.zipCode);
      const complianceStatus = validateListingCompliance({
        ...listing,
        rentPrice: listing.rentPrice ? Number(listing.rentPrice) : undefined,
        securityDeposit: listing.securityDeposit ? Number(listing.securityDeposit) : undefined,
        brokerFee: listing.brokerFee ? Number(listing.brokerFee) : undefined,
        applicationFee: listing.applicationFee ? Number(listing.applicationFee) : undefined,
      });
      
      return ok({
        ...listing,
        market,
        submarket,
        complianceStatus,
      });
    } catch (error) {
      logger.error({ error, listingId: id }, 'Failed to find listing');
      return err(new AppError(ErrorCodes.DATABASE_ERROR, 'Failed to find listing'));
    }
  }
  
  /**
   * Search listings with market filtering
   */
  async search(params: {
    marketId?: string;
    submarketId?: string;
    zipCodes?: string[];
    minRent?: number;
    maxRent?: number;
    bedrooms?: number;
    propertyType?: PropertyType;
    status?: ListingStatus;
    page?: number;
    limit?: number;
  }): Promise<Result<{
    listings: ListingWithMarketData[];
    total: number;
    page: number;
    totalPages: number;
  }, AppError>> {
    try {
      const page = params.page || 1;
      const limit = params.limit || 20;
      
      // Build ZIP code filter based on market/submarket
      let zipCodeFilter: string[] | undefined = params.zipCodes;
      
      if (params.submarketId && !zipCodeFilter) {
        // Find submarket and get its ZIP codes
        for (const market of Object.values(await import('../../config/markets/index.js')).filter(
          (m): m is Market => typeof m === 'object' && m !== null && 'submarkets' in m
        )) {
          const submarket = market.submarkets.find(s => s.id === params.submarketId);
          if (submarket) {
            zipCodeFilter = submarket.zipCodes;
            break;
          }
        }
      } else if (params.marketId && !zipCodeFilter) {
        // Get all ZIP codes for the market
        const { MARKETS } = await import('../../config/markets/index.js');
        const market = MARKETS[params.marketId];
        if (market) {
          zipCodeFilter = market.submarkets.flatMap(s => s.zipCodes);
        }
      }
      
      const where: Prisma.ListingWhereInput = {
        deletedAt: null,
        status: params.status || ListingStatus.ACTIVE,
        ...(zipCodeFilter && { zipCode: { in: zipCodeFilter } }),
        ...(params.minRent && { rentPrice: { gte: params.minRent } }),
        ...(params.maxRent && { rentPrice: { lte: params.maxRent } }),
        ...(params.bedrooms !== undefined && { bedrooms: params.bedrooms }),
        ...(params.propertyType && { propertyType: params.propertyType }),
      };
      
      const [listings, total] = await Promise.all([
        prisma.listing.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.listing.count({ where }),
      ]);
      
      const listingsWithMarket: ListingWithMarketData[] = listings.map(listing => {
        const market = getMarketByZipCode(listing.zipCode);
        const submarket = getSubmarketByZipCode(listing.zipCode);
        const complianceStatus = validateListingCompliance({
          ...listing,
          rentPrice: listing.rentPrice ? Number(listing.rentPrice) : undefined,
          securityDeposit: listing.securityDeposit ? Number(listing.securityDeposit) : undefined,
          brokerFee: listing.brokerFee ? Number(listing.brokerFee) : undefined,
          applicationFee: listing.applicationFee ? Number(listing.applicationFee) : undefined,
        });
        
        return {
          ...listing,
          market,
          submarket,
          complianceStatus,
        };
      });
      
      return ok({
        listings: listingsWithMarket,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      });
    } catch (error) {
      logger.error({ error, params }, 'Failed to search listings');
      return err(new AppError(ErrorCodes.DATABASE_ERROR, 'Failed to search listings'));
    }
  }
  
  /**
   * Publish listing with compliance verification
   */
  async publish(id: string): Promise<Result<ListingWithMarketData, AppError>> {
    try {
      const existing = await this.findById(id);
      if (existing.isErr()) return existing;
      if (!existing.value) {
        return err(new AppError(ErrorCodes.LISTING_NOT_FOUND, 'Listing not found'));
      }
      
      const listing = existing.value;
      
      // Re-validate compliance before publishing
      if (!listing.complianceStatus.isCompliant) {
        return err(new AppError(
          ErrorCodes.LISTING_VALIDATION_FAILED,
          `Cannot publish non-compliant listing: ${listing.complianceStatus.errors.join('; ')}`
        ));
      }
      
      // Generate final FARE Act disclosure if required
      let fareActDisclosures = listing.fareActDisclosures;
      if (listing.market?.id === 'nyc' && requiresFareActCompliance('nyc')) {
        const disclosure = generateFareActDisclosure(listing, 'tenant'); // Default
        if (disclosure) {
          fareActDisclosures = disclosure as unknown as Prisma.JsonValue;
        }
      }
      
      const updated = await prisma.listing.update({
        where: { id },
        data: {
          status: ListingStatus.ACTIVE,
          publishedAt: new Date(),
          fareActCompliant: true,
          fareActDisclosures,
        },
      });
      
      logger.info({
        listingId: id,
        marketId: listing.market?.id,
      }, 'Listing published');
      
      return ok({
        ...updated,
        market: listing.market,
        submarket: listing.submarket,
        complianceStatus: listing.complianceStatus,
      });
    } catch (error) {
      logger.error({ error, listingId: id }, 'Failed to publish listing');
      return err(new AppError(ErrorCodes.DATABASE_ERROR, 'Failed to publish listing'));
    }
  }
  
  /**
   * Get listings by market for analytics
   */
  async getMarketStats(marketId: string): Promise<Result<{
    totalListings: number;
    activeListings: number;
    avgRent: number;
    avgDaysOnMarket: number;
    bySubmarket: { submarketId: string; count: number; avgRent: number }[];
  }, AppError>> {
    try {
      const { MARKETS } = await import('../../config/markets/index.js');
      const market = MARKETS[marketId];
      
      if (!market) {
        return err(new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid market ID'));
      }
      
      const zipCodes = market.submarkets.flatMap(s => s.zipCodes);
      
      const [total, active, avgRentResult] = await Promise.all([
        prisma.listing.count({
          where: { zipCode: { in: zipCodes }, deletedAt: null },
        }),
        prisma.listing.count({
          where: { zipCode: { in: zipCodes }, status: ListingStatus.ACTIVE, deletedAt: null },
        }),
        prisma.listing.aggregate({
          where: { zipCode: { in: zipCodes }, status: ListingStatus.ACTIVE, deletedAt: null },
          _avg: { rentPrice: true },
        }),
      ]);
      
      // Calculate by submarket
      const bySubmarket = await Promise.all(
        market.submarkets.map(async (submarket) => {
          const [count, avg] = await Promise.all([
            prisma.listing.count({
              where: { 
                zipCode: { in: submarket.zipCodes }, 
                status: ListingStatus.ACTIVE, 
                deletedAt: null 
              },
            }),
            prisma.listing.aggregate({
              where: { 
                zipCode: { in: submarket.zipCodes }, 
                status: ListingStatus.ACTIVE, 
                deletedAt: null 
              },
              _avg: { rentPrice: true },
            }),
          ]);
          
          return {
            submarketId: submarket.id,
            count,
            avgRent: avg._avg.rentPrice ? Number(avg._avg.rentPrice) : 0,
          };
        })
      );
      
      return ok({
        totalListings: total,
        activeListings: active,
        avgRent: avgRentResult._avg.rentPrice ? Number(avgRentResult._avg.rentPrice) : 0,
        avgDaysOnMarket: market.pricing.avgDaysOnMarket,
        bySubmarket,
      });
    } catch (error) {
      logger.error({ error, marketId }, 'Failed to get market stats');
      return err(new AppError(ErrorCodes.DATABASE_ERROR, 'Failed to get market stats'));
    }
  }
}

export const listingsRepository = new ListingsRepository();
