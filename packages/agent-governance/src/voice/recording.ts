/**
 * Recording & Transcription Pipeline
 *
 * Manages call recording storage, transcription processing,
 * and PII redaction for compliance.
 */

import { randomUUID } from 'crypto';

import type { Result } from '../types';
import { Ok, Err } from '../types';

import type {
  VoiceCall,
  Transcript,
  TranscriptSegment,
} from './types';

// =============================================================================
// Recording Storage Interface
// =============================================================================

export interface RecordingStorageConfig {
  provider: 'local' | 's3' | 'gcs' | 'azure';
  bucket?: string;
  region?: string;
  prefix?: string;
  encryptionKey?: string;
}

export interface RecordingMetadata {
  id: string;
  callId: string;
  tenantId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number;
  storageUrl: string;
  createdAt: Date;
  expiresAt?: Date;
  encrypted: boolean;
  checksumSha256: string;
}

export interface RecordingStorage {
  store(
    callId: string,
    tenantId: string,
    audioBuffer: Buffer,
    options?: { mimeType?: string; expiresAt?: Date }
  ): Promise<Result<RecordingMetadata>>;

  retrieve(recordingId: string): Promise<Result<Buffer>>;

  delete(recordingId: string): Promise<Result<void>>;

  getMetadata(recordingId: string): Promise<Result<RecordingMetadata | null>>;

  listByCall(callId: string): Promise<Result<RecordingMetadata[]>>;

  listByTenant(tenantId: string, options?: { limit?: number; startDate?: Date }): Promise<Result<RecordingMetadata[]>>;
}

// =============================================================================
// In-Memory Recording Storage (for testing)
// =============================================================================

export class InMemoryRecordingStorage implements RecordingStorage {
  private recordings: Map<string, { metadata: RecordingMetadata; data: Buffer }> = new Map();

  store(
    callId: string,
    tenantId: string,
    audioBuffer: Buffer,
    options?: { mimeType?: string; expiresAt?: Date }
  ): Promise<Result<RecordingMetadata>> {
    const id = `rec_${randomUUID()}`;
    const metadata: RecordingMetadata = {
      id,
      callId,
      tenantId,
      filename: `${id}.wav`,
      mimeType: options?.mimeType || 'audio/wav',
      sizeBytes: audioBuffer.length,
      durationSeconds: 0, // Would be calculated from audio
      storageUrl: `memory://${id}`,
      createdAt: new Date(),
      expiresAt: options?.expiresAt,
      encrypted: false,
      checksumSha256: this.calculateChecksum(audioBuffer),
    };

    this.recordings.set(id, { metadata, data: audioBuffer });
    return Promise.resolve(Ok(metadata));
  }

  retrieve(recordingId: string): Promise<Result<Buffer>> {
    const recording = this.recordings.get(recordingId);
    if (!recording) {
      return Promise.resolve(Err('NOT_FOUND', `Recording ${recordingId} not found`));
    }
    return Promise.resolve(Ok(recording.data));
  }

  delete(recordingId: string): Promise<Result<void>> {
    if (!this.recordings.has(recordingId)) {
      return Promise.resolve(Err('NOT_FOUND', `Recording ${recordingId} not found`));
    }
    this.recordings.delete(recordingId);
    return Promise.resolve(Ok(undefined));
  }

  getMetadata(recordingId: string): Promise<Result<RecordingMetadata | null>> {
    const recording = this.recordings.get(recordingId);
    return Promise.resolve(Ok(recording?.metadata || null));
  }

  listByCall(callId: string): Promise<Result<RecordingMetadata[]>> {
    const results = Array.from(this.recordings.values())
      .filter((r) => r.metadata.callId === callId)
      .map((r) => r.metadata);
    return Promise.resolve(Ok(results));
  }

  listByTenant(
    tenantId: string,
    options?: { limit?: number; startDate?: Date }
  ): Promise<Result<RecordingMetadata[]>> {
    let results = Array.from(this.recordings.values())
      .filter((r) => r.metadata.tenantId === tenantId)
      .map((r) => r.metadata);

    if (options?.startDate) {
      results = results.filter((r) => r.createdAt >= options.startDate!);
    }

    results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    if (options?.limit) {
      results = results.slice(0, options.limit);
    }

    return Promise.resolve(Ok(results));
  }

  clear(): void {
    this.recordings.clear();
  }

  private calculateChecksum(_buffer: Buffer): string {
    // In production, use crypto.createHash('sha256')
    return `sha256_mock_${Date.now()}`;
  }
}

// =============================================================================
// Transcription Service Interface
// =============================================================================

export interface TranscriptionServiceConfig {
  provider: 'whisper' | 'google' | 'aws' | 'azure' | 'deepgram';
  apiKey?: string;
  modelId?: string;
  language?: string;
  enablePiiRedaction?: boolean;
}

export interface TranscriptionService {
  transcribe(
    audioUrl: string,
    options?: {
      language?: string;
      speakerDiarization?: boolean;
      wordTimestamps?: boolean;
    }
  ): Promise<Result<Transcript>>;

  transcribeBuffer(
    audioBuffer: Buffer,
    options?: {
      mimeType?: string;
      language?: string;
      speakerDiarization?: boolean;
    }
  ): Promise<Result<Transcript>>;

  getStatus(transcriptionId: string): Promise<Result<'pending' | 'processing' | 'completed' | 'failed'>>;
}

// =============================================================================
// Mock Transcription Service (for testing)
// =============================================================================

export class MockTranscriptionService implements TranscriptionService {
  private transcripts: Map<string, Transcript> = new Map();

  transcribe(
    audioUrl: string,
    options?: {
      language?: string;
      speakerDiarization?: boolean;
      wordTimestamps?: boolean;
    }
  ): Promise<Result<Transcript>> {
    // Extract call ID from URL for mock purposes
    const callId = audioUrl.split('/').pop()?.replace('.wav', '') || `call_${randomUUID()}`;

    const transcript = this.createMockTranscript(callId, options?.language || 'en-US');
    this.transcripts.set(callId, transcript);

    return Promise.resolve(Ok(transcript));
  }

  transcribeBuffer(
    _audioBuffer: Buffer,
    options?: {
      mimeType?: string;
      language?: string;
      speakerDiarization?: boolean;
    }
  ): Promise<Result<Transcript>> {
    const callId = `call_${randomUUID()}`;
    const transcript = this.createMockTranscript(callId, options?.language || 'en-US');
    this.transcripts.set(callId, transcript);

    return Promise.resolve(Ok(transcript));
  }

  getStatus(_transcriptionId: string): Promise<Result<'pending' | 'processing' | 'completed' | 'failed'>> {
    return Promise.resolve(Ok('completed'));
  }

  private createMockTranscript(callId: string, language: string): Transcript {
    const segments: TranscriptSegment[] = [
      {
        id: `seg_${randomUUID()}`,
        callId,
        speaker: 'agent',
        text: 'Hello, thank you for calling. How can I help you today?',
        startTimeSeconds: 0,
        endTimeSeconds: 3,
        confidence: 0.95,
        redacted: false,
        piiDetected: false,
      },
      {
        id: `seg_${randomUUID()}`,
        callId,
        speaker: 'caller',
        text: 'Hi, I\'m interested in the property listing.',
        startTimeSeconds: 4,
        endTimeSeconds: 7,
        confidence: 0.92,
        redacted: false,
        piiDetected: false,
      },
    ];

    return {
      callId,
      segments,
      fullText: segments.map((s) => `${s.speaker}: ${s.text}`).join('\n'),
      redactedFullText: segments.map((s) => `${s.speaker}: ${s.text}`).join('\n'),
      languageCode: language,
      completedAt: new Date(),
      processingTimeMs: 1500,
    };
  }

  clear(): void {
    this.transcripts.clear();
  }
}

// =============================================================================
// Recording Pipeline
// =============================================================================

export interface RecordingPipelineConfig {
  storage: RecordingStorage;
  transcriptionService?: TranscriptionService;
  autoTranscribe?: boolean;
  retentionDays?: number;
  piiRedactionEnabled?: boolean;
}

export interface RecordingPipelineHooks {
  onRecordingStored?: (metadata: RecordingMetadata) => Promise<void>;
  onTranscriptionComplete?: (transcript: Transcript) => Promise<void>;
  onPiiDetected?: (callId: string, segments: TranscriptSegment[]) => Promise<void>;
}

export class RecordingPipeline {
  private config: RecordingPipelineConfig;
  private hooks: RecordingPipelineHooks;

  constructor(config: RecordingPipelineConfig, hooks: RecordingPipelineHooks = {}) {
    this.config = {
      autoTranscribe: true,
      retentionDays: 90,
      piiRedactionEnabled: true,
      ...config,
    };
    this.hooks = hooks;
  }

  /**
   * Process a completed call recording.
   */
  async processRecording(
    call: VoiceCall,
    audioBuffer: Buffer
  ): Promise<Result<{
    recording: RecordingMetadata;
    transcript?: Transcript;
  }>> {
    // Check consent
    if (!call.recordingConsent) {
      return Err('NO_CONSENT', 'Recording consent not granted');
    }

    // Store recording
    const expiresAt = this.config.retentionDays
      ? new Date(Date.now() + this.config.retentionDays * 24 * 60 * 60 * 1000)
      : undefined;

    const storeResult = await this.config.storage.store(
      call.id,
      call.tenantId,
      audioBuffer,
      { expiresAt }
    );

    if (!storeResult.ok) {
      return Err('STORAGE_ERROR', `Failed to store recording: ${storeResult.error.message}`);
    }

    const recording = storeResult.data;

    // Trigger hook
    if (this.hooks.onRecordingStored) {
      await this.hooks.onRecordingStored(recording);
    }

    // Transcribe if enabled
    let transcript: Transcript | undefined;
    if (this.config.autoTranscribe && this.config.transcriptionService && call.transcriptionConsent) {
      const transcribeResult = await this.config.transcriptionService.transcribeBuffer(
        audioBuffer,
        { speakerDiarization: true }
      );

      if (transcribeResult.ok) {
        transcript = transcribeResult.data;

        // Check for PII
        if (this.config.piiRedactionEnabled) {
          const piiSegments = transcript.segments.filter((s) => s.piiDetected);
          if (piiSegments.length > 0 && this.hooks.onPiiDetected) {
            await this.hooks.onPiiDetected(call.id, piiSegments);
          }
        }

        // Trigger hook
        if (this.hooks.onTranscriptionComplete) {
          await this.hooks.onTranscriptionComplete(transcript);
        }
      }
    }

    return Ok({ recording, transcript });
  }

  /**
   * Delete recording and associated data.
   */
  async deleteRecording(recordingId: string): Promise<Result<void>> {
    return this.config.storage.delete(recordingId);
  }

  /**
   * Get recording with metadata.
   */
  async getRecording(recordingId: string): Promise<Result<{
    metadata: RecordingMetadata;
    data: Buffer;
  } | null>> {
    const metadataResult = await this.config.storage.getMetadata(recordingId);
    if (!metadataResult.ok) {
      return Err('FETCH_ERROR', 'Failed to get recording metadata');
    }

    if (!metadataResult.data) {
      return Ok(null);
    }

    const dataResult = await this.config.storage.retrieve(recordingId);
    if (!dataResult.ok) {
      return Err('FETCH_ERROR', 'Failed to retrieve recording data');
    }

    return Ok({
      metadata: metadataResult.data,
      data: dataResult.data,
    });
  }

  /**
   * Clean up expired recordings.
   */
  async cleanupExpired(tenantId: string): Promise<Result<number>> {
    const listResult = await this.config.storage.listByTenant(tenantId);
    if (!listResult.ok) {
      return Err('LIST_ERROR', 'Failed to list recordings');
    }

    const now = new Date();
    let deletedCount = 0;

    for (const recording of listResult.data) {
      if (recording.expiresAt && recording.expiresAt < now) {
        const deleteResult = await this.config.storage.delete(recording.id);
        if (deleteResult.ok) {
          deletedCount++;
        }
      }
    }

    return Ok(deletedCount);
  }
}

// =============================================================================
// PII Redaction for Transcripts
// =============================================================================

const PII_PATTERNS = {
  ssn: /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/g,
  phone: /\b(\+?1[-.]?)?\(?\d{3}\)?[-.]?\d{3}[-.]?\d{4}\b/g,
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  creditCard: /\b(?:\d[ -]*?){13,16}\b/g,
  bankAccount: /\b\d{8,17}\b/g,
};

/**
 * Redact PII from transcript text.
 */
export function redactTranscriptPII(text: string): { redactedText: string; piiFound: boolean } {
  let redactedText = text;
  let piiFound = false;

  for (const pattern of Object.values(PII_PATTERNS)) {
    if (pattern.test(redactedText)) {
      piiFound = true;
      redactedText = redactedText.replace(pattern, '[REDACTED]');
    }
  }

  return { redactedText, piiFound };
}

/**
 * Redact PII from all transcript segments.
 */
export function redactTranscript(transcript: Transcript): Transcript {
  const redactedSegments = transcript.segments.map((segment) => {
    const { redactedText, piiFound } = redactTranscriptPII(segment.text);
    return {
      ...segment,
      text: redactedText,
      piiDetected: piiFound,
      redacted: piiFound,
    };
  });

  const { redactedText: redactedFullText } = redactTranscriptPII(transcript.fullText);

  return {
    ...transcript,
    segments: redactedSegments,
    redactedFullText,
  };
}
