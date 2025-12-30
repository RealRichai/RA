/**
 * Commerce Provider Types
 *
 * Defines contracts for all commerce provider integrations:
 * - Utilities (electric, gas, internet)
 * - Moving services
 * - Insurance (renters)
 * - Guarantor services
 * - Marketplace vendors
 */

import { z } from 'zod';

// =============================================================================
// Common Types
// =============================================================================

export type CommerceProviderType = 'utilities' | 'moving' | 'insurance' | 'guarantor' | 'vendor';

export interface ProviderMeta {
  provider: string;
  isMock: boolean;
  requestId: string;
  timestamp: Date;
}

export interface Result<T, E = Error> {
  success: boolean;
  data?: T;
  error?: E;
  meta?: ProviderMeta;
}

export function ok<T>(data: T, meta?: ProviderMeta): Result<T> {
  return { success: true, data, meta };
}

export function err<E>(error: E, meta?: ProviderMeta): Result<never, E> {
  return { success: false, error, meta };
}

// =============================================================================
// Utilities Provider Types
// =============================================================================

export const UtilityTypeEnum = z.enum([
  'ELECTRIC',
  'GAS',
  'WATER',
  'INTERNET',
  'CABLE',
  'TRASH',
]);
export type UtilityType = z.infer<typeof UtilityTypeEnum>;

export interface UtilityProvider {
  id: string;
  name: string;
  types: UtilityType[];
  website: string;
  phone: string;
  logoUrl?: string;
  averageSetupTime?: string;
}

export interface UtilityProviderQuery {
  zipCode: string;
  utilityType?: UtilityType;
  state?: string;
}

export interface ConciergeTicket {
  id: string;
  userId: string;
  leaseId: string;
  utilityType: UtilityType;
  provider?: string;
  address: string;
  transferDate: Date;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  providerReferenceId?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConciergeTicketRequest {
  userId: string;
  leaseId: string;
  utilityType: UtilityType;
  provider?: string;
  address: string;
  transferDate: Date;
  notes?: string;
}

export interface IUtilitiesProvider {
  readonly providerId: string;
  getProvidersByAddress(query: UtilityProviderQuery): Promise<Result<UtilityProvider[]>>;
  startConciergeTicket(request: ConciergeTicketRequest): Promise<Result<ConciergeTicket>>;
  getTicketStatus(ticketId: string): Promise<Result<ConciergeTicket | null>>;
}

// =============================================================================
// Moving Provider Types
// =============================================================================

export const MoveSizeEnum = z.enum(['STUDIO', 'ONE_BEDROOM', 'TWO_BEDROOM', 'THREE_PLUS']);
export type MoveSize = z.infer<typeof MoveSizeEnum>;

export interface Address {
  street: string;
  unit?: string;
  city: string;
  state: string;
  zipCode: string;
}

export interface MovingQuoteRequest {
  userId: string;
  leaseId: string;
  originAddress: Address;
  destinationAddress: Address;
  moveDate: Date;
  estimatedItems: MoveSize;
  needsPacking: boolean;
  hasElevator: boolean;
  floorNumber?: number;
}

export interface MovingQuote {
  id: string;
  company: string;
  companyId: string;
  price: number;
  currency: string;
  duration: string;
  rating: number;
  reviews: number;
  includes: string[];
  validUntil: Date;
}

export interface MovingBookingRequest {
  userId: string;
  quoteId: string;
  paymentMethodId: string;
  specialInstructions?: string;
}

export interface MovingBooking {
  id: string;
  quoteId: string;
  companyId: string;
  company: string;
  status: 'CONFIRMED' | 'PENDING' | 'CANCELLED';
  confirmationCode: string;
  moveDate: Date;
  price: number;
  estimatedArrival?: string;
  contactPhone?: string;
  createdAt: Date;
}

export interface IMovingProvider {
  readonly providerId: string;
  getQuotes(request: MovingQuoteRequest): Promise<Result<MovingQuote[]>>;
  bookMove(request: MovingBookingRequest): Promise<Result<MovingBooking>>;
  getBookingStatus(bookingId: string): Promise<Result<MovingBooking | null>>;
  cancelBooking(bookingId: string, reason?: string): Promise<Result<{ refundAmount: number }>>;
}

// =============================================================================
// Insurance Provider Types
// =============================================================================

export interface InsuranceQuoteRequest {
  userId: string;
  leaseId: string;
  propertyAddress: Address;
  coverageAmount: number;
  liabilityCoverage: number;
  deductible: number;
  startDate: Date;
  pets?: { type: string; breed: string }[];
  valuableItems?: { description: string; value: number }[];
}

export interface InsuranceQuote {
  id: string;
  provider: string;
  providerId: string;
  monthlyPremium: number;
  annualPremium: number;
  coverageAmount: number;
  liabilityCoverage: number;
  deductible: number;
  features: string[];
  rating: number;
  validUntil: Date;
}

export interface InsurancePurchaseRequest {
  userId: string;
  quoteId: string;
  leaseId: string;
  paymentMethodId: string;
  autoRenew?: boolean;
}

export interface InsurancePolicy {
  id: string;
  provider: string;
  policyNumber: string;
  status: 'ACTIVE' | 'PENDING' | 'CANCELLED' | 'EXPIRED';
  coverageAmount: number;
  liabilityCoverage: number;
  deductible: number;
  monthlyPremium: number;
  annualPremium: number;
  startDate: Date;
  endDate: Date;
  certificateUrl?: string;
  autoRenew: boolean;
  createdAt: Date;
}

export interface IInsuranceProvider {
  readonly providerId: string;
  quotePolicy(request: InsuranceQuoteRequest): Promise<Result<InsuranceQuote[]>>;
  purchasePolicy(request: InsurancePurchaseRequest): Promise<Result<InsurancePolicy>>;
  getPolicyStatus(policyId: string): Promise<Result<InsurancePolicy | null>>;
  cancelPolicy(policyId: string, reason?: string): Promise<Result<{ refundAmount: number }>>;
}

// =============================================================================
// Guarantor Provider Types
// =============================================================================

export interface GuarantorOption {
  id: string;
  provider: string;
  providerId: string;
  name: string;
  coverageMultiple: number;
  feePercentage: number;
  oneTimeFee?: number;
  description: string;
  requirements: string[];
}

export interface GuarantorApplicationRequest {
  userId: string;
  leaseId: string;
  applicationId: string;
  optionId: string;
  monthlyRent: number;
  annualIncome: number;
  creditScore?: number;
  employmentInfo?: {
    employer: string;
    position: string;
    startDate: Date;
  };
}

export interface GuarantorApplication {
  id: string;
  provider: string;
  providerId: string;
  status: 'PENDING' | 'APPROVED' | 'DECLINED' | 'DOCUMENTS_REQUIRED';
  applicationId: string;
  providerApplicationId?: string;
  coverageAmount: number;
  feeAmount: number;
  decisionDate?: Date;
  declineReason?: string;
  requiredDocuments?: string[];
  contractUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IGuarantorProvider {
  readonly providerId: string;
  getOptions(monthlyRent: number): Promise<Result<GuarantorOption[]>>;
  submitApplication(request: GuarantorApplicationRequest): Promise<Result<GuarantorApplication>>;
  pollStatus(applicationId: string): Promise<Result<GuarantorApplication | null>>;
  cancelApplication(applicationId: string): Promise<Result<boolean>>;
}

// =============================================================================
// Order State Machine Types
// =============================================================================

export const OrderStatusEnum = z.enum([
  'DRAFT',
  'QUOTED',
  'CONFIRMED',
  'PROCESSING',
  'FULFILLED',
  'FAILED',
  'CANCELLED',
  'REFUNDED',
]);
export type OrderStatus = z.infer<typeof OrderStatusEnum>;

export const OrderTypeEnum = z.enum([
  'VENDOR_PRODUCT',
  'MOVING_SERVICE',
  'INSURANCE_POLICY',
  'GUARANTOR_SERVICE',
  'UTILITY_SETUP',
]);
export type OrderType = z.infer<typeof OrderTypeEnum>;

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  metadata?: Record<string, unknown>;
}

export interface Order {
  id: string;
  userId: string;
  type: OrderType;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
  vendorId?: string;
  partnerId?: string;
  partnerCommission?: number;
  deliveryAddress?: Address;
  deliveryDate?: Date;
  idempotencyKey: string;
  paymentIntentId?: string;
  orderNumber: string;
  notes?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  confirmedAt?: Date;
  fulfilledAt?: Date;
  cancelledAt?: Date;
}

export interface CreateOrderRequest {
  userId: string;
  type: OrderType;
  items: Omit<OrderItem, 'id'>[];
  vendorId?: string;
  partnerId?: string;
  deliveryAddress?: Address;
  deliveryDate?: Date;
  idempotencyKey: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export interface ConfirmOrderRequest {
  orderId: string;
  paymentIntentId: string;
  idempotencyKey: string;
}

// Valid state transitions
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ['QUOTED', 'CANCELLED'],
  QUOTED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['FULFILLED', 'FAILED'],
  FULFILLED: ['REFUNDED'],
  FAILED: ['DRAFT', 'CANCELLED'],
  CANCELLED: [],
  REFUNDED: [],
};
