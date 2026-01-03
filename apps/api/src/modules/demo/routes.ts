/**
 * Demo Routes
 *
 * Public demo endpoints for showcasing collateral generation.
 * No authentication required.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createHash } from 'crypto';

// ============================================================================
// Demo Fixtures
// ============================================================================

const DEMO_LISTING = {
  id: 'demo-listing-001',
  title: 'Stunning 2BR Apartment in Chelsea',
  address: {
    street: '456 West 23rd Street',
    unit: '4B',
    city: 'New York',
    state: 'NY',
    zip: '10011',
  },
  rent: 3500,
  bedrooms: 2,
  bathrooms: 1,
  squareFeet: 950,
  availableDate: new Date('2026-02-01'),
  description: 'Sun-drenched 2-bedroom apartment in the heart of Chelsea. Features hardwood floors throughout, exposed brick, updated kitchen with stainless steel appliances, and in-unit washer/dryer. Just steps from the High Line, Chelsea Market, and excellent dining options.',
  amenities: [
    'In-unit Washer/Dryer',
    'Dishwasher',
    'Central A/C',
    'Hardwood Floors',
    'Exposed Brick',
    'Roof Deck',
    'Pets Allowed',
    'Doorman',
  ],
  photos: [
    'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200',
    'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200',
    'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=1200',
  ],
  marketId: 'NYC_STRICT',
  propertyType: 'apartment',
  yearBuilt: 1925,
  petPolicy: 'Cats and small dogs allowed with pet deposit',
};

const DEMO_TEMPLATE = {
  id: 'demo-template-001',
  name: 'Modern Flyer',
  type: 'flyer',
  source: 'system',
  version: '1.0.0',
  requiredComplianceBlocks: [
    'nyc_fare_act_disclosure',
    'nyc_fare_fee_disclosure',
    'fair_housing_notice',
  ],
  supportedFormats: ['pdf', 'pptx', 'instagram_square', 'instagram_story'],
};

const NYC_COMPLIANCE_BLOCKS = [
  {
    blockId: 'nyc_fare_act_disclosure',
    blockType: 'fare_act_disclosure',
    version: '1.0.0',
    content: 'FARE Act Notice: No broker fee may be charged to tenants for this listing. Income requirements capped at 40x monthly rent.',
    position: 'footer',
    isRemovable: false,
  },
  {
    blockId: 'nyc_fare_fee_disclosure',
    blockType: 'fare_fee_disclosure',
    version: '1.0.0',
    content: 'This is a no-fee listing. Security deposit limited to one month rent.',
    position: 'footer',
    isRemovable: false,
  },
  {
    blockId: 'fair_housing_notice',
    blockType: 'fair_housing',
    version: '1.0.0',
    content: 'Equal Housing Opportunity. We do not discriminate on the basis of race, color, religion, sex, national origin, disability, or familial status.',
    position: 'footer',
    isRemovable: false,
  },
];

// ============================================================================
// Routes
// ============================================================================

export async function demoRoutes(app: FastifyInstance): Promise<void> {
  // ==========================================================================
  // Demo Collateral Generation
  // ==========================================================================

  app.get(
    '/collateral',
    {
      schema: {
        description: 'Demo collateral generation - shows PDF preview with compliance locks',
        tags: ['Demo'],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const format = (request.query as { format?: string }).format || 'pdf';

      // Generate demo output with watermark
      const inputHash = createHash('sha256')
        .update(JSON.stringify({
          listingId: DEMO_LISTING.id,
          templateId: DEMO_TEMPLATE.id,
          templateVersion: DEMO_TEMPLATE.version,
          format,
        }))
        .digest('hex');

      const outputChecksum = createHash('sha256')
        .update(JSON.stringify({
          ...DEMO_LISTING,
          generatedAt: new Date().toISOString(),
          format,
          watermarked: true,
        }))
        .digest('hex');

      return reply.send({
        success: true,
        data: {
          demo: true,
          watermarked: true,
          listing: {
            id: DEMO_LISTING.id,
            title: DEMO_LISTING.title,
            address: DEMO_LISTING.address,
            rent: DEMO_LISTING.rent,
            bedrooms: DEMO_LISTING.bedrooms,
            bathrooms: DEMO_LISTING.bathrooms,
            squareFeet: DEMO_LISTING.squareFeet,
            marketId: DEMO_LISTING.marketId,
          },
          template: {
            id: DEMO_TEMPLATE.id,
            name: DEMO_TEMPLATE.name,
            type: DEMO_TEMPLATE.type,
            version: DEMO_TEMPLATE.version,
          },
          generation: {
            format,
            fileUrl: `https://demo.realriches.com/collateral/demo-${format}-${Date.now()}.${format === 'pptx' ? 'pptx' : format.includes('instagram') || format.includes('facebook') ? 'jpg' : 'pdf'}`,
            fileSize: format === 'pdf' ? 245000 : format === 'pptx' ? 520000 : 180000,
            checksum: outputChecksum,
            inputHash,
          },
          complianceBlocksApplied: NYC_COMPLIANCE_BLOCKS.map(b => ({
            blockId: b.blockId,
            blockType: b.blockType,
            version: b.version,
            position: b.position,
            isRemovable: b.isRemovable,
          })),
          evidence: {
            templateVersion: DEMO_TEMPLATE.version,
            marketPackId: 'NYC_STRICT',
            marketPackVersion: '1.0.0',
            inputHash,
            outputChecksum,
            generatedAt: new Date().toISOString(),
          },
        },
      });
    }
  );

  // ==========================================================================
  // Demo Social Crop Preview
  // ==========================================================================

  app.get(
    '/collateral/social-preview',
    {
      schema: {
        description: 'Demo social media crop preview',
        tags: ['Demo'],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const formats = [
        { format: 'instagram_square', width: 1080, height: 1080 },
        { format: 'instagram_story', width: 1080, height: 1920 },
        { format: 'facebook_post', width: 1200, height: 630 },
        { format: 'twitter_post', width: 1200, height: 675 },
        { format: 'linkedin_post', width: 1200, height: 627 },
        { format: 'pinterest_pin', width: 1000, height: 1500 },
        { format: 'tiktok_video', width: 1080, height: 1920 },
      ];

      const results = formats.map(({ format, width, height }) => ({
        format,
        dimensions: { width, height },
        previewUrl: `https://demo.realriches.com/collateral/demo-${format}-${Date.now()}.jpg`,
        checksum: createHash('sha256').update(`${format}-${DEMO_LISTING.id}`).digest('hex'),
        complianceFooterIncluded: true,
      }));

      return reply.send({
        success: true,
        data: {
          demo: true,
          watermarked: true,
          listing: {
            id: DEMO_LISTING.id,
            title: DEMO_LISTING.title,
            address: `${DEMO_LISTING.address.street} #${DEMO_LISTING.address.unit}`,
            rent: DEMO_LISTING.rent,
          },
          socialCrops: results,
          complianceNote: 'All social crops include compliance footer with Equal Housing Opportunity notice',
        },
      });
    }
  );

  // ==========================================================================
  // Demo Compliance Example (NYC vs non-NYC)
  // ==========================================================================

  app.get(
    '/collateral/compliance-example',
    {
      schema: {
        description: 'Compare NYC strict compliance vs standard market',
        tags: ['Demo'],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return reply.send({
        success: true,
        data: {
          demo: true,
          comparison: {
            nycStrict: {
              marketPackId: 'NYC_STRICT',
              marketPackVersion: '1.0.0',
              isStrictMarket: true,
              requiredBlocks: NYC_COMPLIANCE_BLOCKS,
              lockedBlocks: [
                'nyc_fare_act_disclosure',
                'nyc_fare_fee_disclosure',
                'fair_housing_notice',
              ],
              rules: {
                brokerFeeToTenant: false,
                maxIncomeRequirement: '40x rent',
                maxCreditScore: 650,
                securityDepositMax: '1 month rent',
              },
              enforcement: {
                canRemoveBlocks: false,
                canHideWithCSS: false,
                minFontSizePx: 8,
                requiresContrastCheck: true,
              },
            },
            standard: {
              marketPackId: 'US_STANDARD',
              marketPackVersion: '1.0.0',
              isStrictMarket: false,
              requiredBlocks: [
                {
                  blockId: 'fair_housing_notice',
                  blockType: 'fair_housing',
                  version: '1.0.0',
                  isRemovable: false,
                },
              ],
              lockedBlocks: ['fair_housing_notice'],
              rules: {
                brokerFeeToTenant: true,
                maxIncomeRequirement: 'No limit',
                maxCreditScore: 'No limit',
                securityDepositMax: 'Varies by state',
              },
              enforcement: {
                canRemoveBlocks: false,
                canHideWithCSS: false,
                minFontSizePx: 6,
                requiresContrastCheck: false,
              },
            },
          },
          note: 'NYC FARE Act (2024) requires specific disclosure blocks that cannot be removed or hidden in collateral materials.',
        },
      });
    }
  );

  // ==========================================================================
  // Demo Batch Generation
  // ==========================================================================

  app.get(
    '/collateral/batch',
    {
      schema: {
        description: 'Demo batch generation - shows all formats generated in parallel',
        tags: ['Demo'],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const batchId = `demo-batch-${Date.now()}`;
      const startTime = Date.now();

      const formats = ['pdf', 'pptx', 'instagram_square', 'instagram_story', 'facebook_post'];
      const results: Record<string, { fileUrl: string; checksum: string; fileSize: number }> = {};

      for (const format of formats) {
        results[format] = {
          fileUrl: `https://demo.realriches.com/collateral/${batchId}-${format}.${format === 'pdf' ? 'pdf' : format === 'pptx' ? 'pptx' : 'jpg'}`,
          checksum: createHash('sha256').update(`${batchId}-${format}`).digest('hex'),
          fileSize: format === 'pdf' ? 245000 : format === 'pptx' ? 520000 : 180000,
        };
      }

      const duration = Date.now() - startTime + Math.floor(Math.random() * 500) + 200; // Simulate 200-700ms

      return reply.send({
        success: true,
        data: {
          demo: true,
          batchId,
          status: 'completed',
          duration,
          formatsGenerated: formats.length,
          targetDuration: '< 60 seconds',
          results,
          complianceBlocksApplied: NYC_COMPLIANCE_BLOCKS.map(b => b.blockId),
          evidence: {
            inputHash: createHash('sha256').update(JSON.stringify({
              listingId: DEMO_LISTING.id,
              templateId: DEMO_TEMPLATE.id,
              formats,
            })).digest('hex'),
            generatedAt: new Date().toISOString(),
          },
        },
      });
    }
  );
}

export default demoRoutes;
