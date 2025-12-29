/**
 * Fair Credit Housing Act (FCHA) Rules
 *
 * Enforces compliance with federal and state fair housing laws.
 * Prevents discriminatory actions based on protected classes.
 */

import type {
  PolicyRule,
  FCHAStage,
  ProtectedClass,
  PolicyCheckRequest,
  PolicyViolationSeverity,
} from '../../types';

// =============================================================================
// FCHA Constants
// =============================================================================

export const FEDERAL_PROTECTED_CLASSES: ProtectedClass[] = [
  'race',
  'color',
  'national_origin',
  'religion',
  'sex',
  'familial_status',
  'disability',
];

export const ADDITIONAL_STATE_PROTECTIONS: Record<string, ProtectedClass[]> = {
  CA: ['sexual_orientation', 'gender_identity', 'marital_status', 'source_of_income', 'military_status'],
  NY: ['sexual_orientation', 'gender_identity', 'marital_status', 'age', 'military_status', 'citizenship_status'],
  IL: ['sexual_orientation', 'marital_status', 'military_status', 'source_of_income'],
  WA: ['sexual_orientation', 'gender_identity', 'marital_status', 'military_status'],
  CO: ['sexual_orientation', 'gender_identity', 'marital_status', 'source_of_income'],
  MA: ['sexual_orientation', 'gender_identity', 'marital_status', 'age', 'source_of_income', 'military_status'],
  NJ: ['sexual_orientation', 'marital_status', 'source_of_income'],
  OR: ['sexual_orientation', 'gender_identity', 'marital_status', 'source_of_income'],
  CT: ['sexual_orientation', 'marital_status', 'age', 'source_of_income'],
  MD: ['sexual_orientation', 'gender_identity', 'marital_status', 'source_of_income'],
};

// =============================================================================
// Discriminatory Language Detection
// =============================================================================

const DISCRIMINATORY_TERMS: Record<string, ProtectedClass> = {
  // Race
  'no blacks': 'race',
  'whites only': 'race',
  'no hispanics': 'race',
  'no asians': 'race',
  'no latinos': 'race',

  // National Origin
  'no immigrants': 'national_origin',
  'americans only': 'national_origin',
  'english only': 'national_origin',
  'no foreigners': 'national_origin',

  // Religion
  'christians only': 'religion',
  'no muslims': 'religion',
  'no jews': 'religion',

  // Sex
  'males only': 'sex',
  'females only': 'sex',
  'no men': 'sex',
  'no women': 'sex',

  // Familial Status
  'no children': 'familial_status',
  'no kids': 'familial_status',
  'without children': 'familial_status',
  'adults only': 'familial_status',
  'no families': 'familial_status',
  'singles only': 'familial_status',
  'couples only': 'familial_status',
  'no pregnant': 'familial_status',
  'prefer tenants without children': 'familial_status',

  // Disability
  'no wheelchairs': 'disability',
  'no disabilities': 'disability',
  'able-bodied only': 'disability',
  'no service animals': 'disability',
  'no emotional support animals': 'disability',

  // Sexual Orientation (state-level)
  'no gays': 'sexual_orientation',
  'no lesbians': 'sexual_orientation',
  'straight only': 'sexual_orientation',
  'heterosexual only': 'sexual_orientation',

  // Marital Status (state-level)
  'married only': 'marital_status',
  'no single': 'marital_status',
  'no divorced': 'marital_status',

  // Source of Income (state-level)
  'no section 8': 'source_of_income',
  'no housing vouchers': 'source_of_income',
  'no welfare': 'source_of_income',
  'no government assistance': 'source_of_income',
};

const STEERING_INDICATORS = [
  'you would be more comfortable',
  'your kind usually prefers',
  'people like you tend to',
  'that neighborhood is better for',
  'you might fit in better',
  'your community is in',
  'might not be suitable for your family',
  'not be suitable for your',
];

/**
 * Check text for discriminatory language.
 */
export function detectDiscriminatoryLanguage(
  text: string,
  market?: string
): { found: boolean; terms: string[]; protectedClasses: ProtectedClass[] } {
  const lowerText = text.toLowerCase();
  const foundTerms: string[] = [];
  const protectedClasses: Set<ProtectedClass> = new Set();

  // Get applicable protected classes for market
  const stateProtections = market ? ADDITIONAL_STATE_PROTECTIONS[market] || [] : [];
  const allProtections = [...FEDERAL_PROTECTED_CLASSES, ...stateProtections];

  for (const [term, protectedClass] of Object.entries(DISCRIMINATORY_TERMS)) {
    if (lowerText.includes(term) && allProtections.includes(protectedClass)) {
      foundTerms.push(term);
      protectedClasses.add(protectedClass);
    }
  }

  return {
    found: foundTerms.length > 0,
    terms: foundTerms,
    protectedClasses: Array.from(protectedClasses),
  };
}

/**
 * Check for steering language.
 */
export function detectSteeringLanguage(text: string): { found: boolean; indicators: string[] } {
  const lowerText = text.toLowerCase();
  const found = STEERING_INDICATORS.filter((indicator) => lowerText.includes(indicator));

  return {
    found: found.length > 0,
    indicators: found,
  };
}

// =============================================================================
// Stage-Specific Rules
// =============================================================================

const ALLOWED_QUESTIONS_BY_STAGE: Record<FCHAStage, string[]> = {
  inquiry: [
    'desired move-in date',
    'number of occupants',
    'pet ownership',
    'lease term preference',
    'contact information',
  ],
  application: [
    'income verification',
    'employment history',
    'rental history',
    'credit authorization',
    'government id',
    'emergency contacts',
  ],
  screening: [
    'criminal background',
    'credit report',
    'eviction history',
    'employment verification',
    'income verification',
    'reference checks',
  ],
  approval: [],
  lease_signing: [
    'signature',
    'payment information',
  ],
  move_in: [
    'inspection acknowledgment',
    'key receipt',
  ],
  tenancy: [
    'maintenance requests',
    'lease compliance',
  ],
  renewal: [
    'renewal interest',
    'updated income',
  ],
  move_out: [
    'forwarding address',
    'move-out date',
    'inspection scheduling',
  ],
};

const PROHIBITED_QUESTIONS_ALWAYS = [
  'race',
  'ethnicity',
  'national origin',
  'religion',
  'sexual orientation',
  'gender identity',
  'marital status',
  'pregnancy',
  'disability status',
  'aids',
  'hiv',
  'mental illness',
  'family planning',
];

/**
 * Check if a question is appropriate for the current stage.
 */
export function isQuestionAllowedForStage(
  question: string,
  _stage: FCHAStage,
  market?: string
): { allowed: boolean; reason?: string } {
  const lowerQuestion = question.toLowerCase();

  // Check for always-prohibited questions
  for (const prohibited of PROHIBITED_QUESTIONS_ALWAYS) {
    if (lowerQuestion.includes(prohibited)) {
      return {
        allowed: false,
        reason: `Questions about "${prohibited}" are prohibited under fair housing laws`,
      };
    }
  }

  // Check for discriminatory language
  const discrimCheck = detectDiscriminatoryLanguage(question, market);
  if (discrimCheck.found) {
    return {
      allowed: false,
      reason: `Question contains discriminatory language: ${discrimCheck.terms.join(', ')}`,
    };
  }

  return { allowed: true };
}

// =============================================================================
// FCHA Policy Rules
// =============================================================================

export const FCHA_RULES: PolicyRule[] = [
  {
    id: 'fcha_no_discriminatory_language',
    name: 'No Discriminatory Language',
    description: 'AI cannot use or suggest discriminatory language based on protected classes',
    category: 'fcha_compliance',
    severity: 'fatal',
    enabled: true,
    conditions: {
      checkType: 'discriminatory_language',
    },
    version: '1.0.0',
  },
  {
    id: 'fcha_no_steering',
    name: 'No Steering',
    description: 'AI cannot suggest or encourage steering based on protected characteristics',
    category: 'fcha_compliance',
    severity: 'fatal',
    enabled: true,
    conditions: {
      checkType: 'steering',
    },
    version: '1.0.0',
  },
  {
    id: 'fcha_stage_appropriate_questions',
    name: 'Stage-Appropriate Questions Only',
    description: 'AI can only ask questions appropriate for the current leasing stage',
    category: 'fcha_compliance',
    severity: 'error',
    enabled: true,
    conditions: {
      checkType: 'stage_questions',
    },
    version: '1.0.0',
  },
  {
    id: 'fcha_consistent_criteria',
    name: 'Consistent Screening Criteria',
    description: 'AI must apply consistent screening criteria across all applicants',
    category: 'fcha_compliance',
    severity: 'error',
    enabled: true,
    conditions: {
      checkType: 'consistent_criteria',
    },
    version: '1.0.0',
  },
  {
    id: 'fcha_reasonable_accommodation',
    name: 'Reasonable Accommodation',
    description: 'AI must not deny reasonable accommodation requests without proper review',
    category: 'fcha_compliance',
    severity: 'fatal',
    enabled: true,
    conditions: {
      checkType: 'accommodation_request',
    },
    version: '1.0.0',
  },
  {
    id: 'fcha_source_of_income',
    name: 'Source of Income Protection',
    description: 'AI cannot discriminate based on source of income in protected markets',
    category: 'fcha_compliance',
    severity: 'fatal',
    enabled: true,
    markets: ['CA', 'NY', 'IL', 'WA', 'CO', 'MA', 'NJ', 'OR', 'CT', 'MD'],
    conditions: {
      checkType: 'source_of_income',
    },
    version: '1.0.0',
  },
];

// =============================================================================
// FCHA Rule Checker
// =============================================================================

export interface FCHACheckResult {
  passed: boolean;
  violations: Array<{
    ruleId: string;
    severity: PolicyViolationSeverity;
    message: string;
    protectedClasses?: ProtectedClass[];
    suggestedFix?: string;
  }>;
}

/**
 * Check a request against FCHA rules.
 */
export function checkFCHARules(request: PolicyCheckRequest): FCHACheckResult {
  const violations: FCHACheckResult['violations'] = [];

  // Extract text content from tool inputs for analysis
  const textContent = extractTextContent(request.toolInputs);
  const market = request.market;
  const stage = (request.context?.stage as FCHAStage) || 'inquiry';

  // Check for discriminatory language
  const discrimCheck = detectDiscriminatoryLanguage(textContent, market);
  if (discrimCheck.found) {
    violations.push({
      ruleId: 'fcha_no_discriminatory_language',
      severity: 'fatal',
      message: `Discriminatory language detected: "${discrimCheck.terms.join('", "')}"`,
      protectedClasses: discrimCheck.protectedClasses,
      suggestedFix: 'Remove discriminatory references and use neutral language',
    });
  }

  // Check for steering
  const steeringCheck = detectSteeringLanguage(textContent);
  if (steeringCheck.found) {
    violations.push({
      ruleId: 'fcha_no_steering',
      severity: 'fatal',
      message: `Steering language detected: "${steeringCheck.indicators.join('", "')}"`,
      suggestedFix: 'Provide objective property information without directing based on characteristics',
    });
  }

  // Check stage-appropriate questions
  if (request.toolName === 'ask_applicant' || request.toolName === 'send_message') {
    const questionCheck = isQuestionAllowedForStage(textContent, stage, market);
    if (!questionCheck.allowed) {
      violations.push({
        ruleId: 'fcha_stage_appropriate_questions',
        severity: 'error',
        message: questionCheck.reason || 'Question not appropriate for current stage',
        suggestedFix: `Only ask questions related to: ${ALLOWED_QUESTIONS_BY_STAGE[stage].join(', ')}`,
      });
    }
  }

  // Check source of income discrimination
  if (market && ADDITIONAL_STATE_PROTECTIONS[market]?.includes('source_of_income')) {
    const soiCheck = detectSourceOfIncomeDiscrimination(textContent);
    if (soiCheck.found) {
      violations.push({
        ruleId: 'fcha_source_of_income',
        severity: 'fatal',
        message: `Source of income discrimination detected: "${soiCheck.terms.join('", "')}"`,
        protectedClasses: ['source_of_income'],
        suggestedFix: `${market} law prohibits discrimination based on source of income including housing vouchers`,
      });
    }
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}

/**
 * Extract all text content from tool inputs.
 */
function extractTextContent(inputs: Record<string, unknown>): string {
  const texts: string[] = [];

  function extract(value: unknown): void {
    if (typeof value === 'string') {
      texts.push(value);
    } else if (Array.isArray(value)) {
      value.forEach(extract);
    } else if (value !== null && typeof value === 'object') {
      Object.values(value).forEach(extract);
    }
  }

  extract(inputs);
  return texts.join(' ');
}

/**
 * Check for source of income discrimination.
 */
function detectSourceOfIncomeDiscrimination(text: string): { found: boolean; terms: string[] } {
  const lowerText = text.toLowerCase();
  const discriminatoryTerms = [
    'no section 8',
    'no housing vouchers',
    'no housing choice voucher',
    'no hcv',
    'no welfare',
    'no government assistance',
    'no public assistance',
    'must have job income',
    'employment income only',
    'no subsidy',
    'no subsidized',
    'do not accept housing vouchers',
    'do not accept section 8',
    'not accept housing vouchers',
    'not accept section 8',
  ];

  const found = discriminatoryTerms.filter((term) => lowerText.includes(term));

  return {
    found: found.length > 0,
    terms: found,
  };
}

// =============================================================================
// Factory Function for Policy Gate
// =============================================================================

export interface FCHAPolicyRule {
  id: string;
  name: string;
  description: string;
  category: 'compliance' | 'fcha_compliance';
  severity: PolicyViolationSeverity;
  enabled: boolean;
  check: (context: PolicyCheckContext) => Promise<{ passed: boolean; violations: FCHACheckResult['violations'] }>;
}

interface PolicyCheckContext {
  agentType?: string;
  tenantId?: string;
  market?: string;
  toolName?: string;
  inputs?: Record<string, unknown>;
  fchaStage?: FCHAStage;
  feeContext?: {
    feeType?: string;
    amount?: number;
    currency?: string;
  };
}

/**
 * Create FCHA rules for policy gate.
 */
export function createFchaRules(): FCHAPolicyRule[] {
  return [
    {
      id: 'fcha_discriminatory_language',
      name: 'No Discriminatory Language',
      description: 'AI cannot use or suggest discriminatory language based on protected classes',
      category: 'compliance',
      severity: 'critical',
      enabled: true,
      check: (context: PolicyCheckContext) => {
        const violations: FCHACheckResult['violations'] = [];
        const textContent = extractTextFromContext(context);
        const discrimCheck = detectDiscriminatoryLanguage(textContent, context.market);

        if (discrimCheck.found) {
          violations.push({
            ruleId: 'fcha_discriminatory_language',
            severity: 'fatal',
            message: `Discriminatory language detected: "${discrimCheck.terms.join('", "')}"`,
            protectedClasses: discrimCheck.protectedClasses,
            suggestedFix: 'Remove discriminatory references and use neutral language',
          });
        }

        return Promise.resolve({ passed: violations.length === 0, violations });
      },
    },
    {
      id: 'fcha_steering',
      name: 'No Steering',
      description: 'AI cannot suggest or encourage steering based on protected characteristics',
      category: 'compliance',
      severity: 'critical',
      enabled: true,
      check: (context: PolicyCheckContext) => {
        const violations: FCHACheckResult['violations'] = [];
        const textContent = extractTextFromContext(context);
        const steeringCheck = detectSteeringLanguage(textContent);

        if (steeringCheck.found) {
          violations.push({
            ruleId: 'fcha_steering',
            severity: 'fatal',
            message: `Steering language detected: "${steeringCheck.indicators.join('", "')}"`,
            suggestedFix: 'Provide objective property information without directing based on characteristics',
          });
        }

        return Promise.resolve({ passed: violations.length === 0, violations });
      },
    },
    {
      id: 'fcha_stage_questions',
      name: 'Stage-Appropriate Questions Only',
      description: 'AI can only ask questions appropriate for the current leasing stage',
      category: 'compliance',
      severity: 'error',
      enabled: true,
      check: (context: PolicyCheckContext) => {
        const violations: FCHACheckResult['violations'] = [];
        const textContent = extractTextFromContext(context);
        const stage = context.fchaStage || 'inquiry';

        // Check if asking income-related questions at wrong stage
        if (stage === 'inquiry' && /income|salary|pay|earn/i.test(textContent)) {
          violations.push({
            ruleId: 'fcha_stage_questions',
            severity: 'error',
            message: 'Income-related questions are not appropriate at the inquiry stage',
            suggestedFix: 'Wait until application stage to ask about income',
          });
        }

        return Promise.resolve({ passed: violations.length === 0, violations });
      },
    },
    {
      id: 'fcha_source_of_income',
      name: 'Source of Income Protection',
      description: 'AI cannot discriminate based on source of income in protected markets',
      category: 'compliance',
      severity: 'critical',
      enabled: true,
      check: (context: PolicyCheckContext) => {
        const violations: FCHACheckResult['violations'] = [];
        const textContent = extractTextFromContext(context);
        const market = context.market;

        // Only check in markets with source of income protection
        const protectedMarkets = ['CA', 'NY', 'IL', 'WA', 'CO', 'MA', 'NJ', 'OR', 'CT', 'MD'];
        if (market && protectedMarkets.includes(market)) {
          const soiCheck = detectSourceOfIncomeDiscrimination(textContent);
          if (soiCheck.found) {
            violations.push({
              ruleId: 'fcha_source_of_income',
              severity: 'fatal',
              message: `Discrimination based on source of income detected: "${soiCheck.terms.join('", "')}"`,
              protectedClasses: ['source_of_income'],
              suggestedFix: `${market} law prohibits discrimination based on source of income including housing vouchers`,
            });
          }
        }

        return Promise.resolve({ passed: violations.length === 0, violations });
      },
    },
  ];
}

function extractTextFromContext(context: PolicyCheckContext): string {
  const texts: string[] = [];

  function extract(value: unknown): void {
    if (typeof value === 'string') {
      texts.push(value);
    } else if (Array.isArray(value)) {
      value.forEach(extract);
    } else if (value !== null && typeof value === 'object') {
      Object.values(value).forEach(extract);
    }
  }

  if (context.inputs) {
    extract(context.inputs);
  }

  return texts.join(' ');
}
