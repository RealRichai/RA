/**
 * Dead Letter Queue Handler
 *
 * Handles permanently failed email jobs.
 */

import type { Job } from 'bullmq';

import type { EmailJobData } from '../types';

export interface DLQRecord {
  messageId: string;
  templateId: string;
  to: string[];
  error: string;
  attempts: number;
  firstAttemptAt: Date;
  lastAttemptAt: Date;
  jobData: EmailJobData;
}

export interface DLQHandlerOptions {
  onRecord?: (record: DLQRecord) => void | Promise<void>;
  onAlert?: (record: DLQRecord) => void | Promise<void>;
}

/**
 * DLQ handler for managing failed email jobs.
 */
export class DLQHandler {
  private records: Map<string, DLQRecord> = new Map();
  private onRecord?: DLQHandlerOptions['onRecord'];
  private onAlert?: DLQHandlerOptions['onAlert'];

  constructor(options: DLQHandlerOptions = {}) {
    this.onRecord = options.onRecord;
    this.onAlert = options.onAlert;
  }

  /**
   * Handle a permanently failed job.
   */
  async handleFailedJob(job: Job<EmailJobData>, error: Error): Promise<void> {
    const { data } = job;

    const record: DLQRecord = {
      messageId: data.messageId,
      templateId: data.templateId,
      to: data.to.map((t) => t.email),
      error: error.message,
      attempts: job.attemptsMade,
      firstAttemptAt: new Date(job.timestamp),
      lastAttemptAt: new Date(),
      jobData: data,
    };

    // Store the record
    this.records.set(data.messageId, record);

    // Notify handlers
    if (this.onRecord) {
      await this.onRecord(record);
    }

    // Alert for critical failures
    if (data.priority === 'critical' || data.priority === 'high') {
      if (this.onAlert) {
        await this.onAlert(record);
      }
    }
  }

  /**
   * Get all DLQ records.
   */
  getRecords(): DLQRecord[] {
    return Array.from(this.records.values());
  }

  /**
   * Get a specific DLQ record by message ID.
   */
  getRecord(messageId: string): DLQRecord | undefined {
    return this.records.get(messageId);
  }

  /**
   * Remove a record from the DLQ (e.g., after successful retry).
   */
  removeRecord(messageId: string): boolean {
    return this.records.delete(messageId);
  }

  /**
   * Clear all records.
   */
  clear(): void {
    this.records.clear();
  }

  /**
   * Get count of records.
   */
  getCount(): number {
    return this.records.size;
  }

  /**
   * Get records by template ID.
   */
  getRecordsByTemplate(templateId: string): DLQRecord[] {
    return Array.from(this.records.values()).filter(
      (r) => r.templateId === templateId
    );
  }

  /**
   * Get records by date range.
   */
  getRecordsByDateRange(start: Date, end: Date): DLQRecord[] {
    return Array.from(this.records.values()).filter(
      (r) =>
        r.lastAttemptAt >= start && r.lastAttemptAt <= end
    );
  }

  /**
   * Export records for persistence.
   */
  export(): DLQRecord[] {
    return Array.from(this.records.values());
  }

  /**
   * Import records from persistence.
   */
  import(records: DLQRecord[]): void {
    for (const record of records) {
      this.records.set(record.messageId, record);
    }
  }
}

/**
 * Create a DLQ handler with logging.
 */
export function createDLQHandler(options: DLQHandlerOptions = {}): DLQHandler {
  return new DLQHandler({
    onRecord: (record) => {
      // eslint-disable-next-line no-console
      console.error(
        `[EMAIL DLQ] Permanently failed: ${record.messageId} (${record.templateId})`,
        {
          to: record.to,
          error: record.error,
          attempts: record.attempts,
        }
      );
      void options.onRecord?.(record);
    },
    onAlert: (record) => {
      // eslint-disable-next-line no-console
      console.error(
        `[EMAIL DLQ ALERT] High-priority email failed: ${record.messageId}`,
        {
          templateId: record.templateId,
          to: record.to,
          error: record.error,
        }
      );
      void options.onAlert?.(record);
    },
  });
}
