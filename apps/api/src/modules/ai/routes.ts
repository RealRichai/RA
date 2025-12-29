import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '@realriches/database';
import { generateId, NotFoundError } from '@realriches/utils';

// High-Fidelity Context Transfer System (HF-CTS) schemas
const CreateConversationSchema = z.object({
  contextType: z.enum([
    'LEASING_INQUIRY',
    'MAINTENANCE_REQUEST',
    'GENERAL_SUPPORT',
    'PROPERTY_TOUR',
    'APPLICATION_HELP',
  ]),
  entityType: z.enum(['LISTING', 'PROPERTY', 'UNIT', 'LEASE', 'WORK_ORDER']).optional(),
  entityId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const SendMessageSchema = z.object({
  content: z.string().min(1).max(10000),
  attachments: z.array(z.string()).optional(),
});

const MaintenanceTriageSchema = z.object({
  description: z.string().min(1),
  unitId: z.string(),
  images: z.array(z.string()).optional(),
  urgencyHint: z.enum(['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY']).optional(),
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
        await app.authenticate(request, reply, { optional: true });
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const data = CreateConversationSchema.parse(request.body);

      // Build initial context for HF-CTS
      const context = await buildContext(data);

      const conversation = await prisma.aIConversation.create({
        data: {
          id: generateId('conv'),
          userId: request.user?.id,
          contextType: data.contextType,
          entityType: data.entityType,
          entityId: data.entityId,
          context: context,
          status: 'ACTIVE',
        },
      });

      // Create system message with context
      await prisma.aIMessage.create({
        data: {
          id: generateId('msg'),
          conversationId: conversation.id,
          role: 'SYSTEM',
          content: generateSystemPrompt(data.contextType, context),
        },
      });

      return reply.status(201).send({
        success: true,
        data: {
          conversationId: conversation.id,
          contextType: conversation.contextType,
          welcomeMessage: getWelcomeMessage(data.contextType),
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
          id: generateId('msg'),
          conversationId: conversation.id,
          role: 'USER',
          content,
          attachments,
        },
      });

      // Generate AI response using HF-CTS
      const aiResponse = await generateAIResponse(conversation, content);

      // Store AI response
      const assistantMessage = await prisma.aIMessage.create({
        data: {
          id: generateId('msg'),
          conversationId: conversation.id,
          role: 'ASSISTANT',
          content: aiResponse.content,
          metadata: aiResponse.metadata,
        },
      });

      // Update conversation context with new information
      await updateConversationContext(conversation.id, content, aiResponse);

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
            where: { role: { not: 'SYSTEM' } },
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

      // Verify unit access
      const unit = await prisma.unit.findUnique({
        where: { id: data.unitId },
        include: { property: true },
      });

      if (!unit) {
        throw new NotFoundError('Unit not found');
      }

      // Perform AI triage
      const triageResult = await performMaintenanceTriage(data);

      // Store triage result
      const triage = await prisma.maintenanceTriage.create({
        data: {
          id: generateId('trg'),
          unitId: data.unitId,
          reportedById: request.user.id,
          description: data.description,
          images: data.images || [],
          category: triageResult.category,
          urgency: triageResult.urgency,
          estimatedCost: triageResult.estimatedCost,
          suggestedVendorType: triageResult.suggestedVendorType,
          aiAnalysis: triageResult.analysis,
        },
      });

      // Auto-create work order if urgent
      let workOrder = null;
      if (triageResult.urgency === 'EMERGENCY' || triageResult.urgency === 'HIGH') {
        workOrder = await prisma.workOrder.create({
          data: {
            id: generateId('wo'),
            unitId: data.unitId,
            reportedById: request.user.id,
            title: triageResult.suggestedTitle,
            description: data.description,
            category: triageResult.category,
            priority: triageResult.urgency,
            status: 'OPEN',
          },
        });
      }

      return reply.send({
        success: true,
        data: {
          triage,
          workOrder,
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
      });

      if (!conversation) {
        throw new NotFoundError('Conversation not found');
      }

      // Update conversation status
      await prisma.aIConversation.update({
        where: { id: conversation.id },
        data: {
          status: 'HANDOFF_REQUESTED',
          handoffReason: reason,
          handoffRequestedAt: new Date(),
        },
      });

      // Create handoff message
      await prisma.aIMessage.create({
        data: {
          id: generateId('msg'),
          conversationId: conversation.id,
          role: 'SYSTEM',
          content: `Handoff requested: ${reason || 'User requested human assistance'}`,
          metadata: { handoffReason: reason },
        },
      });

      // TODO: HUMAN_IMPLEMENTATION_REQUIRED - Notify support team of handoff request

      return reply.send({
        success: true,
        data: {
          message: 'A team member will be with you shortly.',
          estimatedWaitTime: '5-10 minutes',
        },
      });
    }
  );

  // Voice session (placeholder for Twilio/WebRTC integration)
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
      // TODO: HUMAN_IMPLEMENTATION_REQUIRED - Implement Twilio/WebRTC voice integration
      return reply.send({
        success: true,
        data: {
          sessionId: generateId('vcs'),
          message: 'Voice AI feature coming soon',
          status: 'NOT_IMPLEMENTED',
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
      case 'LISTING':
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

      case 'PROPERTY':
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

      case 'WORK_ORDER':
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
  contextType: string,
  context: Record<string, unknown>
): string {
  const basePrompt = `You are an AI assistant for RealRiches, an AI-powered real estate platform.
You help users with property management, leasing, and maintenance tasks.
Always be helpful, professional, and comply with fair housing laws.
Never discriminate based on protected classes.`;

  switch (contextType) {
    case 'LEASING_INQUIRY':
      return `${basePrompt}
You are helping with a leasing inquiry.
${context.listing ? `Property: ${JSON.stringify(context.listing)}` : ''}
Help the user learn about the property and schedule viewings.`;

    case 'MAINTENANCE_REQUEST':
      return `${basePrompt}
You are helping with a maintenance request.
${context.workOrder ? `Work Order: ${JSON.stringify(context.workOrder)}` : ''}
Help diagnose issues and escalate emergencies appropriately.`;

    case 'PROPERTY_TOUR':
      return `${basePrompt}
You are a virtual tour guide.
${context.property ? `Property: ${JSON.stringify(context.property)}` : ''}
Provide engaging information about the property and neighborhood.`;

    default:
      return basePrompt;
  }
}

function getWelcomeMessage(contextType: string): string {
  switch (contextType) {
    case 'LEASING_INQUIRY':
      return "Hi! I'm here to help you with your leasing inquiry. What would you like to know about this property?";
    case 'MAINTENANCE_REQUEST':
      return "Hi! I can help you report a maintenance issue. Please describe the problem you're experiencing.";
    case 'PROPERTY_TOUR':
      return "Welcome! I'll be your virtual guide today. What would you like to see first?";
    default:
      return "Hi! How can I assist you today?";
  }
}

async function generateAIResponse(
  conversation: { id: string; contextType: string; context: unknown; messages: { role: string; content: string }[] },
  userMessage: string
): Promise<{
  content: string;
  metadata?: Record<string, unknown>;
  suggestedActions?: string[];
}> {
  // TODO: HUMAN_IMPLEMENTATION_REQUIRED - Integrate with OpenAI/Anthropic API
  // This is a placeholder implementation

  const context = conversation.context as Record<string, unknown>;

  // Simple response logic for demo
  const lowerMessage = userMessage.toLowerCase();

  if (lowerMessage.includes('schedule') || lowerMessage.includes('tour') || lowerMessage.includes('viewing')) {
    return {
      content: "I'd be happy to help you schedule a viewing! What dates and times work best for you?",
      suggestedActions: ['Schedule for tomorrow', 'Schedule for this weekend', 'See available times'],
    };
  }

  if (lowerMessage.includes('price') || lowerMessage.includes('rent') || lowerMessage.includes('cost')) {
    const listing = context.listing as Record<string, unknown> | undefined;
    if (listing) {
      return {
        content: `The monthly rent for this unit is $${listing.rent}. Would you like to know about move-in costs?`,
        suggestedActions: ['Move-in costs', 'Application process', 'Schedule viewing'],
      };
    }
  }

  if (lowerMessage.includes('emergency') || lowerMessage.includes('urgent') || lowerMessage.includes('leak') || lowerMessage.includes('fire')) {
    return {
      content: "I understand this may be urgent. For emergencies like fire or gas leaks, please call 911 immediately. For urgent maintenance, I'll connect you with our emergency line. Would you like me to escalate this?",
      suggestedActions: ['Escalate to emergency', 'Not an emergency', 'Talk to a person'],
    };
  }

  return {
    content: "I'm here to help! Could you tell me more about what you're looking for?",
    suggestedActions: ['Property details', 'Schedule viewing', 'Talk to an agent'],
  };
}

async function updateConversationContext(
  conversationId: string,
  userMessage: string,
  aiResponse: { content: string; metadata?: Record<string, unknown> }
): Promise<void> {
  // TODO: HUMAN_IMPLEMENTATION_REQUIRED - Implement context extraction and update
  // Extract intents, entities, and preferences from conversation
}

async function performMaintenanceTriage(data: {
  description: string;
  unitId: string;
  images?: string[];
  urgencyHint?: string;
}): Promise<{
  category: string;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY';
  estimatedCost: { min: number; max: number };
  suggestedVendorType: string;
  suggestedTitle: string;
  analysis: string;
  recommendations: string[];
}> {
  // TODO: HUMAN_IMPLEMENTATION_REQUIRED - Integrate with AI model for image analysis
  // This is a placeholder implementation

  const desc = data.description.toLowerCase();

  // Simple keyword-based triage
  if (desc.includes('fire') || desc.includes('gas') || desc.includes('flood') || desc.includes('no heat')) {
    return {
      category: 'EMERGENCY',
      urgency: 'EMERGENCY',
      estimatedCost: { min: 500, max: 5000 },
      suggestedVendorType: 'EMERGENCY_SERVICES',
      suggestedTitle: 'Emergency: ' + data.description.slice(0, 50),
      analysis: 'This issue requires immediate attention due to safety concerns.',
      recommendations: [
        'Contact emergency services if immediate danger',
        'Evacuate if necessary',
        'Document damage with photos',
      ],
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
      recommendations: [
        'Turn off water supply if possible',
        'Place bucket under active leaks',
        'Take photos of affected areas',
      ],
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
      recommendations: [
        'Do not attempt DIY electrical repairs',
        'Avoid using affected outlets',
        'Check circuit breaker',
      ],
    };
  }

  // Default
  return {
    category: 'GENERAL',
    urgency: data.urgencyHint as 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY' || 'LOW',
    estimatedCost: { min: 50, max: 300 },
    suggestedVendorType: 'HANDYMAN',
    suggestedTitle: 'Maintenance: ' + data.description.slice(0, 50),
    analysis: 'General maintenance issue. Standard service request.',
    recommendations: [
      'Document issue with photos',
      'Note when issue first occurred',
      'Check if issue affects multiple units',
    ],
  };
}
