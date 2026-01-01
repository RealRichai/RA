/**
 * Marketing Service
 *
 * Orchestrates marketing operations:
 * - Asset generation (flyers, brochures, social posts)
 * - Media upload to S3/MinIO
 * - Video tour generation
 * - 3DGS virtual tour generation
 * - Template marketplace with Stripe payments
 */

import type { Readable } from 'stream';

import { prisma } from '@realriches/database';
import { getStorageClient, getTemplateEngine, renderHtmlToPdf } from '@realriches/document-storage';
import { generatePrefixedId, logger } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { getStripe, isStripeConfigured, getOrCreateCustomer } from '../../lib/stripe';

import {
  getMarketingProviderRegistry,
  type ServiceResponse,
  type AssetType,
  type VideoStyle,
} from './providers';

// =============================================================================
// Types
// =============================================================================

interface AssetGenerationInput {
  listingId: string;
  type: AssetType;
  templateId?: string;
  customizations?: Record<string, unknown>;
}

interface MediaUploadInput {
  propertyId: string;
  type: 'photo' | 'video' | 'virtual_tour' | 'floor_plan' | '3d_model';
  file: {
    data: Buffer | Readable;
    filename: string;
    mimetype: string;
  };
  title?: string;
  description?: string;
  order?: number;
}

interface VideoTourInput {
  propertyId: string;
  style?: VideoStyle;
  musicTrack?: string;
  voiceoverScript?: string;
}

interface ThreeDGSTourInput {
  propertyId: string;
  sourceImages: string[];
  quality?: 'standard' | 'high' | 'ultra';
  includeFloorPlan?: boolean;
}

interface TemplatePurchaseInput {
  templateId: string;
  paymentMethodId: string;
}

// =============================================================================
// Marketing Service
// =============================================================================

export class MarketingService {
  private app: FastifyInstance;
  private registry = getMarketingProviderRegistry();
  private storage = getStorageClient();

  constructor(app: FastifyInstance) {
    this.app = app;
  }

  /**
   * Get provider status for debugging/admin
   */
  getProviderStatus(): Record<string, { provider: string; isMock: boolean }> {
    return this.registry.getProviderStatus();
  }

  // ===========================================================================
  // ASSET GENERATION
  // ===========================================================================

  /**
   * Generate a marketing asset from template + listing data
   */
  async generateAsset(
    request: FastifyRequest,
    input: AssetGenerationInput
  ): Promise<ServiceResponse<{
    id: string;
    type: string;
    status: string;
    fileUrl: string | null;
  }>> {
    if (!request.user) {
      return { success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } };
    }

    // Get listing with property data
    const listing = await prisma.listing.findUnique({
      where: { id: input.listingId },
      include: {
        unit: { include: { property: true } },
        media: { orderBy: { order: 'asc' }, take: 10 },
      },
    });

    if (!listing) {
      return { success: false, error: { code: 'NOT_FOUND', message: 'Listing not found' } };
    }

    // Get template if specified
    let template = null;
    if (input.templateId) {
      template = await prisma.marketingTemplate.findUnique({
        where: { id: input.templateId },
      });
    }

    // Generate asset using provider
    const assetProvider = this.registry.getAssetProvider();
    const result = await assetProvider.generateAsset({
      type: input.type,
      templateId: input.templateId,
      listingData: {
        id: listing.id,
        title: listing.title,
        description: listing.description || '',
        price: listing.priceAmount,
        address: listing.unit.property.address,
        bedrooms: listing.unit.bedrooms,
        bathrooms: listing.unit.bathrooms,
        squareFeet: listing.unit.squareFeet || undefined,
        images: listing.media.map((m) => m.url),
        features: (listing.unit.amenities as string[]) || [],
        propertyType: listing.unit.property.type,
      },
      customizations: input.customizations,
      outputFormat: 'pdf',
    });

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error || { code: 'GENERATION_FAILED', message: 'Asset generation failed' },
      };
    }

    // Create database record
    const asset = await prisma.marketingAsset.create({
      data: {
        id: generatePrefixedId('mkt'),
        listingId: input.listingId,
        name: `${input.type} - ${listing.title}`,
        type: input.type,
        format: result.data.mimeType.split('/')[1] || 'pdf',
        templateId: input.templateId,
        status: 'completed',
        fileUrl: result.data.fileUrl,
        metadata: JSON.parse(JSON.stringify({
          customizations: input.customizations,
          listingTitle: listing.title,
          propertyAddress: listing.unit.property.address,
          generatedAt: result.data.generatedAt.toISOString(),
          fileSize: result.data.fileSize,
          mimeType: result.data.mimeType,
          isMock: result.meta?.isMock,
        })),
        createdBy: request.user.id,
      },
    });

    // Audit log
    logger.info('Audit: marketing.asset.generated', {
      assetId: asset.id,
      listingId: input.listingId,
      type: input.type,
      templateId: input.templateId,
    });

    return {
      success: true,
      data: {
        id: asset.id,
        type: asset.type,
        status: asset.status,
        fileUrl: asset.fileUrl,
      },
      meta: { isMock: result.meta?.isMock },
    };
  }

  // ===========================================================================
  // MEDIA UPLOAD
  // ===========================================================================

  /**
   * Upload property media to S3/MinIO
   */
  async uploadMedia(
    request: FastifyRequest,
    input: MediaUploadInput
  ): Promise<ServiceResponse<{
    id: string;
    url: string;
    thumbnailUrl: string;
    type: string;
  }>> {
    if (!request.user) {
      return { success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } };
    }

    // Verify property ownership
    const property = await prisma.property.findUnique({
      where: { id: input.propertyId },
    });

    if (!property) {
      return { success: false, error: { code: 'NOT_FOUND', message: 'Property not found' } };
    }

    if (property.ownerId !== request.user.id && request.user.role !== 'admin') {
      return { success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } };
    }

    // Generate storage key
    const key = this.storage.generateKey(`properties/${input.propertyId}/media`, input.file.filename);
    const thumbnailKey = key.replace(/(\.[^.]+)$/, '-thumb$1');

    // Upload to S3/MinIO
    let uploadResult;
    try {
      const fileBuffer = Buffer.isBuffer(input.file.data)
        ? input.file.data
        : await this.streamToBuffer(input.file.data);

      uploadResult = await this.storage.upload(key, fileBuffer, input.file.mimetype, {
        propertyId: input.propertyId,
        uploadedBy: request.user.id,
      });
    } catch (err) {
      return {
        success: false,
        error: { code: 'UPLOAD_FAILED', message: 'Failed to upload file to storage' },
      };
    }

    // Generate URLs
    const fileUrl = this.storage.getPublicUrl(key);
    const thumbnailUrl = this.storage.getPublicUrl(thumbnailKey);

    // Create database record
    const media = await prisma.propertyMedia.create({
      data: {
        id: generatePrefixedId('med'),
        propertyId: input.propertyId,
        type: input.type,
        format: input.file.mimetype.split('/')[1] || 'unknown',
        url: fileUrl,
        thumbnailUrl,
        filename: key,
        originalFilename: input.file.filename,
        size: uploadResult.size,
        caption: input.title,
        order: input.order || 0,
        uploadedBy: request.user.id,
      },
    });

    // Audit log
    logger.info('Audit: marketing.media.uploaded', {
      mediaId: media.id,
      propertyId: input.propertyId,
      type: input.type,
      filename: input.file.filename,
    });

    return {
      success: true,
      data: {
        id: media.id,
        url: media.url,
        thumbnailUrl: media.thumbnailUrl || '',
        type: media.type,
      },
    };
  }

  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  // ===========================================================================
  // VIDEO GENERATION
  // ===========================================================================

  /**
   * Generate AI cinematic video tour
   */
  async generateVideoTour(
    request: FastifyRequest,
    input: VideoTourInput
  ): Promise<ServiceResponse<{
    id: string;
    jobId: string;
    status: string;
    estimatedCompletionTime?: Date;
  }>> {
    if (!request.user) {
      return { success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } };
    }

    // Get property
    const property = await prisma.property.findUnique({
      where: { id: input.propertyId },
    });

    if (!property) {
      return { success: false, error: { code: 'NOT_FOUND', message: 'Property not found' } };
    }

    if (property.ownerId !== request.user.id && request.user.role !== 'admin') {
      return { success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } };
    }

    // Get property media separately
    const propertyMedia = await prisma.propertyMedia.findMany({
      where: { propertyId: input.propertyId, type: { in: ['photo', 'video'] } },
    });

    // Start video generation
    const videoProvider = this.registry.getVideoProvider();
    const result = await videoProvider.startGeneration({
      propertyId: input.propertyId,
      style: input.style || 'cinematic',
      duration: 60,
      sourceImages: propertyMedia.map((m) => m.url),
      musicTrack: input.musicTrack,
      voiceoverScript: input.voiceoverScript,
      includeBranding: true,
    });

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error || { code: 'GENERATION_FAILED', message: 'Video generation failed' },
      };
    }

    // Create placeholder media record
    const media = await prisma.propertyMedia.create({
      data: {
        id: generatePrefixedId('med'),
        propertyId: input.propertyId,
        type: 'video',
        format: 'mp4',
        url: '', // Will be populated when generation completes
        filename: `video-tour-${generatePrefixedId('vid')}.mp4`,
        originalFilename: 'ai-generated-video-tour.mp4',
        size: 0,
        caption: 'AI-Generated Video Tour',
        aiDescription: `Style: ${input.style || 'cinematic'}`,
        uploadedBy: request.user.id,
      },
    });

    // Audit log
    logger.info('Audit: marketing.video.generation_started', {
      mediaId: media.id,
      jobId: result.data.id,
      propertyId: input.propertyId,
      style: input.style,
    });

    return {
      success: true,
      data: {
        id: media.id,
        jobId: result.data.id,
        status: result.data.status,
        estimatedCompletionTime: result.data.estimatedCompletionTime,
      },
      meta: { isMock: result.meta?.isMock },
    };
  }

  // ===========================================================================
  // 3DGS GENERATION
  // ===========================================================================

  /**
   * Generate 3D Gaussian Splatting virtual tour
   */
  async generate3DGSTour(
    request: FastifyRequest,
    input: ThreeDGSTourInput
  ): Promise<ServiceResponse<{
    id: string;
    jobId: string;
    status: string;
    estimatedCompletionTime?: Date;
  }>> {
    if (!request.user) {
      return { success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } };
    }

    // Verify property ownership
    const property = await prisma.property.findUnique({
      where: { id: input.propertyId },
    });

    if (!property) {
      return { success: false, error: { code: 'NOT_FOUND', message: 'Property not found' } };
    }

    if (property.ownerId !== request.user.id && request.user.role !== 'admin') {
      return { success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } };
    }

    // Start 3DGS generation
    const threeDGSProvider = this.registry.getThreeDGSProvider();
    const result = await threeDGSProvider.startGeneration({
      propertyId: input.propertyId,
      sourceImages: input.sourceImages,
      quality: input.quality || 'standard',
      includeFloorPlan: input.includeFloorPlan || false,
    });

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error || { code: 'GENERATION_FAILED', message: '3DGS generation failed' },
      };
    }

    // Create placeholder media record
    const media = await prisma.propertyMedia.create({
      data: {
        id: generatePrefixedId('med'),
        propertyId: input.propertyId,
        type: 'virtual_tour',
        format: 'splat',
        url: '', // Will be populated when processing completes
        filename: `3dgs-tour-${generatePrefixedId('3d')}.splat`,
        originalFilename: '3d-virtual-tour.splat',
        size: 0,
        caption: '3D Virtual Tour',
        is3DGS: true,
        uploadedBy: request.user.id,
      },
    });

    // Audit log
    logger.info('Audit: marketing.3dgs.generation_started', {
      mediaId: media.id,
      jobId: result.data.id,
      propertyId: input.propertyId,
      imageCount: input.sourceImages.length,
    });

    return {
      success: true,
      data: {
        id: media.id,
        jobId: result.data.id,
        status: result.data.status,
        estimatedCompletionTime: result.data.estimatedCompletionTime,
      },
      meta: { isMock: result.meta?.isMock },
    };
  }

  // ===========================================================================
  // TEMPLATE MARKETPLACE
  // ===========================================================================

  /**
   * Purchase a premium template via Stripe
   */
  async purchaseTemplate(
    request: FastifyRequest,
    input: TemplatePurchaseInput
  ): Promise<ServiceResponse<{
    templateId: string;
    purchased: boolean;
    paymentIntentId?: string;
  }>> {
    if (!request.user) {
      return { success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } };
    }

    // Get template
    const template = await prisma.marketingTemplate.findUnique({
      where: { id: input.templateId },
    });

    if (!template) {
      return { success: false, error: { code: 'NOT_FOUND', message: 'Template not found' } };
    }

    // Free templates don't need payment
    if (!template.isPremium || !template.priceAmount) {
      await prisma.marketingTemplate.update({
        where: { id: template.id },
        data: { purchaseCount: { increment: 1 } },
      });

      return {
        success: true,
        data: {
          templateId: template.id,
          purchased: true,
        },
      };
    }

    // Check Stripe configuration
    if (!isStripeConfigured()) {
      return {
        success: false,
        error: { code: 'PAYMENT_NOT_CONFIGURED', message: 'Payment processing is not configured' },
      };
    }

    try {
      const stripe = getStripe();

      // Get or create Stripe customer
      const user = await prisma.user.findUnique({ where: { id: request.user.id } });
      if (!user) {
        return { success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } };
      }

      // Get existing Stripe customer ID from metadata or create new one
      const existingCustomerId = (user.metadata as Record<string, unknown> | null)?.stripeCustomerId as string | undefined;
      const customerId = await getOrCreateCustomer(
        user.id,
        user.email,
        `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        existingCustomerId
      );

      // Update user metadata with Stripe customer ID if new
      if (!existingCustomerId) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            metadata: JSON.parse(JSON.stringify({
              ...(user.metadata as Record<string, unknown> || {}),
              stripeCustomerId: customerId,
            })),
          },
        });
      }

      // Create payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: template.priceAmount || 0, // Already in cents
        currency: 'usd',
        customer: customerId,
        payment_method: input.paymentMethodId,
        confirm: true,
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: 'never',
        },
        metadata: {
          template_id: template.id,
          template_name: template.name,
          user_id: request.user.id,
          platform: 'realriches',
        },
        description: `Template purchase: ${template.name}`,
      });

      if (paymentIntent.status === 'succeeded') {
        // Record purchase
        await prisma.marketingTemplate.update({
          where: { id: template.id },
          data: { purchaseCount: { increment: 1 } },
        });

        // Audit log
        logger.info('Audit: marketing.template.purchased', {
          templateId: template.id,
          amount: template.priceAmount,
          paymentIntentId: paymentIntent.id,
        });

        return {
          success: true,
          data: {
            templateId: template.id,
            purchased: true,
            paymentIntentId: paymentIntent.id,
          },
        };
      }

      return {
        success: false,
        error: {
          code: 'PAYMENT_FAILED',
          message: `Payment status: ${paymentIntent.status}`,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Payment processing failed';
      return {
        success: false,
        error: { code: 'PAYMENT_ERROR', message },
      };
    }
  }
}
