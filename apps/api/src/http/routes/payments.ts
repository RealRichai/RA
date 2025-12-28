/**
 * Payment Routes - Stripe Connect Integration
 * Platform fee: 1% of transaction
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { AppError, ErrorCode } from '../../lib/errors.js';
import Stripe from 'stripe';
import { env } from '../../config/env.js';

const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia' });

const PLATFORM_FEE_PERCENT = 1; // 1% platform fee

const createPaymentSchema = z.object({
  leaseId: z.string().uuid(),
  amount: z.number().int().positive(),
  type: z.enum(['RENT', 'SECURITY_DEPOSIT', 'APPLICATION_FEE', 'LATE_FEE', 'OTHER']),
  description: z.string().optional()
});

export const paymentRoutes: FastifyPluginAsync = async (fastify) => {
  // Get payment history
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const where = request.user.role === 'TENANT'
      ? { payerId: request.user.userId }
      : { recipientId: request.user.userId };

    const payments = await prisma.payment.findMany({
      where,
      include: {
        lease: { include: { listing: { select: { id: true, title: true, address: true } } } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return reply.send({ success: true, data: payments });
  });

  // Get payment details
  fastify.get('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        lease: { include: { listing: true } },
        payer: { select: { id: true, firstName: true, lastName: true } },
        recipient: { select: { id: true, firstName: true, lastName: true } }
      }
    });

    if (!payment) throw new AppError(ErrorCode.NOT_FOUND, 'Payment not found', 404);

    if (payment.payerId !== request.user.userId &&
        payment.recipientId !== request.user.userId &&
        request.user.role !== 'ADMIN') {
      throw new AppError(ErrorCode.FORBIDDEN, 'Not authorized', 403);
    }

    return reply.send({ success: true, data: payment });
  });

  // Create payment intent (tenant initiates payment)
  fastify.post('/intent', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'TENANT') {
      throw new AppError(ErrorCode.FORBIDDEN, 'Only tenants can create payment intents', 403);
    }

    const body = createPaymentSchema.parse(request.body);

    const lease = await prisma.lease.findUnique({
      where: { id: body.leaseId },
      include: {
        landlord: { include: { landlordProfile: true } }
      }
    });

    if (!lease) throw new AppError(ErrorCode.NOT_FOUND, 'Lease not found', 404);
    if (lease.tenantId !== request.user.userId) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Not authorized', 403);
    }

    // Calculate platform fee
    const platformFee = Math.round(body.amount * PLATFORM_FEE_PERCENT / 100);
    const netAmount = body.amount - platformFee;

    // Get landlord's Stripe Connect account
    const landlordProfile = lease.landlord.landlordProfile;
    if (!landlordProfile?.stripeAccountId || !landlordProfile?.stripeOnboarded) {
      throw new AppError(ErrorCode.PAYMENT_FAILED, 'Landlord has not completed Stripe Connect setup', 400);
    }

    // Create Stripe Payment Intent with Connect
    const paymentIntent = await stripe.paymentIntents.create({
      amount: body.amount,
      currency: 'usd',
      application_fee_amount: platformFee,
      transfer_data: {
        destination: landlordProfile.stripeAccountId
      },
      metadata: {
        leaseId: body.leaseId,
        tenantId: request.user.userId,
        type: body.type
      }
    });

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        leaseId: body.leaseId,
        payerId: request.user.userId,
        recipientId: lease.landlordId,
        amount: body.amount,
        platformFee,
        netAmount,
        type: body.type,
        status: 'PENDING',
        stripePaymentIntentId: paymentIntent.id,
        description: body.description,
        dueDate: new Date()
      }
    });

    return reply.send({
      success: true,
      data: {
        payment,
        clientSecret: paymentIntent.client_secret
      }
    });
  });

  // Confirm payment (called after Stripe payment succeeds)
  fastify.post('/:id/confirm', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { stripePaymentIntentId } = request.body as { stripePaymentIntentId: string };

    const payment = await prisma.payment.findUnique({ where: { id } });
    if (!payment) throw new AppError(ErrorCode.NOT_FOUND, 'Payment not found', 404);

    if (payment.payerId !== request.user.userId) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Not authorized', 403);
    }

    // Verify with Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(stripePaymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      throw new AppError(ErrorCode.PAYMENT_FAILED, 'Payment not confirmed by Stripe', 400);
    }

    const updated = await prisma.payment.update({
      where: { id },
      data: {
        status: 'SUCCEEDED',
        paidAt: new Date(),
        stripeChargeId: paymentIntent.latest_charge as string
      }
    });

    // Notify landlord
    await prisma.notification.create({
      data: {
        userId: payment.recipientId,
        type: 'PAYMENT_RECEIVED',
        title: 'Payment Received',
        body: `Payment of $${(Number(payment.amount) / 100).toFixed(2)} received`,
        data: { paymentId: id }
      }
    });

    return reply.send({ success: true, data: updated });
  });

  // Create Stripe Connect onboarding link (landlords)
  fastify.post('/connect/onboard', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'LANDLORD') {
      throw new AppError(ErrorCode.FORBIDDEN, 'Only landlords can onboard to Stripe Connect', 403);
    }

    const user = await prisma.user.findUnique({
      where: { id: request.user.userId },
      include: { landlordProfile: true }
    });

    if (!user) throw new AppError(ErrorCode.NOT_FOUND, 'User not found', 404);

    let accountId = user.landlordProfile?.stripeAccountId;

    // Create account if not exists
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        email: user.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true }
        },
        business_type: 'individual',
        metadata: { userId: user.id }
      });

      accountId = account.id;

      await prisma.landlordProfile.update({
        where: { userId: user.id },
        data: { stripeAccountId: accountId }
      });
    }

    // Get web URL from env, with fallback
    const webUrl = env.WEB_APP_URL || 'http://localhost:3000';

    // Create onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${webUrl}/payments/connect/refresh`,
      return_url: `${webUrl}/payments/connect/complete`,
      type: 'account_onboarding'
    });

    return reply.send({ success: true, data: { url: accountLink.url } });
  });

  // Check Connect status
  fastify.get('/connect/status', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'LANDLORD') {
      throw new AppError(ErrorCode.FORBIDDEN, 'Only landlords have Connect accounts', 403);
    }

    const profile = await prisma.landlordProfile.findUnique({
      where: { userId: request.user.userId }
    });

    if (!profile?.stripeAccountId) {
      return reply.send({ success: true, data: { connected: false, onboardingComplete: false } });
    }

    const account = await stripe.accounts.retrieve(profile.stripeAccountId);
    const onboardingComplete = account.details_submitted && account.payouts_enabled;

    if (onboardingComplete && !profile.stripeOnboarded) {
      await prisma.landlordProfile.update({
        where: { userId: request.user.userId },
        data: { stripeOnboarded: true }
      });
    }

    return reply.send({
      success: true,
      data: {
        connected: true,
        onboardingComplete,
        accountId: profile.stripeAccountId
      }
    });
  });

  // Add payment method (tenant)
  fastify.post('/methods', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { stripePaymentMethodId, isDefault } = request.body as {
      stripePaymentMethodId: string; isDefault?: boolean;
    };

    // Retrieve payment method details from Stripe
    const pm = await stripe.paymentMethods.retrieve(stripePaymentMethodId);

    if (isDefault) {
      await prisma.paymentMethod.updateMany({
        where: { userId: request.user.userId },
        data: { isDefault: false }
      });
    }

    const method = await prisma.paymentMethod.create({
      data: {
        userId: request.user.userId,
        stripePaymentMethodId,
        type: pm.type.toUpperCase(),
        last4: pm.card?.last4 || pm.us_bank_account?.last4 || '****',
        brand: pm.card?.brand,
        expiryMonth: pm.card?.exp_month,
        expiryYear: pm.card?.exp_year,
        isDefault: isDefault || false
      }
    });

    return reply.status(201).send({ success: true, data: method });
  });

  // Get payment methods
  fastify.get('/methods', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const methods = await prisma.paymentMethod.findMany({
      where: { userId: request.user.userId },
      orderBy: { isDefault: 'desc' }
    });

    return reply.send({ success: true, data: methods });
  });

  // Delete payment method
  fastify.delete('/methods/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const method = await prisma.paymentMethod.findFirst({
      where: { id, userId: request.user.userId }
    });

    if (!method) throw new AppError(ErrorCode.NOT_FOUND, 'Payment method not found', 404);

    // Detach from Stripe
    await stripe.paymentMethods.detach(method.stripePaymentMethodId);

    await prisma.paymentMethod.delete({ where: { id } });

    return reply.send({ success: true, message: 'Payment method deleted' });
  });
};
