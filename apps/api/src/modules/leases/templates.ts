import {
  prisma,
  Prisma,
  type LeaseTemplateStatus as PrismaLeaseTemplateStatus,
  type ClauseCategory as PrismaClauseCategory,
  type ClauseRequirement as PrismaClauseRequirement,
  type JurisdictionType as PrismaJurisdictionType,
  type GeneratedLeaseStatus as PrismaGeneratedLeaseStatus,
  type SignerType as PrismaSignerType,
  type SignatureStatusEnum as PrismaSignatureStatus,
} from '@realriches/database';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// Types
export type TemplateStatus = 'draft' | 'active' | 'archived';
export type ClauseCategory = 'general' | 'rent' | 'security_deposit' | 'maintenance' | 'utilities' | 'pets' | 'parking' | 'termination' | 'renewal' | 'rules' | 'disclosure' | 'compliance' | 'custom';
export type ClauseRequirement = 'required' | 'optional' | 'conditional';
export type JurisdictionType = 'federal' | 'state' | 'city' | 'county';

export interface LeaseTemplate {
  id: string;
  name: string;
  description: string | null;
  propertyType: string;
  jurisdiction: string;
  jurisdictionType: JurisdictionType;
  status: TemplateStatus;
  version: number;
  parentVersionId: string | null;
  clauses: TemplateClause[];
  variables: TemplateVariable[];
  metadata: TemplateMetadata;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
}

export interface TemplateClause {
  id: string;
  templateId: string;
  clauseId: string;
  order: number;
  isRequired: boolean;
  customContent: string | null;
  conditions: ClauseCondition[];
}

export interface Clause {
  id: string;
  name: string;
  title: string;
  category: ClauseCategory;
  content: string;
  summary: string | null;
  jurisdiction: string | null;
  jurisdictionType: JurisdictionType | null;
  requirement: ClauseRequirement;
  variables: string[];
  dependencies: string[];
  incompatibleWith: string[];
  effectiveDate: Date | null;
  expiryDate: Date | null;
  legalReference: string | null;
  version: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClauseCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'is_true' | 'is_false';
  value: string | number | boolean;
}

export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'currency' | 'address';
  label: string;
  description: string | null;
  required: boolean;
  defaultValue: string | number | boolean | null;
  validation: VariableValidation | null;
}

export interface VariableValidation {
  min?: number;
  max?: number;
  pattern?: string;
  options?: string[];
}

export interface TemplateMetadata {
  estimatedPages: number;
  requiredSignatures: number;
  notarizationRequired: boolean;
  witnessRequired: boolean;
  lastLegalReview: Date | null;
  complianceNotes: string[];
}

export interface GeneratedLease {
  id: string;
  templateId: string;
  templateVersion: number;
  propertyId: string;
  unitId: string | null;
  landlordId: string;
  tenantIds: string[];
  variables: Record<string, string | number | boolean | Date>;
  content: string;
  clauses: Array<{
    clauseId: string;
    title: string;
    content: string;
    order: number;
  }>;
  status: 'draft' | 'pending_review' | 'pending_signature' | 'signed' | 'expired' | 'terminated';
  signatureRequests: SignatureRequest[];
  generatedAt: Date;
  expiresAt: Date | null;
}

export interface SignatureRequest {
  id: string;
  leaseId: string;
  signerId: string;
  signerType: 'landlord' | 'tenant' | 'guarantor' | 'witness';
  signerName: string;
  signerEmail: string;
  status: 'pending' | 'viewed' | 'signed' | 'declined';
  signedAt: Date | null;
  ipAddress: string | null;
}

// Schemas
const createClauseSchema = z.object({
  name: z.string().min(1),
  title: z.string().min(1),
  category: z.enum(['general', 'rent', 'security_deposit', 'maintenance', 'utilities', 'pets', 'parking', 'termination', 'renewal', 'rules', 'disclosure', 'compliance', 'custom']),
  content: z.string().min(1),
  summary: z.string().optional(),
  jurisdiction: z.string().optional(),
  jurisdictionType: z.enum(['federal', 'state', 'city', 'county']).optional(),
  requirement: z.enum(['required', 'optional', 'conditional']).default('optional'),
  variables: z.array(z.string()).optional(),
  dependencies: z.array(z.string().uuid()).optional(),
  incompatibleWith: z.array(z.string().uuid()).optional(),
  effectiveDate: z.string().datetime().optional(),
  expiryDate: z.string().datetime().optional(),
  legalReference: z.string().optional(),
});

const updateClauseSchema = z.object({
  name: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  category: z.enum(['general', 'rent', 'security_deposit', 'maintenance', 'utilities', 'pets', 'parking', 'termination', 'renewal', 'rules', 'disclosure', 'compliance', 'custom']).optional(),
  content: z.string().min(1).optional(),
  summary: z.string().optional(),
  requirement: z.enum(['required', 'optional', 'conditional']).optional(),
  variables: z.array(z.string()).optional(),
  legalReference: z.string().optional(),
  isActive: z.boolean().optional(),
});

const createTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  propertyType: z.string().min(1),
  jurisdiction: z.string().min(1),
  jurisdictionType: z.enum(['federal', 'state', 'city', 'county']),
  clauseIds: z.array(z.string().uuid()).optional(),
  variables: z.array(z.object({
    name: z.string().min(1),
    type: z.enum(['string', 'number', 'date', 'boolean', 'currency', 'address']),
    label: z.string().min(1),
    description: z.string().optional(),
    required: z.boolean().default(true),
    defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
    validation: z.object({
      min: z.number().optional(),
      max: z.number().optional(),
      pattern: z.string().optional(),
      options: z.array(z.string()).optional(),
    }).optional(),
  })).optional(),
  metadata: z.object({
    estimatedPages: z.number().int().positive().optional(),
    requiredSignatures: z.number().int().positive().optional(),
    notarizationRequired: z.boolean().optional(),
    witnessRequired: z.boolean().optional(),
    complianceNotes: z.array(z.string()).optional(),
  }).optional(),
  createdById: z.string().uuid(),
});

const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
});

const addClauseToTemplateSchema = z.object({
  clauseId: z.string().uuid(),
  order: z.number().int().nonnegative().optional(),
  isRequired: z.boolean().default(false),
  customContent: z.string().optional(),
  conditions: z.array(z.object({
    field: z.string().min(1),
    operator: z.enum(['equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'is_true', 'is_false']),
    value: z.union([z.string(), z.number(), z.boolean()]),
  })).optional(),
});

const generateLeaseSchema = z.object({
  templateId: z.string().uuid(),
  propertyId: z.string().uuid(),
  unitId: z.string().uuid().optional(),
  landlordId: z.string().uuid(),
  tenantIds: z.array(z.string().uuid()).min(1),
  variables: z.record(z.union([z.string(), z.number(), z.boolean()])),
  expiresAt: z.string().datetime().optional(),
});

// Helper functions
export function interpolateVariables(content: string, variables: Record<string, string | number | boolean | Date>): string {
  let result = content;

  for (const [key, value] of Object.entries(variables)) {
    const placeholder = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
    let displayValue: string;

    if (value instanceof Date) {
      displayValue = value.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    } else if (typeof value === 'number') {
      if (key.toLowerCase().includes('amount') || key.toLowerCase().includes('rent') || key.toLowerCase().includes('deposit')) {
        displayValue = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
      } else {
        displayValue = value.toString();
      }
    } else if (typeof value === 'boolean') {
      displayValue = value ? 'Yes' : 'No';
    } else {
      displayValue = String(value);
    }

    result = result.replace(placeholder, displayValue);
  }

  return result;
}

export function evaluateCondition(condition: ClauseCondition, variables: Record<string, string | number | boolean | Date>): boolean {
  const value = variables[condition.field];
  if (value === undefined) return false;

  switch (condition.operator) {
    case 'equals':
      return value === condition.value;
    case 'not_equals':
      return value !== condition.value;
    case 'contains':
      return String(value).toLowerCase().includes(String(condition.value).toLowerCase());
    case 'greater_than':
      return typeof value === 'number' && value > Number(condition.value);
    case 'less_than':
      return typeof value === 'number' && value < Number(condition.value);
    case 'is_true':
      return value === true;
    case 'is_false':
      return value === false;
    default:
      return true;
  }
}

export function shouldIncludeClause(
  clauseOrConditions: TemplateClause | ClauseCondition[],
  variables: Record<string, string | number | boolean | Date>
): boolean {
  const conditions = Array.isArray(clauseOrConditions)
    ? clauseOrConditions
    : clauseOrConditions.conditions;

  if (!conditions || conditions.length === 0) {
    return true;
  }

  return conditions.every((condition) => evaluateCondition(condition, variables));
}

// Export clauses Map for testing purposes
export const clauses = new Map<string, Clause>();

// Initialize default clauses in the Map for testing
const initClausesMap = () => {
  const defaultClauses: Clause[] = [
    {
      id: 'c-parties',
      name: 'parties',
      title: 'Parties to the Agreement',
      category: 'general',
      content: 'This Residential Lease Agreement ("Agreement") is entered into as of {{lease_start_date}} by and between {{landlord_name}} ("Landlord") and {{tenant_names}} ("Tenant(s)") for the property located at {{property_address}} ("Premises").',
      summary: 'Identifies the landlord, tenant(s), and property address',
      jurisdiction: null,
      jurisdictionType: null,
      requirement: 'required',
      variables: ['lease_start_date', 'landlord_name', 'tenant_names', 'property_address'],
      dependencies: [],
      incompatibleWith: [],
      effectiveDate: null,
      expiryDate: null,
      legalReference: null,
      version: 1,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'c-lease-term',
      name: 'lease_term',
      title: 'Lease Term',
      category: 'general',
      content: 'The term of this Lease shall commence on {{lease_start_date}} and shall terminate on {{lease_end_date}}.',
      summary: 'Specifies the start and end dates of the lease',
      jurisdiction: null,
      jurisdictionType: null,
      requirement: 'required',
      variables: ['lease_start_date', 'lease_end_date'],
      dependencies: [],
      incompatibleWith: [],
      effectiveDate: null,
      expiryDate: null,
      legalReference: null,
      version: 1,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'c-rent',
      name: 'rent_payment',
      title: 'Rent Payment',
      category: 'rent',
      content: 'Tenant agrees to pay Landlord the sum of {{monthly_rent}} per month as rent for the Premises.',
      summary: 'Specifies monthly rent amount and payment terms',
      jurisdiction: null,
      jurisdictionType: null,
      requirement: 'required',
      variables: ['monthly_rent', 'rent_due_day', 'payment_address'],
      dependencies: [],
      incompatibleWith: [],
      effectiveDate: null,
      expiryDate: null,
      legalReference: null,
      version: 1,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'c-security-deposit',
      name: 'security_deposit',
      title: 'Security Deposit',
      category: 'security_deposit',
      content: 'Upon execution of this Agreement, Tenant shall deposit with Landlord the sum of {{security_deposit_amount}} as a security deposit.',
      summary: 'Specifies security deposit amount and terms',
      jurisdiction: null,
      jurisdictionType: null,
      requirement: 'required',
      variables: ['security_deposit_amount'],
      dependencies: [],
      incompatibleWith: [],
      effectiveDate: null,
      expiryDate: null,
      legalReference: null,
      version: 1,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'c-nyc-rent-stabilization',
      name: 'nyc_rent_stabilization',
      title: 'NYC Rent Stabilization Notice',
      category: 'compliance',
      content: 'This unit is subject to NYC Rent Stabilization laws. The legal regulated rent is {{legal_rent}}.',
      summary: 'Required NYC rent stabilization disclosure',
      jurisdiction: 'NYC',
      jurisdictionType: 'city',
      requirement: 'conditional',
      variables: ['legal_rent'],
      dependencies: [],
      incompatibleWith: [],
      effectiveDate: null,
      expiryDate: null,
      legalReference: 'NYC Admin Code §26-501 et seq.',
      version: 1,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'c-pet-policy',
      name: 'pet_policy',
      title: 'Pet Policy',
      category: 'pets',
      content: 'Tenant {{pets_allowed}} keep pets on the Premises. {{pet_restrictions}}',
      summary: 'Defines pet policy and restrictions',
      jurisdiction: null,
      jurisdictionType: null,
      requirement: 'conditional',
      variables: ['pets_allowed', 'pet_restrictions'],
      dependencies: [],
      incompatibleWith: [],
      effectiveDate: null,
      expiryDate: null,
      legalReference: null,
      version: 1,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  for (const clause of defaultClauses) {
    clauses.set(clause.id, clause);
  }
};

initClausesMap();

// Export templates Map for testing purposes
export const templates = new Map<string, LeaseTemplate>();

// Default clauses data
const defaultClausesData = [
  {
    name: 'parties',
    title: 'Parties to the Agreement',
    category: 'general' as ClauseCategory,
    content: 'This Residential Lease Agreement ("Agreement") is entered into as of {{lease_start_date}} by and between {{landlord_name}} ("Landlord") and {{tenant_names}} ("Tenant(s)") for the property located at {{property_address}} ("Premises").',
    summary: 'Identifies the landlord, tenant(s), and property address',
    requirement: 'required' as ClauseRequirement,
    variables: ['lease_start_date', 'landlord_name', 'tenant_names', 'property_address'],
  },
  {
    name: 'lease_term',
    title: 'Lease Term',
    category: 'general' as ClauseCategory,
    content: 'The term of this Lease shall commence on {{lease_start_date}} and shall terminate on {{lease_end_date}}, unless sooner terminated or extended in accordance with the terms of this Agreement.',
    summary: 'Specifies the start and end dates of the lease',
    requirement: 'required' as ClauseRequirement,
    variables: ['lease_start_date', 'lease_end_date'],
  },
  {
    name: 'rent_payment',
    title: 'Rent Payment',
    category: 'rent' as ClauseCategory,
    content: 'Tenant agrees to pay Landlord the sum of {{monthly_rent}} per month as rent for the Premises. Rent is due on the {{rent_due_day}} day of each month and shall be paid to Landlord at {{payment_address}} or by electronic payment as directed by Landlord.',
    summary: 'Specifies monthly rent amount and payment terms',
    requirement: 'required' as ClauseRequirement,
    variables: ['monthly_rent', 'rent_due_day', 'payment_address'],
  },
  {
    name: 'late_fee',
    title: 'Late Fee',
    category: 'rent' as ClauseCategory,
    content: 'If rent is not received by the {{grace_period_days}} day of the month, Tenant shall pay a late fee of {{late_fee_amount}}. This late fee is in addition to the monthly rent and any other charges that may be due.',
    summary: 'Defines late fee terms and grace period',
    requirement: 'optional' as ClauseRequirement,
    variables: ['grace_period_days', 'late_fee_amount'],
  },
  {
    name: 'security_deposit',
    title: 'Security Deposit',
    category: 'security_deposit' as ClauseCategory,
    content: 'Upon execution of this Agreement, Tenant shall deposit with Landlord the sum of {{security_deposit_amount}} as a security deposit. This deposit shall be held by Landlord as security for the faithful performance by Tenant of all terms, covenants, and conditions of this Lease.',
    summary: 'Specifies security deposit amount and terms',
    requirement: 'required' as ClauseRequirement,
    variables: ['security_deposit_amount'],
  },
  {
    name: 'maintenance_responsibility',
    title: 'Maintenance and Repairs',
    category: 'maintenance' as ClauseCategory,
    content: 'Landlord shall maintain the Premises in a habitable condition and shall be responsible for repairs to the structure, roof, plumbing, heating, electrical systems, and appliances provided by Landlord. Tenant shall be responsible for keeping the Premises clean and for repairs to damage caused by Tenant or Tenant\'s guests.',
    summary: 'Defines maintenance responsibilities',
    requirement: 'required' as ClauseRequirement,
    variables: [],
  },
  {
    name: 'utilities',
    title: 'Utilities',
    category: 'utilities' as ClauseCategory,
    content: 'Tenant shall be responsible for payment of the following utilities: {{tenant_utilities}}. Landlord shall be responsible for payment of the following utilities: {{landlord_utilities}}.',
    summary: 'Specifies utility payment responsibilities',
    requirement: 'required' as ClauseRequirement,
    variables: ['tenant_utilities', 'landlord_utilities'],
  },
  {
    name: 'pet_policy',
    title: 'Pet Policy',
    category: 'pets' as ClauseCategory,
    content: 'Tenant {{pets_allowed}} keep pets on the Premises. {{pet_restrictions}}',
    summary: 'Defines pet policy and restrictions',
    requirement: 'conditional' as ClauseRequirement,
    variables: ['pets_allowed', 'pet_restrictions'],
  },
];

// Initialize default clauses if not present
async function initializeDefaultClauses(): Promise<void> {
  const existingCount = await prisma.leaseClause.count();
  if (existingCount > 0) return;

  for (const clauseData of defaultClausesData) {
    await prisma.leaseClause.create({
      data: {
        name: clauseData.name,
        title: clauseData.title,
        category: clauseData.category as PrismaClauseCategory,
        content: clauseData.content,
        summary: clauseData.summary,
        requirement: clauseData.requirement as PrismaClauseRequirement,
        variables: clauseData.variables,
        dependencies: [],
        incompatibleWith: [],
        version: 1,
        isActive: true,
      },
    });
  }
}

// Route handlers
export async function leaseTemplateRoutes(app: FastifyInstance): Promise<void> {
  // Initialize default clauses on startup
  await initializeDefaultClauses();

  // Clause routes
  app.post('/clauses', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createClauseSchema.parse(request.body);

    const clause = await prisma.leaseClause.create({
      data: {
        name: body.name,
        title: body.title,
        category: body.category as PrismaClauseCategory,
        content: body.content,
        summary: body.summary,
        jurisdiction: body.jurisdiction,
        jurisdictionType: body.jurisdictionType as PrismaJurisdictionType | undefined,
        requirement: body.requirement as PrismaClauseRequirement,
        variables: body.variables || [],
        dependencies: body.dependencies || [],
        incompatibleWith: body.incompatibleWith || [],
        effectiveDate: body.effectiveDate ? new Date(body.effectiveDate) : undefined,
        expiryDate: body.expiryDate ? new Date(body.expiryDate) : undefined,
        legalReference: body.legalReference,
        version: 1,
        isActive: true,
      },
    });

    return reply.status(201).send({
      success: true,
      data: {
        ...clause,
        createdAt: clause.createdAt.toISOString(),
        updatedAt: clause.updatedAt.toISOString(),
        effectiveDate: clause.effectiveDate?.toISOString(),
        expiryDate: clause.expiryDate?.toISOString(),
      },
    });
  });

  app.get('/clauses', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      category?: ClauseCategory;
      jurisdiction?: string;
      requirement?: ClauseRequirement;
      search?: string;
      activeOnly?: string;
    };

    const where: Prisma.LeaseClauseWhereInput = {};

    if (query.category) {
      where.category = query.category as PrismaClauseCategory;
    }
    if (query.jurisdiction) {
      where.OR = [
        { jurisdiction: query.jurisdiction },
        { jurisdiction: null },
      ];
    }
    if (query.requirement) {
      where.requirement = query.requirement as PrismaClauseRequirement;
    }
    if (query.search) {
      const search = query.search.toLowerCase();
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { title: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (query.activeOnly !== 'false') {
      where.isActive = true;
    }

    const results = await prisma.leaseClause.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    // Group by category
    const grouped = results.reduce((acc, clause) => {
      const cat = clause.category as ClauseCategory;
      if (!acc[cat]) {
        acc[cat] = [];
      }
      acc[cat].push(clause);
      return acc;
    }, {} as Record<ClauseCategory, typeof results>);

    return reply.send({
      success: true,
      data: results,
      grouped,
      total: results.length,
    });
  });

  app.get('/clauses/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const clause = await prisma.leaseClause.findUnique({
      where: { id },
    });

    if (!clause) {
      return reply.status(404).send({
        success: false,
        error: 'Clause not found',
      });
    }

    return reply.send({
      success: true,
      data: clause,
    });
  });

  app.patch('/clauses/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = updateClauseSchema.parse(request.body);

    const clause = await prisma.leaseClause.findUnique({
      where: { id },
    });

    if (!clause) {
      return reply.status(404).send({
        success: false,
        error: 'Clause not found',
      });
    }

    const updateData: Prisma.LeaseClauseUpdateInput = {
      version: clause.version + 1,
    };

    if (body.name) updateData.name = body.name;
    if (body.title) updateData.title = body.title;
    if (body.category) updateData.category = body.category as PrismaClauseCategory;
    if (body.content) updateData.content = body.content;
    if (body.summary !== undefined) updateData.summary = body.summary;
    if (body.requirement) updateData.requirement = body.requirement as PrismaClauseRequirement;
    if (body.variables) updateData.variables = body.variables;
    if (body.legalReference !== undefined) updateData.legalReference = body.legalReference;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;

    const updated = await prisma.leaseClause.update({
      where: { id },
      data: updateData,
    });

    return reply.send({
      success: true,
      data: updated,
    });
  });

  // Template routes
  app.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createTemplateSchema.parse(request.body);

    const template = await prisma.leaseTemplate.create({
      data: {
        name: body.name,
        description: body.description,
        propertyType: body.propertyType,
        jurisdiction: body.jurisdiction,
        jurisdictionType: body.jurisdictionType as PrismaJurisdictionType,
        status: 'draft' as PrismaLeaseTemplateStatus,
        version: 1,
        variables: (body.variables || []) as unknown as Prisma.JsonValue,
        metadata: {
          estimatedPages: body.metadata?.estimatedPages || 5,
          requiredSignatures: body.metadata?.requiredSignatures || 2,
          notarizationRequired: body.metadata?.notarizationRequired || false,
          witnessRequired: body.metadata?.witnessRequired || false,
          lastLegalReview: null,
          complianceNotes: body.metadata?.complianceNotes || [],
        } as unknown as Prisma.JsonValue,
        createdById: body.createdById,
      },
    });

    // Add clauses if provided
    if (body.clauseIds && body.clauseIds.length > 0) {
      const clauseData = body.clauseIds.map((clauseId, index) => ({
        templateId: template.id,
        clauseId,
        order: index,
        isRequired: false,
        conditions: [] as unknown as Prisma.JsonValue,
      }));

      await prisma.leaseTemplateClause.createMany({
        data: clauseData,
      });
    }

    const templateWithClauses = await prisma.leaseTemplate.findUnique({
      where: { id: template.id },
      include: { templateClauses: true },
    });

    return reply.status(201).send({
      success: true,
      data: templateWithClauses,
    });
  });

  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      jurisdiction?: string;
      propertyType?: string;
      status?: TemplateStatus;
    };

    const where: Prisma.LeaseTemplateWhereInput = {};

    if (query.jurisdiction) {
      where.jurisdiction = query.jurisdiction;
    }
    if (query.propertyType) {
      where.propertyType = query.propertyType;
    }
    if (query.status) {
      where.status = query.status as PrismaLeaseTemplateStatus;
    }

    const results = await prisma.leaseTemplate.findMany({
      where,
      include: { templateClauses: true },
      orderBy: { updatedAt: 'desc' },
    });

    return reply.send({
      success: true,
      data: results,
      total: results.length,
    });
  });

  app.get('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const template = await prisma.leaseTemplate.findUnique({
      where: { id },
      include: {
        templateClauses: {
          include: { clause: true },
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!template) {
      return reply.status(404).send({
        success: false,
        error: 'Template not found',
      });
    }

    return reply.send({
      success: true,
      data: template,
    });
  });

  app.patch('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = updateTemplateSchema.parse(request.body);

    const template = await prisma.leaseTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      return reply.status(404).send({
        success: false,
        error: 'Template not found',
      });
    }

    const updateData: Prisma.LeaseTemplateUpdateInput = {};
    if (body.name) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.status) {
      updateData.status = body.status as PrismaLeaseTemplateStatus;
      if (body.status === 'active' && template.status !== 'active') {
        updateData.publishedAt = new Date();
      }
    }

    const updated = await prisma.leaseTemplate.update({
      where: { id },
      data: updateData,
    });

    return reply.send({
      success: true,
      data: updated,
    });
  });

  app.post('/:id/clauses', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = addClauseToTemplateSchema.parse(request.body);

    const template = await prisma.leaseTemplate.findUnique({
      where: { id },
      include: { templateClauses: true },
    });

    if (!template) {
      return reply.status(404).send({
        success: false,
        error: 'Template not found',
      });
    }

    const clause = await prisma.leaseClause.findUnique({
      where: { id: body.clauseId },
    });

    if (!clause) {
      return reply.status(404).send({
        success: false,
        error: 'Clause not found',
      });
    }

    // Check for incompatibilities
    const existingClauseIds = template.templateClauses.map((c) => c.clauseId);
    for (const existingId of existingClauseIds) {
      if (clause.incompatibleWith.includes(existingId)) {
        const incompatibleClause = await prisma.leaseClause.findUnique({
          where: { id: existingId },
        });
        return reply.status(400).send({
          success: false,
          error: `Clause "${clause.name}" is incompatible with existing clause "${incompatibleClause?.name}"`,
        });
      }
    }

    const templateClause = await prisma.leaseTemplateClause.create({
      data: {
        templateId: id,
        clauseId: body.clauseId,
        order: body.order ?? template.templateClauses.length,
        isRequired: body.isRequired,
        customContent: body.customContent,
        conditions: (body.conditions || []) as unknown as Prisma.JsonValue,
      },
    });

    return reply.status(201).send({
      success: true,
      data: templateClause,
    });
  });

  app.delete('/:id/clauses/:clauseId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, clauseId } = request.params as { id: string; clauseId: string };

    const template = await prisma.leaseTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      return reply.status(404).send({
        success: false,
        error: 'Template not found',
      });
    }

    const templateClause = await prisma.leaseTemplateClause.findFirst({
      where: { templateId: id, clauseId },
    });

    if (!templateClause) {
      return reply.status(404).send({
        success: false,
        error: 'Clause not found in template',
      });
    }

    await prisma.leaseTemplateClause.delete({
      where: { id: templateClause.id },
    });

    return reply.send({
      success: true,
      message: 'Clause removed from template',
    });
  });

  app.post('/:id/publish', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const template = await prisma.leaseTemplate.findUnique({
      where: { id },
      include: { templateClauses: true },
    });

    if (!template) {
      return reply.status(404).send({
        success: false,
        error: 'Template not found',
      });
    }

    // Validate required clauses are present
    const requiredClauses = await prisma.leaseClause.findMany({
      where: { requirement: 'required', isActive: true },
    });

    const missingRequired = requiredClauses.filter(
      (rc) => !template.templateClauses.some((tc) => tc.clauseId === rc.id)
    );

    if (missingRequired.length > 0) {
      return reply.status(400).send({
        success: false,
        error: `Missing required clauses: ${missingRequired.map((c) => c.name).join(', ')}`,
        missingClauses: missingRequired.map((c) => ({ id: c.id, name: c.name, title: c.title })),
      });
    }

    const updated = await prisma.leaseTemplate.update({
      where: { id },
      data: {
        status: 'active',
        publishedAt: new Date(),
      },
    });

    return reply.send({
      success: true,
      data: updated,
    });
  });

  app.post('/:id/clone', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { name: string; createdById: string };

    const template = await prisma.leaseTemplate.findUnique({
      where: { id },
      include: { templateClauses: true },
    });

    if (!template) {
      return reply.status(404).send({
        success: false,
        error: 'Template not found',
      });
    }

    const cloned = await prisma.leaseTemplate.create({
      data: {
        name: body.name || `${template.name} (Copy)`,
        description: template.description,
        propertyType: template.propertyType,
        jurisdiction: template.jurisdiction,
        jurisdictionType: template.jurisdictionType,
        status: 'draft',
        version: 1,
        parentVersionId: id,
        variables: template.variables,
        metadata: template.metadata,
        createdById: body.createdById,
      },
    });

    // Clone clauses
    if (template.templateClauses.length > 0) {
      await prisma.leaseTemplateClause.createMany({
        data: template.templateClauses.map((c) => ({
          templateId: cloned.id,
          clauseId: c.clauseId,
          order: c.order,
          isRequired: c.isRequired,
          customContent: c.customContent,
          conditions: c.conditions,
        })),
      });
    }

    const clonedWithClauses = await prisma.leaseTemplate.findUnique({
      where: { id: cloned.id },
      include: { templateClauses: true },
    });

    return reply.status(201).send({
      success: true,
      data: clonedWithClauses,
    });
  });

  // Generate lease from template
  app.post('/generate', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = generateLeaseSchema.parse(request.body);

    const template = await prisma.leaseTemplate.findUnique({
      where: { id: body.templateId },
      include: {
        templateClauses: {
          include: { clause: true },
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!template) {
      return reply.status(404).send({
        success: false,
        error: 'Template not found',
      });
    }

    if (template.status !== 'active') {
      return reply.status(400).send({
        success: false,
        error: 'Template must be active to generate leases',
      });
    }

    const templateVariables = (template.variables || []) as TemplateVariable[];

    // Validate required variables
    const missingVars = templateVariables
      .filter((v) => v.required && body.variables[v.name] === undefined)
      .map((v) => v.name);

    if (missingVars.length > 0) {
      return reply.status(400).send({
        success: false,
        error: `Missing required variables: ${missingVars.join(', ')}`,
      });
    }

    // Build variables with defaults
    const variables: Record<string, string | number | boolean | Date> = {};
    for (const templateVar of templateVariables) {
      if (body.variables[templateVar.name] !== undefined) {
        variables[templateVar.name] = body.variables[templateVar.name];
      } else if (templateVar.defaultValue !== null) {
        variables[templateVar.name] = templateVar.defaultValue;
      }
    }

    // Generate clause content
    const generatedClauses: Array<{ clauseId: string; title: string; content: string; order: number }> = [];

    for (const templateClause of template.templateClauses) {
      const conditions = (templateClause.conditions || []) as ClauseCondition[];
      if (!shouldIncludeClause(conditions, variables)) {
        continue;
      }

      const clause = templateClause.clause;
      if (!clause) continue;

      const content = templateClause.customContent || clause.content;
      const interpolatedContent = interpolateVariables(content, variables);

      generatedClauses.push({
        clauseId: clause.id,
        title: clause.title,
        content: interpolatedContent,
        order: templateClause.order,
      });
    }

    generatedClauses.sort((a, b) => a.order - b.order);

    // Build full document content
    const fullContent = generatedClauses
      .map((c, index) => `${index + 1}. ${c.title}\n\n${c.content}`)
      .join('\n\n');

    const generated = await prisma.generatedLease.create({
      data: {
        templateId: template.id,
        templateVersion: template.version,
        propertyId: body.propertyId,
        unitId: body.unitId,
        landlordId: body.landlordId,
        tenantIds: body.tenantIds,
        variables: variables as unknown as Prisma.JsonValue,
        content: fullContent,
        clauses: generatedClauses as unknown as Prisma.JsonValue,
        status: 'draft' as PrismaGeneratedLeaseStatus,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      },
    });

    return reply.status(201).send({
      success: true,
      data: {
        ...generated,
        signatureRequests: [],
      },
    });
  });

  // Get generated lease
  app.get('/generated/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const lease = await prisma.generatedLease.findUnique({
      where: { id },
      include: { signatureRequests: true },
    });

    if (!lease) {
      return reply.status(404).send({
        success: false,
        error: 'Generated lease not found',
      });
    }

    return reply.send({
      success: true,
      data: lease,
    });
  });

  // List generated leases
  app.get('/generated', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      propertyId?: string;
      templateId?: string;
      status?: string;
    };

    const where: Prisma.GeneratedLeaseWhereInput = {};

    if (query.propertyId) {
      where.propertyId = query.propertyId;
    }
    if (query.templateId) {
      where.templateId = query.templateId;
    }
    if (query.status) {
      where.status = query.status as PrismaGeneratedLeaseStatus;
    }

    const results = await prisma.generatedLease.findMany({
      where,
      include: { signatureRequests: true },
      orderBy: { generatedAt: 'desc' },
    });

    return reply.send({
      success: true,
      data: results,
      total: results.length,
    });
  });

  // Preview clause with variables
  app.post('/clauses/:id/preview', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { variables: Record<string, string | number | boolean> };

    const clause = await prisma.leaseClause.findUnique({
      where: { id },
    });

    if (!clause) {
      return reply.status(404).send({
        success: false,
        error: 'Clause not found',
      });
    }

    const preview = interpolateVariables(clause.content, body.variables || {});

    return reply.send({
      success: true,
      data: {
        clauseId: id,
        title: clause.title,
        original: clause.content,
        preview,
        missingVariables: clause.variables.filter((v) => !body.variables?.[v]),
      },
    });
  });
}
