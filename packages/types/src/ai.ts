import { z } from 'zod';

import { AuditFieldsSchema, UUIDSchema } from './common';

// ============================================================================
// AI Framework Types (HF-CTS, Voice Assistant, Leasing Concierge)
// ============================================================================

export const AIModelSchema = z.enum([
  'gpt-4-turbo',
  'gpt-4',
  'gpt-3.5-turbo',
  'claude-3-opus',
  'claude-3-sonnet',
  'claude-3-haiku',
]);
export type AIModel = z.infer<typeof AIModelSchema>;

export const AICapabilitySchema = z.enum([
  'chat',
  'voice',
  'document_analysis',
  'image_analysis',
  'code_generation',
  'embeddings',
  'function_calling',
]);
export type AICapability = z.infer<typeof AICapabilitySchema>;

// High-Fidelity Context Transfer System (HF-CTS)
export const HFCTSContextSchema = z.object({
  id: UUIDSchema,
  sessionId: UUIDSchema,
  userId: UUIDSchema,

  // Context hierarchy
  globalContext: z.object({
    userProfile: z.object({
      id: UUIDSchema,
      role: z.string(),
      preferences: z.record(z.unknown()),
      recentActions: z.array(z.string()),
    }),
    marketContext: z.object({
      marketId: z.string(),
      regulations: z.array(z.string()),
      currentTrends: z.record(z.unknown()),
    }).optional(),
    sessionStarted: z.coerce.date(),
    interactionCount: z.number().int(),
  }),

  // Domain-specific context
  domainContext: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('property_search'),
      searchCriteria: z.record(z.unknown()),
      viewedListings: z.array(UUIDSchema),
      savedListings: z.array(UUIDSchema),
      rejectedListings: z.array(UUIDSchema),
      preferences: z.record(z.unknown()),
    }),
    z.object({
      type: z.literal('lease_management'),
      activeLeases: z.array(UUIDSchema),
      pendingRenewals: z.array(UUIDSchema),
      maintenanceHistory: z.array(UUIDSchema),
    }),
    z.object({
      type: z.literal('maintenance_triage'),
      currentIssue: z.record(z.unknown()),
      propertyContext: z.record(z.unknown()),
      urgencyAssessment: z.string(),
    }),
    z.object({
      type: z.literal('application_review'),
      applicationId: UUIDSchema,
      applicantProfile: z.record(z.unknown()),
      complianceContext: z.record(z.unknown()),
    }),
    z.object({
      type: z.literal('document_analysis'),
      documentIds: z.array(UUIDSchema),
      extractedData: z.record(z.unknown()),
      analysisType: z.string(),
    }),
  ]),

  // Conversation memory
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system', 'function']),
    content: z.string(),
    timestamp: z.coerce.date(),
    metadata: z.record(z.unknown()).optional(),
  })),

  // Entity references
  referencedEntities: z.array(z.object({
    type: z.string(),
    id: UUIDSchema,
    name: z.string(),
    relevance: z.number(), // 0-1 score
  })),

  // Intent tracking
  currentIntent: z.object({
    primary: z.string(),
    confidence: z.number(),
    subIntents: z.array(z.string()),
    slots: z.record(z.unknown()),
  }).optional(),

  // Context quality metrics
  contextQuality: z.object({
    completeness: z.number(), // 0-1
    relevance: z.number(), // 0-1
    freshness: z.number(), // 0-1
    coherence: z.number(), // 0-1
  }),

  // Expiration
  expiresAt: z.coerce.date(),
}).merge(AuditFieldsSchema);
export type HFCTSContext = z.infer<typeof HFCTSContextSchema>;

// AI Conversation/Session
export const AIConversationSchema = z.object({
  id: UUIDSchema,
  userId: UUIDSchema,
  agentType: z.enum([
    'leasing_concierge',
    'maintenance_triage',
    'document_assistant',
    'voice_assistant',
    'property_search',
    'compliance_advisor',
    'general',
  ]),
  model: AIModelSchema,
  status: z.enum(['active', 'paused', 'completed', 'abandoned']),
  contextId: UUIDSchema, // HF-CTS context reference

  // Handoff tracking
  handoffHistory: z.array(z.object({
    fromAgent: z.string(),
    toAgent: z.string(),
    timestamp: z.coerce.date(),
    reason: z.string(),
    contextTransferred: z.boolean(),
  })).default([]),

  // Performance metrics
  metrics: z.object({
    totalMessages: z.number().int(),
    avgResponseTime: z.number(), // ms
    userSatisfaction: z.number().optional(), // 1-5
    tasksCompleted: z.number().int(),
    escalations: z.number().int(),
  }),

  startedAt: z.coerce.date(),
  lastMessageAt: z.coerce.date(),
  endedAt: z.coerce.date().optional(),
}).merge(AuditFieldsSchema);
export type AIConversation = z.infer<typeof AIConversationSchema>;

// AI Message
export const AIMessageSchema = z.object({
  id: UUIDSchema,
  conversationId: UUIDSchema,
  role: z.enum(['user', 'assistant', 'system', 'function']),
  content: z.string(),

  // For function calls
  functionCall: z.object({
    name: z.string(),
    arguments: z.record(z.unknown()),
    result: z.unknown().optional(),
  }).optional(),

  // Attachments
  attachments: z.array(z.object({
    type: z.enum(['image', 'document', 'audio', 'video']),
    url: z.string(),
    mimeType: z.string(),
    name: z.string(),
  })).default([]),

  // Voice-specific
  voiceData: z.object({
    audioUrl: z.string().optional(),
    transcription: z.string().optional(),
    duration: z.number().optional(), // seconds
    language: z.string().optional(),
  }).optional(),

  // Processing metadata
  processingTime: z.number().optional(), // ms
  tokensUsed: z.object({
    prompt: z.number().int(),
    completion: z.number().int(),
    total: z.number().int(),
  }).optional(),
  model: AIModelSchema.optional(),

  timestamp: z.coerce.date(),
}).merge(AuditFieldsSchema);
export type AIMessage = z.infer<typeof AIMessageSchema>;

// Voice Assistant specific
export const VoiceSessionSchema = z.object({
  id: UUIDSchema,
  conversationId: UUIDSchema,
  userId: UUIDSchema.optional(),
  phoneNumber: z.string().optional(),

  channel: z.enum(['phone', 'web', 'mobile_app', 'smart_speaker']),
  language: z.string().default('en-US'),

  status: z.enum(['initializing', 'active', 'on_hold', 'transferring', 'ended']),

  // Call details (for phone)
  callSid: z.string().optional(),
  callDirection: z.enum(['inbound', 'outbound']).optional(),
  callerNumber: z.string().optional(),
  calledNumber: z.string().optional(),

  // Voice settings
  voiceSettings: z.object({
    voiceId: z.string(),
    speed: z.number().default(1),
    pitch: z.number().default(1),
    volume: z.number().default(1),
  }),

  // Transcription settings
  transcriptionEnabled: z.boolean().default(true),
  transcriptionLanguage: z.string().default('en-US'),

  // Live agent handoff
  handoffRequested: z.boolean().default(false),
  handoffReason: z.string().optional(),
  handoffTo: z.string().optional(),

  duration: z.number().optional(), // seconds
  startedAt: z.coerce.date(),
  endedAt: z.coerce.date().optional(),
}).merge(AuditFieldsSchema);
export type VoiceSession = z.infer<typeof VoiceSessionSchema>;

// Leasing Concierge specific
export const LeasingConciergeSessionSchema = z.object({
  id: UUIDSchema,
  conversationId: UUIDSchema,
  prospectId: UUIDSchema.optional(),
  listingId: UUIDSchema.optional(),

  // Lead qualification
  leadScore: z.number().min(0).max(100).optional(),
  qualificationAnswers: z.record(z.unknown()),

  // Preferences collected
  collectedPreferences: z.object({
    budget: z.object({
      min: z.number().optional(),
      max: z.number().optional(),
    }).optional(),
    bedrooms: z.number().int().optional(),
    moveInDate: z.coerce.date().optional(),
    neighborhoods: z.array(z.string()).default([]),
    mustHaves: z.array(z.string()).default([]),
    dealBreakers: z.array(z.string()).default([]),
  }),

  // Actions taken
  actionsTaken: z.array(z.object({
    action: z.enum([
      'sent_listings',
      'scheduled_tour',
      'answered_question',
      'collected_info',
      'sent_application',
      'escalated_to_agent',
    ]),
    timestamp: z.coerce.date(),
    details: z.record(z.unknown()),
  })).default([]),

  // Outcome
  outcome: z.enum([
    'qualified_lead',
    'tour_scheduled',
    'application_started',
    'not_interested',
    'escalated',
    'pending',
  ]).optional(),

  assignedAgentId: UUIDSchema.optional(),
}).merge(AuditFieldsSchema);
export type LeasingConciergeSession = z.infer<typeof LeasingConciergeSessionSchema>;

// AI Maintenance Triage
export const MaintenanceTriageSchema = z.object({
  id: UUIDSchema,
  conversationId: UUIDSchema,
  reportedBy: UUIDSchema,
  propertyId: UUIDSchema,
  unitId: UUIDSchema.optional(),

  // Issue classification
  issueType: z.string(),
  issueCategory: z.enum([
    'plumbing',
    'electrical',
    'hvac',
    'appliance',
    'structural',
    'pest',
    'safety',
    'cosmetic',
    'common_area',
    'other',
  ]),

  urgency: z.enum(['emergency', 'urgent', 'normal', 'low']),
  urgencyReason: z.string(),

  // Collected information
  issueDescription: z.string(),
  symptoms: z.array(z.string()),
  startedWhen: z.string().optional(),
  affectedAreas: z.array(z.string()),

  // Media
  photos: z.array(z.object({
    url: z.string(),
    description: z.string().optional(),
    aiAnalysis: z.string().optional(),
  })).default([]),
  videos: z.array(z.object({
    url: z.string(),
    description: z.string().optional(),
  })).default([]),

  // AI recommendations
  aiDiagnosis: z.string().optional(),
  suggestedActions: z.array(z.object({
    action: z.string(),
    priority: z.number().int(),
    estimatedCost: z.number().optional(),
    diyPossible: z.boolean(),
  })).default([]),

  // Resolution
  selfHelpProvided: z.boolean().default(false),
  selfHelpSteps: z.array(z.string()).default([]),
  workOrderCreated: z.boolean().default(false),
  workOrderId: UUIDSchema.optional(),
  vendorRecommended: z.string().optional(),

  // Escalation
  escalated: z.boolean().default(false),
  escalationReason: z.string().optional(),
}).merge(AuditFieldsSchema);
export type MaintenanceTriage = z.infer<typeof MaintenanceTriageSchema>;

// AI Agent Configuration
export const AIAgentConfigSchema = z.object({
  id: UUIDSchema,
  agentType: z.string(),
  name: z.string(),
  description: z.string(),

  // Model settings
  model: AIModelSchema,
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().positive().default(4096),

  // System prompt
  systemPrompt: z.string(),

  // Capabilities
  capabilities: z.array(AICapabilitySchema),
  functions: z.array(z.object({
    name: z.string(),
    description: z.string(),
    parameters: z.record(z.unknown()),
    enabled: z.boolean().default(true),
  })).default([]),

  // Knowledge bases
  knowledgeBases: z.array(z.object({
    id: UUIDSchema,
    name: z.string(),
    type: z.enum(['documents', 'faq', 'regulations', 'properties']),
  })).default([]),

  // Handoff rules
  handoffRules: z.array(z.object({
    condition: z.string(),
    targetAgent: z.string(),
    preserveContext: z.boolean().default(true),
  })).default([]),

  // Rate limits
  rateLimits: z.object({
    requestsPerMinute: z.number().int().positive(),
    tokensPerMinute: z.number().int().positive(),
    concurrentSessions: z.number().int().positive(),
  }),

  isActive: z.boolean().default(true),
}).merge(AuditFieldsSchema);
export type AIAgentConfig = z.infer<typeof AIAgentConfigSchema>;

// AI usage/billing
export const AIUsageRecordSchema = z.object({
  id: UUIDSchema,
  organizationId: UUIDSchema,
  userId: UUIDSchema.optional(),
  conversationId: UUIDSchema.optional(),

  model: AIModelSchema,
  operation: z.enum(['chat', 'embedding', 'voice_transcription', 'voice_synthesis', 'image_analysis']),

  tokensPrompt: z.number().int(),
  tokensCompletion: z.number().int(),
  tokensTotal: z.number().int(),

  cost: z.number(), // In cents

  timestamp: z.coerce.date(),
});
export type AIUsageRecord = z.infer<typeof AIUsageRecordSchema>;
