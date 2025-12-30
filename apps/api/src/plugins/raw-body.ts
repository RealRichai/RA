/**
 * Raw Body Plugin
 *
 * Adds raw body to request for webhook signature verification.
 * Only applies to routes that need it (webhooks).
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

async function rawBodyPlugin(app: FastifyInstance): Promise<void> {
  // Add content type parser that preserves raw body
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (req: FastifyRequest, body: Buffer, done) => {
      // Store raw body for webhook signature verification
      req.rawBody = body;

      try {
        // Parse JSON as usual
        const json = JSON.parse(body.toString());
        done(null, json);
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );
}

export default fp(rawBodyPlugin, {
  name: 'raw-body',
  fastify: '4.x',
});
