import type {
  VendorProvider,
  SearchVendorsRequest,
  SearchVendorsResponse,
  SearchProductsRequest,
  SearchProductsResponse,
  CreateOrderRequest,
  VendorOrder,
  VendorProduct,
  Vendor,
  VendorCategory,
} from '../contracts/vendor';
import type { ProviderError } from '../types/errors';
import type { Result } from '../types/result';
import { success, failure } from '../types/result';
import { BaseMockProvider, SeededRandom, createSeed } from './base';

// ============================================================================
// Mock Data
// ============================================================================

const MOCK_VENDORS: Omit<Vendor, 'vendorId'>[] = [
  {
    name: 'CityFurnish',
    logo: 'https://example.com/cityfurnish-logo.png',
    description: 'Premium furniture rental for urban living',
    categories: ['FURNITURE'],
    rating: 4.7,
    reviewCount: 1243,
    serviceAreas: ['10001', '10002', '10003', '10011', '10012'],
    isActive: true,
  },
  {
    name: 'ApplianceDirect',
    logo: 'https://example.com/appliancedirect-logo.png',
    description: 'Quality appliances delivered to your door',
    categories: ['APPLIANCES'],
    rating: 4.5,
    reviewCount: 892,
    serviceAreas: ['10001', '10002', '10003', '10011', '10012', '10013'],
    isActive: true,
  },
  {
    name: 'SparkleClean NYC',
    logo: 'https://example.com/sparkleclean-logo.png',
    description: 'Professional cleaning services for homes and apartments',
    categories: ['CLEANING'],
    rating: 4.8,
    reviewCount: 2156,
    serviceAreas: ['10001', '10002', '10003', '10011', '10012', '10013', '10014'],
    isActive: true,
  },
  {
    name: 'HomeStyle Decor',
    logo: 'https://example.com/homestyle-logo.png',
    description: 'Interior design and furnishing packages',
    categories: ['FURNISHING', 'FURNITURE'],
    rating: 4.6,
    reviewCount: 567,
    serviceAreas: ['10001', '10002', '10003'],
    isActive: true,
  },
  {
    name: 'SafeHome Security',
    logo: 'https://example.com/safehome-logo.png',
    description: 'Smart home security systems and monitoring',
    categories: ['SECURITY'],
    rating: 4.4,
    reviewCount: 789,
    serviceAreas: ['10001', '10002', '10003', '10011', '10012', '10013', '10014', '10015'],
    isActive: true,
  },
  {
    name: 'ConnectNYC',
    logo: 'https://example.com/connectnyc-logo.png',
    description: 'Internet and TV installation services',
    categories: ['INTERNET_TV'],
    rating: 4.2,
    reviewCount: 1567,
    serviceAreas: ['10001', '10002', '10003', '10011', '10012', '10013', '10014', '10015', '10016'],
    isActive: true,
  },
  {
    name: 'StoreIt Solutions',
    logo: 'https://example.com/storeit-logo.png',
    description: 'Flexible storage solutions for any need',
    categories: ['STORAGE'],
    rating: 4.3,
    reviewCount: 432,
    serviceAreas: ['10001', '10002', '10003', '10011'],
    isActive: true,
  },
  {
    name: 'HandyFix Pro',
    logo: 'https://example.com/handyfix-logo.png',
    description: 'Home improvement and repair services',
    categories: ['HOME_IMPROVEMENT'],
    rating: 4.6,
    reviewCount: 923,
    serviceAreas: ['10001', '10002', '10003', '10011', '10012'],
    isActive: true,
  },
];

const MOCK_PRODUCTS: Omit<VendorProduct, 'productId' | 'vendorId'>[] = [
  // Furniture
  {
    name: 'Modern Sofa Set',
    description: 'Contemporary 3-piece sofa set in grey fabric',
    category: 'FURNITURE',
    serviceType: 'RENTAL',
    images: ['https://example.com/sofa1.jpg', 'https://example.com/sofa2.jpg'],
    price: { amount: 1299, currency: 'USD' },
    rentalPriceMonthly: { amount: 89, currency: 'USD' },
    inStock: true,
    leadTimeDays: 3,
    dimensions: { width: 84, height: 34, depth: 36, unit: 'in' },
  },
  {
    name: 'Queen Bed Frame',
    description: 'Upholstered queen bed frame with headboard',
    category: 'FURNITURE',
    serviceType: 'RENTAL',
    images: ['https://example.com/bed1.jpg'],
    price: { amount: 899, currency: 'USD' },
    rentalPriceMonthly: { amount: 59, currency: 'USD' },
    inStock: true,
    leadTimeDays: 5,
    dimensions: { width: 64, height: 48, depth: 84, unit: 'in' },
  },
  {
    name: 'Dining Table Set',
    description: 'Modern dining table with 4 chairs',
    category: 'FURNITURE',
    serviceType: 'RENTAL',
    images: ['https://example.com/dining1.jpg'],
    price: { amount: 799, currency: 'USD' },
    rentalPriceMonthly: { amount: 49, currency: 'USD' },
    inStock: true,
    leadTimeDays: 3,
  },
  // Appliances
  {
    name: 'Stainless Steel Refrigerator',
    description: 'French door refrigerator with ice maker',
    category: 'APPLIANCES',
    serviceType: 'PURCHASE',
    images: ['https://example.com/fridge1.jpg'],
    price: { amount: 1899, currency: 'USD' },
    inStock: true,
    leadTimeDays: 7,
    dimensions: { width: 36, height: 70, depth: 34, unit: 'in' },
  },
  {
    name: 'Front Load Washer',
    description: 'Energy efficient front load washing machine',
    category: 'APPLIANCES',
    serviceType: 'PURCHASE',
    images: ['https://example.com/washer1.jpg'],
    price: { amount: 899, currency: 'USD' },
    inStock: true,
    leadTimeDays: 5,
  },
  // Cleaning
  {
    name: 'Move-In Deep Clean',
    description: 'Comprehensive deep cleaning for new apartments',
    category: 'CLEANING',
    serviceType: 'ONE_TIME_SERVICE',
    images: ['https://example.com/cleaning1.jpg'],
    price: { amount: 299, currency: 'USD' },
    inStock: true,
    durationMinutes: 240,
    includesItems: ['Kitchen deep clean', 'Bathroom sanitization', 'Floor cleaning', 'Window cleaning'],
  },
  {
    name: 'Weekly Cleaning Service',
    description: 'Regular weekly home cleaning',
    category: 'CLEANING',
    serviceType: 'SUBSCRIPTION',
    images: ['https://example.com/cleaning2.jpg'],
    price: { amount: 149, currency: 'USD' },
    rentalPriceMonthly: { amount: 149, currency: 'USD' },
    inStock: true,
    durationMinutes: 120,
    includesItems: ['Surface cleaning', 'Vacuuming', 'Bathroom cleaning', 'Kitchen cleaning'],
  },
  // Security
  {
    name: 'Smart Home Security Kit',
    description: 'Complete smart security system with cameras and sensors',
    category: 'SECURITY',
    serviceType: 'PURCHASE',
    images: ['https://example.com/security1.jpg'],
    price: { amount: 499, currency: 'USD' },
    setupFee: { amount: 99, currency: 'USD' },
    inStock: true,
    leadTimeDays: 2,
    includesItems: ['2 indoor cameras', '1 doorbell camera', '4 door sensors', 'Base station'],
  },
  {
    name: '24/7 Monitoring Service',
    description: 'Professional security monitoring subscription',
    category: 'SECURITY',
    serviceType: 'SUBSCRIPTION',
    images: ['https://example.com/monitoring1.jpg'],
    price: { amount: 29, currency: 'USD' },
    rentalPriceMonthly: { amount: 29, currency: 'USD' },
    inStock: true,
  },
  // Internet/TV
  {
    name: 'High-Speed Internet Setup',
    description: 'Professional router installation and optimization',
    category: 'INTERNET_TV',
    serviceType: 'ONE_TIME_SERVICE',
    images: ['https://example.com/internet1.jpg'],
    price: { amount: 99, currency: 'USD' },
    inStock: true,
    durationMinutes: 60,
    includesItems: ['Router placement optimization', 'WiFi network setup', 'Speed testing', 'Device connection'],
  },
  // Storage
  {
    name: 'Monthly Storage Unit - Small',
    description: '5x5 climate-controlled storage unit',
    category: 'STORAGE',
    serviceType: 'SUBSCRIPTION',
    images: ['https://example.com/storage1.jpg'],
    price: { amount: 89, currency: 'USD' },
    rentalPriceMonthly: { amount: 89, currency: 'USD' },
    inStock: true,
    dimensions: { width: 60, height: 96, depth: 60, unit: 'in' },
  },
  // Home Improvement
  {
    name: 'TV Wall Mount Installation',
    description: 'Professional TV mounting service',
    category: 'HOME_IMPROVEMENT',
    serviceType: 'ONE_TIME_SERVICE',
    images: ['https://example.com/tvmount1.jpg'],
    price: { amount: 149, currency: 'USD' },
    inStock: true,
    durationMinutes: 90,
    includesItems: ['Wall mount bracket', 'Professional installation', 'Cable concealment'],
  },
];

// ============================================================================
// Mock Vendor Provider
// ============================================================================

export class MockVendorProvider extends BaseMockProvider implements VendorProvider {
  private vendors: Map<string, Vendor> = new Map();
  private products: Map<string, VendorProduct> = new Map();
  private orders: Map<string, VendorOrder> = new Map();

  constructor(options?: { simulateLatency?: boolean; latencyRange?: [number, number] }) {
    super('mock_vendor', 'Mock Vendor Provider', options);
    this.initializeMockData();
  }

  private initializeMockData(): void {
    // Initialize vendors
    MOCK_VENDORS.forEach((v, i) => {
      const vendorId = `vendor_${String(i + 1).padStart(3, '0')}`;
      this.vendors.set(vendorId, { ...v, vendorId });
    });

    // Initialize products with proper vendorId assignments
    let productIndex = 0;
    const vendorsByCategory = new Map<VendorCategory, string[]>();

    for (const [vendorId, vendor] of this.vendors) {
      for (const category of vendor.categories) {
        const existing = vendorsByCategory.get(category) ?? [];
        existing.push(vendorId);
        vendorsByCategory.set(category, existing);
      }
    }

    MOCK_PRODUCTS.forEach((p) => {
      const productId = `product_${String(++productIndex).padStart(4, '0')}`;
      const vendorIds = vendorsByCategory.get(p.category) ?? [];
      const vendorId = vendorIds[productIndex % vendorIds.length] ?? 'vendor_001';
      this.products.set(productId, { ...p, productId, vendorId });
    });
  }

  async searchVendors(
    request: SearchVendorsRequest
  ): Promise<Result<SearchVendorsResponse, ProviderError>> {
    await this.maybeDelay();
    const startTime = Date.now();
    const seed = createSeed(request);

    let vendors = Array.from(this.vendors.values());

    // Filter by service area (check if any zip matches)
    if (request.address.postalCode) {
      vendors = vendors.filter((v) => v.serviceAreas.includes(request.address.postalCode!));
    }

    // Filter by categories
    if (request.categories && request.categories.length > 0) {
      vendors = vendors.filter((v) =>
        v.categories.some((c) => request.categories!.includes(c))
      );
    }

    // Filter by query
    if (request.query) {
      const query = request.query.toLowerCase();
      vendors = vendors.filter(
        (v) =>
          v.name.toLowerCase().includes(query) ||
          v.description?.toLowerCase().includes(query)
      );
    }

    // Filter active only
    vendors = vendors.filter((v) => v.isActive);

    const total = vendors.length;
    const offset = request.offset ?? 0;
    const limit = request.limit ?? 20;

    vendors = vendors.slice(offset, offset + limit);

    return success(
      {
        vendors,
        total,
        hasMore: offset + limit < total,
      },
      this.createMetadata(seed, startTime)
    );
  }

  async searchProducts(
    request: SearchProductsRequest
  ): Promise<Result<SearchProductsResponse, ProviderError>> {
    await this.maybeDelay();
    const startTime = Date.now();
    const seed = createSeed(request);

    let products = Array.from(this.products.values());

    if (request.vendorId) {
      products = products.filter((p) => p.vendorId === request.vendorId);
    }

    if (request.category) {
      products = products.filter((p) => p.category === request.category);
    }

    if (request.serviceType) {
      products = products.filter((p) => p.serviceType === request.serviceType);
    }

    if (request.query) {
      const query = request.query.toLowerCase();
      products = products.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query)
      );
    }

    if (request.minPrice) {
      products = products.filter((p) => p.price.amount >= request.minPrice!.amount);
    }

    if (request.maxPrice) {
      products = products.filter((p) => p.price.amount <= request.maxPrice!.amount);
    }

    if (request.inStockOnly) {
      products = products.filter((p) => p.inStock);
    }

    const total = products.length;
    const offset = request.offset ?? 0;
    const limit = request.limit ?? 20;

    products = products.slice(offset, offset + limit);

    return success(
      {
        products,
        total,
        hasMore: offset + limit < total,
      },
      this.createMetadata(seed, startTime)
    );
  }

  async getProduct(productId: string): Promise<Result<VendorProduct, ProviderError>> {
    await this.maybeDelay();
    const startTime = Date.now();
    const seed = createSeed({ productId });

    const product = this.products.get(productId);
    if (!product) {
      return failure(
        {
          code: 'RESOURCE_NOT_FOUND',
          message: `Product ${productId} not found`,
          retryable: false,
        },
        this.createMetadata(seed, startTime)
      );
    }

    return success(product, this.createMetadata(seed, startTime));
  }

  async createOrder(
    request: CreateOrderRequest
  ): Promise<Result<VendorOrder, ProviderError>> {
    await this.maybeDelay();
    const startTime = Date.now();
    const seed = createSeed(request);
    const rng = new SeededRandom(seed);

    const vendor = this.vendors.get(request.vendorId);
    if (!vendor) {
      return failure(
        {
          code: 'RESOURCE_NOT_FOUND',
          message: `Vendor ${request.vendorId} not found`,
          retryable: false,
        },
        this.createMetadata(seed, startTime)
      );
    }

    // Build order lines
    const lines: VendorOrder['lines'] = [];
    let subtotal = 0;

    for (const item of request.items) {
      const product = this.products.get(item.productId);
      if (!product) {
        return failure(
          {
            code: 'RESOURCE_NOT_FOUND',
            message: `Product ${item.productId} not found`,
            retryable: false,
          },
          this.createMetadata(seed, startTime)
        );
      }

      const unitPrice = item.rentalMonths
        ? (product.rentalPriceMonthly ?? product.price)
        : product.price;
      const lineTotal =
        unitPrice.amount * item.quantity * (item.rentalMonths ?? 1);

      lines.push({
        lineId: rng.nextId('line'),
        product,
        quantity: item.quantity,
        unitPrice,
        lineTotal: { amount: lineTotal, currency: 'USD' },
        rentalMonths: item.rentalMonths,
        scheduledDate: item.scheduledDate,
        scheduledTimeSlot: item.scheduledTimeSlot,
        status: 'PENDING',
      });

      subtotal += lineTotal;
    }

    const deliveryFee = subtotal > 500 ? 0 : 49.99;
    const taxRate = 0.08875; // NYC sales tax
    const taxAmount = subtotal * taxRate;
    const totalAmount = subtotal + deliveryFee + taxAmount;

    const now = new Date();
    const estimatedDelivery = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

    const order: VendorOrder = {
      orderId: rng.nextId('order'),
      confirmationNumber: rng.nextConfirmation(),
      vendorId: vendor.vendorId,
      vendorName: vendor.name,
      status: 'CONFIRMED',
      lines,
      subtotal: { amount: subtotal, currency: 'USD' },
      deliveryFee: { amount: deliveryFee, currency: 'USD' },
      taxAmount: { amount: taxAmount, currency: 'USD' },
      totalAmount: { amount: totalAmount, currency: 'USD' },
      deliveryAddress: request.deliveryAddress,
      estimatedDeliveryDate: estimatedDelivery,
      contact: request.contact,
      createdAt: now,
      updatedAt: now,
    };

    this.orders.set(order.orderId, order);

    return success(order, this.createMetadata(seed, startTime));
  }

  async getOrder(orderId: string): Promise<Result<VendorOrder, ProviderError>> {
    await this.maybeDelay();
    const startTime = Date.now();
    const seed = createSeed({ orderId });

    const order = this.orders.get(orderId);
    if (!order) {
      return failure(
        {
          code: 'RESOURCE_NOT_FOUND',
          message: `Order ${orderId} not found`,
          retryable: false,
        },
        this.createMetadata(seed, startTime)
      );
    }

    return success(order, this.createMetadata(seed, startTime));
  }

  async cancelOrder(
    orderId: string,
    reason?: string
  ): Promise<Result<VendorOrder, ProviderError>> {
    await this.maybeDelay();
    const startTime = Date.now();
    const seed = createSeed({ orderId, reason });

    const order = this.orders.get(orderId);
    if (!order) {
      return failure(
        {
          code: 'RESOURCE_NOT_FOUND',
          message: `Order ${orderId} not found`,
          retryable: false,
        },
        this.createMetadata(seed, startTime)
      );
    }

    if (['DELIVERED', 'COMPLETED', 'CANCELLED', 'REFUNDED'].includes(order.status)) {
      return failure(
        {
          code: 'BUSINESS_RULE_VIOLATION',
          message: `Cannot cancel order in status ${order.status}`,
          retryable: false,
        },
        this.createMetadata(seed, startTime)
      );
    }

    const updatedOrder: VendorOrder = {
      ...order,
      status: 'CANCELLED',
      updatedAt: new Date(),
    };

    this.orders.set(orderId, updatedOrder);

    return success(updatedOrder, this.createMetadata(seed, startTime));
  }

  async getAvailableSlots(
    vendorId: string,
    productId: string,
    date: Date
  ): Promise<Result<string[], ProviderError>> {
    await this.maybeDelay();
    const startTime = Date.now();
    const seed = createSeed({ vendorId, productId, date: date.toISOString() });
    const rng = new SeededRandom(seed);

    const product = this.products.get(productId);
    if (!product) {
      return failure(
        {
          code: 'RESOURCE_NOT_FOUND',
          message: `Product ${productId} not found`,
          retryable: false,
        },
        this.createMetadata(seed, startTime)
      );
    }

    // Generate deterministic available slots based on date
    const allSlots = [
      '08:00-10:00',
      '10:00-12:00',
      '12:00-14:00',
      '14:00-16:00',
      '16:00-18:00',
      '18:00-20:00',
    ];

    // Remove some slots deterministically
    const availableSlots = allSlots.filter(() => rng.next() > 0.3);

    return success(availableSlots, this.createMetadata(seed, startTime));
  }

  // Test helpers
  getVendorCount(): number {
    return this.vendors.size;
  }

  getProductCount(): number {
    return this.products.size;
  }

  getOrderCount(): number {
    return this.orders.size;
  }

  clearOrders(): void {
    this.orders.clear();
  }
}
