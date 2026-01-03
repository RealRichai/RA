/**
 * Twilio Production Voice Provider
 *
 * Full implementation of Twilio voice services for production use.
 * Handles call initiation, recording, transcription, and webhook processing.
 */

import { createHash, randomUUID } from 'crypto';

import type { Result } from '../types';
import { Ok, Err } from '../types';

import type {
  InitiateCallParams,
  WebhookEvent,
  VoiceProviderInterface,
} from './provider';
import type {
  VoiceCall,
  CallStatus,
  TwilioConfig,
  VoiceProvider,
} from './types';
import { requiresTwoPartyConsent } from './types';

// =============================================================================
// Types
// =============================================================================

interface TwilioClient {
  calls: {
    create: (params: TwilioCreateCallParams) => Promise<TwilioCallResource>;
    get: (sid: string) => {
      fetch: () => Promise<TwilioCallResource>;
      update: (params: TwilioUpdateCallParams) => Promise<TwilioCallResource>;
      recordings: {
        list: () => Promise<TwilioRecordingResource[]>;
      };
    };
  };
  recordings: {
    get: (sid: string) => {
      fetch: () => Promise<TwilioRecordingResource>;
      update: (params: { status: string }) => Promise<TwilioRecordingResource>;
    };
  };
}

interface TwilioCreateCallParams {
  to: string;
  from: string;
  url?: string;
  statusCallback?: string;
  statusCallbackEvent?: string[];
  record?: boolean;
  recordingStatusCallback?: string;
  recordingStatusCallbackEvent?: string[];
  timeout?: number;
  machineDetection?: string;
}

interface TwilioUpdateCallParams {
  status?: 'completed' | 'canceled';
  twiml?: string;
}

interface TwilioCallResource {
  sid: string;
  status: string;
  direction: string;
  from: string;
  to: string;
  duration: string | null;
  startTime: Date | null;
  endTime: Date | null;
  answeredBy: string | null;
  price: string | null;
  priceUnit: string | null;
}

interface TwilioRecordingResource {
  sid: string;
  callSid: string;
  status: string;
  channels: number;
  source: string;
  startTime: Date;
  duration: string;
  uri: string;
}

// =============================================================================
// Twilio Production Provider
// =============================================================================

export class TwilioVoiceProviderProduction implements VoiceProviderInterface {
  provider: VoiceProvider = 'twilio';
  private config: TwilioConfig;
  private client: TwilioClient | null = null;
  private calls: Map<string, VoiceCall> = new Map();
  private callSidMapping: Map<string, string> = new Map(); // Twilio SID -> internal ID

  constructor(config: TwilioConfig) {
    this.config = config;
  }

  /**
   * Initialize Twilio client (lazy load to avoid import issues)
   */
  private getClient(): TwilioClient {
    if (this.client) return this.client;

    try {
      // Dynamic import to handle environments without twilio package
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment
      const twilio: (accountSid: string, authToken: string) => TwilioClient = require('twilio');
      this.client = twilio(
        this.config.accountSid,
        this.config.authToken
      );
      return this.client;
    } catch {
      throw new Error('Twilio SDK not available. Install with: npm install twilio');
    }
  }

  /**
   * Initiate an outbound call
   */
  async initiateCall(params: InitiateCallParams): Promise<Result<VoiceCall>> {
    try {
      const client = this.getClient();

      // Determine if two-party consent is required
      const market = params.market;
      let twoPartyRequired = false;
      if (market) {
        // Extract state from market (e.g., "NYC_STRICT" -> "NY")
        const stateMatch = market.match(/^([A-Z]{2})/);
        if (stateMatch && stateMatch[1]) {
          twoPartyRequired = requiresTwoPartyConsent(stateMatch[1]);
        }
      }

      // Build TwiML URL with consent parameters
      const twimlParams = new URLSearchParams({
        twoPartyConsent: String(twoPartyRequired),
        record: String(params.recordingEnabled ?? false),
        transcribe: String(params.transcriptionEnabled ?? false),
      });

      const twilioCall = await client.calls.create({
        to: params.toNumber,
        from: params.fromNumber || this.config.defaultFromNumber || '',
        url: `${this.config.statusCallbackUrl}/../twiml/outbound?${twimlParams.toString()}`,
        statusCallback: this.config.statusCallbackUrl,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        record: params.recordingEnabled && !twoPartyRequired, // Don't auto-record if consent needed
        recordingStatusCallback: this.config.recordingStatusCallbackUrl,
        recordingStatusCallbackEvent: ['in-progress', 'completed', 'absent'],
        timeout: 60,
        machineDetection: 'Enable',
      });

      const callId = `call_${randomUUID()}`;

      const voiceCall: VoiceCall = {
        id: callId,
        externalId: twilioCall.sid,
        tenantId: params.tenantId,
        direction: 'outbound',
        status: this.mapTwilioStatus(twilioCall.status),
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
        twoPartyConsentRequired: twoPartyRequired,
        policyViolations: [],
        metadata: params.metadata,
      };

      this.calls.set(callId, voiceCall);
      this.callSidMapping.set(twilioCall.sid, callId);

      return Ok(voiceCall);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return Err('TWILIO_ERROR', `Failed to initiate call: ${message}`);
    }
  }

  /**
   * Answer an inbound call (used for WebRTC bridging)
   */
  async answerCall(callId: string): Promise<Result<void>> {
    const call = this.calls.get(callId);
    if (!call) {
      return Promise.resolve(Err('NOT_FOUND', `Call ${callId} not found`));
    }

    call.status = 'in_progress';
    call.answeredAt = new Date();
    return Promise.resolve(Ok(undefined));
  }

  /**
   * End a call
   */
  async endCall(callId: string, reason?: string): Promise<Result<void>> {
    try {
      const call = this.calls.get(callId);
      if (!call) {
        return Err('NOT_FOUND', `Call ${callId} not found`);
      }

      if (!call.externalId) {
        return Err('INVALID_STATE', 'Call has no external ID');
      }

      const client = this.getClient();
      await client.calls.get(call.externalId).update({ status: 'completed' });

      call.status = 'completed';
      call.endedAt = new Date();
      if (call.answeredAt) {
        call.durationSeconds = Math.floor(
          (call.endedAt.getTime() - call.answeredAt.getTime()) / 1000
        );
      }
      if (reason) {
        call.metadata = { ...call.metadata, endReason: reason };
      }

      return Ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return Err('TWILIO_ERROR', `Failed to end call: ${message}`);
    }
  }

  /**
   * Put call on hold
   */
  async holdCall(callId: string): Promise<Result<void>> {
    try {
      const call = this.calls.get(callId);
      if (!call || !call.externalId) {
        return Err('NOT_FOUND', `Call ${callId} not found`);
      }

      const client = this.getClient();
      await client.calls.get(call.externalId).update({
        twiml: '<Response><Play loop="0">https://api.twilio.com/cowbell.mp3</Play></Response>',
      });

      call.status = 'on_hold';
      return Ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return Err('TWILIO_ERROR', `Failed to hold call: ${message}`);
    }
  }

  /**
   * Resume a held call
   */
  async resumeCall(callId: string): Promise<Result<void>> {
    const call = this.calls.get(callId);
    if (!call) {
      return Promise.resolve(Err('NOT_FOUND', `Call ${callId} not found`));
    }

    call.status = 'in_progress';
    return Promise.resolve(Ok(undefined));
  }

  /**
   * Transfer call to another number
   */
  async transferCall(callId: string, toNumber: string): Promise<Result<void>> {
    try {
      const call = this.calls.get(callId);
      if (!call || !call.externalId) {
        return Err('NOT_FOUND', `Call ${callId} not found`);
      }

      const client = this.getClient();
      await client.calls.get(call.externalId).update({
        twiml: `<Response><Dial>${toNumber}</Dial></Response>`,
      });

      call.metadata = { ...call.metadata, transferredTo: toNumber };
      return Ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return Err('TWILIO_ERROR', `Failed to transfer call: ${message}`);
    }
  }

  /**
   * Start recording (for calls without auto-record)
   */
  async startRecording(callId: string): Promise<Result<string>> {
    try {
      const call = this.calls.get(callId);
      if (!call || !call.externalId) {
        return Err('NOT_FOUND', `Call ${callId} not found`);
      }

      // Twilio handles recording via API
      const client = this.getClient();

      // For in-progress calls, use conference recording or call update
      // This is a simplified implementation
      await client.calls.get(call.externalId).update({
        twiml: '<Response><Record recordingStatusCallback="' +
          this.config.recordingStatusCallbackUrl +
          '"/></Response>',
      });

      const recordingId = `rec_${randomUUID()}`;
      call.recordingEnabled = true;
      return Ok(recordingId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return Err('TWILIO_ERROR', `Failed to start recording: ${message}`);
    }
  }

  /**
   * Stop recording
   */
  async stopRecording(callId: string): Promise<Result<void>> {
    try {
      const call = this.calls.get(callId);
      if (!call || !call.externalId) {
        return Err('NOT_FOUND', `Call ${callId} not found`);
      }

      const client = this.getClient();
      const recordings = await client.calls.get(call.externalId).recordings.list();

      for (const recording of recordings) {
        if (recording.status === 'in-progress') {
          await client.recordings.get(recording.sid).update({ status: 'stopped' });
        }
      }

      return Ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return Err('TWILIO_ERROR', `Failed to stop recording: ${message}`);
    }
  }

  /**
   * Pause recording
   */
  async pauseRecording(callId: string): Promise<Result<void>> {
    try {
      const call = this.calls.get(callId);
      if (!call || !call.externalId) {
        return Err('NOT_FOUND', `Call ${callId} not found`);
      }

      const client = this.getClient();
      const recordings = await client.calls.get(call.externalId).recordings.list();

      for (const recording of recordings) {
        if (recording.status === 'in-progress') {
          await client.recordings.get(recording.sid).update({ status: 'paused' });
        }
      }

      return Ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return Err('TWILIO_ERROR', `Failed to pause recording: ${message}`);
    }
  }

  /**
   * Resume recording
   */
  async resumeRecording(callId: string): Promise<Result<void>> {
    try {
      const call = this.calls.get(callId);
      if (!call || !call.externalId) {
        return Err('NOT_FOUND', `Call ${callId} not found`);
      }

      const client = this.getClient();
      const recordings = await client.calls.get(call.externalId).recordings.list();

      for (const recording of recordings) {
        if (recording.status === 'paused') {
          await client.recordings.get(recording.sid).update({ status: 'in-progress' });
        }
      }

      return Ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return Err('TWILIO_ERROR', `Failed to resume recording: ${message}`);
    }
  }

  /**
   * Get current call status
   */
  async getCallStatus(callId: string): Promise<Result<CallStatus>> {
    try {
      const call = this.calls.get(callId);
      if (!call) {
        return Err('NOT_FOUND', `Call ${callId} not found`);
      }

      // Optionally refresh from Twilio
      if (call.externalId && call.status !== 'completed') {
        const client = this.getClient();
        const twilioCall = await client.calls.get(call.externalId).fetch();
        call.status = this.mapTwilioStatus(twilioCall.status);
      }

      return Ok(call.status);
    } catch {
      const cachedCall = this.calls.get(callId);
      return Ok(cachedCall?.status ?? 'failed');
    }
  }

  /**
   * Get call details
   */
  async getCall(callId: string): Promise<Result<VoiceCall | null>> {
    const call = this.calls.get(callId);
    return Promise.resolve(Ok(call ?? null));
  }

  /**
   * Get call by Twilio SID
   */
  getCallBySid(sid: string): VoiceCall | null {
    const callId = this.callSidMapping.get(sid);
    if (!callId) return null;
    return this.calls.get(callId) ?? null;
  }

  /**
   * Handle Twilio webhook
   */
  async handleWebhook(payload: unknown): Promise<Result<WebhookEvent>> {
    const data = payload as Record<string, string>;

    const callSid = data['CallSid'] || 'unknown';
    const callStatus = data['CallStatus'] || '';
    const recordingSid = data['RecordingSid'];
    const recordingUrl = data['RecordingUrl'];
    const recordingStatus = data['RecordingStatus'];
    const transcriptionSid = data['TranscriptionSid'];
    const transcriptionText = data['TranscriptionText'];

    // Update internal call state
    const call = this.getCallBySid(callSid);
    if (call) {
      call.status = this.mapTwilioStatus(callStatus);

      if (callStatus === 'in-progress' && !call.answeredAt) {
        call.answeredAt = new Date();
      }

      if (callStatus === 'completed' || callStatus === 'busy' || callStatus === 'no-answer' || callStatus === 'failed') {
        call.endedAt = new Date();
        if (data['CallDuration']) {
          call.durationSeconds = parseInt(data['CallDuration'], 10);
        }
      }

      if (recordingSid && recordingUrl) {
        call.recordingUrl = recordingUrl;
      }
    }

    // Determine event type
    let eventType: WebhookEvent['type'] = 'call.initiated';

    if (transcriptionSid && transcriptionText) {
      eventType = 'transcription.completed';
    } else if (recordingSid && recordingStatus === 'completed') {
      eventType = 'recording.completed';
    } else if (recordingSid && recordingStatus === 'in-progress') {
      eventType = 'recording.started';
    } else {
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
        case 'canceled':
          eventType = 'call.failed';
          break;
      }
    }

    return Ok({
      type: eventType,
      callId: call?.id || callSid,
      externalId: callSid,
      timestamp: new Date(),
      data: {
        ...data,
        internalCallId: call?.id,
      },
    });
  }

  /**
   * Validate webhook signature
   */
  validateWebhookSignature(
    url: string,
    params: Record<string, string>,
    signature: string
  ): boolean {
    // Build validation string
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}${params[key]}`)
      .join('');
    const data = url + sortedParams;

    // Calculate expected signature
    const expected = createHash('sha1')
      .update(data + this.config.authToken)
      .digest('base64');

    return signature === expected;
  }

  /**
   * Generate TwiML for outbound call
   */
  generateOutboundTwiml(params: {
    twoPartyConsent: boolean;
    record: boolean;
    transcribe: boolean;
    message?: string;
  }): string {
    const parts: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', '<Response>'];

    // If two-party consent required, play disclosure first
    if (params.twoPartyConsent) {
      parts.push('<Say>This call may be recorded for quality and training purposes. Press 1 to consent and continue, or press 2 to decline.</Say>');
      parts.push('<Gather numDigits="1" action="/webhooks/twilio/consent">');
      parts.push('<Say>Please press 1 to consent or 2 to decline.</Say>');
      parts.push('</Gather>');
      parts.push('<Say>No input received. Goodbye.</Say>');
    } else {
      // Optional recording disclosure
      if (params.record) {
        parts.push('<Say>This call may be recorded for quality purposes.</Say>');
      }
      // Message or dial
      if (params.message) {
        parts.push(`<Say>${this.escapeXml(params.message)}</Say>`);
      }
    }

    parts.push('</Response>');
    return parts.join('\n');
  }

  /**
   * Map Twilio status to internal status
   */
  private mapTwilioStatus(twilioStatus: string): CallStatus {
    switch (twilioStatus) {
      case 'queued':
      case 'initiated':
        return 'initiated';
      case 'ringing':
        return 'ringing';
      case 'in-progress':
        return 'in_progress';
      case 'completed':
        return 'completed';
      case 'busy':
        return 'busy';
      case 'no-answer':
        return 'no_answer';
      case 'failed':
        return 'failed';
      case 'canceled':
        return 'canceled';
      default:
        return 'initiated';
    }
  }

  /**
   * Escape XML special characters
   */
  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

// =============================================================================
// Factory
// =============================================================================

let productionProvider: TwilioVoiceProviderProduction | null = null;

export function getTwilioProductionProvider(
  config?: TwilioConfig
): TwilioVoiceProviderProduction {
  if (!productionProvider && config) {
    productionProvider = new TwilioVoiceProviderProduction(config);
  }
  if (!productionProvider) {
    throw new Error('Twilio production provider not initialized');
  }
  return productionProvider;
}
