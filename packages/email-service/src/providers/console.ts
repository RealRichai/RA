/**
 * Console Email Provider
 *
 * Development/testing provider that logs emails to console instead of sending.
 */

import type { EmailMessage, EmailProviderConfig, SendResult } from '../types';
import { BaseEmailProvider } from './provider-interface';

export class ConsoleEmailProvider extends BaseEmailProvider {
  readonly providerId = 'console' as const;

  private sentMessages: EmailMessage[] = [];
  private shouldFail: boolean = false;
  private failureMessage: string = 'Simulated failure';

  constructor(config: Partial<EmailProviderConfig> = {}) {
    super({
      fromEmail: config.fromEmail || 'test@example.com',
      fromName: config.fromName || 'Test Sender',
      ...config,
    });
  }

  protected override validateConfig(): boolean {
    return true; // Console provider is always available
  }

  override async validateCredentials(): Promise<boolean> {
    return true;
  }

  /**
   * "Send" an email by logging it to console.
   */
  async send(message: EmailMessage): Promise<SendResult> {
    if (this.shouldFail) {
      return {
        success: false,
        messageId: message.id,
        error: this.failureMessage,
        errorCode: 'SIMULATED_FAILURE',
      };
    }

    const separator = '─'.repeat(60);
    console.log(`\n${separator}`);
    console.log('📧 EMAIL SENT (Console Provider)');
    console.log(separator);
    console.log(`ID:       ${message.id}`);
    console.log(`Template: ${message.templateId}`);
    console.log(`To:       ${message.to.map((a) => this.formatAddress(a)).join(', ')}`);
    if (message.cc?.length) {
      console.log(`CC:       ${message.cc.map((a) => this.formatAddress(a)).join(', ')}`);
    }
    if (message.bcc?.length) {
      console.log(`BCC:      ${message.bcc.map((a) => this.formatAddress(a)).join(', ')}`);
    }
    console.log(`From:     ${this.formatAddress(this.getFromAddress(message))}`);
    console.log(`Subject:  ${message.subject}`);
    console.log(`Priority: ${message.priority}`);
    if (message.tags?.length) {
      console.log(`Tags:     ${message.tags.join(', ')}`);
    }
    console.log(separator);
    console.log('BODY (Text):');
    console.log(message.text || '(no text version)');
    console.log(separator);
    console.log('BODY (HTML Preview):');
    // Strip HTML tags for console preview
    const textPreview = message.html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 500);
    console.log(textPreview + (textPreview.length === 500 ? '...' : ''));
    console.log(`${separator}\n`);

    this.sentMessages.push(message);

    return {
      success: true,
      messageId: message.id,
      providerMessageId: `console_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      sentAt: new Date(),
    };
  }

  // Test helpers

  /**
   * Get all messages that have been "sent".
   */
  getSentMessages(): EmailMessage[] {
    return [...this.sentMessages];
  }

  /**
   * Get the last message that was "sent".
   */
  getLastMessage(): EmailMessage | undefined {
    return this.sentMessages[this.sentMessages.length - 1];
  }

  /**
   * Clear all sent messages.
   */
  clear(): void {
    this.sentMessages = [];
  }

  /**
   * Configure the provider to simulate failures.
   */
  setShouldFail(fail: boolean, message: string = 'Simulated failure'): void {
    this.shouldFail = fail;
    this.failureMessage = message;
  }
}

/**
 * Create a console provider for development/testing.
 */
export function createConsoleProvider(
  config: Partial<EmailProviderConfig> = {}
): ConsoleEmailProvider {
  return new ConsoleEmailProvider(config);
}
