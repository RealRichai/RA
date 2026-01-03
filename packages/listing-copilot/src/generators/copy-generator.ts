/**
 * Copy Generator
 *
 * Generates optimized listing copy using LLM with market-aware prompts.
 */

import { createHash } from 'crypto';
import type {
  ListingDraft,
  PropertyFacts,
  OptimizedListingCopy,
  CopyGenerationError as CopyGenError,
} from '../types';
import { CopyGenerationError } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface CopyGeneratorConfig {
  maxTokens: number;
  temperature: number;
  model: string;
}

export interface CopyGeneratorDeps {
  /**
   * AI client complete function.
   * This is injected to allow mocking in tests.
   */
  aiComplete: (request: {
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    model: string;
    config?: { maxTokens?: number; temperature?: number };
    context?: { marketId?: string; entityType?: string };
  }) => Promise<{
    content: string;
    tokensUsed: { prompt: number; completion: number; total: number };
  }>;
}

export interface CopyGeneratorInput {
  listingDraft: ListingDraft;
  propertyFacts: PropertyFacts;
  marketId: string;
  tenantId: string;
}

// ============================================================================
// Market-Specific Prompts
// ============================================================================

const NYC_DISCLOSURE_PROMPT = `
IMPORTANT NYC COMPLIANCE REQUIREMENTS:
- If the listing has a broker fee paid by tenant, you MUST include clear disclosure
- Include FARE Act compliant language if broker represents landlord but fee is paid by tenant
- Mention any rent stabilization status if applicable
- Include required disclosures about building amenities and pet policies
`;

const STANDARD_PROMPT = `
Include any required local disclosures based on the market.
`;

function getMarketPrompt(marketId: string): string {
  if (marketId.toLowerCase().includes('nyc') || marketId.toLowerCase().includes('new_york')) {
    return NYC_DISCLOSURE_PROMPT;
  }
  return STANDARD_PROMPT;
}

// ============================================================================
// System Prompt
// ============================================================================

function buildSystemPrompt(marketId: string): string {
  return `You are an expert real estate listing copywriter. Your task is to create compelling,
SEO-optimized listing descriptions that highlight property features while maintaining compliance
with local regulations.

Your output MUST be valid JSON with the following structure:
{
  "title": "A compelling headline (max 100 chars)",
  "description": "Detailed property description (200-500 words)",
  "highlights": ["Feature 1", "Feature 2", "Feature 3", "Feature 4", "Feature 5"],
  "seoKeywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "disclosureText": "Any required market-specific disclosures (if applicable)"
}

${getMarketPrompt(marketId)}

GUIDELINES:
- Be accurate and honest about property features
- Use active voice and compelling language
- Include neighborhood highlights and transit information
- Optimize for search engines while remaining natural
- Never exaggerate or misrepresent property features
- Include any legally required disclosures for the market`;
}

// ============================================================================
// User Prompt Builder
// ============================================================================

function buildUserPrompt(input: CopyGeneratorInput): string {
  const { listingDraft, propertyFacts } = input;

  const propertyInfo = [
    `Property Type: ${listingDraft.propertyType}`,
    `Bedrooms: ${listingDraft.bedrooms}`,
    `Bathrooms: ${listingDraft.bathrooms}`,
    listingDraft.squareFeet ? `Square Feet: ${listingDraft.squareFeet}` : null,
    `Monthly Rent: $${listingDraft.monthlyRent.toLocaleString()}`,
    `Address: ${listingDraft.address.street}, ${listingDraft.address.city}, ${listingDraft.address.state} ${listingDraft.address.zipCode}`,
    listingDraft.unit ? `Unit: ${listingDraft.address.unit}` : null,
  ].filter(Boolean).join('\n');

  const amenitiesInfo = listingDraft.amenities.length > 0
    ? `Amenities: ${listingDraft.amenities.join(', ')}`
    : 'No amenities listed';

  const factsInfo = [
    propertyFacts.yearBuilt ? `Year Built: ${propertyFacts.yearBuilt}` : null,
    propertyFacts.parkingSpaces ? `Parking: ${propertyFacts.parkingSpaces} spaces` : null,
    propertyFacts.laundryType ? `Laundry: ${propertyFacts.laundryType}` : null,
    propertyFacts.petPolicy ? `Pets: ${propertyFacts.petPolicy}` : null,
    propertyFacts.nearbyTransit?.length ? `Transit: ${propertyFacts.nearbyTransit.join(', ')}` : null,
    propertyFacts.neighborhoodHighlights?.length
      ? `Neighborhood: ${propertyFacts.neighborhoodHighlights.join(', ')}`
      : null,
    propertyFacts.availableDate ? `Available: ${propertyFacts.availableDate}` : null,
    propertyFacts.leaseTermMonths ? `Lease Term: ${propertyFacts.leaseTermMonths} months` : null,
  ].filter(Boolean).join('\n');

  const brokerInfo = listingDraft.hasBrokerFee
    ? `Broker Fee: $${listingDraft.brokerFeeAmount?.toLocaleString() ?? 'TBD'} paid by ${listingDraft.brokerFeePaidBy ?? 'TBD'}`
    : 'No broker fee';

  const rentStabilizedInfo = propertyFacts.isRentStabilized
    ? `Rent Stabilized: Yes (Legal Rent: $${propertyFacts.legalRentAmount?.toLocaleString() ?? 'N/A'})`
    : '';

  return `Create an optimized listing for the following property:

${propertyInfo}

${amenitiesInfo}

${factsInfo}

${brokerInfo}

${rentStabilizedInfo}

${listingDraft.title ? `Current Title: ${listingDraft.title}` : ''}
${listingDraft.description ? `Current Description: ${listingDraft.description}` : ''}

Please generate an optimized listing with a compelling title, detailed description,
key highlights, SEO keywords, and any required disclosures.`;
}

// ============================================================================
// Response Parser
// ============================================================================

interface ParsedCopyResponse {
  title: string;
  description: string;
  highlights: string[];
  seoKeywords: string[];
  disclosureText?: string;
}

function parseResponse(content: string): ParsedCopyResponse {
  // Try to extract JSON from the response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new CopyGenerationError('Failed to extract JSON from LLM response', {
      content: content.substring(0, 500),
    });
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as ParsedCopyResponse;

    // Validate required fields
    if (!parsed.title || typeof parsed.title !== 'string') {
      throw new Error('Missing or invalid title');
    }
    if (!parsed.description || typeof parsed.description !== 'string') {
      throw new Error('Missing or invalid description');
    }
    if (!Array.isArray(parsed.highlights)) {
      parsed.highlights = [];
    }
    if (!Array.isArray(parsed.seoKeywords)) {
      parsed.seoKeywords = [];
    }

    return parsed;
  } catch (error) {
    throw new CopyGenerationError(
      `Failed to parse LLM response: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { content: content.substring(0, 500) }
    );
  }
}

// ============================================================================
// Copy Generator Class
// ============================================================================

export class CopyGenerator {
  private config: CopyGeneratorConfig;
  private deps: CopyGeneratorDeps;

  constructor(deps: CopyGeneratorDeps, config?: Partial<CopyGeneratorConfig>) {
    this.deps = deps;
    this.config = {
      maxTokens: config?.maxTokens ?? 2048,
      temperature: config?.temperature ?? 0.7,
      model: config?.model ?? 'claude-3-5-sonnet',
    };
  }

  /**
   * Generate optimized listing copy.
   */
  async generate(input: CopyGeneratorInput): Promise<OptimizedListingCopy> {
    const systemPrompt = buildSystemPrompt(input.marketId);
    const userPrompt = buildUserPrompt(input);

    // Compute prompt hash for audit trail
    const promptHash = createHash('sha256')
      .update(systemPrompt + userPrompt)
      .digest('hex')
      .substring(0, 32);

    try {
      const response = await this.deps.aiComplete({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        model: this.config.model,
        config: {
          maxTokens: this.config.maxTokens,
          temperature: this.config.temperature,
        },
        context: {
          marketId: input.marketId,
          entityType: 'listing',
        },
      });

      const parsed = parseResponse(response.content);

      return {
        title: parsed.title,
        description: parsed.description,
        highlights: parsed.highlights,
        seoKeywords: parsed.seoKeywords,
        disclosureText: parsed.disclosureText,
        promptHash,
        tokensUsed: response.tokensUsed.total,
      };
    } catch (error) {
      if (error instanceof CopyGenerationError) {
        throw error;
      }
      throw new CopyGenerationError(
        `LLM call failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { promptHash }
      );
    }
  }
}
