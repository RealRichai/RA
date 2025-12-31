import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// Types
export type PolicyType = 'property' | 'liability' | 'renters' | 'umbrella' | 'flood' | 'earthquake' | 'workers_comp' | 'business_interruption';
export type PolicyStatus = 'active' | 'pending' | 'expired' | 'cancelled' | 'lapsed';
export type CertificateStatus = 'valid' | 'expired' | 'pending_verification' | 'rejected';
export type ClaimStatus = 'reported' | 'under_review' | 'approved' | 'denied' | 'paid' | 'closed';
export type AlertType = 'expiration' | 'renewal' | 'coverage_gap' | 'claim_update' | 'certificate_expiring';
export type AlertPriority = 'low' | 'medium' | 'high' | 'critical';

export interface InsurancePolicy {
  id: string;
  propertyId: string | null;
  entityId: string | null;
  entityType: 'property' | 'portfolio' | 'company' | 'vendor' | 'tenant';
  policyType: PolicyType;
  policyNumber: string;
  carrier: string;
  carrierContact: CarrierContact | null;
  status: PolicyStatus;
  effectiveDate: Date;
  expirationDate: Date;
  premium: number;
  premiumFrequency: 'monthly' | 'quarterly' | 'annual';
  deductible: number;
  coverageAmount: number;
  coverageDetails: CoverageDetail[];
  additionalInsured: AdditionalInsured[];
  documents: PolicyDocument[];
  autoRenew: boolean;
  renewalReminder: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CarrierContact {
  name: string;
  phone: string;
  email: string;
  agentName: string | null;
  agentPhone: string | null;
  agentEmail: string | null;
  claimsPhone: string | null;
}

export interface CoverageDetail {
  type: string;
  description: string;
  limit: number;
  deductible: number | null;
  perOccurrence: boolean;
}

export interface AdditionalInsured {
  name: string;
  relationship: string;
  address: string | null;
  addedDate: Date;
}

export interface PolicyDocument {
  id: string;
  name: string;
  type: 'policy' | 'endorsement' | 'certificate' | 'claim' | 'correspondence';
  url: string;
  uploadedAt: Date;
}

export interface InsuranceCertificate {
  id: string;
  policyId: string;
  vendorId: string | null;
  tenantId: string | null;
  holderName: string;
  holderType: 'vendor' | 'tenant' | 'contractor';
  certificateNumber: string;
  policyType: PolicyType;
  carrier: string;
  policyNumber: string;
  effectiveDate: Date;
  expirationDate: Date;
  coverageAmount: number;
  additionalInsuredIncluded: boolean;
  waiverOfSubrogation: boolean;
  status: CertificateStatus;
  documentUrl: string | null;
  verifiedAt: Date | null;
  verifiedBy: string | null;
  rejectionReason: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsuranceClaim {
  id: string;
  policyId: string;
  propertyId: string | null;
  claimNumber: string;
  incidentDate: Date;
  reportedDate: Date;
  description: string;
  claimType: string;
  status: ClaimStatus;
  estimatedAmount: number | null;
  approvedAmount: number | null;
  paidAmount: number | null;
  deductibleApplied: number | null;
  adjusterName: string | null;
  adjusterPhone: string | null;
  adjusterEmail: string | null;
  documents: ClaimDocument[];
  timeline: ClaimEvent[];
  notes: string | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClaimDocument {
  id: string;
  name: string;
  type: 'incident_report' | 'photos' | 'estimate' | 'receipt' | 'correspondence' | 'settlement';
  url: string;
  uploadedAt: Date;
}

export interface ClaimEvent {
  date: Date;
  event: string;
  description: string;
  userId: string | null;
}

export interface InsuranceAlert {
  id: string;
  policyId: string | null;
  certificateId: string | null;
  claimId: string | null;
  type: AlertType;
  priority: AlertPriority;
  title: string;
  message: string;
  dueDate: Date | null;
  acknowledgedAt: Date | null;
  acknowledgedBy: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
}

export interface CoverageAnalysis {
  propertyId: string;
  propertyAddress: string;
  propertyValue: number;
  policies: PolicySummary[];
  totalCoverage: number;
  coverageRatio: number;
  gaps: CoverageGap[];
  recommendations: string[];
}

export interface PolicySummary {
  policyId: string;
  policyType: PolicyType;
  carrier: string;
  coverage: number;
  premium: number;
  expiresIn: number;
  status: PolicyStatus;
}

export interface CoverageGap {
  type: string;
  description: string;
  recommendedCoverage: number;
  currentCoverage: number;
  gap: number;
  priority: AlertPriority;
}

// In-memory stores
const policies = new Map<string, InsurancePolicy>();
const certificates = new Map<string, InsuranceCertificate>();
const claims = new Map<string, InsuranceClaim>();
const alerts = new Map<string, InsuranceAlert>();

// Schemas
const createPolicySchema = z.object({
  propertyId: z.string().uuid().optional(),
  entityId: z.string().uuid().optional(),
  entityType: z.enum(['property', 'portfolio', 'company', 'vendor', 'tenant']).default('property'),
  policyType: z.enum(['property', 'liability', 'renters', 'umbrella', 'flood', 'earthquake', 'workers_comp', 'business_interruption']),
  policyNumber: z.string().min(1),
  carrier: z.string().min(1),
  carrierContact: z.object({
    name: z.string().min(1),
    phone: z.string().min(10),
    email: z.string().email(),
    agentName: z.string().optional(),
    agentPhone: z.string().optional(),
    agentEmail: z.string().email().optional(),
    claimsPhone: z.string().optional(),
  }).optional(),
  effectiveDate: z.string().datetime(),
  expirationDate: z.string().datetime(),
  premium: z.number().nonnegative(),
  premiumFrequency: z.enum(['monthly', 'quarterly', 'annual']).default('annual'),
  deductible: z.number().nonnegative(),
  coverageAmount: z.number().positive(),
  coverageDetails: z.array(z.object({
    type: z.string().min(1),
    description: z.string(),
    limit: z.number().positive(),
    deductible: z.number().nonnegative().optional(),
    perOccurrence: z.boolean().default(true),
  })).optional(),
  autoRenew: z.boolean().default(false),
  renewalReminder: z.number().int().min(0).max(90).default(30),
  notes: z.string().optional(),
});

const updatePolicySchema = z.object({
  status: z.enum(['active', 'pending', 'cancelled']).optional(),
  premium: z.number().nonnegative().optional(),
  deductible: z.number().nonnegative().optional(),
  coverageAmount: z.number().positive().optional(),
  autoRenew: z.boolean().optional(),
  renewalReminder: z.number().int().min(0).max(90).optional(),
  notes: z.string().optional(),
});

const createCertificateSchema = z.object({
  vendorId: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
  holderName: z.string().min(1),
  holderType: z.enum(['vendor', 'tenant', 'contractor']),
  certificateNumber: z.string().min(1),
  policyType: z.enum(['property', 'liability', 'renters', 'umbrella', 'flood', 'earthquake', 'workers_comp', 'business_interruption']),
  carrier: z.string().min(1),
  policyNumber: z.string().min(1),
  effectiveDate: z.string().datetime(),
  expirationDate: z.string().datetime(),
  coverageAmount: z.number().positive(),
  additionalInsuredIncluded: z.boolean().default(false),
  waiverOfSubrogation: z.boolean().default(false),
  documentUrl: z.string().url().optional(),
  notes: z.string().optional(),
});

const createClaimSchema = z.object({
  policyId: z.string().uuid(),
  propertyId: z.string().uuid().optional(),
  incidentDate: z.string().datetime(),
  description: z.string().min(1),
  claimType: z.string().min(1),
  estimatedAmount: z.number().nonnegative().optional(),
});

const updateClaimSchema = z.object({
  status: z.enum(['under_review', 'approved', 'denied', 'paid', 'closed']).optional(),
  approvedAmount: z.number().nonnegative().optional(),
  paidAmount: z.number().nonnegative().optional(),
  adjusterName: z.string().optional(),
  adjusterPhone: z.string().optional(),
  adjusterEmail: z.string().email().optional(),
  notes: z.string().optional(),
});

// Helper functions
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function daysUntil(date: Date): number {
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function createExpirationAlert(policy: InsurancePolicy): InsuranceAlert | null {
  const daysToExpiry = daysUntil(policy.expirationDate);

  if (daysToExpiry <= 0) {
    return {
      id: generateId(),
      policyId: policy.id,
      certificateId: null,
      claimId: null,
      type: 'expiration',
      priority: 'critical',
      title: 'Policy Expired',
      message: `${policy.policyType} policy #${policy.policyNumber} from ${policy.carrier} has expired.`,
      dueDate: policy.expirationDate,
      acknowledgedAt: null,
      acknowledgedBy: null,
      resolvedAt: null,
      createdAt: new Date(),
    };
  } else if (daysToExpiry <= 7) {
    return {
      id: generateId(),
      policyId: policy.id,
      certificateId: null,
      claimId: null,
      type: 'expiration',
      priority: 'high',
      title: 'Policy Expiring Soon',
      message: `${policy.policyType} policy #${policy.policyNumber} expires in ${daysToExpiry} days.`,
      dueDate: policy.expirationDate,
      acknowledgedAt: null,
      acknowledgedBy: null,
      resolvedAt: null,
      createdAt: new Date(),
    };
  } else if (daysToExpiry <= policy.renewalReminder) {
    return {
      id: generateId(),
      policyId: policy.id,
      certificateId: null,
      claimId: null,
      type: 'renewal',
      priority: 'medium',
      title: 'Policy Renewal Reminder',
      message: `${policy.policyType} policy #${policy.policyNumber} expires in ${daysToExpiry} days. Consider renewal options.`,
      dueDate: policy.expirationDate,
      acknowledgedAt: null,
      acknowledgedBy: null,
      resolvedAt: null,
      createdAt: new Date(),
    };
  }

  return null;
}

function analyzeCoverage(propertyId: string, propertyValue: number): CoverageAnalysis {
  const propertyPolicies = Array.from(policies.values()).filter(
    (p) => p.propertyId === propertyId && p.status === 'active'
  );

  const policySummaries: PolicySummary[] = propertyPolicies.map((p) => ({
    policyId: p.id,
    policyType: p.policyType,
    carrier: p.carrier,
    coverage: p.coverageAmount,
    premium: p.premium,
    expiresIn: daysUntil(p.expirationDate),
    status: p.status,
  }));

  const totalCoverage = propertyPolicies.reduce((sum, p) => sum + p.coverageAmount, 0);
  const coverageRatio = propertyValue > 0 ? totalCoverage / propertyValue : 0;

  const gaps: CoverageGap[] = [];
  const recommendations: string[] = [];

  // Check for property coverage
  const hasPropertyCoverage = propertyPolicies.some((p) => p.policyType === 'property');
  if (!hasPropertyCoverage) {
    gaps.push({
      type: 'property',
      description: 'No property insurance coverage',
      recommendedCoverage: propertyValue,
      currentCoverage: 0,
      gap: propertyValue,
      priority: 'critical',
    });
    recommendations.push('Obtain property insurance immediately');
  } else {
    const propertyCoverage = propertyPolicies
      .filter((p) => p.policyType === 'property')
      .reduce((sum, p) => sum + p.coverageAmount, 0);

    if (propertyCoverage < propertyValue * 0.8) {
      gaps.push({
        type: 'property',
        description: 'Property coverage below 80% of property value',
        recommendedCoverage: propertyValue,
        currentCoverage: propertyCoverage,
        gap: propertyValue - propertyCoverage,
        priority: 'high',
      });
      recommendations.push('Consider increasing property coverage to at least 80% of property value');
    }
  }

  // Check for liability coverage
  const hasLiabilityCoverage = propertyPolicies.some((p) => p.policyType === 'liability');
  if (!hasLiabilityCoverage) {
    gaps.push({
      type: 'liability',
      description: 'No liability insurance coverage',
      recommendedCoverage: 1000000,
      currentCoverage: 0,
      gap: 1000000,
      priority: 'high',
    });
    recommendations.push('Obtain general liability insurance');
  }

  // Check for umbrella policy for high-value properties
  if (propertyValue > 2000000) {
    const hasUmbrella = propertyPolicies.some((p) => p.policyType === 'umbrella');
    if (!hasUmbrella) {
      recommendations.push('Consider umbrella policy for additional protection on high-value property');
    }
  }

  return {
    propertyId,
    propertyAddress: `Property ${propertyId.substring(0, 8)}`,
    propertyValue,
    policies: policySummaries,
    totalCoverage,
    coverageRatio: Math.round(coverageRatio * 100) / 100,
    gaps,
    recommendations,
  };
}

// Route handlers
export async function insuranceRoutes(app: FastifyInstance): Promise<void> {
  // Policy routes
  app.post('/policies', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createPolicySchema.parse(request.body);
    const now = new Date();

    const policy: InsurancePolicy = {
      id: generateId(),
      propertyId: body.propertyId || null,
      entityId: body.entityId || null,
      entityType: body.entityType,
      policyType: body.policyType,
      policyNumber: body.policyNumber,
      carrier: body.carrier,
      carrierContact: body.carrierContact || null,
      status: 'active',
      effectiveDate: new Date(body.effectiveDate),
      expirationDate: new Date(body.expirationDate),
      premium: body.premium,
      premiumFrequency: body.premiumFrequency,
      deductible: body.deductible,
      coverageAmount: body.coverageAmount,
      coverageDetails: body.coverageDetails || [],
      additionalInsured: [],
      documents: [],
      autoRenew: body.autoRenew,
      renewalReminder: body.renewalReminder,
      notes: body.notes || null,
      createdAt: now,
      updatedAt: now,
    };

    policies.set(policy.id, policy);

    // Create alert if expiring soon
    const alert = createExpirationAlert(policy);
    if (alert) {
      alerts.set(alert.id, alert);
    }

    return reply.status(201).send({
      success: true,
      data: policy,
    });
  });

  app.get('/policies/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const policy = policies.get(id);

    if (!policy) {
      return reply.status(404).send({
        success: false,
        error: 'Policy not found',
      });
    }

    return reply.send({
      success: true,
      data: policy,
    });
  });

  app.get('/policies', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      propertyId?: string;
      policyType?: PolicyType;
      status?: PolicyStatus;
      carrier?: string;
      expiringSoon?: string;
    };

    let results = Array.from(policies.values());

    if (query.propertyId) {
      results = results.filter((p) => p.propertyId === query.propertyId);
    }
    if (query.policyType) {
      results = results.filter((p) => p.policyType === query.policyType);
    }
    if (query.status) {
      results = results.filter((p) => p.status === query.status);
    }
    if (query.carrier) {
      results = results.filter((p) => p.carrier.toLowerCase().includes(query.carrier!.toLowerCase()));
    }
    if (query.expiringSoon === 'true') {
      results = results.filter((p) => daysUntil(p.expirationDate) <= 30 && p.status === 'active');
    }

    results.sort((a, b) => a.expirationDate.getTime() - b.expirationDate.getTime());

    return reply.send({
      success: true,
      data: results,
      total: results.length,
    });
  });

  app.patch('/policies/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = updatePolicySchema.parse(request.body);
    const policy = policies.get(id);

    if (!policy) {
      return reply.status(404).send({
        success: false,
        error: 'Policy not found',
      });
    }

    Object.assign(policy, body);
    policy.updatedAt = new Date();
    policies.set(id, policy);

    return reply.send({
      success: true,
      data: policy,
    });
  });

  app.post('/policies/:id/renew', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      newExpirationDate: string;
      newPremium?: number;
      newCoverageAmount?: number;
    };
    const policy = policies.get(id);

    if (!policy) {
      return reply.status(404).send({
        success: false,
        error: 'Policy not found',
      });
    }

    const now = new Date();

    // Create new policy as renewal
    const renewedPolicy: InsurancePolicy = {
      ...policy,
      id: generateId(),
      effectiveDate: policy.expirationDate,
      expirationDate: new Date(body.newExpirationDate),
      premium: body.newPremium || policy.premium,
      coverageAmount: body.newCoverageAmount || policy.coverageAmount,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    // Mark old policy as expired
    policy.status = 'expired';
    policy.updatedAt = now;
    policies.set(id, policy);
    policies.set(renewedPolicy.id, renewedPolicy);

    return reply.status(201).send({
      success: true,
      data: renewedPolicy,
      previousPolicyId: id,
    });
  });

  app.post('/policies/:id/documents', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { name: string; type: string; url: string };
    const policy = policies.get(id);

    if (!policy) {
      return reply.status(404).send({
        success: false,
        error: 'Policy not found',
      });
    }

    const doc: PolicyDocument = {
      id: generateId(),
      name: body.name,
      type: body.type as PolicyDocument['type'],
      url: body.url,
      uploadedAt: new Date(),
    };

    policy.documents.push(doc);
    policy.updatedAt = new Date();
    policies.set(id, policy);

    return reply.status(201).send({
      success: true,
      data: doc,
    });
  });

  // Certificate routes
  app.post('/certificates', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createCertificateSchema.parse(request.body);
    const now = new Date();

    const certificate: InsuranceCertificate = {
      id: generateId(),
      policyId: generateId(),
      vendorId: body.vendorId || null,
      tenantId: body.tenantId || null,
      holderName: body.holderName,
      holderType: body.holderType,
      certificateNumber: body.certificateNumber,
      policyType: body.policyType,
      carrier: body.carrier,
      policyNumber: body.policyNumber,
      effectiveDate: new Date(body.effectiveDate),
      expirationDate: new Date(body.expirationDate),
      coverageAmount: body.coverageAmount,
      additionalInsuredIncluded: body.additionalInsuredIncluded,
      waiverOfSubrogation: body.waiverOfSubrogation,
      status: 'pending_verification',
      documentUrl: body.documentUrl || null,
      verifiedAt: null,
      verifiedBy: null,
      rejectionReason: null,
      notes: body.notes || null,
      createdAt: now,
      updatedAt: now,
    };

    certificates.set(certificate.id, certificate);

    return reply.status(201).send({
      success: true,
      data: certificate,
    });
  });

  app.get('/certificates', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      vendorId?: string;
      tenantId?: string;
      holderType?: string;
      status?: CertificateStatus;
      expiringSoon?: string;
    };

    let results = Array.from(certificates.values());

    if (query.vendorId) {
      results = results.filter((c) => c.vendorId === query.vendorId);
    }
    if (query.tenantId) {
      results = results.filter((c) => c.tenantId === query.tenantId);
    }
    if (query.holderType) {
      results = results.filter((c) => c.holderType === query.holderType);
    }
    if (query.status) {
      results = results.filter((c) => c.status === query.status);
    }
    if (query.expiringSoon === 'true') {
      results = results.filter((c) => daysUntil(c.expirationDate) <= 30 && c.status === 'valid');
    }

    results.sort((a, b) => a.expirationDate.getTime() - b.expirationDate.getTime());

    return reply.send({
      success: true,
      data: results,
      total: results.length,
    });
  });

  app.get('/certificates/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const certificate = certificates.get(id);

    if (!certificate) {
      return reply.status(404).send({
        success: false,
        error: 'Certificate not found',
      });
    }

    return reply.send({
      success: true,
      data: certificate,
    });
  });

  app.post('/certificates/:id/verify', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { verifiedBy: string; approved: boolean; rejectionReason?: string };
    const certificate = certificates.get(id);

    if (!certificate) {
      return reply.status(404).send({
        success: false,
        error: 'Certificate not found',
      });
    }

    const now = new Date();

    if (body.approved) {
      certificate.status = 'valid';
      certificate.verifiedAt = now;
      certificate.verifiedBy = body.verifiedBy;
    } else {
      certificate.status = 'rejected';
      certificate.rejectionReason = body.rejectionReason || 'Verification failed';
    }

    certificate.updatedAt = now;
    certificates.set(id, certificate);

    return reply.send({
      success: true,
      data: certificate,
    });
  });

  // Claim routes
  app.post('/claims', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createClaimSchema.parse(request.body);
    const policy = policies.get(body.policyId);

    if (!policy) {
      return reply.status(404).send({
        success: false,
        error: 'Policy not found',
      });
    }

    const now = new Date();

    const claim: InsuranceClaim = {
      id: generateId(),
      policyId: body.policyId,
      propertyId: body.propertyId || null,
      claimNumber: `CLM-${Date.now().toString().slice(-8)}`,
      incidentDate: new Date(body.incidentDate),
      reportedDate: now,
      description: body.description,
      claimType: body.claimType,
      status: 'reported',
      estimatedAmount: body.estimatedAmount || null,
      approvedAmount: null,
      paidAmount: null,
      deductibleApplied: null,
      adjusterName: null,
      adjusterPhone: null,
      adjusterEmail: null,
      documents: [],
      timeline: [{
        date: now,
        event: 'Claim Reported',
        description: 'Initial claim filed',
        userId: null,
      }],
      notes: null,
      closedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    claims.set(claim.id, claim);

    // Create alert
    const alert: InsuranceAlert = {
      id: generateId(),
      policyId: body.policyId,
      certificateId: null,
      claimId: claim.id,
      type: 'claim_update',
      priority: 'high',
      title: 'New Claim Filed',
      message: `New ${body.claimType} claim filed for policy #${policy.policyNumber}`,
      dueDate: null,
      acknowledgedAt: null,
      acknowledgedBy: null,
      resolvedAt: null,
      createdAt: now,
    };
    alerts.set(alert.id, alert);

    return reply.status(201).send({
      success: true,
      data: claim,
    });
  });

  app.get('/claims', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      policyId?: string;
      propertyId?: string;
      status?: ClaimStatus;
    };

    let results = Array.from(claims.values());

    if (query.policyId) {
      results = results.filter((c) => c.policyId === query.policyId);
    }
    if (query.propertyId) {
      results = results.filter((c) => c.propertyId === query.propertyId);
    }
    if (query.status) {
      results = results.filter((c) => c.status === query.status);
    }

    results.sort((a, b) => b.reportedDate.getTime() - a.reportedDate.getTime());

    return reply.send({
      success: true,
      data: results,
      total: results.length,
    });
  });

  app.get('/claims/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const claim = claims.get(id);

    if (!claim) {
      return reply.status(404).send({
        success: false,
        error: 'Claim not found',
      });
    }

    return reply.send({
      success: true,
      data: claim,
    });
  });

  app.patch('/claims/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = updateClaimSchema.parse(request.body);
    const claim = claims.get(id);

    if (!claim) {
      return reply.status(404).send({
        success: false,
        error: 'Claim not found',
      });
    }

    const now = new Date();
    const previousStatus = claim.status;

    Object.assign(claim, body);

    if (body.status && body.status !== previousStatus) {
      claim.timeline.push({
        date: now,
        event: `Status Changed to ${body.status}`,
        description: `Claim status updated from ${previousStatus} to ${body.status}`,
        userId: null,
      });

      if (body.status === 'closed') {
        claim.closedAt = now;
      }
    }

    claim.updatedAt = now;
    claims.set(id, claim);

    return reply.send({
      success: true,
      data: claim,
    });
  });

  app.post('/claims/:id/documents', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { name: string; type: string; url: string };
    const claim = claims.get(id);

    if (!claim) {
      return reply.status(404).send({
        success: false,
        error: 'Claim not found',
      });
    }

    const doc: ClaimDocument = {
      id: generateId(),
      name: body.name,
      type: body.type as ClaimDocument['type'],
      url: body.url,
      uploadedAt: new Date(),
    };

    claim.documents.push(doc);
    claim.updatedAt = new Date();
    claims.set(id, claim);

    return reply.status(201).send({
      success: true,
      data: doc,
    });
  });

  // Alert routes
  app.get('/alerts', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      type?: AlertType;
      priority?: AlertPriority;
      unacknowledged?: string;
    };

    let results = Array.from(alerts.values());

    if (query.type) {
      results = results.filter((a) => a.type === query.type);
    }
    if (query.priority) {
      results = results.filter((a) => a.priority === query.priority);
    }
    if (query.unacknowledged === 'true') {
      results = results.filter((a) => !a.acknowledgedAt);
    }

    results.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    return reply.send({
      success: true,
      data: results,
      total: results.length,
    });
  });

  app.post('/alerts/:id/acknowledge', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { acknowledgedBy: string };
    const alert = alerts.get(id);

    if (!alert) {
      return reply.status(404).send({
        success: false,
        error: 'Alert not found',
      });
    }

    alert.acknowledgedAt = new Date();
    alert.acknowledgedBy = body.acknowledgedBy;
    alerts.set(id, alert);

    return reply.send({
      success: true,
      data: alert,
    });
  });

  // Coverage analysis
  app.get('/analysis/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };
    const query = request.query as { propertyValue?: string };
    const propertyValue = parseFloat(query.propertyValue || '1000000');

    const analysis = analyzeCoverage(propertyId, propertyValue);

    return reply.send({
      success: true,
      data: analysis,
    });
  });

  // Expiration summary
  app.get('/expiration-summary', async (_request: FastifyRequest, reply: FastifyReply) => {
    const activePolicies = Array.from(policies.values()).filter((p) => p.status === 'active');
    const validCertificates = Array.from(certificates.values()).filter((c) => c.status === 'valid');

    const summary = {
      policies: {
        total: activePolicies.length,
        expiredOrExpiring: {
          expired: activePolicies.filter((p) => daysUntil(p.expirationDate) <= 0).length,
          next7Days: activePolicies.filter((p) => daysUntil(p.expirationDate) > 0 && daysUntil(p.expirationDate) <= 7).length,
          next30Days: activePolicies.filter((p) => daysUntil(p.expirationDate) > 7 && daysUntil(p.expirationDate) <= 30).length,
          next90Days: activePolicies.filter((p) => daysUntil(p.expirationDate) > 30 && daysUntil(p.expirationDate) <= 90).length,
        },
      },
      certificates: {
        total: validCertificates.length,
        expiredOrExpiring: {
          expired: validCertificates.filter((c) => daysUntil(c.expirationDate) <= 0).length,
          next7Days: validCertificates.filter((c) => daysUntil(c.expirationDate) > 0 && daysUntil(c.expirationDate) <= 7).length,
          next30Days: validCertificates.filter((c) => daysUntil(c.expirationDate) > 7 && daysUntil(c.expirationDate) <= 30).length,
          next90Days: validCertificates.filter((c) => daysUntil(c.expirationDate) > 30 && daysUntil(c.expirationDate) <= 90).length,
        },
      },
      pendingAlerts: Array.from(alerts.values()).filter((a) => !a.acknowledgedAt).length,
      openClaims: Array.from(claims.values()).filter((c) => !['paid', 'closed', 'denied'].includes(c.status)).length,
    };

    return reply.send({
      success: true,
      data: summary,
    });
  });
}

// Export for testing
export {
  policies,
  certificates,
  claims,
  alerts,
  daysUntil,
  createExpirationAlert,
  analyzeCoverage,
};
