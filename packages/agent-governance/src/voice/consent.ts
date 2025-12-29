/**
 * Call Consent Management
 *
 * Tracks and verifies consent for recording, transcription, and AI analysis.
 * Enforces two-party consent requirements by state.
 */

import { randomUUID } from 'crypto';

import type { Result } from '../types';
import { Ok, Err } from '../types';

import type {
  ConsentRecord,
  ConsentType,
  VoiceCall,
} from './types';
import { requiresTwoPartyConsent } from './types';

// =============================================================================
// Consent Manager
// =============================================================================

export interface ConsentManagerConfig {
  defaultExpirationDays?: number;
  requireExplicitConsent?: boolean;
  twoPartyConsentEnforced?: boolean;
}

export class ConsentManager {
  private config: ConsentManagerConfig;
  private consents: Map<string, ConsentRecord[]> = new Map();

  constructor(config: ConsentManagerConfig = {}) {
    this.config = {
      defaultExpirationDays: 365,
      requireExplicitConsent: true,
      twoPartyConsentEnforced: true,
      ...config,
    };
  }

  /**
   * Request consent from a participant.
   */
  requestConsent(
    callId: string,
    participantId: string,
    consentType: ConsentType,
    options?: {
      expiresAt?: Date;
      metadata?: Record<string, unknown>;
    }
  ): ConsentRecord {
    const consent: ConsentRecord = {
      id: `consent_${randomUUID()}`,
      callId,
      participantId,
      consentType,
      status: 'pending',
      expiresAt: options?.expiresAt || this.getDefaultExpiration(),
      metadata: options?.metadata,
    };

    this.storeConsent(consent);
    return consent;
  }

  /**
   * Grant consent (called when participant agrees).
   */
  grantConsent(
    consentId: string,
    options?: {
      verificationMethod?: ConsentRecord['verificationMethod'];
      ipAddress?: string;
      userAgent?: string;
    }
  ): Result<ConsentRecord> {
    const consent = this.findConsent(consentId);
    if (!consent) {
      return Err('NOT_FOUND', `Consent ${consentId} not found`);
    }

    if (consent.status !== 'pending') {
      return Err('INVALID_STATE', `Consent is ${consent.status}, cannot grant`);
    }

    consent.status = 'granted';
    consent.grantedAt = new Date();
    consent.verificationMethod = options?.verificationMethod;
    consent.ipAddress = options?.ipAddress;
    consent.userAgent = options?.userAgent;

    return Ok(consent);
  }

  /**
   * Deny consent.
   */
  denyConsent(consentId: string): Result<ConsentRecord> {
    const consent = this.findConsent(consentId);
    if (!consent) {
      return Err('NOT_FOUND', `Consent ${consentId} not found`);
    }

    consent.status = 'denied';
    return Ok(consent);
  }

  /**
   * Revoke previously granted consent.
   */
  revokeConsent(consentId: string, reason?: string): Result<ConsentRecord> {
    const consent = this.findConsent(consentId);
    if (!consent) {
      return Err('NOT_FOUND', `Consent ${consentId} not found`);
    }

    if (consent.status !== 'granted') {
      return Err('INVALID_STATE', `Consent is ${consent.status}, cannot revoke`);
    }

    consent.status = 'revoked';
    consent.revokedAt = new Date();
    if (reason) {
      consent.metadata = { ...consent.metadata, revocationReason: reason };
    }

    return Ok(consent);
  }

  /**
   * Check if consent is valid for a specific type.
   */
  hasValidConsent(
    callId: string,
    participantId: string,
    consentType: ConsentType
  ): boolean {
    const consents = this.getConsents(callId);
    const consent = consents.find(
      (c) =>
        c.participantId === participantId &&
        c.consentType === consentType &&
        c.status === 'granted'
    );

    if (!consent) return false;

    // Check expiration
    if (consent.expiresAt && consent.expiresAt < new Date()) {
      consent.status = 'expired';
      return false;
    }

    return true;
  }

  /**
   * Check all required consents for a call.
   */
  validateCallConsents(call: VoiceCall): Result<{
    recordingAllowed: boolean;
    transcriptionAllowed: boolean;
    aiAnalysisAllowed: boolean;
    missingConsents: Array<{ participantId: string; consentType: ConsentType }>;
  }> {
    const participantIds = this.getCallParticipants(call);
    const missingConsents: Array<{ participantId: string; consentType: ConsentType }> = [];

    // Check recording consent
    let recordingAllowed = true;
    if (call.recordingEnabled) {
      for (const participantId of participantIds) {
        if (!this.hasValidConsent(call.id, participantId, 'recording')) {
          recordingAllowed = false;
          missingConsents.push({ participantId, consentType: 'recording' });
        }
      }
    }

    // Check transcription consent
    let transcriptionAllowed = true;
    if (call.transcriptionEnabled) {
      for (const participantId of participantIds) {
        if (!this.hasValidConsent(call.id, participantId, 'transcription')) {
          transcriptionAllowed = false;
          missingConsents.push({ participantId, consentType: 'transcription' });
        }
      }
    }

    // Check AI analysis consent
    let aiAnalysisAllowed = true;
    if (call.aiAnalysisEnabled) {
      for (const participantId of participantIds) {
        if (!this.hasValidConsent(call.id, participantId, 'ai_analysis')) {
          aiAnalysisAllowed = false;
          missingConsents.push({ participantId, consentType: 'ai_analysis' });
        }
      }
    }

    return Ok({
      recordingAllowed,
      transcriptionAllowed,
      aiAnalysisAllowed,
      missingConsents,
    });
  }

  /**
   * Check two-party consent requirement for a call.
   */
  checkTwoPartyConsent(call: VoiceCall): Result<{
    required: boolean;
    allPartiesConsented: boolean;
    state: string | undefined;
  }> {
    const state = call.market;
    const required = state ? requiresTwoPartyConsent(state) : false;

    if (!required || !this.config.twoPartyConsentEnforced) {
      return Ok({ required: false, allPartiesConsented: true, state });
    }

    const participantIds = this.getCallParticipants(call);
    const allConsented = participantIds.every((id) =>
      this.hasValidConsent(call.id, id, 'recording')
    );

    return Ok({ required, allPartiesConsented: allConsented, state });
  }

  /**
   * Get all consents for a call.
   */
  getConsents(callId: string): ConsentRecord[] {
    return this.consents.get(callId) || [];
  }

  /**
   * Get consent record by ID.
   */
  getConsent(consentId: string): ConsentRecord | undefined {
    for (const consents of this.consents.values()) {
      const found = consents.find((c) => c.id === consentId);
      if (found) return found;
    }
    return undefined;
  }

  /**
   * Create bulk consent records for all types.
   */
  createBulkConsents(
    callId: string,
    participantIds: string[],
    consentTypes: ConsentType[]
  ): ConsentRecord[] {
    const records: ConsentRecord[] = [];

    for (const participantId of participantIds) {
      for (const consentType of consentTypes) {
        records.push(this.requestConsent(callId, participantId, consentType));
      }
    }

    return records;
  }

  /**
   * Clear all consents (for testing).
   */
  clear(): void {
    this.consents.clear();
  }

  // Private helpers

  private storeConsent(consent: ConsentRecord): void {
    const callConsents = this.consents.get(consent.callId) || [];
    callConsents.push(consent);
    this.consents.set(consent.callId, callConsents);
  }

  private findConsent(consentId: string): ConsentRecord | undefined {
    for (const consents of this.consents.values()) {
      const found = consents.find((c) => c.id === consentId);
      if (found) return found;
    }
    return undefined;
  }

  private getDefaultExpiration(): Date {
    const days = this.config.defaultExpirationDays || 365;
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  private getCallParticipants(call: VoiceCall): string[] {
    const participants: string[] = [];

    // Add caller
    participants.push(call.fromNumber);

    // Add recipient
    participants.push(call.toNumber);

    // Add agent if present
    if (call.agentId) {
      participants.push(call.agentId);
    }

    return participants;
  }
}

// =============================================================================
// Consent Prompt Templates
// =============================================================================

export const CONSENT_PROMPTS = {
  recording: {
    standard: 'This call may be recorded for quality assurance and training purposes. Do you consent to this recording?',
    twoParty: 'This call will be recorded. Both parties must consent to continue. Do you agree to be recorded?',
    announcement: 'This call is being recorded.',
  },
  transcription: {
    standard: 'This call may be transcribed for record-keeping purposes. Do you consent?',
  },
  aiAnalysis: {
    standard: 'This call may be analyzed by AI systems to improve service quality. Do you consent?',
  },
} as const;

/**
 * Get appropriate consent prompt based on state requirements.
 */
export function getConsentPrompt(
  consentType: ConsentType,
  state?: string
): string {
  if (consentType === 'recording') {
    const isTwoParty = state && requiresTwoPartyConsent(state);
    return isTwoParty
      ? CONSENT_PROMPTS.recording.twoParty
      : CONSENT_PROMPTS.recording.standard;
  }

  if (consentType === 'transcription') {
    return CONSENT_PROMPTS.transcription.standard;
  }

  if (consentType === 'ai_analysis') {
    return CONSENT_PROMPTS.aiAnalysis.standard;
  }

  return CONSENT_PROMPTS.recording.standard;
}
