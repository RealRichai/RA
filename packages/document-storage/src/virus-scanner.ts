/**
 * Virus Scanner
 *
 * ClamAV integration for scanning uploaded documents.
 */

import { Socket } from 'net';
import type { ClamAVConfig, ScanResult, ScanJob } from './types';
import { getStorageClient } from './s3-client';

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_CONFIG: ClamAVConfig = {
  host: process.env.CLAMAV_HOST || 'localhost',
  port: parseInt(process.env.CLAMAV_PORT || '3310', 10),
  timeout: parseInt(process.env.CLAMAV_TIMEOUT || '60000', 10),
};

// =============================================================================
// ClamAV Scanner
// =============================================================================

export class VirusScanner {
  private config: ClamAVConfig;
  private isAvailable: boolean | null = null;

  constructor(config: Partial<ClamAVConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if ClamAV is available
   */
  async ping(): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new Socket();
      const timeout = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, 5000);

      socket.connect(this.config.port, this.config.host, () => {
        socket.write('PING\0');
      });

      socket.on('data', (data) => {
        clearTimeout(timeout);
        socket.destroy();
        resolve(data.toString().trim() === 'PONG');
      });

      socket.on('error', () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve(false);
      });
    });
  }

  /**
   * Get ClamAV version
   */
  async version(): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = new Socket();
      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error('ClamAV version check timed out'));
      }, 5000);

      socket.connect(this.config.port, this.config.host, () => {
        socket.write('VERSION\0');
      });

      let response = '';
      socket.on('data', (data) => {
        response += data.toString();
      });

      socket.on('end', () => {
        clearTimeout(timeout);
        resolve(response.trim());
      });

      socket.on('error', (err) => {
        clearTimeout(timeout);
        socket.destroy();
        reject(err);
      });
    });
  }

  /**
   * Scan a buffer for viruses using INSTREAM
   */
  async scanBuffer(buffer: Buffer): Promise<ScanResult> {
    const startTime = Date.now();

    return new Promise((resolve) => {
      const socket = new Socket();
      let response = '';

      const timeout = setTimeout(() => {
        socket.destroy();
        resolve({
          isClean: false,
          scannedAt: new Date(),
          scanDuration: Date.now() - startTime,
          error: 'Scan timed out',
        });
      }, this.config.timeout);

      socket.connect(this.config.port, this.config.host, () => {
        // Start INSTREAM command
        socket.write('zINSTREAM\0');

        // Send chunk size (4 bytes, network byte order) followed by chunk
        const sizeBuffer = Buffer.alloc(4);
        sizeBuffer.writeUInt32BE(buffer.length, 0);
        socket.write(sizeBuffer);
        socket.write(buffer);

        // Send zero-length chunk to end stream
        const endBuffer = Buffer.alloc(4);
        endBuffer.writeUInt32BE(0, 0);
        socket.write(endBuffer);
      });

      socket.on('data', (data) => {
        response += data.toString();
      });

      socket.on('end', () => {
        clearTimeout(timeout);
        const result = this.parseResponse(response, startTime);
        resolve(result);
      });

      socket.on('error', (err) => {
        clearTimeout(timeout);
        socket.destroy();
        resolve({
          isClean: false,
          scannedAt: new Date(),
          scanDuration: Date.now() - startTime,
          error: err.message,
        });
      });
    });
  }

  /**
   * Scan a file from S3/MinIO storage
   */
  async scanStoredFile(key: string, _bucket?: string): Promise<ScanResult> {
    const startTime = Date.now();

    try {
      const storage = getStorageClient();
      const { body } = await storage.get(key);

      // Convert stream to buffer
      const chunks: Buffer[] = [];
      for await (const chunk of body) {
        chunks.push(Buffer.from(chunk));
      }
      const buffer = Buffer.concat(chunks);

      return await this.scanBuffer(buffer);
    } catch (error) {
      return {
        isClean: false,
        scannedAt: new Date(),
        scanDuration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Failed to retrieve file for scanning',
      };
    }
  }

  /**
   * Parse ClamAV response
   */
  private parseResponse(response: string, startTime: number): ScanResult {
    const trimmed = response.trim();
    const scanDuration = Date.now() - startTime;
    const scannedAt = new Date();

    // Clean file response: "stream: OK"
    if (trimmed.includes('OK')) {
      return {
        isClean: true,
        scannedAt,
        scanDuration,
      };
    }

    // Infected file response: "stream: VIRUS_NAME FOUND"
    const foundMatch = trimmed.match(/stream:\s+(.+)\s+FOUND/);
    if (foundMatch) {
      return {
        isClean: false,
        virusName: foundMatch[1],
        scannedAt,
        scanDuration,
      };
    }

    // Error response
    const errorMatch = trimmed.match(/stream:\s+(.+)\s+ERROR/);
    if (errorMatch) {
      return {
        isClean: false,
        scannedAt,
        scanDuration,
        error: errorMatch[1],
      };
    }

    // Unknown response
    return {
      isClean: false,
      scannedAt,
      scanDuration,
      error: `Unknown response: ${trimmed}`,
    };
  }

  /**
   * Check if scanner is available (cached)
   */
  async isServiceAvailable(): Promise<boolean> {
    if (this.isAvailable === null) {
      this.isAvailable = await this.ping();
    }
    return this.isAvailable;
  }

  /**
   * Reset availability cache
   */
  resetAvailabilityCache(): void {
    this.isAvailable = null;
  }
}

// =============================================================================
// Scan Queue Manager
// =============================================================================

export interface ScanQueueConfig {
  maxConcurrent: number;
  retryAttempts: number;
  retryDelay: number;
}

const DEFAULT_QUEUE_CONFIG: ScanQueueConfig = {
  maxConcurrent: 3,
  retryAttempts: 3,
  retryDelay: 5000,
};

type ScanJobHandler = (job: ScanJob, result: ScanResult) => Promise<void>;

export class ScanQueue {
  private scanner: VirusScanner;
  private config: ScanQueueConfig;
  private queue: ScanJob[] = [];
  private processing: Map<string, ScanJob> = new Map();
  private handlers: {
    onComplete?: ScanJobHandler;
    onQuarantine?: ScanJobHandler;
    onError?: ScanJobHandler;
  } = {};

  constructor(
    scanner?: VirusScanner,
    config: Partial<ScanQueueConfig> = {}
  ) {
    this.scanner = scanner || new VirusScanner();
    this.config = { ...DEFAULT_QUEUE_CONFIG, ...config };
  }

  /**
   * Register event handlers
   */
  on(
    event: 'complete' | 'quarantine' | 'error',
    handler: ScanJobHandler
  ): void {
    if (event === 'complete') this.handlers.onComplete = handler;
    if (event === 'quarantine') this.handlers.onQuarantine = handler;
    if (event === 'error') this.handlers.onError = handler;
  }

  /**
   * Add a file to the scan queue
   */
  async enqueue(documentId: string, key: string, bucket: string): Promise<ScanJob> {
    const job: ScanJob = {
      documentId,
      key,
      bucket,
      status: 'pending',
      attempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.queue.push(job);
    this.processNext();

    return job;
  }

  /**
   * Process next job in queue
   */
  private async processNext(): Promise<void> {
    if (this.processing.size >= this.config.maxConcurrent) {
      return;
    }

    const job = this.queue.shift();
    if (!job) {
      return;
    }

    this.processing.set(job.documentId, job);
    job.status = 'scanning';
    job.attempts++;
    job.updatedAt = new Date();

    try {
      const result = await this.scanner.scanStoredFile(job.key, job.bucket);
      job.result = result;
      job.status = 'completed';
      job.updatedAt = new Date();

      if (result.isClean) {
        await this.handlers.onComplete?.(job, result);
      } else if (result.virusName) {
        await this.handlers.onQuarantine?.(job, result);
      } else if (result.error) {
        throw new Error(result.error);
      }
    } catch (error) {
      job.status = 'failed';
      job.updatedAt = new Date();

      if (job.attempts < this.config.retryAttempts) {
        // Retry after delay
        setTimeout(() => {
          job.status = 'pending';
          this.queue.push(job);
          this.processing.delete(job.documentId);
          this.processNext();
        }, this.config.retryDelay);
      } else {
        const errorResult: ScanResult = {
          isClean: false,
          scannedAt: new Date(),
          scanDuration: 0,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
        job.result = errorResult;
        await this.handlers.onError?.(job, errorResult);
      }
    } finally {
      this.processing.delete(job.documentId);
      this.processNext();
    }
  }

  /**
   * Get queue status
   */
  getStatus(): { queued: number; processing: number; jobs: ScanJob[] } {
    return {
      queued: this.queue.length,
      processing: this.processing.size,
      jobs: [...this.queue, ...Array.from(this.processing.values())],
    };
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let scannerInstance: VirusScanner | null = null;

export function getVirusScanner(config?: Partial<ClamAVConfig>): VirusScanner {
  if (!scannerInstance || config) {
    scannerInstance = new VirusScanner(config);
  }
  return scannerInstance;
}
