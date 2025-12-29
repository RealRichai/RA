import { z } from 'zod';
import { AuditFieldsSchema, UUIDSchema } from './common';

// ============================================================================
// Marketing & Media Types
// ============================================================================

export const MarketingAssetTypeSchema = z.enum([
  'flyer',
  'brochure',
  'presentation',
  'one_pager',
  'social_post',
  'email_template',
  'video',
  'photo',
  'floor_plan',
  'virtual_tour',
  '3d_model',
  'website_banner',
]);
export type MarketingAssetType = z.infer<typeof MarketingAssetTypeSchema>;

export const MediaTypeSchema = z.enum([
  'image',
  'video',
  'virtual_tour',
  '3d_model', // 3DGS
  'floor_plan',
  'drone',
  'twilight',
  'staging_virtual',
]);
export type MediaType = z.infer<typeof MediaTypeSchema>;

// Marketing Asset (Generated content)
export const MarketingAssetSchema = z.object({
  id: UUIDSchema,
  organizationId: UUIDSchema.optional(),
  createdBy: UUIDSchema,

  // Asset info
  name: z.string(),
  type: MarketingAssetTypeSchema,
  description: z.string().optional(),

  // Source
  propertyId: UUIDSchema.optional(),
  listingId: UUIDSchema.optional(),
  templateId: UUIDSchema.optional(),

  // Content
  format: z.enum(['pdf', 'png', 'jpg', 'mp4', 'html', 'pptx', 'docx']),
  fileUrl: z.string(),
  thumbnailUrl: z.string().optional(),
  previewUrl: z.string().optional(),

  // Dimensions (for images/videos)
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  duration: z.number().optional(), // Seconds for video

  // Generation info
  generatedWith: z.enum(['manual', 'ai', 'template']),
  aiPrompt: z.string().optional(),
  generationParams: z.record(z.unknown()).optional(),

  // Brand settings used
  brandingApplied: z.boolean().default(false),
  brandColors: z.array(z.string()).optional(),
  logoUrl: z.string().optional(),

  // Status
  status: z.enum(['draft', 'generating', 'ready', 'published', 'archived']),

  // Publishing
  publishedTo: z.array(z.enum([
    'website',
    'zillow',
    'trulia',
    'streeteasy',
    'facebook',
    'instagram',
    'twitter',
    'linkedin',
  ])).default([]),

  // Analytics
  viewCount: z.number().int().default(0),
  downloadCount: z.number().int().default(0),
  shareCount: z.number().int().default(0),

  // Tags
  tags: z.array(z.string()).default([]),

  metadata: z.record(z.unknown()).optional(),
}).merge(AuditFieldsSchema);
export type MarketingAsset = z.infer<typeof MarketingAssetSchema>;

// Marketing Template
export const MarketingTemplateSchema = z.object({
  id: UUIDSchema,
  organizationId: UUIDSchema.optional(),
  createdBy: UUIDSchema,

  name: z.string(),
  description: z.string().optional(),
  type: MarketingAssetTypeSchema,
  category: z.string().optional(),

  // Template file
  format: z.enum(['pdf', 'pptx', 'docx', 'html', 'figma', 'canva']),
  templateUrl: z.string(),
  thumbnailUrl: z.string().optional(),

  // Dimensions
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  orientation: z.enum(['portrait', 'landscape', 'square']).optional(),

  // Customizable areas
  editableFields: z.array(z.object({
    id: z.string(),
    name: z.string(),
    type: z.enum(['text', 'image', 'color', 'logo']),
    placeholder: z.string().optional(),
    defaultValue: z.string().optional(),
    position: z.object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
      page: z.number().int().optional(),
    }).optional(),
  })).default([]),

  // Branding
  supportsCustomBranding: z.boolean().default(true),
  requiredBrandElements: z.array(z.string()).default([]),

  // Marketplace
  isPublic: z.boolean().default(false),
  isPremium: z.boolean().default(false),
  price: z.number().optional(), // In cents
  purchaseCount: z.number().int().default(0),

  // Usage
  usageCount: z.number().int().default(0),
  rating: z.number().min(0).max(5).optional(),
  reviewCount: z.number().int().default(0),

  tags: z.array(z.string()).default([]),

  metadata: z.record(z.unknown()).optional(),
}).merge(AuditFieldsSchema);
export type MarketingTemplate = z.infer<typeof MarketingTemplateSchema>;

// Media asset (photos, videos, tours)
export const PropertyMediaSchema = z.object({
  id: UUIDSchema,
  propertyId: UUIDSchema,
  unitId: UUIDSchema.optional(),
  listingId: UUIDSchema.optional(),
  uploadedBy: UUIDSchema,

  type: MediaTypeSchema,
  format: z.string(), // MIME type or extension
  url: z.string(),
  thumbnailUrl: z.string().optional(),

  // Metadata
  filename: z.string(),
  originalFilename: z.string(),
  size: z.number().int(), // bytes
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  duration: z.number().optional(), // Seconds

  // Organization
  caption: z.string().optional(),
  altText: z.string().optional(),
  roomType: z.string().optional(),
  order: z.number().int().default(0),
  isPrimary: z.boolean().default(false),
  isFeatured: z.boolean().default(false),

  // For virtual tours/3D
  tourProvider: z.enum(['matterport', 'zillow_3d', 'custom', 'realriches']).optional(),
  tourId: z.string().optional(),
  embedCode: z.string().optional(),

  // For 3DGS/VR
  is3DGS: z.boolean().default(false),
  model3dUrl: z.string().optional(),
  vrEnabled: z.boolean().default(false),

  // AI processing
  aiAnalyzed: z.boolean().default(false),
  aiTags: z.array(z.string()).default([]),
  aiDescription: z.string().optional(),
  aiQualityScore: z.number().min(0).max(100).optional(),

  // Enhancement
  isEnhanced: z.boolean().default(false),
  enhancementType: z.array(z.string()).default([]),
  originalUrl: z.string().optional(), // Before enhancement

  // Status
  status: z.enum(['processing', 'ready', 'failed', 'deleted']),
  processingError: z.string().optional(),

  metadata: z.record(z.unknown()).optional(),
}).merge(AuditFieldsSchema);
export type PropertyMedia = z.infer<typeof PropertyMediaSchema>;

// Video tour
export const VideoTourSchema = z.object({
  id: UUIDSchema,
  propertyId: UUIDSchema,
  listingId: UUIDSchema.optional(),
  createdBy: UUIDSchema,

  title: z.string(),
  description: z.string().optional(),

  type: z.enum([
    'walkthrough',
    'cinematic',
    'highlight_reel',
    'drone',
    'neighborhood',
    'agent_intro',
  ]),

  // Video details
  videoUrl: z.string(),
  thumbnailUrl: z.string().optional(),
  duration: z.number(), // Seconds
  resolution: z.enum(['720p', '1080p', '4k']),
  format: z.string(),

  // Production
  isGenerated: z.boolean().default(false),
  generationPrompt: z.string().optional(),
  musicTrack: z.string().optional(),
  voiceoverEnabled: z.boolean().default(false),
  voiceoverText: z.string().optional(),

  // Branding
  hasIntro: z.boolean().default(false),
  hasOutro: z.boolean().default(false),
  hasBranding: z.boolean().default(false),
  brandingSettings: z.object({
    logoUrl: z.string().optional(),
    colors: z.array(z.string()).optional(),
    contactInfo: z.string().optional(),
  }).optional(),

  // Chapters/segments
  chapters: z.array(z.object({
    title: z.string(),
    startTime: z.number(),
    endTime: z.number(),
    thumbnail: z.string().optional(),
  })).default([]),

  // Publishing
  publishedTo: z.array(z.string()).default([]),
  youtubeId: z.string().optional(),
  vimeoId: z.string().optional(),

  // Analytics
  viewCount: z.number().int().default(0),
  avgWatchTime: z.number().optional(),
  completionRate: z.number().optional(),

  status: z.enum(['processing', 'ready', 'published', 'archived']),

  metadata: z.record(z.unknown()).optional(),
}).merge(AuditFieldsSchema);
export type VideoTour = z.infer<typeof VideoTourSchema>;

// Flyer/Brochure generation request
export const GenerateMarketingAssetRequestSchema = z.object({
  type: MarketingAssetTypeSchema,
  templateId: UUIDSchema.optional(),
  propertyId: UUIDSchema.optional(),
  listingId: UUIDSchema.optional(),

  // Content to include
  content: z.object({
    headline: z.string().optional(),
    description: z.string().optional(),
    highlights: z.array(z.string()).optional(),
    amenities: z.array(z.string()).optional(),
    price: z.string().optional(),
    bedrooms: z.number().int().optional(),
    bathrooms: z.number().optional(),
    squareFeet: z.number().int().optional(),
  }).optional(),

  // Images to use
  imageIds: z.array(UUIDSchema).optional(),
  floorPlanId: UUIDSchema.optional(),

  // Branding
  brandingSettings: z.object({
    logoUrl: z.string().optional(),
    primaryColor: z.string().optional(),
    secondaryColor: z.string().optional(),
    fontFamily: z.string().optional(),
    agentPhoto: z.string().optional(),
    agentName: z.string().optional(),
    agentPhone: z.string().optional(),
    agentEmail: z.string().optional(),
    companyName: z.string().optional(),
    disclaimers: z.array(z.string()).optional(),
  }).optional(),

  // AI generation
  useAI: z.boolean().default(false),
  aiPrompt: z.string().optional(),
  tone: z.enum(['professional', 'luxury', 'friendly', 'modern', 'classic']).optional(),

  // Output
  format: z.enum(['pdf', 'png', 'jpg']).optional(),
  size: z.enum(['letter', 'a4', 'square', 'wide']).optional(),
});
export type GenerateMarketingAssetRequest = z.infer<typeof GenerateMarketingAssetRequestSchema>;

// Template marketplace
export const TemplateMarketplaceItemSchema = z.object({
  id: UUIDSchema,
  templateId: UUIDSchema,
  sellerId: UUIDSchema,

  // Listing info
  title: z.string(),
  description: z.string(),
  category: z.string(),
  tags: z.array(z.string()),

  // Previews
  thumbnailUrl: z.string(),
  previewImages: z.array(z.string()),
  demoUrl: z.string().optional(),

  // Pricing
  isFree: z.boolean().default(false),
  price: z.number().optional(), // Cents
  discountPrice: z.number().optional(),
  discountEnds: z.coerce.date().optional(),

  // Stats
  purchaseCount: z.number().int().default(0),
  rating: z.number().min(0).max(5).optional(),
  reviewCount: z.number().int().default(0),

  // Status
  status: z.enum(['active', 'inactive', 'pending_review', 'rejected']),
  isFeatured: z.boolean().default(false),

  metadata: z.record(z.unknown()).optional(),
}).merge(AuditFieldsSchema);
export type TemplateMarketplaceItem = z.infer<typeof TemplateMarketplaceItemSchema>;
