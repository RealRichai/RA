/**
 * Notification Logger
 *
 * Logs email sends to the Notification model for audit purposes.
 */

import type { EmailJobResult, SendEmailOptions } from '../types';

/**
 * Notification record for database persistence.
 */
export interface NotificationRecord {
  id: string;
  userId?: string;
  type: string;
  channel: 'email';
  title: string;
  body: string;
  data: Record<string, unknown>;
  status: 'pending' | 'sent' | 'failed';
  sentAt?: Date;
  error?: string;
}

/**
 * Notification logger interface.
 * Implementations should persist to database.
 */
export interface INotificationLogger {
  logQueued(options: SendEmailOptions, messageId: string): Promise<string>;
  logSent(messageId: string, result: EmailJobResult): Promise<void>;
  logFailed(messageId: string, error: string): Promise<void>;
  getNotification(messageId: string): Promise<NotificationRecord | null>;
}

/**
 * In-memory notification logger for testing.
 */
export class InMemoryNotificationLogger implements INotificationLogger {
  private records: Map<string, NotificationRecord> = new Map();

  async logQueued(options: SendEmailOptions, messageId: string): Promise<string> {
    const record: NotificationRecord = {
      id: messageId,
      userId: options.userId,
      type: options.templateId,
      channel: 'email',
      title: options.templateId,
      body: JSON.stringify(options.data),
      data: {
        templateId: options.templateId,
        to: options.to,
        priority: options.priority,
        entityType: options.entityType,
        entityId: options.entityId,
        idempotencyKey: options.idempotencyKey,
      },
      status: 'pending',
    };

    this.records.set(messageId, record);
    return messageId;
  }

  async logSent(messageId: string, result: EmailJobResult): Promise<void> {
    const record = this.records.get(messageId);
    if (record) {
      record.status = 'sent';
      record.sentAt = result.sentAt;
      record.data = {
        ...record.data,
        providerMessageId: result.providerMessageId,
      };
    }
  }

  async logFailed(messageId: string, error: string): Promise<void> {
    const record = this.records.get(messageId);
    if (record) {
      record.status = 'failed';
      record.error = error;
    }
  }

  async getNotification(messageId: string): Promise<NotificationRecord | null> {
    return this.records.get(messageId) || null;
  }

  // Test helpers
  getAllRecords(): NotificationRecord[] {
    return Array.from(this.records.values());
  }

  clear(): void {
    this.records.clear();
  }
}

/**
 * Console notification logger for development.
 */
export class ConsoleNotificationLogger implements INotificationLogger {
  async logQueued(options: SendEmailOptions, messageId: string): Promise<string> {
    console.log(`[NOTIFICATION] Queued: ${messageId}`, {
      templateId: options.templateId,
      to: options.to,
      userId: options.userId,
    });
    return messageId;
  }

  async logSent(messageId: string, result: EmailJobResult): Promise<void> {
    console.log(`[NOTIFICATION] Sent: ${messageId}`, {
      providerMessageId: result.providerMessageId,
      sentAt: result.sentAt,
    });
  }

  async logFailed(messageId: string, error: string): Promise<void> {
    console.error(`[NOTIFICATION] Failed: ${messageId}`, { error });
  }

  async getNotification(_messageId: string): Promise<NotificationRecord | null> {
    return null; // Console logger doesn't persist
  }
}
