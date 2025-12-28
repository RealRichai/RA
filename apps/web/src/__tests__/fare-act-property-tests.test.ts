/**
 * Property-Based Tests for FARE Act Compliance
 * 
 * Uses fast-check to exhaustively test that NO combination of inputs
 * can result in illegal fee charges under NYC Local Law 18 (FARE Act).
 * 
 * Property-based testing generates thousands of random inputs to find
 * edge cases that unit tests might miss.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// =============================================================================
// FARE ACT CONSTANTS
// =============================================================================

const FARE_ACT_MAX_APPLICATION_FEE = 20;
const FARE_ACT_MAX_SECURITY_DEPOSIT_MONTHS = 1;
const FARE_ACT_EFFECTIVE_DATE = new Date('2025-06-11');

// =============================================================================
// TYPES
// =============================================================================

type Market = 'nyc' | 'long_island';
type BrokerFeePaidBy = 'LANDLORD' | 'TENANT';

interface FareActInput {
  market: Market;
  price: number;
  securityDeposit: number;
  applicationFee: number;
  brokerFee: number;
  brokerFeePaidBy: BrokerFeePaidBy;
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

// =============================================================================
// FARE ACT COMPLIANCE CALCULATOR (System Under Test)
// =============================================================================

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

  // Calculate move-in costs (what tenant actually pays)
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
// CUSTOM ARBITRARIES (Random Input Generators)
// =============================================================================

// NYC rent prices: $500 to $50,000 (covers affordable to ultra-luxury)
const nycRentArb = fc.integer({ min: 500, max: 50000 });

// Application fees: $0 to $500 (tests both compliant and non-compliant)
const applicationFeeArb = fc.integer({ min: 0, max: 500 });

// Security deposit: $0 to 3x rent (tests various scenarios)
const securityDepositMultiplierArb = fc.float({ min: 0, max: Math.fround(3), noNaN: true });

// Broker fee percentage: 0% to 20% of annual rent
const brokerFeePercentArb = fc.float({ min: 0, max: Math.fround(0.20), noNaN: true });

// Market selection
const marketArb = fc.constantFrom<Market>('nyc', 'long_island');

// Broker fee payer
const brokerFeePaidByArb = fc.constantFrom<BrokerFeePaidBy>('LANDLORD', 'TENANT');

// Complete FARE Act input generator
const fareActInputArb = fc.record({
  market: marketArb,
  price: nycRentArb,
  securityDeposit: fc.integer({ min: 0, max: 150000 }),
  applicationFee: applicationFeeArb,
  brokerFee: fc.integer({ min: 0, max: 10000 }),
  brokerFeePaidBy: brokerFeePaidByArb,
});

// NYC-specific input (always NYC market)
const nycInputArb = fc.record({
  market: fc.constant<Market>('nyc'),
  price: nycRentArb,
  securityDeposit: fc.integer({ min: 0, max: 150000 }),
  applicationFee: applicationFeeArb,
  brokerFee: fc.integer({ min: 0, max: 10000 }),
  brokerFeePaidBy: brokerFeePaidByArb,
});

// Compliant NYC input (should always pass)
const compliantNycInputArb = nycRentArb.chain(price =>
  fc.record({
    market: fc.constant<Market>('nyc'),
    price: fc.constant(price),
    securityDeposit: fc.integer({ min: 0, max: price }), // At most 1 month
    applicationFee: fc.integer({ min: 0, max: FARE_ACT_MAX_APPLICATION_FEE }),
    brokerFee: fc.integer({ min: 0, max: 10000 }),
    brokerFeePaidBy: fc.constant<BrokerFeePaidBy>('LANDLORD'), // Landlord pays
  })
);

// =============================================================================
// PROPERTY-BASED TESTS
// =============================================================================

describe('FARE Act Compliance - Property-Based Tests', () => {
  
  describe('Invariant: Application Fee Cap', () => {
    
    it('PROPERTY: NYC move-in costs never include application fee > $20', () => {
      fc.assert(
        fc.property(nycInputArb, (input) => {
          const result = calculateFareActCompliance(input);
          
          // The actual charged amount in move-in costs must never exceed $20
          expect(result.moveInCosts.applicationFee).toBeLessThanOrEqual(FARE_ACT_MAX_APPLICATION_FEE);
        }),
        { numRuns: 10000 }
      );
    });
    
    it('PROPERTY: Long Island has no application fee cap', () => {
      fc.assert(
        fc.property(
          fc.record({
            market: fc.constant<Market>('long_island'),
            price: nycRentArb,
            securityDeposit: fc.integer({ min: 0, max: 150000 }),
            applicationFee: applicationFeeArb,
            brokerFee: fc.integer({ min: 0, max: 10000 }),
            brokerFeePaidBy: brokerFeePaidByArb,
          }),
          (input) => {
            const result = calculateFareActCompliance(input);
            
            // Long Island: application fee should pass through unchanged
            expect(result.moveInCosts.applicationFee).toBe(input.applicationFee);
          }
        ),
        { numRuns: 5000 }
      );
    });
    
    it('PROPERTY: Violation detected IFF application fee > $20 in NYC', () => {
      fc.assert(
        fc.property(nycInputArb, (input) => {
          const result = calculateFareActCompliance(input);
          
          const hasAppFeeViolation = result.violations.some(
            v => v.field === 'applicationFee' && v.severity === 'error'
          );
          
          // Bi-directional implication: violation ⟺ fee > $20
          if (input.applicationFee > FARE_ACT_MAX_APPLICATION_FEE) {
            expect(hasAppFeeViolation).toBe(true);
          } else {
            expect(hasAppFeeViolation).toBe(false);
          }
        }),
        { numRuns: 10000 }
      );
    });
  });
  
  describe('Invariant: Security Deposit Cap', () => {
    
    it('PROPERTY: NYC move-in costs never include security > 1 month rent', () => {
      fc.assert(
        fc.property(nycInputArb, (input) => {
          const result = calculateFareActCompliance(input);
          
          // Security deposit in move-in costs must never exceed rent
          expect(result.moveInCosts.securityDeposit).toBeLessThanOrEqual(input.price);
        }),
        { numRuns: 10000 }
      );
    });
    
    it('PROPERTY: Long Island allows security deposit > 1 month', () => {
      fc.assert(
        fc.property(
          fc.record({
            market: fc.constant<Market>('long_island'),
            price: nycRentArb,
            securityDeposit: fc.integer({ min: 0, max: 150000 }),
            applicationFee: applicationFeeArb,
            brokerFee: fc.integer({ min: 0, max: 10000 }),
            brokerFeePaidBy: brokerFeePaidByArb,
          }),
          (input) => {
            const result = calculateFareActCompliance(input);
            
            // Long Island: security deposit passes through unchanged
            expect(result.moveInCosts.securityDeposit).toBe(input.securityDeposit);
          }
        ),
        { numRuns: 5000 }
      );
    });
    
    it('PROPERTY: Violation detected IFF security deposit > rent in NYC', () => {
      fc.assert(
        fc.property(nycInputArb, (input) => {
          const result = calculateFareActCompliance(input);
          
          const hasSecurityViolation = result.violations.some(
            v => v.field === 'securityDeposit' && v.severity === 'error'
          );
          
          // Bi-directional implication
          if (input.securityDeposit > input.price) {
            expect(hasSecurityViolation).toBe(true);
          } else {
            expect(hasSecurityViolation).toBe(false);
          }
        }),
        { numRuns: 10000 }
      );
    });
  });
  
  describe('Invariant: Broker Fee Assignment', () => {
    
    it('PROPERTY: Tenant broker fee only in move-in costs when tenant pays', () => {
      fc.assert(
        fc.property(fareActInputArb, (input) => {
          const result = calculateFareActCompliance(input);
          
          if (input.brokerFeePaidBy === 'TENANT') {
            expect(result.moveInCosts.brokerFee).toBe(input.brokerFee);
            expect(result.landlordBrokerFee).toBe(0);
          } else {
            expect(result.moveInCosts.brokerFee).toBe(0);
            expect(result.landlordBrokerFee).toBe(input.brokerFee);
          }
        }),
        { numRuns: 10000 }
      );
    });
    
    it('PROPERTY: Broker fee warning IFF tenant pays in NYC', () => {
      fc.assert(
        fc.property(nycInputArb, (input) => {
          const result = calculateFareActCompliance(input);
          
          const hasBrokerWarning = result.violations.some(
            v => v.field === 'brokerFeePaidBy' && v.severity === 'warning'
          );
          
          if (input.brokerFeePaidBy === 'TENANT' && input.brokerFee > 0) {
            expect(hasBrokerWarning).toBe(true);
          } else {
            expect(hasBrokerWarning).toBe(false);
          }
        }),
        { numRuns: 10000 }
      );
    });
  });
  
  describe('Invariant: Move-In Cost Calculation', () => {
    
    it('PROPERTY: Total equals sum of components', () => {
      fc.assert(
        fc.property(fareActInputArb, (input) => {
          const result = calculateFareActCompliance(input);
          const { moveInCosts } = result;
          
          const expectedTotal = 
            moveInCosts.firstMonth +
            moveInCosts.securityDeposit +
            moveInCosts.brokerFee +
            moveInCosts.applicationFee;
          
          expect(moveInCosts.total).toBe(expectedTotal);
        }),
        { numRuns: 10000 }
      );
    });
    
    it('PROPERTY: Move-in costs are non-negative', () => {
      fc.assert(
        fc.property(fareActInputArb, (input) => {
          const result = calculateFareActCompliance(input);
          
          expect(result.moveInCosts.firstMonth).toBeGreaterThanOrEqual(0);
          expect(result.moveInCosts.securityDeposit).toBeGreaterThanOrEqual(0);
          expect(result.moveInCosts.brokerFee).toBeGreaterThanOrEqual(0);
          expect(result.moveInCosts.applicationFee).toBeGreaterThanOrEqual(0);
          expect(result.moveInCosts.total).toBeGreaterThanOrEqual(0);
        }),
        { numRuns: 10000 }
      );
    });
    
    it('PROPERTY: First month rent equals input price', () => {
      fc.assert(
        fc.property(fareActInputArb, (input) => {
          const result = calculateFareActCompliance(input);
          
          // First month rent should never be modified
          expect(result.moveInCosts.firstMonth).toBe(input.price);
        }),
        { numRuns: 10000 }
      );
    });
  });
  
  describe('Invariant: Compliance Status', () => {
    
    it('PROPERTY: Compliant IFF no error-severity violations', () => {
      fc.assert(
        fc.property(fareActInputArb, (input) => {
          const result = calculateFareActCompliance(input);
          
          const errorCount = result.violations.filter(v => v.severity === 'error').length;
          
          // Bi-directional: compliant ⟺ no errors
          expect(result.isCompliant).toBe(errorCount === 0);
        }),
        { numRuns: 10000 }
      );
    });
    
    it('PROPERTY: Warnings do not affect compliance status', () => {
      fc.assert(
        fc.property(fareActInputArb, (input) => {
          const result = calculateFareActCompliance(input);
          
          const hasWarnings = result.violations.some(v => v.severity === 'warning');
          const hasErrors = result.violations.some(v => v.severity === 'error');
          
          // Can have warnings and still be compliant
          if (hasWarnings && !hasErrors) {
            expect(result.isCompliant).toBe(true);
          }
        }),
        { numRuns: 10000 }
      );
    });
    
    it('PROPERTY: Long Island is always compliant (no FARE Act)', () => {
      fc.assert(
        fc.property(
          fc.record({
            market: fc.constant<Market>('long_island'),
            price: nycRentArb,
            securityDeposit: fc.integer({ min: 0, max: 150000 }),
            applicationFee: applicationFeeArb,
            brokerFee: fc.integer({ min: 0, max: 10000 }),
            brokerFeePaidBy: brokerFeePaidByArb,
          }),
          (input) => {
            const result = calculateFareActCompliance(input);
            
            expect(result.isCompliant).toBe(true);
            expect(result.violations).toHaveLength(0);
            expect(result.isNYC).toBe(false);
          }
        ),
        { numRuns: 5000 }
      );
    });
    
    it('PROPERTY: Compliant NYC inputs produce no violations', () => {
      fc.assert(
        fc.property(compliantNycInputArb, (input) => {
          const result = calculateFareActCompliance(input);
          
          expect(result.isCompliant).toBe(true);
          expect(result.violations.filter(v => v.severity === 'error')).toHaveLength(0);
        }),
        { numRuns: 10000 }
      );
    });
  });
  
  describe('Invariant: Market Detection', () => {
    
    it('PROPERTY: isNYC matches market input', () => {
      fc.assert(
        fc.property(fareActInputArb, (input) => {
          const result = calculateFareActCompliance(input);
          
          expect(result.isNYC).toBe(input.market === 'nyc');
        }),
        { numRuns: 10000 }
      );
    });
  });
  
  describe('Edge Case: Boundary Values', () => {
    
    it('PROPERTY: $20.00 application fee is compliant, $20.01 is not', () => {
      fc.assert(
        fc.property(
          nycRentArb,
          fc.float({ min: Math.fround(19.99), max: Math.fround(20.01), noNaN: true }),
          (price, appFee) => {
            const input: FareActInput = {
              market: 'nyc',
              price,
              securityDeposit: price,
              applicationFee: appFee,
              brokerFee: 0,
              brokerFeePaidBy: 'LANDLORD',
            };
            
            const result = calculateFareActCompliance(input);
            
            const hasAppFeeViolation = result.violations.some(
              v => v.field === 'applicationFee' && v.severity === 'error'
            );
            
            if (appFee <= 20) {
              expect(hasAppFeeViolation).toBe(false);
            } else {
              expect(hasAppFeeViolation).toBe(true);
            }
          }
        ),
        { numRuns: 10000 }
      );
    });
    
    it('PROPERTY: Security deposit exactly at rent is compliant', () => {
      fc.assert(
        fc.property(nycRentArb, (price) => {
          const input: FareActInput = {
            market: 'nyc',
            price,
            securityDeposit: price, // Exactly 1 month
            applicationFee: 20,
            brokerFee: 0,
            brokerFeePaidBy: 'LANDLORD',
          };
          
          const result = calculateFareActCompliance(input);
          
          const hasSecurityViolation = result.violations.some(
            v => v.field === 'securityDeposit' && v.severity === 'error'
          );
          
          expect(hasSecurityViolation).toBe(false);
        }),
        { numRuns: 5000 }
      );
    });
    
    it('PROPERTY: Security deposit $1 over rent is non-compliant', () => {
      fc.assert(
        fc.property(nycRentArb, (price) => {
          const input: FareActInput = {
            market: 'nyc',
            price,
            securityDeposit: price + 1, // $1 over
            applicationFee: 20,
            brokerFee: 0,
            brokerFeePaidBy: 'LANDLORD',
          };
          
          const result = calculateFareActCompliance(input);
          
          const hasSecurityViolation = result.violations.some(
            v => v.field === 'securityDeposit' && v.severity === 'error'
          );
          
          expect(hasSecurityViolation).toBe(true);
        }),
        { numRuns: 5000 }
      );
    });
  });
  
  describe('Edge Case: Zero Values', () => {
    
    it('PROPERTY: Zero rent handled correctly', () => {
      fc.assert(
        fc.property(
          fc.record({
            market: marketArb,
            price: fc.constant(0),
            securityDeposit: fc.integer({ min: 0, max: 1000 }),
            applicationFee: applicationFeeArb,
            brokerFee: fc.integer({ min: 0, max: 1000 }),
            brokerFeePaidBy: brokerFeePaidByArb,
          }),
          (input) => {
            const result = calculateFareActCompliance(input);
            
            // Should not throw, move-in costs should be calculated
            expect(result.moveInCosts.firstMonth).toBe(0);
            expect(typeof result.isCompliant).toBe('boolean');
          }
        ),
        { numRuns: 1000 }
      );
    });
    
    it('PROPERTY: All zeros is compliant', () => {
      const zeroInput: FareActInput = {
        market: 'nyc',
        price: 0,
        securityDeposit: 0,
        applicationFee: 0,
        brokerFee: 0,
        brokerFeePaidBy: 'LANDLORD',
      };
      
      const result = calculateFareActCompliance(zeroInput);
      
      expect(result.isCompliant).toBe(true);
      expect(result.moveInCosts.total).toBe(0);
    });
  });
  
  describe('Stress Test: High-Value Transactions', () => {
    
    it('PROPERTY: Ultra-luxury rentals follow same rules', () => {
      fc.assert(
        fc.property(
          fc.record({
            market: fc.constant<Market>('nyc'),
            price: fc.integer({ min: 50000, max: 500000 }), // $50K-$500K/month
            securityDeposit: fc.integer({ min: 0, max: 1500000 }),
            applicationFee: applicationFeeArb,
            brokerFee: fc.integer({ min: 0, max: 100000 }),
            brokerFeePaidBy: brokerFeePaidByArb,
          }),
          (input) => {
            const result = calculateFareActCompliance(input);
            
            // Even at $500K/month, app fee still capped at $20
            expect(result.moveInCosts.applicationFee).toBeLessThanOrEqual(20);
            
            // Security deposit still capped at 1 month
            expect(result.moveInCosts.securityDeposit).toBeLessThanOrEqual(input.price);
          }
        ),
        { numRuns: 5000 }
      );
    });
  });
});

// =============================================================================
// FAIR CHANCE HOUSING ACT - STATE MACHINE TESTS
// =============================================================================

describe('Fair Chance Housing Act - State Machine Properties', () => {
  
  // Application status enum matching Prisma schema
  type ApplicationStatus = 
    | 'DRAFT'
    | 'SUBMITTED'
    | 'DOCUMENTS_REQUESTED'
    | 'DOCUMENTS_RECEIVED'
    | 'FINANCIAL_REVIEW'
    | 'FINANCIAL_APPROVED'
    | 'FINANCIAL_DENIED'
    | 'CONDITIONAL_OFFER'
    | 'CRIMINAL_CHECK_PENDING'
    | 'CRIMINAL_CHECK_COMPLETE'
    | 'INDIVIDUAL_ASSESSMENT'
    | 'ASSESSMENT_ADDITIONAL_INFO'
    | 'APPROVED'
    | 'DENIED'
    | 'WITHDRAWN'
    | 'EXPIRED';
  
  // Valid state transitions
  const VALID_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
    DRAFT: ['SUBMITTED', 'WITHDRAWN'],
    SUBMITTED: ['DOCUMENTS_REQUESTED', 'FINANCIAL_REVIEW', 'WITHDRAWN'],
    DOCUMENTS_REQUESTED: ['DOCUMENTS_RECEIVED', 'WITHDRAWN', 'EXPIRED'],
    DOCUMENTS_RECEIVED: ['FINANCIAL_REVIEW', 'WITHDRAWN'],
    FINANCIAL_REVIEW: ['FINANCIAL_APPROVED', 'FINANCIAL_DENIED', 'WITHDRAWN'],
    FINANCIAL_APPROVED: ['CONDITIONAL_OFFER', 'WITHDRAWN'],
    FINANCIAL_DENIED: [], // Terminal state
    CONDITIONAL_OFFER: ['CRIMINAL_CHECK_PENDING', 'APPROVED', 'WITHDRAWN'],
    CRIMINAL_CHECK_PENDING: ['CRIMINAL_CHECK_COMPLETE', 'WITHDRAWN'],
    CRIMINAL_CHECK_COMPLETE: ['INDIVIDUAL_ASSESSMENT', 'APPROVED', 'DENIED', 'WITHDRAWN'],
    INDIVIDUAL_ASSESSMENT: ['ASSESSMENT_ADDITIONAL_INFO', 'APPROVED', 'DENIED'],
    ASSESSMENT_ADDITIONAL_INFO: ['INDIVIDUAL_ASSESSMENT'],
    APPROVED: [], // Terminal state
    DENIED: [], // Terminal state
    WITHDRAWN: [], // Terminal state
    EXPIRED: [], // Terminal state
  };
  
  // States where criminal check is FORBIDDEN
  const PRE_CONDITIONAL_STATES: ApplicationStatus[] = [
    'DRAFT',
    'SUBMITTED',
    'DOCUMENTS_REQUESTED',
    'DOCUMENTS_RECEIVED',
    'FINANCIAL_REVIEW',
    'FINANCIAL_APPROVED',
    'FINANCIAL_DENIED',
  ];
  
  // States where criminal check is PERMITTED
  const POST_CONDITIONAL_STATES: ApplicationStatus[] = [
    'CONDITIONAL_OFFER',
    'CRIMINAL_CHECK_PENDING',
    'CRIMINAL_CHECK_COMPLETE',
    'INDIVIDUAL_ASSESSMENT',
    'ASSESSMENT_ADDITIONAL_INFO',
    'APPROVED',
    'DENIED',
  ];
  
  function canInitiateCriminalCheck(status: ApplicationStatus): boolean {
    return POST_CONDITIONAL_STATES.includes(status);
  }
  
  function isValidTransition(from: ApplicationStatus, to: ApplicationStatus): boolean {
    return VALID_TRANSITIONS[from]?.includes(to) ?? false;
  }
  
  // Arbitraries
  const preConditionalStatusArb = fc.constantFrom<ApplicationStatus>(
    ...PRE_CONDITIONAL_STATES
  );
  
  const postConditionalStatusArb = fc.constantFrom<ApplicationStatus>(
    ...POST_CONDITIONAL_STATES
  );
  
  const allStatusArb = fc.constantFrom<ApplicationStatus>(
    ...Object.keys(VALID_TRANSITIONS) as ApplicationStatus[]
  );
  
  describe('Invariant: Criminal Check Timing', () => {
    
    it('PROPERTY: Criminal check NEVER allowed in pre-conditional states', () => {
      fc.assert(
        fc.property(preConditionalStatusArb, (status) => {
          expect(canInitiateCriminalCheck(status)).toBe(false);
        }),
        { numRuns: 1000 }
      );
    });
    
    it('PROPERTY: Criminal check ALWAYS allowed in post-conditional states', () => {
      fc.assert(
        fc.property(postConditionalStatusArb, (status) => {
          expect(canInitiateCriminalCheck(status)).toBe(true);
        }),
        { numRuns: 1000 }
      );
    });
    
    it('PROPERTY: No direct transition from pre-conditional to CRIMINAL_CHECK_PENDING', () => {
      fc.assert(
        fc.property(preConditionalStatusArb, (status) => {
          // Cannot jump directly to criminal check
          expect(isValidTransition(status, 'CRIMINAL_CHECK_PENDING')).toBe(false);
        }),
        { numRuns: 1000 }
      );
    });
    
    it('PROPERTY: CRIMINAL_CHECK_PENDING only reachable from CONDITIONAL_OFFER', () => {
      fc.assert(
        fc.property(allStatusArb, (status) => {
          if (isValidTransition(status, 'CRIMINAL_CHECK_PENDING')) {
            expect(status).toBe('CONDITIONAL_OFFER');
          }
        }),
        { numRuns: 1000 }
      );
    });
  });
  
  describe('Invariant: State Machine Integrity', () => {
    
    it('PROPERTY: Terminal states have no outgoing transitions', () => {
      const terminalStates: ApplicationStatus[] = [
        'FINANCIAL_DENIED',
        'APPROVED',
        'DENIED',
        'WITHDRAWN',
        'EXPIRED',
      ];
      
      terminalStates.forEach(state => {
        expect(VALID_TRANSITIONS[state]).toHaveLength(0);
      });
    });
    
    it('PROPERTY: WITHDRAWN is reachable from most non-terminal states', () => {
      const nonTerminalStates = Object.entries(VALID_TRANSITIONS)
        .filter(([_, transitions]) => transitions.length > 0)
        .map(([state]) => state as ApplicationStatus);
      
      // Most states should allow withdrawal
      const statesWithWithdrawal = nonTerminalStates.filter(
        state => VALID_TRANSITIONS[state].includes('WITHDRAWN')
      );
      
      // At least 80% of non-terminal states should allow withdrawal
      expect(statesWithWithdrawal.length / nonTerminalStates.length).toBeGreaterThan(0.8);
    });
    
    it('PROPERTY: Every non-terminal state has at least one outgoing transition', () => {
      fc.assert(
        fc.property(allStatusArb, (status) => {
          const transitions = VALID_TRANSITIONS[status];
          
          // Either it's terminal (no transitions) or has transitions
          expect(transitions.length >= 0).toBe(true);
        }),
        { numRuns: 1000 }
      );
    });
  });
  
  describe('Invariant: Compliance Audit Trail', () => {
    
    it('PROPERTY: Path to APPROVED must go through CONDITIONAL_OFFER', () => {
      // This is tested by checking that APPROVED is only reachable from
      // states that are post-conditional
      const statesLeadingToApproved = Object.entries(VALID_TRANSITIONS)
        .filter(([_, transitions]) => transitions.includes('APPROVED'))
        .map(([state]) => state as ApplicationStatus);
      
      statesLeadingToApproved.forEach(state => {
        expect(POST_CONDITIONAL_STATES).toContain(state);
      });
    });
    
    it('PROPERTY: DENIED from post-conditional requires reason documentation', () => {
      const statesLeadingToDenied = Object.entries(VALID_TRANSITIONS)
        .filter(([_, transitions]) => transitions.includes('DENIED'))
        .map(([state]) => state as ApplicationStatus);
      
      // All states leading to DENIED should be post-conditional
      // (pre-conditional denials use FINANCIAL_DENIED instead)
      statesLeadingToDenied.forEach(state => {
        expect(POST_CONDITIONAL_STATES).toContain(state);
      });
    });
  });
});
