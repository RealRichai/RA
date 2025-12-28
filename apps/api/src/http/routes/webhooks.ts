/**
 * Webhook Routes - Stripe, DocuSign, Seam
 *
 * Investor-grade approach:
 * - Webhooks are "best effort" in local dev: if secrets are missing, accept & log.
 * - In production, verify signatures + persist minimal, schema-aligned events.
 */

import { FastifyPluginAsync } from 'fastify';
import Stripe from 'stripe';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';

const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  // Keep explicit version for deterministic behavior; update deliberately when upgrading Stripe SDK.
  apiVersion: '2025-02-24.acacia',
});

export const webhookRoutes: FastifyPluginAsync = async (fastify) => {
  // Stripe webhooks
  fastify.post('/stripe', { config: { rawBody: true } }, async (request, reply) => {
    // Local dev / missing secrets: accept but no-op.
    if (!env.STRIPE_WEBHOOK_SECRET || env.STRIPE_WEBHOOK_SECRET.trim().length === 0) {
      fastify.log.warn('STRIPE_WEBHOOK_SECRET not set; accepting webhook without verification (dev-only).');
      return reply.send({ received: true, verified: false });
    }

    const sig = request.headers['stripe-signature'];
    if (typeof sig !== 'string') return reply.code(400).send({ error: 'Missing stripe-signature' });

    const rawBody = (request as any).rawBody as Buffer | string | undefined;
    if (!rawBody) return reply.code(400).send({ error: 'Missing raw body' });

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      fastify.log.warn({ err }, 'Stripe signature verification failed');
      return reply.code(400).send({ error: 'Invalid signature' });
    }

    try {
      switch (event.type) {
        case 'payment_intent.succeeded': {
          const pi = event.data.object as Stripe.PaymentIntent;
          if (!pi.id) break;

          await prisma.payment.updateMany({
            where: { stripePaymentIntentId: pi.id },
            data: { status: 'SUCCEEDED' },
          });
          break;
        }

        case 'payment_intent.payment_failed': {
          const pi = event.data.object as Stripe.PaymentIntent;
          if (!pi.id) break;

          await prisma.payment.updateMany({
            where: { stripePaymentIntentId: pi.id },
            data: { status: 'FAILED' },
          });
          break;
        }

        case 'account.updated': {
          const acct = event.data.object as Stripe.Account;
          if (!acct.id) break;

          await prisma.landlordProfile.updateMany({
            where: { stripeAccountId: acct.id },
            data: {
              stripeOnboarded: Boolean(acct.details_submitted),
              stripePayoutsEnabled: Boolean(acct.payouts_enabled),
            },
          });
          break;
        }

        default:
          // Accept unknown events (idempotent), but keep logs in production.
          fastify.log.info({ type: event.type }, 'Stripe webhook ignored');
      }

      return reply.send({ received: true, verified: true });
    } catch (err) {
      // Never fail webhook delivery permanently due to transient DB errors.
      fastify.log.error({ err, type: event.type }, 'Webhook processing failed');
      return reply.send({ received: true, verified: true, processed: false });
    }
  });

  // DocuSign & Seam can be implemented when keys are configured.
  fastify.post('/docusign', async (_request, reply) => reply.send({ received: true }));
  fastify.post('/seam', async (_request, reply) => reply.send({ received: true }));
};
