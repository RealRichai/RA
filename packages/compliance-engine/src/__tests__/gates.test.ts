/**
 * Compliance Engine - Gate Integration Tests
 *
 * Tests for compliance gates that block/allow operations.
 */

import { describe, it, expect } from 'vitest';

import {
  gateListingPublish,
  gateBrokerFeeChange,
  gateSecurityDepositChange,
  gateRentIncrease,
  gateFCHAStageTransition,
  gateFCHABackgroundCheck,
  gateDisclosureRequirement,
  gateLeaseCreation,
} from '../gates';

describe('Listing Publish Gate', () => {
  describe('NYC Market', () => {
    it('should block listing with broker fee charged to tenant', async () => {
      const result = await gateListingPublish({
        listingId: 'lst_123',
        marketId: 'nyc',
        status: 'DRAFT',
        hasBrokerFee: true,
        brokerFeeAmount: 3000,
        brokerFeePaidBy: 'tenant',
        monthlyRent: 3000,
        deliveredDisclosures: ['fare_act_disclosure'],
        acknowledgedDisclosures: [],
      });

      expect(result.allowed).toBe(false);
      expect(result.decision.passed).toBe(false);
      expect(result.decision.violations.some((v) => v.code === 'FARE_BROKER_FEE_PROHIBITED')).toBe(true);
      expect(result.blockedReason).toContain('FARE Act prohibits');
    });

    it('should block listing with excessive security deposit', async () => {
      const result = await gateListingPublish({
        listingId: 'lst_123',
        marketId: 'nyc',
        status: 'DRAFT',
        hasBrokerFee: false,
        monthlyRent: 3000,
        securityDepositAmount: 6000, // 2 months, NYC only allows 1
        deliveredDisclosures: ['fare_act_disclosure'],
        acknowledgedDisclosures: [],
      });

      expect(result.allowed).toBe(false);
      expect(result.decision.violations.some((v) => v.code === 'SECURITY_DEPOSIT_EXCESSIVE')).toBe(true);
    });

    it('should block listing missing required disclosures', async () => {
      const result = await gateListingPublish({
        listingId: 'lst_123',
        marketId: 'nyc',
        status: 'DRAFT',
        hasBrokerFee: false,
        monthlyRent: 3000,
        deliveredDisclosures: [], // Missing fare_act_disclosure
        acknowledgedDisclosures: [],
      });

      expect(result.allowed).toBe(false);
      expect(result.decision.violations.some((v) => v.code === 'DISCLOSURE_NOT_DELIVERED')).toBe(true);
    });

    it('should allow compliant listing', async () => {
      const result = await gateListingPublish({
        listingId: 'lst_123',
        marketId: 'nyc',
        status: 'DRAFT',
        hasBrokerFee: false,
        monthlyRent: 3000,
        securityDepositAmount: 3000, // 1 month is OK
        deliveredDisclosures: ['fare_act_disclosure', 'fare_fee_disclosure'],
        acknowledgedDisclosures: [],
      });

      expect(result.allowed).toBe(true);
      expect(result.decision.passed).toBe(true);
    });
  });

  describe('Texas Market', () => {
    it('should allow broker fee in Texas market', async () => {
      const result = await gateListingPublish({
        listingId: 'lst_123',
        marketId: 'texas',
        status: 'DRAFT',
        hasBrokerFee: true,
        brokerFeeAmount: 3000,
        brokerFeePaidBy: 'tenant',
        monthlyRent: 3000,
        deliveredDisclosures: ['lead_paint_disclosure'],
        acknowledgedDisclosures: ['lead_paint_disclosure'],
      });

      expect(result.allowed).toBe(true);
      expect(result.decision.marketPack).toBe('TX_STANDARD');
    });
  });
});

describe('Rent Increase Gate', () => {
  describe('NYC Good Cause', () => {
    it('should block excessive rent increase', async () => {
      const result = await gateRentIncrease({
        leaseId: 'lse_123',
        marketId: 'nyc',
        currentRent: 2000,
        proposedRent: 2500, // 25% increase
        noticeDays: 30,
      });

      expect(result.allowed).toBe(false);
      expect(result.decision.violations.some((v) => v.code === 'GOOD_CAUSE_RENT_INCREASE_EXCESSIVE')).toBe(true);
    });

    it('should allow reasonable rent increase', async () => {
      const result = await gateRentIncrease({
        leaseId: 'lse_123',
        marketId: 'nyc',
        currentRent: 2000,
        proposedRent: 2100, // 5% increase
        noticeDays: 30,
      });

      expect(result.allowed).toBe(true);
    });

    it('should block insufficient notice period', async () => {
      const result = await gateRentIncrease({
        leaseId: 'lse_123',
        marketId: 'nyc',
        currentRent: 2000,
        proposedRent: 2050, // Small increase
        noticeDays: 15, // Less than 30 days required
      });

      expect(result.allowed).toBe(false);
      expect(result.decision.violations.some((v) => v.code === 'GOOD_CAUSE_NOTICE_PERIOD_INSUFFICIENT')).toBe(true);
    });
  });
});

describe('FCHA Stage Transition Gate', () => {
  describe('NYC', () => {
    it('should block skipping stages', async () => {
      const result = await gateFCHAStageTransition({
        applicationId: 'app_123',
        marketId: 'nyc',
        currentStage: 'application_submitted',
        targetStage: 'background_check',
      });

      expect(result.allowed).toBe(false);
      expect(result.decision.violations.some((v) => v.code === 'FCHA_STAGE_ORDER_VIOLATION')).toBe(true);
    });

    it('should allow sequential stage progression', async () => {
      const result = await gateFCHAStageTransition({
        applicationId: 'app_123',
        marketId: 'nyc',
        currentStage: 'application_submitted',
        targetStage: 'application_review',
      });

      expect(result.allowed).toBe(true);
    });
  });
});

describe('FCHA Background Check Gate', () => {
  describe('NYC', () => {
    it('should block criminal background check before conditional offer', async () => {
      const result = await gateFCHABackgroundCheck({
        applicationId: 'app_123',
        marketId: 'nyc',
        currentStage: 'application_review',
        checkType: 'criminal_background_check',
      });

      expect(result.allowed).toBe(false);
      expect(result.decision.violations.some((v) => v.code === 'FCHA_CRIMINAL_CHECK_BEFORE_OFFER')).toBe(true);
    });

    it('should block credit check before conditional offer', async () => {
      const result = await gateFCHABackgroundCheck({
        applicationId: 'app_123',
        marketId: 'nyc',
        currentStage: 'application_submitted',
        checkType: 'credit_check',
      });

      expect(result.allowed).toBe(false);
    });

    it('should allow background check after conditional offer', async () => {
      const result = await gateFCHABackgroundCheck({
        applicationId: 'app_123',
        marketId: 'nyc',
        currentStage: 'background_check',
        checkType: 'criminal_background_check',
      });

      expect(result.allowed).toBe(true);
    });
  });
});

describe('Security Deposit Change Gate', () => {
  it('should block excessive deposit in NYC', async () => {
    const result = await gateSecurityDepositChange({
      entityId: 'lst_123',
      entityType: 'listing',
      marketId: 'nyc',
      previousDeposit: 3000,
      newDeposit: 6000, // Exceeds 1 month
      monthlyRent: 3000,
    });

    expect(result.allowed).toBe(false);
    expect(result.decision.violations.some((v) => v.code === 'SECURITY_DEPOSIT_EXCESSIVE')).toBe(true);
  });

  it('should allow valid deposit change', async () => {
    const result = await gateSecurityDepositChange({
      entityId: 'lst_123',
      entityType: 'listing',
      marketId: 'nyc',
      previousDeposit: 2500,
      newDeposit: 3000, // 1 month is OK
      monthlyRent: 3000,
    });

    expect(result.allowed).toBe(true);
  });
});

describe('Broker Fee Change Gate', () => {
  it('should block adding broker fee to tenant in NYC', async () => {
    const result = await gateBrokerFeeChange({
      entityId: 'lst_123',
      entityType: 'listing',
      marketId: 'nyc',
      previousBrokerFee: 0,
      newBrokerFee: 3000,
      paidBy: 'tenant',
      monthlyRent: 3000,
    });

    expect(result.allowed).toBe(false);
    expect(result.decision.violations.some((v) => v.code === 'FARE_BROKER_FEE_PROHIBITED')).toBe(true);
  });

  it('should allow broker fee paid by landlord in NYC', async () => {
    const result = await gateBrokerFeeChange({
      entityId: 'lst_123',
      entityType: 'listing',
      marketId: 'nyc',
      previousBrokerFee: 0,
      newBrokerFee: 3000,
      paidBy: 'landlord',
      monthlyRent: 3000,
    });

    expect(result.allowed).toBe(true);
  });
});

describe('Disclosure Requirement Gate', () => {
  it('should block action when required disclosure not delivered', async () => {
    const result = await gateDisclosureRequirement({
      entityId: 'lst_123',
      entityType: 'listing',
      marketId: 'nyc',
      action: 'publish',
      deliveredDisclosures: [],
      acknowledgedDisclosures: [],
    });

    expect(result.allowed).toBe(false);
    expect(result.decision.violations.some((v) => v.code === 'DISCLOSURE_NOT_DELIVERED')).toBe(true);
  });

  it('should allow action when all disclosures delivered', async () => {
    const result = await gateDisclosureRequirement({
      entityId: 'lst_123',
      entityType: 'listing',
      marketId: 'nyc',
      action: 'publish',
      deliveredDisclosures: ['fare_act_disclosure', 'fare_fee_disclosure'],
      acknowledgedDisclosures: [],
    });

    expect(result.allowed).toBe(true);
  });
});

describe('Lease Creation Gate', () => {
  it('should block lease with excessive security deposit', async () => {
    const result = await gateLeaseCreation({
      leaseId: 'lse_123',
      marketId: 'nyc',
      monthlyRent: 3000,
      securityDepositAmount: 6000,
      isRentStabilized: false,
      deliveredDisclosures: ['lead_paint_disclosure', 'bedbug_history', 'tenant_rights_guide'],
      acknowledgedDisclosures: ['lead_paint_disclosure', 'bedbug_history', 'tenant_rights_guide'],
    });

    expect(result.allowed).toBe(false);
    expect(result.decision.violations.some((v) => v.code === 'SECURITY_DEPOSIT_EXCESSIVE')).toBe(true);
  });

  it('should block rent-stabilized lease with preferential > legal rent', async () => {
    const result = await gateLeaseCreation({
      leaseId: 'lse_123',
      marketId: 'nyc',
      monthlyRent: 2000,
      securityDepositAmount: 2000,
      isRentStabilized: true,
      legalRentAmount: 2000,
      preferentialRentAmount: 2500, // Higher than legal!
      deliveredDisclosures: ['lead_paint_disclosure', 'bedbug_history', 'tenant_rights_guide', 'rent_stabilization_notice'],
      acknowledgedDisclosures: ['lead_paint_disclosure', 'bedbug_history', 'tenant_rights_guide', 'rent_stabilization_notice'],
    });

    expect(result.allowed).toBe(false);
    expect(result.decision.violations.some((v) => v.code === 'RENT_STAB_PREFERENTIAL_EXCEEDS_LEGAL')).toBe(true);
  });

  it('should block lease with missing disclosures', async () => {
    const result = await gateLeaseCreation({
      leaseId: 'lse_123',
      marketId: 'nyc',
      monthlyRent: 3000,
      securityDepositAmount: 3000,
      isRentStabilized: false,
      deliveredDisclosures: [],
      acknowledgedDisclosures: [],
    });

    expect(result.allowed).toBe(false);
    expect(result.decision.violations.some((v) => v.code === 'DISCLOSURE_NOT_DELIVERED')).toBe(true);
  });
});

describe('Market Pack Detection', () => {
  it('should use NYC_STRICT for nyc market', async () => {
    const result = await gateListingPublish({
      listingId: 'lst_123',
      marketId: 'nyc',
      status: 'DRAFT',
      hasBrokerFee: false,
      monthlyRent: 3000,
      deliveredDisclosures: ['fare_act_disclosure'],
      acknowledgedDisclosures: [],
    });

    expect(result.decision.marketPack).toBe('NYC_STRICT');
  });

  it('should use NYC_STRICT for manhattan market', async () => {
    const result = await gateListingPublish({
      listingId: 'lst_123',
      marketId: 'manhattan',
      status: 'DRAFT',
      hasBrokerFee: false,
      monthlyRent: 3000,
      deliveredDisclosures: ['fare_act_disclosure'],
      acknowledgedDisclosures: [],
    });

    expect(result.decision.marketPack).toBe('NYC_STRICT');
  });

  it('should use US_STANDARD for unknown market', async () => {
    const result = await gateListingPublish({
      listingId: 'lst_123',
      marketId: 'somewhere_unknown',
      status: 'DRAFT',
      hasBrokerFee: true,
      brokerFeePaidBy: 'tenant',
      monthlyRent: 3000,
      deliveredDisclosures: ['lead_paint_disclosure'],
      acknowledgedDisclosures: ['lead_paint_disclosure'],
    });

    expect(result.decision.marketPack).toBe('US_STANDARD');
    expect(result.allowed).toBe(true); // Broker fee allowed in US_STANDARD
  });
});

describe('Compliance Decision Object', () => {
  it('should include all required fields', async () => {
    const result = await gateListingPublish({
      listingId: 'lst_123',
      marketId: 'nyc',
      status: 'DRAFT',
      hasBrokerFee: false,
      monthlyRent: 3000,
      deliveredDisclosures: ['fare_act_disclosure'],
      acknowledgedDisclosures: [],
    });

    expect(result.decision).toMatchObject({
      passed: expect.any(Boolean),
      violations: expect.any(Array),
      recommendedFixes: expect.any(Array),
      policyVersion: expect.any(String),
      marketPack: expect.any(String),
      marketPackVersion: expect.any(String),
      checkedAt: expect.any(String),
      checksPerformed: expect.any(Array),
    });
  });

  it('should include checksPerformed array', async () => {
    const result = await gateListingPublish({
      listingId: 'lst_123',
      marketId: 'nyc',
      status: 'DRAFT',
      hasBrokerFee: true,
      monthlyRent: 3000,
      securityDepositAmount: 3000,
      deliveredDisclosures: ['fare_act_disclosure'],
      acknowledgedDisclosures: [],
    });

    expect(result.decision.checksPerformed).toContain('fare_act');
    expect(result.decision.checksPerformed).toContain('broker_fee');
    expect(result.decision.checksPerformed).toContain('security_deposit');
    expect(result.decision.checksPerformed).toContain('disclosures');
  });
});
