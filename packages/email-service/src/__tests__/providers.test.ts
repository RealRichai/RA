import { describe, it, expect, beforeEach } from 'vitest';

import { ConsoleEmailProvider, createConsoleProvider } from '../providers';
import type { EmailMessage } from '../types';

describe('ConsoleEmailProvider', () => {
  let provider: ConsoleEmailProvider;

  beforeEach(() => {
    provider = createConsoleProvider({
      fromEmail: 'test@example.com',
      fromName: 'Test Sender',
    });
    provider.clear();
  });

  describe('isAvailable', () => {
    it('should always be available', async () => {
      const available = await provider.isAvailable();
      expect(available).toBe(true);
    });
  });

  describe('validateCredentials', () => {
    it('should always return true', async () => {
      const valid = await provider.validateCredentials();
      expect(valid).toBe(true);
    });
  });

  describe('send', () => {
    it('should successfully send an email', async () => {
      const message: EmailMessage = {
        id: 'msg_test123',
        templateId: 'test.template',
        to: [{ email: 'recipient@example.com', name: 'Recipient' }],
        subject: 'Test Subject',
        html: '<p>Test body</p>',
        text: 'Test body',
        priority: 'normal',
      };

      const result = await provider.send(message);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('msg_test123');
      expect(result.providerMessageId).toContain('console_');
      expect(result.sentAt).toBeDefined();
    });

    it('should track sent messages', async () => {
      const message: EmailMessage = {
        id: 'msg_track123',
        templateId: 'test.template',
        to: [{ email: 'recipient@example.com' }],
        subject: 'Test',
        html: '<p>Test</p>',
        priority: 'normal',
      };

      await provider.send(message);

      const sentMessages = provider.getSentMessages();
      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0]?.id).toBe('msg_track123');
    });

    it('should return last message', async () => {
      const message1: EmailMessage = {
        id: 'msg_first',
        templateId: 'test',
        to: [{ email: 'first@example.com' }],
        subject: 'First',
        html: '<p>First</p>',
        priority: 'normal',
      };

      const message2: EmailMessage = {
        id: 'msg_second',
        templateId: 'test',
        to: [{ email: 'second@example.com' }],
        subject: 'Second',
        html: '<p>Second</p>',
        priority: 'normal',
      };

      await provider.send(message1);
      await provider.send(message2);

      const lastMessage = provider.getLastMessage();
      expect(lastMessage?.id).toBe('msg_second');
    });

    it('should simulate failure when configured', async () => {
      provider.setShouldFail(true, 'Test failure message');

      const message: EmailMessage = {
        id: 'msg_fail',
        templateId: 'test',
        to: [{ email: 'recipient@example.com' }],
        subject: 'Test',
        html: '<p>Test</p>',
        priority: 'normal',
      };

      const result = await provider.send(message);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Test failure message');
      expect(result.errorCode).toBe('SIMULATED_FAILURE');
    });

    it('should handle messages with CC and BCC', async () => {
      const message: EmailMessage = {
        id: 'msg_cc_bcc',
        templateId: 'test',
        to: [{ email: 'to@example.com' }],
        cc: [{ email: 'cc@example.com' }],
        bcc: [{ email: 'bcc@example.com' }],
        subject: 'Test with CC/BCC',
        html: '<p>Test</p>',
        priority: 'normal',
      };

      const result = await provider.send(message);

      expect(result.success).toBe(true);
      const sent = provider.getLastMessage();
      expect(sent?.cc).toHaveLength(1);
      expect(sent?.bcc).toHaveLength(1);
    });

    it('should handle high priority messages', async () => {
      const message: EmailMessage = {
        id: 'msg_high',
        templateId: 'test',
        to: [{ email: 'urgent@example.com' }],
        subject: 'Urgent!',
        html: '<p>Urgent message</p>',
        priority: 'high',
      };

      const result = await provider.send(message);

      expect(result.success).toBe(true);
      const sent = provider.getLastMessage();
      expect(sent?.priority).toBe('high');
    });
  });

  describe('sendBatch', () => {
    it('should send multiple emails', async () => {
      const messages: EmailMessage[] = [
        {
          id: 'msg_batch1',
          templateId: 'test',
          to: [{ email: 'user1@example.com' }],
          subject: 'Batch 1',
          html: '<p>Batch 1</p>',
          priority: 'normal',
        },
        {
          id: 'msg_batch2',
          templateId: 'test',
          to: [{ email: 'user2@example.com' }],
          subject: 'Batch 2',
          html: '<p>Batch 2</p>',
          priority: 'normal',
        },
        {
          id: 'msg_batch3',
          templateId: 'test',
          to: [{ email: 'user3@example.com' }],
          subject: 'Batch 3',
          html: '<p>Batch 3</p>',
          priority: 'normal',
        },
      ];

      const results = await provider.sendBatch(messages);

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);
      expect(provider.getSentMessages()).toHaveLength(3);
    });
  });

  describe('clear', () => {
    it('should clear all sent messages', async () => {
      const message: EmailMessage = {
        id: 'msg_clear',
        templateId: 'test',
        to: [{ email: 'clear@example.com' }],
        subject: 'Clear test',
        html: '<p>Clear</p>',
        priority: 'normal',
      };

      await provider.send(message);
      expect(provider.getSentMessages()).toHaveLength(1);

      provider.clear();
      expect(provider.getSentMessages()).toHaveLength(0);
    });
  });
});

describe('createConsoleProvider', () => {
  it('should create provider with custom config', () => {
    const provider = createConsoleProvider({
      fromEmail: 'custom@example.com',
      fromName: 'Custom Sender',
    });

    expect(provider.providerId).toBe('console');
  });

  it('should create provider with defaults', () => {
    const provider = createConsoleProvider();

    expect(provider.providerId).toBe('console');
  });
});
