import { z } from 'zod';
import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from monorepo root
// Try multiple locations for flexibility
dotenvConfig({ path: resolve(process.cwd(), '.env') });
dotenvConfig({ path: resolve(process.cwd(), '../../.env') });
dotenvConfig({ path: resolve(process.cwd(), '../../../.env') });

// ============================================================================
// Environment Configuration Schema
// ============================================================================

const NodeEnvSchema = z.enum(['development', 'staging', 'production', 'test']);

const DatabaseConfigSchema = z.object({
  url: z.string().url(),
  poolSize: z.coerce.number().int().min(1).max(100).default(20),
  ssl: z.coerce.boolean().default(false),
});

// Helper to properly parse boolean from env vars (handles "false", "0", etc.)
const envBoolean = z.union([
  z.boolean(),
  z.string().transform(val => val.toLowerCase() === 'true' || val === '1'),
]).default(false);

const RedisConfigSchema = z.object({
  url: z.string(),
  password: z.string().optional(),
  tls: envBoolean,
});

const JWTConfigSchema = z.object({
  secret: z.string().min(32),
  accessExpiresIn: z.string().default('15m'),
  refreshExpiresIn: z.string().default('7d'),
});

const Argon2ConfigSchema = z.object({
  memoryCost: z.coerce.number().int().min(1024).default(65536),
  timeCost: z.coerce.number().int().min(1).default(3),
  parallelism: z.coerce.number().int().min(1).default(4),
});

const StripeConfigSchema = z.object({
  secretKey: z.string(),
  publishableKey: z.string(),
  webhookSecret: z.string().optional(),
});

const PlaidConfigSchema = z.object({
  clientId: z.string(),
  secret: z.string(),
  env: z.enum(['sandbox', 'development', 'production']).default('sandbox'),
});

const AIConfigSchema = z.object({
  openaiApiKey: z.string().optional(),
  openaiOrgId: z.string().optional(),
  anthropicApiKey: z.string().optional(),
  primaryModel: z.string().default('gpt-4-turbo'),
  fastModel: z.string().default('gpt-3.5-turbo'),
  embeddingModel: z.string().default('text-embedding-3-small'),
});

const AWSConfigSchema = z.object({
  region: z.string().default('us-east-1'),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
  s3Bucket: z.string(),
  s3BucketPublic: z.string().optional(),
  cloudfrontUrl: z.string().url().optional(),
});

const EmailConfigSchema = z.object({
  provider: z.enum(['ses', 'sendgrid', 'postmark', 'console']).default('console'),
  from: z.string().email(),
  fromName: z.string().default('RealRiches'),
  replyTo: z.string().email().optional(),
  sandbox: z.coerce.boolean().default(false),
  // SES-specific options
  sesRegion: z.string().optional(),
  sesAccessKeyId: z.string().optional(),
  sesSecretAccessKey: z.string().optional(),
  sesConfigurationSet: z.string().optional(),
  // SendGrid-specific options
  sendgridApiKey: z.string().optional(),
  // Postmark-specific options
  postmarkApiKey: z.string().optional(),
});

const SMSConfigSchema = z.object({
  twilioAccountSid: z.string().optional(),
  twilioAuthToken: z.string().optional(),
  twilioPhoneNumber: z.string().optional(),
});

const ObservabilityConfigSchema = z.object({
  sentryDsn: z.string().optional(),
  sentryEnvironment: z.string().optional(),
  ddApiKey: z.string().optional(),
  ddAppKey: z.string().optional(),
});

const FeatureFlagConfigSchema = z.object({
  provider: z.enum(['local', 'launchdarkly', 'unleash']).default('local'),
  launchDarklySdkKey: z.string().optional(),
});

const ComplianceConfigSchema = z.object({
  strictMode: z.coerce.boolean().default(true),
  fareActEnabled: z.coerce.boolean().default(true),
  fchaEnabled: z.coerce.boolean().default(true),
  goodCauseEnabled: z.coerce.boolean().default(true),
});

const MarketConfigSchema = z.object({
  defaultMarket: z.string().default('NYC'),
  enabledMarkets: z.string().transform((s) => s.split(',')).default('NYC,LA,SF,CHI,MIA,ATL'),
});

const RateLimitConfigSchema = z.object({
  max: z.coerce.number().int().min(1).default(100),
  windowMs: z.coerce.number().int().min(1000).default(60000),
});

const EncryptionConfigSchema = z.object({
  key: z.string().min(32),
  ivLength: z.coerce.number().int().default(16),
});

const ThirdPartyConfigSchema = z.object({
  leaselockApiKey: z.string().optional(),
  leaselockApiUrl: z.string().url().optional(),
  rhinoApiKey: z.string().optional(),
  rhinoApiUrl: z.string().url().optional(),
  lemonadeApiKey: z.string().optional(),
  lemonadePartnerId: z.string().optional(),
  guarantorsApiKey: z.string().optional(),
  guarantorsApiUrl: z.string().url().optional(),
});

// Full configuration schema
const ConfigSchema = z.object({
  // Application
  nodeEnv: NodeEnvSchema.default('development'),
  appName: z.string().default('RealRiches'),
  appVersion: z.string().default('1.0.0'),
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // API Server
  api: z.object({
    host: z.string().default('0.0.0.0'),
    port: z.coerce.number().int().min(1).max(65535).default(4000),
    prefix: z.string().default('/api/v1'),
    corsOrigins: z.string().transform((s) => s.split(',')).default('http://localhost:3000'),
  }),

  // Frontend
  web: z.object({
    apiUrl: z.string().url().default('http://localhost:4000/api/v1'),
    appUrl: z.string().url().default('http://localhost:3000'),
  }),

  // Services
  database: DatabaseConfigSchema,
  redis: RedisConfigSchema,
  jwt: JWTConfigSchema,
  argon2: Argon2ConfigSchema,
  encryption: EncryptionConfigSchema,

  // External services
  stripe: StripeConfigSchema.optional(),
  plaid: PlaidConfigSchema.optional(),
  ai: AIConfigSchema,
  aws: AWSConfigSchema.optional(),
  email: EmailConfigSchema.optional(),
  sms: SMSConfigSchema.optional(),
  thirdParty: ThirdPartyConfigSchema.optional(),

  // Features
  featureFlags: FeatureFlagConfigSchema,
  compliance: ComplianceConfigSchema,
  market: MarketConfigSchema,
  rateLimit: RateLimitConfigSchema,
  observability: ObservabilityConfigSchema.optional(),

  // Background Jobs
  jobs: z.object({
    queuePrefix: z.string().default('realriches'),
    concurrency: z.coerce.number().int().min(1).default(5),
    retentionDays: z.coerce.number().int().min(1).default(30),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

// ============================================================================
// Parse and Export Configuration
// ============================================================================

function parseConfig(): Config {
  const rawConfig = {
    nodeEnv: process.env['NODE_ENV'],
    appName: process.env['APP_NAME'],
    appVersion: process.env['APP_VERSION'],
    logLevel: process.env['LOG_LEVEL'],

    api: {
      host: process.env['API_HOST'],
      port: process.env['API_PORT'],
      prefix: process.env['API_PREFIX'],
      corsOrigins: process.env['CORS_ORIGINS'],
    },

    web: {
      apiUrl: process.env['NEXT_PUBLIC_API_URL'],
      appUrl: process.env['NEXT_PUBLIC_APP_URL'],
    },

    database: {
      url: process.env['DATABASE_URL'],
      poolSize: process.env['DATABASE_POOL_SIZE'],
      ssl: process.env['DATABASE_SSL'],
    },

    redis: {
      url: process.env['REDIS_URL'],
      password: process.env['REDIS_PASSWORD'],
      tls: process.env['REDIS_TLS'],
    },

    jwt: {
      secret: process.env['JWT_SECRET'],
      accessExpiresIn: process.env['JWT_ACCESS_EXPIRES_IN'],
      refreshExpiresIn: process.env['JWT_REFRESH_EXPIRES_IN'],
    },

    argon2: {
      memoryCost: process.env['ARGON2_MEMORY_COST'],
      timeCost: process.env['ARGON2_TIME_COST'],
      parallelism: process.env['ARGON2_PARALLELISM'],
    },

    encryption: {
      key: process.env['ENCRYPTION_KEY'],
      ivLength: process.env['ENCRYPTION_IV_LENGTH'],
    },

    stripe: process.env['STRIPE_SECRET_KEY']
      ? {
          secretKey: process.env['STRIPE_SECRET_KEY'],
          publishableKey: process.env['STRIPE_PUBLISHABLE_KEY'],
          webhookSecret: process.env['STRIPE_WEBHOOK_SECRET'],
        }
      : undefined,

    plaid: process.env['PLAID_CLIENT_ID']
      ? {
          clientId: process.env['PLAID_CLIENT_ID'],
          secret: process.env['PLAID_SECRET'],
          env: process.env['PLAID_ENV'],
        }
      : undefined,

    ai: {
      openaiApiKey: process.env['OPENAI_API_KEY'],
      openaiOrgId: process.env['OPENAI_ORG_ID'],
      anthropicApiKey: process.env['ANTHROPIC_API_KEY'],
      primaryModel: process.env['AI_MODEL_PRIMARY'],
      fastModel: process.env['AI_MODEL_FAST'],
      embeddingModel: process.env['AI_EMBEDDING_MODEL'],
    },

    aws: process.env['AWS_ACCESS_KEY_ID']
      ? {
          region: process.env['AWS_REGION'],
          accessKeyId: process.env['AWS_ACCESS_KEY_ID'],
          secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'],
          s3Bucket: process.env['S3_BUCKET'],
          s3BucketPublic: process.env['S3_BUCKET_PUBLIC'],
          cloudfrontUrl: process.env['CLOUDFRONT_URL'],
        }
      : undefined,

    email: process.env['EMAIL_FROM']
      ? {
          provider: process.env['EMAIL_PROVIDER'],
          from: process.env['EMAIL_FROM'],
          fromName: process.env['EMAIL_FROM_NAME'],
          replyTo: process.env['EMAIL_REPLY_TO'],
          sandbox: process.env['EMAIL_SANDBOX'],
          // SES options
          sesRegion: process.env['AWS_SES_REGION'] || process.env['AWS_REGION'],
          sesAccessKeyId: process.env['AWS_SES_ACCESS_KEY_ID'] || process.env['AWS_ACCESS_KEY_ID'],
          sesSecretAccessKey: process.env['AWS_SES_SECRET_ACCESS_KEY'] || process.env['AWS_SECRET_ACCESS_KEY'],
          sesConfigurationSet: process.env['AWS_SES_CONFIGURATION_SET'],
          // SendGrid options
          sendgridApiKey: process.env['SENDGRID_API_KEY'],
          // Postmark options
          postmarkApiKey: process.env['POSTMARK_API_KEY'],
        }
      : undefined,

    sms: process.env['TWILIO_ACCOUNT_SID']
      ? {
          twilioAccountSid: process.env['TWILIO_ACCOUNT_SID'],
          twilioAuthToken: process.env['TWILIO_AUTH_TOKEN'],
          twilioPhoneNumber: process.env['TWILIO_PHONE_NUMBER'],
        }
      : undefined,

    thirdParty: {
      leaselockApiKey: process.env['LEASELOCK_API_KEY'],
      leaselockApiUrl: process.env['LEASELOCK_API_URL'],
      rhinoApiKey: process.env['RHINO_API_KEY'],
      rhinoApiUrl: process.env['RHINO_API_URL'],
      lemonadeApiKey: process.env['LEMONADE_API_KEY'],
      lemonadePartnerId: process.env['LEMONADE_PARTNER_ID'],
      guarantorsApiKey: process.env['GUARANTORS_API_KEY'],
      guarantorsApiUrl: process.env['GUARANTORS_API_URL'],
    },

    featureFlags: {
      provider: process.env['FEATURE_FLAG_PROVIDER'],
      launchDarklySdkKey: process.env['LAUNCHDARKLY_SDK_KEY'],
    },

    compliance: {
      strictMode: process.env['COMPLIANCE_STRICT_MODE'],
      fareActEnabled: process.env['FARE_ACT_ENABLED'],
      fchaEnabled: process.env['FCHA_ENABLED'],
      goodCauseEnabled: process.env['GOOD_CAUSE_ENABLED'],
    },

    market: {
      defaultMarket: process.env['DEFAULT_MARKET'],
      enabledMarkets: process.env['ENABLED_MARKETS'],
    },

    rateLimit: {
      max: process.env['RATE_LIMIT_MAX'],
      windowMs: process.env['RATE_LIMIT_WINDOW_MS'],
    },

    observability: {
      sentryDsn: process.env['SENTRY_DSN'],
      sentryEnvironment: process.env['SENTRY_ENVIRONMENT'],
      ddApiKey: process.env['DD_API_KEY'],
      ddAppKey: process.env['DD_APP_KEY'],
    },

    jobs: {
      queuePrefix: process.env['BULL_QUEUE_PREFIX'],
      concurrency: process.env['JOB_CONCURRENCY'],
      retentionDays: process.env['JOB_RETENTION_DAYS'],
    },
  };

  return ConfigSchema.parse(rawConfig);
}

// Lazy-loaded config singleton
let _config: Config | null = null;

export function getConfig(): Config {
  if (!_config) {
    _config = parseConfig();
  }
  return _config;
}

// For testing purposes
export function resetConfig(): void {
  _config = null;
}

// Export schema for validation
export { ConfigSchema };

// Export sub-schemas
export {
  NodeEnvSchema,
  DatabaseConfigSchema,
  RedisConfigSchema,
  JWTConfigSchema,
  Argon2ConfigSchema,
  StripeConfigSchema,
  PlaidConfigSchema,
  AIConfigSchema,
  AWSConfigSchema,
  EmailConfigSchema,
  SMSConfigSchema,
  ObservabilityConfigSchema,
  FeatureFlagConfigSchema,
  ComplianceConfigSchema,
  MarketConfigSchema,
  RateLimitConfigSchema,
  EncryptionConfigSchema,
  ThirdPartyConfigSchema,
};

// Helper functions
export function isDevelopment(): boolean {
  return getConfig().nodeEnv === 'development';
}

export function isProduction(): boolean {
  return getConfig().nodeEnv === 'production';
}

export function isTest(): boolean {
  return getConfig().nodeEnv === 'test';
}

export function isStaging(): boolean {
  return getConfig().nodeEnv === 'staging';
}
