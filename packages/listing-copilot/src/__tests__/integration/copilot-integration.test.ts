/**
 * Copilot Integration Tests
 *
 * Integration tests for the full Listing Copilot workflow.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListingCopilotWorkflow } from '../../workflow/listing-copilot-workflow';
import { CopyGenerator } from '../../generators/copy-generator';
import { ArtifactOrchestrator } from '../../generators/artifact-orchestrator';
import { CopilotComplianceGate } from '../../compliance/copilot-compliance-gate';
import { ChannelSimulator } from '../../channels/channel-simulator';
import { DefaultTemplateLoader } from '../../templates/template-loader';
import { CopilotEvidenceEmitter } from '../../evidence/copilot-evidence';
import type { CopilotInput } from '../../types';

describe('Copilot Integration', () => {
  let workflow: ListingCopilotWorkflow;

  // Mock AI client
  const mockAiComplete = vi.fn().mockResolvedValue({
    content: JSON.stringify({
      title: 'Stunning 2BR in Manhattan',
      description: 'Beautiful apartment with city views and modern amenities.',
      highlights: ['Modern kitchen', 'Hardwood floors', 'City views', 'In-unit laundry'],
      seoKeywords: ['manhattan apartment', 'nyc rental', 'two bedroom'],
      disclosureText: 'A broker fee of one month rent applies, paid by tenant.',
    }),
    tokensUsed: { prompt: 500, completion: 200, total: 700 },
  });

  // Mock PDF generator
  const mockPdfGenerator = {
    generate: vi.fn().mockResolvedValue(Buffer.from('%PDF-1.4 mock pdf content')),
  };

  // Mock PPTX generator
  const mockPptxGenerator = {
    generate: vi.fn().mockResolvedValue(Buffer.from('PK mock pptx content')),
  };

  // Mock vault service
  const mockVaultService = {
    store: vi.fn().mockResolvedValue({ vaultPath: '/artifacts/test.pdf' }),
  };

  // Mock compliance gate
  const mockGateListingPublish = vi.fn().mockResolvedValue({
    allowed: true,
    decision: {
      passed: true,
      violations: [],
      marketPack: 'NYC_STRICT_V1',
      marketPackVersion: '1.0.0',
      checksPerformed: ['fare_act', 'broker_fee', 'disclosures'],
    },
  });

  const createTestInput = (): CopilotInput => ({
    listingDraft: {
      id: 'listing-123',
      propertyType: 'apartment',
      bedrooms: 2,
      bathrooms: 1.5,
      squareFeet: 950,
      monthlyRent: 4500,
      address: {
        street: '350 5th Avenue',
        unit: '12A',
        city: 'New York',
        state: 'NY',
        zipCode: '10118',
      },
      amenities: ['Dishwasher', 'Hardwood floors', 'Central AC', 'Doorman'],
      images: ['https://example.com/image1.jpg', 'https://example.com/image2.jpg'],
      hasBrokerFee: true,
      brokerFeeAmount: 4500,
      brokerFeePaidBy: 'tenant',
      agentRepresentation: 'landlord',
    },
    propertyFacts: {
      yearBuilt: 2018,
      parkingSpaces: 0,
      laundryType: 'in_unit',
      petPolicy: 'case_by_case',
      nearbyTransit: ['N/Q/R at 34th St', 'B/D/F/M at 34th St'],
      neighborhoodHighlights: ['Empire State Building', 'Bryant Park'],
      leaseTermMonths: 12,
      availableDate: '2026-02-01',
      securityDeposit: 4500,
    },
    marketId: 'nyc',
    tenantId: 'tenant-org-123',
    options: {
      dryRun: true,
      channels: ['zillow', 'streeteasy'],
    },
  });

  beforeEach(() => {
    vi.clearAllMocks();

    const copyGenerator = new CopyGenerator({ aiComplete: mockAiComplete });
    const artifactOrchestrator = new ArtifactOrchestrator({
      pdfGenerator: mockPdfGenerator,
      pptxGenerator: mockPptxGenerator,
      vaultService: mockVaultService,
    });
    const complianceGate = new CopilotComplianceGate({
      gateListingPublish: mockGateListingPublish,
    });
    const channelSimulator = new ChannelSimulator();
    const templateLoader = new DefaultTemplateLoader();
    const evidenceEmitter = new CopilotEvidenceEmitter();

    workflow = new ListingCopilotWorkflow({
      copyGenerator,
      artifactOrchestrator,
      complianceGate,
      channelSimulator,
      templateLoader,
      evidenceEmitter,
    });
  });

  describe('full workflow execution', () => {
    it('should execute complete workflow and produce artifacts', async () => {
      const input = createTestInput();
      const result = await workflow.execute(input);

      expect(result.status).toBe('completed');
      expect(result.runId).toBeDefined();

      // Verify copy was generated
      expect(result.generatedCopy).toBeDefined();
      expect(result.generatedCopy?.title).toBe('Stunning 2BR in Manhattan');
      expect(result.generatedCopy?.highlights).toHaveLength(4);

      // Verify artifacts were generated
      expect(result.artifacts).toBeDefined();
      expect(mockPdfGenerator.generate).toHaveBeenCalled();
      expect(mockVaultService.store).toHaveBeenCalled();

      // Verify compliance was checked
      expect(result.complianceResult).toBeDefined();
      expect(result.complianceResult?.passed).toBe(true);

      // Verify channels were simulated
      expect(result.channelResults).toBeDefined();
      expect(result.channelResults).toHaveLength(2);

      // Verify evidence was recorded
      expect(result.evidence).toBeDefined();
      expect(result.evidence.promptHash).toBeDefined();
    });

    it('should call AI with market-aware prompt for NYC', async () => {
      const input = createTestInput();
      await workflow.execute(input);

      expect(mockAiComplete).toHaveBeenCalled();
      const callArgs = mockAiComplete.mock.calls[0][0];
      expect(callArgs.context.marketId).toBe('nyc');
    });

    it('should pass compliance gate input with broker fee details', async () => {
      const input = createTestInput();
      await workflow.execute(input);

      expect(mockGateListingPublish).toHaveBeenCalledWith(
        expect.objectContaining({
          hasBrokerFee: true,
          brokerFeeAmount: 4500,
          brokerFeePaidBy: 'tenant',
          agentRepresentation: 'landlord',
          monthlyRent: 4500,
        })
      );
    });

    it('should generate all three artifact types', async () => {
      const input = createTestInput();
      await workflow.execute(input);

      // PDF generator called for flyer and brochure
      expect(mockPdfGenerator.generate).toHaveBeenCalledTimes(2);

      // PPTX generator called for deck
      expect(mockPptxGenerator.generate).toHaveBeenCalledTimes(1);

      // All three stored in vault
      expect(mockVaultService.store).toHaveBeenCalledTimes(3);
    });

    it('should simulate posting to StreetEasy for NYC listings', async () => {
      const input = createTestInput();
      const result = await workflow.execute(input);

      const streetEasyResult = result.channelResults?.find(
        (r) => r.channel === 'streeteasy'
      );
      expect(streetEasyResult).toBeDefined();
      expect((streetEasyResult as any).wouldPost).toBe(true);
    });
  });

  describe('compliance blocking', () => {
    it('should block workflow when compliance fails', async () => {
      mockGateListingPublish.mockResolvedValueOnce({
        allowed: false,
        decision: {
          passed: false,
          violations: [
            {
              code: 'FARE_ACT_BROKER_FEE',
              message: 'FARE Act: Tenant cannot pay broker fee when agent represents landlord',
              severity: 'critical',
            },
          ],
          marketPack: 'NYC_STRICT_V1',
          marketPackVersion: '1.0.0',
          checksPerformed: ['fare_act'],
        },
        blockedReason: 'FARE Act violation',
      });

      const input = createTestInput();
      const result = await workflow.execute(input);

      expect(result.status).toBe('blocked');
      expect(result.complianceResult?.violations).toHaveLength(1);
      expect(result.complianceResult?.violations[0].code).toBe('FARE_ACT_BROKER_FEE');

      // Artifacts should not be generated when blocked
      expect(mockPdfGenerator.generate).not.toHaveBeenCalled();
    });
  });

  describe('dry-run vs actual publishing', () => {
    it('should simulate when dryRun is true (default)', async () => {
      const input = {
        ...createTestInput(),
        options: { dryRun: true, channels: ['zillow'] as any },
      };
      const result = await workflow.execute(input);

      expect(result.channelResults).toBeDefined();
      expect((result.channelResults as any)[0].wouldPost).toBeDefined();
    });

    it('should not include channel results when no channels specified', async () => {
      const input = {
        ...createTestInput(),
        options: { dryRun: true, channels: [] as any },
      };
      const result = await workflow.execute(input);

      expect(result.channelResults).toHaveLength(0);
    });
  });

  describe('error handling', () => {
    it('should handle AI generation failure gracefully', async () => {
      mockAiComplete.mockRejectedValueOnce(new Error('AI service unavailable'));

      const input = createTestInput();
      const result = await workflow.execute(input);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('AI service unavailable');
    });

    it('should handle artifact generation failure', async () => {
      mockPdfGenerator.generate.mockRejectedValueOnce(new Error('PDF generation failed'));

      const input = createTestInput();
      const result = await workflow.execute(input);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('PDF generation failed');
    });
  });

  describe('evidence recording', () => {
    it('should include tool usage in evidence', async () => {
      const input = createTestInput();
      const result = await workflow.execute(input);

      expect(result.evidence.toolUsage.length).toBeGreaterThan(0);
      const tools = result.evidence.toolUsage.map((t) => t.tool);
      expect(tools).toContain('copy_generator');
    });

    it('should include policy gate results in evidence', async () => {
      const input = createTestInput();
      const result = await workflow.execute(input);

      expect(result.evidence.policyGateResults.length).toBeGreaterThan(0);
      expect(result.evidence.policyGateResults[0].gate).toBe('listing_publish');
    });

    it('should track budget consumption', async () => {
      const input = createTestInput();
      const result = await workflow.execute(input);

      expect(result.evidence.budgetConsumed).toBe(700);
    });
  });
});
