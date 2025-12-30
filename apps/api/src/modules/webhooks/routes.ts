/**
 * Webhook Routes
 *
 * Handles incoming webhooks from external services like Stripe.
 * These endpoints do NOT require authentication - they use signature verification instead.
 */

import { prisma } from '@realriches/database';
import {
  createWebhookProcessor,
  type WebhookHandlerResult,
} from '@realriches/revenue-engine';
import { AppError } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

import { getWebhookSecret, isStripeConfigured, redactStripeData } from '../../lib/stripe';

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Stripe Webhook Endpoint
   *
   * Receives webhook events from Stripe and processes them.
   * Uses signature verification instead of bearer token authentication.
   */
  app.post(
    '/stripe',
    {
      schema: {
        description: 'Stripe webhook endpoint',
        tags: ['Webhooks'],
        // No security - webhooks use signature verification
      },
      config: {
        // Disable body parsing - we need the raw body for signature verification
        rawBody: true,
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Check if Stripe is configured
      if (!isStripeConfigured()) {
        request.log.warn('Stripe webhook received but Stripe is not configured');
        return reply.status(503).send({
          success: false,
          error: { code: 'SERVICE_UNAVAILABLE', message: 'Stripe is not configured' },
        });
      }

      // Get the signature header
      const signatureHeader = request.headers['stripe-signature'];
      if (!signatureHeader || typeof signatureHeader !== 'string') {
        request.log.warn('Missing stripe-signature header');
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_SIGNATURE', message: 'Missing stripe-signature header' },
        });
      }

      // Get the raw body for signature verification
      // Fastify with rawBody config stores it in request.rawBody
      const rawBody = (request as FastifyRequest & { rawBody?: Buffer }).rawBody;
      if (!rawBody) {
        request.log.error('Raw body not available for webhook verification');
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_PAYLOAD', message: 'Request body not available' },
        });
      }

      try {
        // Get the webhook secret and create processor
        const webhookSecret = getWebhookSecret();
        const processor = createWebhookProcessor(webhookSecret);

        // Process the webhook event
        const result: WebhookHandlerResult = await processor.process(rawBody, signatureHeader);

        if (!result.success) {
          request.log.error({ result: redactStripeData(result) }, 'Webhook processing failed');
          return reply.status(400).send({
            success: false,
            error: { code: 'WEBHOOK_FAILED', message: result.error || 'Webhook processing failed' },
          });
        }

        // Log successful processing
        request.log.info({
          eventId: result.eventId,
          ledgerTransactionId: result.ledgerTransactionId,
          skipped: result.skipped,
          skipReason: result.skipReason,
        }, 'Webhook processed successfully');

        // If a ledger transaction was created, update the corresponding Payment record
        if (result.ledgerTransactionId && !result.skipped) {
          await updatePaymentFromWebhook(request, result);
        }

        // Return success - Stripe expects a 2xx response
        return reply.status(200).send({
          success: true,
          received: true,
          eventId: result.eventId,
        });
      } catch (error) {
        // Log the error with redacted sensitive data
        request.log.error({ error: redactStripeData(error) }, 'Webhook error');

        // Don't expose internal errors - just return 500
        // Stripe will retry on 5xx errors
        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Webhook processing error' },
        });
      }
    }
  );
}

/**
 * Update Payment record based on webhook event result.
 * This is called after successful webhook processing to sync our database.
 */
async function updatePaymentFromWebhook(
  request: FastifyRequest,
  result: WebhookHandlerResult
): Promise<void> {
  try {
    // The webhook processor should include payment_id in metadata
    // For now, we'll query by stripePaymentIntentId if available
    // This would be enhanced based on actual event data structure

    // Note: The actual update logic depends on the event type and structure
    // The WebhookProcessor in revenue-engine handles the ledger posting
    // Here we just need to sync any additional Payment table fields

    request.log.debug({
      ledgerTransactionId: result.ledgerTransactionId,
      eventId: result.eventId,
    }, 'Payment webhook sync placeholder');

    // Future enhancement: Parse the event type and update Payment accordingly
    // For now, the Payment status is updated when we call createPaymentIntent
    // and via the webhook handlers in revenue-engine
  } catch (error) {
    // Log but don't fail - the webhook was processed successfully
    request.log.error({ error }, 'Failed to update payment from webhook');
  }
}

export default webhookRoutes;
