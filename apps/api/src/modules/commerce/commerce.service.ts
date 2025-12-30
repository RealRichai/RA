/**
 * Commerce Service
 *
 * Orchestrates all commerce operations:
 * - Utilities concierge
 * - Moving services
 * - Insurance policies
 * - Guarantor applications
 * - Vendor marketplace orders
 *
 * Implements order state machine with idempotency.
 */

import { prisma } from '@realriches/database';
import {
  generatePrefixedId,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  logger,
} from '@realriches/utils';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type Redis from 'ioredis';

import { writeAuditLog } from '../../plugins/audit';

import {
  getCommerceProviderRegistry,
  getGuarantorProvider,
  getInsuranceProvider,
  getMovingProvider,
  getUtilitiesProvider,
} from './providers';
import type {
  Address,
  ConciergeTicket,
  ConciergeTicketRequest,
  ConfirmOrderRequest,
  CreateOrderRequest,
  GuarantorApplication,
  GuarantorApplicationRequest,
  GuarantorOption,
  InsurancePolicy,
  InsurancePurchaseRequest,
  InsuranceQuote,
  InsuranceQuoteRequest,
  MovingBooking,
  MovingBookingRequest,
  MovingQuote,
  MovingQuoteRequest,
  Order,
  OrderItem,
  OrderStatus,
  OrderType,
  ProviderMeta,
  Result,
  UtilityProvider,
  UtilityProviderQuery,
  UtilityType,
} from './providers/provider.types';
import { ok, err, ORDER_TRANSITIONS } from './providers/provider.types';

// =============================================================================
// Redis Keys
// =============================================================================

const IDEMPOTENCY_PREFIX = 'commerce:idempotency:';
const IDEMPOTENCY_TTL = 24 * 60 * 60; // 24 hours

// =============================================================================
// In-Memory Order Store (would be Prisma in production)
// =============================================================================

const orderStore = new Map<string, Order>();

// =============================================================================
// Service Response Types
// =============================================================================

export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
  meta?: {
    provider: string;
    isMock: boolean;
    requestId: string;
  };
}

function toServiceResponse<T>(result: Result<T>): ServiceResponse<T> {
  if (result.success) {
    return {
      success: true,
      data: result.data,
      meta: result.meta
        ? {
            provider: result.meta.provider,
            isMock: result.meta.isMock,
            requestId: result.meta.requestId,
          }
        : undefined,
    };
  }
  return {
    success: false,
    error: {
      code: 'PROVIDER_ERROR',
      message: result.error instanceof Error ? result.error.message : 'Unknown error',
    },
  };
}

// =============================================================================
// Commerce Service
// =============================================================================

export class CommerceService {
  private redis: Redis;

  constructor(private app: FastifyInstance) {
    this.redis = app.redis;
  }

  // ===========================================================================
  // Audit Logging Helper
  // ===========================================================================

  private async audit(
    request: FastifyRequest,
    action: string,
    entityType: string,
    entityId: string,
    changes?: Record<string, unknown>
  ): Promise<void> {
    await writeAuditLog(request, {
      action: `commerce.${action}`,
      entityType,
      entityId,
      changes,
    });
  }

  // ===========================================================================
  // Idempotency Helper
  // ===========================================================================

  private async checkIdempotency<T>(key: string): Promise<T | null> {
    const cached = await this.redis.get(`${IDEMPOTENCY_PREFIX}${key}`);
    if (cached) {
      try {
        return JSON.parse(cached) as T;
      } catch {
        return null;
      }
    }
    return null;
  }

  private async setIdempotency<T>(key: string, value: T): Promise<void> {
    await this.redis.setex(
      `${IDEMPOTENCY_PREFIX}${key}`,
      IDEMPOTENCY_TTL,
      JSON.stringify(value)
    );
  }

  // ===========================================================================
  // Utilities Services
  // ===========================================================================

  async getUtilityProviders(
    query: UtilityProviderQuery
  ): Promise<ServiceResponse<UtilityProvider[]>> {
    const provider = getUtilitiesProvider();
    const result = await provider.getProvidersByAddress(query);
    return toServiceResponse(result);
  }

  async createUtilitySetup(
    request: FastifyRequest,
    data: {
      leaseId: string;
      utilityType: UtilityType;
      provider?: string;
      transferDate: Date;
    }
  ): Promise<ServiceResponse<ConciergeTicket>> {
    if (!request.user) {
      return { success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } };
    }

    // Verify lease ownership
    const lease = await prisma.lease.findUnique({
      where: { id: data.leaseId },
      include: { unit: { include: { property: true } } },
    });

    if (!lease) {
      return { success: false, error: { code: 'NOT_FOUND', message: 'Lease not found' } };
    }

    if (lease.tenantId !== request.user.id) {
      return { success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } };
    }

    const ticketRequest: ConciergeTicketRequest = {
      userId: request.user.id,
      leaseId: data.leaseId,
      utilityType: data.utilityType,
      provider: data.provider,
      address: typeof lease.unit.property.address === 'string'
        ? lease.unit.property.address
        : JSON.stringify(lease.unit.property.address),
      transferDate: data.transferDate,
    };

    const provider = getUtilitiesProvider();
    const result = await provider.startConciergeTicket(ticketRequest);

    if (result.success && result.data) {
      await this.audit(request, 'utility_setup_created', 'utility', result.data.id, {
        leaseId: data.leaseId,
        utilityType: data.utilityType,
      });
    }

    return toServiceResponse(result);
  }

  // ===========================================================================
  // Moving Services
  // ===========================================================================

  async getMovingQuotes(
    request: FastifyRequest,
    data: {
      leaseId: string;
      originAddress: Address;
      moveDate: Date;
      estimatedItems: 'STUDIO' | 'ONE_BEDROOM' | 'TWO_BEDROOM' | 'THREE_PLUS';
      needsPacking: boolean;
      hasElevator: boolean;
      floorNumber?: number;
    }
  ): Promise<ServiceResponse<MovingQuote[]>> {
    if (!request.user) {
      return { success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } };
    }

    const lease = await prisma.lease.findUnique({
      where: { id: data.leaseId },
      include: { unit: { include: { property: true } } },
    });

    if (!lease || lease.tenantId !== request.user.id) {
      return { success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } };
    }

    // Parse destination address from property
    const propertyAddress = lease.unit.property.address;
    const destinationAddress: Address = typeof propertyAddress === 'object' && propertyAddress !== null
      ? propertyAddress as Address
      : {
          street: String(propertyAddress || ''),
          city: '',
          state: '',
          zipCode: '',
        };

    const quoteRequest: MovingQuoteRequest = {
      userId: request.user.id,
      leaseId: data.leaseId,
      originAddress: data.originAddress,
      destinationAddress,
      moveDate: data.moveDate,
      estimatedItems: data.estimatedItems,
      needsPacking: data.needsPacking,
      hasElevator: data.hasElevator,
      floorNumber: data.floorNumber,
    };

    const provider = getMovingProvider();
    const result = await provider.getQuotes(quoteRequest);

    return toServiceResponse(result);
  }

  async bookMovingService(
    request: FastifyRequest,
    data: { quoteId: string; paymentMethodId: string; specialInstructions?: string }
  ): Promise<ServiceResponse<MovingBooking>> {
    if (!request.user) {
      return { success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } };
    }

    const bookingRequest: MovingBookingRequest = {
      userId: request.user.id,
      quoteId: data.quoteId,
      paymentMethodId: data.paymentMethodId,
      specialInstructions: data.specialInstructions,
    };

    const provider = getMovingProvider();
    const result = await provider.bookMove(bookingRequest);

    if (result.success && result.data) {
      await this.audit(request, 'moving_booked', 'moving_booking', result.data.id, {
        quoteId: data.quoteId,
        company: result.data.company,
        price: result.data.price,
      });
    }

    return toServiceResponse(result);
  }

  // ===========================================================================
  // Insurance Services
  // ===========================================================================

  async getInsuranceQuotes(
    request: FastifyRequest,
    data: {
      leaseId: string;
      coverageAmount: number;
      liabilityCoverage: number;
      deductible: number;
      startDate?: Date;
    }
  ): Promise<ServiceResponse<InsuranceQuote[]>> {
    if (!request.user) {
      return { success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } };
    }

    const lease = await prisma.lease.findUnique({
      where: { id: data.leaseId },
      include: { unit: { include: { property: true } } },
    });

    if (!lease || lease.tenantId !== request.user.id) {
      return { success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } };
    }

    const propertyAddress = lease.unit.property.address;
    const address: Address = typeof propertyAddress === 'object' && propertyAddress !== null
      ? propertyAddress as Address
      : {
          street: String(propertyAddress || ''),
          city: '',
          state: '',
          zipCode: '',
        };

    const quoteRequest: InsuranceQuoteRequest = {
      userId: request.user.id,
      leaseId: data.leaseId,
      propertyAddress: address,
      coverageAmount: data.coverageAmount,
      liabilityCoverage: data.liabilityCoverage,
      deductible: data.deductible,
      startDate: data.startDate || new Date(),
    };

    const provider = getInsuranceProvider();
    const result = await provider.quotePolicy(quoteRequest);

    return toServiceResponse(result);
  }

  async purchaseInsurance(
    request: FastifyRequest,
    data: { quoteId: string; leaseId: string; paymentMethodId: string; autoRenew?: boolean }
  ): Promise<ServiceResponse<InsurancePolicy>> {
    if (!request.user) {
      return { success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } };
    }

    // Verify lease ownership
    const lease = await prisma.lease.findUnique({
      where: { id: data.leaseId },
    });

    if (!lease || lease.tenantId !== request.user.id) {
      return { success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } };
    }

    const purchaseRequest: InsurancePurchaseRequest = {
      userId: request.user.id,
      quoteId: data.quoteId,
      leaseId: data.leaseId,
      paymentMethodId: data.paymentMethodId,
      autoRenew: data.autoRenew,
    };

    const provider = getInsuranceProvider();
    const result = await provider.purchasePolicy(purchaseRequest);

    if (result.success && result.data) {
      // Also persist to our database
      try {
        await prisma.rentersInsurance.create({
          data: {
            id: result.data.id,
            tenantId: request.user.id,
            userId: request.user.id,
            leaseId: data.leaseId,
            provider: result.data.provider,
            policyNumber: result.data.policyNumber,
            coverageAmount: result.data.coverageAmount,
            liabilityCoverageAmount: result.data.liabilityCoverage,
            deductibleAmount: result.data.deductible,
            deductible: result.data.deductible,
            monthlyPremiumAmount: Math.round(result.data.monthlyPremium * 100),
            annualPremiumAmount: Math.round(result.data.annualPremium * 100),
            status: result.data.status.toLowerCase(),
            effectiveDate: result.data.startDate,
            expirationDate: result.data.endDate,
            certificateUrl: result.data.certificateUrl,
            autoRenew: result.data.autoRenew,
          },
        });
      } catch (e) {
        logger.error({ err: e }, 'Failed to persist insurance policy to database');
      }

      await this.audit(request, 'insurance_purchased', 'insurance_policy', result.data.id, {
        provider: result.data.provider,
        policyNumber: result.data.policyNumber,
        coverageAmount: result.data.coverageAmount,
      });
    }

    return toServiceResponse(result);
  }

  // ===========================================================================
  // Guarantor Services
  // ===========================================================================

  async getGuarantorOptions(monthlyRent: number): Promise<ServiceResponse<GuarantorOption[]>> {
    const provider = getGuarantorProvider();
    const result = await provider.getOptions(monthlyRent);
    return toServiceResponse(result);
  }

  async submitGuarantorApplication(
    request: FastifyRequest,
    data: {
      applicationId: string;
      leaseId: string;
      optionId: string;
      monthlyRent: number;
      annualIncome: number;
    }
  ): Promise<ServiceResponse<GuarantorApplication>> {
    if (!request.user) {
      return { success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } };
    }

    const appRequest: GuarantorApplicationRequest = {
      userId: request.user.id,
      leaseId: data.leaseId,
      applicationId: data.applicationId,
      optionId: data.optionId,
      monthlyRent: data.monthlyRent,
      annualIncome: data.annualIncome,
    };

    const provider = getGuarantorProvider();
    const result = await provider.submitApplication(appRequest);

    if (result.success && result.data) {
      // Persist to database
      try {
        const lease = await prisma.lease.findUnique({ where: { id: data.leaseId } });
        if (lease) {
          await prisma.guarantorProduct.create({
            data: {
              id: result.data.id,
              leaseId: data.leaseId,
              tenantId: lease.tenantId,
              userId: request.user.id,
              applicationId: data.applicationId,
              provider: result.data.provider.toUpperCase().replace(' ', '_'),
              guaranteeAmount: result.data.coverageAmount,
              monthlyPremiumAmount: Math.round(result.data.feeAmount / 12),
              status: result.data.status.toLowerCase(),
              applicationDate: new Date(),
              providerApplicationId: result.data.providerApplicationId,
            },
          });
        }
      } catch (e) {
        logger.error({ err: e }, 'Failed to persist guarantor application to database');
      }

      await this.audit(request, 'guarantor_applied', 'guarantor_application', result.data.id, {
        provider: result.data.provider,
        optionId: data.optionId,
        coverageAmount: result.data.coverageAmount,
      });
    }

    return toServiceResponse(result);
  }

  async pollGuarantorStatus(applicationId: string): Promise<ServiceResponse<GuarantorApplication | null>> {
    const provider = getGuarantorProvider();
    const result = await provider.pollStatus(applicationId);
    return toServiceResponse(result);
  }

  // ===========================================================================
  // Vendor Marketplace
  // ===========================================================================

  async listVendors(filters: {
    category?: string;
    search?: string;
    serviceArea?: string;
    minRating?: number;
    limit?: number;
    offset?: number;
  }): Promise<ServiceResponse<any[]>> {
    const { category, search, serviceArea, minRating, limit = 20, offset = 0 } = filters;

    const where: any = {};

    if (category) {
      where.categories = { has: category };
    }

    if (search) {
      where.OR = [
        { companyName: { contains: search, mode: 'insensitive' } },
        { services: { has: search } },
      ];
    }

    if (serviceArea) {
      where.serviceAreas = { has: serviceArea };
    }

    if (minRating) {
      where.averageRating = { gte: minRating };
    }

    try {
      const vendors = await prisma.vendor.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: [{ averageRating: 'desc' }, { reviewCount: 'desc' }],
        select: {
          id: true,
          companyName: true,
          categories: true,
          services: true,
          serviceAreas: true,
          averageRating: true,
          reviewCount: true,
          website: true,
          phone: true,
          isLicensed: true,
          isInsured: true,
        },
      });

      return {
        success: true,
        data: vendors,
        meta: { provider: 'prisma', isMock: false, requestId: generatePrefixedId('req') },
      };
    } catch (e) {
      // Fallback to mock data if Prisma fails (table doesn't exist, etc.)
      logger.warn({ err: e }, 'Vendor query failed, returning mock data');
      return {
        success: true,
        data: [
          {
            id: 'vendor-1',
            companyName: 'NYC Furniture Outlet',
            categories: ['FURNITURE'],
            averageRating: 4.7,
            reviewCount: 156,
          },
          {
            id: 'vendor-2',
            companyName: 'Home Essentials Plus',
            categories: ['HOME_GOODS'],
            averageRating: 4.5,
            reviewCount: 89,
          },
          {
            id: 'vendor-3',
            companyName: 'CleanStart Services',
            categories: ['CLEANING'],
            averageRating: 4.9,
            reviewCount: 234,
          },
        ],
        meta: { provider: 'mock', isMock: true, requestId: generatePrefixedId('req') },
      };
    }
  }

  async getVendorProducts(
    vendorId: string,
    filters?: { category?: string; limit?: number }
  ): Promise<ServiceResponse<any[]>> {
    // Mock products for now - would be from product catalog
    const products = [
      {
        id: 'prod-1',
        vendorId,
        name: 'Move-In Cleaning Package',
        description: 'Deep cleaning for your new apartment',
        price: 14999, // cents
        currency: 'USD',
        category: 'SERVICES',
        inStock: true,
      },
      {
        id: 'prod-2',
        vendorId,
        name: 'Essential Kitchen Set',
        description: 'Pots, pans, and utensils to get started',
        price: 8999,
        currency: 'USD',
        category: 'HOME_GOODS',
        inStock: true,
      },
      {
        id: 'prod-3',
        vendorId,
        name: 'Basic Furniture Package',
        description: 'Bed, dresser, and nightstand',
        price: 49999,
        currency: 'USD',
        category: 'FURNITURE',
        inStock: true,
      },
    ];

    const filtered = filters?.category
      ? products.filter((p) => p.category === filters.category)
      : products;

    return {
      success: true,
      data: filtered.slice(0, filters?.limit || 20),
      meta: { provider: 'mock', isMock: true, requestId: generatePrefixedId('req') },
    };
  }

  // ===========================================================================
  // Order State Machine
  // ===========================================================================

  async createOrder(
    request: FastifyRequest,
    data: CreateOrderRequest
  ): Promise<ServiceResponse<Order>> {
    if (!request.user) {
      return { success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } };
    }

    // Check idempotency
    const existing = await this.checkIdempotency<Order>(data.idempotencyKey);
    if (existing) {
      return { success: true, data: existing };
    }

    // Calculate totals
    const items: OrderItem[] = data.items.map((item, index) => ({
      id: `${generatePrefixedId('itm')}-${index}`,
      ...item,
    }));

    const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
    const tax = Math.round(subtotal * 0.08875); // NYC tax rate
    const total = subtotal + tax;

    const order: Order = {
      id: generatePrefixedId('ord'),
      userId: data.userId,
      type: data.type,
      status: 'DRAFT',
      items,
      subtotal,
      tax,
      total,
      currency: 'USD',
      vendorId: data.vendorId,
      partnerId: data.partnerId,
      deliveryAddress: data.deliveryAddress,
      deliveryDate: data.deliveryDate,
      idempotencyKey: data.idempotencyKey,
      orderNumber: `ORD-${Date.now().toString(36).toUpperCase()}`,
      notes: data.notes,
      metadata: data.metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    orderStore.set(order.id, order);
    await this.setIdempotency(data.idempotencyKey, order);

    await this.audit(request, 'order_created', 'order', order.id, {
      type: order.type,
      total: order.total,
      itemCount: order.items.length,
    });

    return {
      success: true,
      data: order,
      meta: { provider: 'internal', isMock: false, requestId: generatePrefixedId('req') },
    };
  }

  async confirmOrder(
    request: FastifyRequest,
    data: ConfirmOrderRequest
  ): Promise<ServiceResponse<Order>> {
    if (!request.user) {
      return { success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } };
    }

    // Check idempotency
    const existing = await this.checkIdempotency<Order>(`confirm:${data.idempotencyKey}`);
    if (existing) {
      return { success: true, data: existing };
    }

    const order = orderStore.get(data.orderId);
    if (!order) {
      return { success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } };
    }

    if (order.userId !== request.user.id) {
      return { success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } };
    }

    // Validate state transition
    const validTransitions = ORDER_TRANSITIONS[order.status];
    if (!validTransitions.includes('CONFIRMED')) {
      return {
        success: false,
        error: { code: 'INVALID_STATE', message: `Cannot confirm order in ${order.status} status` },
      };
    }

    order.status = 'CONFIRMED';
    order.paymentIntentId = data.paymentIntentId;
    order.confirmedAt = new Date();
    order.updatedAt = new Date();

    orderStore.set(order.id, order);
    await this.setIdempotency(`confirm:${data.idempotencyKey}`, order);

    await this.audit(request, 'order_confirmed', 'order', order.id, {
      paymentIntentId: data.paymentIntentId,
      total: order.total,
    });

    return {
      success: true,
      data: order,
      meta: { provider: 'internal', isMock: false, requestId: generatePrefixedId('req') },
    };
  }

  async fulfillOrder(request: FastifyRequest, orderId: string): Promise<ServiceResponse<Order>> {
    const order = orderStore.get(orderId);
    if (!order) {
      return { success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } };
    }

    const validTransitions = ORDER_TRANSITIONS[order.status];
    if (!validTransitions.includes('FULFILLED')) {
      return {
        success: false,
        error: { code: 'INVALID_STATE', message: `Cannot fulfill order in ${order.status} status` },
      };
    }

    order.status = 'FULFILLED';
    order.fulfilledAt = new Date();
    order.updatedAt = new Date();

    orderStore.set(order.id, order);

    await this.audit(request, 'order_fulfilled', 'order', order.id, {
      fulfilledAt: order.fulfilledAt,
    });

    return {
      success: true,
      data: order,
      meta: { provider: 'internal', isMock: false, requestId: generatePrefixedId('req') },
    };
  }

  async cancelOrder(
    request: FastifyRequest,
    orderId: string,
    reason?: string
  ): Promise<ServiceResponse<Order>> {
    if (!request.user) {
      return { success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } };
    }

    const order = orderStore.get(orderId);
    if (!order) {
      return { success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } };
    }

    if (order.userId !== request.user.id) {
      return { success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } };
    }

    const validTransitions = ORDER_TRANSITIONS[order.status];
    if (!validTransitions.includes('CANCELLED')) {
      return {
        success: false,
        error: { code: 'INVALID_STATE', message: `Cannot cancel order in ${order.status} status` },
      };
    }

    order.status = 'CANCELLED';
    order.cancelledAt = new Date();
    order.updatedAt = new Date();
    order.metadata = { ...order.metadata, cancelReason: reason };

    orderStore.set(order.id, order);

    await this.audit(request, 'order_cancelled', 'order', order.id, {
      reason,
      cancelledAt: order.cancelledAt,
    });

    return {
      success: true,
      data: order,
      meta: { provider: 'internal', isMock: false, requestId: generatePrefixedId('req') },
    };
  }

  async getOrder(orderId: string, userId: string): Promise<ServiceResponse<Order | null>> {
    const order = orderStore.get(orderId);
    if (!order) {
      return { success: true, data: null };
    }

    if (order.userId !== userId) {
      return { success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } };
    }

    return { success: true, data: order };
  }

  // ===========================================================================
  // Provider Status
  // ===========================================================================

  getProviderStatus(): Record<string, { provider: string; isMock: boolean }> {
    return getCommerceProviderRegistry().getProviderStatus();
  }
}
