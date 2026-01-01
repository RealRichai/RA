/**
 * Maintenance Service
 *
 * Provides notification services for work order emergencies and escalations.
 */

import { prisma } from '@realriches/database';
import { generatePrefixedId, logger } from '@realriches/utils';
import type { FastifyInstance } from 'fastify';

// =============================================================================
// Types
// =============================================================================

export interface WorkOrderNotification {
  workOrderId: string;
  type: 'emergency' | 'escalation' | 'status_update' | 'assignment';
  recipients: string[];
  message: string;
  priority: 'low' | 'normal' | 'high' | 'emergency';
}

export interface NotificationResult {
  notificationId: string;
  sent: boolean;
  recipients: string[];
  channel: 'email' | 'sms' | 'push';
  timestamp: Date;
}

// =============================================================================
// Notification Service
// =============================================================================

/**
 * Send emergency notification for critical work orders
 */
export async function sendEmergencyNotification(
  _app: FastifyInstance,
  workOrder: {
    id: string;
    title: string;
    description?: string | null;
    priority: string;
    unit: {
      unitNumber: string;
      property: {
        id: string;
        name: string;
        address: string;
        ownerId: string;
      };
    };
  }
): Promise<NotificationResult> {
  const notificationId = generatePrefixedId('ntf');

  // Get property owner's contact info
  const owner = await prisma.user.findUnique({
    where: { id: workOrder.unit.property.ownerId },
    select: { email: true, phone: true, firstName: true, lastName: true },
  });

  if (!owner) {
    return {
      notificationId,
      sent: false,
      recipients: [],
      channel: 'email',
      timestamp: new Date(),
    };
  }

  const recipients = [owner.email];

  // Log notification (email sending stubbed for now)
  logger.info('Emergency notification would be sent', {
    notificationId,
    workOrderId: workOrder.id,
    recipients,
    subject: `EMERGENCY: Urgent Maintenance Required at ${workOrder.unit.property.name}`,
  });

  return {
    notificationId,
    sent: true,
    recipients,
    channel: 'email',
    timestamp: new Date(),
  };
}

/**
 * Send escalation notification when work order priority is increased
 */
export async function sendEscalationNotification(
  _app: FastifyInstance,
  workOrder: {
    id: string;
    title: string;
    priority: string;
    notes?: string | null;
  },
  escalatedBy: { id: string; email: string },
  reason: string,
  previousPriority: string
): Promise<NotificationResult> {
  const notificationId = generatePrefixedId('ntf');

  // Get work order with property info
  const fullWorkOrder = await prisma.workOrder.findUnique({
    where: { id: workOrder.id },
    include: {
      assignee: { select: { email: true, firstName: true, lastName: true } },
    },
  });

  if (!fullWorkOrder) {
    return {
      notificationId,
      sent: false,
      recipients: [],
      channel: 'email',
      timestamp: new Date(),
    };
  }

  // Collect recipients: property owner + assigned vendor (if any)
  const property = await prisma.property.findUnique({
    where: { id: fullWorkOrder.propertyId },
    select: { ownerId: true, name: true, address: true },
  });

  const owner = property ? await prisma.user.findUnique({
    where: { id: property.ownerId },
    select: { email: true },
  }) : null;

  const recipients: string[] = [];
  if (owner) recipients.push(owner.email);
  if (fullWorkOrder.assignee) recipients.push(fullWorkOrder.assignee.email);

  // Log notification (email sending stubbed for now)
  logger.info('Escalation notification would be sent', {
    notificationId,
    workOrderId: workOrder.id,
    previousPriority,
    newPriority: workOrder.priority,
    escalatedBy: escalatedBy.email,
    reason,
    recipients,
  });

  return {
    notificationId,
    sent: true,
    recipients,
    channel: 'email',
    timestamp: new Date(),
  };
}

/**
 * Send notification when work order status changes
 */
export async function sendStatusUpdateNotification(
  workOrderId: string,
  newStatus: string,
  _updatedBy: { id: string; email: string }
): Promise<NotificationResult> {
  const notificationId = generatePrefixedId('ntf');

  const workOrder = await prisma.workOrder.findUnique({
    where: { id: workOrderId },
    include: {
      reporter: { select: { email: true } },
    },
  });

  if (!workOrder || !workOrder.reporter) {
    return {
      notificationId,
      sent: false,
      recipients: [],
      channel: 'email',
      timestamp: new Date(),
    };
  }

  const recipients = [workOrder.reporter.email];

  // Get property name
  const property = await prisma.property.findUnique({
    where: { id: workOrder.propertyId },
    select: { name: true },
  });

  // Log notification (email sending stubbed for now)
  logger.info('Status update notification would be sent', {
    notificationId,
    workOrderId,
    workOrderTitle: workOrder.title,
    newStatus,
    propertyName: property?.name || 'Unknown Property',
    recipients,
  });

  return {
    notificationId,
    sent: true,
    recipients,
    channel: 'email',
    timestamp: new Date(),
  };
}
