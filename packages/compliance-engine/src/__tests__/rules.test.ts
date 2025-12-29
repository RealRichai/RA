/**
 * Compliance Engine - NYC Rules Unit Tests
 *
 * Tests for FARE Act, FCHA, Good Cause, and other NYC-specific rules.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { NYC_STRICT_V1, US_STANDARD_V1, UK_GDPR_V1, getMarketPackIdFromMarket } from '../market-packs';
import { FallbackCPIProvider } from '../providers';
import {
  checkFAREActRules,
  checkFCHARules,
  checkGoodCauseRules,
  checkSecurityDepositRules,
  checkBrokerFeeRules,
  checkRentStabilizationRules,
  checkDisclosureRules,
  checkGDPRRules,
} from '../rules';

describe('FARE Act Rules (NYC)', () => {
  const pack = NYC_STRICT_V1;

  describe('Broker Fee Prohibition', () => {
    it('should flag broker fee charged to tenant', () => {
      const result = checkFAREActRules(
        {
          hasBrokerFee: true,
          brokerFeeAmount: 3000,
          monthlyRent: 3000,
        },
        pack
      );

      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]!.code).toBe('FARE_BROKER_FEE_PROHIBITED');
      expect(result.violations[0]!.severity).toBe('critical');
      expect(result.fixes).toHaveLength(1);
      expect(result.fixes[0]!.action).toBe('remove_broker_fee');
    });

    it('should pass when no broker fee', () => {
      const result = checkFAREActRules(
        {
          hasBrokerFee: false,
          monthlyRent: 3000,
        },
        pack
      );

      expect(result.violations).toHaveLength(0);
    });
  });

  describe('Income Requirement', () => {
    it('should flag excessive income requirement (>40x)', () => {
      const result = checkFAREActRules(
        {
          hasBrokerFee: false,
          monthlyRent: 3000,
          incomeRequirementMultiplier: 50,
        },
        pack
      );

      expect(result.violations.some((v) => v.code === 'FARE_INCOME_REQUIREMENT_EXCESSIVE')).toBe(true);
    });

    it('should pass income requirement at 40x', () => {
      const result = checkFAREActRules(
        {
          hasBrokerFee: false,
          monthlyRent: 3000,
          incomeRequirementMultiplier: 40,
        },
        pack
      );

      expect(result.violations.some((v) => v.code === 'FARE_INCOME_REQUIREMENT_EXCESSIVE')).toBe(false);
    });
  });

  describe('Credit Score Threshold', () => {
    it('should flag credit score requirement >650', () => {
      const result = checkFAREActRules(
        {
          hasBrokerFee: false,
          monthlyRent: 3000,
          creditScoreThreshold: 700,
        },
        pack
      );

      expect(result.violations.some((v) => v.code === 'FARE_CREDIT_SCORE_THRESHOLD_EXCESSIVE')).toBe(true);
    });

    it('should pass credit score requirement at 650', () => {
      const result = checkFAREActRules(
        {
          hasBrokerFee: false,
          monthlyRent: 3000,
          creditScoreThreshold: 650,
        },
        pack
      );

      expect(result.violations.some((v) => v.code === 'FARE_CREDIT_SCORE_THRESHOLD_EXCESSIVE')).toBe(false);
    });
  });
});

describe('FCHA Rules (NYC)', () => {
  const pack = NYC_STRICT_V1;

  describe('Background Check Before Conditional Offer', () => {
    it('should block criminal background check before conditional offer', () => {
      const result = checkFCHARules(
        {
          currentStage: 'application_review',
          attemptedAction: 'criminal_background_check',
        },
        pack
      );

      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]!.code).toBe('FCHA_CRIMINAL_CHECK_BEFORE_OFFER');
      expect(result.violations[0]!.severity).toBe('critical');
    });

    it('should block credit check before conditional offer', () => {
      const result = checkFCHARules(
        {
          currentStage: 'application_submitted',
          attemptedAction: 'credit_check',
        },
        pack
      );

      expect(result.violations.some((v) => v.code === 'FCHA_CRIMINAL_CHECK_BEFORE_OFFER')).toBe(true);
    });

    it('should allow background check after conditional offer', () => {
      const result = checkFCHARules(
        {
          currentStage: 'conditional_offer',
          attemptedAction: 'criminal_background_check',
        },
        pack
      );

      expect(result.violations).toHaveLength(0);
    });

    it('should allow background check at background_check stage', () => {
      const result = checkFCHARules(
        {
          currentStage: 'background_check',
          attemptedAction: 'credit_check',
        },
        pack
      );

      expect(result.violations).toHaveLength(0);
    });
  });

  describe('Stage Order Enforcement', () => {
    it('should block skipping stages', () => {
      const result = checkFCHARules(
        {
          currentStage: 'application_submitted',
          attemptedAction: 'stage_transition',
          targetStage: 'background_check',
        },
        pack
      );

      expect(result.violations.some((v) => v.code === 'FCHA_STAGE_ORDER_VIOLATION')).toBe(true);
    });

    it('should allow sequential stage transition', () => {
      const result = checkFCHARules(
        {
          currentStage: 'application_submitted',
          attemptedAction: 'stage_transition',
          targetStage: 'application_review',
        },
        pack
      );

      expect(result.violations).toHaveLength(0);
    });
  });
});

describe('Good Cause Rules (NYC)', () => {
  const pack = NYC_STRICT_V1;
  const mockLogger = vi.fn();
  const cpiProvider = new FallbackCPIProvider(mockLogger);

  beforeEach(() => {
    mockLogger.mockClear();
  });

  describe('Rent Increase Limits', () => {
    it('should flag excessive rent increase (>CPI+5%)', async () => {
      const result = await checkGoodCauseRules(
        {
          checkType: 'rent_increase',
          currentRent: 2000,
          proposedRent: 2400, // 20% increase
        },
        pack,
        cpiProvider
      );

      expect(result.violations.some((v) => v.code === 'GOOD_CAUSE_RENT_INCREASE_EXCESSIVE')).toBe(true);
    });

    it('should pass reasonable rent increase within CPI+5%', async () => {
      const result = await checkGoodCauseRules(
        {
          checkType: 'rent_increase',
          currentRent: 2000,
          proposedRent: 2100, // 5% increase
        },
        pack,
        cpiProvider
      );

      expect(result.violations.filter((v) => v.code === 'GOOD_CAUSE_RENT_INCREASE_EXCESSIVE')).toHaveLength(0);
    });

    it('should log CPI fallback usage', async () => {
      await checkGoodCauseRules(
        {
          checkType: 'rent_increase',
          currentRent: 2000,
          proposedRent: 2100,
        },
        pack,
        cpiProvider
      );

      expect(mockLogger).toHaveBeenCalledWith(
        'CPI_ANNUAL_CHANGE_FALLBACK',
        expect.objectContaining({ source: 'fallback_deterministic' })
      );
    });

    it('should include CPI fallback info violation', async () => {
      const result = await checkGoodCauseRules(
        {
          checkType: 'rent_increase',
          currentRent: 2000,
          proposedRent: 2100,
        },
        pack,
        cpiProvider
      );

      expect(result.violations.some((v) => v.code === 'GOOD_CAUSE_CPI_FALLBACK_USED')).toBe(true);
      expect(result.violations.find((v) => v.code === 'GOOD_CAUSE_CPI_FALLBACK_USED')?.severity).toBe('info');
    });
  });

  describe('Eviction Reasons', () => {
    it('should flag invalid eviction reason', async () => {
      const result = await checkGoodCauseRules(
        {
          checkType: 'eviction',
          evictionReason: 'I want higher rent',
        },
        pack,
        cpiProvider
      );

      expect(result.violations.some((v) => v.code === 'GOOD_CAUSE_EVICTION_INVALID_REASON')).toBe(true);
    });

    it('should pass valid eviction reason', async () => {
      const result = await checkGoodCauseRules(
        {
          checkType: 'eviction',
          evictionReason: 'non_payment',
        },
        pack,
        cpiProvider
      );

      expect(result.violations.some((v) => v.code === 'GOOD_CAUSE_EVICTION_INVALID_REASON')).toBe(false);
    });
  });

  describe('Notice Period', () => {
    it('should flag insufficient notice period', async () => {
      const result = await checkGoodCauseRules(
        {
          checkType: 'rent_increase',
          currentRent: 2000,
          proposedRent: 2050,
          noticeDays: 15,
        },
        pack,
        cpiProvider
      );

      expect(result.violations.some((v) => v.code === 'GOOD_CAUSE_NOTICE_PERIOD_INSUFFICIENT')).toBe(true);
    });

    it('should pass with adequate notice period', async () => {
      const result = await checkGoodCauseRules(
        {
          checkType: 'rent_increase',
          currentRent: 2000,
          proposedRent: 2050,
          noticeDays: 30,
        },
        pack,
        cpiProvider
      );

      expect(result.violations.some((v) => v.code === 'GOOD_CAUSE_NOTICE_PERIOD_INSUFFICIENT')).toBe(false);
    });
  });
});

describe('Security Deposit Rules', () => {
  describe('NYC (1 month max)', () => {
    const pack = NYC_STRICT_V1;

    it('should flag deposit exceeding 1 month', () => {
      const result = checkSecurityDepositRules(
        {
          securityDepositAmount: 4000,
          monthlyRent: 3000,
        },
        pack
      );

      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]!.code).toBe('SECURITY_DEPOSIT_EXCESSIVE');
    });

    it('should pass deposit at 1 month', () => {
      const result = checkSecurityDepositRules(
        {
          securityDepositAmount: 3000,
          monthlyRent: 3000,
        },
        pack
      );

      expect(result.violations).toHaveLength(0);
    });
  });

  describe('US Standard (2 months max)', () => {
    const pack = US_STANDARD_V1;

    it('should flag deposit exceeding 2 months', () => {
      const result = checkSecurityDepositRules(
        {
          securityDepositAmount: 7000,
          monthlyRent: 3000,
        },
        pack
      );

      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]!.code).toBe('SECURITY_DEPOSIT_EXCESSIVE');
    });

    it('should pass deposit at 2 months', () => {
      const result = checkSecurityDepositRules(
        {
          securityDepositAmount: 6000,
          monthlyRent: 3000,
        },
        pack
      );

      expect(result.violations).toHaveLength(0);
    });
  });
});

describe('Rent Stabilization Rules (NYC)', () => {
  const pack = NYC_STRICT_V1;

  it('should flag preferential rent exceeding legal rent', () => {
    const result = checkRentStabilizationRules(
      {
        isRentStabilized: true,
        legalRentAmount: 2000,
        preferentialRentAmount: 2500,
      },
      pack
    );

    expect(result.violations.some((v) => v.code === 'RENT_STAB_PREFERENTIAL_EXCEEDS_LEGAL')).toBe(true);
  });

  it('should flag missing RGB registration', () => {
    const result = checkRentStabilizationRules(
      {
        isRentStabilized: true,
        hasRgbRegistration: false,
      },
      pack
    );

    expect(result.violations.some((v) => v.code === 'RENT_STAB_REGISTRATION_MISSING')).toBe(true);
  });

  it('should pass when rent stabilization not applicable', () => {
    const result = checkRentStabilizationRules(
      {
        isRentStabilized: false,
      },
      pack
    );

    expect(result.violations).toHaveLength(0);
  });
});

describe('Disclosure Rules', () => {
  const pack = NYC_STRICT_V1;

  it('should flag missing required disclosures for listing publish', () => {
    const result = checkDisclosureRules(
      {
        entityType: 'listing',
        deliveredDisclosures: [],
        acknowledgedDisclosures: [],
      },
      pack
    );

    expect(result.violations.some((v) => v.code === 'DISCLOSURE_NOT_DELIVERED')).toBe(true);
    expect(result.violations.some((v) => v.message.includes('fare_act_disclosure'))).toBe(true);
  });

  it('should flag missing acknowledgment for signature-required disclosures', () => {
    const result = checkDisclosureRules(
      {
        entityType: 'lease',
        deliveredDisclosures: ['lead_paint_disclosure', 'bedbug_history', 'tenant_rights_guide'],
        acknowledgedDisclosures: ['lead_paint_disclosure'], // Missing bedbug_history acknowledgment
      },
      pack
    );

    expect(result.violations.some((v) => v.code === 'DISCLOSURE_NOT_ACKNOWLEDGED')).toBe(true);
  });

  it('should pass when all disclosures delivered and acknowledged', () => {
    const result = checkDisclosureRules(
      {
        entityType: 'listing',
        deliveredDisclosures: ['fare_act_disclosure'],
        acknowledgedDisclosures: [],
      },
      pack
    );

    // fare_act_disclosure doesn't require signature
    expect(result.violations.filter((v) => v.message.includes('fare_act_disclosure'))).toHaveLength(0);
  });
});

describe('Broker Fee Rules', () => {
  const pack = NYC_STRICT_V1;

  it('should flag tenant paying broker fee in NYC', () => {
    const result = checkBrokerFeeRules(
      {
        hasBrokerFee: true,
        brokerFeeAmount: 3000,
        monthlyRent: 3000,
        paidBy: 'tenant',
      },
      pack
    );

    expect(result.violations.some((v) => v.code === 'FARE_BROKER_FEE_PROHIBITED')).toBe(true);
  });

  it('should pass when landlord pays broker fee', () => {
    const result = checkBrokerFeeRules(
      {
        hasBrokerFee: true,
        brokerFeeAmount: 3000,
        monthlyRent: 3000,
        paidBy: 'landlord',
      },
      pack
    );

    expect(result.violations.some((v) => v.code === 'FARE_BROKER_FEE_PROHIBITED')).toBe(false);
  });
});

describe('GDPR Rules (UK)', () => {
  const pack = UK_GDPR_V1;

  describe('Consent Requirements', () => {
    it('should flag missing consent', () => {
      const result = checkGDPRRules(
        {
          checkType: 'consent',
          hasConsent: false,
        },
        pack
      );

      expect(result.violations.some((v) => v.code === 'GDPR_CONSENT_MISSING')).toBe(true);
      expect(result.violations.find((v) => v.code === 'GDPR_CONSENT_MISSING')?.severity).toBe('critical');
    });

    it('should flag missing lawful basis', () => {
      const result = checkGDPRRules(
        {
          checkType: 'consent',
          hasConsent: true,
          lawfulBasis: undefined,
        },
        pack
      );

      expect(result.violations.some((v) => v.code === 'GDPR_LAWFUL_BASIS_MISSING')).toBe(true);
    });

    it('should pass when consent and lawful basis provided', () => {
      const result = checkGDPRRules(
        {
          checkType: 'consent',
          hasConsent: true,
          lawfulBasis: 'contract',
        },
        pack
      );

      expect(result.violations.some((v) => v.code === 'GDPR_CONSENT_MISSING')).toBe(false);
      expect(result.violations.some((v) => v.code === 'GDPR_LAWFUL_BASIS_MISSING')).toBe(false);
    });
  });

  describe('Privacy Notice Requirements', () => {
    it('should flag missing privacy notice', () => {
      const result = checkGDPRRules(
        {
          checkType: 'privacy_notice',
          hasPrivacyNotice: false,
        },
        pack
      );

      expect(result.violations.some((v) => v.code === 'GDPR_PRIVACY_NOTICE_MISSING')).toBe(true);
    });

    it('should pass when privacy notice provided', () => {
      const result = checkGDPRRules(
        {
          checkType: 'privacy_notice',
          hasPrivacyNotice: true,
        },
        pack
      );

      expect(result.violations.some((v) => v.code === 'GDPR_PRIVACY_NOTICE_MISSING')).toBe(false);
    });
  });

  describe('Data Subject Request Timing', () => {
    it('should flag overdue data subject request', () => {
      const thirtyFiveDaysAgo = new Date();
      thirtyFiveDaysAgo.setDate(thirtyFiveDaysAgo.getDate() - 35);

      const result = checkGDPRRules(
        {
          checkType: 'data_subject_request',
          requestReceivedAt: thirtyFiveDaysAgo.toISOString(),
        },
        pack
      );

      expect(result.violations.some((v) => v.code === 'GDPR_DATA_SUBJECT_REQUEST_OVERDUE')).toBe(true);
    });

    it('should pass when request is within timeframe', () => {
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

      const result = checkGDPRRules(
        {
          checkType: 'data_subject_request',
          requestReceivedAt: tenDaysAgo.toISOString(),
        },
        pack
      );

      expect(result.violations.some((v) => v.code === 'GDPR_DATA_SUBJECT_REQUEST_OVERDUE')).toBe(false);
    });
  });

  describe('Redaction Policies', () => {
    it('should flag unredacted sensitive fields', () => {
      const result = checkGDPRRules(
        {
          checkType: 'redaction',
          personalDataFields: ['nationalInsuranceNumber', 'bankAccountDetails'],
        },
        pack
      );

      expect(result.violations.some((v) => v.code === 'GDPR_REDACTION_REQUIRED')).toBe(true);
    });

    it('should pass when no sensitive fields present', () => {
      const result = checkGDPRRules(
        {
          checkType: 'redaction',
          personalDataFields: ['name', 'email'],
        },
        pack
      );

      expect(result.violations.some((v) => v.code === 'GDPR_REDACTION_REQUIRED')).toBe(false);
    });
  });
});

describe('UK_GDPR Market Pack', () => {
  it('should be correctly identified for UK markets', () => {
    expect(getMarketPackIdFromMarket('london')).toBe('UK_GDPR');
    expect(getMarketPackIdFromMarket('manchester')).toBe('UK_GDPR');
    expect(getMarketPackIdFromMarket('uk')).toBe('UK_GDPR');
    expect(getMarketPackIdFromMarket('england')).toBe('UK_GDPR');
  });

  it('should have GDPR rules enabled', () => {
    expect(UK_GDPR_V1.rules.gdpr?.enabled).toBe(true);
    expect(UK_GDPR_V1.rules.gdpr?.dataRetentionDays).toBe(2555);
    expect(UK_GDPR_V1.rules.gdpr?.dataSubjectRequestDays).toBe(30);
  });

  it('should have UK-specific disclosures', () => {
    const disclosureTypes = UK_GDPR_V1.rules.disclosures.map((d) => d.type);

    expect(disclosureTypes).toContain('privacy_notice');
    expect(disclosureTypes).toContain('data_processing_agreement');
    expect(disclosureTypes).toContain('how_to_rent_guide');
    expect(disclosureTypes).toContain('epc_certificate');
    expect(disclosureTypes).toContain('deposit_protection_info');
  });
});
