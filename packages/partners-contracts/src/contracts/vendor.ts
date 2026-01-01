import { z } from 'zod';

import type { Address, BaseProvider, Contact, Money } from '../types/common';
import { AddressSchema, ContactSchema, MoneySchema } from '../types/common';
import type { ProviderError } from '../types/errors';
import type { Result } from '../types/result';

// ============================================================================
// Vendor Service Types
// ============================================================================

export type VendorCategory =
  | 'FURNITURE'
  | 'APPLIANCES'
  | 'CLEANING'
  | 'FURNISHING'
  | 'HOME_IMPROVEMENT'
  | 'SECURITY'
  | 'INTERNET_TV'
  | 'STORAGE';

export type VendorServiceType =
  | 'PURCHASE'
  | 'RENTAL'
  | 'ONE_TIME_SERVICE'
  | 'SUBSCRIPTION';

export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REFUNDED';

export const VendorCategorySchema = z.enum([
  'FURNITURE',
  'APPLIANCES',
  'CLEANING',
  'FURNISHING',
  'HOME_IMPROVEMENT',
  'SECURITY',
  'INTERNET_TV',
  'STORAGE',
]);

export const VendorServiceTypeSchema = z.enum([
  'PURCHASE',
  'RENTAL',
  'ONE_TIME_SERVICE',
  'SUBSCRIPTION',
]);

export const OrderStatusSchema = z.enum([
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'SCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'REFUNDED',
]);

// ============================================================================
// Vendor & Product Types
// ============================================================================

export interface Vendor {
  vendorId: string;
  name: string;
  logo?: string;
  description?: string;
  categories: VendorCategory[];
  rating?: number;
  reviewCount?: number;
  serviceAreas: string[]; // zip codes or region codes
  isActive: boolean;
}

export const VendorSchema = z.object({
  vendorId: z.string(),
  name: z.string(),
  logo: z.string().url().optional(),
  description: z.string().optional(),
  categories: z.array(VendorCategorySchema),
  rating: z.number().min(0).max(5).optional(),
  reviewCount: z.number().int().nonnegative().optional(),
  serviceAreas: z.array(z.string()),
  isActive: z.boolean(),
});

export interface VendorProduct {
  productId: string;
  vendorId: string;
  name: string;
  description?: string;
  category: VendorCategory;
  serviceType: VendorServiceType;
  images: string[];

  // Pricing
  price: Money;
  rentalPriceMonthly?: Money;
  setupFee?: Money;

  // Availability
  inStock: boolean;
  leadTimeDays?: number;

  // Details
  specifications?: Record<string, string>;
  dimensions?: {
    width: number;
    height: number;
    depth: number;
    unit: 'in' | 'cm';
  };

  // For services
  durationMinutes?: number;
  includesItems?: string[];
}

export const VendorProductSchema = z.object({
  productId: z.string(),
  vendorId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  category: VendorCategorySchema,
  serviceType: VendorServiceTypeSchema,
  images: z.array(z.string().url()),
  price: MoneySchema,
  rentalPriceMonthly: MoneySchema.optional(),
  setupFee: MoneySchema.optional(),
  inStock: z.boolean(),
  leadTimeDays: z.number().int().nonnegative().optional(),
  specifications: z.record(z.string()).optional(),
  dimensions: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    depth: z.number().positive(),
    unit: z.enum(['in', 'cm']),
  }).optional(),
  durationMinutes: z.number().int().positive().optional(),
  includesItems: z.array(z.string()).optional(),
});

// ============================================================================
// Request/Response Types
// ============================================================================

export interface SearchVendorsRequest {
  address: Address;
  categories?: VendorCategory[];
  query?: string;
  limit?: number;
  offset?: number;
}

export const SearchVendorsRequestSchema = z.object({
  address: AddressSchema,
  categories: z.array(VendorCategorySchema).optional(),
  query: z.string().optional(),
  limit: z.number().int().positive().max(100).default(20),
  offset: z.number().int().nonnegative().default(0),
});

export interface SearchVendorsResponse {
  vendors: Vendor[];
  total: number;
  hasMore: boolean;
}

export const SearchVendorsResponseSchema = z.object({
  vendors: z.array(VendorSchema),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});

export interface SearchProductsRequest {
  vendorId?: string;
  category?: VendorCategory;
  serviceType?: VendorServiceType;
  query?: string;
  minPrice?: Money;
  maxPrice?: Money;
  inStockOnly?: boolean;
  limit?: number;
  offset?: number;
}

export const SearchProductsRequestSchema = z.object({
  vendorId: z.string().optional(),
  category: VendorCategorySchema.optional(),
  serviceType: VendorServiceTypeSchema.optional(),
  query: z.string().optional(),
  minPrice: MoneySchema.optional(),
  maxPrice: MoneySchema.optional(),
  inStockOnly: z.boolean().optional(),
  limit: z.number().int().positive().max(100).default(20),
  offset: z.number().int().nonnegative().default(0),
});

export interface SearchProductsResponse {
  products: VendorProduct[];
  total: number;
  hasMore: boolean;
}

export const SearchProductsResponseSchema = z.object({
  products: z.array(VendorProductSchema),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});

export interface OrderItem {
  productId: string;
  quantity: number;
  rentalMonths?: number; // For rental items
  scheduledDate?: Date; // For services
  scheduledTimeSlot?: string; // "09:00-12:00"
  notes?: string;
}

export const OrderItemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().positive(),
  rentalMonths: z.number().int().positive().optional(),
  scheduledDate: z.coerce.date().optional(),
  scheduledTimeSlot: z.string().optional(),
  notes: z.string().optional(),
});

export interface CreateOrderRequest {
  vendorId: string;
  items: OrderItem[];
  deliveryAddress: Address;
  contact: Contact;
  paymentMethodToken?: string;
  promoCode?: string;
  specialInstructions?: string;
}

export const CreateOrderRequestSchema = z.object({
  vendorId: z.string(),
  items: z.array(OrderItemSchema).min(1),
  deliveryAddress: AddressSchema,
  contact: ContactSchema,
  paymentMethodToken: z.string().optional(),
  promoCode: z.string().optional(),
  specialInstructions: z.string().optional(),
});

export interface VendorOrderLine {
  lineId: string;
  product: VendorProduct;
  quantity: number;
  unitPrice: Money;
  lineTotal: Money;
  rentalMonths?: number;
  scheduledDate?: Date;
  scheduledTimeSlot?: string;
  status: OrderStatus;
}

export const VendorOrderLineSchema = z.object({
  lineId: z.string(),
  product: VendorProductSchema,
  quantity: z.number().int().positive(),
  unitPrice: MoneySchema,
  lineTotal: MoneySchema,
  rentalMonths: z.number().int().positive().optional(),
  scheduledDate: z.coerce.date().optional(),
  scheduledTimeSlot: z.string().optional(),
  status: OrderStatusSchema,
});

export interface VendorOrder {
  orderId: string;
  confirmationNumber: string;
  vendorId: string;
  vendorName: string;
  status: OrderStatus;

  // Items
  lines: VendorOrderLine[];

  // Pricing
  subtotal: Money;
  deliveryFee: Money;
  taxAmount: Money;
  discountAmount?: Money;
  totalAmount: Money;

  // Delivery
  deliveryAddress: Address;
  estimatedDeliveryDate?: Date;
  trackingNumber?: string;
  trackingUrl?: string;

  // Contact
  contact: Contact;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  deliveredAt?: Date;
}

export const VendorOrderSchema = z.object({
  orderId: z.string(),
  confirmationNumber: z.string(),
  vendorId: z.string(),
  vendorName: z.string(),
  status: OrderStatusSchema,
  lines: z.array(VendorOrderLineSchema),
  subtotal: MoneySchema,
  deliveryFee: MoneySchema,
  taxAmount: MoneySchema,
  discountAmount: MoneySchema.optional(),
  totalAmount: MoneySchema,
  deliveryAddress: AddressSchema,
  estimatedDeliveryDate: z.coerce.date().optional(),
  trackingNumber: z.string().optional(),
  trackingUrl: z.string().url().optional(),
  contact: ContactSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  deliveredAt: z.coerce.date().optional(),
});

// ============================================================================
// Provider Interface
// ============================================================================

/**
 * Vendor services provider contract
 */
export interface VendorProvider extends BaseProvider {
  /**
   * Search for vendors by location and category
   */
  searchVendors(
    request: SearchVendorsRequest
  ): Promise<Result<SearchVendorsResponse, ProviderError>>;

  /**
   * Search for products/services
   */
  searchProducts(
    request: SearchProductsRequest
  ): Promise<Result<SearchProductsResponse, ProviderError>>;

  /**
   * Get a single product by ID
   */
  getProduct(
    productId: string
  ): Promise<Result<VendorProduct, ProviderError>>;

  /**
   * Create an order
   */
  createOrder(
    request: CreateOrderRequest
  ): Promise<Result<VendorOrder, ProviderError>>;

  /**
   * Get order status
   */
  getOrder(
    orderId: string
  ): Promise<Result<VendorOrder, ProviderError>>;

  /**
   * Cancel an order (if allowed by vendor policy)
   */
  cancelOrder(
    orderId: string,
    reason?: string
  ): Promise<Result<VendorOrder, ProviderError>>;

  /**
   * Get available time slots for service scheduling
   */
  getAvailableSlots(
    vendorId: string,
    productId: string,
    date: Date
  ): Promise<Result<string[], ProviderError>>;
}
