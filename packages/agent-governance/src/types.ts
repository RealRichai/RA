/**
 * Agent Governance Types
 *
 * Comprehensive type definitions for investor-grade AI governance.
 */

import { z } from 'zod';

// =============================================================================
// Core Enums
// =============================================================================

export const AgentTypeSchema = z.enum([
  'leasing_assistant',
  'maintenance_coordinator',
  'document_processor',
  'compliance_checker',
  'lead_qualifier',
  'voice_agent',
  'notification_agent',
  'analytics_agent',
]);
export type AgentType = z.infer<typeof AgentTypeSchema>;

export const AgentRunStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
  'timeout',
  'policy_blocked',
]);
export type AgentRunStatus = z.infer<typeof AgentRunStatusSchema>;

export const ToolCallStatusSchema = z.enum([
  'pending',
  'approved',
  'executed',
  'blocked',
  'failed',
  'timeout',
]);
export type ToolCallStatus = z.infer<typeof ToolCallStatusSchema>;

export const PolicyViolationSeveritySchema = z.enum([
  'info',
  'warning',
  'error',
  'critical',
  'fatal',
]);
export type PolicyViolationSeverity = z.infer<typeof PolicyViolationSeveritySchema>;

export const KillSwitchScopeSchema = z.enum([
  'global',        // All agents
  'agent_type',    // Specific agent type
  'tool',          // Specific tool
  'tenant',        // Specific tenant/organization
  'market',        // Specific market (state/region)
  'user',          // Specific user
]);
export type KillSwitchScope = z.infer<typeof KillSwitchScopeSchema>;

export const CallStatusSchema = z.enum([
  'initiated',
  'ringing',
  'in_progress',
  'on_hold',
  'completed',
  'failed',
  'no_answer',
  'busy',
  'cancelled',
]);
export type CallStatus = z.infer<typeof CallStatusSchema>;

export const ConsentStatusSchema = z.enum([
  'pending',
  'granted',
  'denied',
  'withdrawn',
  'expired',
]);
export type ConsentStatus = z.infer<typeof ConsentStatusSchema>;

// =============================================================================
// Result Pattern (No Silent Failures)
// =============================================================================

export const ResultOkSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    ok: z.literal(true),
    data: dataSchema,
  });

export const ResultErrSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
    retryable: z.boolean().default(false),
    policyViolation: z.boolean().default(false),
  }),
});

export type ResultOk<T> = { ok: true; data: T };
export type ResultErr = z.infer<typeof ResultErrSchema>;
export type Result<T> = ResultOk<T> | ResultErr;

// Helper functions for Result pattern
export function Ok<T>(data: T): ResultOk<T> {
  return { ok: true, data };
}

export function Err(
  code: string,
  message: string,
  options?: { details?: Record<string, unknown>; retryable?: boolean; policyViolation?: boolean }
): ResultErr {
  return {
    ok: false,
    error: {
      code,
      message,
      details: options?.details,
      retryable: options?.retryable ?? false,
      policyViolation: options?.policyViolation ?? false,
    },
  };
}

// =============================================================================
// Agent Run Model
// =============================================================================

export const ToolCallSchema = z.object({
  id: z.string(),
  toolName: z.string(),
  inputs: z.record(z.unknown()),
  inputsHash: z.string(), // SHA256 hash for deduplication
  status: ToolCallStatusSchema,
  policyCheckResult: z.object({
    approved: z.boolean(),
    violations: z.array(z.string()).default([]),
    appliedRules: z.array(z.string()).default([]),
  }).optional(),
  output: z.unknown().optional(),
  error: z.string().optional(),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
  durationMs: z.number().optional(),
  costUsd: z.number().default(0),
});
export type ToolCall = z.infer<typeof ToolCallSchema>;

export const PromptMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string(),
  redacted: z.boolean().default(false),
  tokenCount: z.number().optional(),
});
export type PromptMessage = z.infer<typeof PromptMessageSchema>;

export const RedactionReportSchema = z.object({
  fieldsRedacted: z.array(z.string()),
  piiTypesFound: z.array(z.string()),
  redactionTimestamp: z.date(),
  redactedBy: z.string(), // System or user ID
});
export type RedactionReport = z.infer<typeof RedactionReportSchema>;

export const AgentOutcomeSchema = z.object({
  success: z.boolean(),
  actionsTaken: z.array(z.string()),
  entitiesAffected: z.array(z.object({
    type: z.string(),
    id: z.string(),
    action: z.string(),
  })),
  summaryForHuman: z.string(),
  confidence: z.number().min(0).max(1).optional(),
});
export type AgentOutcome = z.infer<typeof AgentOutcomeSchema>;

export const AgentRunSchema = z.object({
  id: z.string(),
  requestId: z.string(), // Correlation ID for distributed tracing
  agentType: AgentTypeSchema,
  status: AgentRunStatusSchema,

  // Context
  tenantId: z.string(),
  userId: z.string().optional(),
  market: z.string().optional(), // State/region code

  // Inputs
  inputsHash: z.string(), // SHA256 of canonical inputs for idempotency
  inputs: z.record(z.unknown()),
  context: z.record(z.unknown()).optional(),

  // Prompts & Messages
  prompts: z.array(PromptMessageSchema),
  totalTokensIn: z.number().default(0),
  totalTokensOut: z.number().default(0),

  // Tool Calls
  toolCalls: z.array(ToolCallSchema),

  // Outcome
  outcome: AgentOutcomeSchema.optional(),

  // Policy & Compliance
  policyVersion: z.string(),
  policyViolations: z.array(z.object({
    ruleId: z.string(),
    severity: PolicyViolationSeveritySchema,
    message: z.string(),
    timestamp: z.date(),
  })),
  marketPackVersion: z.string().optional(),

  // Cost & Performance
  totalCostUsd: z.number().default(0),
  modelId: z.string(),
  startedAt: z.date(),
  completedAt: z.date().optional(),
  durationMs: z.number().optional(),

  // Redaction
  redactionReport: RedactionReportSchema.optional(),

  // Metadata
  metadata: z.record(z.unknown()).optional(),
  parentRunId: z.string().optional(), // For nested agent calls
  retryOf: z.string().optional(), // ID of run this is retrying
  retryCount: z.number().default(0),
});
export type AgentRun = z.infer<typeof AgentRunSchema>;

// =============================================================================
// Policy Gate Types
// =============================================================================

export const PolicyRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.enum([
    'fcha_compliance',      // Fair Credit Housing Act
    'fee_compliance',       // Fee regulations
    'market_rules',         // Market-specific rules
    'data_protection',      // PII/GDPR rules
    'content_safety',       // Content moderation
    'operational_limits',   // Rate limits, cost caps
  ]),
  severity: PolicyViolationSeveritySchema,
  enabled: z.boolean().default(true),
  markets: z.array(z.string()).optional(), // Empty = all markets
  agentTypes: z.array(AgentTypeSchema).optional(), // Empty = all agents
  tools: z.array(z.string()).optional(), // Empty = all tools
  conditions: z.record(z.unknown()), // Rule-specific conditions
  version: z.string(),
});
export type PolicyRule = z.infer<typeof PolicyRuleSchema>;

export const PolicyCheckRequestSchema = z.object({
  agentType: AgentTypeSchema,
  toolName: z.string(),
  toolInputs: z.record(z.unknown()),
  market: z.string().optional(),
  tenantId: z.string(),
  userId: z.string().optional(),
  context: z.record(z.unknown()).optional(),
});
export type PolicyCheckRequest = z.infer<typeof PolicyCheckRequestSchema>;

export const PolicyCheckResultSchema = z.object({
  approved: z.boolean(),
  violations: z.array(z.object({
    ruleId: z.string(),
    ruleName: z.string(),
    severity: PolicyViolationSeveritySchema,
    message: z.string(),
    suggestedFix: z.string().optional(),
  })),
  appliedRules: z.array(z.string()),
  blockedBy: z.string().optional(), // Rule ID that caused block
  checkDurationMs: z.number(),
  policyVersion: z.string(),
});
export type PolicyCheckResult = z.infer<typeof PolicyCheckResultSchema>;

// =============================================================================
// Control Tower Types
// =============================================================================

export const KillSwitchSchema = z.object({
  id: z.string(),
  scope: KillSwitchScopeSchema,
  scopeValue: z.string().optional(), // e.g., agent type, tool name, tenant ID
  reason: z.string(),
  activatedBy: z.string(), // Admin user ID
  activatedAt: z.date(),
  expiresAt: z.date().optional(),
  active: z.boolean().default(true),
  affectedAgentTypes: z.array(AgentTypeSchema).optional(),
  affectedTools: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type KillSwitch = z.infer<typeof KillSwitchSchema>;

export const QueueHealthSchema = z.object({
  queueName: z.string(),
  waiting: z.number(),
  active: z.number(),
  completed: z.number(),
  failed: z.number(),
  delayed: z.number(),
  paused: z.boolean(),
  workers: z.number(),
  avgProcessingTimeMs: z.number().optional(),
  oldestJobAge: z.number().optional(), // Seconds
  lastCheckedAt: z.date(),
});
export type QueueHealth = z.infer<typeof QueueHealthSchema>;

export const AgentRunSummarySchema = z.object({
  totalRuns: z.number(),
  successfulRuns: z.number(),
  failedRuns: z.number(),
  policyBlockedRuns: z.number(),
  totalCostUsd: z.number(),
  avgDurationMs: z.number(),
  byAgentType: z.record(z.number()),
  byStatus: z.record(z.number()),
  timeRange: z.object({
    start: z.date(),
    end: z.date(),
  }),
});
export type AgentRunSummary = z.infer<typeof AgentRunSummarySchema>;

export const ControlTowerDashboardSchema = z.object({
  summary: AgentRunSummarySchema,
  queueHealth: z.array(QueueHealthSchema),
  activeKillSwitches: z.array(KillSwitchSchema),
  recentViolations: z.array(z.object({
    runId: z.string(),
    ruleId: z.string(),
    severity: PolicyViolationSeveritySchema,
    message: z.string(),
    timestamp: z.date(),
  })),
  alertsTriggered: z.number(),
  lastUpdated: z.date(),
});
export type ControlTowerDashboard = z.infer<typeof ControlTowerDashboardSchema>;

// =============================================================================
// Task Queue Types
// =============================================================================

export const TaskPrioritySchema = z.enum(['critical', 'high', 'normal', 'low']);
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

export const AITaskSchema = z.object({
  id: z.string(),
  type: z.string(),
  agentType: AgentTypeSchema,
  priority: TaskPrioritySchema,
  payload: z.record(z.unknown()),
  idempotencyKey: z.string(),
  tenantId: z.string(),
  userId: z.string().optional(),
  market: z.string().optional(),
  maxRetries: z.number().default(3),
  retryCount: z.number().default(0),
  backoffMs: z.number().default(1000),
  timeoutMs: z.number().default(300000), // 5 minutes
  createdAt: z.date(),
  scheduledFor: z.date().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type AITask = z.infer<typeof AITaskSchema>;

export const TaskOutcomeSchema = z.object({
  taskId: z.string(),
  runId: z.string().optional(),
  success: z.boolean(),
  result: z.unknown().optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    stack: z.string().optional(),
  }).optional(),
  retried: z.boolean().default(false),
  completedAt: z.date(),
  durationMs: z.number(),
});
export type TaskOutcome = z.infer<typeof TaskOutcomeSchema>;

export const AlertConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean().default(true),
  conditions: z.object({
    queueDepthThreshold: z.number().optional(),
    failureRateThreshold: z.number().optional(), // 0-1
    avgLatencyThresholdMs: z.number().optional(),
    costThresholdUsd: z.number().optional(),
    policyViolationCount: z.number().optional(),
  }),
  channels: z.array(z.enum(['email', 'slack', 'pagerduty', 'webhook'])),
  cooldownMinutes: z.number().default(15),
  lastTriggeredAt: z.date().optional(),
});
export type AlertConfig = z.infer<typeof AlertConfigSchema>;

// =============================================================================
// Voice AI Types
// =============================================================================

export const VoiceProviderSchema = z.enum(['twilio', 'webrtc', 'vonage']);
export type VoiceProvider = z.infer<typeof VoiceProviderSchema>;

export const CallDirectionSchema = z.enum(['inbound', 'outbound']);
export type CallDirection = z.infer<typeof CallDirectionSchema>;

export const CallConsentSchema = z.object({
  callId: z.string(),
  status: ConsentStatusSchema,
  consentType: z.enum(['recording', 'ai_agent', 'data_processing']),
  grantedAt: z.date().optional(),
  grantedBy: z.string().optional(), // Who gave consent
  method: z.enum(['verbal', 'keypress', 'pre_agreed', 'written']).optional(),
  expiresAt: z.date().optional(),
  recordingUrl: z.string().optional(), // Recording of consent if verbal
  metadata: z.record(z.unknown()).optional(),
});
export type CallConsent = z.infer<typeof CallConsentSchema>;

export const CallRecordingSchema = z.object({
  id: z.string(),
  callId: z.string(),
  provider: VoiceProviderSchema,
  providerRecordingId: z.string().optional(),
  status: z.enum(['recording', 'processing', 'completed', 'failed', 'deleted']),
  startedAt: z.date(),
  endedAt: z.date().optional(),
  durationSeconds: z.number().optional(),
  storageUrl: z.string().optional(),
  storageBucket: z.string().optional(),
  storageKey: z.string().optional(),
  sizeBytes: z.number().optional(),
  format: z.string().default('audio/wav'),
  retentionDays: z.number().default(90),
  deletedAt: z.date().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type CallRecording = z.infer<typeof CallRecordingSchema>;

export const TranscriptionSchema = z.object({
  id: z.string(),
  callId: z.string(),
  recordingId: z.string(),
  status: z.enum(['pending', 'processing', 'completed', 'failed']),
  provider: z.string(), // e.g., 'deepgram', 'whisper', 'aws_transcribe'
  language: z.string().default('en-US'),
  segments: z.array(z.object({
    speaker: z.string(),
    text: z.string(),
    startTime: z.number(),
    endTime: z.number(),
    confidence: z.number().optional(),
  })).optional(),
  fullText: z.string().optional(),
  wordCount: z.number().optional(),
  durationSeconds: z.number().optional(),
  processedAt: z.date().optional(),
  costUsd: z.number().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type Transcription = z.infer<typeof TranscriptionSchema>;

export const CallGradingRubricSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string(),
  categories: z.array(z.object({
    id: z.string(),
    name: z.string(),
    weight: z.number(), // 0-1, should sum to 1
    criteria: z.array(z.object({
      id: z.string(),
      description: z.string(),
      maxScore: z.number(),
      examples: z.object({
        excellent: z.string().optional(),
        good: z.string().optional(),
        poor: z.string().optional(),
      }).optional(),
    })),
  })),
  passingScore: z.number(), // Minimum score to pass
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type CallGradingRubric = z.infer<typeof CallGradingRubricSchema>;

export const CallGradeSchema = z.object({
  id: z.string(),
  callId: z.string(),
  transcriptionId: z.string(),
  rubricId: z.string(),
  rubricVersion: z.string(),
  gradedBy: z.enum(['ai', 'human', 'hybrid']),
  graderId: z.string().optional(), // AI model or human user ID
  totalScore: z.number(),
  maxScore: z.number(),
  percentage: z.number(),
  passed: z.boolean(),
  categoryScores: z.array(z.object({
    categoryId: z.string(),
    score: z.number(),
    maxScore: z.number(),
    criteriaScores: z.array(z.object({
      criteriaId: z.string(),
      score: z.number(),
      maxScore: z.number(),
      notes: z.string().optional(),
      timestamp: z.number().optional(), // Reference to transcript time
    })),
  })),
  feedback: z.string().optional(),
  improvementAreas: z.array(z.string()).optional(),
  gradedAt: z.date(),
  reviewedBy: z.string().optional(),
  reviewedAt: z.date().optional(),
});
export type CallGrade = z.infer<typeof CallGradeSchema>;

export const VoiceCallSchema = z.object({
  id: z.string(),
  provider: VoiceProviderSchema,
  providerCallId: z.string().optional(),
  direction: CallDirectionSchema,
  status: CallStatusSchema,

  // Participants
  fromNumber: z.string(),
  toNumber: z.string(),
  tenantId: z.string(),
  userId: z.string().optional(),
  agentType: AgentTypeSchema.optional(),
  agentRunId: z.string().optional(),

  // Context
  purpose: z.string().optional(),
  relatedEntityType: z.string().optional(),
  relatedEntityId: z.string().optional(),

  // Consent
  consents: z.array(CallConsentSchema),
  recordingConsent: z.boolean().default(false),
  aiAgentConsent: z.boolean().default(false),

  // Recording & Transcription
  recording: CallRecordingSchema.optional(),
  transcription: TranscriptionSchema.optional(),
  grade: CallGradeSchema.optional(),

  // Timing
  initiatedAt: z.date(),
  answeredAt: z.date().optional(),
  endedAt: z.date().optional(),
  durationSeconds: z.number().optional(),

  // Cost
  costUsd: z.number().optional(),

  // Outcome
  outcome: z.enum(['successful', 'no_answer', 'busy', 'failed', 'voicemail', 'callback_requested']).optional(),
  notes: z.string().optional(),

  metadata: z.record(z.unknown()).optional(),
});
export type VoiceCall = z.infer<typeof VoiceCallSchema>;

// =============================================================================
// FCHA (Fair Credit Housing Act) Types
// =============================================================================

export const FCHAStageSchema = z.enum([
  'inquiry',           // Initial contact
  'application',       // Application submitted
  'screening',         // Background/credit check
  'approval',          // Approval decision
  'lease_signing',     // Lease execution
  'move_in',           // Move-in process
  'tenancy',           // Active lease
  'renewal',           // Lease renewal
  'move_out',          // Move-out process
]);
export type FCHAStage = z.infer<typeof FCHAStageSchema>;

export const ProtectedClassSchema = z.enum([
  'race',
  'color',
  'national_origin',
  'religion',
  'sex',
  'familial_status',
  'disability',
  // Additional state-level protections
  'sexual_orientation',
  'gender_identity',
  'marital_status',
  'age',
  'source_of_income',
  'military_status',
  'citizenship_status',
]);
export type ProtectedClass = z.infer<typeof ProtectedClassSchema>;

export const FCHAViolationTypeSchema = z.enum([
  'discriminatory_statement',
  'discriminatory_screening',
  'discriminatory_pricing',
  'discriminatory_terms',
  'steering',
  'refusal_to_rent',
  'harassment',
  'retaliation',
  'failure_to_accommodate',
  'advertising_violation',
]);
export type FCHAViolationType = z.infer<typeof FCHAViolationTypeSchema>;
