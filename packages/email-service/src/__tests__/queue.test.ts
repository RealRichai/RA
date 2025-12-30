import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { DLQHandler, createDLQHandler } from '../queue';
import type { EmailJobData } from '../types';
import type { Job } from 'bullmq';

describe('DLQHandler', () => {
  let handler: DLQHandler;

  beforeEach(() => {
    handler = new DLQHandler();
  });

  afterEach(() => {
    handler.clear();
  });

  describe('handleFailedJob', () => {
    it('should store failed job in DLQ', async () => {
      const mockJob = createMockJob({
        messageId: 'msg_failed1',
        templateId: 'test.template',
        to: [{ email: 'user@example.com' }],
        priority: 'normal',
      });

      await handler.handleFailedJob(mockJob, new Error('Test error'));

      const records = handler.getRecords();
      expect(records).toHaveLength(1);
      expect(records[0].messageId).toBe('msg_failed1');
      expect(records[0].error).toBe('Test error');
    });

    it('should track attempts', async () => {
      const mockJob = createMockJob(
        {
          messageId: 'msg_attempts',
          templateId: 'test.template',
          to: [{ email: 'user@example.com' }],
          priority: 'normal',
        },
        { attemptsMade: 3 }
      );

      await handler.handleFailedJob(mockJob, new Error('Failed after 3 attempts'));

      const record = handler.getRecord('msg_attempts');
      expect(record?.attempts).toBe(3);
    });
  });

  describe('getRecord', () => {
    it('should retrieve a specific record', async () => {
      const mockJob = createMockJob({
        messageId: 'msg_specific',
        templateId: 'test.template',
        to: [{ email: 'user@example.com' }],
        priority: 'normal',
      });

      await handler.handleFailedJob(mockJob, new Error('Test'));

      const record = handler.getRecord('msg_specific');
      expect(record).toBeDefined();
      expect(record?.messageId).toBe('msg_specific');
    });

    it('should return undefined for non-existent record', () => {
      const record = handler.getRecord('non_existent');
      expect(record).toBeUndefined();
    });
  });

  describe('removeRecord', () => {
    it('should remove a record from DLQ', async () => {
      const mockJob = createMockJob({
        messageId: 'msg_remove',
        templateId: 'test.template',
        to: [{ email: 'user@example.com' }],
        priority: 'normal',
      });

      await handler.handleFailedJob(mockJob, new Error('Test'));
      expect(handler.getCount()).toBe(1);

      const removed = handler.removeRecord('msg_remove');
      expect(removed).toBe(true);
      expect(handler.getCount()).toBe(0);
    });

    it('should return false for non-existent record', () => {
      const removed = handler.removeRecord('non_existent');
      expect(removed).toBe(false);
    });
  });

  describe('getRecordsByTemplate', () => {
    it('should filter records by template ID', async () => {
      await handler.handleFailedJob(
        createMockJob({
          messageId: 'msg1',
          templateId: 'template.a',
          to: [{ email: 'user@example.com' }],
          priority: 'normal',
        }),
        new Error('Error 1')
      );

      await handler.handleFailedJob(
        createMockJob({
          messageId: 'msg2',
          templateId: 'template.b',
          to: [{ email: 'user@example.com' }],
          priority: 'normal',
        }),
        new Error('Error 2')
      );

      await handler.handleFailedJob(
        createMockJob({
          messageId: 'msg3',
          templateId: 'template.a',
          to: [{ email: 'user@example.com' }],
          priority: 'normal',
        }),
        new Error('Error 3')
      );

      const recordsA = handler.getRecordsByTemplate('template.a');
      expect(recordsA).toHaveLength(2);

      const recordsB = handler.getRecordsByTemplate('template.b');
      expect(recordsB).toHaveLength(1);
    });
  });

  describe('export and import', () => {
    it('should export all records', async () => {
      await handler.handleFailedJob(
        createMockJob({
          messageId: 'msg_export1',
          templateId: 'test',
          to: [{ email: 'user@example.com' }],
          priority: 'normal',
        }),
        new Error('Error')
      );

      await handler.handleFailedJob(
        createMockJob({
          messageId: 'msg_export2',
          templateId: 'test',
          to: [{ email: 'user@example.com' }],
          priority: 'normal',
        }),
        new Error('Error')
      );

      const exported = handler.export();
      expect(exported).toHaveLength(2);
    });

    it('should import records', () => {
      const records = [
        {
          messageId: 'msg_import1',
          templateId: 'test',
          to: ['user@example.com'],
          error: 'Imported error',
          attempts: 3,
          firstAttemptAt: new Date(),
          lastAttemptAt: new Date(),
          jobData: {} as EmailJobData,
        },
      ];

      handler.import(records);

      expect(handler.getCount()).toBe(1);
      expect(handler.getRecord('msg_import1')).toBeDefined();
    });
  });

  describe('getCount', () => {
    it('should return correct count', async () => {
      expect(handler.getCount()).toBe(0);

      await handler.handleFailedJob(
        createMockJob({
          messageId: 'msg1',
          templateId: 'test',
          to: [{ email: 'user@example.com' }],
          priority: 'normal',
        }),
        new Error('Error')
      );

      expect(handler.getCount()).toBe(1);

      await handler.handleFailedJob(
        createMockJob({
          messageId: 'msg2',
          templateId: 'test',
          to: [{ email: 'user@example.com' }],
          priority: 'normal',
        }),
        new Error('Error')
      );

      expect(handler.getCount()).toBe(2);
    });
  });

  describe('clear', () => {
    it('should clear all records', async () => {
      await handler.handleFailedJob(
        createMockJob({
          messageId: 'msg_clear',
          templateId: 'test',
          to: [{ email: 'user@example.com' }],
          priority: 'normal',
        }),
        new Error('Error')
      );

      expect(handler.getCount()).toBe(1);
      handler.clear();
      expect(handler.getCount()).toBe(0);
    });
  });
});

describe('createDLQHandler', () => {
  it('should create handler with default logging', async () => {
    const handler = createDLQHandler();

    await handler.handleFailedJob(
      createMockJob({
        messageId: 'msg_log',
        templateId: 'test',
        to: [{ email: 'user@example.com' }],
        priority: 'normal',
      }),
      new Error('Test error')
    );

    expect(handler.getCount()).toBe(1);
  });

  it('should call custom onRecord callback', async () => {
    let calledWith: unknown = null;

    const handler = createDLQHandler({
      onRecord: (record) => {
        calledWith = record;
      },
    });

    await handler.handleFailedJob(
      createMockJob({
        messageId: 'msg_callback',
        templateId: 'test',
        to: [{ email: 'user@example.com' }],
        priority: 'normal',
      }),
      new Error('Callback test')
    );

    expect(calledWith).toBeDefined();
  });

  it('should call onAlert for high priority failures', async () => {
    let alertCalled = false;

    const handler = createDLQHandler({
      onAlert: () => {
        alertCalled = true;
      },
    });

    await handler.handleFailedJob(
      createMockJob({
        messageId: 'msg_high_priority',
        templateId: 'test',
        to: [{ email: 'user@example.com' }],
        priority: 'high',
      }),
      new Error('High priority failure')
    );

    expect(alertCalled).toBe(true);
  });

  it('should call onAlert for critical priority failures', async () => {
    let alertCalled = false;

    const handler = createDLQHandler({
      onAlert: () => {
        alertCalled = true;
      },
    });

    await handler.handleFailedJob(
      createMockJob({
        messageId: 'msg_critical',
        templateId: 'test',
        to: [{ email: 'user@example.com' }],
        priority: 'critical',
      }),
      new Error('Critical failure')
    );

    expect(alertCalled).toBe(true);
  });

  it('should not call onAlert for normal priority failures', async () => {
    let alertCalled = false;

    const handler = createDLQHandler({
      onAlert: () => {
        alertCalled = true;
      },
    });

    await handler.handleFailedJob(
      createMockJob({
        messageId: 'msg_normal',
        templateId: 'test',
        to: [{ email: 'user@example.com' }],
        priority: 'normal',
      }),
      new Error('Normal failure')
    );

    expect(alertCalled).toBe(false);
  });
});

// Helper to create mock jobs
function createMockJob(
  data: Partial<EmailJobData>,
  options: { attemptsMade?: number } = {}
): Job<EmailJobData> {
  return {
    data: {
      messageId: data.messageId || 'msg_test',
      templateId: data.templateId || 'test.template',
      to: data.to || [{ email: 'test@example.com' }],
      templateData: data.templateData || {},
      priority: data.priority || 'normal',
      attempt: data.attempt || 0,
      maxAttempts: data.maxAttempts || 3,
      idempotencyKey: data.idempotencyKey || 'key_test',
      ...data,
    } as EmailJobData,
    attemptsMade: options.attemptsMade || 1,
    timestamp: Date.now(),
  } as Job<EmailJobData>;
}
