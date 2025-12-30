/**
 * Maintenance Service
 *
 * Provides notification services for work order emergencies and escalations.
 */

import { prisma } from '@realriches/database';
import { getEmailService } from '@realriches/email-service';
import { generatePrefixedId } from '@realriches/utils';
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
  app: FastifyInstance,
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

  // Send email notification
  try {
    const emailService = getEmailService();
    await emailService.send({
      to: owner.email,
      subject: `🚨 EMERGENCY: Urgent Maintenance Required at ${workOrder.unit.property.name}`,
      template: 'emergency-work-order',
      variables: {
        recipientName: `${owner.firstName || ''} ${owner.lastName || ''}`.trim() || 'Property Owner',
        propertyName: workOrder.unit.property.name,
        propertyAddress: workOrder.unit.property.address,
        unitNumber: workOrder.unit.unitNumber,
        workOrderId: workOrder.id,
        workOrderTitle: workOrder.title,
        workOrderDescription: workOrder.description || 'No description provided',
        priority: workOrder.priority.toUpperCase(),
        timestamp: new Date().toLocaleString(),
      },
    });
  } catch {
    // Log but don't fail - notification attempt is recorded
    console.error(`Failed to send emergency notification for work order ${workOrder.id}`);
  }

  // Log the notification
  await app.writeAuditLog?.(
    { user: { id: 'system' } } as any,
    'maintenance.emergency_notification_sent',
    {
      notificationId,
      workOrderId: workOrder.id,
      propertyId: workOrder.unit.property.id,
      recipients,
    }
  );

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
  app: FastifyInstance,
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
      unit: {
        include: {
          property: {
            select: { id: true, name: true, address: true, ownerId: true },
          },
        },
      },
      assignedTo: { select: { email: true, firstName: true, lastName: true } },
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
  const owner = await prisma.user.findUnique({
    where: { id: fullWorkOrder.unit.property.ownerId },
    select: { email: true },
  });

  const recipients: string[] = [];
  if (owner) recipients.push(owner.email);
  if (fullWorkOrder.assignedTo) recipients.push(fullWorkOrder.assignedTo.email);

  // Send email notifications
  try {
    const emailService = getEmailService();

    for (const recipientEmail of recipients) {
      await emailService.send({
        to: recipientEmail,
        subject: `⚠️ Work Order Escalated: ${workOrder.title}`,
        template: 'work-order-escalation',
        variables: {
          workOrderId: workOrder.id,
          workOrderTitle: workOrder.title,
          previousPriority: previousPriority.toUpperCase(),
          newPriority: workOrder.priority.toUpperCase(),
          escalatedBy: escalatedBy.email,
          reason,
          propertyName: fullWorkOrder.unit.property.name,
          propertyAddress: fullWorkOrder.unit.property.address,
          timestamp: new Date().toLocaleString(),
        },
      });
    }
  } catch {
    console.error(`Failed to send escalation notification for work order ${workOrder.id}`);
  }

  // Log the notification
  await app.writeAuditLog?.(
    { user: escalatedBy } as any,
    'maintenance.escalation_notification_sent',
    {
      notificationId,
      workOrderId: workOrder.id,
      previousPriority,
      newPriority: workOrder.priority,
      reason,
      recipients,
    }
  );

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
  updatedBy: { id: string; email: string }
): Promise<NotificationResult> {
  const notificationId = generatePrefixedId('ntf');

  const workOrder = await prisma.workOrder.findUnique({
    where: { id: workOrderId },
    include: {
      reportedBy: { select: { email: true } },
      unit: {
        include: {
          property: { select: { name: true } },
        },
      },
    },
  });

  if (!workOrder) {
    return {
      notificationId,
      sent: false,
      recipients: [],
      channel: 'email',
      timestamp: new Date(),
    };
  }

  const recipients = [workOrder.reportedBy.email];

  try {
    const emailService = getEmailService();
    await emailService.send({
      to: workOrder.reportedBy.email,
      subject: `Work Order Update: ${workOrder.title} - ${newStatus}`,
      template: 'work-order-status-update',
      variables: {
        workOrderId,
        workOrderTitle: workOrder.title,
        newStatus: newStatus.replace('_', ' ').toUpperCase(),
        propertyName: workOrder.unit.property.name,
        timestamp: new Date().toLocaleString(),
      },
    });
  } catch {
    console.error(`Failed to send status update notification for work order ${workOrderId}`);
  }

  return {
    notificationId,
    sent: true,
    recipients,
    channel: 'email',
    timestamp: new Date(),
  };
}
