import { getConfig } from '@realriches/config';
import {
  EmailService,
  createProviderFromEnv,
  registerAllTemplates,
} from '@realriches/email-service';
import { logger } from '@realriches/utils';
import type { FastifyPluginCallback } from 'fastify';
import fp from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyInstance {
    emailService: EmailService;
  }
}

const emailPluginCallback: FastifyPluginCallback = (fastify, _opts, done) => {
  // Register all email templates
  registerAllTemplates();

  // Create email provider based on environment
  const provider = createProviderFromEnv();

  // Create email service with Redis connection
  const emailService = new EmailService({
    connection: fastify.redis,
    provider,
    startWorker: true, // Start processing queue
  });

  fastify.decorate('emailService', emailService);

  logger.info(
    { provider: provider.providerId },
    'Email service initialized'
  );

  fastify.addHook('onClose', async () => {
    await emailService.close();
  });

  done();
};

export const emailPlugin = fp(emailPluginCallback, {
  name: 'email',
  dependencies: ['redis'],
});
