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
import { generatePrefixedId } from '@realriches/utils';
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
        price: listing.price,
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
        type: input.type,
        templateId: input.templateId,
        status: 'completed',
        fileUrl: result.data.fileUrl,
        metadata: {
          customizations: input.customizations,
          listingTitle: listing.title,
          propertyAddress: listing.unit.property.address,
          generatedAt: result.data.generatedAt.toISOString(),
          fileSize: result.data.fileSize,
          mimeType: result.data.mimeType,
          isMock: result.meta?.isMock,
        },
        createdById: request.user.id,
      },
    });

    // Audit log
    await this.app.writeAuditLog?.(request, 'marketing.asset.generated', {
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
        url: fileUrl,
        thumbnailUrl,
        title: input.title,
        description: input.description,
        order: input.order || 0,
        metadata: {
          storageKey: key,
          etag: uploadResult.etag,
          size: uploadResult.size,
        },
        uploadedById: request.user.id,
      },
    });

    // Audit log
    await this.app.writeAuditLog?.(request, 'marketing.media.uploaded', {
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

    // Get property with media
    const property = await prisma.property.findUnique({
      where: { id: input.propertyId },
      include: { media: { where: { type: { in: ['photo', 'video'] } } } },
    });

    if (!property) {
      return { success: false, error: { code: 'NOT_FOUND', message: 'Property not found' } };
    }

    if (property.ownerId !== request.user.id && request.user.role !== 'admin') {
      return { success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } };
    }

    // Start video generation
    const videoProvider = this.registry.getVideoProvider();
    const result = await videoProvider.startGeneration({
      propertyId: input.propertyId,
      style: input.style || 'cinematic',
      duration: 60,
      sourceImages: property.media.map((m) => m.url),
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
        url: '', // Will be populated when generation completes
        title: 'AI-Generated Video Tour',
        description: `Style: ${input.style || 'cinematic'}`,
        metadata: {
          jobId: result.data.id,
          status: result.data.status,
          style: input.style,
          musicTrack: input.musicTrack,
          voiceoverScript: input.voiceoverScript,
          isMock: result.meta?.isMock,
        },
        uploadedById: request.user.id,
      },
    });

    // Audit log
    await this.app.writeAuditLog?.(request, 'marketing.video.generation_started', {
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
        url: '', // Will be populated when processing completes
        title: '3D Virtual Tour',
        metadata: {
          jobId: result.data.id,
          status: result.data.status,
          technology: '3DGS',
          sourceImageCount: input.sourceImages.length,
          quality: input.quality,
          isMock: result.meta?.isMock,
        },
        uploadedById: request.user.id,
      },
    });

    // Audit log
    await this.app.writeAuditLog?.(request, 'marketing.3dgs.generation_started', {
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
    if (!template.isPremium || !template.price) {
      await prisma.marketingTemplate.update({
        where: { id: template.id },
        data: { downloads: { increment: 1 } },
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

      const customerId = await getOrCreateCustomer(
        user.id,
        user.email,
        `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        user.stripeCustomerId
      );

      // Update user with Stripe customer ID if new
      if (!user.stripeCustomerId) {
        await prisma.user.update({
          where: { id: user.id },
          data: { stripeCustomerId: customerId },
        });
      }

      // Create payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: template.price, // Already in cents
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
          data: { downloads: { increment: 1 } },
        });

        // Audit log
        await this.app.writeAuditLog?.(request, 'marketing.template.purchased', {
          templateId: template.id,
          amount: template.price,
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
