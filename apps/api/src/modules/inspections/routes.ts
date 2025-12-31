import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  prisma,
  Prisma,
  type InspectionType as PrismaInspectionType,
  type InspectionStatus as PrismaInspectionStatus,
  type ItemCondition as PrismaItemCondition,
  type RoomType as PrismaRoomType,
} from '@realriches/database';

// Types
export type InspectionType = 'move_in' | 'move_out' | 'routine' | 'pre_listing' | 'annual' | 'complaint';
export type InspectionStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'rescheduled';
export type ItemCondition = 'excellent' | 'good' | 'fair' | 'poor' | 'damaged' | 'missing';
export type RoomType = 'living_room' | 'bedroom' | 'bathroom' | 'kitchen' | 'dining_room' | 'garage' | 'basement' | 'attic' | 'exterior' | 'yard' | 'other';

export interface InspectionSummary {
  totalRooms: number;
  totalItems: number;
  conditionBreakdown: Record<ItemCondition, number>;
  itemsRequiringRepair: number;
  estimatedTotalRepairCost: number;
  overallCondition: ItemCondition;
  recommendations: string[];
}

export interface ConditionReport {
  inspectionId: string;
  propertyAddress: string;
  unitNumber: string | null;
  inspectionDate: Date;
  type: InspectionType;
  rooms: Array<{
    name: string;
    condition: ItemCondition;
    items: Array<{
      name: string;
      condition: ItemCondition;
      notes: string | null;
      photos: string[];
    }>;
  }>;
  summary: InspectionSummary;
  signatures: {
    inspector: string | null;
    tenant: string | null;
  };
  generatedAt: Date;
}

// Helper: convert Decimal to number
function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value) || 0;
}

// Schemas
const scheduleInspectionSchema = z.object({
  propertyId: z.string().uuid(),
  unitId: z.string().uuid().optional(),
  leaseId: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
  type: z.enum(['move_in', 'move_out', 'routine', 'pre_listing', 'annual', 'complaint']),
  scheduledDate: z.string().datetime(),
  inspectorId: z.string().uuid(),
  inspectorName: z.string().min(1),
  notes: z.string().optional(),
  templateId: z.string().uuid().optional(),
});

const updateInspectionSchema = z.object({
  scheduledDate: z.string().datetime().optional(),
  inspectorId: z.string().uuid().optional(),
  inspectorName: z.string().min(1).optional(),
  notes: z.string().optional(),
  status: z.enum(['scheduled', 'in_progress', 'cancelled', 'rescheduled']).optional(),
});

const addRoomSchema = z.object({
  roomType: z.enum(['living_room', 'bedroom', 'bathroom', 'kitchen', 'dining_room', 'garage', 'basement', 'attic', 'exterior', 'yard', 'other']),
  roomName: z.string().min(1),
  notes: z.string().optional(),
});

const addItemSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  condition: z.enum(['excellent', 'good', 'fair', 'poor', 'damaged', 'missing']),
  notes: z.string().optional(),
  requiresRepair: z.boolean().default(false),
  estimatedRepairCost: z.number().nonnegative().optional(),
});

const addPhotoSchema = z.object({
  url: z.string().url(),
  thumbnailUrl: z.string().url().optional(),
  caption: z.string().optional(),
  itemId: z.string().uuid().optional(),
});

const completeInspectionSchema = z.object({
  tenantPresent: z.boolean(),
  tenantSignature: z.string().optional(),
  inspectorSignature: z.string(),
  notes: z.string().optional(),
});

const createTemplateSchema = z.object({
  name: z.string().min(1),
  propertyType: z.string().min(1),
  rooms: z.array(z.object({
    roomType: z.enum(['living_room', 'bedroom', 'bathroom', 'kitchen', 'dining_room', 'garage', 'basement', 'attic', 'exterior', 'yard', 'other']),
    roomName: z.string().min(1),
    items: z.array(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
    })),
  })),
  isDefault: z.boolean().default(false),
});

// Helper functions
function calculateOverallCondition(items: Array<{ condition: ItemCondition }>): ItemCondition {
  if (items.length === 0) return 'good';

  const conditionScores: Record<ItemCondition, number> = {
    excellent: 5,
    good: 4,
    fair: 3,
    poor: 2,
    damaged: 1,
    missing: 0,
  };

  const totalScore = items.reduce((sum, item) => sum + conditionScores[item.condition], 0);
  const avgScore = totalScore / items.length;

  if (avgScore >= 4.5) return 'excellent';
  if (avgScore >= 3.5) return 'good';
  if (avgScore >= 2.5) return 'fair';
  if (avgScore >= 1.5) return 'poor';
  return 'damaged';
}

function generateSummary(rooms: Array<{
  items: Array<{
    condition: ItemCondition;
    requiresRepair: boolean;
    estimatedRepairCost: number | null;
  }>;
}>): InspectionSummary {
  const allItems = rooms.flatMap((r) => r.items);

  const conditionBreakdown: Record<ItemCondition, number> = {
    excellent: 0,
    good: 0,
    fair: 0,
    poor: 0,
    damaged: 0,
    missing: 0,
  };

  for (const item of allItems) {
    conditionBreakdown[item.condition]++;
  }

  const itemsRequiringRepair = allItems.filter((i) => i.requiresRepair).length;
  const estimatedTotalRepairCost = allItems
    .filter((i) => i.requiresRepair && i.estimatedRepairCost)
    .reduce((sum, i) => sum + (i.estimatedRepairCost || 0), 0);

  const recommendations: string[] = [];
  if (conditionBreakdown.damaged > 0) {
    recommendations.push(`${conditionBreakdown.damaged} item(s) require immediate attention due to damage`);
  }
  if (conditionBreakdown.missing > 0) {
    recommendations.push(`${conditionBreakdown.missing} item(s) are missing and need replacement`);
  }
  if (itemsRequiringRepair > 0) {
    recommendations.push(`${itemsRequiringRepair} item(s) require repair, estimated cost: $${estimatedTotalRepairCost}`);
  }
  if (conditionBreakdown.poor > 3) {
    recommendations.push('Consider scheduling routine maintenance to address multiple items in poor condition');
  }

  return {
    totalRooms: rooms.length,
    totalItems: allItems.length,
    conditionBreakdown,
    itemsRequiringRepair,
    estimatedTotalRepairCost,
    overallCondition: calculateOverallCondition(allItems),
    recommendations,
  };
}

// Route handlers
export async function inspectionRoutes(app: FastifyInstance): Promise<void> {
  // Schedule new inspection
  app.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = scheduleInspectionSchema.parse(request.body);

    // Get template if provided
    let templateRooms: Array<{
      roomType: RoomType;
      roomName: string;
      items: Array<{ name: string; description: string | null }>;
    }> = [];

    if (body.templateId) {
      const template = await prisma.inspectionTemplate.findUnique({
        where: { id: body.templateId },
      });
      if (template) {
        templateRooms = template.rooms as typeof templateRooms;
      }
    }

    const inspection = await prisma.inspection.create({
      data: {
        propertyId: body.propertyId,
        unitId: body.unitId || null,
        leaseId: body.leaseId || null,
        tenantId: body.tenantId || null,
        type: body.type,
        status: 'scheduled',
        scheduledDate: new Date(body.scheduledDate),
        inspectorId: body.inspectorId,
        findings: body.notes || null,
        checklist: [],
        photos: [],
      },
    });

    // Create rooms from template
    for (const templateRoom of templateRooms) {
      const room = await prisma.inspectionRoom.create({
        data: {
          inspectionId: inspection.id,
          roomType: templateRoom.roomType as PrismaRoomType,
          roomName: templateRoom.roomName,
        },
      });

      // Create items in the room
      for (const templateItem of templateRoom.items) {
        await prisma.inspectionItem.create({
          data: {
            roomId: room.id,
            name: templateItem.name,
            description: templateItem.description,
            condition: 'good' as PrismaItemCondition,
            requiresRepair: false,
          },
        });
      }
    }

    // Fetch with rooms and items
    const fullInspection = await prisma.inspection.findUnique({
      where: { id: inspection.id },
    });

    const rooms = await prisma.inspectionRoom.findMany({
      where: { inspectionId: inspection.id },
      include: {
        items: true,
        photos: true,
      },
    });

    return reply.status(201).send({
      success: true,
      data: {
        ...fullInspection,
        rooms: rooms.map((r) => ({
          ...r,
          items: r.items.map((i) => ({
            ...i,
            estimatedRepairCost: i.estimatedRepairCost ? toNumber(i.estimatedRepairCost) : null,
          })),
        })),
      },
    });
  });

  // Get inspection by ID
  app.get('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const inspection = await prisma.inspection.findUnique({
      where: { id },
    });

    if (!inspection) {
      return reply.status(404).send({
        success: false,
        error: 'Inspection not found',
      });
    }

    const rooms = await prisma.inspectionRoom.findMany({
      where: { inspectionId: id },
      include: {
        items: true,
        photos: true,
      },
    });

    return reply.send({
      success: true,
      data: {
        ...inspection,
        rooms: rooms.map((r) => ({
          ...r,
          items: r.items.map((i) => ({
            ...i,
            estimatedRepairCost: i.estimatedRepairCost ? toNumber(i.estimatedRepairCost) : null,
          })),
        })),
      },
    });
  });

  // List inspections
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      propertyId?: string;
      unitId?: string;
      tenantId?: string;
      type?: InspectionType;
      status?: InspectionStatus;
      fromDate?: string;
      toDate?: string;
    };

    const where: Record<string, unknown> = {};

    if (query.propertyId) where.propertyId = query.propertyId;
    if (query.unitId) where.unitId = query.unitId;
    if (query.tenantId) where.tenantId = query.tenantId;
    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;

    if (query.fromDate || query.toDate) {
      where.scheduledDate = {};
      if (query.fromDate) (where.scheduledDate as Record<string, Date>).gte = new Date(query.fromDate);
      if (query.toDate) (where.scheduledDate as Record<string, Date>).lte = new Date(query.toDate);
    }

    const results = await prisma.inspection.findMany({
      where,
      orderBy: { scheduledDate: 'desc' },
    });

    return reply.send({
      success: true,
      data: results,
      total: results.length,
    });
  });

  // Update inspection
  app.patch('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = updateInspectionSchema.parse(request.body);

    const inspection = await prisma.inspection.findUnique({
      where: { id },
    });

    if (!inspection) {
      return reply.status(404).send({
        success: false,
        error: 'Inspection not found',
      });
    }

    if (inspection.status === 'completed') {
      return reply.status(400).send({
        success: false,
        error: 'Cannot update completed inspection',
      });
    }

    const updated = await prisma.inspection.update({
      where: { id },
      data: {
        scheduledDate: body.scheduledDate ? new Date(body.scheduledDate) : undefined,
        inspectorId: body.inspectorId,
        findings: body.notes,
        status: body.status,
      },
    });

    return reply.send({
      success: true,
      data: updated,
    });
  });

  // Start inspection
  app.post('/:id/start', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const inspection = await prisma.inspection.findUnique({
      where: { id },
    });

    if (!inspection) {
      return reply.status(404).send({
        success: false,
        error: 'Inspection not found',
      });
    }

    if (inspection.status !== 'scheduled' && inspection.status !== 'rescheduled') {
      return reply.status(400).send({
        success: false,
        error: 'Inspection cannot be started',
      });
    }

    const updated = await prisma.inspection.update({
      where: { id },
      data: { status: 'in_progress' },
    });

    return reply.send({
      success: true,
      data: updated,
    });
  });

  // Add room to inspection
  app.post('/:id/rooms', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = addRoomSchema.parse(request.body);

    const inspection = await prisma.inspection.findUnique({
      where: { id },
    });

    if (!inspection) {
      return reply.status(404).send({
        success: false,
        error: 'Inspection not found',
      });
    }

    const room = await prisma.inspectionRoom.create({
      data: {
        inspectionId: id,
        roomType: body.roomType as PrismaRoomType,
        roomName: body.roomName,
        notes: body.notes || null,
      },
    });

    return reply.status(201).send({
      success: true,
      data: room,
    });
  });

  // Add item to room
  app.post('/:id/rooms/:roomId/items', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, roomId } = request.params as { id: string; roomId: string };
    const body = addItemSchema.parse(request.body);

    const inspection = await prisma.inspection.findUnique({
      where: { id },
    });

    if (!inspection) {
      return reply.status(404).send({
        success: false,
        error: 'Inspection not found',
      });
    }

    const room = await prisma.inspectionRoom.findFirst({
      where: { id: roomId, inspectionId: id },
    });

    if (!room) {
      return reply.status(404).send({
        success: false,
        error: 'Room not found',
      });
    }

    const item = await prisma.inspectionItem.create({
      data: {
        roomId,
        name: body.name,
        description: body.description || null,
        condition: body.condition as PrismaItemCondition,
        notes: body.notes || null,
        requiresRepair: body.requiresRepair,
        estimatedRepairCost: body.estimatedRepairCost || null,
      },
    });

    // Update room overall condition
    const allItems = await prisma.inspectionItem.findMany({
      where: { roomId },
    });

    const overallCondition = calculateOverallCondition(
      allItems.map((i) => ({ condition: i.condition as ItemCondition }))
    );

    await prisma.inspectionRoom.update({
      where: { id: roomId },
      data: { overallCondition: overallCondition as PrismaItemCondition },
    });

    return reply.status(201).send({
      success: true,
      data: {
        ...item,
        estimatedRepairCost: item.estimatedRepairCost ? toNumber(item.estimatedRepairCost) : null,
      },
    });
  });

  // Update item condition
  app.patch('/:id/rooms/:roomId/items/:itemId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, roomId, itemId } = request.params as { id: string; roomId: string; itemId: string };
    const body = request.body as {
      condition?: ItemCondition;
      notes?: string;
      requiresRepair?: boolean;
      estimatedRepairCost?: number;
    };

    const inspection = await prisma.inspection.findUnique({
      where: { id },
    });

    if (!inspection) {
      return reply.status(404).send({
        success: false,
        error: 'Inspection not found',
      });
    }

    const room = await prisma.inspectionRoom.findFirst({
      where: { id: roomId, inspectionId: id },
    });

    if (!room) {
      return reply.status(404).send({
        success: false,
        error: 'Room not found',
      });
    }

    const existingItem = await prisma.inspectionItem.findFirst({
      where: { id: itemId, roomId },
    });

    if (!existingItem) {
      return reply.status(404).send({
        success: false,
        error: 'Item not found',
      });
    }

    const updatedItem = await prisma.inspectionItem.update({
      where: { id: itemId },
      data: {
        condition: body.condition as PrismaItemCondition | undefined,
        notes: body.notes,
        requiresRepair: body.requiresRepair,
        estimatedRepairCost: body.estimatedRepairCost,
      },
    });

    // Update room overall condition
    const allItems = await prisma.inspectionItem.findMany({
      where: { roomId },
    });

    const overallCondition = calculateOverallCondition(
      allItems.map((i) => ({ condition: i.condition as ItemCondition }))
    );

    await prisma.inspectionRoom.update({
      where: { id: roomId },
      data: { overallCondition: overallCondition as PrismaItemCondition },
    });

    return reply.send({
      success: true,
      data: {
        ...updatedItem,
        estimatedRepairCost: updatedItem.estimatedRepairCost ? toNumber(updatedItem.estimatedRepairCost) : null,
      },
    });
  });

  // Add photo to room
  app.post('/:id/rooms/:roomId/photos', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, roomId } = request.params as { id: string; roomId: string };
    const body = addPhotoSchema.parse(request.body);

    const inspection = await prisma.inspection.findUnique({
      where: { id },
    });

    if (!inspection) {
      return reply.status(404).send({
        success: false,
        error: 'Inspection not found',
      });
    }

    const room = await prisma.inspectionRoom.findFirst({
      where: { id: roomId, inspectionId: id },
    });

    if (!room) {
      return reply.status(404).send({
        success: false,
        error: 'Room not found',
      });
    }

    const photo = await prisma.inspectionPhoto.create({
      data: {
        roomId,
        itemId: body.itemId || null,
        url: body.url,
        thumbnailUrl: body.thumbnailUrl || body.url,
        caption: body.caption || null,
        takenAt: new Date(),
      },
    });

    // Also add to item photos if itemId provided
    if (body.itemId) {
      const item = await prisma.inspectionItem.findUnique({
        where: { id: body.itemId },
      });
      if (item) {
        const currentPhotos = (item.photos as string[]) || [];
        await prisma.inspectionItem.update({
          where: { id: body.itemId },
          data: { photos: [...currentPhotos, photo.url] },
        });
      }
    }

    return reply.status(201).send({
      success: true,
      data: photo,
    });
  });

  // Complete inspection
  app.post('/:id/complete', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = completeInspectionSchema.parse(request.body);

    const inspection = await prisma.inspection.findUnique({
      where: { id },
    });

    if (!inspection) {
      return reply.status(404).send({
        success: false,
        error: 'Inspection not found',
      });
    }

    if (inspection.status !== 'in_progress') {
      return reply.status(400).send({
        success: false,
        error: 'Inspection must be in progress to complete',
      });
    }

    // Get rooms with items
    const rooms = await prisma.inspectionRoom.findMany({
      where: { inspectionId: id },
      include: { items: true },
    });

    const summary = generateSummary(
      rooms.map((r) => ({
        items: r.items.map((i) => ({
          condition: i.condition as ItemCondition,
          requiresRepair: i.requiresRepair,
          estimatedRepairCost: i.estimatedRepairCost ? toNumber(i.estimatedRepairCost) : null,
        })),
      }))
    );

    const updated = await prisma.inspection.update({
      where: { id },
      data: {
        status: 'completed',
        completedDate: new Date(),
        tenantSignature: body.tenantSignature || null,
        landlordSignature: body.inspectorSignature,
        tenantSignedAt: body.tenantPresent && body.tenantSignature ? new Date() : null,
        landlordSignedAt: new Date(),
        findings: body.notes || inspection.findings,
        overallCondition: summary.overallCondition,
        checklist: summary as unknown as Prisma.JsonValue,
      },
    });

    return reply.send({
      success: true,
      data: {
        ...updated,
        rooms: rooms.map((r) => ({
          ...r,
          items: r.items.map((i) => ({
            ...i,
            estimatedRepairCost: i.estimatedRepairCost ? toNumber(i.estimatedRepairCost) : null,
          })),
        })),
        summary,
      },
    });
  });

  // Generate condition report
  app.get('/:id/report', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const inspection = await prisma.inspection.findUnique({
      where: { id },
    });

    if (!inspection) {
      return reply.status(404).send({
        success: false,
        error: 'Inspection not found',
      });
    }

    if (inspection.status !== 'completed') {
      return reply.status(400).send({
        success: false,
        error: 'Inspection must be completed to generate report',
      });
    }

    const rooms = await prisma.inspectionRoom.findMany({
      where: { inspectionId: id },
      include: { items: true },
    });

    const summary = generateSummary(
      rooms.map((r) => ({
        items: r.items.map((i) => ({
          condition: i.condition as ItemCondition,
          requiresRepair: i.requiresRepair,
          estimatedRepairCost: i.estimatedRepairCost ? toNumber(i.estimatedRepairCost) : null,
        })),
      }))
    );

    const report: ConditionReport = {
      inspectionId: inspection.id,
      propertyAddress: `Property ${inspection.propertyId}`,
      unitNumber: inspection.unitId,
      inspectionDate: inspection.completedDate || inspection.scheduledDate,
      type: inspection.type as InspectionType,
      rooms: rooms.map((r) => ({
        name: r.roomName,
        condition: (r.overallCondition || 'good') as ItemCondition,
        items: r.items.map((i) => ({
          name: i.name,
          condition: i.condition as ItemCondition,
          notes: i.notes,
          photos: (i.photos as string[]) || [],
        })),
      })),
      summary,
      signatures: {
        inspector: inspection.landlordSignature,
        tenant: inspection.tenantSignature,
      },
      generatedAt: new Date(),
    };

    return reply.send({
      success: true,
      data: report,
    });
  });

  // Compare inspections (move-in vs move-out)
  app.get('/compare', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { moveInId: string; moveOutId: string };

    const moveIn = await prisma.inspection.findUnique({
      where: { id: query.moveInId },
    });
    const moveOut = await prisma.inspection.findUnique({
      where: { id: query.moveOutId },
    });

    if (!moveIn || !moveOut) {
      return reply.status(404).send({
        success: false,
        error: 'One or both inspections not found',
      });
    }

    const moveInRooms = await prisma.inspectionRoom.findMany({
      where: { inspectionId: query.moveInId },
      include: { items: true },
    });
    const moveOutRooms = await prisma.inspectionRoom.findMany({
      where: { inspectionId: query.moveOutId },
      include: { items: true },
    });

    const comparison: Array<{
      roomName: string;
      itemName: string;
      moveInCondition: ItemCondition;
      moveOutCondition: ItemCondition;
      conditionChange: 'improved' | 'same' | 'declined';
      damageCharge: number | null;
    }> = [];

    const conditionValue: Record<ItemCondition, number> = {
      excellent: 5,
      good: 4,
      fair: 3,
      poor: 2,
      damaged: 1,
      missing: 0,
    };

    for (const moveOutRoom of moveOutRooms) {
      const moveInRoom = moveInRooms.find((r) => r.roomName === moveOutRoom.roomName);
      if (!moveInRoom) continue;

      for (const moveOutItem of moveOutRoom.items) {
        const moveInItem = moveInRoom.items.find((i) => i.name === moveOutItem.name);
        if (!moveInItem) continue;

        const moveInValue = conditionValue[moveInItem.condition as ItemCondition];
        const moveOutValue = conditionValue[moveOutItem.condition as ItemCondition];

        let conditionChange: 'improved' | 'same' | 'declined';
        if (moveOutValue > moveInValue) {
          conditionChange = 'improved';
        } else if (moveOutValue < moveInValue) {
          conditionChange = 'declined';
        } else {
          conditionChange = 'same';
        }

        comparison.push({
          roomName: moveOutRoom.roomName,
          itemName: moveOutItem.name,
          moveInCondition: moveInItem.condition as ItemCondition,
          moveOutCondition: moveOutItem.condition as ItemCondition,
          conditionChange,
          damageCharge: conditionChange === 'declined' && moveOutItem.estimatedRepairCost
            ? toNumber(moveOutItem.estimatedRepairCost)
            : null,
        });
      }
    }

    const totalDamageCharges = comparison
      .filter((c) => c.damageCharge)
      .reduce((sum, c) => sum + (c.damageCharge || 0), 0);

    const moveInSummary = moveIn.checklist as unknown as InspectionSummary | null;
    const moveOutSummary = moveOut.checklist as unknown as InspectionSummary | null;

    return reply.send({
      success: true,
      data: {
        moveInInspection: {
          id: moveIn.id,
          date: moveIn.completedDate,
          overallCondition: moveInSummary?.overallCondition || moveIn.overallCondition,
        },
        moveOutInspection: {
          id: moveOut.id,
          date: moveOut.completedDate,
          overallCondition: moveOutSummary?.overallCondition || moveOut.overallCondition,
        },
        comparison,
        summary: {
          totalItems: comparison.length,
          improved: comparison.filter((c) => c.conditionChange === 'improved').length,
          same: comparison.filter((c) => c.conditionChange === 'same').length,
          declined: comparison.filter((c) => c.conditionChange === 'declined').length,
          totalDamageCharges,
        },
      },
    });
  });

  // Template routes
  app.get('/templates', async (_request: FastifyRequest, reply: FastifyReply) => {
    const results = await prisma.inspectionTemplate.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({
      success: true,
      data: results,
    });
  });

  app.post('/templates', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createTemplateSchema.parse(request.body);

    // If setting as default, unset other defaults for same property type
    if (body.isDefault) {
      await prisma.inspectionTemplate.updateMany({
        where: {
          propertyType: body.propertyType,
          isDefault: true,
        },
        data: { isDefault: false },
      });
    }

    const template = await prisma.inspectionTemplate.create({
      data: {
        name: body.name,
        propertyType: body.propertyType,
        rooms: body.rooms.map((r) => ({
          roomType: r.roomType,
          roomName: r.roomName,
          items: r.items.map((i) => ({
            name: i.name,
            description: i.description || null,
          })),
        })),
        isDefault: body.isDefault,
      },
    });

    return reply.status(201).send({
      success: true,
      data: template,
    });
  });

  app.get('/templates/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const template = await prisma.inspectionTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      return reply.status(404).send({
        success: false,
        error: 'Template not found',
      });
    }

    return reply.send({
      success: true,
      data: template,
    });
  });
}
