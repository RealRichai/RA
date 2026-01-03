/**
 * Workflow Tests
 *
 * Tests for the ListingCopilotWorkflow orchestrator.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListingCopilotWorkflow } from '../workflow/listing-copilot-workflow';
import type { CopilotInput } from '../types';
import { KillSwitchActiveError, BudgetExceededError, ComplianceBlockedError } from '../types';

describe('ListingCopilotWorkflow', () => {
  let mockCopyGenerator: ReturnType<typeof createMockCopyGenerator>;
  let mockArtifactOrchestrator: ReturnType<typeof createMockArtifactOrchestrator>;
  let mockComplianceGate: ReturnType<typeof createMockComplianceGate>;
  let mockChannelSimulator: ReturnType<typeof createMockChannelSimulator>;
  let mockTemplateLoader: ReturnType<typeof createMockTemplateLoader>;
  let mockEvidenceEmitter: ReturnType<typeof createMockEvidenceEmitter>;
  let workflow: ListingCopilotWorkflow;

  const createMockCopyGenerator = () => ({
    generate: vi.fn().mockResolvedValue({
      title: 'Beautiful 2BR Apartment',
      description: 'A stunning apartment in the heart of the city.',
      highlights: ['Modern kitchen', 'Hardwood floors', 'City views'],
      seoKeywords: ['apartment', 'rental', 'nyc'],
      disclosureText: 'Broker fee applies.',
      promptHash: 'abc123',
      tokensUsed: 1500,
    }),
  });

  const createMockArtifactOrchestrator = () => ({
    generateAll: vi.fn().mockResolvedValue({
      flyerPdf: {
        id: 'flyer-123',
        type: 'flyer_pdf',
        vaultPath: '/artifacts/flyer-123.pdf',
        contentType: 'application/pdf',
        checksum: 'sha256-abc',
        sizeBytes: 50000,
        generatedAt: new Date(),
        evidenceId: 'ev-flyer-123',
      },
    }),
  });

  const createMockComplianceGate = () => ({
    validate: vi.fn().mockResolvedValue({
      passed: true,
      violations: [],
      marketPack: 'NYC_STRICT_V1',
      marketPackVersion: '1.0.0',
      checksPerformed: ['fare_act', 'broker_fee', 'disclosures'],
      gatedAt: new Date(),
    }),
  });

  const createMockChannelSimulator = () => ({
    simulate: vi.fn().mockResolvedValue([]),
    publish: vi.fn().mockResolvedValue([]),
  });

  const createMockTemplateLoader = () => ({
    load: vi.fn().mockResolvedValue({
      id: 'default-flyer',
      type: 'flyer',
      content: '<html>{{listing.title}}</html>',
      isDefault: true,
    }),
  });

  const createMockEvidenceEmitter = () => ({
    reset: vi.fn(),
    recordToolUsage: vi.fn(),
    recordPolicyGate: vi.fn(),
    addArtifactEvidenceId: vi.fn(),
    buildRecord: vi.fn().mockReturnValue({
      runId: 'run-123',
      tenantId: 'tenant-123',
      promptHash: 'abc123',
      toolUsage: [],
      policyGateResults: [],
      artifactEvidenceIds: [],
      budgetConsumed: 1500,
      status: 'completed',
      timestamp: new Date(),
    }),
    emit: vi.fn().mockResolvedValue('evidence-123'),
  });

  const createTestInput = (): CopilotInput => ({
    listingDraft: {
      propertyType: 'apartment',
      bedrooms: 2,
      bathrooms: 1,
      monthlyRent: 3500,
      address: {
        street: '123 Main St',
        city: 'New York',
        state: 'NY',
        zipCode: '10001',
      },
      hasBrokerFee: true,
      brokerFeeAmount: 3500,
      brokerFeePaidBy: 'tenant',
    },
    propertyFacts: {
      yearBuilt: 2020,
      laundryType: 'in_unit',
      petPolicy: 'allowed',
    },
    marketId: 'nyc',
    tenantId: 'tenant-123',
  });

  beforeEach(() => {
    mockCopyGenerator = createMockCopyGenerator();
    mockArtifactOrchestrator = createMockArtifactOrchestrator();
    mockComplianceGate = createMockComplianceGate();
    mockChannelSimulator = createMockChannelSimulator();
    mockTemplateLoader = createMockTemplateLoader();
    mockEvidenceEmitter = createMockEvidenceEmitter();

    workflow = new ListingCopilotWorkflow({
      copyGenerator: mockCopyGenerator as any,
      artifactOrchestrator: mockArtifactOrchestrator as any,
      complianceGate: mockComplianceGate as any,
      channelSimulator: mockChannelSimulator as any,
      templateLoader: mockTemplateLoader as any,
      evidenceEmitter: mockEvidenceEmitter as any,
    });
  });

  describe('execute', () => {
    it('should complete successfully with valid input', async () => {
      const input = createTestInput();
      const result = await workflow.execute(input);

      expect(result.status).toBe('completed');
      expect(result.runId).toBeDefined();
      expect(result.generatedCopy).toBeDefined();
      expect(result.generatedCopy?.title).toBe('Beautiful 2BR Apartment');
      expect(result.artifacts).toBeDefined();
      expect(result.evidence).toBeDefined();
    });

    it('should call copy generator with correct input', async () => {
      const input = createTestInput();
      await workflow.execute(input);

      expect(mockCopyGenerator.generate).toHaveBeenCalledWith({
        listingDraft: input.listingDraft,
        propertyFacts: input.propertyFacts,
        marketId: input.marketId,
        tenantId: input.tenantId,
      });
    });

    it('should call compliance gate before artifact generation', async () => {
      const input = createTestInput();
      await workflow.execute(input);

      expect(mockComplianceGate.validate).toHaveBeenCalled();
      expect(mockArtifactOrchestrator.generateAll).toHaveBeenCalled();

      // Verify compliance was called before artifacts
      const complianceCallOrder = mockComplianceGate.validate.mock.invocationCallOrder[0];
      const artifactCallOrder = mockArtifactOrchestrator.generateAll.mock.invocationCallOrder[0];
      expect(complianceCallOrder).toBeLessThan(artifactCallOrder);
    });

    it('should skip compliance check when skipCompliance is true', async () => {
      const input = {
        ...createTestInput(),
        options: { skipCompliance: true },
      };
      await workflow.execute(input);

      expect(mockComplianceGate.validate).not.toHaveBeenCalled();
    });

    it('should emit evidence on completion', async () => {
      const input = createTestInput();
      await workflow.execute(input);

      expect(mockEvidenceEmitter.buildRecord).toHaveBeenCalled();
      expect(mockEvidenceEmitter.emit).toHaveBeenCalled();
    });

    it('should record tool usage for each step', async () => {
      const input = createTestInput();
      await workflow.execute(input);

      expect(mockEvidenceEmitter.recordToolUsage).toHaveBeenCalled();
      const calls = mockEvidenceEmitter.recordToolUsage.mock.calls;
      const tools = calls.map((c: any[]) => c[0].tool);
      expect(tools).toContain('copy_generator');
      expect(tools).toContain('compliance_gate');
      expect(tools).toContain('artifact_orchestrator');
    });
  });

  describe('compliance blocking', () => {
    it('should return blocked status when compliance fails', async () => {
      mockComplianceGate.validate.mockRejectedValue(
        new ComplianceBlockedError('FARE Act violation', [
          {
            code: 'FARE_ACT_VIOLATION',
            message: 'Broker fee cannot be paid by tenant when agent represents landlord',
            severity: 'critical',
          },
        ])
      );

      const input = createTestInput();
      const result = await workflow.execute(input);

      expect(result.status).toBe('blocked');
      expect(result.complianceResult?.passed).toBe(false);
      expect(result.complianceResult?.violations).toHaveLength(1);
      expect(result.error).toContain('FARE Act violation');
    });

    it('should not generate artifacts when compliance fails', async () => {
      mockComplianceGate.validate.mockRejectedValue(
        new ComplianceBlockedError('Compliance failed', [])
      );

      const input = createTestInput();
      await workflow.execute(input);

      expect(mockArtifactOrchestrator.generateAll).not.toHaveBeenCalled();
    });
  });

  describe('kill switch', () => {
    it('should fail when global kill switch is active', async () => {
      const workflowWithKillSwitch = new ListingCopilotWorkflow({
        copyGenerator: mockCopyGenerator as any,
        artifactOrchestrator: mockArtifactOrchestrator as any,
        complianceGate: mockComplianceGate as any,
        channelSimulator: mockChannelSimulator as any,
        templateLoader: mockTemplateLoader as any,
        evidenceEmitter: mockEvidenceEmitter as any,
        killSwitch: {
          isActive: vi.fn().mockResolvedValue(true),
        },
      });

      const input = createTestInput();
      const result = await workflowWithKillSwitch.execute(input);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('kill switch');
    });
  });

  describe('budget', () => {
    it('should fail when budget is exceeded', async () => {
      const workflowWithBudget = new ListingCopilotWorkflow({
        copyGenerator: mockCopyGenerator as any,
        artifactOrchestrator: mockArtifactOrchestrator as any,
        complianceGate: mockComplianceGate as any,
        channelSimulator: mockChannelSimulator as any,
        templateLoader: mockTemplateLoader as any,
        evidenceEmitter: mockEvidenceEmitter as any,
        budgetService: {
          checkBudget: vi.fn().mockResolvedValue(false),
          consumeBudget: vi.fn(),
        },
      });

      const input = createTestInput();
      const result = await workflowWithBudget.execute(input);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('Budget exceeded');
    });
  });

  describe('dry-run mode', () => {
    it('should default to dry-run mode', async () => {
      const input = {
        ...createTestInput(),
        options: { channels: ['zillow'] as any },
      };
      await workflow.execute(input);

      expect(mockChannelSimulator.simulate).toHaveBeenCalled();
      expect(mockChannelSimulator.publish).not.toHaveBeenCalled();
    });

    it('should publish when dry-run is disabled', async () => {
      const input = {
        ...createTestInput(),
        options: { dryRun: false, channels: ['zillow'] as any },
      };
      await workflow.execute(input);

      expect(mockChannelSimulator.publish).toHaveBeenCalled();
      expect(mockChannelSimulator.simulate).not.toHaveBeenCalled();
    });
  });
});
