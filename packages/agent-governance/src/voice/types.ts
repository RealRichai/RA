/**
 * Voice AI Types
 *
 * Schema definitions for voice call management, consent tracking,
 * recording pipeline, and call grading.
 */

import { z } from 'zod';

// =============================================================================
// Call Direction & Status
// =============================================================================

export const CallDirectionSchema = z.enum(['inbound', 'outbound']);
export type CallDirection = z.infer<typeof CallDirectionSchema>;

export const CallStatusSchema = z.enum([
  'initiated',
  'ringing',
  'in_progress',
  'on_hold',
  'completed',
  'failed',
  'no_answer',
  'busy',
  'canceled',
]);
export type CallStatus = z.infer<typeof CallStatusSchema>;

// =============================================================================
// Consent Types
// =============================================================================

export const ConsentTypeSchema = z.enum([
  'recording',
  'transcription',
  'ai_analysis',
  'data_retention',
]);
export type ConsentType = z.infer<typeof ConsentTypeSchema>;

export const ConsentStatusSchema = z.enum([
  'pending',
  'granted',
  'denied',
  'revoked',
  'expired',
]);
export type ConsentStatus = z.infer<typeof ConsentStatusSchema>;

export const ConsentRecordSchema = z.object({
  id: z.string(),
  callId: z.string(),
  participantId: z.string(),
  consentType: ConsentTypeSchema,
  status: ConsentStatusSchema,
  grantedAt: z.date().optional(),
  revokedAt: z.date().optional(),
  expiresAt: z.date().optional(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  verificationMethod: z.enum(['voice', 'dtmf', 'web', 'sms']).optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type ConsentRecord = z.infer<typeof ConsentRecordSchema>;

// =============================================================================
// Voice Call
// =============================================================================

export const VoiceCallSchema = z.object({
  id: z.string(),
  externalId: z.string().optional(), // Twilio SID, etc.
  tenantId: z.string(),
  direction: CallDirectionSchema,
  status: CallStatusSchema,

  // Participants
  fromNumber: z.string(),
  toNumber: z.string(),
  agentId: z.string().optional(),
  userId: z.string().optional(),
  propertyId: z.string().optional(),
  leadId: z.string().optional(),

  // Timing
  initiatedAt: z.date(),
  answeredAt: z.date().optional(),
  endedAt: z.date().optional(),
  durationSeconds: z.number().optional(),

  // Consent tracking
  consentRecords: z.array(ConsentRecordSchema),
  recordingConsent: z.boolean(),
  transcriptionConsent: z.boolean(),

  // Recording
  recordingEnabled: z.boolean(),
  recordingUrl: z.string().optional(),
  recordingDurationSeconds: z.number().optional(),
  recordingStorageLocation: z.string().optional(),

  // Transcription
  transcriptionEnabled: z.boolean(),
  transcriptionStatus: z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
  transcriptionUrl: z.string().optional(),

  // AI Analysis
  aiAnalysisEnabled: z.boolean(),
  sentimentScore: z.number().optional(),
  intentDetected: z.string().optional(),
  keyTopics: z.array(z.string()).optional(),

  // Compliance
  market: z.string().optional(),
  twoPartyConsentRequired: z.boolean(),
  policyViolations: z.array(z.object({
    ruleId: z.string(),
    severity: z.enum(['info', 'warning', 'critical']),
    message: z.string(),
    timestamp: z.date(),
  })),

  // Metadata
  metadata: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
});
export type VoiceCall = z.infer<typeof VoiceCallSchema>;

// =============================================================================
// Transcription
// =============================================================================

export const TranscriptSegmentSchema = z.object({
  id: z.string(),
  callId: z.string(),
  speaker: z.enum(['agent', 'caller', 'system', 'unknown']),
  text: z.string(),
  startTimeSeconds: z.number(),
  endTimeSeconds: z.number(),
  confidence: z.number().optional(),
  redacted: z.boolean(),
  piiDetected: z.boolean(),
});
export type TranscriptSegment = z.infer<typeof TranscriptSegmentSchema>;

export const TranscriptSchema = z.object({
  callId: z.string(),
  segments: z.array(TranscriptSegmentSchema),
  fullText: z.string(),
  redactedFullText: z.string(),
  languageCode: z.string(),
  completedAt: z.date(),
  processingTimeMs: z.number(),
});
export type Transcript = z.infer<typeof TranscriptSchema>;

// =============================================================================
// Call Grading
// =============================================================================

export const GradingCriterionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  weight: z.number(),
  category: z.enum([
    'compliance',
    'professionalism',
    'effectiveness',
    'fcha_compliance',
    'disclosure',
    'customer_service',
  ]),
});
export type GradingCriterion = z.infer<typeof GradingCriterionSchema>;

export const GradeSchema = z.object({
  criterionId: z.string(),
  score: z.number().min(0).max(100),
  maxScore: z.number(),
  notes: z.string().optional(),
  evidenceSegmentIds: z.array(z.string()).optional(),
  autoGraded: z.boolean(),
  reviewedBy: z.string().optional(),
  reviewedAt: z.date().optional(),
});
export type Grade = z.infer<typeof GradeSchema>;

export const CallGradeSchema = z.object({
  id: z.string(),
  callId: z.string(),
  rubricId: z.string(),
  rubricVersion: z.string(),
  grades: z.array(GradeSchema),
  overallScore: z.number(),
  maxPossibleScore: z.number(),
  percentageScore: z.number(),
  passed: z.boolean(),
  passingThreshold: z.number(),

  // Compliance flags
  fchaViolationDetected: z.boolean(),
  disclosuresMissed: z.array(z.string()),
  policyViolations: z.array(z.string()),

  // Metadata
  gradedAt: z.date(),
  gradedBy: z.enum(['ai', 'human', 'hybrid']),
  reviewStatus: z.enum(['pending', 'approved', 'disputed', 'overridden']),
  reviewNotes: z.string().optional(),
});
export type CallGrade = z.infer<typeof CallGradeSchema>;

// =============================================================================
// Grading Rubric
// =============================================================================

export const GradingRubricSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string(),
  agentTypes: z.array(z.string()),
  criteria: z.array(GradingCriterionSchema),
  passingThreshold: z.number(),
  enabled: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type GradingRubric = z.infer<typeof GradingRubricSchema>;

// =============================================================================
// Provider Types (Twilio, WebRTC)
// =============================================================================

export const VoiceProviderSchema = z.enum(['twilio', 'webrtc', 'vonage', 'plivo']);
export type VoiceProvider = z.infer<typeof VoiceProviderSchema>;

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  applicationSid?: string;
  twimlAppSid?: string;
  defaultFromNumber?: string;
  statusCallbackUrl?: string;
  recordingStatusCallbackUrl?: string;
  transcriptionCallbackUrl?: string;
}

export interface WebRTCConfig {
  stunServers: string[];
  turnServers?: Array<{
    urls: string[];
    username?: string;
    credential?: string;
  }>;
  iceTransportPolicy?: 'all' | 'relay';
  mediaConstraints?: {
    audio: boolean | Record<string, unknown>;
    video?: boolean | Record<string, unknown>;
  };
}

export interface VoiceProviderConfig {
  provider: VoiceProvider;
  twilio?: TwilioConfig;
  webrtc?: WebRTCConfig;
}

// =============================================================================
// Two-Party Consent States
// =============================================================================

export const TWO_PARTY_CONSENT_STATES = [
  'CA', // California
  'CT', // Connecticut
  'FL', // Florida
  'IL', // Illinois
  'MD', // Maryland
  'MA', // Massachusetts
  'MI', // Michigan (with nuances)
  'MT', // Montana
  'NH', // New Hampshire
  'PA', // Pennsylvania
  'WA', // Washington
] as const;

export type TwoPartyConsentState = typeof TWO_PARTY_CONSENT_STATES[number];

export function requiresTwoPartyConsent(state: string): boolean {
  return TWO_PARTY_CONSENT_STATES.includes(state as TwoPartyConsentState);
}
