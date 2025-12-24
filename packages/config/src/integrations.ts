/**
 * Integrations Registry
 * All third-party integrations with configuration requirements
 * Engineers: Add API keys to .env - no code changes needed
 */

export interface Integration {
  id: string;
  name: string;
  description: string;
  category: IntegrationCategory;
  provider: string;
  docsUrl: string;
  requiredEnvVars: string[];
  optionalEnvVars?: string[];
  healthCheckEndpoint?: string;
  features: string[]; // Feature flags that require this integration
}

export type IntegrationCategory =
  | 'email'
  | 'sms'
  | 'messaging'
  | 'access-control'
  | 'financial'
  | 'ai'
  | 'analytics';

export type IntegrationStatus = 'configured' | 'partial' | 'not-configured' | 'error';

/**
 * Master Integration Registry
 * All integrations with their configuration requirements
 */
export const INTEGRATIONS: Record<string, Integration> = {
  sendgrid: {
    id: 'sendgrid',
    name: 'SendGrid',
    description: 'Transactional and marketing email delivery',
    category: 'email',
    provider: 'Twilio',
    docsUrl: 'https://docs.sendgrid.com',
    requiredEnvVars: ['SENDGRID_API_KEY'],
    optionalEnvVars: ['SENDGRID_FROM_EMAIL', 'SENDGRID_FROM_NAME'],
    healthCheckEndpoint: 'https://api.sendgrid.com/v3/scopes',
    features: ['integrations.email'],
  },
  twilio: {
    id: 'twilio',
    name: 'Twilio SMS',
    description: 'SMS and voice communications',
    category: 'sms',
    provider: 'Twilio',
    docsUrl: 'https://www.twilio.com/docs',
    requiredEnvVars: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'],
    features: ['integrations.sms'],
  },
  'twilio-verify': {
    id: 'twilio-verify',
    name: 'Twilio Verify',
    description: 'Phone number verification',
    category: 'sms',
    provider: 'Twilio',
    docsUrl: 'https://www.twilio.com/docs/verify',
    requiredEnvVars: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_VERIFY_SID'],
    features: ['integrations.phone-verify'],
  },
  seam: {
    id: 'seam',
    name: 'Seam',
    description: 'Smart lock and access control',
    category: 'access-control',
    provider: 'Seam',
    docsUrl: 'https://docs.seam.co',
    requiredEnvVars: ['SEAM_API_KEY'],
    features: ['integrations.smart-locks'],
  },
  'the-guarantors': {
    id: 'the-guarantors',
    name: 'TheGuarantors',
    description: 'Lease guarantee and rent protection',
    category: 'financial',
    provider: 'TheGuarantors',
    docsUrl: 'https://www.theguarantors.com',
    requiredEnvVars: ['THE_GUARANTORS_API_KEY', 'THE_GUARANTORS_PARTNER_ID'],
    optionalEnvVars: ['THE_GUARANTORS_API_URL'],
    features: ['integrations.guarantors'],
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic Claude',
    description: 'AI assistant and content generation',
    category: 'ai',
    provider: 'Anthropic',
    docsUrl: 'https://docs.anthropic.com',
    requiredEnvVars: ['ANTHROPIC_API_KEY'],
    features: ['ai.listing-descriptions', 'ai.lead-followup', 'ai.chat-assistant'],
  },
  sendblue: {
    id: 'sendblue',
    name: 'Sendblue',
    description: 'iMessage business messaging',
    category: 'messaging',
    provider: 'Sendblue',
    docsUrl: 'https://sendblue.co/docs',
    requiredEnvVars: ['SENDBLUE_API_KEY', 'SENDBLUE_API_SECRET'],
    features: ['experimental.imessage'],
  },
  jeeva: {
    id: 'jeeva',
    name: 'Jeeva.ai',
    description: 'AI-powered lead follow-up automation',
    category: 'ai',
    provider: 'Jeeva',
    docsUrl: 'https://jeeva.ai/docs',
    requiredEnvVars: ['JEEVA_API_KEY'],
    features: ['ai.lead-followup'],
  },
};

/**
 * Check integration status based on environment variables
 */
export function checkIntegrationStatus(
  integrationId: string,
  env: Record<string, string | undefined>
): IntegrationStatus {
  const integration = INTEGRATIONS[integrationId];
  if (!integration) {
    return 'not-configured';
  }

  const missingRequired = integration.requiredEnvVars.filter((v) => !env[v]);

  if (missingRequired.length === integration.requiredEnvVars.length) {
    return 'not-configured';
  }

  if (missingRequired.length > 0) {
    return 'partial';
  }

  return 'configured';
}

/**
 * Get all integrations with their current status
 */
export function getIntegrationStatuses(
  env: Record<string, string | undefined>
): Record<string, { integration: Integration; status: IntegrationStatus }> {
  const result: Record<string, { integration: Integration; status: IntegrationStatus }> = {};

  for (const [id, integration] of Object.entries(INTEGRATIONS)) {
    result[id] = {
      integration,
      status: checkIntegrationStatus(id, env),
    };
  }

  return result;
}

/**
 * Get missing environment variables for an integration
 */
export function getMissingEnvVars(
  integrationId: string,
  env: Record<string, string | undefined>
): string[] {
  const integration = INTEGRATIONS[integrationId];
  if (!integration) return [];

  return integration.requiredEnvVars.filter((v) => !env[v]);
}

/**
 * Get integrations by category
 */
export function getIntegrationsByCategory(category: IntegrationCategory): Integration[] {
  return Object.values(INTEGRATIONS).filter((i) => i.category === category);
}

/**
 * Get integration required for a feature
 */
export function getRequiredIntegration(featureId: string): Integration | null {
  for (const integration of Object.values(INTEGRATIONS)) {
    if (integration.features.includes(featureId)) {
      return integration;
    }
  }
  return null;
}
