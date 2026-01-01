/**
 * Leases Service
 *
 * Provides background check provider integration for tenant screening.
 */

import {
  prisma,
  BackgroundCheckType as PrismaCheckType,
  BackgroundCheckStatus,
  BackgroundCheckReportStatus,
} from '@realriches/database';

// =============================================================================
// Types
// =============================================================================

export type BackgroundCheckType = 'criminal_background_check' | 'credit_check' | 'eviction_history';

export interface BackgroundCheckRequest {
  applicationId: string;
  applicantInfo: {
    firstName: string;
    lastName: string;
    dateOfBirth?: string;
    ssn?: string; // Last 4 for verification
    email: string;
  };
  checkType: BackgroundCheckType;
  propertyAddress?: string;
}

export interface BackgroundCheckResult {
  checkId: string;
  applicationId: string;
  checkType: BackgroundCheckType;
  status: 'initiated' | 'pending' | 'completed' | 'failed';
  provider: string;
  estimatedCompletionTime: string;
  createdAt: string;
  webhookUrl?: string;
}

export interface BackgroundCheckReportData {
  checkId: string;
  status: 'clear' | 'review_required' | 'adverse';
  checkType: BackgroundCheckType;
  summary: string;
  details: Record<string, unknown>;
  completedAt: string;
}

// =============================================================================
// Provider Configuration
// =============================================================================

interface BackgroundCheckProvider {
  name: string;
  supportedChecks: BackgroundCheckType[];
  apiEndpoint: string;
  estimatedTime: Record<BackgroundCheckType, string>;
}

const PROVIDERS: Record<string, BackgroundCheckProvider> = {
  transunion_smartmove: {
    name: 'TransUnion SmartMove',
    supportedChecks: ['criminal_background_check', 'credit_check', 'eviction_history'],
    apiEndpoint: 'https://api.smartmove.com/v1', // Would be configured via env
    estimatedTime: {
      criminal_background_check: '24-48 hours',
      credit_check: '5-10 minutes',
      eviction_history: '24-48 hours',
    },
  },
  checkr: {
    name: 'Checkr',
    supportedChecks: ['criminal_background_check'],
    apiEndpoint: 'https://api.checkr.com/v1',
    estimatedTime: {
      criminal_background_check: '1-3 business days',
      credit_check: 'N/A',
      eviction_history: 'N/A',
    },
  },
  rentprep: {
    name: 'RentPrep',
    supportedChecks: ['criminal_background_check', 'credit_check', 'eviction_history'],
    apiEndpoint: 'https://api.rentprep.com/v2',
    estimatedTime: {
      criminal_background_check: '24 hours',
      credit_check: '10-15 minutes',
      eviction_history: '24 hours',
    },
  },
};

// Default provider - would be configurable per customer
const DEFAULT_PROVIDER = 'transunion_smartmove';

// Helper to convert Prisma enum to string type
function prismaCheckTypeToString(checkType: PrismaCheckType): BackgroundCheckType {
  return checkType as BackgroundCheckType;
}

function stringToPrismaCheckType(checkType: BackgroundCheckType): PrismaCheckType {
  return checkType as PrismaCheckType;
}

function prismaStatusToString(status: BackgroundCheckStatus): 'initiated' | 'pending' | 'completed' | 'failed' {
  return status as 'initiated' | 'pending' | 'completed' | 'failed';
}

function prismaReportStatusToString(status: BackgroundCheckReportStatus): 'clear' | 'review_required' | 'adverse' {
  return status as 'clear' | 'review_required' | 'adverse';
}

// =============================================================================
// Background Check Service
// =============================================================================

/**
 * Initiate a background check with the configured provider
 */
export async function initiateBackgroundCheck(
  request: BackgroundCheckRequest
): Promise<BackgroundCheckResult> {
  const provider = PROVIDERS[DEFAULT_PROVIDER];

  // Validate provider supports this check type
  if (!provider.supportedChecks.includes(request.checkType)) {
    throw new Error(`Provider ${provider.name} does not support ${request.checkType}`);
  }

  const webhookUrl = `${process.env.API_BASE_URL || 'https://api.realriches.com'}/webhooks/background-check`;

  // In production, this would make an API call to the provider:
  // const response = await fetch(provider.apiEndpoint + '/checks', {
  //   method: 'POST',
  //   headers: {
  //     'Authorization': `Bearer ${process.env.BACKGROUND_CHECK_API_KEY}`,
  //     'Content-Type': 'application/json',
  //   },
  //   body: JSON.stringify({
  //     applicant: request.applicantInfo,
  //     check_type: request.checkType,
  //     webhook_url: webhookUrl,
  //   }),
  // });

  // Store the background check in database
  const check = await prisma.backgroundCheck.create({
    data: {
      applicationId: request.applicationId,
      checkType: stringToPrismaCheckType(request.checkType),
      status: BackgroundCheckStatus.initiated,
      provider: provider.name,
      estimatedCompletionTime: provider.estimatedTime[request.checkType],
      webhookUrl,
      propertyAddress: request.propertyAddress,
      // Applicant info
      applicantFirstName: request.applicantInfo.firstName,
      applicantLastName: request.applicantInfo.lastName,
      applicantEmail: request.applicantInfo.email,
      applicantDob: request.applicantInfo.dateOfBirth || null,
      applicantSsnLast4: request.applicantInfo.ssn,
    },
  });

  return {
    checkId: check.id,
    applicationId: check.applicationId,
    checkType: prismaCheckTypeToString(check.checkType),
    status: prismaStatusToString(check.status),
    provider: check.provider,
    estimatedCompletionTime: check.estimatedCompletionTime || '',
    createdAt: check.createdAt.toISOString(),
    webhookUrl: check.webhookUrl || undefined,
  };
}

/**
 * Get the status of a background check
 */
export async function getBackgroundCheckStatus(checkId: string): Promise<BackgroundCheckResult | null> {
  const check = await prisma.backgroundCheck.findUnique({
    where: { id: checkId },
  });

  if (!check) return null;

  return {
    checkId: check.id,
    applicationId: check.applicationId,
    checkType: prismaCheckTypeToString(check.checkType),
    status: prismaStatusToString(check.status),
    provider: check.provider,
    estimatedCompletionTime: check.estimatedCompletionTime || '',
    createdAt: check.createdAt.toISOString(),
    webhookUrl: check.webhookUrl || undefined,
  };
}

/**
 * Process webhook callback from background check provider
 * Called when provider sends results
 */
export async function processBackgroundCheckWebhook(
  checkId: string,
  providerData: Record<string, unknown>
): Promise<BackgroundCheckReportData> {
  const existingCheck = await prisma.backgroundCheck.findUnique({
    where: { id: checkId },
  });

  if (!existingCheck) {
    throw new Error(`Background check ${checkId} not found`);
  }

  // Parse provider-specific response format
  // In production, each provider has different response formats
  const status = determineCheckStatus(providerData);
  const checkType = prismaCheckTypeToString(existingCheck.checkType);
  const summary = generateCheckSummary(checkType, status);
  const details = sanitizeProviderData(providerData);

  // Create report and update check status in a transaction
  const [report] = await prisma.$transaction([
    prisma.backgroundCheckReport.create({
      data: {
        checkId,
        status: status as BackgroundCheckReportStatus,
        checkType: existingCheck.checkType,
        summary,
        details: details as object,
        completedAt: new Date(),
      },
    }),
    prisma.backgroundCheck.update({
      where: { id: checkId },
      data: {
        status: BackgroundCheckStatus.completed,
      },
    }),
  ]);

  return {
    checkId: report.checkId,
    status: prismaReportStatusToString(report.status),
    checkType,
    summary: report.summary,
    details: report.details as Record<string, unknown>,
    completedAt: report.completedAt.toISOString(),
  };
}

/**
 * Get all background checks for an application
 */
export async function getApplicationBackgroundChecks(
  applicationId: string
): Promise<BackgroundCheckResult[]> {
  const checks = await prisma.backgroundCheck.findMany({
    where: { applicationId },
    orderBy: { createdAt: 'desc' },
  });

  return checks.map((check) => ({
    checkId: check.id,
    applicationId: check.applicationId,
    checkType: prismaCheckTypeToString(check.checkType),
    status: prismaStatusToString(check.status),
    provider: check.provider,
    estimatedCompletionTime: check.estimatedCompletionTime || '',
    createdAt: check.createdAt.toISOString(),
    webhookUrl: check.webhookUrl || undefined,
  }));
}

// =============================================================================
// Helper Functions
// =============================================================================

function determineCheckStatus(
  providerData: Record<string, unknown>
): 'clear' | 'review_required' | 'adverse' {
  // In production, parse actual provider response
  // This is a simplified mock implementation
  const hasRecords = providerData.records_found || providerData.has_records;
  const needsReview = providerData.needs_review || providerData.manual_review_required;

  if (needsReview) return 'review_required';
  if (hasRecords) return 'adverse';
  return 'clear';
}

function generateCheckSummary(checkType: BackgroundCheckType, status: string): string {
  const checkTypeLabels: Record<BackgroundCheckType, string> = {
    criminal_background_check: 'Criminal Background Check',
    credit_check: 'Credit Check',
    eviction_history: 'Eviction History Check',
  };

  const statusLabels: Record<string, string> = {
    clear: 'passed with no issues found',
    review_required: 'requires manual review',
    adverse: 'found records requiring attention',
  };

  return `${checkTypeLabels[checkType]} ${statusLabels[status] || status}`;
}

function sanitizeProviderData(data: Record<string, unknown>): Record<string, unknown> {
  // Remove sensitive fields before storing
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { ssn, social_security_number, full_ssn, ...sanitized } = data;
  return sanitized;
}

/**
 * Get available providers and their supported check types
 */
export function getAvailableProviders(): Array<{
  id: string;
  name: string;
  supportedChecks: BackgroundCheckType[];
}> {
  return Object.entries(PROVIDERS).map(([id, provider]) => ({
    id,
    name: provider.name,
    supportedChecks: provider.supportedChecks,
  }));
}
