/**
 * Compliance Gate Tests
 *
 * Tests for the CopilotComplianceGate.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CopilotComplianceGate } from '../compliance/copilot-compliance-gate';
import { ComplianceBlockedError } from '../types';

describe('CopilotComplianceGate', () => {
  let mockGateListingPublish: ReturnType<typeof vi.fn>;
  let complianceGate: CopilotComplianceGate;

  beforeEach(() => {
    mockGateListingPublish = vi.fn();
    complianceGate = new CopilotComplianceGate({
      gateListingPublish: mockGateListingPublish,
    });
  });

  const createTestInput = () => ({
    listingDraft: {
      propertyType: 'apartment' as const,
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
      brokerFeePaidBy: 'tenant' as const,
      agentRepresentation: 'landlord' as const,
    },
    optimizedCopy: {
      title: 'Beautiful 2BR Apartment',
      description: 'A stunning apartment.',
      highlights: ['Modern kitchen'],
      seoKeywords: ['apartment'],
      disclosureText: 'Broker fee applies.',
      promptHash: 'abc123',
      tokensUsed: 1500,
    },
    marketId: 'nyc',
  });

  describe('validate', () => {
    it('should pass when compliance engine allows', async () => {
      mockGateListingPublish.mockResolvedValue({
        allowed: true,
        decision: {
          passed: true,
          violations: [],
          marketPack: 'NYC_STRICT_V1',
          marketPackVersion: '1.0.0',
          checksPerformed: ['fare_act', 'broker_fee'],
        },
      });

      const input = createTestInput();
      const result = await complianceGate.validate(input);

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.marketPack).toBe('NYC_STRICT_V1');
    });

    it('should throw ComplianceBlockedError when compliance fails', async () => {
      mockGateListingPublish.mockResolvedValue({
        allowed: false,
        decision: {
          passed: false,
          violations: [
            {
              code: 'FARE_ACT_VIOLATION',
              message: 'Broker fee violates FARE Act',
              severity: 'critical',
            },
          ],
          marketPack: 'NYC_STRICT_V1',
          marketPackVersion: '1.0.0',
          checksPerformed: ['fare_act'],
        },
        blockedReason: 'FARE Act violation detected',
      });

      const input = createTestInput();

      await expect(complianceGate.validate(input)).rejects.toThrow(ComplianceBlockedError);
    });

    it('should include all violations in the error', async () => {
      mockGateListingPublish.mockResolvedValue({
        allowed: false,
        decision: {
          passed: false,
          violations: [
            { code: 'VIOLATION_1', message: 'First violation', severity: 'critical' },
            { code: 'VIOLATION_2', message: 'Second violation', severity: 'critical' },
          ],
          marketPack: 'NYC_STRICT_V1',
          marketPackVersion: '1.0.0',
          checksPerformed: [],
        },
        blockedReason: 'Multiple violations',
      });

      const input = createTestInput();

      try {
        await complianceGate.validate(input);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ComplianceBlockedError);
        expect((error as ComplianceBlockedError).violations).toHaveLength(2);
      }
    });

    it('should call gate with correct parameters', async () => {
      mockGateListingPublish.mockResolvedValue({
        allowed: true,
        decision: {
          passed: true,
          violations: [],
          marketPack: 'NYC_STRICT_V1',
          marketPackVersion: '1.0.0',
          checksPerformed: [],
        },
      });

      const input = createTestInput();
      await complianceGate.validate(input);

      expect(mockGateListingPublish).toHaveBeenCalledWith(
        expect.objectContaining({
          marketId: 'nyc',
          hasBrokerFee: true,
          brokerFeeAmount: 3500,
          brokerFeePaidBy: 'tenant',
          agentRepresentation: 'landlord',
          monthlyRent: 3500,
        })
      );
    });
  });

  describe('validateSafe', () => {
    it('should return result without throwing on failure', async () => {
      mockGateListingPublish.mockResolvedValue({
        allowed: false,
        decision: {
          passed: false,
          violations: [
            { code: 'VIOLATION', message: 'Test violation', severity: 'critical' },
          ],
          marketPack: 'NYC_STRICT_V1',
          marketPackVersion: '1.0.0',
          checksPerformed: [],
        },
        blockedReason: 'Test failure',
      });

      const input = createTestInput();
      const result = await complianceGate.validateSafe(input);

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
    });

    it('should return success on pass', async () => {
      mockGateListingPublish.mockResolvedValue({
        allowed: true,
        decision: {
          passed: true,
          violations: [],
          marketPack: 'DEFAULT',
          marketPackVersion: '1.0.0',
          checksPerformed: [],
        },
      });

      const input = createTestInput();
      const result = await complianceGate.validateSafe(input);

      expect(result.passed).toBe(true);
    });
  });

  describe('validateDisclosures', () => {
    it('should detect missing broker fee disclosure for NYC', () => {
      const copy = {
        title: 'Test',
        description: 'Test',
        highlights: [],
        seoKeywords: [],
        promptHash: 'abc',
        tokensUsed: 100,
        // Missing disclosureText
      };

      const violations = complianceGate.validateDisclosures(copy, 'nyc', true);

      expect(violations).toHaveLength(1);
      expect(violations[0].code).toBe('DISCLOSURE_MISSING_BROKER_FEE');
    });

    it('should pass when broker fee disclosure is present', () => {
      const copy = {
        title: 'Test',
        description: 'Test',
        highlights: [],
        seoKeywords: [],
        disclosureText: 'A broker fee of $3,500 applies.',
        promptHash: 'abc',
        tokensUsed: 100,
      };

      const violations = complianceGate.validateDisclosures(copy, 'nyc', true);

      expect(violations).toHaveLength(0);
    });

    it('should not require broker fee disclosure when no broker fee', () => {
      const copy = {
        title: 'Test',
        description: 'Test',
        highlights: [],
        seoKeywords: [],
        promptHash: 'abc',
        tokensUsed: 100,
      };

      const violations = complianceGate.validateDisclosures(copy, 'nyc', false);

      expect(violations).toHaveLength(0);
    });

    it('should not require NYC disclosures for other markets', () => {
      const copy = {
        title: 'Test',
        description: 'Test',
        highlights: [],
        seoKeywords: [],
        promptHash: 'abc',
        tokensUsed: 100,
      };

      const violations = complianceGate.validateDisclosures(copy, 'la', true);

      expect(violations).toHaveLength(0);
    });
  });
});
