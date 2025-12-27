/**
 * FARE Act Compliance Calculator Tests
 * 
 * Tests for NYC Local Law 18 of 2024 (FARE Act) compliance validation.
 * Effective date: June 11, 2025
 * 
 * Key requirements:
 * - Application fee capped at $20
 * - Security deposit capped at 1 month's rent
 * - Broker fees paid by party who engaged the broker (typically landlord)
 */

import { describe, it, expect, beforeEach } from 'vitest';

// =============================================================================
// FARE ACT CALCULATOR (extracted for testing)
// =============================================================================

const FARE_ACT_MAX_APPLICATION_FEE = 20;
const FARE_ACT_MAX_SECURITY_DEPOSIT_MONTHS = 1;

interface FareActInput {
  market: 'nyc' | 'long_island';
  price: number;
  securityDeposit: number;
  applicationFee: number;
  brokerFee: number;
  brokerFeePaidBy: 'LANDLORD' | 'TENANT';
}

interface FareActViolation {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

interface FareActResult {
  isCompliant: boolean;
  violations: FareActViolation[];
  isNYC: boolean;
  moveInCosts: {
    firstMonth: number;
    securityDeposit: number;
    brokerFee: number;
    applicationFee: number;
    total: number;
  };
  landlordBrokerFee: number;
}

function calculateFareActCompliance(input: FareActInput): FareActResult {
  const isNYC = input.market === 'nyc';
  const violations: FareActViolation[] = [];

  if (isNYC) {
    // FARE Act: Application fee capped at $20
    if (input.applicationFee > FARE_ACT_MAX_APPLICATION_FEE) {
      violations.push({
        field: 'applicationFee',
        message: `Application fee exceeds FARE Act cap of $${FARE_ACT_MAX_APPLICATION_FEE}`,
        severity: 'error',
      });
    }

    // FARE Act: Security deposit limited to 1 month's rent
    if (input.securityDeposit > input.price) {
      violations.push({
        field: 'securityDeposit',
        message: "Security deposit exceeds FARE Act limit of 1 month's rent",
        severity: 'error',
      });
    }

    // FARE Act: Broker fee defaults to landlord payment
    if (input.brokerFeePaidBy === 'TENANT' && input.brokerFee > 0) {
      violations.push({
        field: 'brokerFeePaidBy',
        message: 'Under FARE Act, broker fees are paid by the party who engaged the broker (typically landlord)',
        severity: 'warning',
      });
    }
  }

  // Calculate move-in costs
  const landlordBrokerFee = input.brokerFeePaidBy === 'LANDLORD' ? input.brokerFee : 0;
  const tenantBrokerFee = input.brokerFeePaidBy === 'TENANT' ? input.brokerFee : 0;

  const moveInCosts = {
    firstMonth: input.price,
    securityDeposit: Math.min(input.securityDeposit, isNYC ? input.price : input.securityDeposit),
    brokerFee: tenantBrokerFee,
    applicationFee: Math.min(input.applicationFee, isNYC ? FARE_ACT_MAX_APPLICATION_FEE : input.applicationFee),
    total: 0,
  };
  moveInCosts.total = moveInCosts.firstMonth + moveInCosts.securityDeposit + moveInCosts.brokerFee + moveInCosts.applicationFee;

  return {
    isCompliant: violations.filter(v => v.severity === 'error').length === 0,
    violations,
    isNYC,
    moveInCosts,
    landlordBrokerFee,
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('FARE Act Compliance Calculator', () => {
  describe('NYC Market (FARE Act applies)', () => {
    const baseNYCInput: FareActInput = {
      market: 'nyc',
      price: 3000,
      securityDeposit: 3000,
      applicationFee: 20,
      brokerFee: 0,
      brokerFeePaidBy: 'LANDLORD',
    };

    it('should be compliant with valid NYC listing', () => {
      const result = calculateFareActCompliance(baseNYCInput);
      
      expect(result.isCompliant).toBe(true);
      expect(result.isNYC).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should flag application fee above $20 as error', () => {
      const input: FareActInput = {
        ...baseNYCInput,
        applicationFee: 50,
      };
      
      const result = calculateFareActCompliance(input);
      
      expect(result.isCompliant).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].field).toBe('applicationFee');
      expect(result.violations[0].severity).toBe('error');
    });

    it('should cap application fee at $20 in move-in costs', () => {
      const input: FareActInput = {
        ...baseNYCInput,
        applicationFee: 100,
      };
      
      const result = calculateFareActCompliance(input);
      
      expect(result.moveInCosts.applicationFee).toBe(20);
    });

    it('should flag security deposit above 1 month rent as error', () => {
      const input: FareActInput = {
        ...baseNYCInput,
        securityDeposit: 6000, // 2 months
      };
      
      const result = calculateFareActCompliance(input);
      
      expect(result.isCompliant).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].field).toBe('securityDeposit');
      expect(result.violations[0].severity).toBe('error');
    });

    it('should cap security deposit at 1 month in move-in costs', () => {
      const input: FareActInput = {
        ...baseNYCInput,
        securityDeposit: 6000,
      };
      
      const result = calculateFareActCompliance(input);
      
      expect(result.moveInCosts.securityDeposit).toBe(3000);
    });

    it('should flag tenant-paid broker fee as warning (not error)', () => {
      const input: FareActInput = {
        ...baseNYCInput,
        brokerFee: 4500,
        brokerFeePaidBy: 'TENANT',
      };
      
      const result = calculateFareActCompliance(input);
      
      // Warnings don't affect compliance status
      expect(result.isCompliant).toBe(true);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].field).toBe('brokerFeePaidBy');
      expect(result.violations[0].severity).toBe('warning');
    });

    it('should include tenant broker fee in move-in costs', () => {
      const input: FareActInput = {
        ...baseNYCInput,
        brokerFee: 4500,
        brokerFeePaidBy: 'TENANT',
      };
      
      const result = calculateFareActCompliance(input);
      
      expect(result.moveInCosts.brokerFee).toBe(4500);
      expect(result.landlordBrokerFee).toBe(0);
    });

    it('should exclude landlord broker fee from move-in costs', () => {
      const input: FareActInput = {
        ...baseNYCInput,
        brokerFee: 4500,
        brokerFeePaidBy: 'LANDLORD',
      };
      
      const result = calculateFareActCompliance(input);
      
      expect(result.moveInCosts.brokerFee).toBe(0);
      expect(result.landlordBrokerFee).toBe(4500);
    });

    it('should calculate correct total move-in cost', () => {
      const input: FareActInput = {
        market: 'nyc',
        price: 3500,
        securityDeposit: 3500,
        applicationFee: 20,
        brokerFee: 0,
        brokerFeePaidBy: 'LANDLORD',
      };
      
      const result = calculateFareActCompliance(input);
      
      expect(result.moveInCosts.total).toBe(3500 + 3500 + 0 + 20);
      expect(result.moveInCosts.total).toBe(7020);
    });

    it('should accumulate multiple violations', () => {
      const input: FareActInput = {
        market: 'nyc',
        price: 3000,
        securityDeposit: 9000, // 3 months - error
        applicationFee: 100,   // over $20 - error
        brokerFee: 4500,
        brokerFeePaidBy: 'TENANT', // warning
      };
      
      const result = calculateFareActCompliance(input);
      
      expect(result.isCompliant).toBe(false);
      expect(result.violations).toHaveLength(3);
      expect(result.violations.filter(v => v.severity === 'error')).toHaveLength(2);
      expect(result.violations.filter(v => v.severity === 'warning')).toHaveLength(1);
    });

    it('should handle zero values correctly', () => {
      const input: FareActInput = {
        market: 'nyc',
        price: 0,
        securityDeposit: 0,
        applicationFee: 0,
        brokerFee: 0,
        brokerFeePaidBy: 'LANDLORD',
      };
      
      const result = calculateFareActCompliance(input);
      
      expect(result.isCompliant).toBe(true);
      expect(result.moveInCosts.total).toBe(0);
    });

    it('should allow exactly $20 application fee', () => {
      const input: FareActInput = {
        ...baseNYCInput,
        applicationFee: 20,
      };
      
      const result = calculateFareActCompliance(input);
      
      expect(result.isCompliant).toBe(true);
      expect(result.violations.filter(v => v.field === 'applicationFee')).toHaveLength(0);
    });

    it('should allow security deposit exactly equal to rent', () => {
      const input: FareActInput = {
        ...baseNYCInput,
        price: 4000,
        securityDeposit: 4000,
      };
      
      const result = calculateFareActCompliance(input);
      
      expect(result.isCompliant).toBe(true);
      expect(result.violations.filter(v => v.field === 'securityDeposit')).toHaveLength(0);
    });
  });

  describe('Long Island Market (FARE Act does not apply)', () => {
    const baseLIInput: FareActInput = {
      market: 'long_island',
      price: 3000,
      securityDeposit: 6000,
      applicationFee: 100,
      brokerFee: 4500,
      brokerFeePaidBy: 'TENANT',
    };

    it('should be compliant regardless of fees', () => {
      const result = calculateFareActCompliance(baseLIInput);
      
      expect(result.isCompliant).toBe(true);
      expect(result.isNYC).toBe(false);
      expect(result.violations).toHaveLength(0);
    });

    it('should allow application fee above $20', () => {
      const input: FareActInput = {
        ...baseLIInput,
        applicationFee: 150,
      };
      
      const result = calculateFareActCompliance(input);
      
      expect(result.isCompliant).toBe(true);
      expect(result.moveInCosts.applicationFee).toBe(150);
    });

    it('should allow security deposit above 1 month', () => {
      const input: FareActInput = {
        ...baseLIInput,
        securityDeposit: 9000, // 3 months
      };
      
      const result = calculateFareActCompliance(input);
      
      expect(result.isCompliant).toBe(true);
      expect(result.moveInCosts.securityDeposit).toBe(9000);
    });

    it('should allow tenant-paid broker fees without warning', () => {
      const result = calculateFareActCompliance(baseLIInput);
      
      expect(result.violations).toHaveLength(0);
      expect(result.moveInCosts.brokerFee).toBe(4500);
    });

    it('should calculate full move-in costs without caps', () => {
      const input: FareActInput = {
        market: 'long_island',
        price: 3000,
        securityDeposit: 6000,
        applicationFee: 100,
        brokerFee: 4500,
        brokerFeePaidBy: 'TENANT',
      };
      
      const result = calculateFareActCompliance(input);
      
      expect(result.moveInCosts.firstMonth).toBe(3000);
      expect(result.moveInCosts.securityDeposit).toBe(6000);
      expect(result.moveInCosts.applicationFee).toBe(100);
      expect(result.moveInCosts.brokerFee).toBe(4500);
      expect(result.moveInCosts.total).toBe(13600);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very high rent amounts', () => {
      const input: FareActInput = {
        market: 'nyc',
        price: 50000, // luxury rental
        securityDeposit: 50000,
        applicationFee: 20,
        brokerFee: 75000, // 15%
        brokerFeePaidBy: 'LANDLORD',
      };
      
      const result = calculateFareActCompliance(input);
      
      expect(result.isCompliant).toBe(true);
      expect(result.moveInCosts.total).toBe(100020); // 50k + 50k + 20
    });

    it('should handle decimal values', () => {
      const input: FareActInput = {
        market: 'nyc',
        price: 2999.99,
        securityDeposit: 2999.99,
        applicationFee: 19.99,
        brokerFee: 0,
        brokerFeePaidBy: 'LANDLORD',
      };
      
      const result = calculateFareActCompliance(input);
      
      expect(result.isCompliant).toBe(true);
    });

    it('should flag $20.01 application fee as violation', () => {
      const input: FareActInput = {
        market: 'nyc',
        price: 3000,
        securityDeposit: 3000,
        applicationFee: 20.01,
        brokerFee: 0,
        brokerFeePaidBy: 'LANDLORD',
      };
      
      const result = calculateFareActCompliance(input);
      
      expect(result.isCompliant).toBe(false);
      expect(result.violations[0].field).toBe('applicationFee');
    });

    it('should flag security deposit $1 over rent as violation', () => {
      const input: FareActInput = {
        market: 'nyc',
        price: 3000,
        securityDeposit: 3001,
        applicationFee: 20,
        brokerFee: 0,
        brokerFeePaidBy: 'LANDLORD',
      };
      
      const result = calculateFareActCompliance(input);
      
      expect(result.isCompliant).toBe(false);
      expect(result.violations[0].field).toBe('securityDeposit');
    });
  });
});

describe('Move-In Cost Calculator', () => {
  it('should calculate correct total for typical NYC listing', () => {
    const input: FareActInput = {
      market: 'nyc',
      price: 3500,
      securityDeposit: 3500,
      applicationFee: 20,
      brokerFee: 0,
      brokerFeePaidBy: 'LANDLORD',
    };
    
    const result = calculateFareActCompliance(input);
    
    // First month + security + app fee = 3500 + 3500 + 20 = 7020
    expect(result.moveInCosts.total).toBe(7020);
  });

  it('should calculate correct total for Long Island with broker fee', () => {
    const input: FareActInput = {
      market: 'long_island',
      price: 2800,
      securityDeposit: 5600, // 2 months
      applicationFee: 75,
      brokerFee: 4200, // 1.5 months
      brokerFeePaidBy: 'TENANT',
    };
    
    const result = calculateFareActCompliance(input);
    
    // 2800 + 5600 + 75 + 4200 = 12675
    expect(result.moveInCosts.total).toBe(12675);
  });

  it('should separate landlord and tenant broker fees correctly', () => {
    const landlordPays: FareActInput = {
      market: 'nyc',
      price: 3000,
      securityDeposit: 3000,
      applicationFee: 20,
      brokerFee: 4500,
      brokerFeePaidBy: 'LANDLORD',
    };
    
    const tenantPays: FareActInput = {
      ...landlordPays,
      brokerFeePaidBy: 'TENANT',
    };
    
    const landlordResult = calculateFareActCompliance(landlordPays);
    const tenantResult = calculateFareActCompliance(tenantPays);
    
    expect(landlordResult.landlordBrokerFee).toBe(4500);
    expect(landlordResult.moveInCosts.brokerFee).toBe(0);
    expect(landlordResult.moveInCosts.total).toBe(6020);
    
    expect(tenantResult.landlordBrokerFee).toBe(0);
    expect(tenantResult.moveInCosts.brokerFee).toBe(4500);
    expect(tenantResult.moveInCosts.total).toBe(10520);
  });
});
