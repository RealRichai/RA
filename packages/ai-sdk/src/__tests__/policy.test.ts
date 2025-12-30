/**
 * Policy Gate Tests
 *
 * Tests for AI output policy checking and compliance enforcement.
 */

import { describe, it, expect } from 'vitest';

import {
  gateAIOutput,
  getMarketRules,
  NYC_STRICT_RULES,
  US_STANDARD_RULES,
  CA_STANDARD_RULES,
} from '../policy/gate';
import {
  checkAIFeeStructures,
  checkAIFCHACompliance,
  checkAllPolicyRules,
} from '../policy/rules';

describe('Fee Structure Rules', () => {
  describe('checkAIFeeStructures', () => {
    it('should detect tenant broker fee violations in NYC', () => {
      const input = {
        content:
          'The tenant is responsible for paying the broker fee of 15% of annual rent.',
        marketId: 'nyc',
      };

      const result = checkAIFeeStructures(input, NYC_STRICT_RULES);

      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]?.code).toBe(
        'AI_SUGGESTED_ILLEGAL_BROKER_FEE'
      );
      expect(result.violations[0]?.severity).toBe('critical');
    });

    it('should not flag landlord-paid broker fees', () => {
      const input = {
        content:
          'The landlord will cover the broker fee. Tenant pays no broker fee.',
        marketId: 'nyc',
      };

      const result = checkAIFeeStructures(input, NYC_STRICT_RULES);

      expect(
        result.violations.filter(
          (v) => v.code === 'AI_SUGGESTED_ILLEGAL_BROKER_FEE'
        )
      ).toHaveLength(0);
    });

    it('should detect excessive security deposit', () => {
      const input = {
        content:
          'The security deposit is 3 months rent, which is standard for this area.',
        marketId: 'nyc',
      };

      const result = checkAIFeeStructures(input, NYC_STRICT_RULES);

      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]?.code).toBe(
        'AI_SUGGESTED_EXCESSIVE_SECURITY_DEPOSIT'
      );
    });

    it('should allow compliant security deposit', () => {
      const input = {
        content:
          'The security deposit equals one month of rent, as required by law.',
        marketId: 'nyc',
      };

      const result = checkAIFeeStructures(input, NYC_STRICT_RULES);

      expect(
        result.violations.filter(
          (v) => v.code === 'AI_SUGGESTED_EXCESSIVE_SECURITY_DEPOSIT'
        )
      ).toHaveLength(0);
    });

    it('should allow higher deposits in standard US markets', () => {
      const input = {
        content:
          'The security deposit is 2 months rent, typical for this property.',
        marketId: 'us-standard',
      };

      const result = checkAIFeeStructures(input, US_STANDARD_RULES);

      expect(
        result.violations.filter(
          (v) => v.code === 'AI_SUGGESTED_EXCESSIVE_SECURITY_DEPOSIT'
        )
      ).toHaveLength(0);
    });

    it('should provide fix suggestions for violations', () => {
      const input = {
        content: 'Tenant pays the broker fee.',
        marketId: 'nyc',
      };

      const result = checkAIFeeStructures(input, NYC_STRICT_RULES);

      expect(result.fixes.length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('FCHA Compliance Rules', () => {
  describe('checkAIFCHACompliance', () => {
    it('should detect premature background check suggestion', () => {
      const input = {
        content:
          'We should run a background check on the applicant before proceeding.',
        marketId: 'nyc',
        context: {
          applicationStage: 'initial_inquiry',
        },
      };

      const result = checkAIFCHACompliance(input, NYC_STRICT_RULES.fcha);

      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]?.code).toBe(
        'AI_SUGGESTED_PREMATURE_BACKGROUND_CHECK'
      );
    });

    it('should detect premature credit check suggestion', () => {
      const input = {
        content:
          'We need to run their credit check before moving forward.',
        marketId: 'nyc',
        context: {
          applicationStage: 'application_submitted',
        },
      };

      const result = checkAIFCHACompliance(input, NYC_STRICT_RULES.fcha);

      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]?.code).toBe(
        'AI_SUGGESTED_PREMATURE_BACKGROUND_CHECK'
      );
    });

    it('should allow background check at conditional offer stage', () => {
      const input = {
        content:
          'Now that you have made a conditional offer, we can run the background check.',
        marketId: 'nyc',
        context: {
          applicationStage: 'conditional_offer',
        },
      };

      const result = checkAIFCHACompliance(input, NYC_STRICT_RULES.fcha);

      expect(result.violations).toHaveLength(0);
    });

    it('should detect criminal history check at pre-offer stage', () => {
      const input = {
        content:
          'We must run a criminal background check on the applicant.',
        marketId: 'nyc',
        context: {
          applicationStage: 'application_submitted',
        },
      };

      const result = checkAIFCHACompliance(input, NYC_STRICT_RULES.fcha);

      expect(
        result.violations.some(
          (v) => v.code === 'AI_SUGGESTED_PREMATURE_BACKGROUND_CHECK'
        )
      ).toBe(true);
    });
  });
});

describe('Combined Policy Rules', () => {
  describe('checkAllPolicyRules', () => {
    it('should check all rules and combine violations', () => {
      const input = {
        content: `
          The tenant must pay the broker fee upfront.
          We should run a background check before reviewing their application.
        `,
        marketId: 'nyc',
        context: {
          applicationStage: 'initial_inquiry',
        },
      };

      const result = checkAllPolicyRules(input, NYC_STRICT_RULES);

      expect(result.violations.length).toBeGreaterThanOrEqual(2);
      expect(
        result.violations.some((v: { code: string }) =>
          v.code.includes('BROKER_FEE')
        )
      ).toBe(true);
      expect(
        result.violations.some((v: { code: string }) =>
          v.code.includes('BACKGROUND_CHECK')
        )
      ).toBe(true);
    });
  });
});

describe('Policy Gate', () => {
  describe('getMarketRules', () => {
    it('should return NYC rules for NYC market', () => {
      const rules = getMarketRules('nyc');
      expect(rules.brokerFeeTenantProhibited).toBe(true);
      expect(rules.maxSecurityDepositMonths).toBe(1);
    });

    it('should return CA rules for California markets', () => {
      const rules = getMarketRules('ca-la');
      expect(rules.maxSecurityDepositMonths).toBe(2);
    });

    it('should return standard rules for unknown markets', () => {
      const rules = getMarketRules('unknown-market');
      expect(rules.maxSecurityDepositMonths).toBe(2);
    });
  });

  describe('gateAIOutput', () => {
    it('should allow compliant content', () => {
      const result = gateAIOutput({
        content:
          'The landlord pays the broker fee. Security deposit is one month.',
        marketId: 'nyc',
      });

      expect(result.allowed).toBe(true);
      expect(result.blockedReason).toBeUndefined();
    });

    it('should block critical violations', () => {
      const result = gateAIOutput({
        content: 'Tenant must pay broker fee of $5000.',
        marketId: 'nyc',
      });

      expect(result.allowed).toBe(false);
      expect(result.blockedReason).toBeDefined();
    });

    it('should provide sanitized output option', () => {
      const result = gateAIOutput({
        content: 'The tenant pays the broker fee.',
        marketId: 'nyc',
      });

      expect(result.sanitizedOutput).toBeDefined();
    });

    it('should include check result details', () => {
      const result = gateAIOutput({
        content: 'Tenant pays broker fee.',
        marketId: 'nyc',
      });

      expect(result.checkResult).toBeDefined();
      expect(result.checkResult.violations.length).toBeGreaterThan(0);
    });

    it('should handle FCHA context', () => {
      const result = gateAIOutput({
        content: 'We should run a background check before reviewing the application.',
        marketId: 'nyc',
        context: {
          applicationStage: 'initial_inquiry',
        },
      });

      expect(result.allowed).toBe(false);
      expect(
        result.checkResult.violations.some(
          (v) => v.code === 'AI_SUGGESTED_PREMATURE_BACKGROUND_CHECK'
        )
      ).toBe(true);
    });

    it('should pass through compliant FCHA stages', () => {
      const result = gateAIOutput({
        content: 'We can now run the background check on the applicant.',
        marketId: 'nyc',
        context: {
          applicationStage: 'conditional_offer',
        },
      });

      expect(result.allowed).toBe(true);
    });
  });
});

describe('Market Rules Constants', () => {
  describe('NYC_STRICT_RULES', () => {
    it('should prohibit tenant broker fees', () => {
      expect(NYC_STRICT_RULES.brokerFeeTenantProhibited).toBe(true);
    });

    it('should limit security deposit to 1 month', () => {
      expect(NYC_STRICT_RULES.maxSecurityDepositMonths).toBe(1);
    });

    it('should have FCHA rules', () => {
      expect(NYC_STRICT_RULES.fcha).toBeDefined();
      expect(NYC_STRICT_RULES.fcha.enabled).toBe(true);
    });
  });

  describe('US_STANDARD_RULES', () => {
    it('should allow tenant broker fees', () => {
      expect(US_STANDARD_RULES.brokerFeeTenantProhibited).toBe(false);
    });

    it('should allow up to 2 months security deposit', () => {
      expect(US_STANDARD_RULES.maxSecurityDepositMonths).toBe(2);
    });
  });

  describe('CA_STANDARD_RULES', () => {
    it('should limit security deposit to 2 months', () => {
      expect(CA_STANDARD_RULES.maxSecurityDepositMonths).toBe(2);
    });

    it('should apply California-specific FCHA rules', () => {
      expect(CA_STANDARD_RULES.fcha).toBeDefined();
    });
  });
});
