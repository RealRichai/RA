import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  prisma,
  Prisma,
  type InsurancePolicyType as PrismaInsurancePolicyType,
  type InsurancePolicyStatus as PrismaInsurancePolicyStatus,
  type InsuranceClaimStatus as PrismaInsuranceClaimStatus,
  type CertificateStatus as PrismaCertificateStatus,
  type CertificateHolderType as PrismaCertificateHolderType,
  type PremiumFrequency as PrismaPremiumFrequency,
  type InsuranceEntityType as PrismaInsuranceEntityType,
  type InsuranceAlertType as PrismaInsuranceAlertType,
  type InsuranceAlertPriority as PrismaInsuranceAlertPriority,
} from '@realriches/database';

// Types
export type PolicyType = 'property' | 'liability' | 'renters' | 'umbrella' | 'flood' | 'earthquake' | 'workers_comp' | 'business_interruption';
export type PolicyStatus = 'active' | 'pending' | 'expired' | 'cancelled' | 'lapsed';
export type PremiumFrequency = 'monthly' | 'quarterly' | 'annual';
export type EntityType = 'property' | 'portfolio' | 'company' | 'vendor' | 'tenant';
export type CertificateStatus = 'valid' | 'expired' | 'pending_verification' | 'rejected';
export type CertificateHolderType = 'vendor' | 'tenant' | 'contractor';
export type ClaimStatus = 'reported' | 'under_review' | 'approved' | 'denied' | 'paid' | 'closed';
export type AlertType = 'expiration' | 'renewal' | 'coverage_gap' | 'claim_update' | 'certificate_expiring';
export type AlertPriority = 'low' | 'medium' | 'high' | 'critical';

export interface ClaimTimeline {
  date: Date;
  event: string;
  description: string;
  updatedBy?: string;
}

// Helper: convert Decimal to number
function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value) || 0;
}

export interface InsurancePolicy {
  id: string;
  propertyId?: string | null;
  policyType: PolicyType;
  policyNumber: string;
  carrier: string;
  expirationDate: Date;
  coverageAmount: number;
  renewalReminder?: number;
  autoRenew?: boolean;
}

export function daysUntil(date: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diffMs = target.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export function createExpirationAlert(policy: InsurancePolicy): { type: string; priority: AlertPriority; message: string } | null {
  const days = daysUntil(policy.expirationDate);
  const renewalReminder = policy.renewalReminder || 30;

  if (days < 0) {
    return {
      type: 'expiration',
      priority: 'critical',
      message: `Policy ${policy.policyNumber} has expired`,
    };
  }

  if (days <= 7) {
    return {
      type: 'expiration',
      priority: 'high',
      message: `Policy ${policy.policyNumber} expires in ${days} days`,
    };
  }

  if (days <= renewalReminder) {
    return {
      type: 'renewal',
      priority: 'medium',
      message: `Policy ${policy.policyNumber} expires in ${days} days - renewal reminder`,
    };
  }

  return null;
}

export async function analyzeCoverage(propertyId: string, propertyValue: number) {
  const policies = await prisma.insurancePolicy.findMany({
    where: { propertyId, status: 'active' },
  });

  const totalCoverage = policies.reduce((sum, p) => sum + toNumber(p.coverageAmount), 0);
  const coverageRatio = propertyValue > 0 ? totalCoverage / propertyValue : 0;

  const policyTypes = policies.map(p => p.policyType);
  const requiredTypes: PolicyType[] = ['property', 'liability'];
  const recommendedTypes: PolicyType[] = ['umbrella', 'flood'];

  const missingRequired = requiredTypes.filter(t => !policyTypes.includes(t as PrismaInsurancePolicyType));
  const missingRecommended = recommendedTypes.filter(t => !policyTypes.includes(t as PrismaInsurancePolicyType));

  const coverageGaps: string[] = [];
  if (coverageRatio < 0.8) {
    coverageGaps.push('Underinsured: coverage is less than 80% of property value');
  }
  missingRequired.forEach(t => coverageGaps.push(`Missing required ${t} coverage`));

  const recommendations: string[] = [];
  if (coverageRatio < 1.0) {
    recommendations.push('Consider increasing coverage to 100% of property value');
  }
  if (propertyValue > 1000000 && !policyTypes.includes('umbrella' as PrismaInsurancePolicyType)) {
    recommendations.push('Consider umbrella policy for high-value property');
  }
  missingRecommended.forEach(t => recommendations.push(`Consider adding ${t} coverage`));

  return {
    totalCoverage,
    coverageRatio,
    coverageGaps,
    recommendations,
    policiesAnalyzed: policies.length,
  };
}

// Schemas
const createPolicySchema = z.object({
  propertyId: z.string().uuid().optional(),
  entityId: z.string().uuid().optional(),
  entityType: z.enum(['property', 'portfolio', 'company', 'vendor', 'tenant']),
  policyType: z.enum(['property', 'liability', 'renters', 'umbrella', 'flood', 'earthquake', 'workers_comp', 'business_interruption']),
  policyNumber: z.string().min(1),
  carrier: z.string().min(1),
  carrierContact: z.object({
    name: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
  }).optional(),
  effectiveDate: z.string().datetime(),
  expirationDate: z.string().datetime(),
  premium: z.number().positive(),
  premiumFrequency: z.enum(['monthly', 'quarterly', 'annual']).default('annual'),
  deductible: z.number().nonnegative(),
  coverageAmount: z.number().positive(),
  coverageDetails: z.array(z.object({
    type: z.string(),
    limit: z.number().positive(),
    deductible: z.number().nonnegative(),
    description: z.string(),
  })).optional(),
  additionalInsured: z.array(z.object({
    name: z.string(),
    relationship: z.string(),
  })).optional(),
  autoRenew: z.boolean().default(false),
  renewalReminder: z.number().min(1).max(90).default(30),
  notes: z.string().optional(),
});

const updatePolicySchema = z.object({
  status: z.enum(['active', 'pending', 'expired', 'cancelled', 'lapsed']).optional(),
  premium: z.number().positive().optional(),
  deductible: z.number().nonnegative().optional(),
  coverageAmount: z.number().positive().optional(),
  coverageDetails: z.array(z.object({
    type: z.string(),
    limit: z.number().positive(),
    deductible: z.number().nonnegative(),
    description: z.string(),
  })).optional(),
  additionalInsured: z.array(z.object({
    name: z.string(),
    relationship: z.string(),
  })).optional(),
  autoRenew: z.boolean().optional(),
  renewalReminder: z.number().min(1).max(90).optional(),
  notes: z.string().optional(),
});

const submitCertificateSchema = z.object({
  vendorId: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
  holderName: z.string().min(1),
  holderType: z.enum(['vendor', 'tenant', 'contractor']),
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

const fileClaimSchema = z.object({
  propertyId: z.string().uuid().optional(),
  incidentDate: z.string().datetime(),
  description: z.string().min(10),
  claimType: z.string().min(1),
  estimatedAmount: z.number().positive().optional(),
  adjusterName: z.string().optional(),
  adjusterPhone: z.string().optional(),
  adjusterEmail: z.string().email().optional(),
  documents: z.array(z.string().url()).optional(),
  notes: z.string().optional(),
});

const updateClaimSchema = z.object({
  status: z.enum(['reported', 'under_review', 'approved', 'denied', 'paid', 'closed']).optional(),
  estimatedAmount: z.number().positive().optional(),
  approvedAmount: z.number().positive().optional(),
  paidAmount: z.number().positive().optional(),
  deductibleApplied: z.number().nonnegative().optional(),
  adjusterName: z.string().optional(),
  adjusterPhone: z.string().optional(),
  adjusterEmail: z.string().email().optional(),
  notes: z.string().optional(),
});

// Route handlers
export async function insuranceRoutes(app: FastifyInstance): Promise<void> {
  // Create policy
  app.post('/policies', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createPolicySchema.parse(request.body);

    const policy = await prisma.insurancePolicy.create({
      data: {
        propertyId: body.propertyId || null,
        entityId: body.entityId || null,
        entityType: body.entityType as PrismaInsuranceEntityType,
        policyType: body.policyType as PrismaInsurancePolicyType,
        policyNumber: body.policyNumber,
        carrier: body.carrier,
        carrierContact: body.carrierContact || null,
        status: 'active',
        effectiveDate: new Date(body.effectiveDate),
        expirationDate: new Date(body.expirationDate),
        premium: body.premium,
        premiumFrequency: body.premiumFrequency as PrismaPremiumFrequency,
        deductible: body.deductible,
        coverageAmount: body.coverageAmount,
        coverageDetails: body.coverageDetails || [],
        additionalInsured: body.additionalInsured || [],
        autoRenew: body.autoRenew,
        renewalReminder: body.renewalReminder,
        notes: body.notes || null,
      },
    });

    // Create expiration alert
    const expirationDate = new Date(body.expirationDate);
    const alertDate = new Date(expirationDate);
    alertDate.setDate(alertDate.getDate() - body.renewalReminder);

    await prisma.insuranceAlert.create({
      data: {
        policyId: policy.id,
        type: 'expiration' as PrismaInsuranceAlertType,
        priority: 'medium' as PrismaInsuranceAlertPriority,
        title: 'Policy Expiring Soon',
        message: `Policy ${body.policyNumber} expires on ${expirationDate.toISOString().split('T')[0]}`,
        dueDate: alertDate,
      },
    });

    return reply.status(201).send({
      success: true,
      data: {
        ...policy,
        premium: toNumber(policy.premium),
        deductible: toNumber(policy.deductible),
        coverageAmount: toNumber(policy.coverageAmount),
      },
    });
  });

  // Get policy by ID
  app.get('/policies/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const policy = await prisma.insurancePolicy.findUnique({
      where: { id },
      include: {
        claims: true,
        alerts: true,
      },
    });

    if (!policy) {
      return reply.status(404).send({
        success: false,
        error: 'Policy not found',
      });
    }

    return reply.send({
      success: true,
      data: {
        ...policy,
        premium: toNumber(policy.premium),
        deductible: toNumber(policy.deductible),
        coverageAmount: toNumber(policy.coverageAmount),
        claims: policy.claims.map((c) => ({
          ...c,
          estimatedAmount: c.estimatedAmount ? toNumber(c.estimatedAmount) : null,
          approvedAmount: c.approvedAmount ? toNumber(c.approvedAmount) : null,
          paidAmount: c.paidAmount ? toNumber(c.paidAmount) : null,
          deductibleApplied: c.deductibleApplied ? toNumber(c.deductibleApplied) : null,
        })),
      },
    });
  });

  // List policies
  app.get('/policies', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      propertyId?: string;
      entityType?: EntityType;
      policyType?: PolicyType;
      status?: PolicyStatus;
      expiringWithin?: string;
    };

    const where: Record<string, unknown> = {};

    if (query.propertyId) where.propertyId = query.propertyId;
    if (query.entityType) where.entityType = query.entityType;
    if (query.policyType) where.policyType = query.policyType;
    if (query.status) where.status = query.status;

    if (query.expiringWithin) {
      const days = parseInt(query.expiringWithin, 10);
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + days);
      where.expirationDate = {
        lte: futureDate,
        gte: new Date(),
      };
    }

    const results = await prisma.insurancePolicy.findMany({
      where,
      orderBy: { expirationDate: 'asc' },
    });

    return reply.send({
      success: true,
      data: results.map((p) => ({
        ...p,
        premium: toNumber(p.premium),
        deductible: toNumber(p.deductible),
        coverageAmount: toNumber(p.coverageAmount),
      })),
      total: results.length,
    });
  });

  // Update policy
  app.patch('/policies/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = updatePolicySchema.parse(request.body);

    const policy = await prisma.insurancePolicy.findUnique({
      where: { id },
    });

    if (!policy) {
      return reply.status(404).send({
        success: false,
        error: 'Policy not found',
      });
    }

    const updated = await prisma.insurancePolicy.update({
      where: { id },
      data: {
        status: body.status as PrismaInsurancePolicyStatus | undefined,
        premium: body.premium,
        deductible: body.deductible,
        coverageAmount: body.coverageAmount,
        coverageDetails: body.coverageDetails,
        additionalInsured: body.additionalInsured,
        autoRenew: body.autoRenew,
        renewalReminder: body.renewalReminder,
        notes: body.notes,
      },
    });

    return reply.send({
      success: true,
      data: {
        ...updated,
        premium: toNumber(updated.premium),
        deductible: toNumber(updated.deductible),
        coverageAmount: toNumber(updated.coverageAmount),
      },
    });
  });

  // Renew policy
  app.post('/policies/:id/renew', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      newExpirationDate: string;
      newPremium?: number;
      newCoverageAmount?: number;
    };

    const policy = await prisma.insurancePolicy.findUnique({
      where: { id },
    });

    if (!policy) {
      return reply.status(404).send({
        success: false,
        error: 'Policy not found',
      });
    }

    // Create new policy based on old one
    const renewedPolicy = await prisma.insurancePolicy.create({
      data: {
        propertyId: policy.propertyId,
        entityId: policy.entityId,
        entityType: policy.entityType,
        policyType: policy.policyType,
        policyNumber: `${policy.policyNumber}-R`,
        carrier: policy.carrier,
        carrierContact: policy.carrierContact,
        status: 'active',
        effectiveDate: policy.expirationDate,
        expirationDate: new Date(body.newExpirationDate),
        premium: body.newPremium || toNumber(policy.premium),
        premiumFrequency: policy.premiumFrequency,
        deductible: toNumber(policy.deductible),
        coverageAmount: body.newCoverageAmount || toNumber(policy.coverageAmount),
        coverageDetails: policy.coverageDetails,
        additionalInsured: policy.additionalInsured,
        autoRenew: policy.autoRenew,
        renewalReminder: policy.renewalReminder,
        notes: `Renewed from policy ${policy.id}`,
      },
    });

    // Mark old policy as expired
    await prisma.insurancePolicy.update({
      where: { id },
      data: { status: 'expired' },
    });

    // Create expiration alert for renewed policy
    const alertDate = new Date(body.newExpirationDate);
    alertDate.setDate(alertDate.getDate() - policy.renewalReminder);

    await prisma.insuranceAlert.create({
      data: {
        policyId: renewedPolicy.id,
        type: 'expiration' as PrismaInsuranceAlertType,
        priority: 'medium' as PrismaInsuranceAlertPriority,
        title: 'Policy Expiring Soon',
        message: `Policy ${renewedPolicy.policyNumber} expires on ${body.newExpirationDate.split('T')[0]}`,
        dueDate: alertDate,
      },
    });

    return reply.status(201).send({
      success: true,
      data: {
        ...renewedPolicy,
        premium: toNumber(renewedPolicy.premium),
        deductible: toNumber(renewedPolicy.deductible),
        coverageAmount: toNumber(renewedPolicy.coverageAmount),
      },
      previousPolicyId: id,
    });
  });

  // Submit certificate
  app.post('/policies/:id/certificates', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = submitCertificateSchema.parse(request.body);

    const policy = await prisma.insurancePolicy.findUnique({
      where: { id },
    });

    if (!policy) {
      return reply.status(404).send({
        success: false,
        error: 'Policy not found',
      });
    }

    const certificate = await prisma.insuranceCertificate.create({
      data: {
        policyId: id,
        vendorId: body.vendorId || null,
        tenantId: body.tenantId || null,
        holderName: body.holderName,
        holderType: body.holderType as PrismaCertificateHolderType,
        certificateNumber: `COI-${Date.now()}`,
        policyType: body.policyType as PrismaInsurancePolicyType,
        carrier: body.carrier,
        policyNumber: body.policyNumber,
        effectiveDate: new Date(body.effectiveDate),
        expirationDate: new Date(body.expirationDate),
        coverageAmount: body.coverageAmount,
        additionalInsuredIncluded: body.additionalInsuredIncluded,
        waiverOfSubrogation: body.waiverOfSubrogation,
        status: 'pending_verification' as PrismaCertificateStatus,
        documentUrl: body.documentUrl || null,
        notes: body.notes || null,
      },
    });

    // Create alert for certificate expiration
    const expirationDate = new Date(body.expirationDate);
    const alertDate = new Date(expirationDate);
    alertDate.setDate(alertDate.getDate() - 30);

    await prisma.insuranceAlert.create({
      data: {
        certificateId: certificate.id,
        type: 'certificate_expiring' as PrismaInsuranceAlertType,
        priority: 'medium' as PrismaInsuranceAlertPriority,
        title: 'Certificate Expiring Soon',
        message: `Certificate for ${body.holderName} expires on ${expirationDate.toISOString().split('T')[0]}`,
        dueDate: alertDate,
      },
    });

    return reply.status(201).send({
      success: true,
      data: {
        ...certificate,
        coverageAmount: toNumber(certificate.coverageAmount),
      },
    });
  });

  // Get certificates
  app.get('/certificates', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      vendorId?: string;
      tenantId?: string;
      status?: CertificateStatus;
      expiringWithin?: string;
    };

    const where: Record<string, unknown> = {};

    if (query.vendorId) where.vendorId = query.vendorId;
    if (query.tenantId) where.tenantId = query.tenantId;
    if (query.status) where.status = query.status;

    if (query.expiringWithin) {
      const days = parseInt(query.expiringWithin, 10);
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + days);
      where.expirationDate = {
        lte: futureDate,
        gte: new Date(),
      };
    }

    const results = await prisma.insuranceCertificate.findMany({
      where,
      orderBy: { expirationDate: 'asc' },
    });

    return reply.send({
      success: true,
      data: results.map((c) => ({
        ...c,
        coverageAmount: toNumber(c.coverageAmount),
      })),
      total: results.length,
    });
  });

  // Verify certificate
  app.post('/certificates/:certificateId/verify', async (request: FastifyRequest, reply: FastifyReply) => {
    const { certificateId } = request.params as { certificateId: string };
    const body = request.body as { verifiedById: string; approved: boolean; rejectionReason?: string };

    const certificate = await prisma.insuranceCertificate.findUnique({
      where: { id: certificateId },
    });

    if (!certificate) {
      return reply.status(404).send({
        success: false,
        error: 'Certificate not found',
      });
    }

    const updated = await prisma.insuranceCertificate.update({
      where: { id: certificateId },
      data: {
        status: body.approved ? 'valid' : 'rejected',
        verifiedAt: new Date(),
        verifiedBy: body.verifiedById,
        rejectionReason: body.rejectionReason || null,
      },
    });

    return reply.send({
      success: true,
      data: {
        ...updated,
        coverageAmount: toNumber(updated.coverageAmount),
      },
    });
  });

  // File claim
  app.post('/policies/:id/claims', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = fileClaimSchema.parse(request.body);

    const policy = await prisma.insurancePolicy.findUnique({
      where: { id },
    });

    if (!policy) {
      return reply.status(404).send({
        success: false,
        error: 'Policy not found',
      });
    }

    if (policy.status !== 'active') {
      return reply.status(400).send({
        success: false,
        error: 'Claims can only be filed against active policies',
      });
    }

    const timeline: ClaimTimeline[] = [
      {
        date: new Date(),
        event: 'Claim Filed',
        description: body.description,
      },
    ];

    const claim = await prisma.insuranceClaim.create({
      data: {
        policyId: id,
        propertyId: body.propertyId || policy.propertyId,
        claimNumber: `CLM-${Date.now()}`,
        incidentDate: new Date(body.incidentDate),
        reportedDate: new Date(),
        description: body.description,
        claimType: body.claimType,
        status: 'reported' as PrismaInsuranceClaimStatus,
        estimatedAmount: body.estimatedAmount || null,
        adjusterName: body.adjusterName || null,
        adjusterPhone: body.adjusterPhone || null,
        adjusterEmail: body.adjusterEmail || null,
        documents: body.documents || [],
        timeline: timeline as unknown as Prisma.JsonValue,
        notes: body.notes || null,
      },
    });

    // Create alert for claim
    await prisma.insuranceAlert.create({
      data: {
        policyId: id,
        claimId: claim.id,
        type: 'claim_update' as PrismaInsuranceAlertType,
        priority: 'high' as PrismaInsuranceAlertPriority,
        title: 'New Claim Filed',
        message: `Claim ${claim.claimNumber} has been filed`,
      },
    });

    return reply.status(201).send({
      success: true,
      data: {
        ...claim,
        estimatedAmount: claim.estimatedAmount ? toNumber(claim.estimatedAmount) : null,
      },
    });
  });

  // Get claims
  app.get('/claims', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      policyId?: string;
      propertyId?: string;
      status?: ClaimStatus;
    };

    const where: Record<string, unknown> = {};

    if (query.policyId) where.policyId = query.policyId;
    if (query.propertyId) where.propertyId = query.propertyId;
    if (query.status) where.status = query.status;

    const results = await prisma.insuranceClaim.findMany({
      where,
      orderBy: { reportedDate: 'desc' },
    });

    return reply.send({
      success: true,
      data: results.map((c) => ({
        ...c,
        estimatedAmount: c.estimatedAmount ? toNumber(c.estimatedAmount) : null,
        approvedAmount: c.approvedAmount ? toNumber(c.approvedAmount) : null,
        paidAmount: c.paidAmount ? toNumber(c.paidAmount) : null,
        deductibleApplied: c.deductibleApplied ? toNumber(c.deductibleApplied) : null,
      })),
      total: results.length,
    });
  });

  // Get claim by ID
  app.get('/claims/:claimId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { claimId } = request.params as { claimId: string };

    const claim = await prisma.insuranceClaim.findUnique({
      where: { id: claimId },
      include: {
        policy: true,
        alerts: true,
      },
    });

    if (!claim) {
      return reply.status(404).send({
        success: false,
        error: 'Claim not found',
      });
    }

    return reply.send({
      success: true,
      data: {
        ...claim,
        estimatedAmount: claim.estimatedAmount ? toNumber(claim.estimatedAmount) : null,
        approvedAmount: claim.approvedAmount ? toNumber(claim.approvedAmount) : null,
        paidAmount: claim.paidAmount ? toNumber(claim.paidAmount) : null,
        deductibleApplied: claim.deductibleApplied ? toNumber(claim.deductibleApplied) : null,
        policy: {
          ...claim.policy,
          premium: toNumber(claim.policy.premium),
          deductible: toNumber(claim.policy.deductible),
          coverageAmount: toNumber(claim.policy.coverageAmount),
        },
      },
    });
  });

  // Update claim
  app.patch('/claims/:claimId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { claimId } = request.params as { claimId: string };
    const body = updateClaimSchema.parse(request.body);

    const claim = await prisma.insuranceClaim.findUnique({
      where: { id: claimId },
    });

    if (!claim) {
      return reply.status(404).send({
        success: false,
        error: 'Claim not found',
      });
    }

    // Update timeline
    const timeline = (claim.timeline as unknown as ClaimTimeline[]) || [];
    if (body.status && body.status !== claim.status) {
      timeline.push({
        date: new Date(),
        event: `Status Changed to ${body.status}`,
        description: body.notes || `Claim status updated to ${body.status}`,
      });
    }

    const updatedClaim = await prisma.insuranceClaim.update({
      where: { id: claimId },
      data: {
        status: body.status as PrismaInsuranceClaimStatus | undefined,
        estimatedAmount: body.estimatedAmount,
        approvedAmount: body.approvedAmount,
        paidAmount: body.paidAmount,
        deductibleApplied: body.deductibleApplied,
        adjusterName: body.adjusterName,
        adjusterPhone: body.adjusterPhone,
        adjusterEmail: body.adjusterEmail,
        notes: body.notes,
        timeline: timeline as unknown as Prisma.JsonValue,
        closedAt: body.status === 'closed' ? new Date() : undefined,
      },
    });

    // Create alert for status update
    if (body.status) {
      await prisma.insuranceAlert.create({
        data: {
          policyId: claim.policyId,
          claimId: claimId,
          type: 'claim_update' as PrismaInsuranceAlertType,
          priority: 'medium' as PrismaInsuranceAlertPriority,
          title: 'Claim Status Updated',
          message: `Claim ${claim.claimNumber} status changed to ${body.status}`,
        },
      });
    }

    return reply.send({
      success: true,
      data: {
        ...updatedClaim,
        estimatedAmount: updatedClaim.estimatedAmount ? toNumber(updatedClaim.estimatedAmount) : null,
        approvedAmount: updatedClaim.approvedAmount ? toNumber(updatedClaim.approvedAmount) : null,
        paidAmount: updatedClaim.paidAmount ? toNumber(updatedClaim.paidAmount) : null,
        deductibleApplied: updatedClaim.deductibleApplied ? toNumber(updatedClaim.deductibleApplied) : null,
      },
    });
  });

  // Get alerts
  app.get('/alerts', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      type?: AlertType;
      priority?: AlertPriority;
      unacknowledged?: string;
    };

    const where: Record<string, unknown> = {};

    if (query.type) where.type = query.type;
    if (query.priority) where.priority = query.priority;
    if (query.unacknowledged === 'true') {
      where.acknowledgedAt = null;
      where.resolvedAt = null;
    }

    const results = await prisma.insuranceAlert.findMany({
      where,
      orderBy: [
        { priority: 'desc' },
        { dueDate: 'asc' },
      ],
      include: {
        policy: true,
        certificate: true,
        claim: true,
      },
    });

    return reply.send({
      success: true,
      data: results.map((a) => ({
        ...a,
        policy: a.policy ? {
          ...a.policy,
          premium: toNumber(a.policy.premium),
          deductible: toNumber(a.policy.deductible),
          coverageAmount: toNumber(a.policy.coverageAmount),
        } : null,
        certificate: a.certificate ? {
          ...a.certificate,
          coverageAmount: toNumber(a.certificate.coverageAmount),
        } : null,
        claim: a.claim ? {
          ...a.claim,
          estimatedAmount: a.claim.estimatedAmount ? toNumber(a.claim.estimatedAmount) : null,
          approvedAmount: a.claim.approvedAmount ? toNumber(a.claim.approvedAmount) : null,
          paidAmount: a.claim.paidAmount ? toNumber(a.claim.paidAmount) : null,
        } : null,
      })),
      total: results.length,
    });
  });

  // Acknowledge alert
  app.post('/alerts/:alertId/acknowledge', async (request: FastifyRequest, reply: FastifyReply) => {
    const { alertId } = request.params as { alertId: string };
    const body = request.body as { acknowledgedById: string };

    const alert = await prisma.insuranceAlert.findUnique({
      where: { id: alertId },
    });

    if (!alert) {
      return reply.status(404).send({
        success: false,
        error: 'Alert not found',
      });
    }

    const updated = await prisma.insuranceAlert.update({
      where: { id: alertId },
      data: {
        acknowledgedAt: new Date(),
        acknowledgedBy: body.acknowledgedById,
      },
    });

    return reply.send({
      success: true,
      data: updated,
    });
  });

  // Resolve alert
  app.post('/alerts/:alertId/resolve', async (request: FastifyRequest, reply: FastifyReply) => {
    const { alertId } = request.params as { alertId: string };

    const alert = await prisma.insuranceAlert.findUnique({
      where: { id: alertId },
    });

    if (!alert) {
      return reply.status(404).send({
        success: false,
        error: 'Alert not found',
      });
    }

    const updated = await prisma.insuranceAlert.update({
      where: { id: alertId },
      data: { resolvedAt: new Date() },
    });

    return reply.send({
      success: true,
      data: updated,
    });
  });

  // Get coverage summary for property
  app.get('/coverage-summary/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };

    const activePolicies = await prisma.insurancePolicy.findMany({
      where: {
        propertyId,
        status: 'active',
      },
    });

    const coverageByType: Record<PolicyType, {
      totalCoverage: number;
      totalPremium: number;
      policies: Array<{ id: string; carrier: string; policyNumber: string; expirationDate: Date }>;
    }> = {} as Record<PolicyType, { totalCoverage: number; totalPremium: number; policies: Array<{ id: string; carrier: string; policyNumber: string; expirationDate: Date }> }>;

    for (const policy of activePolicies) {
      const type = policy.policyType as PolicyType;
      if (!coverageByType[type]) {
        coverageByType[type] = {
          totalCoverage: 0,
          totalPremium: 0,
          policies: [],
        };
      }
      coverageByType[type].totalCoverage += toNumber(policy.coverageAmount);
      coverageByType[type].totalPremium += toNumber(policy.premium);
      coverageByType[type].policies.push({
        id: policy.id,
        carrier: policy.carrier,
        policyNumber: policy.policyNumber,
        expirationDate: policy.expirationDate,
      });
    }

    const totalCoverage = activePolicies.reduce((sum, p) => sum + toNumber(p.coverageAmount), 0);
    const totalPremium = activePolicies.reduce((sum, p) => sum + toNumber(p.premium), 0);

    const nextExpiring = activePolicies.length > 0
      ? activePolicies.sort((a, b) => a.expirationDate.getTime() - b.expirationDate.getTime())[0]
      : null;

    return reply.send({
      success: true,
      data: {
        propertyId,
        totalPolicies: activePolicies.length,
        totalCoverage,
        totalAnnualPremium: totalPremium,
        coverageByType,
        nextExpiring: nextExpiring ? {
          policyId: nextExpiring.id,
          policyNumber: nextExpiring.policyNumber,
          expirationDate: nextExpiring.expirationDate,
          daysUntilExpiration: Math.ceil((nextExpiring.expirationDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
        } : null,
      },
    });
  });
}
