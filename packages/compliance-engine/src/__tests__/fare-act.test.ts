/**
 * NYC FARE Act Compliance Tests
 *
 * Tests for the FARE (Fair Access to Rental Equity) Act enforcement.
 * The FARE Act prohibits tenants from paying broker fees when the broker
 * represents the landlord (listing agent).
 */

import { describe, it, expect } from 'vitest';

import {
  gateListingPublish,
  gateListingUpdate,
  gateLeaseCreation,
  checkFAREActRules,
  getMarketPack,
} from '../index';

describe('NYC FARE Act Compliance', () => {
  describe('checkFAREActRules', () => {
    const nycPack = getMarketPack('NYC_STRICT');

    describe('Listing Agent Tenant Fee Prohibition', () => {
      it('blocks tenant broker fee when agent represents landlord', () => {
        const result = checkFAREActRules(
          {
            hasBrokerFee: true,
            brokerFeeAmount: 3000,
            brokerFeePaidBy: 'tenant',
            agentRepresentation: 'landlord',
            monthlyRent: 2500,
            context: 'listing_publish',
          },
          nycPack
        );

        expect(result.violations).toHaveLength(2); // Both FARE_LISTING_AGENT_TENANT_FEE and FARE_BROKER_FEE_PROHIBITED
        expect(result.violations.some((v) => v.code === 'FARE_LISTING_AGENT_TENANT_FEE')).toBe(true);
        expect(result.violations[0]?.severity).toBe('critical');
        expect(result.violations[0]?.evidence?.agentRepresentation).toBe('landlord');
        expect(result.violations[0]?.evidence?.brokerFeePaidBy).toBe('tenant');
        expect(result.violations[0]?.evidence?.rationale).toBeDefined();
      });

      it('allows landlord to pay broker fee when agent represents landlord', () => {
        const result = checkFAREActRules(
          {
            hasBrokerFee: true,
            brokerFeeAmount: 3000,
            brokerFeePaidBy: 'landlord',
            agentRepresentation: 'landlord',
            monthlyRent: 2500,
            context: 'listing_publish',
          },
          nycPack
        );

        // Should have no critical violations for broker fee
        const brokerViolations = result.violations.filter(
          (v) => v.code.includes('BROKER_FEE')
        );
        expect(brokerViolations).toHaveLength(0);
      });

      it('allows tenant to pay broker fee when agent represents tenant', () => {
        const result = checkFAREActRules(
          {
            hasBrokerFee: true,
            brokerFeeAmount: 3000,
            brokerFeePaidBy: 'tenant',
            agentRepresentation: 'tenant',
            monthlyRent: 2500,
            context: 'listing_publish',
          },
          nycPack
        );

        // When agent represents tenant, tenant can pay
        const listingAgentViolations = result.violations.filter(
          (v) => v.code === 'FARE_LISTING_AGENT_TENANT_FEE'
        );
        expect(listingAgentViolations).toHaveLength(0);
      });

      it('allows no broker fee regardless of representation', () => {
        const result = checkFAREActRules(
          {
            hasBrokerFee: false,
            agentRepresentation: 'landlord',
            monthlyRent: 2500,
            context: 'listing_publish',
          },
          nycPack
        );

        const brokerViolations = result.violations.filter(
          (v) => v.code.includes('BROKER_FEE')
        );
        expect(brokerViolations).toHaveLength(0);
      });
    });

    describe('Fee Disclosure Requirement', () => {
      it('blocks listing without fee disclosure', () => {
        const result = checkFAREActRules(
          {
            hasBrokerFee: false,
            monthlyRent: 2500,
            feeDisclosure: {
              disclosed: false,
              disclosedFees: [],
            },
            context: 'listing_publish',
          },
          nycPack
        );

        expect(result.violations.some((v) => v.code === 'FARE_FEE_DISCLOSURE_MISSING')).toBe(true);
        expect(result.violations.find((v) => v.code === 'FARE_FEE_DISCLOSURE_MISSING')?.severity).toBe('critical');
      });

      it('allows listing with complete fee disclosure', () => {
        const result = checkFAREActRules(
          {
            hasBrokerFee: false,
            monthlyRent: 2500,
            feeDisclosure: {
              disclosed: true,
              disclosedFees: [
                { type: 'application_fee', amount: 50, paidBy: 'tenant' },
              ],
            },
            context: 'listing_publish',
          },
          nycPack
        );

        const disclosureViolations = result.violations.filter(
          (v) => v.code === 'FARE_FEE_DISCLOSURE_MISSING'
        );
        expect(disclosureViolations).toHaveLength(0);
      });

      it('validates disclosure includes fee type and amount', () => {
        const result = checkFAREActRules(
          {
            hasBrokerFee: false,
            monthlyRent: 2500,
            feeDisclosure: {
              disclosed: true,
              disclosedFees: [
                { type: '', amount: 50, paidBy: 'tenant' }, // Missing type
              ],
            },
            context: 'listing_publish',
          },
          nycPack
        );

        expect(result.violations.some((v) => v.code === 'FARE_FEE_DISCLOSURE_MISSING')).toBe(true);
      });
    });

    describe('Income Requirement Limits', () => {
      it('blocks excessive income requirement', () => {
        const result = checkFAREActRules(
          {
            hasBrokerFee: false,
            monthlyRent: 2500,
            incomeRequirementMultiplier: 50, // Exceeds 40x limit
            context: 'listing_publish',
          },
          nycPack
        );

        expect(result.violations.some((v) => v.code === 'FARE_INCOME_REQUIREMENT_EXCESSIVE')).toBe(true);
        const violation = result.violations.find((v) => v.code === 'FARE_INCOME_REQUIREMENT_EXCESSIVE');
        expect(violation?.evidence?.required).toBe(50);
        expect(violation?.evidence?.maximum).toBe(40);
      });

      it('allows income requirement within limit', () => {
        const result = checkFAREActRules(
          {
            hasBrokerFee: false,
            monthlyRent: 2500,
            incomeRequirementMultiplier: 40, // At limit
            context: 'listing_publish',
          },
          nycPack
        );

        expect(result.violations.some((v) => v.code === 'FARE_INCOME_REQUIREMENT_EXCESSIVE')).toBe(false);
      });
    });

    describe('Credit Score Threshold Limits', () => {
      it('blocks excessive credit score requirement', () => {
        const result = checkFAREActRules(
          {
            hasBrokerFee: false,
            monthlyRent: 2500,
            creditScoreThreshold: 700, // Exceeds 650 limit
            context: 'listing_publish',
          },
          nycPack
        );

        expect(result.violations.some((v) => v.code === 'FARE_CREDIT_SCORE_THRESHOLD_EXCESSIVE')).toBe(true);
      });

      it('allows credit score requirement within limit', () => {
        const result = checkFAREActRules(
          {
            hasBrokerFee: false,
            monthlyRent: 2500,
            creditScoreThreshold: 650, // At limit
            context: 'listing_publish',
          },
          nycPack
        );

        expect(result.violations.some((v) => v.code === 'FARE_CREDIT_SCORE_THRESHOLD_EXCESSIVE')).toBe(false);
      });
    });
  });

  describe('gateListingPublish', () => {
    it('blocks NYC listing with illegal broker fee structure', async () => {
      const result = await gateListingPublish({
        listingId: 'lst_test123',
        marketId: 'NYC',
        status: 'draft',
        hasBrokerFee: true,
        brokerFeeAmount: 3000,
        brokerFeePaidBy: 'tenant',
        agentRepresentation: 'landlord',
        monthlyRent: 2500,
        deliveredDisclosures: ['fare_act_disclosure', 'fare_fee_disclosure'],
        acknowledgedDisclosures: [],
        feeDisclosure: {
          disclosed: true,
          disclosedFees: [{ type: 'broker_fee', amount: 3000, paidBy: 'tenant' }],
        },
      });

      expect(result.allowed).toBe(false);
      expect(result.decision.passed).toBe(false);
      expect(result.decision.violations.some((v) => v.code === 'FARE_LISTING_AGENT_TENANT_FEE')).toBe(true);
      expect(result.blockedReason).toContain('cannot be published');
    });

    it('allows NYC listing with compliant broker fee structure', async () => {
      const result = await gateListingPublish({
        listingId: 'lst_test456',
        marketId: 'NYC',
        status: 'draft',
        hasBrokerFee: true,
        brokerFeeAmount: 3000,
        brokerFeePaidBy: 'landlord', // Landlord pays
        agentRepresentation: 'landlord',
        monthlyRent: 2500,
        deliveredDisclosures: ['fare_act_disclosure', 'fare_fee_disclosure'],
        acknowledgedDisclosures: [],
        feeDisclosure: {
          disclosed: true,
          disclosedFees: [{ type: 'broker_fee', amount: 3000, paidBy: 'landlord' }],
        },
      });

      expect(result.allowed).toBe(true);
      expect(result.decision.passed).toBe(true);
      expect(result.decision.checksPerformed).toContain('fare_act');
    });

    it('blocks NYC listing missing fee disclosure', async () => {
      const result = await gateListingPublish({
        listingId: 'lst_test789',
        marketId: 'NYC',
        status: 'draft',
        hasBrokerFee: false,
        monthlyRent: 2500,
        deliveredDisclosures: ['fare_act_disclosure'],
        acknowledgedDisclosures: [],
        feeDisclosure: {
          disclosed: false,
          disclosedFees: [],
        },
      });

      expect(result.allowed).toBe(false);
      expect(result.decision.violations.some((v) => v.code === 'FARE_FEE_DISCLOSURE_MISSING')).toBe(true);
    });

    it('includes evidence and remediation in violations', async () => {
      const result = await gateListingPublish({
        listingId: 'lst_evidence',
        marketId: 'NYC',
        status: 'draft',
        hasBrokerFee: true,
        brokerFeeAmount: 3000,
        brokerFeePaidBy: 'tenant',
        agentRepresentation: 'landlord',
        monthlyRent: 2500,
        deliveredDisclosures: [],
        acknowledgedDisclosures: [],
      });

      const violation = result.decision.violations.find(
        (v) => v.code === 'FARE_LISTING_AGENT_TENANT_FEE'
      );
      expect(violation).toBeDefined();
      expect(violation?.evidence).toBeDefined();
      expect(violation?.evidence?.rule).toContain('NYC Admin Code');
      expect(violation?.ruleReference).toBeDefined();
      expect(violation?.documentationUrl).toBeDefined();

      const fix = result.decision.recommendedFixes.find(
        (f) => f.action === 'remove_tenant_broker_fee'
      );
      expect(fix).toBeDefined();
      expect(fix?.description).toContain('landlord');
    });
  });

  describe('gateListingUpdate', () => {
    it('blocks update that violates FARE Act', async () => {
      const result = await gateListingUpdate({
        listingId: 'lst_update123',
        marketId: 'NYC',
        status: 'active',
        hasBrokerFee: true,
        brokerFeeAmount: 2500,
        brokerFeePaidBy: 'tenant',
        agentRepresentation: 'landlord',
        monthlyRent: 2500,
        deliveredDisclosures: [],
        acknowledgedDisclosures: [],
        previousState: {
          hasBrokerFee: false,
        },
      });

      expect(result.allowed).toBe(false);
      expect(result.decision.metadata?.action).toBe('listing_update');
    });
  });

  describe('gateLeaseCreation', () => {
    it('blocks lease with illegal broker fee in NYC', async () => {
      const result = await gateLeaseCreation({
        leaseId: 'lse_test123',
        marketId: 'NYC',
        monthlyRent: 2500,
        isRentStabilized: false,
        hasBrokerFee: true,
        brokerFeeAmount: 3000,
        brokerFeePaidBy: 'tenant',
        agentRepresentation: 'landlord',
        deliveredDisclosures: ['fare_fee_disclosure'],
        acknowledgedDisclosures: ['fare_fee_disclosure'],
      });

      expect(result.allowed).toBe(false);
      expect(result.decision.metadata?.fareActEnforced).toBe(true);
    });

    it('allows compliant lease in NYC', async () => {
      // Note: NYC requires many disclosures for lease signing
      // Full list: fare_fee_disclosure, lead_paint_disclosure, bedbug_history,
      // rent_stabilization_notice, flood_zone_disclosure, tenant_rights_guide
      const allNycLeaseDisclosures = [
        'fare_fee_disclosure',
        'lead_paint_disclosure',
        'bedbug_history',
        'rent_stabilization_notice',
        'flood_zone_disclosure',
        'tenant_rights_guide',
      ];

      const result = await gateLeaseCreation({
        leaseId: 'lse_test456',
        marketId: 'NYC',
        monthlyRent: 2500,
        securityDepositAmount: 2500, // Within 1 month limit
        isRentStabilized: false,
        hasBrokerFee: false,
        deliveredDisclosures: allNycLeaseDisclosures,
        acknowledgedDisclosures: allNycLeaseDisclosures,
        feeDisclosure: {
          disclosed: true,
          disclosedFees: [],
        },
      });

      // Check that fare_act is checked
      expect(result.decision.checksPerformed).toContain('fare_act');
      // Check that the lease is allowed
      expect(result.allowed).toBe(true);
    });
  });

  describe('Non-NYC Markets', () => {
    it('does not apply FARE Act rules to non-NYC markets', async () => {
      const result = await gateListingPublish({
        listingId: 'lst_texas',
        marketId: 'TX',
        status: 'draft',
        hasBrokerFee: true,
        brokerFeeAmount: 3000,
        brokerFeePaidBy: 'tenant',
        agentRepresentation: 'landlord',
        monthlyRent: 2500,
        deliveredDisclosures: [],
        acknowledgedDisclosures: [],
      });

      // Texas doesn't have FARE Act, so broker fee violations shouldn't appear
      const fareViolations = result.decision.violations.filter(
        (v) => v.code.startsWith('FARE_')
      );
      expect(fareViolations).toHaveLength(0);
    });
  });

  describe('Evidence and Audit Trail', () => {
    it('includes complete provenance in decision', async () => {
      const result = await gateListingPublish({
        listingId: 'lst_audit',
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
      });

      expect(result.decision.policyVersion).toBeDefined();
      expect(result.decision.marketPack).toBe('NYC_STRICT');
      expect(result.decision.marketPackVersion).toBeDefined();
      expect(result.decision.checkedAt).toBeDefined();
      expect(result.decision.checksPerformed).toContain('fare_act');
      expect(result.decision.metadata?.listingId).toBe('lst_audit');
    });
  });
});
