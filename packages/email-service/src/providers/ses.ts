/**
 * AWS SES Email Provider
 *
 * Implementation of email sending via Amazon Simple Email Service.
 */

import {
  SESClient,
  SendEmailCommand,
  GetSendQuotaCommand,
  type SendEmailCommandInput,
} from '@aws-sdk/client-ses';

import type { EmailMessage, EmailProviderConfig, SendResult } from '../types';
import { BaseEmailProvider, RateLimitError } from './provider-interface';

export class SESEmailProvider extends BaseEmailProvider {
  readonly providerId = 'ses' as const;

  private client: SESClient;

  constructor(config: EmailProviderConfig) {
    super(config);

    this.client = new SESClient({
      region: config.sesRegion || 'us-east-1',
      credentials: config.sesAccessKeyId && config.sesSecretAccessKey
        ? {
            accessKeyId: config.sesAccessKeyId,
            secretAccessKey: config.sesSecretAccessKey,
          }
        : undefined, // Use default credential chain
    });
  }

  protected override validateConfig(): boolean {
    // SES can use default AWS credential chain, so we only require fromEmail
    return Boolean(this.config.fromEmail);
  }

  /**
   * Validate credentials by checking the send quota.
   */
  override async validateCredentials(): Promise<boolean> {
    try {
      const command = new GetSendQuotaCommand({});
      await this.client.send(command);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Send a single email via SES.
   */
  async send(message: EmailMessage): Promise<SendResult> {
    const from = this.getFromAddress(message);

    const input: SendEmailCommandInput = {
      Source: this.formatAddress(from),
      Destination: {
        ToAddresses: message.to.map((a) => this.formatAddress(a)),
        CcAddresses: message.cc?.map((a) => this.formatAddress(a)),
        BccAddresses: message.bcc?.map((a) => this.formatAddress(a)),
      },
      Message: {
        Subject: {
          Data: message.subject,
          Charset: 'UTF-8',
        },
        Body: {
          Html: {
            Data: message.html,
            Charset: 'UTF-8',
          },
          ...(message.text && {
            Text: {
              Data: message.text,
              Charset: 'UTF-8',
            },
          }),
        },
      },
      ReplyToAddresses: message.replyTo
        ? [this.formatAddress(message.replyTo)]
        : this.config.replyToEmail
          ? [this.config.replyToEmail]
          : undefined,
      Tags: message.tags?.map((tag) => ({
        Name: 'tag',
        Value: tag,
      })),
      ConfigurationSetName: this.config.sesConfigurationSet,
    };

    try {
      const command = new SendEmailCommand(input);
      const response = await this.client.send(command);

      return {
        success: true,
        messageId: message.id,
        providerMessageId: response.MessageId,
        sentAt: new Date(),
      };
    } catch (error) {
      return this.handleError(error, message.id);
    }
  }

  /**
   * Send multiple emails. SES doesn't have a true batch API,
   * so we send in parallel with concurrency limit.
   */
  override async sendBatch(messages: EmailMessage[]): Promise<SendResult[]> {
    const CONCURRENCY = 10;
    const results: SendResult[] = [];

    for (let i = 0; i < messages.length; i += CONCURRENCY) {
      const batch = messages.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(batch.map((m) => this.send(m)));
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Handle SES errors and convert to standard result format.
   */
  private handleError(error: unknown, messageId: string): SendResult {
    const err = error as Error & { name?: string; code?: string; $metadata?: { httpStatusCode?: number } };

    // Rate limiting
    if (err.name === 'Throttling' || err.code === 'Throttling') {
      throw new RateLimitError('ses');
    }

    // Authentication errors
    if (err.name === 'InvalidClientTokenId' || err.name === 'UnrecognizedClientException') {
      return {
        success: false,
        messageId,
        error: 'Invalid AWS credentials',
        errorCode: 'AUTH_FAILED',
      };
    }

    // Invalid email address
    if (err.name === 'InvalidParameterValue' && err.message?.includes('email')) {
      return {
        success: false,
        messageId,
        error: err.message,
        errorCode: 'INVALID_EMAIL',
      };
    }

    // Sandbox restrictions
    if (err.message?.includes('Email address is not verified')) {
      return {
        success: false,
        messageId,
        error: 'Email address not verified (SES sandbox mode)',
        errorCode: 'SANDBOX_RESTRICTION',
      };
    }

    // Generic error
    return {
      success: false,
      messageId,
      error: err.message || 'Unknown SES error',
      errorCode: err.name || 'SES_ERROR',
    };
  }
}

/**
 * Create an SES provider from environment configuration.
 */
export function createSESProvider(config: Partial<EmailProviderConfig> = {}): SESEmailProvider {
  return new SESEmailProvider({
    fromEmail: config.fromEmail || process.env['EMAIL_FROM'] || 'noreply@realriches.com',
    fromName: config.fromName || process.env['EMAIL_FROM_NAME'] || 'RealRiches',
    sesRegion: config.sesRegion || process.env['AWS_SES_REGION'] || process.env['AWS_REGION'],
    sesAccessKeyId: config.sesAccessKeyId || process.env['AWS_SES_ACCESS_KEY_ID'] || process.env['AWS_ACCESS_KEY_ID'],
    sesSecretAccessKey: config.sesSecretAccessKey || process.env['AWS_SES_SECRET_ACCESS_KEY'] || process.env['AWS_SECRET_ACCESS_KEY'],
    sesConfigurationSet: config.sesConfigurationSet || process.env['AWS_SES_CONFIGURATION_SET'],
    sandbox: config.sandbox ?? process.env['EMAIL_SANDBOX'] === 'true',
    replyToEmail: config.replyToEmail || process.env['EMAIL_REPLY_TO'],
    ...config,
  });
}
