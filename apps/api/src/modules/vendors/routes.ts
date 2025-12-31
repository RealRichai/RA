import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// Types
export type VendorStatus = 'active' | 'inactive' | 'suspended' | 'pending_approval';
export type VendorCategory = 'plumbing' | 'electrical' | 'hvac' | 'general_maintenance' | 'landscaping' | 'cleaning' | 'painting' | 'roofing' | 'appliance_repair' | 'pest_control' | 'locksmith' | 'other';
export type WorkOrderStatus = 'pending' | 'assigned' | 'accepted' | 'in_progress' | 'completed' | 'cancelled' | 'disputed';
export type WorkOrderPriority = 'low' | 'medium' | 'high' | 'emergency';
export type InvoiceStatus = 'draft' | 'submitted' | 'approved' | 'paid' | 'disputed' | 'cancelled';

export interface Vendor {
  id: string;
  name: string;
  companyName: string | null;
  email: string;
  phone: string;
  address: string | null;
  categories: VendorCategory[];
  status: VendorStatus;
  licenseNumber: string | null;
  licenseExpiry: Date | null;
  insuranceProvider: string | null;
  insuranceExpiry: Date | null;
  w9OnFile: boolean;
  hourlyRate: number | null;
  emergencyRate: number | null;
  notes: string | null;
  rating: number;
  totalJobs: number;
  completedJobs: number;
  averageResponseTime: number | null;
  preferredProperties: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkOrder {
  id: string;
  propertyId: string;
  unitId: string | null;
  vendorId: string | null;
  maintenanceRequestId: string | null;
  title: string;
  description: string;
  category: VendorCategory;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  scheduledDate: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  estimatedCost: number | null;
  actualCost: number | null;
  laborHours: number | null;
  materialsCost: number | null;
  notes: string | null;
  photos: string[];
  tenantNotified: boolean;
  tenantAvailability: string | null;
  accessInstructions: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface VendorInvoice {
  id: string;
  vendorId: string;
  workOrderId: string;
  invoiceNumber: string;
  amount: number;
  laborAmount: number;
  materialsAmount: number;
  taxAmount: number;
  description: string;
  lineItems: InvoiceLineItem[];
  status: InvoiceStatus;
  dueDate: Date;
  paidDate: Date | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  attachments: string[];
  notes: string | null;
  submittedAt: Date | null;
  approvedAt: Date | null;
  approvedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  type: 'labor' | 'materials' | 'other';
}

export interface VendorRating {
  id: string;
  vendorId: string;
  workOrderId: string;
  rating: number;
  qualityScore: number;
  timelinessScore: number;
  communicationScore: number;
  valueScore: number;
  comment: string | null;
  ratedById: string;
  createdAt: Date;
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

// In-memory stores
const vendors = new Map<string, Vendor>();
const workOrders = new Map<string, WorkOrder>();
const invoices = new Map<string, VendorInvoice>();
const ratings = new Map<string, VendorRating>();

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
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function updateVendorStats(vendorId: string): void {
  const vendor = vendors.get(vendorId);
  if (!vendor) return;

  const vendorRatings = Array.from(ratings.values()).filter((r) => r.vendorId === vendorId);
  const vendorWorkOrders = Array.from(workOrders.values()).filter((w) => w.vendorId === vendorId);

  vendor.totalJobs = vendorWorkOrders.length;
  vendor.completedJobs = vendorWorkOrders.filter((w) => w.status === 'completed').length;

  if (vendorRatings.length > 0) {
    vendor.rating = vendorRatings.reduce((sum, r) => sum + r.rating, 0) / vendorRatings.length;
    vendor.rating = Math.round(vendor.rating * 10) / 10;
  }

  // Calculate average response time (hours from creation to accepted)
  const acceptedOrders = vendorWorkOrders.filter((w) => w.startedAt);
  if (acceptedOrders.length > 0) {
    const totalResponseTime = acceptedOrders.reduce((sum, w) => {
      const responseTime = (w.startedAt!.getTime() - w.createdAt.getTime()) / (1000 * 60 * 60);
      return sum + responseTime;
    }, 0);
    vendor.averageResponseTime = Math.round(totalResponseTime / acceptedOrders.length);
  }

  vendor.updatedAt = new Date();
  vendors.set(vendorId, vendor);
}

function findBestVendor(category: VendorCategory, propertyId: string, priority: WorkOrderPriority): Vendor | null {
  const eligibleVendors = Array.from(vendors.values()).filter((v) => {
    if (v.status !== 'active') return false;
    if (!v.categories.includes(category)) return false;
    // Check license/insurance expiry
    if (v.licenseExpiry && v.licenseExpiry < new Date()) return false;
    if (v.insuranceExpiry && v.insuranceExpiry < new Date()) return false;
    return true;
  });

  if (eligibleVendors.length === 0) return null;

  // Score vendors
  const scoredVendors = eligibleVendors.map((v) => {
    let score = 0;

    // Rating weight
    score += v.rating * 20;

    // Completion rate weight
    const completionRate = v.totalJobs > 0 ? v.completedJobs / v.totalJobs : 0.5;
    score += completionRate * 15;

    // Response time weight (lower is better)
    if (v.averageResponseTime) {
      score += Math.max(0, 10 - v.averageResponseTime / 2);
    }

    // Preferred property bonus
    if (v.preferredProperties.includes(propertyId)) {
      score += 15;
    }

    // Emergency availability bonus
    if (priority === 'emergency' && v.emergencyRate) {
      score += 10;
    }

    return { vendor: v, score };
  });

  scoredVendors.sort((a, b) => b.score - a.score);

  return scoredVendors[0]?.vendor || null;
}

// Route handlers
export async function vendorRoutes(app: FastifyInstance): Promise<void> {
  // Create vendor
  app.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createVendorSchema.parse(request.body);
    const now = new Date();

    const vendor: Vendor = {
      id: generateId(),
      name: body.name,
      companyName: body.companyName || null,
      email: body.email,
      phone: body.phone,
      address: body.address || null,
      categories: body.categories,
      status: 'pending_approval',
      licenseNumber: body.licenseNumber || null,
      licenseExpiry: body.licenseExpiry ? new Date(body.licenseExpiry) : null,
      insuranceProvider: body.insuranceProvider || null,
      insuranceExpiry: body.insuranceExpiry ? new Date(body.insuranceExpiry) : null,
      w9OnFile: false,
      hourlyRate: body.hourlyRate || null,
      emergencyRate: body.emergencyRate || null,
      notes: body.notes || null,
      rating: 0,
      totalJobs: 0,
      completedJobs: 0,
      averageResponseTime: null,
      preferredProperties: body.preferredProperties || [],
      createdAt: now,
      updatedAt: now,
    };

    vendors.set(vendor.id, vendor);

    return reply.status(201).send({
      success: true,
      data: vendor,
    });
  });

  // Get vendor by ID
  app.get('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const vendor = vendors.get(id);

    if (!vendor) {
      return reply.status(404).send({
        success: false,
        error: 'Vendor not found',
      });
    }

    return reply.send({
      success: true,
      data: vendor,
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

    let results = Array.from(vendors.values());

    if (query.category) {
      results = results.filter((v) => v.categories.includes(query.category!));
    }
    if (query.status) {
      results = results.filter((v) => v.status === query.status);
    }
    if (query.minRating) {
      const minRating = parseFloat(query.minRating);
      results = results.filter((v) => v.rating >= minRating);
    }
    if (query.search) {
      const search = query.search.toLowerCase();
      results = results.filter(
        (v) =>
          v.name.toLowerCase().includes(search) ||
          v.companyName?.toLowerCase().includes(search) ||
          v.email.toLowerCase().includes(search)
      );
    }

    results.sort((a, b) => b.rating - a.rating);

    return reply.send({
      success: true,
      data: results,
      total: results.length,
    });
  });

  // Update vendor
  app.patch('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = updateVendorSchema.parse(request.body);
    const vendor = vendors.get(id);

    if (!vendor) {
      return reply.status(404).send({
        success: false,
        error: 'Vendor not found',
      });
    }

    const updated: Vendor = {
      ...vendor,
      ...body,
      licenseExpiry: body.licenseExpiry ? new Date(body.licenseExpiry) : vendor.licenseExpiry,
      insuranceExpiry: body.insuranceExpiry ? new Date(body.insuranceExpiry) : vendor.insuranceExpiry,
      updatedAt: new Date(),
    };

    vendors.set(id, updated);

    return reply.send({
      success: true,
      data: updated,
    });
  });

  // Approve vendor
  app.post('/:id/approve', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const vendor = vendors.get(id);

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

    vendor.status = 'active';
    vendor.updatedAt = new Date();
    vendors.set(id, vendor);

    return reply.send({
      success: true,
      data: vendor,
    });
  });

  // Create work order
  app.post('/work-orders', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createWorkOrderSchema.parse(request.body);
    const now = new Date();

    const workOrder: WorkOrder = {
      id: generateId(),
      propertyId: body.propertyId,
      unitId: body.unitId || null,
      vendorId: body.vendorId || null,
      maintenanceRequestId: body.maintenanceRequestId || null,
      title: body.title,
      description: body.description,
      category: body.category,
      priority: body.priority,
      status: body.vendorId ? 'assigned' : 'pending',
      scheduledDate: body.scheduledDate ? new Date(body.scheduledDate) : null,
      startedAt: null,
      completedAt: null,
      estimatedCost: body.estimatedCost || null,
      actualCost: null,
      laborHours: null,
      materialsCost: null,
      notes: null,
      photos: [],
      tenantNotified: false,
      tenantAvailability: body.tenantAvailability || null,
      accessInstructions: body.accessInstructions || null,
      createdById: body.createdById,
      createdAt: now,
      updatedAt: now,
    };

    workOrders.set(workOrder.id, workOrder);

    return reply.status(201).send({
      success: true,
      data: workOrder,
    });
  });

  // Get work order by ID
  app.get('/work-orders/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const workOrder = workOrders.get(id);

    if (!workOrder) {
      return reply.status(404).send({
        success: false,
        error: 'Work order not found',
      });
    }

    return reply.send({
      success: true,
      data: workOrder,
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

    let results = Array.from(workOrders.values());

    if (query.vendorId) {
      results = results.filter((w) => w.vendorId === query.vendorId);
    }
    if (query.propertyId) {
      results = results.filter((w) => w.propertyId === query.propertyId);
    }
    if (query.status) {
      results = results.filter((w) => w.status === query.status);
    }
    if (query.priority) {
      results = results.filter((w) => w.priority === query.priority);
    }
    if (query.category) {
      results = results.filter((w) => w.category === query.category);
    }

    results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return reply.send({
      success: true,
      data: results,
      total: results.length,
    });
  });

  // Update work order
  app.patch('/work-orders/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = updateWorkOrderSchema.parse(request.body);
    const workOrder = workOrders.get(id);

    if (!workOrder) {
      return reply.status(404).send({
        success: false,
        error: 'Work order not found',
      });
    }

    const updated: WorkOrder = {
      ...workOrder,
      ...body,
      scheduledDate: body.scheduledDate ? new Date(body.scheduledDate) : workOrder.scheduledDate,
      updatedAt: new Date(),
    };

    if (body.vendorId && body.vendorId !== workOrder.vendorId) {
      updated.status = 'assigned';
    }

    workOrders.set(id, updated);

    return reply.send({
      success: true,
      data: updated,
    });
  });

  // Assign work order to vendor
  app.post('/work-orders/:id/assign', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { vendorId?: string; autoAssign?: boolean };
    const workOrder = workOrders.get(id);

    if (!workOrder) {
      return reply.status(404).send({
        success: false,
        error: 'Work order not found',
      });
    }

    let vendorId = body.vendorId;

    if (body.autoAssign) {
      const bestVendor = findBestVendor(workOrder.category, workOrder.propertyId, workOrder.priority);
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

    const vendor = vendors.get(vendorId);
    if (!vendor) {
      return reply.status(404).send({
        success: false,
        error: 'Vendor not found',
      });
    }

    workOrder.vendorId = vendorId;
    workOrder.status = 'assigned';
    workOrder.updatedAt = new Date();
    workOrders.set(id, workOrder);

    return reply.send({
      success: true,
      data: workOrder,
      assignedVendor: {
        id: vendor.id,
        name: vendor.name,
        companyName: vendor.companyName,
        rating: vendor.rating,
      },
    });
  });

  // Vendor accepts work order
  app.post('/work-orders/:id/accept', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const workOrder = workOrders.get(id);

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

    workOrder.status = 'accepted';
    workOrder.updatedAt = new Date();
    workOrders.set(id, workOrder);

    return reply.send({
      success: true,
      data: workOrder,
    });
  });

  // Start work order
  app.post('/work-orders/:id/start', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const workOrder = workOrders.get(id);

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

    workOrder.status = 'in_progress';
    workOrder.startedAt = new Date();
    workOrder.updatedAt = new Date();
    workOrders.set(id, workOrder);

    return reply.send({
      success: true,
      data: workOrder,
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
    const workOrder = workOrders.get(id);

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

    workOrder.status = 'completed';
    workOrder.completedAt = new Date();
    workOrder.laborHours = body.laborHours || null;
    workOrder.materialsCost = body.materialsCost || null;
    workOrder.notes = body.notes || workOrder.notes;
    workOrder.photos = body.photos || workOrder.photos;
    workOrder.updatedAt = new Date();

    // Calculate actual cost
    if (workOrder.vendorId) {
      const vendor = vendors.get(workOrder.vendorId);
      if (vendor && vendor.hourlyRate && workOrder.laborHours) {
        const laborCost = vendor.hourlyRate * workOrder.laborHours;
        workOrder.actualCost = laborCost + (workOrder.materialsCost || 0);
      }
    }

    workOrders.set(id, workOrder);

    // Update vendor stats
    if (workOrder.vendorId) {
      updateVendorStats(workOrder.vendorId);
    }

    return reply.send({
      success: true,
      data: workOrder,
    });
  });

  // Submit invoice
  app.post('/:id/invoices', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = submitInvoiceSchema.parse(request.body);
    const vendor = vendors.get(id);

    if (!vendor) {
      return reply.status(404).send({
        success: false,
        error: 'Vendor not found',
      });
    }

    const workOrder = workOrders.get(body.workOrderId);
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

    const now = new Date();
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

    const invoice: VendorInvoice = {
      id: generateId(),
      vendorId: id,
      workOrderId: body.workOrderId,
      invoiceNumber: body.invoiceNumber,
      amount: totalAmount,
      laborAmount,
      materialsAmount,
      taxAmount,
      description: body.description,
      lineItems,
      status: 'submitted',
      dueDate: new Date(body.dueDate),
      paidDate: null,
      paymentMethod: null,
      paymentReference: null,
      attachments: body.attachments || [],
      notes: body.notes || null,
      submittedAt: now,
      approvedAt: null,
      approvedById: null,
      createdAt: now,
      updatedAt: now,
    };

    invoices.set(invoice.id, invoice);

    return reply.status(201).send({
      success: true,
      data: invoice,
    });
  });

  // List invoices for vendor
  app.get('/:id/invoices', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { status?: InvoiceStatus };

    let results = Array.from(invoices.values()).filter((i) => i.vendorId === id);

    if (query.status) {
      results = results.filter((i) => i.status === query.status);
    }

    results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return reply.send({
      success: true,
      data: results,
      total: results.length,
    });
  });

  // Approve invoice
  app.post('/invoices/:invoiceId/approve', async (request: FastifyRequest, reply: FastifyReply) => {
    const { invoiceId } = request.params as { invoiceId: string };
    const body = request.body as { approvedById: string };
    const invoice = invoices.get(invoiceId);

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

    invoice.status = 'approved';
    invoice.approvedAt = new Date();
    invoice.approvedById = body.approvedById;
    invoice.updatedAt = new Date();
    invoices.set(invoiceId, invoice);

    return reply.send({
      success: true,
      data: invoice,
    });
  });

  // Pay invoice
  app.post('/invoices/:invoiceId/pay', async (request: FastifyRequest, reply: FastifyReply) => {
    const { invoiceId } = request.params as { invoiceId: string };
    const body = request.body as { paymentMethod: string; paymentReference: string };
    const invoice = invoices.get(invoiceId);

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

    invoice.status = 'paid';
    invoice.paidDate = new Date();
    invoice.paymentMethod = body.paymentMethod;
    invoice.paymentReference = body.paymentReference;
    invoice.updatedAt = new Date();
    invoices.set(invoiceId, invoice);

    return reply.send({
      success: true,
      data: invoice,
    });
  });

  // Rate vendor
  app.post('/:id/ratings', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = rateVendorSchema.parse(request.body);
    const vendor = vendors.get(id);

    if (!vendor) {
      return reply.status(404).send({
        success: false,
        error: 'Vendor not found',
      });
    }

    const workOrder = workOrders.get(body.workOrderId);
    if (!workOrder || workOrder.vendorId !== id) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid work order for this vendor',
      });
    }

    // Check if already rated
    const existingRating = Array.from(ratings.values()).find(
      (r) => r.vendorId === id && r.workOrderId === body.workOrderId
    );

    if (existingRating) {
      return reply.status(400).send({
        success: false,
        error: 'Work order already rated',
      });
    }

    const rating: VendorRating = {
      id: generateId(),
      vendorId: id,
      workOrderId: body.workOrderId,
      rating: body.rating,
      qualityScore: body.qualityScore,
      timelinessScore: body.timelinessScore,
      communicationScore: body.communicationScore,
      valueScore: body.valueScore,
      comment: body.comment || null,
      ratedById: body.ratedById,
      createdAt: new Date(),
    };

    ratings.set(rating.id, rating);
    updateVendorStats(id);

    return reply.status(201).send({
      success: true,
      data: rating,
    });
  });

  // Get vendor ratings
  app.get('/:id/ratings', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const vendorRatings = Array.from(ratings.values()).filter((r) => r.vendorId === id);
    vendorRatings.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return reply.send({
      success: true,
      data: vendorRatings,
      total: vendorRatings.length,
    });
  });

  // Get vendor performance
  app.get('/:id/performance', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const vendor = vendors.get(id);

    if (!vendor) {
      return reply.status(404).send({
        success: false,
        error: 'Vendor not found',
      });
    }

    const vendorWorkOrders = Array.from(workOrders.values()).filter((w) => w.vendorId === id);
    const vendorInvoices = Array.from(invoices.values()).filter((i) => i.vendorId === id);

    const completedOrders = vendorWorkOrders.filter((w) => w.status === 'completed');
    const acceptedOrders = vendorWorkOrders.filter((w) => w.status !== 'pending' && w.status !== 'cancelled');
    const disputedOrders = vendorWorkOrders.filter((w) => w.status === 'disputed');

    // Calculate average completion time in hours
    const completionTimes = completedOrders
      .filter((w) => w.startedAt && w.completedAt)
      .map((w) => (w.completedAt!.getTime() - w.startedAt!.getTime()) / (1000 * 60 * 60));

    const avgCompletionTime = completionTimes.length > 0
      ? completionTimes.reduce((sum, t) => sum + t, 0) / completionTimes.length
      : 0;

    const totalBilled = vendorInvoices
      .filter((i) => i.status === 'paid')
      .reduce((sum, i) => sum + i.amount, 0);

    const performance: VendorPerformance = {
      vendorId: id,
      vendorName: vendor.name,
      totalWorkOrders: vendorWorkOrders.length,
      completedWorkOrders: completedOrders.length,
      averageCompletionTime: Math.round(avgCompletionTime * 10) / 10,
      averageRating: vendor.rating,
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

    let activeVendors = Array.from(vendors.values()).filter((v) => v.status === 'active');

    if (query.category) {
      activeVendors = activeVendors.filter((v) => v.categories.includes(query.category!));
    }

    const leaderboard = activeVendors
      .filter((v) => v.totalJobs > 0)
      .map((v) => ({
        vendorId: v.id,
        vendorName: v.name,
        companyName: v.companyName,
        rating: v.rating,
        completedJobs: v.completedJobs,
        completionRate: v.totalJobs > 0 ? (v.completedJobs / v.totalJobs) * 100 : 0,
        averageResponseTime: v.averageResponseTime,
      }))
      .sort((a, b) => b.rating - a.rating || b.completedJobs - a.completedJobs)
      .slice(0, limit);

    return reply.send({
      success: true,
      data: leaderboard,
    });
  });
}

// Export for testing
export { vendors, workOrders, invoices, ratings, findBestVendor, updateVendorStats };
