/**
 * Co-Purchase Group Routes
 *
 * API endpoints for co-purchase group workspaces.
 * NON-CUSTODIAL: All funds/escrow/investment routes are blocked.
 *
 * Feature gated by: CO_PURCHASE_GROUPS
 */

import { createHash, randomBytes } from 'crypto';

import {
  assertNonCustodial,
  CreateGroupSchema,
  UpdateGroupSchema,
  CreateInvitationSchema,
  RespondToInvitationSchema,
  CreateChecklistItemSchema,
  UpdateChecklistItemSchema,
  AcceptDisclaimerSchema,
  UpdateMemberRoleSchema,
  InitiateVerificationSchema,
  emitGroupEvidence,
  MockVerificationProvider,
  type BlockedActionType,
} from '@realriches/co-purchase';
import { FeatureFlag, isFeatureEnabled } from '@realriches/feature-flags';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

// =============================================================================
// Feature Flag Guard
// =============================================================================

async function checkFeatureFlag(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const enabled = isFeatureEnabled(FeatureFlag.CO_PURCHASE_GROUPS, {
    userId: request.user?.id,
  });

  if (!enabled) {
    reply.status(404).send({
      success: false,
      error: {
        code: 'FEATURE_DISABLED',
        message: 'Co-Purchase Groups feature is not available',
      },
    });
  }
}

// =============================================================================
// Blocked Action Handler
// =============================================================================

function handleBlockedAction(actionType: BlockedActionType): never {
  // BLOCKED_CUSTODIAL_STUB: See docs/handoff/CO_PURCHASE_GUARDRAILS.md
  assertNonCustodial(actionType);
}

// =============================================================================
// Routes
// =============================================================================

export async function coPurchaseRoutes(app: FastifyInstance): Promise<void> {
  const prisma = app.prisma;

  // ===========================================================================
  // GROUP CRUD
  // ===========================================================================

  /**
   * POST /co-purchase/groups - Create a new co-purchase group
   */
  app.post<{ Body: z.infer<typeof CreateGroupSchema> }>(
    '/co-purchase/groups',
    {
      schema: {
        description: 'Create a new co-purchase group',
        tags: ['Co-Purchase'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 100 },
            description: { type: 'string', maxLength: 1000 },
            targetPropertyType: { type: 'string' },
            targetMarket: { type: 'string' },
            estimatedBudgetMin: { type: 'integer', minimum: 1 },
            estimatedBudgetMax: { type: 'integer', minimum: 1 },
          },
          required: ['name'],
        },
      },
      preHandler: [
        async (request, reply) => app.authenticate(request, reply),
        checkFeatureFlag,
      ],
    },
    async (request, reply) => {
      const input = CreateGroupSchema.parse(request.body);
      const userId = request.user!.id;

      const group = await prisma.coPurchaseGroup.create({
        data: {
          name: input.name,
          description: input.description,
          targetPropertyType: input.targetPropertyType,
          targetMarket: input.targetMarket,
          estimatedBudgetMin: input.estimatedBudgetMin,
          estimatedBudgetMax: input.estimatedBudgetMax,
          organizerId: userId,
          metadata: input.metadata,
          members: {
            create: {
              userId,
              role: 'organizer',
              disclaimerAccepted: false,
            },
          },
        },
        include: {
          members: true,
        },
      });

      emitGroupEvidence({
        eventType: 'group.created',
        groupId: group.id,
        actorId: userId,
        outcome: 'success',
        details: { name: input.name },
      });

      return reply.status(201).send({ success: true, data: group });
    }
  );

  /**
   * GET /co-purchase/groups - List user's groups
   */
  app.get(
    '/co-purchase/groups',
    {
      schema: {
        description: "List user's co-purchase groups",
        tags: ['Co-Purchase'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: [
        async (request, reply) => app.authenticate(request, reply),
        checkFeatureFlag,
      ],
    },
    async (request, reply) => {
      const userId = request.user!.id;

      const groups = await prisma.coPurchaseGroup.findMany({
        where: {
          members: {
            some: {
              userId,
              leftAt: null,
            },
          },
        },
        include: {
          members: {
            where: { leftAt: null },
            select: {
              id: true,
              userId: true,
              role: true,
              verificationStatus: true,
            },
          },
          _count: {
            select: {
              checklistItems: true,
              documents: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return reply.send({ success: true, data: groups });
    }
  );

  /**
   * GET /co-purchase/groups/:groupId - Get group details
   */
  app.get<{ Params: { groupId: string } }>(
    '/co-purchase/groups/:groupId',
    {
      schema: {
        description: 'Get co-purchase group details',
        tags: ['Co-Purchase'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { groupId: { type: 'string', format: 'uuid' } },
          required: ['groupId'],
        },
      },
      preHandler: [
        async (request, reply) => app.authenticate(request, reply),
        checkFeatureFlag,
      ],
    },
    async (request, reply) => {
      const { groupId } = request.params;
      const userId = request.user!.id;

      const group = await prisma.coPurchaseGroup.findFirst({
        where: {
          id: groupId,
          members: {
            some: {
              userId,
              leftAt: null,
            },
          },
        },
        include: {
          members: {
            where: { leftAt: null },
          },
          checklistItems: {
            orderBy: { sortOrder: 'asc' },
          },
          documents: true,
          invitations: {
            where: { status: 'pending' },
          },
        },
      });

      if (!group) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Group not found' },
        });
      }

      return reply.send({ success: true, data: group });
    }
  );

  /**
   * PATCH /co-purchase/groups/:groupId - Update group
   */
  app.patch<{
    Params: { groupId: string };
    Body: z.infer<typeof UpdateGroupSchema>;
  }>(
    '/co-purchase/groups/:groupId',
    {
      schema: {
        description: 'Update co-purchase group',
        tags: ['Co-Purchase'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { groupId: { type: 'string', format: 'uuid' } },
          required: ['groupId'],
        },
      },
      preHandler: [
        async (request, reply) => app.authenticate(request, reply),
        checkFeatureFlag,
      ],
    },
    async (request, reply) => {
      const { groupId } = request.params;
      const userId = request.user!.id;
      const input = UpdateGroupSchema.parse(request.body);

      // Check user is organizer
      const membership = await prisma.coPurchaseGroupMember.findFirst({
        where: {
          groupId,
          userId,
          role: 'organizer',
          leftAt: null,
        },
      });

      if (!membership) {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Only organizers can update the group' },
        });
      }

      const group = await prisma.coPurchaseGroup.update({
        where: { id: groupId },
        data: input,
      });

      emitGroupEvidence({
        eventType: 'group.updated',
        groupId,
        actorId: userId,
        outcome: 'success',
        details: { updates: Object.keys(input) },
      });

      return reply.send({ success: true, data: group });
    }
  );

  // ===========================================================================
  // MEMBERS
  // ===========================================================================

  /**
   * GET /co-purchase/groups/:groupId/members - List members
   */
  app.get<{ Params: { groupId: string } }>(
    '/co-purchase/groups/:groupId/members',
    {
      schema: {
        description: 'List group members',
        tags: ['Co-Purchase'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { groupId: { type: 'string', format: 'uuid' } },
          required: ['groupId'],
        },
      },
      preHandler: [
        async (request, reply) => app.authenticate(request, reply),
        checkFeatureFlag,
      ],
    },
    async (request, reply) => {
      const { groupId } = request.params;
      const userId = request.user!.id;

      // Verify user is member
      const membership = await prisma.coPurchaseGroupMember.findFirst({
        where: { groupId, userId, leftAt: null },
      });

      if (!membership) {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Not a member of this group' },
        });
      }

      const members = await prisma.coPurchaseGroupMember.findMany({
        where: { groupId, leftAt: null },
        orderBy: { joinedAt: 'asc' },
      });

      return reply.send({ success: true, data: members });
    }
  );

  /**
   * POST /co-purchase/groups/:groupId/members/accept-disclaimer
   */
  app.post<{
    Params: { groupId: string };
    Body: z.infer<typeof AcceptDisclaimerSchema>;
  }>(
    '/co-purchase/groups/:groupId/members/accept-disclaimer',
    {
      schema: {
        description: 'Accept non-custodial disclaimer',
        tags: ['Co-Purchase'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { groupId: { type: 'string', format: 'uuid' } },
          required: ['groupId'],
        },
        body: {
          type: 'object',
          properties: { accepted: { type: 'boolean', const: true } },
          required: ['accepted'],
        },
      },
      preHandler: [
        async (request, reply) => app.authenticate(request, reply),
        checkFeatureFlag,
      ],
    },
    async (request, reply) => {
      const { groupId } = request.params;
      const userId = request.user!.id;
      AcceptDisclaimerSchema.parse(request.body);

      const member = await prisma.coPurchaseGroupMember.findFirst({
        where: { groupId, userId, leftAt: null },
      });

      if (!member) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Membership not found' },
        });
      }

      const updated = await prisma.coPurchaseGroupMember.update({
        where: { id: member.id },
        data: {
          disclaimerAccepted: true,
          disclaimerAcceptedAt: new Date(),
        },
      });

      emitGroupEvidence({
        eventType: 'member.disclaimer_accepted',
        groupId,
        actorId: userId,
        outcome: 'success',
        details: { memberId: member.id },
      });

      return reply.send({ success: true, data: updated });
    }
  );

  /**
   * PATCH /co-purchase/groups/:groupId/members/:memberId/role
   */
  app.patch<{
    Params: { groupId: string; memberId: string };
    Body: z.infer<typeof UpdateMemberRoleSchema>;
  }>(
    '/co-purchase/groups/:groupId/members/:memberId/role',
    {
      schema: {
        description: 'Update member role',
        tags: ['Co-Purchase'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: {
            groupId: { type: 'string', format: 'uuid' },
            memberId: { type: 'string', format: 'uuid' },
          },
          required: ['groupId', 'memberId'],
        },
      },
      preHandler: [
        async (request, reply) => app.authenticate(request, reply),
        checkFeatureFlag,
      ],
    },
    async (request, reply) => {
      const { groupId, memberId } = request.params;
      const userId = request.user!.id;
      const input = UpdateMemberRoleSchema.parse(request.body);

      // Check user is organizer
      const organizer = await prisma.coPurchaseGroupMember.findFirst({
        where: { groupId, userId, role: 'organizer', leftAt: null },
      });

      if (!organizer) {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Only organizers can change roles' },
        });
      }

      const member = await prisma.coPurchaseGroupMember.update({
        where: { id: memberId },
        data: { role: input.role },
      });

      emitGroupEvidence({
        eventType: 'member.role_changed',
        groupId,
        actorId: userId,
        outcome: 'success',
        details: { memberId, newRole: input.role },
      });

      return reply.send({ success: true, data: member });
    }
  );

  /**
   * DELETE /co-purchase/groups/:groupId/members/:memberId - Remove member
   */
  app.delete<{ Params: { groupId: string; memberId: string } }>(
    '/co-purchase/groups/:groupId/members/:memberId',
    {
      schema: {
        description: 'Remove member from group',
        tags: ['Co-Purchase'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: {
            groupId: { type: 'string', format: 'uuid' },
            memberId: { type: 'string', format: 'uuid' },
          },
          required: ['groupId', 'memberId'],
        },
      },
      preHandler: [
        async (request, reply) => app.authenticate(request, reply),
        checkFeatureFlag,
      ],
    },
    async (request, reply) => {
      const { groupId, memberId } = request.params;
      const userId = request.user!.id;

      const targetMember = await prisma.coPurchaseGroupMember.findUnique({
        where: { id: memberId },
      });

      if (!targetMember || targetMember.groupId !== groupId) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Member not found' },
        });
      }

      // User can remove themselves, or organizer can remove others
      const isOrganizer = await prisma.coPurchaseGroupMember.findFirst({
        where: { groupId, userId, role: 'organizer', leftAt: null },
      });

      const isSelf = targetMember.userId === userId;

      if (!isSelf && !isOrganizer) {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Not authorized to remove this member' },
        });
      }

      await prisma.coPurchaseGroupMember.update({
        where: { id: memberId },
        data: { leftAt: new Date() },
      });

      emitGroupEvidence({
        eventType: 'member.left',
        groupId,
        actorId: userId,
        outcome: 'success',
        details: { memberId, removedBy: isSelf ? 'self' : 'organizer' },
      });

      return reply.send({ success: true });
    }
  );

  // ===========================================================================
  // INVITATIONS
  // ===========================================================================

  /**
   * POST /co-purchase/groups/:groupId/invitations - Send invitation
   */
  app.post<{
    Params: { groupId: string };
    Body: z.infer<typeof CreateInvitationSchema>;
  }>(
    '/co-purchase/groups/:groupId/invitations',
    {
      schema: {
        description: 'Send invitation to join group',
        tags: ['Co-Purchase'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { groupId: { type: 'string', format: 'uuid' } },
          required: ['groupId'],
        },
        body: {
          type: 'object',
          properties: {
            email: { type: 'string', format: 'email' },
            role: { type: 'string', enum: ['organizer', 'member', 'viewer'] },
            message: { type: 'string', maxLength: 500 },
          },
          required: ['email'],
        },
      },
      preHandler: [
        async (request, reply) => app.authenticate(request, reply),
        checkFeatureFlag,
      ],
    },
    async (request, reply) => {
      const { groupId } = request.params;
      const userId = request.user!.id;
      const input = CreateInvitationSchema.parse(request.body);

      // Check user can invite (organizer or member with invite permission)
      const membership = await prisma.coPurchaseGroupMember.findFirst({
        where: {
          groupId,
          userId,
          role: { in: ['organizer', 'member'] },
          leftAt: null,
        },
      });

      if (!membership) {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Not authorized to invite' },
        });
      }

      // Generate secure token
      const token = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(token).digest('hex');

      const invitation = await prisma.coPurchaseGroupInvitation.create({
        data: {
          groupId,
          invitedEmail: input.email,
          invitedByUserId: userId,
          role: input.role ?? 'member',
          message: input.message,
          tokenHash,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      });

      emitGroupEvidence({
        eventType: 'invitation.sent',
        groupId,
        actorId: userId,
        outcome: 'success',
        details: { invitationId: invitation.id },
      });

      // Return token only once (not stored in plain text)
      return reply.status(201).send({
        success: true,
        data: {
          ...invitation,
          token, // Include token in response for sharing
        },
      });
    }
  );

  /**
   * POST /co-purchase/invitations/:token/accept - Accept invitation
   */
  app.post<{
    Params: { token: string };
    Body: z.infer<typeof RespondToInvitationSchema>;
  }>(
    '/co-purchase/invitations/:token/accept',
    {
      schema: {
        description: 'Accept or decline invitation',
        tags: ['Co-Purchase'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { token: { type: 'string' } },
          required: ['token'],
        },
        body: {
          type: 'object',
          properties: { accept: { type: 'boolean' } },
          required: ['accept'],
        },
      },
      preHandler: [
        async (request, reply) => app.authenticate(request, reply),
        checkFeatureFlag,
      ],
    },
    async (request, reply) => {
      const { token } = request.params;
      const userId = request.user!.id;
      const { accept } = RespondToInvitationSchema.parse(request.body);

      const tokenHash = createHash('sha256').update(token).digest('hex');

      const invitation = await prisma.coPurchaseGroupInvitation.findUnique({
        where: { tokenHash },
        include: { group: true },
      });

      if (!invitation) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Invitation not found' },
        });
      }

      if (invitation.status !== 'pending') {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_STATE', message: 'Invitation already responded' },
        });
      }

      if (invitation.expiresAt < new Date()) {
        await prisma.coPurchaseGroupInvitation.update({
          where: { id: invitation.id },
          data: { status: 'expired' },
        });
        return reply.status(400).send({
          success: false,
          error: { code: 'EXPIRED', message: 'Invitation has expired' },
        });
      }

      if (accept) {
        // Accept - add user to group
        await prisma.$transaction([
          prisma.coPurchaseGroupInvitation.update({
            where: { id: invitation.id },
            data: { status: 'accepted', respondedAt: new Date() },
          }),
          prisma.coPurchaseGroupMember.create({
            data: {
              groupId: invitation.groupId,
              userId,
              role: invitation.role,
              disclaimerAccepted: false,
            },
          }),
        ]);

        emitGroupEvidence({
          eventType: 'invitation.accepted',
          groupId: invitation.groupId,
          actorId: userId,
          outcome: 'success',
          details: { invitationId: invitation.id },
        });

        emitGroupEvidence({
          eventType: 'member.joined',
          groupId: invitation.groupId,
          actorId: userId,
          outcome: 'success',
          details: { role: invitation.role },
        });
      } else {
        // Decline
        await prisma.coPurchaseGroupInvitation.update({
          where: { id: invitation.id },
          data: { status: 'declined', respondedAt: new Date() },
        });

        emitGroupEvidence({
          eventType: 'invitation.declined',
          groupId: invitation.groupId,
          actorId: userId,
          outcome: 'success',
          details: { invitationId: invitation.id },
        });
      }

      return reply.send({ success: true, accepted: accept });
    }
  );

  // ===========================================================================
  // CHECKLIST
  // ===========================================================================

  /**
   * GET /co-purchase/groups/:groupId/checklist - Get checklist
   */
  app.get<{ Params: { groupId: string } }>(
    '/co-purchase/groups/:groupId/checklist',
    {
      schema: {
        description: 'Get group checklist',
        tags: ['Co-Purchase'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { groupId: { type: 'string', format: 'uuid' } },
          required: ['groupId'],
        },
      },
      preHandler: [
        async (request, reply) => app.authenticate(request, reply),
        checkFeatureFlag,
      ],
    },
    async (request, reply) => {
      const { groupId } = request.params;
      const userId = request.user!.id;

      // Verify membership
      const membership = await prisma.coPurchaseGroupMember.findFirst({
        where: { groupId, userId, leftAt: null },
      });

      if (!membership) {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Not a member' },
        });
      }

      const items = await prisma.coPurchaseChecklistItem.findMany({
        where: { groupId },
        orderBy: { sortOrder: 'asc' },
        include: {
          assignedMember: {
            select: { id: true, userId: true },
          },
        },
      });

      return reply.send({ success: true, data: items });
    }
  );

  /**
   * POST /co-purchase/groups/:groupId/checklist - Add checklist item
   */
  app.post<{
    Params: { groupId: string };
    Body: z.infer<typeof CreateChecklistItemSchema>;
  }>(
    '/co-purchase/groups/:groupId/checklist',
    {
      schema: {
        description: 'Add checklist item',
        tags: ['Co-Purchase'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { groupId: { type: 'string', format: 'uuid' } },
          required: ['groupId'],
        },
        body: {
          type: 'object',
          properties: {
            title: { type: 'string', minLength: 1, maxLength: 200 },
            description: { type: 'string', maxLength: 1000 },
            category: { type: 'string', maxLength: 50 },
            assignedMemberId: { type: 'string', format: 'uuid' },
            dueDate: { type: 'string', format: 'date-time' },
            sortOrder: { type: 'integer' },
          },
          required: ['title'],
        },
      },
      preHandler: [
        async (request, reply) => app.authenticate(request, reply),
        checkFeatureFlag,
      ],
    },
    async (request, reply) => {
      const { groupId } = request.params;
      const userId = request.user!.id;
      const input = CreateChecklistItemSchema.parse(request.body);

      // Verify membership
      const membership = await prisma.coPurchaseGroupMember.findFirst({
        where: { groupId, userId, leftAt: null },
      });

      if (!membership) {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Not a member' },
        });
      }

      // Get max sort order
      const maxOrder = await prisma.coPurchaseChecklistItem.aggregate({
        where: { groupId },
        _max: { sortOrder: true },
      });

      const item = await prisma.coPurchaseChecklistItem.create({
        data: {
          groupId,
          title: input.title,
          description: input.description,
          category: input.category ?? 'general',
          assignedMemberId: input.assignedMemberId,
          dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
          sortOrder: input.sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 1,
        },
      });

      emitGroupEvidence({
        eventType: 'checklist.item_added',
        groupId,
        actorId: userId,
        outcome: 'success',
        details: { itemId: item.id, title: input.title },
      });

      return reply.status(201).send({ success: true, data: item });
    }
  );

  /**
   * PATCH /co-purchase/groups/:groupId/checklist/:itemId - Update item
   */
  app.patch<{
    Params: { groupId: string; itemId: string };
    Body: z.infer<typeof UpdateChecklistItemSchema>;
  }>(
    '/co-purchase/groups/:groupId/checklist/:itemId',
    {
      schema: {
        description: 'Update checklist item',
        tags: ['Co-Purchase'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: {
            groupId: { type: 'string', format: 'uuid' },
            itemId: { type: 'string', format: 'uuid' },
          },
          required: ['groupId', 'itemId'],
        },
      },
      preHandler: [
        async (request, reply) => app.authenticate(request, reply),
        checkFeatureFlag,
      ],
    },
    async (request, reply) => {
      const { groupId, itemId } = request.params;
      const userId = request.user!.id;
      const input = UpdateChecklistItemSchema.parse(request.body);

      // Verify membership
      const membership = await prisma.coPurchaseGroupMember.findFirst({
        where: { groupId, userId, leftAt: null },
      });

      if (!membership) {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Not a member' },
        });
      }

      const existingItem = await prisma.coPurchaseChecklistItem.findFirst({
        where: { id: itemId, groupId },
      });

      if (!existingItem) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Item not found' },
        });
      }

      // Track completion
      const wasCompleted = existingItem.status === 'completed';
      const isCompleting = input.status === 'completed' && !wasCompleted;

      const item = await prisma.coPurchaseChecklistItem.update({
        where: { id: itemId },
        data: {
          ...input,
          dueDate: input.dueDate === null ? null : input.dueDate ? new Date(input.dueDate) : undefined,
          assignedMemberId: input.assignedMemberId === null ? null : input.assignedMemberId,
          completedAt: isCompleting ? new Date() : existingItem.completedAt,
          completedByUserId: isCompleting ? userId : existingItem.completedByUserId,
        },
      });

      const eventType = isCompleting ? 'checklist.item_completed' : 'checklist.item_updated';
      emitGroupEvidence({
        eventType,
        groupId,
        actorId: userId,
        outcome: 'success',
        details: { itemId, updates: Object.keys(input) },
      });

      return reply.send({ success: true, data: item });
    }
  );

  /**
   * DELETE /co-purchase/groups/:groupId/checklist/:itemId - Delete item
   */
  app.delete<{ Params: { groupId: string; itemId: string } }>(
    '/co-purchase/groups/:groupId/checklist/:itemId',
    {
      schema: {
        description: 'Delete checklist item',
        tags: ['Co-Purchase'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: {
            groupId: { type: 'string', format: 'uuid' },
            itemId: { type: 'string', format: 'uuid' },
          },
          required: ['groupId', 'itemId'],
        },
      },
      preHandler: [
        async (request, reply) => app.authenticate(request, reply),
        checkFeatureFlag,
      ],
    },
    async (request, reply) => {
      const { groupId, itemId } = request.params;
      const userId = request.user!.id;

      // Verify organizer or member
      const membership = await prisma.coPurchaseGroupMember.findFirst({
        where: { groupId, userId, leftAt: null },
      });

      if (!membership) {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Not a member' },
        });
      }

      await prisma.coPurchaseChecklistItem.delete({
        where: { id: itemId },
      });

      emitGroupEvidence({
        eventType: 'checklist.item_deleted',
        groupId,
        actorId: userId,
        outcome: 'success',
        details: { itemId },
      });

      return reply.send({ success: true });
    }
  );

  // ===========================================================================
  // VERIFICATION
  // ===========================================================================

  /**
   * POST /co-purchase/groups/:groupId/verification/initiate
   */
  app.post<{
    Params: { groupId: string };
    Body: z.infer<typeof InitiateVerificationSchema>;
  }>(
    '/co-purchase/groups/:groupId/verification/initiate',
    {
      schema: {
        description: 'Initiate identity verification',
        tags: ['Co-Purchase'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { groupId: { type: 'string', format: 'uuid' } },
          required: ['groupId'],
        },
      },
      preHandler: [
        async (request, reply) => app.authenticate(request, reply),
        checkFeatureFlag,
      ],
    },
    async (request, reply) => {
      const { groupId } = request.params;
      const userId = request.user!.id;
      const input = InitiateVerificationSchema.parse(request.body);

      // Get membership
      const membership = await prisma.coPurchaseGroupMember.findFirst({
        where: { groupId, userId, leftAt: null },
      });

      if (!membership) {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Not a member' },
        });
      }

      // Get user details for verification (would come from user profile)
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, firstName: true, lastName: true },
      });

      if (!user) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'User not found' },
        });
      }

      // Use mock provider for now
      const provider = new MockVerificationProvider({ enabled: true });
      const result = await provider.initiateVerification({
        userId,
        groupId,
        memberId: membership.id,
        level: input.level ?? 'standard',
        firstName: user.firstName ?? '',
        lastName: user.lastName ?? '',
        email: user.email,
        callbackUrl: input.callbackUrl,
      });

      if (!result.ok) {
        return reply.status(500).send({
          success: false,
          error: { code: 'VERIFICATION_FAILED', message: result.error.message },
        });
      }

      // Update member with verification info
      await prisma.coPurchaseGroupMember.update({
        where: { id: membership.id },
        data: {
          verificationStatus: result.value.result.status === 'verified' ? 'verified' : 'pending',
          verificationId: result.value.result.verificationId,
          verificationHash: result.value.result.resultHash,
          verifiedAt: result.value.result.verifiedAt,
          verificationExpiry: result.value.result.expiresAt,
        },
      });

      emitGroupEvidence({
        eventType: 'verification.initiated',
        groupId,
        actorId: userId,
        outcome: 'success',
        details: {
          verificationId: result.value.result.verificationId,
          level: input.level ?? 'standard',
        },
      });

      // Get verification URL if available
      const urlResult = await provider.getVerificationUrl(result.value.result.verificationId);

      return reply.send({
        success: true,
        data: {
          verificationId: result.value.result.verificationId,
          status: result.value.result.status,
          verificationUrl: urlResult.ok ? urlResult.value : undefined,
        },
      });
    }
  );

  /**
   * GET /co-purchase/groups/:groupId/verification/status
   */
  app.get<{ Params: { groupId: string } }>(
    '/co-purchase/groups/:groupId/verification/status',
    {
      schema: {
        description: 'Get verification status for current user',
        tags: ['Co-Purchase'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { groupId: { type: 'string', format: 'uuid' } },
          required: ['groupId'],
        },
      },
      preHandler: [
        async (request, reply) => app.authenticate(request, reply),
        checkFeatureFlag,
      ],
    },
    async (request, reply) => {
      const { groupId } = request.params;
      const userId = request.user!.id;

      const membership = await prisma.coPurchaseGroupMember.findFirst({
        where: { groupId, userId, leftAt: null },
        select: {
          id: true,
          verificationStatus: true,
          verificationId: true,
          verifiedAt: true,
          verificationExpiry: true,
        },
      });

      if (!membership) {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Not a member' },
        });
      }

      return reply.send({
        success: true,
        data: {
          status: membership.verificationStatus,
          verificationId: membership.verificationId,
          verifiedAt: membership.verifiedAt,
          expiresAt: membership.verificationExpiry,
        },
      });
    }
  );

  // ===========================================================================
  // BLOCKED ROUTES (Custodial - Non-Custodial Platform)
  // ===========================================================================

  /**
   * ALL /co-purchase/groups/:groupId/escrow/* - BLOCKED
   */
  app.all(
    '/co-purchase/groups/:groupId/escrow/*',
    {
      schema: {
        description: 'BLOCKED: Escrow services not available',
        tags: ['Co-Purchase'],
      },
      preHandler: [
        async (request, reply) => app.authenticate(request, reply),
        checkFeatureFlag,
      ],
    },
    async (request, reply) => {
      const { groupId } = request.params as { groupId: string };
      const userId = request.user?.id ?? 'unknown';

      emitGroupEvidence({
        eventType: 'blocked_action.attempted',
        groupId,
        actorId: userId,
        outcome: 'blocked',
        details: { actionType: 'ESCROW_CREATION', path: request.url },
      });

      handleBlockedAction('ESCROW_CREATION');
    }
  );

  /**
   * ALL /co-purchase/groups/:groupId/funds/* - BLOCKED
   */
  app.all(
    '/co-purchase/groups/:groupId/funds/*',
    {
      schema: {
        description: 'BLOCKED: Funds handling not available',
        tags: ['Co-Purchase'],
      },
      preHandler: [
        async (request, reply) => app.authenticate(request, reply),
        checkFeatureFlag,
      ],
    },
    async (request, reply) => {
      const { groupId } = request.params as { groupId: string };
      const userId = request.user?.id ?? 'unknown';

      emitGroupEvidence({
        eventType: 'blocked_action.attempted',
        groupId,
        actorId: userId,
        outcome: 'blocked',
        details: { actionType: 'FUNDS_HANDLING', path: request.url },
      });

      handleBlockedAction('FUNDS_HANDLING');
    }
  );

  /**
   * ALL /co-purchase/groups/:groupId/investment/* - BLOCKED
   */
  app.all(
    '/co-purchase/groups/:groupId/investment/*',
    {
      schema: {
        description: 'BLOCKED: Investment marketplace not available',
        tags: ['Co-Purchase'],
      },
      preHandler: [
        async (request, reply) => app.authenticate(request, reply),
        checkFeatureFlag,
      ],
    },
    async (request, reply) => {
      const { groupId } = request.params as { groupId: string };
      const userId = request.user?.id ?? 'unknown';

      emitGroupEvidence({
        eventType: 'blocked_action.attempted',
        groupId,
        actorId: userId,
        outcome: 'blocked',
        details: { actionType: 'INVESTMENT_MARKETPLACE', path: request.url },
      });

      handleBlockedAction('INVESTMENT_MARKETPLACE');
    }
  );

  /**
   * ALL /co-purchase/groups/:groupId/payment/* - BLOCKED
   */
  app.all(
    '/co-purchase/groups/:groupId/payment/*',
    {
      schema: {
        description: 'BLOCKED: Payment processing not available',
        tags: ['Co-Purchase'],
      },
      preHandler: [
        async (request, reply) => app.authenticate(request, reply),
        checkFeatureFlag,
      ],
    },
    async (request, reply) => {
      const { groupId } = request.params as { groupId: string };
      const userId = request.user?.id ?? 'unknown';

      emitGroupEvidence({
        eventType: 'blocked_action.attempted',
        groupId,
        actorId: userId,
        outcome: 'blocked',
        details: { actionType: 'PAYMENT_PROCESSING', path: request.url },
      });

      handleBlockedAction('PAYMENT_PROCESSING');
    }
  );

  /**
   * ALL /co-purchase/groups/:groupId/purchase/* - BLOCKED
   */
  app.all(
    '/co-purchase/groups/:groupId/purchase/*',
    {
      schema: {
        description: 'BLOCKED: Property purchase execution not available',
        tags: ['Co-Purchase'],
      },
      preHandler: [
        async (request, reply) => app.authenticate(request, reply),
        checkFeatureFlag,
      ],
    },
    async (request, reply) => {
      const { groupId } = request.params as { groupId: string };
      const userId = request.user?.id ?? 'unknown';

      emitGroupEvidence({
        eventType: 'blocked_action.attempted',
        groupId,
        actorId: userId,
        outcome: 'blocked',
        details: { actionType: 'PROPERTY_PURCHASE', path: request.url },
      });

      handleBlockedAction('PROPERTY_PURCHASE');
    }
  );
}

export default coPurchaseRoutes;
