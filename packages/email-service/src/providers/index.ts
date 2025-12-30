/**
 * Email Providers
 *
 * Email provider adapters for different email services.
 */

export * from './provider-interface';
export * from './ses';
export * from './console';

import type { EmailProvider, EmailProviderConfig } from '../types';
import type { IEmailProvider } from './provider-interface';
import { createConsoleProvider } from './console';
import { createSESProvider } from './ses';

/**
 * Create an email provider from configuration.
 */
export function createProvider(
  provider: EmailProvider,
  config: Partial<EmailProviderConfig> = {}
): IEmailProvider {
  switch (provider) {
    case 'ses':
      return createSESProvider(config);
    case 'console':
      return createConsoleProvider(config);
    case 'postmark':
    case 'sendgrid':
      // Fallback to console for unimplemented providers
      console.warn(`Provider '${provider}' not implemented, falling back to console`);
      return createConsoleProvider(config);
    default:
      throw new Error(`Unknown email provider: ${provider}`);
  }
}

/**
 * Create a provider from environment configuration.
 */
export function createProviderFromEnv(): IEmailProvider {
  const provider = (process.env['EMAIL_PROVIDER'] || 'console') as EmailProvider;
  return createProvider(provider);
}
