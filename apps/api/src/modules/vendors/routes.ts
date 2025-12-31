import {
  prisma,
  Prisma,
  type VendorInvoiceStatus as PrismaVendorInvoiceStatus,
} from '@realriches/database';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// Types
export type VendorStatus = 'active' | 'inactive' | 'suspended' | 'pending_approval';
export type VendorCategory = 'plumbing' | 'electrical' | 'hvac' | 'general_maintenance' | 'landscaping' | 'cleaning' | 'painting' | 'roofing' | 'appliance_repair' | 'pest_control' | 'locksmith' | 'other';
export type WorkOrderStatus = 'pending' | 'assigned' | 'accepted' | 'in_progress' | 'completed' | 'cancelled' | 'disputed';
export type WorkOrderPriority = 'low' | 'medium' | 'high' | 'emergency';
export type InvoiceStatus = 'draft' | 'submitted' | 'approved' | 'paid' | 'disputed' | 'cancelled';

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  type: 'labor' | 'materials' | 'other';
}

export interface VendorPerformance {
  vendorId: string;
  vendorName: string;
  totalWorkOrders: number;
  completedWorkOrders: number;
  averageCompletionTime: number;
  averageRating: number;
  totalBilled: number;
  onTimeRate: number;
  acceptanceRate: number;
  disputeRate: number;
}

// Helper: convert Decimal to number
function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value) || 0;
}

// Vendor interface for testing
export interface Vendor {
  id: string;
  name: string;
  companyName: string | null;
  email: string;
  phone: string;
  address: string | null;
  categories: string[];
  status: VendorStatus;
  licenseNumber: string | null;
  licenseExpiry: Date | null;
  insuranceProvider: string | null;
  insuranceExpiry: Date | null;
  w9OnFile: boolean;
  hourlyRate: number | null;
  emergencyRate: number | null;
  notes: string | null;
  rating: number | null;
  totalJobs: number;
  completedJobs: number;
  averageResponseTime: number | null;
  preferredProperties: string[];
  createdAt: Date;
  updatedAt: Date;
}

// Exported Map for testing
export const vendors = new Map<string, Vendor>();

// Synchronous findBestVendor for testing (uses Map)
export function findBestVendor(
  category: VendorCategory,
  propertyId: string,
  priority: WorkOrderPriority
): Vendor | null {
  const isEmergency = priority === 'emergency';

  // Filter by category and active status
  const matchingVendors = Array.from(vendors.values()).filter(
    v => v.status === 'active' && v.categories.includes(category)
  );

  if (matchingVendors.length === 0) return null;

  // Score vendors
  const scored = matchingVendors.map(v => {
    let score = v.rating || 3;

    // Prefer vendors with emergency rates for emergency calls
    if (isEmergency && v.emergencyRate) {
      score += 0.5;
    }

    // Prefer vendors with property preference
    if (propertyId && v.preferredProperties?.includes(propertyId)) {
      score += 0.3;
    }

    // Factor in completion rate
    if (v.totalJobs > 0) {
      const completionRate = v.completedJobs / v.totalJobs;
      score += completionRate * 0.2;
    }

    return { vendor: v, score };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.vendor || null;
}

// Async version for production (uses Prisma)
async function findBestVendorAsync(
  category: VendorCategory,
  propertyId?: string,
  isEmergency = false
): Promise<{ id: string; name: string; score: number } | null> {
  const vendorList = await prisma.vendor.findMany({
    where: {
      status: 'active',
      categories: { has: category },
    },
    include: {
      ratings: true,
    },
  });

  if (vendorList.length === 0) return null;

  // Score vendors
  const scored = vendorList.map(v => {
    const avgRating = v.ratings.length > 0
      ? v.ratings.reduce((sum, r) => sum + r.rating, 0) / v.ratings.length
      : 3;

    let score = avgRating;

    // Prefer vendors with emergency rates for emergency calls
    if (isEmergency && v.emergencyRate) {
      score += 0.5;
    }

    // Prefer vendors with property preference
    const preferredProps = v.preferredProperties as string[] || [];
    if (propertyId && preferredProps.includes(propertyId)) {
      score += 0.3;
    }

    return {
      id: v.id,
      name: v.name,
      score,
    };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);
  return scored[0];
}

// Schemas
const createVendorSchema = z.object({
  name: z.string().min(1),
  companyName: z.string().optional(),
  email: z.string().email(),
  phone: z.string().min(10),
  address: z.string().optional(),
  categories: z.array(z.enum(['plumbing', 'electrical', 'hvac', 'general_maintenance', 'landscaping', 'cleaning', 'painting', 'roofing', 'appliance_repair', 'pest_control', 'locksmith', 'other'])).min(1),
  licenseNumber: z.string().optional(),
  licenseExpiry: z.string().datetime().optional(),
  insuranceProvider: z.string().optional(),
  insuranceExpiry: z.string().datetime().optional(),
  hourlyRate: z.number().positive().optional(),
  emergencyRate: z.number().positive().optional(),
  notes: z.string().optional(),
  preferredProperties: z.array(z.string().uuid()).optional(),
});

const updateVendorSchema = z.object({
  name: z.string().min(1).optional(),
  companyName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().min(10).optional(),
  address: z.string().optional(),
  categories: z.array(z.enum(['plumbing', 'electrical', 'hvac', 'general_maintenance', 'landscaping', 'cleaning', 'painting', 'roofing', 'appliance_repair', 'pest_control', 'locksmith', 'other'])).optional(),
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
  licenseNumber: z.string().optional(),
  licenseExpiry: z.string().datetime().optional(),
  insuranceProvider: z.string().optional(),
  insuranceExpiry: z.string().datetime().optional(),
  w9OnFile: z.boolean().optional(),
  hourlyRate: z.number().positive().optional(),
  emergencyRate: z.number().positive().optional(),
  notes: z.string().optional(),
  preferredProperties: z.array(z.string().uuid()).optional(),
});

const createWorkOrderSchema = z.object({
  propertyId: z.string().uuid(),
  unitId: z.string().uuid().optional(),
  vendorId: z.string().uuid().optional(),
  maintenanceRequestId: z.string().uuid().optional(),
  title: z.string().min(1),
  description: z.string().min(1),
  category: z.enum(['plumbing', 'electrical', 'hvac', 'general_maintenance', 'landscaping', 'cleaning', 'painting', 'roofing', 'appliance_repair', 'pest_control', 'locksmith', 'other']),
  priority: z.enum(['low', 'medium', 'high', 'emergency']),
  scheduledDate: z.string().datetime().optional(),
  estimatedCost: z.number().nonnegative().optional(),
  tenantAvailability: z.string().optional(),
  accessInstructions: z.string().optional(),
  createdById: z.string().uuid(),
});

const updateWorkOrderSchema = z.object({
  vendorId: z.string().uuid().optional(),
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  priority: z.enum(['low', 'medium', 'high', 'emergency']).optional(),
  scheduledDate: z.string().datetime().optional(),
  estimatedCost: z.number().nonnegative().optional(),
  notes: z.string().optional(),
  tenantAvailability: z.string().optional(),
  accessInstructions: z.string().optional(),
});

const submitInvoiceSchema = z.object({
  workOrderId: z.string().uuid(),
  invoiceNumber: z.string().min(1),
  description: z.string().min(1),
  lineItems: z.array(z.object({
    description: z.string().min(1),
    quantity: z.number().positive(),
    unitPrice: z.number().nonnegative(),
    type: z.enum(['labor', 'materials', 'other']),
  })).min(1),
  taxRate: z.number().min(0).max(100).default(0),
  dueDate: z.string().datetime(),
  attachments: z.array(z.string().url()).optional(),
  notes: z.string().optional(),
});

const rateVendorSchema = z.object({
  workOrderId: z.string().uuid(),
  rating: z.number().min(1).max(5),
  qualityScore: z.number().min(1).max(5),
  timelinessScore: z.number().min(1).max(5),
  communicationScore: z.number().min(1).max(5),
  valueScore: z.number().min(1).max(5),
  comment: z.string().optional(),
  ratedById: z.string().uuid(),
});

// Helper functions
async function updateVendorStats(vendorId: string): Promise<void> {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor) return;

  const vendorRatings = await prisma.vendorRating.findMany({
    where: { vendorId },
  });

  const vendorWorkOrders = await prisma.workOrder.findMany({
    where: { vendorId },
  });

  const totalJobs = vendorWorkOrders.length;
  const completedJobs = vendorWorkOrders.filter((w) => w.status === 'completed').length;

  let averageRating: number | null = null;
  if (vendorRatings.length > 0) {
    averageRating = vendorRatings.reduce((sum, r) => sum + r.rating, 0) / vendorRatings.length;
    averageRating = Math.round(averageRating * 10) / 10;
  }

  await prisma.vendor.update({
    where: { id: vendorId },
    data: {
      totalJobs,
      completedJobs,
      averageRating,
      reviewCount: vendorRatings.length,
    },
  });
}

// Map internal category to Prisma MaintenanceCategory
function mapToMaintenanceCategory(category: VendorCategory): string {
  const mapping: Record<VendorCategory, string> = {
    plumbing: 'plumbing',
    electrical: 'electrical',
    hvac: 'hvac',
    general_maintenance: 'other',
    landscaping: 'exterior',
    cleaning: 'cleaning',
    painting: 'other',
    roofing: 'exterior',
    appliance_repair: 'appliance',
    pest_control: 'pest_control',
    locksmith: 'locks_keys',
    other: 'other',
  };
  return mapping[category];
}

// Route handlers
export async function vendorRoutes(app: FastifyInstance): Promise<void> {
  // Create vendor
  app.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createVendorSchema.parse(request.body);

    const vendor = await prisma.vendor.create({
      data: {
        companyName: body.companyName || body.name,
        contactName: body.name,
        email: body.email,
        phone: body.phone,
        street1: body.address || null,
        categories: body.categories,
        services: body.categories,
        serviceAreas: [],
        status: 'pending_approval',
        licenseNumber: body.licenseNumber || null,
        licenseExpiry: body.licenseExpiry ? new Date(body.licenseExpiry) : null,
        isInsured: !!body.insuranceProvider,
        insuranceExpiry: body.insuranceExpiry ? new Date(body.insuranceExpiry) : null,
        w9OnFile: false,
        hourlyRateAmount: body.hourlyRate ? Math.round(body.hourlyRate * 100) : null,
        emergencyRateAmount: body.emergencyRate ? Math.round(body.emergencyRate * 100) : null,
        notes: body.notes || null,
        totalJobs: 0,
        completedJobs: 0,
        metadata: body.preferredProperties ? { preferredProperties: body.preferredProperties } : null,
      },
    });

    return reply.status(201).send({
      success: true,
      data: {
        ...vendor,
        hourlyRate: vendor.hourlyRateAmount ? vendor.hourlyRateAmount / 100 : null,
        emergencyRate: vendor.emergencyRateAmount ? vendor.emergencyRateAmount / 100 : null,
      },
    });
  });

  // Get vendor by ID
  app.get('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const vendor = await prisma.vendor.findUnique({
      where: { id },
    });

    if (!vendor) {
      return reply.status(404).send({
        success: false,
        error: 'Vendor not found',
      });
    }

    return reply.send({
      success: true,
      data: {
        ...vendor,
        hourlyRate: vendor.hourlyRateAmount ? vendor.hourlyRateAmount / 100 : null,
        emergencyRate: vendor.emergencyRateAmount ? vendor.emergencyRateAmount / 100 : null,
      },
    });
  });

  // List vendors
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      category?: VendorCategory;
      status?: VendorStatus;
      minRating?: string;
      search?: string;
    };

    const where: Record<string, unknown> = {};

    if (query.category) {
      where.categories = { has: query.category };
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.minRating) {
      where.averageRating = { gte: parseFloat(query.minRating) };
    }
    if (query.search) {
      where.OR = [
        { contactName: { contains: query.search, mode: 'insensitive' } },
        { companyName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const results = await prisma.vendor.findMany({
      where,
      orderBy: { averageRating: 'desc' },
    });

    return reply.send({
      success: true,
      data: results.map((v) => ({
        ...v,
        hourlyRate: v.hourlyRateAmount ? v.hourlyRateAmount / 100 : null,
        emergencyRate: v.emergencyRateAmount ? v.emergencyRateAmount / 100 : null,
      })),
      total: results.length,
    });
  });

  // Update vendor
  app.patch('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = updateVendorSchema.parse(request.body);

    const vendor = await prisma.vendor.findUnique({
      where: { id },
    });

    if (!vendor) {
      return reply.status(404).send({
        success: false,
        error: 'Vendor not found',
      });
    }

    const updated = await prisma.vendor.update({
      where: { id },
      data: {
        contactName: body.name,
        companyName: body.companyName,
        email: body.email,
        phone: body.phone,
        street1: body.address,
        categories: body.categories,
        services: body.categories,
        status: body.status,
        licenseNumber: body.licenseNumber,
        licenseExpiry: body.licenseExpiry ? new Date(body.licenseExpiry) : undefined,
        isInsured: body.insuranceProvider ? true : undefined,
        insuranceExpiry: body.insuranceExpiry ? new Date(body.insuranceExpiry) : undefined,
        w9OnFile: body.w9OnFile,
        hourlyRateAmount: body.hourlyRate ? Math.round(body.hourlyRate * 100) : undefined,
        emergencyRateAmount: body.emergencyRate ? Math.round(body.emergencyRate * 100) : undefined,
        notes: body.notes,
      },
    });

    return reply.send({
      success: true,
      data: {
        ...updated,
        hourlyRate: updated.hourlyRateAmount ? updated.hourlyRateAmount / 100 : null,
        emergencyRate: updated.emergencyRateAmount ? updated.emergencyRateAmount / 100 : null,
      },
    });
  });

  // Approve vendor
  app.post('/:id/approve', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const vendor = await prisma.vendor.findUnique({
      where: { id },
    });

    if (!vendor) {
      return reply.status(404).send({
        success: false,
        error: 'Vendor not found',
      });
    }

    if (vendor.status !== 'pending_approval') {
      return reply.status(400).send({
        success: false,
        error: 'Vendor is not pending approval',
      });
    }

    const updated = await prisma.vendor.update({
      where: { id },
      data: { status: 'active' },
    });

    return reply.send({
      success: true,
      data: updated,
    });
  });

  // Create work order
  app.post('/work-orders', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createWorkOrderSchema.parse(request.body);

    const workOrder = await prisma.workOrder.create({
      data: {
        orderNumber: `WO-${Date.now()}`,
        propertyId: body.propertyId,
        unitId: body.unitId || null,
        vendorId: body.vendorId || null,
        title: body.title,
        description: body.description,
        category: mapToMaintenanceCategory(body.category) as 'plumbing' | 'electrical' | 'hvac' | 'appliance' | 'structural' | 'exterior' | 'pest_control' | 'locks_keys' | 'cleaning' | 'safety' | 'other',
        priority: body.priority as 'low' | 'medium' | 'high' | 'emergency',
        status: body.vendorId ? 'assigned' : 'submitted',
        scheduledDate: body.scheduledDate ? new Date(body.scheduledDate) : null,
        estimatedCostAmount: body.estimatedCost ? Math.round(body.estimatedCost * 100) : null,
        accessInstructions: body.accessInstructions || null,
        reportedBy: body.createdById,
        preferredSchedule: body.tenantAvailability ? [body.tenantAvailability] : [],
      },
    });

    return reply.status(201).send({
      success: true,
      data: {
        ...workOrder,
        estimatedCost: workOrder.estimatedCostAmount ? workOrder.estimatedCostAmount / 100 : null,
      },
    });
  });

  // Get work order by ID
  app.get('/work-orders/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const workOrder = await prisma.workOrder.findUnique({
      where: { id },
    });

    if (!workOrder) {
      return reply.status(404).send({
        success: false,
        error: 'Work order not found',
      });
    }

    return reply.send({
      success: true,
      data: {
        ...workOrder,
        estimatedCost: workOrder.estimatedCostAmount ? workOrder.estimatedCostAmount / 100 : null,
        actualCost: workOrder.actualCostAmount ? workOrder.actualCostAmount / 100 : null,
      },
    });
  });

  // List work orders
  app.get('/work-orders', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      vendorId?: string;
      propertyId?: string;
      status?: WorkOrderStatus;
      priority?: WorkOrderPriority;
      category?: VendorCategory;
    };

    const where: Record<string, unknown> = {};

    if (query.vendorId) where.vendorId = query.vendorId;
    if (query.propertyId) where.propertyId = query.propertyId;
    if (query.status) where.status = query.status;
    if (query.priority) where.priority = query.priority;
    if (query.category) where.category = mapToMaintenanceCategory(query.category);

    const results = await prisma.workOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({
      success: true,
      data: results.map((w) => ({
        ...w,
        estimatedCost: w.estimatedCostAmount ? w.estimatedCostAmount / 100 : null,
        actualCost: w.actualCostAmount ? w.actualCostAmount / 100 : null,
      })),
      total: results.length,
    });
  });

  // Update work order
  app.patch('/work-orders/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = updateWorkOrderSchema.parse(request.body);

    const workOrder = await prisma.workOrder.findUnique({
      where: { id },
    });

    if (!workOrder) {
      return reply.status(404).send({
        success: false,
        error: 'Work order not found',
      });
    }

    const updateData: Record<string, unknown> = {};

    if (body.vendorId) {
      updateData.vendorId = body.vendorId;
      if (body.vendorId !== workOrder.vendorId) {
        updateData.status = 'assigned';
      }
    }
    if (body.title) updateData.title = body.title;
    if (body.description) updateData.description = body.description;
    if (body.priority) updateData.priority = body.priority;
    if (body.scheduledDate) updateData.scheduledDate = new Date(body.scheduledDate);
    if (body.estimatedCost !== undefined) updateData.estimatedCostAmount = Math.round(body.estimatedCost * 100);
    if (body.notes) updateData.resolutionNotes = body.notes;
    if (body.accessInstructions) updateData.accessInstructions = body.accessInstructions;

    const updated = await prisma.workOrder.update({
      where: { id },
      data: updateData,
    });

    return reply.send({
      success: true,
      data: {
        ...updated,
        estimatedCost: updated.estimatedCostAmount ? updated.estimatedCostAmount / 100 : null,
        actualCost: updated.actualCostAmount ? updated.actualCostAmount / 100 : null,
      },
    });
  });

  // Assign work order to vendor
  app.post('/work-orders/:id/assign', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { vendorId?: string; autoAssign?: boolean };

    const workOrder = await prisma.workOrder.findUnique({
      where: { id },
    });

    if (!workOrder) {
      return reply.status(404).send({
        success: false,
        error: 'Work order not found',
      });
    }

    let vendorId = body.vendorId;

    if (body.autoAssign) {
      const bestVendor = findBestVendor(
        workOrder.category as VendorCategory,
        workOrder.propertyId,
        workOrder.priority as WorkOrderPriority
      );
      if (!bestVendor) {
        return reply.status(400).send({
          success: false,
          error: 'No eligible vendors found for auto-assignment',
        });
      }
      vendorId = bestVendor.id;
    }

    if (!vendorId) {
      return reply.status(400).send({
        success: false,
        error: 'vendorId or autoAssign is required',
      });
    }

    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
    });

    if (!vendor) {
      return reply.status(404).send({
        success: false,
        error: 'Vendor not found',
      });
    }

    const updated = await prisma.workOrder.update({
      where: { id },
      data: {
        vendorId,
        status: 'assigned',
      },
    });

    return reply.send({
      success: true,
      data: updated,
      assignedVendor: {
        id: vendor.id,
        name: vendor.contactName,
        companyName: vendor.companyName,
        rating: vendor.averageRating,
      },
    });
  });

  // Vendor accepts work order
  app.post('/work-orders/:id/accept', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const workOrder = await prisma.workOrder.findUnique({
      where: { id },
    });

    if (!workOrder) {
      return reply.status(404).send({
        success: false,
        error: 'Work order not found',
      });
    }

    if (workOrder.status !== 'assigned') {
      return reply.status(400).send({
        success: false,
        error: 'Work order must be assigned to accept',
      });
    }

    const updated = await prisma.workOrder.update({
      where: { id },
      data: { status: 'accepted' },
    });

    return reply.send({
      success: true,
      data: updated,
    });
  });

  // Start work order
  app.post('/work-orders/:id/start', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const workOrder = await prisma.workOrder.findUnique({
      where: { id },
    });

    if (!workOrder) {
      return reply.status(404).send({
        success: false,
        error: 'Work order not found',
      });
    }

    if (workOrder.status !== 'accepted') {
      return reply.status(400).send({
        success: false,
        error: 'Work order must be accepted to start',
      });
    }

    const updated = await prisma.workOrder.update({
      where: { id },
      data: {
        status: 'in_progress',
        actualStartTime: new Date(),
      },
    });

    return reply.send({
      success: true,
      data: updated,
    });
  });

  // Complete work order
  app.post('/work-orders/:id/complete', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      laborHours?: number;
      materialsCost?: number;
      notes?: string;
      photos?: string[];
    };

    const workOrder = await prisma.workOrder.findUnique({
      where: { id },
    });

    if (!workOrder) {
      return reply.status(404).send({
        success: false,
        error: 'Work order not found',
      });
    }

    if (workOrder.status !== 'in_progress') {
      return reply.status(400).send({
        success: false,
        error: 'Work order must be in progress to complete',
      });
    }

    // Calculate actual cost
    let actualCostAmount: number | null = null;
    if (workOrder.vendorId) {
      const vendor = await prisma.vendor.findUnique({
        where: { id: workOrder.vendorId },
      });
      if (vendor && vendor.hourlyRateAmount && body.laborHours) {
        const laborCost = (vendor.hourlyRateAmount / 100) * body.laborHours;
        actualCostAmount = Math.round((laborCost + (body.materialsCost || 0)) * 100);
      }
    }

    const updated = await prisma.workOrder.update({
      where: { id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        actualEndTime: new Date(),
        laborHours: body.laborHours || null,
        resolutionNotes: body.notes || null,
        photos: body.photos || [],
        actualCostAmount,
      },
    });

    // Update vendor stats
    if (workOrder.vendorId) {
      await updateVendorStats(workOrder.vendorId);
    }

    return reply.send({
      success: true,
      data: {
        ...updated,
        actualCost: updated.actualCostAmount ? updated.actualCostAmount / 100 : null,
      },
    });
  });

  // Submit invoice
  app.post('/:id/invoices', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = submitInvoiceSchema.parse(request.body);

    const vendor = await prisma.vendor.findUnique({
      where: { id },
    });

    if (!vendor) {
      return reply.status(404).send({
        success: false,
        error: 'Vendor not found',
      });
    }

    const workOrder = await prisma.workOrder.findUnique({
      where: { id: body.workOrderId },
    });

    if (!workOrder) {
      return reply.status(404).send({
        success: false,
        error: 'Work order not found',
      });
    }

    if (workOrder.vendorId !== id) {
      return reply.status(400).send({
        success: false,
        error: 'Work order is not assigned to this vendor',
      });
    }

    const lineItems: InvoiceLineItem[] = body.lineItems.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.quantity * item.unitPrice,
      type: item.type,
    }));

    const laborAmount = lineItems.filter((i) => i.type === 'labor').reduce((sum, i) => sum + i.total, 0);
    const materialsAmount = lineItems.filter((i) => i.type === 'materials').reduce((sum, i) => sum + i.total, 0);
    const subtotal = lineItems.reduce((sum, i) => sum + i.total, 0);
    const taxAmount = subtotal * (body.taxRate / 100);
    const totalAmount = subtotal + taxAmount;

    const invoice = await prisma.vendorInvoice.create({
      data: {
        vendorId: id,
        workOrderId: body.workOrderId,
        invoiceNumber: body.invoiceNumber,
        amount: totalAmount,
        laborAmount,
        materialsAmount,
        taxAmount,
        description: body.description,
        lineItems: lineItems as unknown as Prisma.JsonValue,
        status: 'submitted',
        dueDate: new Date(body.dueDate),
        attachments: body.attachments || [],
        notes: body.notes || null,
        submittedAt: new Date(),
      },
    });

    return reply.status(201).send({
      success: true,
      data: {
        ...invoice,
        amount: toNumber(invoice.amount),
        laborAmount: toNumber(invoice.laborAmount),
        materialsAmount: toNumber(invoice.materialsAmount),
        taxAmount: toNumber(invoice.taxAmount),
      },
    });
  });

  // List invoices for vendor
  app.get('/:id/invoices', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { status?: InvoiceStatus };

    const where: Record<string, unknown> = { vendorId: id };
    if (query.status) where.status = query.status;

    const results = await prisma.vendorInvoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({
      success: true,
      data: results.map((i) => ({
        ...i,
        amount: toNumber(i.amount),
        laborAmount: toNumber(i.laborAmount),
        materialsAmount: toNumber(i.materialsAmount),
        taxAmount: toNumber(i.taxAmount),
      })),
      total: results.length,
    });
  });

  // Approve invoice
  app.post('/invoices/:invoiceId/approve', async (request: FastifyRequest, reply: FastifyReply) => {
    const { invoiceId } = request.params as { invoiceId: string };
    const body = request.body as { approvedById: string };

    const invoice = await prisma.vendorInvoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      return reply.status(404).send({
        success: false,
        error: 'Invoice not found',
      });
    }

    if (invoice.status !== 'submitted') {
      return reply.status(400).send({
        success: false,
        error: 'Invoice must be submitted to approve',
      });
    }

    const updated = await prisma.vendorInvoice.update({
      where: { id: invoiceId },
      data: {
        status: 'approved',
        approvedAt: new Date(),
        approvedById: body.approvedById,
      },
    });

    return reply.send({
      success: true,
      data: {
        ...updated,
        amount: toNumber(updated.amount),
        laborAmount: toNumber(updated.laborAmount),
        materialsAmount: toNumber(updated.materialsAmount),
        taxAmount: toNumber(updated.taxAmount),
      },
    });
  });

  // Pay invoice
  app.post('/invoices/:invoiceId/pay', async (request: FastifyRequest, reply: FastifyReply) => {
    const { invoiceId } = request.params as { invoiceId: string };
    const body = request.body as { paymentMethod: string; paymentReference: string };

    const invoice = await prisma.vendorInvoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      return reply.status(404).send({
        success: false,
        error: 'Invoice not found',
      });
    }

    if (invoice.status !== 'approved') {
      return reply.status(400).send({
        success: false,
        error: 'Invoice must be approved to pay',
      });
    }

    const updated = await prisma.vendorInvoice.update({
      where: { id: invoiceId },
      data: {
        status: 'paid',
        paidDate: new Date(),
        paymentMethod: body.paymentMethod,
        paymentReference: body.paymentReference,
      },
    });

    return reply.send({
      success: true,
      data: {
        ...updated,
        amount: toNumber(updated.amount),
        laborAmount: toNumber(updated.laborAmount),
        materialsAmount: toNumber(updated.materialsAmount),
        taxAmount: toNumber(updated.taxAmount),
      },
    });
  });

  // Rate vendor
  app.post('/:id/ratings', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = rateVendorSchema.parse(request.body);

    const vendor = await prisma.vendor.findUnique({
      where: { id },
    });

    if (!vendor) {
      return reply.status(404).send({
        success: false,
        error: 'Vendor not found',
      });
    }

    const workOrder = await prisma.workOrder.findUnique({
      where: { id: body.workOrderId },
    });

    if (!workOrder || workOrder.vendorId !== id) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid work order for this vendor',
      });
    }

    // Check if already rated
    const existingRating = await prisma.vendorRating.findUnique({
      where: {
        vendorId_workOrderId: {
          vendorId: id,
          workOrderId: body.workOrderId,
        },
      },
    });

    if (existingRating) {
      return reply.status(400).send({
        success: false,
        error: 'Work order already rated',
      });
    }

    const rating = await prisma.vendorRating.create({
      data: {
        vendorId: id,
        workOrderId: body.workOrderId,
        rating: body.rating,
        qualityScore: body.qualityScore,
        timelinessScore: body.timelinessScore,
        communicationScore: body.communicationScore,
        valueScore: body.valueScore,
        comment: body.comment || null,
        ratedById: body.ratedById,
      },
    });

    await updateVendorStats(id);

    return reply.status(201).send({
      success: true,
      data: rating,
    });
  });

  // Get vendor ratings
  app.get('/:id/ratings', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const vendorRatings = await prisma.vendorRating.findMany({
      where: { vendorId: id },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({
      success: true,
      data: vendorRatings,
      total: vendorRatings.length,
    });
  });

  // Get vendor performance
  app.get('/:id/performance', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const vendor = await prisma.vendor.findUnique({
      where: { id },
    });

    if (!vendor) {
      return reply.status(404).send({
        success: false,
        error: 'Vendor not found',
      });
    }

    const vendorWorkOrders = await prisma.workOrder.findMany({
      where: { vendorId: id },
    });

    const vendorInvoices = await prisma.vendorInvoice.findMany({
      where: { vendorId: id, status: 'paid' },
    });

    const completedOrders = vendorWorkOrders.filter((w) => w.status === 'completed');
    const acceptedOrders = vendorWorkOrders.filter((w) => w.status !== 'submitted' && w.status !== 'cancelled');
    const disputedOrders = vendorWorkOrders.filter((w) => w.status === 'disputed');

    // Calculate average completion time in hours
    const completionTimes = completedOrders
      .filter((w) => w.actualStartTime && w.completedAt)
      .map((w) => (w.completedAt!.getTime() - w.actualStartTime!.getTime()) / (1000 * 60 * 60));

    const avgCompletionTime = completionTimes.length > 0
      ? completionTimes.reduce((sum, t) => sum + t, 0) / completionTimes.length
      : 0;

    const totalBilled = vendorInvoices.reduce((sum, i) => sum + toNumber(i.amount), 0);

    const performance: VendorPerformance = {
      vendorId: id,
      vendorName: vendor.contactName,
      totalWorkOrders: vendorWorkOrders.length,
      completedWorkOrders: completedOrders.length,
      averageCompletionTime: Math.round(avgCompletionTime * 10) / 10,
      averageRating: vendor.averageRating || 0,
      totalBilled,
      onTimeRate: completedOrders.length > 0
        ? (completedOrders.filter((w) => w.scheduledDate && w.completedAt! <= w.scheduledDate).length / completedOrders.length) * 100
        : 0,
      acceptanceRate: vendorWorkOrders.length > 0
        ? (acceptedOrders.length / vendorWorkOrders.length) * 100
        : 0,
      disputeRate: vendorWorkOrders.length > 0
        ? (disputedOrders.length / vendorWorkOrders.length) * 100
        : 0,
    };

    return reply.send({
      success: true,
      data: performance,
    });
  });

  // Get leaderboard
  app.get('/leaderboard', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { category?: VendorCategory; limit?: string };
    const limit = parseInt(query.limit || '10', 10);

    const where: Record<string, unknown> = {
      status: 'active',
      totalJobs: { gt: 0 },
    };

    if (query.category) {
      where.categories = { has: query.category };
    }

    const activeVendors = await prisma.vendor.findMany({
      where,
      orderBy: [
        { averageRating: 'desc' },
        { completedJobs: 'desc' },
      ],
      take: limit,
    });

    const leaderboard = activeVendors.map((v) => ({
      vendorId: v.id,
      vendorName: v.contactName,
      companyName: v.companyName,
      rating: v.averageRating || 0,
      completedJobs: v.completedJobs,
      completionRate: v.totalJobs > 0 ? (v.completedJobs / v.totalJobs) * 100 : 0,
    }));

    return reply.send({
      success: true,
      data: leaderboard,
    });
  });
}
