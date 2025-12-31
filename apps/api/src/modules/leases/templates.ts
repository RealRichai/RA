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

// In-memory stores
const templates = new Map<string, LeaseTemplate>();
const clauses = new Map<string, Clause>();
const generatedLeases = new Map<string, GeneratedLease>();

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
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function interpolateVariables(content: string, variables: Record<string, string | number | boolean | Date>): string {
  let result = content;

  for (const [key, value] of Object.entries(variables)) {
    const placeholder = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
    let displayValue: string;

    if (value instanceof Date) {
      displayValue = value.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    } else if (typeof value === 'number') {
      // Check if it's likely a currency value
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

function evaluateCondition(condition: ClauseCondition, variables: Record<string, string | number | boolean | Date>): boolean {
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

function shouldIncludeClause(templateClause: TemplateClause, variables: Record<string, string | number | boolean | Date>): boolean {
  if (templateClause.conditions.length === 0) {
    return true;
  }

  return templateClause.conditions.every((condition) => evaluateCondition(condition, variables));
}

// Initialize default clauses
function initializeDefaultClauses(): void {
  const defaultClauses: Omit<Clause, 'id' | 'createdAt' | 'updatedAt'>[] = [
    {
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
    },
    {
      name: 'lease_term',
      title: 'Lease Term',
      category: 'general',
      content: 'The term of this Lease shall commence on {{lease_start_date}} and shall terminate on {{lease_end_date}}, unless sooner terminated or extended in accordance with the terms of this Agreement.',
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
    },
    {
      name: 'rent_payment',
      title: 'Rent Payment',
      category: 'rent',
      content: 'Tenant agrees to pay Landlord the sum of {{monthly_rent}} per month as rent for the Premises. Rent is due on the {{rent_due_day}} day of each month and shall be paid to Landlord at {{payment_address}} or by electronic payment as directed by Landlord.',
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
    },
    {
      name: 'late_fee',
      title: 'Late Fee',
      category: 'rent',
      content: 'If rent is not received by the {{grace_period_days}} day of the month, Tenant shall pay a late fee of {{late_fee_amount}}. This late fee is in addition to the monthly rent and any other charges that may be due.',
      summary: 'Defines late fee terms and grace period',
      jurisdiction: null,
      jurisdictionType: null,
      requirement: 'optional',
      variables: ['grace_period_days', 'late_fee_amount'],
      dependencies: [],
      incompatibleWith: [],
      effectiveDate: null,
      expiryDate: null,
      legalReference: null,
      version: 1,
      isActive: true,
    },
    {
      name: 'security_deposit',
      title: 'Security Deposit',
      category: 'security_deposit',
      content: 'Upon execution of this Agreement, Tenant shall deposit with Landlord the sum of {{security_deposit_amount}} as a security deposit. This deposit shall be held by Landlord as security for the faithful performance by Tenant of all terms, covenants, and conditions of this Lease.',
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
    },
    {
      name: 'security_deposit_nyc',
      title: 'Security Deposit (NYC)',
      category: 'security_deposit',
      content: 'Upon execution of this Agreement, Tenant shall deposit with Landlord the sum of {{security_deposit_amount}} as a security deposit, which shall not exceed one month\'s rent. Landlord shall deposit the security deposit in an interest-bearing account in a New York banking organization. The Landlord shall provide Tenant with written notice of the name and address of the banking organization where the deposit is being held.',
      summary: 'NYC-compliant security deposit terms',
      jurisdiction: 'NYC',
      jurisdictionType: 'city',
      requirement: 'required',
      variables: ['security_deposit_amount'],
      dependencies: [],
      incompatibleWith: [],
      effectiveDate: null,
      expiryDate: null,
      legalReference: 'NY Gen. Oblig. Law § 7-103',
      version: 1,
      isActive: true,
    },
    {
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
    },
    {
      name: 'pet_deposit',
      title: 'Pet Deposit',
      category: 'pets',
      content: 'Tenant shall pay a non-refundable pet deposit of {{pet_deposit_amount}} and an additional monthly pet rent of {{pet_rent}} for each approved pet.',
      summary: 'Specifies pet deposit and pet rent',
      jurisdiction: null,
      jurisdictionType: null,
      requirement: 'conditional',
      variables: ['pet_deposit_amount', 'pet_rent'],
      dependencies: [],
      incompatibleWith: [],
      effectiveDate: null,
      expiryDate: null,
      legalReference: null,
      version: 1,
      isActive: true,
    },
    {
      name: 'maintenance_responsibility',
      title: 'Maintenance and Repairs',
      category: 'maintenance',
      content: 'Landlord shall maintain the Premises in a habitable condition and shall be responsible for repairs to the structure, roof, plumbing, heating, electrical systems, and appliances provided by Landlord. Tenant shall be responsible for keeping the Premises clean and for repairs to damage caused by Tenant or Tenant\'s guests.',
      summary: 'Defines maintenance responsibilities',
      jurisdiction: null,
      jurisdictionType: null,
      requirement: 'required',
      variables: [],
      dependencies: [],
      incompatibleWith: [],
      effectiveDate: null,
      expiryDate: null,
      legalReference: null,
      version: 1,
      isActive: true,
    },
    {
      name: 'utilities',
      title: 'Utilities',
      category: 'utilities',
      content: 'Tenant shall be responsible for payment of the following utilities: {{tenant_utilities}}. Landlord shall be responsible for payment of the following utilities: {{landlord_utilities}}.',
      summary: 'Specifies utility payment responsibilities',
      jurisdiction: null,
      jurisdictionType: null,
      requirement: 'required',
      variables: ['tenant_utilities', 'landlord_utilities'],
      dependencies: [],
      incompatibleWith: [],
      effectiveDate: null,
      expiryDate: null,
      legalReference: null,
      version: 1,
      isActive: true,
    },
    {
      name: 'early_termination',
      title: 'Early Termination',
      category: 'termination',
      content: 'Tenant may terminate this Lease early by providing {{early_termination_notice}} days written notice and paying an early termination fee of {{early_termination_fee}}. This fee is in addition to all rent due through the termination date.',
      summary: 'Defines early termination terms and fees',
      jurisdiction: null,
      jurisdictionType: null,
      requirement: 'optional',
      variables: ['early_termination_notice', 'early_termination_fee'],
      dependencies: [],
      incompatibleWith: [],
      effectiveDate: null,
      expiryDate: null,
      legalReference: null,
      version: 1,
      isActive: true,
    },
    {
      name: 'lead_paint_disclosure',
      title: 'Lead-Based Paint Disclosure',
      category: 'disclosure',
      content: 'Housing built before 1978 may contain lead-based paint. Lead from paint, paint chips, and dust can pose health hazards if not managed properly. Landlord has provided Tenant with the EPA pamphlet "Protect Your Family From Lead in Your Home" and has disclosed any known lead-based paint and/or lead-based paint hazards in the Premises.',
      summary: 'Required disclosure for pre-1978 housing',
      jurisdiction: null,
      jurisdictionType: 'federal',
      requirement: 'conditional',
      variables: [],
      dependencies: [],
      incompatibleWith: [],
      effectiveDate: null,
      expiryDate: null,
      legalReference: '42 U.S.C. 4852d',
      version: 1,
      isActive: true,
    },
    {
      name: 'mold_disclosure',
      title: 'Mold Disclosure',
      category: 'disclosure',
      content: 'Landlord has no knowledge of mold or mildew contamination in the Premises. Tenant agrees to maintain the Premises in a manner that prevents the occurrence of mold or mildew, including adequate ventilation and prompt reporting of any water leaks or moisture issues.',
      summary: 'Mold disclosure and prevention responsibilities',
      jurisdiction: null,
      jurisdictionType: null,
      requirement: 'optional',
      variables: [],
      dependencies: [],
      incompatibleWith: [],
      effectiveDate: null,
      expiryDate: null,
      legalReference: null,
      version: 1,
      isActive: true,
    },
    {
      name: 'rent_stabilization_rider',
      title: 'Rent Stabilization Rider',
      category: 'compliance',
      content: 'This apartment is subject to the Rent Stabilization Law and Code. The legal regulated rent for this apartment is {{legal_rent}}. The tenant has the right to receive a copy of the apartment\'s rental history and to challenge the rent if it appears to be incorrect.',
      summary: 'Required rider for rent-stabilized apartments',
      jurisdiction: 'NYC',
      jurisdictionType: 'city',
      requirement: 'conditional',
      variables: ['legal_rent'],
      dependencies: [],
      incompatibleWith: [],
      effectiveDate: null,
      expiryDate: null,
      legalReference: 'NYC Rent Stabilization Code',
      version: 1,
      isActive: true,
    },
  ];

  const now = new Date();
  for (const clauseData of defaultClauses) {
    const clause: Clause = {
      id: generateId(),
      ...clauseData,
      createdAt: now,
      updatedAt: now,
    };
    clauses.set(clause.id, clause);
  }
}

initializeDefaultClauses();

// Route handlers
export async function leaseTemplateRoutes(app: FastifyInstance): Promise<void> {
  // Clause routes
  app.post('/clauses', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createClauseSchema.parse(request.body);
    const now = new Date();

    const clause: Clause = {
      id: generateId(),
      name: body.name,
      title: body.title,
      category: body.category,
      content: body.content,
      summary: body.summary || null,
      jurisdiction: body.jurisdiction || null,
      jurisdictionType: body.jurisdictionType || null,
      requirement: body.requirement,
      variables: body.variables || [],
      dependencies: body.dependencies || [],
      incompatibleWith: body.incompatibleWith || [],
      effectiveDate: body.effectiveDate ? new Date(body.effectiveDate) : null,
      expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
      legalReference: body.legalReference || null,
      version: 1,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    clauses.set(clause.id, clause);

    return reply.status(201).send({
      success: true,
      data: clause,
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

    let results = Array.from(clauses.values());

    if (query.category) {
      results = results.filter((c) => c.category === query.category);
    }
    if (query.jurisdiction) {
      results = results.filter((c) => c.jurisdiction === query.jurisdiction || c.jurisdiction === null);
    }
    if (query.requirement) {
      results = results.filter((c) => c.requirement === query.requirement);
    }
    if (query.search) {
      const search = query.search.toLowerCase();
      results = results.filter(
        (c) =>
          c.name.toLowerCase().includes(search) ||
          c.title.toLowerCase().includes(search) ||
          c.content.toLowerCase().includes(search)
      );
    }
    if (query.activeOnly !== 'false') {
      results = results.filter((c) => c.isActive);
    }

    // Group by category
    const grouped = results.reduce((acc, clause) => {
      if (!acc[clause.category]) {
        acc[clause.category] = [];
      }
      acc[clause.category].push(clause);
      return acc;
    }, {} as Record<ClauseCategory, Clause[]>);

    return reply.send({
      success: true,
      data: results,
      grouped,
      total: results.length,
    });
  });

  app.get('/clauses/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const clause = clauses.get(id);

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
    const clause = clauses.get(id);

    if (!clause) {
      return reply.status(404).send({
        success: false,
        error: 'Clause not found',
      });
    }

    const updated: Clause = {
      ...clause,
      ...body,
      version: clause.version + 1,
      updatedAt: new Date(),
    };

    clauses.set(id, updated);

    return reply.send({
      success: true,
      data: updated,
    });
  });

  // Template routes
  app.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createTemplateSchema.parse(request.body);
    const now = new Date();

    const templateClauses: TemplateClause[] = [];
    if (body.clauseIds) {
      body.clauseIds.forEach((clauseId, index) => {
        const clause = clauses.get(clauseId);
        if (clause) {
          templateClauses.push({
            id: generateId(),
            templateId: '',
            clauseId,
            order: index,
            isRequired: clause.requirement === 'required',
            customContent: null,
            conditions: [],
          });
        }
      });
    }

    const template: LeaseTemplate = {
      id: generateId(),
      name: body.name,
      description: body.description || null,
      propertyType: body.propertyType,
      jurisdiction: body.jurisdiction,
      jurisdictionType: body.jurisdictionType,
      status: 'draft',
      version: 1,
      parentVersionId: null,
      clauses: templateClauses,
      variables: body.variables || [],
      metadata: {
        estimatedPages: body.metadata?.estimatedPages || 5,
        requiredSignatures: body.metadata?.requiredSignatures || 2,
        notarizationRequired: body.metadata?.notarizationRequired || false,
        witnessRequired: body.metadata?.witnessRequired || false,
        lastLegalReview: null,
        complianceNotes: body.metadata?.complianceNotes || [],
      },
      createdById: body.createdById,
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
    };

    // Update template IDs on clauses
    template.clauses.forEach((c) => {
      c.templateId = template.id;
    });

    templates.set(template.id, template);

    return reply.status(201).send({
      success: true,
      data: template,
    });
  });

  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      jurisdiction?: string;
      propertyType?: string;
      status?: TemplateStatus;
    };

    let results = Array.from(templates.values());

    if (query.jurisdiction) {
      results = results.filter((t) => t.jurisdiction === query.jurisdiction);
    }
    if (query.propertyType) {
      results = results.filter((t) => t.propertyType === query.propertyType);
    }
    if (query.status) {
      results = results.filter((t) => t.status === query.status);
    }

    results.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    return reply.send({
      success: true,
      data: results,
      total: results.length,
    });
  });

  app.get('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const template = templates.get(id);

    if (!template) {
      return reply.status(404).send({
        success: false,
        error: 'Template not found',
      });
    }

    // Enrich with full clause data
    const enrichedClauses = template.clauses.map((tc) => {
      const clause = clauses.get(tc.clauseId);
      return {
        ...tc,
        clause,
      };
    });

    return reply.send({
      success: true,
      data: {
        ...template,
        clauses: enrichedClauses,
      },
    });
  });

  app.patch('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = updateTemplateSchema.parse(request.body);
    const template = templates.get(id);

    if (!template) {
      return reply.status(404).send({
        success: false,
        error: 'Template not found',
      });
    }

    const updated: LeaseTemplate = {
      ...template,
      ...body,
      updatedAt: new Date(),
    };

    if (body.status === 'active' && template.status !== 'active') {
      updated.publishedAt = new Date();
    }

    templates.set(id, updated);

    return reply.send({
      success: true,
      data: updated,
    });
  });

  app.post('/:id/clauses', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = addClauseToTemplateSchema.parse(request.body);
    const template = templates.get(id);

    if (!template) {
      return reply.status(404).send({
        success: false,
        error: 'Template not found',
      });
    }

    const clause = clauses.get(body.clauseId);
    if (!clause) {
      return reply.status(404).send({
        success: false,
        error: 'Clause not found',
      });
    }

    // Check for incompatibilities
    const existingClauseIds = template.clauses.map((c) => c.clauseId);
    for (const existingId of existingClauseIds) {
      if (clause.incompatibleWith.includes(existingId)) {
        const incompatibleClause = clauses.get(existingId);
        return reply.status(400).send({
          success: false,
          error: `Clause "${clause.name}" is incompatible with existing clause "${incompatibleClause?.name}"`,
        });
      }
    }

    const templateClause: TemplateClause = {
      id: generateId(),
      templateId: id,
      clauseId: body.clauseId,
      order: body.order ?? template.clauses.length,
      isRequired: body.isRequired,
      customContent: body.customContent || null,
      conditions: body.conditions || [],
    };

    template.clauses.push(templateClause);
    template.clauses.sort((a, b) => a.order - b.order);
    template.updatedAt = new Date();
    templates.set(id, template);

    return reply.status(201).send({
      success: true,
      data: templateClause,
    });
  });

  app.delete('/:id/clauses/:clauseId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, clauseId } = request.params as { id: string; clauseId: string };
    const template = templates.get(id);

    if (!template) {
      return reply.status(404).send({
        success: false,
        error: 'Template not found',
      });
    }

    const clauseIndex = template.clauses.findIndex((c) => c.clauseId === clauseId);
    if (clauseIndex === -1) {
      return reply.status(404).send({
        success: false,
        error: 'Clause not found in template',
      });
    }

    template.clauses.splice(clauseIndex, 1);
    template.updatedAt = new Date();
    templates.set(id, template);

    return reply.send({
      success: true,
      message: 'Clause removed from template',
    });
  });

  app.post('/:id/publish', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const template = templates.get(id);

    if (!template) {
      return reply.status(404).send({
        success: false,
        error: 'Template not found',
      });
    }

    // Validate required clauses are present
    const requiredClauses = Array.from(clauses.values()).filter((c) => c.requirement === 'required');
    const missingRequired = requiredClauses.filter(
      (rc) => !template.clauses.some((tc) => tc.clauseId === rc.id)
    );

    if (missingRequired.length > 0) {
      return reply.status(400).send({
        success: false,
        error: `Missing required clauses: ${missingRequired.map((c) => c.name).join(', ')}`,
        missingClauses: missingRequired.map((c) => ({ id: c.id, name: c.name, title: c.title })),
      });
    }

    template.status = 'active';
    template.publishedAt = new Date();
    template.updatedAt = new Date();
    templates.set(id, template);

    return reply.send({
      success: true,
      data: template,
    });
  });

  app.post('/:id/clone', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { name: string; createdById: string };
    const template = templates.get(id);

    if (!template) {
      return reply.status(404).send({
        success: false,
        error: 'Template not found',
      });
    }

    const now = new Date();
    const cloned: LeaseTemplate = {
      ...template,
      id: generateId(),
      name: body.name || `${template.name} (Copy)`,
      status: 'draft',
      version: 1,
      parentVersionId: id,
      clauses: template.clauses.map((c) => ({
        ...c,
        id: generateId(),
        templateId: '',
      })),
      createdById: body.createdById,
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
    };

    cloned.clauses.forEach((c) => {
      c.templateId = cloned.id;
    });

    templates.set(cloned.id, cloned);

    return reply.status(201).send({
      success: true,
      data: cloned,
    });
  });

  // Generate lease from template
  app.post('/generate', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = generateLeaseSchema.parse(request.body);
    const template = templates.get(body.templateId);

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

    // Validate required variables
    const missingVars = template.variables
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
    for (const templateVar of template.variables) {
      if (body.variables[templateVar.name] !== undefined) {
        variables[templateVar.name] = body.variables[templateVar.name];
      } else if (templateVar.defaultValue !== null) {
        variables[templateVar.name] = templateVar.defaultValue;
      }
    }

    // Generate clause content
    const generatedClauses: Array<{ clauseId: string; title: string; content: string; order: number }> = [];

    for (const templateClause of template.clauses) {
      if (!shouldIncludeClause(templateClause, variables)) {
        continue;
      }

      const clause = clauses.get(templateClause.clauseId);
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

    const now = new Date();
    const generated: GeneratedLease = {
      id: generateId(),
      templateId: template.id,
      templateVersion: template.version,
      propertyId: body.propertyId,
      unitId: body.unitId || null,
      landlordId: body.landlordId,
      tenantIds: body.tenantIds,
      variables,
      content: fullContent,
      clauses: generatedClauses,
      status: 'draft',
      signatureRequests: [],
      generatedAt: now,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    };

    generatedLeases.set(generated.id, generated);

    return reply.status(201).send({
      success: true,
      data: generated,
    });
  });

  // Get generated lease
  app.get('/generated/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const lease = generatedLeases.get(id);

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

    let results = Array.from(generatedLeases.values());

    if (query.propertyId) {
      results = results.filter((l) => l.propertyId === query.propertyId);
    }
    if (query.templateId) {
      results = results.filter((l) => l.templateId === query.templateId);
    }
    if (query.status) {
      results = results.filter((l) => l.status === query.status);
    }

    results.sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime());

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
    const clause = clauses.get(id);

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

// Export for testing
export { templates, clauses, generatedLeases, interpolateVariables, evaluateCondition, shouldIncludeClause };
