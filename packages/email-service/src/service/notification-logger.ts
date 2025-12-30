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

  logQueued(options: SendEmailOptions, messageId: string): Promise<string> {
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
    return Promise.resolve(messageId);
  }

  logSent(messageId: string, result: EmailJobResult): Promise<void> {
    const record = this.records.get(messageId);
    if (record) {
      record.status = 'sent';
      record.sentAt = result.sentAt;
      record.data = {
        ...record.data,
        providerMessageId: result.providerMessageId,
      };
    }
    return Promise.resolve();
  }

  logFailed(messageId: string, error: string): Promise<void> {
    const record = this.records.get(messageId);
    if (record) {
      record.status = 'failed';
      record.error = error;
    }
    return Promise.resolve();
  }

  getNotification(messageId: string): Promise<NotificationRecord | null> {
    return Promise.resolve(this.records.get(messageId) || null);
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
/* eslint-disable no-console */
export class ConsoleNotificationLogger implements INotificationLogger {
  logQueued(options: SendEmailOptions, messageId: string): Promise<string> {
    console.log(`[NOTIFICATION] Queued: ${messageId}`, {
      templateId: options.templateId,
      to: options.to,
      userId: options.userId,
    });
    return Promise.resolve(messageId);
  }

  logSent(messageId: string, result: EmailJobResult): Promise<void> {
    console.log(`[NOTIFICATION] Sent: ${messageId}`, {
      providerMessageId: result.providerMessageId,
      sentAt: result.sentAt,
    });
    return Promise.resolve();
  }

  logFailed(messageId: string, error: string): Promise<void> {
    console.error(`[NOTIFICATION] Failed: ${messageId}`, { error });
    return Promise.resolve();
  }

  getNotification(_messageId: string): Promise<NotificationRecord | null> {
    return Promise.resolve(null); // Console logger doesn't persist
  }
}
