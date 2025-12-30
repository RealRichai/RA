import { createAIClient, type AIClient } from '@realriches/ai-sdk';
import { getConfig } from '@realriches/config';
import { logger } from '@realriches/utils';
import type { FastifyPluginCallback } from 'fastify';
import fp from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyInstance {
    aiClient: AIClient;
  }
}

const aiPluginCallback: FastifyPluginCallback = (fastify, _opts, done) => {
  const config = getConfig();

  // Create AI client with budget limits
  const aiClient = createAIClient({
    defaultProvider: config.ANTHROPIC_API_KEY ? 'anthropic' : 'console',
    fallbackProvider: config.OPENAI_API_KEY ? 'openai' : undefined,
    providers: {
      anthropic: {
        apiKey: config.ANTHROPIC_API_KEY || '',
        timeout: 60000,
        maxRetries: 3,
      },
      openai: {
        apiKey: config.OPENAI_API_KEY || '',
        timeout: 60000,
        maxRetries: 3,
      },
    },
    budget: {
      perUserDailyLimit: 5000, // $50/day per user
      perOrgDailyLimit: 50000, // $500/day per org
      globalDailyLimit: 500000, // $5000/day global
    },
    enablePolicyGate: true,
    blockOnPolicyViolation: false, // Sanitize rather than block
  });

  fastify.decorate('aiClient', aiClient);

  logger.info(
    { provider: config.ANTHROPIC_API_KEY ? 'anthropic' : 'console' },
    'AI client initialized'
  );

  done();
};

export const aiPlugin = fp(aiPluginCallback, {
  name: 'ai',
});
