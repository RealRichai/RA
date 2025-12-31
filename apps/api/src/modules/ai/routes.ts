import { prisma, type Prisma } from '@realriches/database';
import { generatePrefixedId, NotFoundError, logger } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// High-Fidelity Context Transfer System (HF-CTS) schemas
const CreateConversationSchema = z.object({
  contextType: z.enum([
    'leasing_inquiry',
    'maintenance_request',
    'general_support',
    'property_tour',
    'application_help',
  ]),
  entityType: z.enum(['listing', 'property', 'unit', 'lease', 'work_order']).optional(),
  entityId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const SendMessageSchema = z.object({
  content: z.string().min(1).max(10000),
  attachments: z.array(z.string()).optional(),
});

const MaintenanceTriageSchema = z.object({
  description: z.string().min(1),
  propertyId: z.string(),
  unitId: z.string().optional(),
  images: z.array(z.string()).optional(),
  urgencyHint: z.enum(['low', 'normal', 'high', 'emergency']).optional(),
});

export async function aiRoutes(app: FastifyInstance): Promise<void> {
  // Create new AI conversation
  app.post(
    '/conversations',
    {
      schema: {
        description: 'Create a new AI conversation with HF-CTS context',
        tags: ['AI'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        // Apply AI-specific rate limits
        const allowed = await app.checkRateLimit(request, reply, { category: 'ai' });
        if (!allowed) return;
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const data = CreateConversationSchema.parse(request.body);

      // Build initial context for HF-CTS
      const context = await buildContext({
        contextType: data.contextType,
        entityType: data.entityType,
        entityId: data.entityId,
      });

      const conversation = await prisma.aIConversation.create({
        data: {
          id: generatePrefixedId('conv'),
          agentType: 'assistant',
          model: 'claude-3-5-sonnet',
          contextType: data.contextType,
          entityType: data.entityType,
          entityId: data.entityId,
          context: context as Prisma.InputJsonValue,
          status: 'active',
          user: { connect: { id: request.user.id } },
        },
      });

      // Create system message with context
      await prisma.aIMessage.create({
        data: {
          id: generatePrefixedId('msg'),
          conversationId: conversation.id,
          role: 'system',
          content: generateSystemPrompt(data.contextType, context),
        },
      });

      return reply.status(201).send({
        success: true,
        data: {
          conversationId: conversation.id,
          contextType: conversation.contextType,
          welcomeMessage: getWelcomeMessage(data.contextType || 'general_support'),
        },
      });
    }
  );

  // Send message in conversation
  app.post(
    '/conversations/:id/messages',
    {
      schema: {
        description: 'Send a message in an AI conversation',
        tags: ['AI'],
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply, { optional: true });
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { content, attachments } = SendMessageSchema.parse(request.body);

      const conversation = await prisma.aIConversation.findUnique({
        where: { id: request.params.id },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            take: 20, // Last 20 messages for context
          },
        },
      });

      if (!conversation) {
        throw new NotFoundError('Conversation not found');
      }

      // Store user message
      const userMessage = await prisma.aIMessage.create({
        data: {
          id: generatePrefixedId('msg'),
          conversationId: conversation.id,
          role: 'user',
          content,
          attachments: (attachments || []) as Prisma.InputJsonValue,
        },
      });

      // Generate AI response using AIClient
      const aiResponse = await generateAIResponse(app, conversation, content);

      // Store AI response
      const assistantMessage = await prisma.aIMessage.create({
        data: {
          id: generatePrefixedId('msg'),
          conversationId: conversation.id,
          role: 'assistant',
          content: aiResponse.content,
          metadata: (aiResponse.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });

      // Update conversation last message time
      await prisma.aIConversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: new Date(),
          context: {
            ...(conversation.context as object || {}),
            lastIntent: aiResponse.metadata?.intent,
          } as Prisma.InputJsonValue,
        },
      });

      return reply.send({
        success: true,
        data: {
          userMessage,
          assistantMessage,
          suggestedActions: aiResponse.suggestedActions,
        },
      });
    }
  );

  // Get conversation history
  app.get(
    '/conversations/:id',
    {
      schema: {
        description: 'Get conversation with message history',
        tags: ['AI'],
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply, { optional: true });
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const conversation = await prisma.aIConversation.findUnique({
        where: { id: request.params.id },
        include: {
          messages: {
            where: { role: { not: 'system' } },
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (!conversation) {
        throw new NotFoundError('Conversation not found');
      }

      return reply.send({ success: true, data: conversation });
    }
  );

  // AI Maintenance Triage
  app.post(
    '/maintenance/triage',
    {
      schema: {
        description: 'AI-powered maintenance issue triage',
        tags: ['AI'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const data = MaintenanceTriageSchema.parse(request.body);

      // Verify property access
      const property = await prisma.property.findUnique({
        where: { id: data.propertyId },
      });

      if (!property) {
        throw new NotFoundError('Property not found');
      }

      // Create a conversation for the triage
      const conversation = await prisma.aIConversation.create({
        data: {
          id: generatePrefixedId('conv'),
          agentType: 'maintenance_triage',
          model: 'claude-3-5-sonnet',
          contextType: 'maintenance_request',
          status: 'active',
          user: { connect: { id: request.user.id } },
        },
      });

      // Perform AI triage using AIClient
      const triageResult = await performMaintenanceTriage(app, {
        description: data.description,
        propertyId: data.propertyId,
        unitId: data.unitId,
        images: data.images,
        urgencyHint: data.urgencyHint,
      }, property);

      // Store triage result in MaintenanceTriage
      const triage = await prisma.maintenanceTriage.create({
        data: {
          id: generatePrefixedId('trg'),
          conversationId: conversation.id,
          reportedBy: request.user.id,
          propertyId: data.propertyId,
          unitId: data.unitId,
          description: data.description,
          issueType: triageResult.category,
          issueCategory: triageResult.category,
          urgency: triageResult.urgency,
          urgencyReason: triageResult.analysis,
          issueDescription: triageResult.analysis,
          images: data.images || [],
          aiDiagnosis: triageResult.analysis,
          suggestedActions: triageResult.recommendations as Prisma.InputJsonValue,
        },
      });

      return reply.send({
        success: true,
        data: {
          triage,
          recommendations: triageResult.recommendations,
        },
      });
    }
  );

  // Handoff conversation to human
  app.post(
    '/conversations/:id/handoff',
    {
      schema: {
        description: 'Request human handoff for conversation',
        tags: ['AI'],
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply, { optional: true });
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { reason } = (request.body as { reason?: string }) || {};

      const conversation = await prisma.aIConversation.findUnique({
        where: { id: request.params.id },
        include: {
          user: { select: { email: true, firstName: true } },
          messages: { orderBy: { createdAt: 'desc' }, take: 5 },
        },
      });

      if (!conversation) {
        throw new NotFoundError('Conversation not found');
      }

      // Update conversation status
      await prisma.aIConversation.update({
        where: { id: conversation.id },
        data: {
          status: 'handoff_requested',
          handoffReason: reason,
          handoffRequestedAt: new Date(),
        },
      });

      // Create handoff message
      await prisma.aIMessage.create({
        data: {
          id: generatePrefixedId('msg'),
          conversationId: conversation.id,
          role: 'system',
          content: `Handoff requested: ${reason || 'User requested human assistance'}`,
          metadata: { handoffReason: reason } as Prisma.InputJsonValue,
        },
      });

      // Notify support team via email
      await notifyHandoffRequest(app, conversation, reason);

      return reply.send({
        success: true,
        data: {
          message: 'A team member will be with you shortly.',
          estimatedWaitTime: '5-10 minutes',
        },
      });
    }
  );

  // Voice session (placeholder - requires Twilio/WebRTC infrastructure)
  app.post(
    '/voice/session',
    {
      schema: {
        description: 'Initialize voice AI session',
        tags: ['AI'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Voice integration requires Twilio/WebRTC infrastructure setup
      return reply.send({
        success: true,
        data: {
          sessionId: generatePrefixedId('vcs'),
          message: 'Voice AI requires Twilio/WebRTC infrastructure configuration',
          status: 'INFRASTRUCTURE_REQUIRED',
        },
      });
    }
  );
}

// Helper functions

async function buildContext(data: {
  contextType: string;
  entityType?: string;
  entityId?: string;
}): Promise<Record<string, unknown>> {
  const context: Record<string, unknown> = {
    contextType: data.contextType,
    timestamp: new Date().toISOString(),
  };

  if (data.entityType && data.entityId) {
    switch (data.entityType) {
      case 'listing':
        const listing = await prisma.listing.findUnique({
          where: { id: data.entityId },
          include: {
            unit: { include: { property: true } },
          },
        });
        if (listing) {
          context.listing = {
            id: listing.id,
            title: listing.title,
            rent: listing.rent,
            unit: {
              bedrooms: listing.unit.bedrooms,
              bathrooms: listing.unit.bathrooms,
            },
            property: {
              name: listing.unit.property.name,
              address: listing.unit.property.address,
            },
          };
        }
        break;

      case 'property':
        const property = await prisma.property.findUnique({
          where: { id: data.entityId },
          include: { units: true },
        });
        if (property) {
          context.property = {
            id: property.id,
            name: property.name,
            address: property.address,
            totalUnits: property.units.length,
          };
        }
        break;

      case 'work_order':
        const workOrder = await prisma.workOrder.findUnique({
          where: { id: data.entityId },
          include: { unit: { include: { property: true } } },
        });
        if (workOrder) {
          context.workOrder = {
            id: workOrder.id,
            title: workOrder.title,
            description: workOrder.description,
            status: workOrder.status,
            priority: workOrder.priority,
          };
        }
        break;
    }
  }

  return context;
}

function generateSystemPrompt(
  contextType: string | null,
  context: Record<string, unknown>
): string {
  const basePrompt = `You are an AI assistant for RealRiches, an AI-powered real estate platform.
You help users with property management, leasing, and maintenance tasks.
Always be helpful, professional, and comply with fair housing laws.
Never discriminate based on protected classes (race, color, religion, national origin, sex, familial status, disability).
Never suggest or endorse illegal fees or practices.`;

  switch (contextType) {
    case 'leasing_inquiry':
      return `${basePrompt}
You are helping with a leasing inquiry.
${context.listing ? `Property: ${JSON.stringify(context.listing)}` : ''}
Help the user learn about the property and schedule viewings.`;

    case 'maintenance_request':
      return `${basePrompt}
You are helping with a maintenance request.
${context.workOrder ? `Work Order: ${JSON.stringify(context.workOrder)}` : ''}
Help diagnose issues and escalate emergencies appropriately.`;

    case 'property_tour':
      return `${basePrompt}
You are a virtual tour guide.
${context.property ? `Property: ${JSON.stringify(context.property)}` : ''}
Provide engaging information about the property.`;

    default:
      return basePrompt;
  }
}

function getWelcomeMessage(contextType: string): string {
  switch (contextType) {
    case 'leasing_inquiry':
      return "Hi! I'm here to help you with your leasing inquiry. What would you like to know about this property?";
    case 'maintenance_request':
      return "Hi! I can help you report a maintenance issue. Please describe the problem you're experiencing.";
    case 'property_tour':
      return "Welcome! I'll be your virtual guide today. What would you like to see first?";
    default:
      return 'Hi! How can I assist you today?';
  }
}

async function generateAIResponse(
  app: FastifyInstance,
  conversation: {
    id: string;
    contextType: string | null;
    context: Prisma.JsonValue;
    messages: { role: string; content: string }[];
    entityId?: string | null;
  },
  userMessage: string
): Promise<{
  content: string;
  metadata?: Record<string, unknown>;
  suggestedActions?: string[];
}> {
  const context = (conversation.context || {}) as Record<string, unknown>;

  // Build messages for AIClient
  const messages = [
    { role: 'system' as const, content: generateSystemPrompt(conversation.contextType, context) },
    ...conversation.messages.slice(-10).map((m) => ({
      role: m.role.toLowerCase() as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: userMessage },
  ];

  try {
    // Use AIClient for completion with PII redaction and policy gate
    const response = await app.aiClient.complete({
      messages,
      model: 'claude-3-5-sonnet',
      context: {
        conversationId: conversation.id,
        entityId: conversation.entityId || undefined,
        marketId: 'US_STANDARD',
      },
      config: {
        maxTokens: 1024,
        temperature: 0.7,
      },
    });

    // Extract suggested actions from response
    const suggestedActions = extractSuggestedActions(response.content, conversation.contextType);

    return {
      content: response.content,
      metadata: {
        agentRunId: response.agentRunId,
        model: response.model,
        tokensUsed: response.tokensUsed,
        processingTimeMs: response.processingTimeMs,
      },
      suggestedActions,
    };
  } catch (error) {
    logger.error({ error, conversationId: conversation.id }, 'AI completion failed');

    // Fallback to simple response on error
    return {
      content: "I apologize, but I'm having trouble processing your request. Let me connect you with a team member who can help.",
      suggestedActions: ['Talk to a person', 'Try again'],
    };
  }
}

function extractSuggestedActions(
  responseContent: string,
  contextType: string | null
): string[] {
  const lowerContent = responseContent.toLowerCase();

  if (contextType === 'leasing_inquiry') {
    if (lowerContent.includes('schedule') || lowerContent.includes('viewing') || lowerContent.includes('tour')) {
      return ['Schedule for tomorrow', 'Schedule for this weekend', 'See available times'];
    }
    if (lowerContent.includes('application') || lowerContent.includes('apply')) {
      return ['Start application', 'View requirements', 'Talk to an agent'];
    }
    return ['Property details', 'Schedule viewing', 'Talk to an agent'];
  }

  if (contextType === 'maintenance_request') {
    if (lowerContent.includes('emergency') || lowerContent.includes('urgent')) {
      return ['Escalate to emergency', 'Call emergency line', 'Talk to a person'];
    }
    return ['Submit work order', 'Add photos', 'Talk to a person'];
  }

  return ['Learn more', 'Talk to a person'];
}

async function performMaintenanceTriage(
  app: FastifyInstance,
  data: {
    description: string;
    propertyId: string;
    unitId?: string;
    images?: string[];
    urgencyHint?: string;
  },
  property: { id: string; name: string; address: string }
): Promise<{
  category: string;
  urgency: string;
  estimatedCost: { min: number; max: number };
  suggestedVendorType: string;
  suggestedTitle: string;
  analysis: string;
  recommendations: string[];
}> {
  const triagePrompt = `You are a maintenance triage expert. Analyze this maintenance request.

Property: ${property.name} at ${property.address}
${data.unitId ? `Unit: ${data.unitId}` : ''}
Description: ${data.description}
${data.images?.length ? `Images provided: ${data.images.length}` : 'No images'}
${data.urgencyHint ? `User indicated urgency: ${data.urgencyHint}` : ''}

Return ONLY a JSON object with:
- category: PLUMBING, ELECTRICAL, HVAC, APPLIANCE, STRUCTURAL, GENERAL, EMERGENCY
- urgency: LOW, MEDIUM, HIGH, or EMERGENCY
- estimatedCost: { min: number, max: number } in dollars
- suggestedVendorType: type of vendor needed
- suggestedTitle: short title for work order (max 60 chars)
- analysis: 2-3 sentence analysis of the issue
- recommendations: array of 3 recommended actions for the tenant`;

  try {
    const response = await app.aiClient.complete({
      messages: [
        { role: 'system', content: 'You are a maintenance triage expert. Return only valid JSON.' },
        { role: 'user', content: triagePrompt },
      ],
      model: 'claude-3-5-sonnet',
      context: {
        entityType: 'property',
        entityId: property.id,
        marketId: 'US_STANDARD',
      },
      config: { maxTokens: 512, temperature: 0.3 },
    });

    const parsed = tryParseJSON(response.content);
    if (parsed && parsed.category && parsed.urgency) {
      return {
        category: String(parsed.category),
        urgency: String(parsed.urgency),
        estimatedCost: (parsed.estimatedCost as { min: number; max: number }) || { min: 50, max: 300 },
        suggestedVendorType: String(parsed.suggestedVendorType || 'HANDYMAN'),
        suggestedTitle: String(parsed.suggestedTitle || `Maintenance: ${data.description.slice(0, 40)}`),
        analysis: String(parsed.analysis || 'AI analysis in progress.'),
        recommendations: (parsed.recommendations as string[]) || ['Document with photos', 'Contact property manager'],
      };
    }
  } catch (error) {
    logger.error({ error, propertyId: property.id }, 'AI triage failed');
  }

  // Fallback to keyword-based triage
  return keywordBasedTriage(data);
}

function tryParseJSON(str: string): Record<string, unknown> | null {
  try {
    const jsonMatch = str.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return null;
  } catch {
    return null;
  }
}

function keywordBasedTriage(data: {
  description: string;
  urgencyHint?: string;
}): {
  category: string;
  urgency: string;
  estimatedCost: { min: number; max: number };
  suggestedVendorType: string;
  suggestedTitle: string;
  analysis: string;
  recommendations: string[];
} {
  const desc = data.description.toLowerCase();

  if (desc.includes('fire') || desc.includes('gas') || desc.includes('flood') || desc.includes('no heat')) {
    return {
      category: 'EMERGENCY',
      urgency: 'EMERGENCY',
      estimatedCost: { min: 500, max: 5000 },
      suggestedVendorType: 'EMERGENCY_SERVICES',
      suggestedTitle: 'Emergency: ' + data.description.slice(0, 50),
      analysis: 'This issue requires immediate attention due to safety concerns.',
      recommendations: ['Contact emergency services if immediate danger', 'Evacuate if necessary', 'Document damage with photos'],
    };
  }

  if (desc.includes('leak') || desc.includes('water') || desc.includes('clog')) {
    return {
      category: 'PLUMBING',
      urgency: desc.includes('major') || desc.includes('flooding') ? 'HIGH' : 'MEDIUM',
      estimatedCost: { min: 100, max: 500 },
      suggestedVendorType: 'PLUMBER',
      suggestedTitle: 'Plumbing: ' + data.description.slice(0, 50),
      analysis: 'Plumbing issue detected. Recommend professional inspection.',
      recommendations: ['Turn off water supply if possible', 'Place bucket under active leaks', 'Take photos of affected areas'],
    };
  }

  if (desc.includes('electric') || desc.includes('outlet') || desc.includes('power')) {
    return {
      category: 'ELECTRICAL',
      urgency: desc.includes('spark') || desc.includes('burning') ? 'HIGH' : 'MEDIUM',
      estimatedCost: { min: 150, max: 600 },
      suggestedVendorType: 'ELECTRICIAN',
      suggestedTitle: 'Electrical: ' + data.description.slice(0, 50),
      analysis: 'Electrical issue detected. Safety inspection recommended.',
      recommendations: ['Do not attempt DIY electrical repairs', 'Avoid using affected outlets', 'Check circuit breaker'],
    };
  }

  return {
    category: 'GENERAL',
    urgency: data.urgencyHint?.toUpperCase() || 'LOW',
    estimatedCost: { min: 50, max: 300 },
    suggestedVendorType: 'HANDYMAN',
    suggestedTitle: 'Maintenance: ' + data.description.slice(0, 50),
    analysis: 'General maintenance issue. Standard service request.',
    recommendations: ['Document issue with photos', 'Note when issue first occurred', 'Check if issue affects multiple units'],
  };
}

async function notifyHandoffRequest(
  app: FastifyInstance,
  conversation: {
    id: string;
    contextType: string | null;
    user?: { email: string | null; firstName: string | null } | null;
    messages: { content: string; role: string }[];
  },
  reason?: string
): Promise<void> {
  try {
    const lastMessages = conversation.messages
      .slice(0, 5)
      .map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
      .join('\n');

    await app.emailService.send({
      templateId: 'system:support-handoff',
      to: process.env['SUPPORT_EMAIL'] || 'support@realriches.com',
      data: {
        conversationId: conversation.id,
        contextType: conversation.contextType || 'general_support',
        userName: conversation.user?.firstName || 'Guest',
        userEmail: conversation.user?.email || 'Unknown',
        reason: reason || 'User requested human assistance',
        recentMessages: lastMessages,
        timestamp: new Date().toISOString(),
      },
    });

    logger.info({ conversationId: conversation.id }, 'Handoff notification queued');
  } catch (error) {
    logger.error({ error, conversationId: conversation.id }, 'Failed to send handoff notification');
  }
}
