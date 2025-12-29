/**
 * Voice Provider Interface
 *
 * Abstract interface for voice providers (Twilio, WebRTC, etc.)
 */

import type { Result } from '../types';
import { Ok, Err } from '../types';

import type {
  VoiceCall,
  CallStatus,
  VoiceProvider,
  TwilioConfig,
  WebRTCConfig,
} from './types';

// =============================================================================
// Provider Interface
// =============================================================================

export interface VoiceProviderInterface {
  provider: VoiceProvider;

  // Call management
  initiateCall(params: InitiateCallParams): Promise<Result<VoiceCall>>;
  answerCall(callId: string): Promise<Result<void>>;
  endCall(callId: string, reason?: string): Promise<Result<void>>;
  holdCall(callId: string): Promise<Result<void>>;
  resumeCall(callId: string): Promise<Result<void>>;
  transferCall(callId: string, toNumber: string): Promise<Result<void>>;

  // Recording
  startRecording(callId: string): Promise<Result<string>>; // Returns recording ID
  stopRecording(callId: string): Promise<Result<void>>;
  pauseRecording(callId: string): Promise<Result<void>>;
  resumeRecording(callId: string): Promise<Result<void>>;

  // Status
  getCallStatus(callId: string): Promise<Result<CallStatus>>;
  getCall(callId: string): Promise<Result<VoiceCall | null>>;

  // Webhooks
  handleWebhook(payload: unknown): Promise<Result<WebhookEvent>>;
}

export interface InitiateCallParams {
  fromNumber: string;
  toNumber: string;
  tenantId: string;
  agentId?: string;
  userId?: string;
  propertyId?: string;
  leadId?: string;
  market?: string;
  recordingEnabled?: boolean;
  transcriptionEnabled?: boolean;
  aiAnalysisEnabled?: boolean;
  metadata?: Record<string, unknown>;
}

export interface WebhookEvent {
  type:
    | 'call.initiated'
    | 'call.ringing'
    | 'call.answered'
    | 'call.completed'
    | 'call.failed'
    | 'recording.started'
    | 'recording.completed'
    | 'transcription.completed';
  callId: string;
  externalId?: string;
  timestamp: Date;
  data: Record<string, unknown>;
}

// =============================================================================
// Mock Provider (for testing/development)
// =============================================================================

export class MockVoiceProvider implements VoiceProviderInterface {
  provider: VoiceProvider = 'twilio';
  private calls: Map<string, VoiceCall> = new Map();
  private recordings: Map<string, { callId: string; status: string }> = new Map();

  initiateCall(params: InitiateCallParams): Promise<Result<VoiceCall>> {
    const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const call: VoiceCall = {
      id: callId,
      externalId: `EXT_${callId}`,
      tenantId: params.tenantId,
      direction: 'outbound',
      status: 'initiated',
      fromNumber: params.fromNumber,
      toNumber: params.toNumber,
      agentId: params.agentId,
      userId: params.userId,
      propertyId: params.propertyId,
      leadId: params.leadId,
      initiatedAt: new Date(),
      consentRecords: [],
      recordingConsent: false,
      transcriptionConsent: false,
      recordingEnabled: params.recordingEnabled ?? false,
      transcriptionEnabled: params.transcriptionEnabled ?? false,
      aiAnalysisEnabled: params.aiAnalysisEnabled ?? false,
      market: params.market,
      twoPartyConsentRequired: false,
      policyViolations: [],
      metadata: params.metadata,
    };

    this.calls.set(callId, call);
    return Promise.resolve(Ok(call));
  }

  answerCall(callId: string): Promise<Result<void>> {
    const call = this.calls.get(callId);
    if (!call) {
      return Promise.resolve(Err('NOT_FOUND', `Call ${callId} not found`));
    }

    call.status = 'in_progress';
    call.answeredAt = new Date();
    return Promise.resolve(Ok(undefined));
  }

  endCall(callId: string, _reason?: string): Promise<Result<void>> {
    const call = this.calls.get(callId);
    if (!call) {
      return Promise.resolve(Err('NOT_FOUND', `Call ${callId} not found`));
    }

    call.status = 'completed';
    call.endedAt = new Date();
    if (call.answeredAt) {
      call.durationSeconds = Math.floor(
        (call.endedAt.getTime() - call.answeredAt.getTime()) / 1000
      );
    }
    return Promise.resolve(Ok(undefined));
  }

  holdCall(callId: string): Promise<Result<void>> {
    const call = this.calls.get(callId);
    if (!call) {
      return Promise.resolve(Err('NOT_FOUND', `Call ${callId} not found`));
    }

    call.status = 'on_hold';
    return Promise.resolve(Ok(undefined));
  }

  resumeCall(callId: string): Promise<Result<void>> {
    const call = this.calls.get(callId);
    if (!call) {
      return Promise.resolve(Err('NOT_FOUND', `Call ${callId} not found`));
    }

    call.status = 'in_progress';
    return Promise.resolve(Ok(undefined));
  }

  transferCall(callId: string, _toNumber: string): Promise<Result<void>> {
    const call = this.calls.get(callId);
    if (!call) {
      return Promise.resolve(Err('NOT_FOUND', `Call ${callId} not found`));
    }

    // Mock transfer - in real implementation would initiate transfer flow
    return Promise.resolve(Ok(undefined));
  }

  startRecording(callId: string): Promise<Result<string>> {
    const call = this.calls.get(callId);
    if (!call) {
      return Promise.resolve(Err('NOT_FOUND', `Call ${callId} not found`));
    }

    const recordingId = `rec_${Date.now()}`;
    this.recordings.set(recordingId, { callId, status: 'recording' });
    call.recordingEnabled = true;
    return Promise.resolve(Ok(recordingId));
  }

  stopRecording(callId: string): Promise<Result<void>> {
    const call = this.calls.get(callId);
    if (!call) {
      return Promise.resolve(Err('NOT_FOUND', `Call ${callId} not found`));
    }

    for (const [recId, rec] of this.recordings) {
      if (rec.callId === callId && rec.status === 'recording') {
        rec.status = 'completed';
        call.recordingUrl = `https://mock-storage.example.com/recordings/${recId}.wav`;
      }
    }
    return Promise.resolve(Ok(undefined));
  }

  pauseRecording(callId: string): Promise<Result<void>> {
    const call = this.calls.get(callId);
    if (!call) {
      return Promise.resolve(Err('NOT_FOUND', `Call ${callId} not found`));
    }

    for (const rec of this.recordings.values()) {
      if (rec.callId === callId && rec.status === 'recording') {
        rec.status = 'paused';
      }
    }
    return Promise.resolve(Ok(undefined));
  }

  resumeRecording(callId: string): Promise<Result<void>> {
    const call = this.calls.get(callId);
    if (!call) {
      return Promise.resolve(Err('NOT_FOUND', `Call ${callId} not found`));
    }

    for (const rec of this.recordings.values()) {
      if (rec.callId === callId && rec.status === 'paused') {
        rec.status = 'recording';
      }
    }
    return Promise.resolve(Ok(undefined));
  }

  getCallStatus(callId: string): Promise<Result<CallStatus>> {
    const call = this.calls.get(callId);
    if (!call) {
      return Promise.resolve(Err('NOT_FOUND', `Call ${callId} not found`));
    }
    return Promise.resolve(Ok(call.status));
  }

  getCall(callId: string): Promise<Result<VoiceCall | null>> {
    const call = this.calls.get(callId);
    return Promise.resolve(Ok(call || null));
  }

  handleWebhook(payload: unknown): Promise<Result<WebhookEvent>> {
    // Mock webhook handling
    const data = payload as Record<string, unknown>;
    return Promise.resolve(Ok({
      type: 'call.initiated',
      callId: (data['callId'] as string) || 'unknown',
      timestamp: new Date(),
      data,
    }));
  }

  // Test helpers
  simulateCallAnswered(callId: string): void {
    const call = this.calls.get(callId);
    if (call) {
      call.status = 'in_progress';
      call.answeredAt = new Date();
    }
  }

  clear(): void {
    this.calls.clear();
    this.recordings.clear();
  }
}

// =============================================================================
// Twilio Provider Skeleton
// =============================================================================

export interface TwilioProviderDeps {
  config: TwilioConfig;
  // In real implementation: twilioClient: Twilio
}

/**
 * Twilio Voice Provider (skeleton for production implementation)
 */
export class TwilioVoiceProvider implements VoiceProviderInterface {
  provider: VoiceProvider = 'twilio';
  protected readonly config: TwilioConfig;

  constructor(deps: TwilioProviderDeps) {
    this.config = deps.config;
  }

  /** Get config for production implementation */
  getConfig(): TwilioConfig {
    return this.config;
  }

  initiateCall(_params: InitiateCallParams): Promise<Result<VoiceCall>> {
    // Production: Use Twilio client to create call
    // const call = await this.twilioClient.calls.create({
    //   from: params.fromNumber,
    //   to: params.toNumber,
    //   statusCallback: this.config.statusCallbackUrl,
    //   record: params.recordingEnabled,
    // });
    return Promise.resolve(Err('NOT_IMPLEMENTED', 'Twilio provider not fully implemented'));
  }

  answerCall(_callId: string): Promise<Result<void>> {
    return Promise.resolve(Err('NOT_IMPLEMENTED', 'Twilio provider not fully implemented'));
  }

  endCall(_callId: string, _reason?: string): Promise<Result<void>> {
    return Promise.resolve(Err('NOT_IMPLEMENTED', 'Twilio provider not fully implemented'));
  }

  holdCall(_callId: string): Promise<Result<void>> {
    return Promise.resolve(Err('NOT_IMPLEMENTED', 'Twilio provider not fully implemented'));
  }

  resumeCall(_callId: string): Promise<Result<void>> {
    return Promise.resolve(Err('NOT_IMPLEMENTED', 'Twilio provider not fully implemented'));
  }

  transferCall(_callId: string, _toNumber: string): Promise<Result<void>> {
    return Promise.resolve(Err('NOT_IMPLEMENTED', 'Twilio provider not fully implemented'));
  }

  startRecording(_callId: string): Promise<Result<string>> {
    return Promise.resolve(Err('NOT_IMPLEMENTED', 'Twilio provider not fully implemented'));
  }

  stopRecording(_callId: string): Promise<Result<void>> {
    return Promise.resolve(Err('NOT_IMPLEMENTED', 'Twilio provider not fully implemented'));
  }

  pauseRecording(_callId: string): Promise<Result<void>> {
    return Promise.resolve(Err('NOT_IMPLEMENTED', 'Twilio provider not fully implemented'));
  }

  resumeRecording(_callId: string): Promise<Result<void>> {
    return Promise.resolve(Err('NOT_IMPLEMENTED', 'Twilio provider not fully implemented'));
  }

  getCallStatus(_callId: string): Promise<Result<CallStatus>> {
    return Promise.resolve(Err('NOT_IMPLEMENTED', 'Twilio provider not fully implemented'));
  }

  getCall(_callId: string): Promise<Result<VoiceCall | null>> {
    return Promise.resolve(Err('NOT_IMPLEMENTED', 'Twilio provider not fully implemented'));
  }

  handleWebhook(payload: unknown): Promise<Result<WebhookEvent>> {
    // Parse Twilio webhook format
    const data = payload as Record<string, unknown>;

    const callSid = data['CallSid'] as string;
    const callStatus = data['CallStatus'] as string;

    let eventType: WebhookEvent['type'] = 'call.initiated';
    switch (callStatus) {
      case 'ringing':
        eventType = 'call.ringing';
        break;
      case 'in-progress':
        eventType = 'call.answered';
        break;
      case 'completed':
        eventType = 'call.completed';
        break;
      case 'failed':
      case 'busy':
      case 'no-answer':
        eventType = 'call.failed';
        break;
    }

    return Promise.resolve(Ok({
      type: eventType,
      callId: callSid,
      externalId: callSid,
      timestamp: new Date(),
      data,
    }));
  }
}

// =============================================================================
// WebRTC Provider Skeleton
// =============================================================================

export interface WebRTCProviderDeps {
  config: WebRTCConfig;
}

/**
 * WebRTC Voice Provider (skeleton for browser-based calls)
 */
export class WebRTCVoiceProvider implements VoiceProviderInterface {
  provider: VoiceProvider = 'webrtc';
  protected readonly config: WebRTCConfig;

  constructor(deps: WebRTCProviderDeps) {
    this.config = deps.config;
  }

  /** Get config for production implementation */
  getConfig(): WebRTCConfig {
    return this.config;
  }

  initiateCall(_params: InitiateCallParams): Promise<Result<VoiceCall>> {
    // Production: Set up WebRTC peer connection
    return Promise.resolve(Err('NOT_IMPLEMENTED', 'WebRTC provider not fully implemented'));
  }

  answerCall(_callId: string): Promise<Result<void>> {
    return Promise.resolve(Err('NOT_IMPLEMENTED', 'WebRTC provider not fully implemented'));
  }

  endCall(_callId: string, _reason?: string): Promise<Result<void>> {
    return Promise.resolve(Err('NOT_IMPLEMENTED', 'WebRTC provider not fully implemented'));
  }

  holdCall(_callId: string): Promise<Result<void>> {
    return Promise.resolve(Err('NOT_IMPLEMENTED', 'WebRTC provider not fully implemented'));
  }

  resumeCall(_callId: string): Promise<Result<void>> {
    return Promise.resolve(Err('NOT_IMPLEMENTED', 'WebRTC provider not fully implemented'));
  }

  transferCall(_callId: string, _toNumber: string): Promise<Result<void>> {
    return Promise.resolve(Err('NOT_IMPLEMENTED', 'WebRTC provider not fully implemented'));
  }

  startRecording(_callId: string): Promise<Result<string>> {
    return Promise.resolve(Err('NOT_IMPLEMENTED', 'WebRTC provider not fully implemented'));
  }

  stopRecording(_callId: string): Promise<Result<void>> {
    return Promise.resolve(Err('NOT_IMPLEMENTED', 'WebRTC provider not fully implemented'));
  }

  pauseRecording(_callId: string): Promise<Result<void>> {
    return Promise.resolve(Err('NOT_IMPLEMENTED', 'WebRTC provider not fully implemented'));
  }

  resumeRecording(_callId: string): Promise<Result<void>> {
    return Promise.resolve(Err('NOT_IMPLEMENTED', 'WebRTC provider not fully implemented'));
  }

  getCallStatus(_callId: string): Promise<Result<CallStatus>> {
    return Promise.resolve(Err('NOT_IMPLEMENTED', 'WebRTC provider not fully implemented'));
  }

  getCall(_callId: string): Promise<Result<VoiceCall | null>> {
    return Promise.resolve(Err('NOT_IMPLEMENTED', 'WebRTC provider not fully implemented'));
  }

  handleWebhook(_payload: unknown): Promise<Result<WebhookEvent>> {
    return Promise.resolve(Err('NOT_IMPLEMENTED', 'WebRTC provider not fully implemented'));
  }
}

// =============================================================================
// Provider Factory
// =============================================================================

export function createVoiceProvider(
  provider: VoiceProvider,
  config: TwilioConfig | WebRTCConfig
): VoiceProviderInterface {
  switch (provider) {
    case 'twilio':
      return new TwilioVoiceProvider({ config: config as TwilioConfig });
    case 'webrtc':
      return new WebRTCVoiceProvider({ config: config as WebRTCConfig });
    default:
      return new MockVoiceProvider();
  }
}
