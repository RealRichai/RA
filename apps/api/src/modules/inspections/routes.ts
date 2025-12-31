import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// Types
export type InspectionType = 'move_in' | 'move_out' | 'routine' | 'pre_listing' | 'annual' | 'complaint';
export type InspectionStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'rescheduled';
export type ItemCondition = 'excellent' | 'good' | 'fair' | 'poor' | 'damaged' | 'missing';
export type RoomType = 'living_room' | 'bedroom' | 'bathroom' | 'kitchen' | 'dining_room' | 'garage' | 'basement' | 'attic' | 'exterior' | 'yard' | 'other';

export interface Inspection {
  id: string;
  propertyId: string;
  unitId: string | null;
  leaseId: string | null;
  tenantId: string | null;
  type: InspectionType;
  status: InspectionStatus;
  scheduledDate: Date;
  completedDate: Date | null;
  inspectorId: string;
  inspectorName: string;
  notes: string | null;
  tenantPresent: boolean | null;
  tenantSignature: string | null;
  inspectorSignature: string | null;
  rooms: InspectionRoom[];
  summary: InspectionSummary | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InspectionRoom {
  id: string;
  inspectionId: string;
  roomType: RoomType;
  roomName: string;
  items: InspectionItem[];
  photos: InspectionPhoto[];
  overallCondition: ItemCondition | null;
  notes: string | null;
}

export interface InspectionItem {
  id: string;
  roomId: string;
  name: string;
  description: string | null;
  condition: ItemCondition;
  previousCondition: ItemCondition | null;
  notes: string | null;
  requiresRepair: boolean;
  estimatedRepairCost: number | null;
  photos: string[];
}

export interface InspectionPhoto {
  id: string;
  roomId: string;
  itemId: string | null;
  url: string;
  thumbnailUrl: string;
  caption: string | null;
  takenAt: Date;
}

export interface InspectionSummary {
  totalRooms: number;
  totalItems: number;
  conditionBreakdown: Record<ItemCondition, number>;
  itemsRequiringRepair: number;
  estimatedTotalRepairCost: number;
  overallCondition: ItemCondition;
  recommendations: string[];
}

export interface InspectionTemplate {
  id: string;
  name: string;
  propertyType: string;
  rooms: Array<{
    roomType: RoomType;
    roomName: string;
    items: Array<{ name: string; description: string | null }>;
  }>;
  isDefault: boolean;
  createdAt: Date;
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

// In-memory stores
const inspections = new Map<string, Inspection>();
const templates = new Map<string, InspectionTemplate>();

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
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function calculateOverallCondition(items: InspectionItem[]): ItemCondition {
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

function generateSummary(rooms: InspectionRoom[]): InspectionSummary {
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

// Initialize default templates
function initializeDefaultTemplates(): void {
  const apartmentTemplate: InspectionTemplate = {
    id: 'default-apartment',
    name: 'Standard Apartment Inspection',
    propertyType: 'apartment',
    rooms: [
      {
        roomType: 'living_room',
        roomName: 'Living Room',
        items: [
          { name: 'Walls', description: 'Check for holes, marks, damage' },
          { name: 'Ceiling', description: 'Check for stains, cracks' },
          { name: 'Flooring', description: 'Check carpet/hardwood condition' },
          { name: 'Windows', description: 'Check glass, locks, screens' },
          { name: 'Light Fixtures', description: 'Check all lights work' },
          { name: 'Outlets', description: 'Test all electrical outlets' },
        ],
      },
      {
        roomType: 'kitchen',
        roomName: 'Kitchen',
        items: [
          { name: 'Refrigerator', description: 'Check operation, cleanliness' },
          { name: 'Stove/Oven', description: 'Check burners, oven operation' },
          { name: 'Dishwasher', description: 'Check operation, leaks' },
          { name: 'Sink', description: 'Check faucet, drainage, disposal' },
          { name: 'Cabinets', description: 'Check doors, hinges, shelves' },
          { name: 'Countertops', description: 'Check for damage, stains' },
        ],
      },
      {
        roomType: 'bathroom',
        roomName: 'Bathroom',
        items: [
          { name: 'Toilet', description: 'Check flushing, leaks, seat' },
          { name: 'Sink', description: 'Check faucet, drainage' },
          { name: 'Shower/Tub', description: 'Check faucet, drainage, tiles' },
          { name: 'Exhaust Fan', description: 'Check operation' },
          { name: 'Mirror/Cabinet', description: 'Check condition' },
        ],
      },
      {
        roomType: 'bedroom',
        roomName: 'Bedroom',
        items: [
          { name: 'Walls', description: 'Check for holes, marks, damage' },
          { name: 'Closet', description: 'Check doors, shelves, rod' },
          { name: 'Windows', description: 'Check glass, locks, screens' },
          { name: 'Flooring', description: 'Check condition' },
        ],
      },
    ],
    isDefault: true,
    createdAt: new Date(),
  };

  templates.set(apartmentTemplate.id, apartmentTemplate);
}

initializeDefaultTemplates();

// Route handlers
export async function inspectionRoutes(app: FastifyInstance): Promise<void> {
  // Schedule new inspection
  app.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = scheduleInspectionSchema.parse(request.body);
    const now = new Date();

    const inspection: Inspection = {
      id: generateId(),
      propertyId: body.propertyId,
      unitId: body.unitId || null,
      leaseId: body.leaseId || null,
      tenantId: body.tenantId || null,
      type: body.type,
      status: 'scheduled',
      scheduledDate: new Date(body.scheduledDate),
      completedDate: null,
      inspectorId: body.inspectorId,
      inspectorName: body.inspectorName,
      notes: body.notes || null,
      tenantPresent: null,
      tenantSignature: null,
      inspectorSignature: null,
      rooms: [],
      summary: null,
      createdAt: now,
      updatedAt: now,
    };

    // Apply template if provided
    if (body.templateId) {
      const template = templates.get(body.templateId);
      if (template) {
        inspection.rooms = template.rooms.map((r) => ({
          id: generateId(),
          inspectionId: inspection.id,
          roomType: r.roomType,
          roomName: r.roomName,
          items: r.items.map((i) => ({
            id: generateId(),
            roomId: '',
            name: i.name,
            description: i.description || null,
            condition: 'good' as ItemCondition,
            previousCondition: null,
            notes: null,
            requiresRepair: false,
            estimatedRepairCost: null,
            photos: [],
          })),
          photos: [],
          overallCondition: null,
          notes: null,
        }));

        // Set room IDs on items
        for (const room of inspection.rooms) {
          for (const item of room.items) {
            item.roomId = room.id;
          }
        }
      }
    }

    inspections.set(inspection.id, inspection);

    return reply.status(201).send({
      success: true,
      data: inspection,
    });
  });

  // Get inspection by ID
  app.get('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const inspection = inspections.get(id);

    if (!inspection) {
      return reply.status(404).send({
        success: false,
        error: 'Inspection not found',
      });
    }

    return reply.send({
      success: true,
      data: inspection,
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

    let results = Array.from(inspections.values());

    if (query.propertyId) {
      results = results.filter((i) => i.propertyId === query.propertyId);
    }
    if (query.unitId) {
      results = results.filter((i) => i.unitId === query.unitId);
    }
    if (query.tenantId) {
      results = results.filter((i) => i.tenantId === query.tenantId);
    }
    if (query.type) {
      results = results.filter((i) => i.type === query.type);
    }
    if (query.status) {
      results = results.filter((i) => i.status === query.status);
    }
    if (query.fromDate) {
      const from = new Date(query.fromDate);
      results = results.filter((i) => i.scheduledDate >= from);
    }
    if (query.toDate) {
      const to = new Date(query.toDate);
      results = results.filter((i) => i.scheduledDate <= to);
    }

    results.sort((a, b) => b.scheduledDate.getTime() - a.scheduledDate.getTime());

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
    const inspection = inspections.get(id);

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

    const updated: Inspection = {
      ...inspection,
      ...body,
      scheduledDate: body.scheduledDate ? new Date(body.scheduledDate) : inspection.scheduledDate,
      updatedAt: new Date(),
    };

    inspections.set(id, updated);

    return reply.send({
      success: true,
      data: updated,
    });
  });

  // Start inspection
  app.post('/:id/start', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const inspection = inspections.get(id);

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

    inspection.status = 'in_progress';
    inspection.updatedAt = new Date();
    inspections.set(id, inspection);

    return reply.send({
      success: true,
      data: inspection,
    });
  });

  // Add room to inspection
  app.post('/:id/rooms', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = addRoomSchema.parse(request.body);
    const inspection = inspections.get(id);

    if (!inspection) {
      return reply.status(404).send({
        success: false,
        error: 'Inspection not found',
      });
    }

    const room: InspectionRoom = {
      id: generateId(),
      inspectionId: id,
      roomType: body.roomType,
      roomName: body.roomName,
      items: [],
      photos: [],
      overallCondition: null,
      notes: body.notes || null,
    };

    inspection.rooms.push(room);
    inspection.updatedAt = new Date();
    inspections.set(id, inspection);

    return reply.status(201).send({
      success: true,
      data: room,
    });
  });

  // Add item to room
  app.post('/:id/rooms/:roomId/items', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, roomId } = request.params as { id: string; roomId: string };
    const body = addItemSchema.parse(request.body);
    const inspection = inspections.get(id);

    if (!inspection) {
      return reply.status(404).send({
        success: false,
        error: 'Inspection not found',
      });
    }

    const room = inspection.rooms.find((r) => r.id === roomId);
    if (!room) {
      return reply.status(404).send({
        success: false,
        error: 'Room not found',
      });
    }

    const item: InspectionItem = {
      id: generateId(),
      roomId,
      name: body.name,
      description: body.description || null,
      condition: body.condition,
      previousCondition: null,
      notes: body.notes || null,
      requiresRepair: body.requiresRepair,
      estimatedRepairCost: body.estimatedRepairCost || null,
      photos: [],
    };

    room.items.push(item);
    room.overallCondition = calculateOverallCondition(room.items);
    inspection.updatedAt = new Date();
    inspections.set(id, inspection);

    return reply.status(201).send({
      success: true,
      data: item,
    });
  });

  // Update item condition
  app.patch('/:id/rooms/:roomId/items/:itemId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, roomId, itemId } = request.params as { id: string; roomId: string; itemId: string };
    const body = request.body as Partial<InspectionItem>;
    const inspection = inspections.get(id);

    if (!inspection) {
      return reply.status(404).send({
        success: false,
        error: 'Inspection not found',
      });
    }

    const room = inspection.rooms.find((r) => r.id === roomId);
    if (!room) {
      return reply.status(404).send({
        success: false,
        error: 'Room not found',
      });
    }

    const itemIndex = room.items.findIndex((i) => i.id === itemId);
    if (itemIndex === -1) {
      return reply.status(404).send({
        success: false,
        error: 'Item not found',
      });
    }

    room.items[itemIndex] = {
      ...room.items[itemIndex],
      ...body,
      id: itemId,
      roomId,
    };

    room.overallCondition = calculateOverallCondition(room.items);
    inspection.updatedAt = new Date();
    inspections.set(id, inspection);

    return reply.send({
      success: true,
      data: room.items[itemIndex],
    });
  });

  // Add photo to room
  app.post('/:id/rooms/:roomId/photos', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, roomId } = request.params as { id: string; roomId: string };
    const body = addPhotoSchema.parse(request.body);
    const inspection = inspections.get(id);

    if (!inspection) {
      return reply.status(404).send({
        success: false,
        error: 'Inspection not found',
      });
    }

    const room = inspection.rooms.find((r) => r.id === roomId);
    if (!room) {
      return reply.status(404).send({
        success: false,
        error: 'Room not found',
      });
    }

    const photo: InspectionPhoto = {
      id: generateId(),
      roomId,
      itemId: body.itemId || null,
      url: body.url,
      thumbnailUrl: body.thumbnailUrl || body.url,
      caption: body.caption || null,
      takenAt: new Date(),
    };

    room.photos.push(photo);

    // Also add to item if itemId provided
    if (body.itemId) {
      const item = room.items.find((i) => i.id === body.itemId);
      if (item) {
        item.photos.push(photo.url);
      }
    }

    inspection.updatedAt = new Date();
    inspections.set(id, inspection);

    return reply.status(201).send({
      success: true,
      data: photo,
    });
  });

  // Complete inspection
  app.post('/:id/complete', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = completeInspectionSchema.parse(request.body);
    const inspection = inspections.get(id);

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

    inspection.status = 'completed';
    inspection.completedDate = new Date();
    inspection.tenantPresent = body.tenantPresent;
    inspection.tenantSignature = body.tenantSignature || null;
    inspection.inspectorSignature = body.inspectorSignature;
    inspection.notes = body.notes || inspection.notes;
    inspection.summary = generateSummary(inspection.rooms);
    inspection.updatedAt = new Date();

    inspections.set(id, inspection);

    return reply.send({
      success: true,
      data: inspection,
    });
  });

  // Generate condition report
  app.get('/:id/report', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const inspection = inspections.get(id);

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

    const report: ConditionReport = {
      inspectionId: inspection.id,
      propertyAddress: `Property ${inspection.propertyId}`, // Would fetch from DB
      unitNumber: inspection.unitId,
      inspectionDate: inspection.completedDate || inspection.scheduledDate,
      type: inspection.type,
      rooms: inspection.rooms.map((r) => ({
        name: r.roomName,
        condition: r.overallCondition || 'good',
        items: r.items.map((i) => ({
          name: i.name,
          condition: i.condition,
          notes: i.notes,
          photos: i.photos,
        })),
      })),
      summary: inspection.summary!,
      signatures: {
        inspector: inspection.inspectorSignature,
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

    const moveIn = inspections.get(query.moveInId);
    const moveOut = inspections.get(query.moveOutId);

    if (!moveIn || !moveOut) {
      return reply.status(404).send({
        success: false,
        error: 'One or both inspections not found',
      });
    }

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

    for (const moveOutRoom of moveOut.rooms) {
      const moveInRoom = moveIn.rooms.find((r) => r.roomName === moveOutRoom.roomName);
      if (!moveInRoom) continue;

      for (const moveOutItem of moveOutRoom.items) {
        const moveInItem = moveInRoom.items.find((i) => i.name === moveOutItem.name);
        if (!moveInItem) continue;

        const moveInValue = conditionValue[moveInItem.condition];
        const moveOutValue = conditionValue[moveOutItem.condition];

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
          moveInCondition: moveInItem.condition,
          moveOutCondition: moveOutItem.condition,
          conditionChange,
          damageCharge: conditionChange === 'declined' ? moveOutItem.estimatedRepairCost : null,
        });
      }
    }

    const totalDamageCharges = comparison
      .filter((c) => c.damageCharge)
      .reduce((sum, c) => sum + (c.damageCharge || 0), 0);

    return reply.send({
      success: true,
      data: {
        moveInInspection: {
          id: moveIn.id,
          date: moveIn.completedDate,
          overallCondition: moveIn.summary?.overallCondition,
        },
        moveOutInspection: {
          id: moveOut.id,
          date: moveOut.completedDate,
          overallCondition: moveOut.summary?.overallCondition,
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
    const results = Array.from(templates.values());

    return reply.send({
      success: true,
      data: results,
    });
  });

  app.post('/templates', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createTemplateSchema.parse(request.body);
    const now = new Date();

    // If setting as default, unset other defaults
    if (body.isDefault) {
      for (const [id, template] of templates) {
        if (template.propertyType === body.propertyType && template.isDefault) {
          template.isDefault = false;
          templates.set(id, template);
        }
      }
    }

    const template: InspectionTemplate = {
      id: generateId(),
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
      createdAt: now,
    };

    templates.set(template.id, template);

    return reply.status(201).send({
      success: true,
      data: template,
    });
  });

  app.get('/templates/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const template = templates.get(id);

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

// Export for testing
export { inspections, templates, calculateOverallCondition, generateSummary };
