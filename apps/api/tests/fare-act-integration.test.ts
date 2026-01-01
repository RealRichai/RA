/**
 * NYC FARE Act Integration Tests
 *
 * Tests for the listing publish endpoint with FARE Act compliance enforcement.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  gateListingPublish,
  gateListingUpdate,
  type ListingPublishInput,
  type ListingUpdateInput,
} from '@realriches/compliance-engine';

describe('FARE Act Integration - Listing Publish Endpoint', () => {
  describe('NYC Market Enforcement', () => {
    const baseListingInput: ListingPublishInput = {
      listingId: 'lst_integration_test',
      marketId: 'NYC',
      status: 'draft',
      hasBrokerFee: false,
      monthlyRent: 2500,
      deliveredDisclosures: ['fare_act_disclosure', 'fare_fee_disclosure'],
      acknowledgedDisclosures: [],
    };

    describe('Illegal Broker Fee Scenarios - Must be BLOCKED', () => {
      it('rejects listing with tenant-paid broker fee when agent represents landlord', async () => {
        const input: ListingPublishInput = {
          ...baseListingInput,
          hasBrokerFee: true,
          brokerFeeAmount: 3000,
          brokerFeePaidBy: 'tenant',
          agentRepresentation: 'landlord',
        };

        const result = await gateListingPublish(input);

        expect(result.allowed).toBe(false);
        expect(result.decision.passed).toBe(false);
        expect(result.decision.violations.length).toBeGreaterThan(0);

        // Verify FARE_LISTING_AGENT_TENANT_FEE violation is present
        const fareViolation = result.decision.violations.find(
          (v) => v.code === 'FARE_LISTING_AGENT_TENANT_FEE'
        );
        expect(fareViolation).toBeDefined();
        expect(fareViolation?.severity).toBe('critical');
        expect(fareViolation?.evidence?.agentRepresentation).toBe('landlord');
        expect(fareViolation?.evidence?.brokerFeePaidBy).toBe('tenant');

        // Verify remediation instructions are present
        const fix = result.decision.recommendedFixes.find(
          (f) => f.action === 'remove_tenant_broker_fee'
        );
        expect(fix).toBeDefined();
        expect(fix?.priority).toBe('critical');
      });

      it('rejects listing with tenant-paid broker fee (general prohibition)', async () => {
        const input: ListingPublishInput = {
          ...baseListingInput,
          hasBrokerFee: true,
          brokerFeeAmount: 2500,
          brokerFeePaidBy: 'tenant',
        };

        const result = await gateListingPublish(input);

        expect(result.allowed).toBe(false);
        expect(result.decision.violations.some((v) => v.code === 'FARE_BROKER_FEE_PROHIBITED')).toBe(true);
      });

      it('rejects listing with missing fee disclosure', async () => {
        const input: ListingPublishInput = {
          ...baseListingInput,
          feeDisclosure: {
            disclosed: false,
            disclosedFees: [],
          },
        };

        const result = await gateListingPublish(input);

        expect(result.allowed).toBe(false);
        expect(result.decision.violations.some((v) => v.code === 'FARE_FEE_DISCLOSURE_MISSING')).toBe(true);
      });
    });

    describe('Compliant Scenarios - Must be ALLOWED', () => {
      it('accepts listing with landlord-paid broker fee', async () => {
        const input: ListingPublishInput = {
          ...baseListingInput,
          hasBrokerFee: true,
          brokerFeeAmount: 3000,
          brokerFeePaidBy: 'landlord',
          agentRepresentation: 'landlord',
          feeDisclosure: {
            disclosed: true,
            disclosedFees: [{ type: 'broker_fee', amount: 3000, paidBy: 'landlord' }],
          },
        };

        const result = await gateListingPublish(input);

        expect(result.allowed).toBe(true);
        expect(result.decision.passed).toBe(true);
        expect(result.decision.checksPerformed).toContain('fare_act');
      });

      it('accepts listing with no broker fee', async () => {
        const input: ListingPublishInput = {
          ...baseListingInput,
          hasBrokerFee: false,
          feeDisclosure: {
            disclosed: true,
            disclosedFees: [],
          },
        };

        const result = await gateListingPublish(input);

        expect(result.allowed).toBe(true);
      });

      it('accepts listing with tenant-paid fee when agent represents tenant', async () => {
        const input: ListingPublishInput = {
          ...baseListingInput,
          hasBrokerFee: true,
          brokerFeeAmount: 2500,
          brokerFeePaidBy: 'tenant',
          agentRepresentation: 'tenant', // Tenant's agent, tenant can pay
          feeDisclosure: {
            disclosed: true,
            disclosedFees: [{ type: 'broker_fee', amount: 2500, paidBy: 'tenant' }],
          },
        };

        const result = await gateListingPublish(input);

        // Should not have FARE_LISTING_AGENT_TENANT_FEE violation
        const listingAgentViolations = result.decision.violations.filter(
          (v) => v.code === 'FARE_LISTING_AGENT_TENANT_FEE'
        );
        expect(listingAgentViolations).toHaveLength(0);
      });
    });

    describe('Fee Disclosure Requirements', () => {
      it('requires complete fee disclosure for all tenant-paid fees', async () => {
        const input: ListingPublishInput = {
          ...baseListingInput,
          feeDisclosure: {
            disclosed: true,
            disclosedFees: [
              { type: 'application_fee', amount: 50, paidBy: 'tenant' },
              { type: 'move_in_fee', amount: 200, paidBy: 'tenant' },
            ],
          },
        };

        const result = await gateListingPublish(input);

        // Should be allowed - all fees are disclosed
        expect(result.allowed).toBe(true);
      });
    });
  });

  describe('Non-NYC Markets', () => {
    it('allows tenant-paid broker fees in Texas', async () => {
      const input: ListingPublishInput = {
        listingId: 'lst_texas_test',
        marketId: 'TX',
        status: 'draft',
        hasBrokerFee: true,
        brokerFeeAmount: 3000,
        brokerFeePaidBy: 'tenant',
        agentRepresentation: 'landlord',
        monthlyRent: 2500,
        deliveredDisclosures: ['lead_paint_disclosure'],
        acknowledgedDisclosures: ['lead_paint_disclosure'],
      };

      const result = await gateListingPublish(input);

      // Texas doesn't have FARE Act
      expect(result.decision.marketPack).toBe('TX_STANDARD');
      const fareViolations = result.decision.violations.filter((v) => v.code.startsWith('FARE_'));
      expect(fareViolations).toHaveLength(0);
    });
  });

  describe('Listing Update Enforcement', () => {
    it('blocks update that introduces illegal broker fee', async () => {
      const input: ListingUpdateInput = {
        listingId: 'lst_update_test',
        marketId: 'NYC',
        status: 'active',
        hasBrokerFee: true,
        brokerFeeAmount: 2500,
        brokerFeePaidBy: 'tenant',
        agentRepresentation: 'landlord',
        monthlyRent: 2500,
        deliveredDisclosures: ['fare_act_disclosure', 'fare_fee_disclosure'],
        acknowledgedDisclosures: [],
        previousState: {
          hasBrokerFee: false,
        },
      };

      const result = await gateListingUpdate(input);

      expect(result.allowed).toBe(false);
      expect(result.decision.violations.some(
        (v) => v.code === 'FARE_LISTING_AGENT_TENANT_FEE' || v.code === 'FARE_BROKER_FEE_PROHIBITED'
      )).toBe(true);
    });
  });

  describe('Evidence and Audit Trail', () => {
    it('includes complete provenance in compliance decision', async () => {
      const input: ListingPublishInput = {
        listingId: 'lst_provenance_test',
        marketId: 'NYC',
        status: 'draft',
        hasBrokerFee: false,
        monthlyRent: 2500,
        deliveredDisclosures: ['fare_act_disclosure', 'fare_fee_disclosure'],
        acknowledgedDisclosures: [],
        feeDisclosure: {
          disclosed: true,
          disclosedFees: [],
        },
      };

      const result = await gateListingPublish(input);

      // Verify decision metadata
      expect(result.decision.policyVersion).toBeDefined();
      expect(result.decision.marketPack).toBe('NYC_STRICT');
      expect(result.decision.marketPackVersion).toBeDefined();
      expect(result.decision.checkedAt).toBeDefined();
      expect(result.decision.checksPerformed).toContain('fare_act');
      expect(result.decision.metadata?.listingId).toBe('lst_provenance_test');
      expect(result.decision.metadata?.transitionAttempted).toBe('DRAFT_TO_ACTIVE');
    });

    it('includes rationale and rule references in violations', async () => {
      const input: ListingPublishInput = {
        listingId: 'lst_rationale_test',
        marketId: 'NYC',
        status: 'draft',
        hasBrokerFee: true,
        brokerFeeAmount: 3000,
        brokerFeePaidBy: 'tenant',
        agentRepresentation: 'landlord',
        monthlyRent: 2500,
        deliveredDisclosures: ['fare_act_disclosure', 'fare_fee_disclosure'],
        acknowledgedDisclosures: [],
      };

      const result = await gateListingPublish(input);

      const violation = result.decision.violations.find(
        (v) => v.code === 'FARE_LISTING_AGENT_TENANT_FEE'
      );

      expect(violation).toBeDefined();
      expect(violation?.evidence?.rationale).toBeDefined();
      expect(violation?.evidence?.rule).toContain('NYC Admin Code');
      expect(violation?.ruleReference).toBeDefined();
      expect(violation?.documentationUrl).toBeDefined();
    });
  });
});
