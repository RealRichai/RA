/**
 * Environment Configuration
 * Zod-validated environment variables with fail-fast pattern
 */

import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().default(3000),
  
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url().optional(),
  
  REDIS_URL: z.string().url().optional(),
  
  JWT_PRIVATE_KEY: z.string().min(1),
  JWT_PUBLIC_KEY: z.string().min(1),
  JWT_ISSUER: z.string().default('realriches'),
  JWT_AUDIENCE: z.string().default('realriches-api'),
  JWT_ACCESS_TOKEN_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),
  
  CORS_ORIGINS: z.string().transform(s => s.split(',')).default('http://localhost:3000'),
  
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  
  SENDGRID_API_KEY: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
  SENDBLUE_API_KEY: z.string().optional(),
  SENDBLUE_API_SECRET: z.string().optional(),
  SEAM_API_KEY: z.string().optional(),
  THEGUARANTORS_API_KEY: z.string().optional(),
  JEEVA_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
});

function loadEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Environment validation failed:');
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();
export const isDev = env.NODE_ENV === 'development';
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

export const integrations = {
  sendGrid: !!env.SENDGRID_API_KEY,
  twilio: !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN),
  sendblue: !!(env.SENDBLUE_API_KEY && env.SENDBLUE_API_SECRET),
  seam: !!env.SEAM_API_KEY,
  theGuarantors: !!env.THEGUARANTORS_API_KEY,
  jeeva: !!env.JEEVA_API_KEY,
  anthropic: !!env.ANTHROPIC_API_KEY,
};

export const features = {
  aiEnhancements: integrations.anthropic,
  smartLocks: integrations.seam,
  guarantorServices: integrations.theGuarantors,
  aiLeadFollowup: integrations.jeeva,
  iMessage: integrations.sendblue,
};
