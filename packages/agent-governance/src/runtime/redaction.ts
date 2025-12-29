/**
 * PII Redaction Service
 *
 * Detects and redacts personally identifiable information from agent runs.
 */

import type { RedactionReport, AgentRun, PromptMessage } from '../types';

// =============================================================================
// PII Patterns
// =============================================================================

const PII_PATTERNS: Record<string, RegExp> = {
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  ssn_no_dash: /\b\d{9}\b/g,
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  phone: /\b(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  credit_card: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
  date_of_birth: /\b(?:0?[1-9]|1[0-2])[-/](?:0?[1-9]|[12]\d|3[01])[-/](?:19|20)\d{2}\b/g,
  drivers_license: /\b[A-Z]{1,2}\d{6,8}\b/gi,
  bank_account: /\b\d{8,17}\b/g,
  routing_number: /\b\d{9}\b/g,
  passport: /\b[A-Z]{1,2}\d{6,9}\b/gi,
  ip_address: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
};

const REDACTION_MARKERS: Record<string, string> = {
  ssn: '[SSN_REDACTED]',
  ssn_no_dash: '[SSN_REDACTED]',
  email: '[EMAIL_REDACTED]',
  phone: '[PHONE_REDACTED]',
  credit_card: '[CARD_REDACTED]',
  date_of_birth: '[DOB_REDACTED]',
  drivers_license: '[LICENSE_REDACTED]',
  bank_account: '[ACCOUNT_REDACTED]',
  routing_number: '[ROUTING_REDACTED]',
  passport: '[PASSPORT_REDACTED]',
  ip_address: '[IP_REDACTED]',
};

// =============================================================================
// Redaction Functions
// =============================================================================

export interface RedactionResult {
  redactedText: string;
  piiTypesFound: string[];
  fieldsRedacted: string[];
  matchCount: number;
}

export interface PIIMatch {
  type: string;
  value: string;
  start: number;
  end: number;
}

/**
 * Detect PII patterns in text without redacting.
 */
export function detectPII(text: string): PIIMatch[] {
  const matches: PIIMatch[] = [];

  for (const [piiType, pattern] of Object.entries(PII_PATTERNS)) {
    // Reset regex lastIndex
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      matches.push({
        type: piiType,
        value: match[0],
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  return matches;
}

/**
 * Redact PII from a string.
 */
export function redactPII(text: string): RedactionResult {
  let redactedText = text;
  const piiTypesFound: Set<string> = new Set();
  let matchCount = 0;

  for (const [piiType, pattern] of Object.entries(PII_PATTERNS)) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      piiTypesFound.add(piiType);
      matchCount += matches.length;
      redactedText = redactedText.replace(pattern, REDACTION_MARKERS[piiType] || '[REDACTED]');
    }
  }

  return {
    redactedText,
    piiTypesFound: Array.from(piiTypesFound),
    fieldsRedacted: Array.from(piiTypesFound).map((t) => `text:${t}`),
    matchCount,
  };
}

/**
 * Redact PII from an object recursively.
 */
export function redactObject<T extends Record<string, unknown>>(
  obj: T,
  path: string = ''
): { redacted: T; report: Partial<RedactionResult> } {
  const piiTypesFound: Set<string> = new Set();
  const fieldsRedacted: Set<string> = new Set();
  let matchCount = 0;

  function processValue(value: unknown, currentPath: string): unknown {
    if (typeof value === 'string') {
      const result = redactPII(value);
      if (result.piiTypesFound.length > 0) {
        result.piiTypesFound.forEach((t) => piiTypesFound.add(t));
        fieldsRedacted.add(currentPath);
        matchCount += result.matchCount;
      }
      return result.redactedText;
    }

    if (Array.isArray(value)) {
      return value.map((item, index) => processValue(item, `${currentPath}[${index}]`));
    }

    if (value !== null && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = processValue(val, currentPath ? `${currentPath}.${key}` : key);
      }
      return result;
    }

    return value;
  }

  const redacted = processValue(obj, path) as T;

  return {
    redacted,
    report: {
      piiTypesFound: Array.from(piiTypesFound),
      fieldsRedacted: Array.from(fieldsRedacted),
      matchCount,
    },
  };
}

/**
 * Redact PII from prompt messages.
 */
export function redactPrompts(prompts: PromptMessage[]): {
  redacted: PromptMessage[];
  report: Partial<RedactionResult>;
} {
  const piiTypesFound: Set<string> = new Set();
  const fieldsRedacted: Set<string> = new Set();
  let matchCount = 0;

  const redacted = prompts.map((prompt, index) => {
    const result = redactPII(prompt.content);
    if (result.piiTypesFound.length > 0) {
      result.piiTypesFound.forEach((t) => piiTypesFound.add(t));
      fieldsRedacted.add(`prompts[${index}].content`);
      matchCount += result.matchCount;
    }
    return {
      ...prompt,
      content: result.redactedText,
      redacted: result.piiTypesFound.length > 0,
    };
  });

  return {
    redacted,
    report: {
      piiTypesFound: Array.from(piiTypesFound),
      fieldsRedacted: Array.from(fieldsRedacted),
      matchCount,
    },
  };
}

/**
 * Create a redacted version of an agent run for audit/replay.
 */
export function redactAgentRun(
  run: AgentRun,
  redactedBy: string
): { redactedRun: AgentRun; report: RedactionReport } {
  const allPiiTypes: Set<string> = new Set();
  const allFieldsRedacted: Set<string> = new Set();

  // Redact inputs
  const inputsResult = redactObject(run.inputs, 'inputs');
  inputsResult.report.piiTypesFound?.forEach((t) => allPiiTypes.add(t));
  inputsResult.report.fieldsRedacted?.forEach((f) => allFieldsRedacted.add(f));

  // Redact context
  let redactedContext = run.context;
  if (run.context) {
    const contextResult = redactObject(run.context, 'context');
    redactedContext = contextResult.redacted;
    contextResult.report.piiTypesFound?.forEach((t) => allPiiTypes.add(t));
    contextResult.report.fieldsRedacted?.forEach((f) => allFieldsRedacted.add(f));
  }

  // Redact prompts
  const promptsResult = redactPrompts(run.prompts);
  promptsResult.report.piiTypesFound?.forEach((t) => allPiiTypes.add(t));
  promptsResult.report.fieldsRedacted?.forEach((f) => allFieldsRedacted.add(f));

  // Redact tool call inputs/outputs
  const redactedToolCalls = run.toolCalls.map((tc, index) => {
    const inputResult = redactObject(tc.inputs, `toolCalls[${index}].inputs`);
    inputResult.report.piiTypesFound?.forEach((t) => allPiiTypes.add(t));
    inputResult.report.fieldsRedacted?.forEach((f) => allFieldsRedacted.add(f));

    let redactedOutput = tc.output;
    if (tc.output && typeof tc.output === 'object') {
      const outputResult = redactObject(tc.output as Record<string, unknown>, `toolCalls[${index}].output`);
      redactedOutput = outputResult.redacted;
      outputResult.report.piiTypesFound?.forEach((t) => allPiiTypes.add(t));
      outputResult.report.fieldsRedacted?.forEach((f) => allFieldsRedacted.add(f));
    }

    return {
      ...tc,
      inputs: inputResult.redacted,
      output: redactedOutput,
    };
  });

  const report: RedactionReport = {
    fieldsRedacted: Array.from(allFieldsRedacted),
    piiTypesFound: Array.from(allPiiTypes),
    redactionTimestamp: new Date(),
    redactedBy,
  };

  const redactedRun: AgentRun = {
    ...run,
    inputs: inputsResult.redacted,
    context: redactedContext,
    prompts: promptsResult.redacted,
    toolCalls: redactedToolCalls,
    redactionReport: report,
  };

  return { redactedRun, report };
}

// =============================================================================
// Sensitive Field Detection
// =============================================================================

const SENSITIVE_FIELD_NAMES = [
  'ssn', 'social_security', 'socialSecurity',
  'password', 'secret', 'token', 'api_key', 'apiKey',
  'credit_card', 'creditCard', 'card_number', 'cardNumber',
  'bank_account', 'bankAccount', 'routing_number', 'routingNumber',
  'dob', 'date_of_birth', 'dateOfBirth', 'birthdate',
  'drivers_license', 'driversLicense', 'license_number',
  'passport', 'passport_number',
];

/**
 * Check if a field name suggests it contains sensitive data.
 */
export function isSensitiveFieldName(fieldName: string): boolean {
  const lower = fieldName.toLowerCase();
  return SENSITIVE_FIELD_NAMES.some((sensitive) =>
    lower.includes(sensitive.toLowerCase())
  );
}

/**
 * Get list of sensitive fields in an object.
 */
export function findSensitiveFields(
  obj: Record<string, unknown>,
  path: string = ''
): string[] {
  const sensitiveFields: string[] = [];

  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key;

    if (isSensitiveFieldName(key)) {
      sensitiveFields.push(currentPath);
    }

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      sensitiveFields.push(...findSensitiveFields(value as Record<string, unknown>, currentPath));
    }
  }

  return sensitiveFields;
}
