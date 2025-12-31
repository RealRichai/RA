/**
 * Payment Reminder Job
 *
 * Sends payment reminders to tenants before rent is due.
 * Also detects and handles late payments.
 *
 * Reminder Schedule:
 * - 7 days before: Early reminder
 * - 3 days before: Upcoming reminder
 * - 1 day before: Final reminder
 * - Overdue: Late payment notice (with late fee if applicable)
 */

import { prisma } from '@realriches/database';
import { logger } from '@realriches/utils';
import type { Job } from 'bullmq';

import type { JobDefinition } from './scheduler';

// =============================================================================
// Types
// =============================================================================

interface UpcomingPayment {
  id: string;
  type: 'invoice' | 'recurring';
  leaseId: string;
  userId: string;
  userEmail: string;
  userName: string;
  propertyAddress: string;
  amount: number;
  dueDate: Date;
  daysUntilDue: number;
  autoPayEnabled: boolean;
}

interface OverduePayment {
  id: string;
  type: 'invoice';
  invoiceNumber: string;
  leaseId: string;
  userId: string;
  userEmail: string;
  userName: string;
  propertyAddress: string;
  amountDue: number;
  dueDate: Date;
  daysOverdue: number;
  lateFeeApplied: boolean;
  lateFeeAmount: number | null;
  gracePeriodDays: number;
}

interface ReminderResult {
  paymentId: string;
  reminderType: 'reminder_7d' | 'reminder_3d' | 'reminder_1d' | 'late_notice' | 'late_fee_applied';
  success: boolean;
  error?: string;
}

// =============================================================================
// Payment Reminder Job
// =============================================================================

export class PaymentReminderJob {
  /**
   * Get job definition for the scheduler.
   * Runs daily at 9 AM UTC (after policy expiration job).
   */
  static getDefinition(): JobDefinition {
    return {
      name: 'payment-reminder',
      handler: (job: Job) => PaymentReminderJob.execute(job),
      cron: '0 9 * * *', // Daily at 9 AM UTC
      options: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 60000 },
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    };
  }

  /**
   * Execute the payment reminder scan.
   */
  static async execute(job: Job): Promise<void> {
    const startTime = Date.now();
    const results: ReminderResult[] = [];

    logger.info({ jobId: job.id }, 'Starting payment reminder scan');

    try {
      // Find upcoming payments in different time windows
      const [upcoming7d, upcoming3d, upcoming1d] = await Promise.all([
        PaymentReminderJob.findUpcomingPayments(7, 8),
        PaymentReminderJob.findUpcomingPayments(3, 4),
        PaymentReminderJob.findUpcomingPayments(1, 2),
      ]);

      // Find overdue payments
      const overdue = await PaymentReminderJob.findOverduePayments();

      logger.info(
        {
          upcoming7d: upcoming7d.length,
          upcoming3d: upcoming3d.length,
          upcoming1d: upcoming1d.length,
          overdue: overdue.length,
        },
        'Found payments requiring action'
      );

      // Process 7-day reminders
      for (const payment of upcoming7d) {
        const result = await PaymentReminderJob.sendReminder(payment, 'reminder_7d');
        results.push(result);
      }

      // Process 3-day reminders
      for (const payment of upcoming3d) {
        const result = await PaymentReminderJob.sendReminder(payment, 'reminder_3d');
        results.push(result);
      }

      // Process 1-day reminders
      for (const payment of upcoming1d) {
        const result = await PaymentReminderJob.sendReminder(payment, 'reminder_1d');
        results.push(result);
      }

      // Process overdue payments
      for (const payment of overdue) {
        const result = await PaymentReminderJob.handleOverduePayment(payment);
        results.push(result);
      }

      // Log summary
      const successful = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      logger.info(
        {
          jobId: job.id,
          duration: Date.now() - startTime,
          total: results.length,
          successful,
          failed,
        },
        'Payment reminder scan completed'
      );
    } catch (error) {
      logger.error({ jobId: job.id, error }, 'Payment reminder scan failed');
      throw error;
    }
  }

  /**
   * Find payments due within a date range.
   */
  private static async findUpcomingPayments(
    daysFromNow: number,
    daysToNow: number
  ): Promise<UpcomingPayment[]> {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() + daysFromNow);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + daysToNow);
    endDate.setHours(23, 59, 59, 999);

    const payments: UpcomingPayment[] = [];

    // Find invoices due in this window
    const invoices = await prisma.invoice.findMany({
      where: {
        status: { in: ['sent', 'pending', 'partial'] },
        amountDue: { gt: 0 },
        dueDate: {
          gte: startDate,
          lt: endDate,
        },
      },
      include: {
        lease: {
          include: {
            primaryTenant: true,
            unit: {
              include: {
                property: true,
              },
            },
            recurringPayments: {
              where: { status: 'active' },
              take: 1,
            },
          },
        },
      },
    });

    for (const invoice of invoices) {
      if (invoice.lease?.primaryTenant) {
        const tenant = invoice.lease.primaryTenant;
        const address = invoice.lease.unit?.property?.address ||
          `${invoice.lease.unit?.property?.street1}, ${invoice.lease.unit?.property?.city}`;
        const hasAutoPay = invoice.lease.recurringPayments.some(rp => rp.autoPayEnabled);

        payments.push({
          id: invoice.id,
          type: 'invoice',
          leaseId: invoice.lease.id,
          userId: tenant.id,
          userEmail: tenant.email,
          userName: `${tenant.firstName} ${tenant.lastName}`,
          propertyAddress: address || 'Unknown',
          amount: invoice.amountDue,
          dueDate: invoice.dueDate,
          daysUntilDue: Math.ceil(
            (invoice.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          ),
          autoPayEnabled: hasAutoPay,
        });
      }
    }

    // Find recurring payments due in this window
    const recurringPayments = await prisma.recurringPayment.findMany({
      where: {
        status: 'active',
        nextPaymentDate: {
          gte: startDate,
          lt: endDate,
        },
      },
      include: {
        lease: {
          include: {
            primaryTenant: true,
            unit: {
              include: {
                property: true,
              },
            },
          },
        },
      },
    });

    for (const rp of recurringPayments) {
      if (rp.lease?.primaryTenant) {
        const tenant = rp.lease.primaryTenant;
        const address = rp.lease.unit?.property?.address ||
          `${rp.lease.unit?.property?.street1}, ${rp.lease.unit?.property?.city}`;

        // Only add if no invoice already exists for this period
        const hasInvoice = payments.some(p => p.leaseId === rp.leaseId && p.type === 'invoice');
        if (!hasInvoice) {
          payments.push({
            id: rp.id,
            type: 'recurring',
            leaseId: rp.leaseId,
            userId: tenant.id,
            userEmail: tenant.email,
            userName: `${tenant.firstName} ${tenant.lastName}`,
            propertyAddress: address || 'Unknown',
            amount: rp.amount,
            dueDate: rp.nextPaymentDate,
            daysUntilDue: Math.ceil(
              (rp.nextPaymentDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
            ),
            autoPayEnabled: rp.autoPayEnabled,
          });
        }
      }
    }

    return payments;
  }

  /**
   * Find overdue payments (past due date, not fully paid).
   */
  private static async findOverduePayments(): Promise<OverduePayment[]> {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const overdueInvoices = await prisma.invoice.findMany({
      where: {
        status: { in: ['sent', 'pending', 'partial', 'overdue'] },
        amountDue: { gt: 0 },
        dueDate: { lt: now },
      },
      include: {
        lease: {
          include: {
            primaryTenant: true,
            unit: {
              include: {
                property: true,
              },
            },
          },
        },
      },
    });

    const overduePayments: OverduePayment[] = [];

    for (const invoice of overdueInvoices) {
      if (invoice.lease?.primaryTenant) {
        const tenant = invoice.lease.primaryTenant;
        const address = invoice.lease.unit?.property?.address ||
          `${invoice.lease.unit?.property?.street1}, ${invoice.lease.unit?.property?.city}`;
        const daysOverdue = Math.ceil(
          (now.getTime() - invoice.dueDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        overduePayments.push({
          id: invoice.id,
          type: 'invoice',
          invoiceNumber: invoice.invoiceNumber,
          leaseId: invoice.lease.id,
          userId: tenant.id,
          userEmail: tenant.email,
          userName: `${tenant.firstName} ${tenant.lastName}`,
          propertyAddress: address || 'Unknown',
          amountDue: invoice.amountDue,
          dueDate: invoice.dueDate,
          daysOverdue,
          lateFeeApplied: invoice.lateFeeApplied,
          lateFeeAmount: invoice.lateFeeAmount,
          gracePeriodDays: invoice.lease.lateFeeGracePeriod,
        });
      }
    }

    return overduePayments;
  }

  /**
   * Send a payment reminder notification.
   */
  private static async sendReminder(
    payment: UpcomingPayment,
    reminderType: 'reminder_7d' | 'reminder_3d' | 'reminder_1d'
  ): Promise<ReminderResult> {
    try {
      // Check if we already sent this reminder today
      const existingNotification = await prisma.notification.findFirst({
        where: {
          userId: payment.userId,
          type: `payment_${reminderType}`,
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
          data: {
            path: ['paymentId'],
            equals: payment.id,
          },
        },
      });

      if (existingNotification) {
        logger.debug({ paymentId: payment.id, reminderType }, 'Reminder already sent today');
        return { paymentId: payment.id, reminderType, success: true };
      }

      const title = getReminderTitle(payment, reminderType);
      const body = getReminderMessage(payment, reminderType);

      // Create notification
      await prisma.notification.create({
        data: {
          userId: payment.userId,
          type: `payment_${reminderType}`,
          channel: 'in_app',
          title,
          body,
          data: {
            paymentId: payment.id,
            paymentType: payment.type,
            leaseId: payment.leaseId,
            amount: payment.amount,
            dueDate: payment.dueDate.toISOString(),
            daysUntilDue: payment.daysUntilDue,
            autoPayEnabled: payment.autoPayEnabled,
          },
          status: 'sent',
        },
      });

      logger.info(
        { paymentId: payment.id, userId: payment.userId, reminderType },
        'Payment reminder sent'
      );

      return { paymentId: payment.id, reminderType, success: true };
    } catch (error) {
      logger.error({ paymentId: payment.id, reminderType, error }, 'Failed to send reminder');
      return {
        paymentId: payment.id,
        reminderType,
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Handle an overdue payment - send notice and apply late fee if needed.
   */
  private static async handleOverduePayment(payment: OverduePayment): Promise<ReminderResult> {
    try {
      // Check if we need to apply late fee (past grace period)
      const shouldApplyLateFee =
        !payment.lateFeeApplied &&
        payment.daysOverdue > payment.gracePeriodDays;

      if (shouldApplyLateFee) {
        // Get lease to calculate late fee
        const lease = await prisma.lease.findUnique({
          where: { id: payment.leaseId },
          select: {
            lateFeeAmount: true,
            lateFeePercentage: true,
            monthlyRentAmount: true,
          },
        });

        if (lease) {
          // Calculate late fee (fixed amount or percentage of rent)
          let lateFee = lease.lateFeeAmount || 0;
          if (!lateFee && lease.lateFeePercentage) {
            lateFee = Math.round(lease.monthlyRentAmount * (lease.lateFeePercentage / 100));
          }

          if (lateFee > 0) {
            // Apply late fee to invoice
            await prisma.invoice.update({
              where: { id: payment.id },
              data: {
                lateFeeApplied: true,
                lateFeeAmount: lateFee,
                amountDue: { increment: lateFee },
                totalAmount: { increment: lateFee },
                status: 'overdue',
              },
            });

            // Send late fee notification
            await prisma.notification.create({
              data: {
                userId: payment.userId,
                type: 'payment_late_fee',
                channel: 'in_app',
                title: 'Late fee applied to your account',
                body: `A late fee of $${(lateFee / 100).toFixed(2)} has been applied to invoice ${payment.invoiceNumber} for ${payment.propertyAddress}. Your new balance is $${((payment.amountDue + lateFee) / 100).toFixed(2)}.`,
                data: {
                  invoiceId: payment.id,
                  invoiceNumber: payment.invoiceNumber,
                  leaseId: payment.leaseId,
                  lateFeeAmount: lateFee,
                  newAmountDue: payment.amountDue + lateFee,
                  daysOverdue: payment.daysOverdue,
                },
                status: 'sent',
              },
            });

            logger.info(
              { invoiceId: payment.id, lateFee, daysOverdue: payment.daysOverdue },
              'Late fee applied'
            );

            return { paymentId: payment.id, reminderType: 'late_fee_applied', success: true };
          }
        }
      }

      // Check if we already sent a late notice today
      const existingNotification = await prisma.notification.findFirst({
        where: {
          userId: payment.userId,
          type: 'payment_late_notice',
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
          data: {
            path: ['invoiceId'],
            equals: payment.id,
          },
        },
      });

      if (existingNotification) {
        logger.debug({ invoiceId: payment.id }, 'Late notice already sent today');
        return { paymentId: payment.id, reminderType: 'late_notice', success: true };
      }

      // Update invoice status to overdue
      await prisma.invoice.update({
        where: { id: payment.id },
        data: { status: 'overdue' },
      });

      // Send late payment notice
      await prisma.notification.create({
        data: {
          userId: payment.userId,
          type: 'payment_late_notice',
          channel: 'in_app',
          title: 'Payment overdue',
          body: getLateNoticeMessage(payment),
          data: {
            invoiceId: payment.id,
            invoiceNumber: payment.invoiceNumber,
            leaseId: payment.leaseId,
            amountDue: payment.amountDue,
            dueDate: payment.dueDate.toISOString(),
            daysOverdue: payment.daysOverdue,
            priority: 'high',
          },
          status: 'sent',
        },
      });

      logger.info(
        { invoiceId: payment.id, userId: payment.userId, daysOverdue: payment.daysOverdue },
        'Late payment notice sent'
      );

      return { paymentId: payment.id, reminderType: 'late_notice', success: true };
    } catch (error) {
      logger.error({ invoiceId: payment.id, error }, 'Failed to handle overdue payment');
      return {
        paymentId: payment.id,
        reminderType: 'late_notice',
        success: false,
        error: (error as Error).message,
      };
    }
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

function getReminderTitle(
  payment: UpcomingPayment,
  type: 'reminder_7d' | 'reminder_3d' | 'reminder_1d'
): string {
  const amount = `$${(payment.amount / 100).toFixed(2)}`;
  switch (type) {
    case 'reminder_7d':
      return `Rent payment of ${amount} due in 7 days`;
    case 'reminder_3d':
      return `Rent payment of ${amount} due in 3 days`;
    case 'reminder_1d':
      return `Rent payment of ${amount} due tomorrow`;
  }
}

function getReminderMessage(
  payment: UpcomingPayment,
  type: 'reminder_7d' | 'reminder_3d' | 'reminder_1d'
): string {
  const amount = `$${(payment.amount / 100).toFixed(2)}`;
  const dueDate = payment.dueDate.toLocaleDateString();

  if (payment.autoPayEnabled) {
    return `Your rent payment of ${amount} for ${payment.propertyAddress} is due on ${dueDate}. Auto-pay is enabled and will process automatically.`;
  }

  let urgency = '';
  switch (type) {
    case 'reminder_7d':
      urgency = 'Make sure your payment method is up to date.';
      break;
    case 'reminder_3d':
      urgency = 'Please ensure you have sufficient funds available.';
      break;
    case 'reminder_1d':
      urgency = 'Pay now to avoid late fees.';
      break;
  }

  return `Your rent payment of ${amount} for ${payment.propertyAddress} is due on ${dueDate}. ${urgency}`;
}

function getLateNoticeMessage(payment: OverduePayment): string {
  const amount = `$${(payment.amountDue / 100).toFixed(2)}`;
  const dueDate = payment.dueDate.toLocaleDateString();

  if (payment.daysOverdue <= payment.gracePeriodDays) {
    const daysLeft = payment.gracePeriodDays - payment.daysOverdue;
    return `Your rent payment of ${amount} for ${payment.propertyAddress} was due on ${dueDate}. You have ${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining in your grace period before late fees apply.`;
  }

  if (payment.lateFeeApplied && payment.lateFeeAmount) {
    const lateFee = `$${(payment.lateFeeAmount / 100).toFixed(2)}`;
    return `Your rent payment of ${amount} for ${payment.propertyAddress} is ${payment.daysOverdue} days overdue. A late fee of ${lateFee} has been applied. Please pay immediately to avoid further action.`;
  }

  return `Your rent payment of ${amount} for ${payment.propertyAddress} is ${payment.daysOverdue} days overdue. Please pay immediately to avoid late fees and further action.`;
}
