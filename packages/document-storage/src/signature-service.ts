/**
 * Signature Request Service
 *
 * Manages signature requests with email and in-app notifications.
 */

import { randomBytes } from 'crypto';

// =============================================================================
// Types
// =============================================================================

export interface SignatureRequest {
  id: string;
  documentId: string;
  documentName: string;
  signerId: string;
  signerEmail: string;
  signerName: string;
  signerRole: 'landlord' | 'tenant' | 'agent' | 'witness' | 'guarantor';
  status: 'pending' | 'sent' | 'viewed' | 'signed' | 'declined' | 'expired';
  order: number;
  accessToken: string;
  message?: string;
  dueDate?: Date;
  requestedAt: Date;
  sentAt?: Date;
  viewedAt?: Date;
  signedAt?: Date;
  declinedAt?: Date;
  declineReason?: string;
  signatureData?: string;
  signatureImageUrl?: string;
  ipAddress?: string;
  userAgent?: string;
  remindersSent: number;
  lastReminderAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface SignatureRequestInput {
  documentId: string;
  documentName: string;
  signers: Array<{
    userId: string;
    email: string;
    name: string;
    role: SignatureRequest['signerRole'];
    order?: number;
  }>;
  message?: string;
  dueDate?: Date;
  expiresInDays?: number;
}

export interface SignatureCompletionInput {
  requestId: string;
  signatureData: string;
  signatureImageUrl?: string;
  ipAddress: string;
  userAgent: string;
}

export interface EmailJob {
  id: string;
  type: 'signature_request' | 'signature_reminder' | 'signature_complete' | 'document_signed';
  to: string;
  subject: string;
  templateId: string;
  templateData: Record<string, unknown>;
  status: 'pending' | 'sent' | 'failed' | 'bounced';
  attempts: number;
  maxAttempts: number;
  scheduledAt: Date;
  sentAt?: Date;
  failedAt?: Date;
  error?: string;
  createdAt: Date;
}

export interface NotificationJob {
  id: string;
  type: 'signature_request' | 'signature_reminder' | 'signature_complete' | 'document_signed';
  userId: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  status: 'pending' | 'sent' | 'read' | 'dismissed';
  channel: 'in_app' | 'push' | 'both';
  createdAt: Date;
}

// =============================================================================
// Email Queue (Stubbed)
// =============================================================================

type EmailQueueHandler = (job: EmailJob) => Promise<void>;

export class EmailQueue {
  private queue: EmailJob[] = [];
  private processing: Map<string, EmailJob> = new Map();
  private handlers: {
    onSend?: EmailQueueHandler;
    onFail?: EmailQueueHandler;
  } = {};

  /**
   * Register event handlers
   */
  on(event: 'send' | 'fail', handler: EmailQueueHandler): void {
    if (event === 'send') this.handlers.onSend = handler;
    if (event === 'fail') this.handlers.onFail = handler;
  }

  /**
   * Add an email to the queue
   */
  async enqueue(job: Omit<EmailJob, 'id' | 'status' | 'attempts' | 'createdAt'>): Promise<EmailJob> {
    const emailJob: EmailJob = {
      ...job,
      id: `email_${Date.now()}_${randomBytes(4).toString('hex')}`,
      status: 'pending',
      attempts: 0,
      maxAttempts: job.maxAttempts || 3,
      createdAt: new Date(),
    };

    this.queue.push(emailJob);

    // In production, this would add to Redis/BullMQ queue
    console.log(`[EmailQueue] Enqueued email job ${emailJob.id}: ${emailJob.subject} to ${emailJob.to}`);

    // Auto-process in development (stubbed)
    this.processNext();

    return emailJob;
  }

  /**
   * Process next job in queue
   */
  private async processNext(): Promise<void> {
    const job = this.queue.shift();
    if (!job) return;

    this.processing.set(job.id, job);
    job.attempts++;

    try {
      // In production, this would send via SendGrid, SES, etc.
      console.log(`[EmailQueue] Sending email ${job.id}...`);

      // Stubbed: Mark as sent
      job.status = 'sent';
      job.sentAt = new Date();

      await this.handlers.onSend?.(job);

      console.log(`[EmailQueue] Email ${job.id} sent successfully`);
    } catch (error) {
      job.status = 'failed';
      job.failedAt = new Date();
      job.error = error instanceof Error ? error.message : 'Unknown error';

      if (job.attempts < job.maxAttempts) {
        // Re-queue for retry
        job.status = 'pending';
        this.queue.push(job);
      } else {
        await this.handlers.onFail?.(job);
      }
    } finally {
      this.processing.delete(job.id);
    }
  }

  /**
   * Get queue status
   */
  getStatus(): { pending: number; processing: number; jobs: EmailJob[] } {
    return {
      pending: this.queue.length,
      processing: this.processing.size,
      jobs: [...this.queue, ...Array.from(this.processing.values())],
    };
  }
}

// =============================================================================
// Notification Queue
// =============================================================================

type NotificationQueueHandler = (job: NotificationJob) => Promise<void>;

export class NotificationQueue {
  private queue: NotificationJob[] = [];
  private handlers: {
    onSend?: NotificationQueueHandler;
  } = {};

  on(event: 'send', handler: NotificationQueueHandler): void {
    if (event === 'send') this.handlers.onSend = handler;
  }

  async enqueue(job: Omit<NotificationJob, 'id' | 'status' | 'createdAt'>): Promise<NotificationJob> {
    const notificationJob: NotificationJob = {
      ...job,
      id: `notif_${Date.now()}_${randomBytes(4).toString('hex')}`,
      status: 'pending',
      createdAt: new Date(),
    };

    this.queue.push(notificationJob);

    console.log(`[NotificationQueue] Enqueued notification ${notificationJob.id}: ${notificationJob.title}`);

    // Process immediately
    this.processNext();

    return notificationJob;
  }

  private async processNext(): Promise<void> {
    const job = this.queue.shift();
    if (!job) return;

    job.status = 'sent';
    await this.handlers.onSend?.(job);
  }

  getStatus(): { pending: number; jobs: NotificationJob[] } {
    return {
      pending: this.queue.length,
      jobs: this.queue,
    };
  }
}

// =============================================================================
// Signature Service
// =============================================================================

export class SignatureService {
  private emailQueue: EmailQueue;
  private notificationQueue: NotificationQueue;
  private requests: Map<string, SignatureRequest> = new Map();

  constructor() {
    this.emailQueue = new EmailQueue();
    this.notificationQueue = new NotificationQueue();

    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.emailQueue.on('send', async (job) => {
      console.log(`[SignatureService] Email sent: ${job.subject}`);
    });

    this.emailQueue.on('fail', async (job) => {
      console.error(`[SignatureService] Email failed: ${job.subject} - ${job.error}`);
    });

    this.notificationQueue.on('send', async (job) => {
      console.log(`[SignatureService] Notification sent: ${job.title}`);
    });
  }

  /**
   * Create signature requests for a document
   */
  async createRequests(input: SignatureRequestInput): Promise<SignatureRequest[]> {
    const requests: SignatureRequest[] = [];
    const expiresAt = input.expiresInDays
      ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
      : undefined;

    for (let i = 0; i < input.signers.length; i++) {
      const signer = input.signers[i]!;
      const request: SignatureRequest = {
        id: `sig_${Date.now()}_${randomBytes(4).toString('hex')}`,
        documentId: input.documentId,
        documentName: input.documentName,
        signerId: signer.userId,
        signerEmail: signer.email,
        signerName: signer.name,
        signerRole: signer.role,
        status: 'pending',
        order: signer.order ?? i + 1,
        accessToken: this.generateAccessToken(),
        message: input.message,
        dueDate: input.dueDate,
        requestedAt: new Date(),
        remindersSent: 0,
        expiresAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.requests.set(request.id, request);
      requests.push(request);
    }

    // Sort by order
    requests.sort((a, b) => a.order - b.order);

    // Send request to first signer (or all if parallel signing)
    if (requests[0]) {
      await this.sendRequest(requests[0]);
    }

    return requests;
  }

  /**
   * Generate secure access token
   */
  private generateAccessToken(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Send signature request email and notification
   */
  async sendRequest(request: SignatureRequest): Promise<void> {
    const signUrl = `${process.env.APP_URL || 'https://app.realriches.com'}/sign/${request.accessToken}`;

    // Queue email
    await this.emailQueue.enqueue({
      type: 'signature_request',
      to: request.signerEmail,
      subject: `Signature Required: ${request.documentName}`,
      templateId: 'signature_request',
      templateData: {
        signerName: request.signerName,
        documentName: request.documentName,
        message: request.message,
        signUrl,
        dueDate: request.dueDate?.toLocaleDateString(),
        expiresAt: request.expiresAt?.toLocaleDateString(),
      },
      maxAttempts: 3,
      scheduledAt: new Date(),
    });

    // Queue in-app notification
    await this.notificationQueue.enqueue({
      type: 'signature_request',
      userId: request.signerId,
      title: 'Signature Required',
      body: `You have been asked to sign "${request.documentName}"`,
      data: {
        documentId: request.documentId,
        requestId: request.id,
        signUrl,
      },
      channel: 'both',
    });

    // Update status
    request.status = 'sent';
    request.sentAt = new Date();
    request.updatedAt = new Date();
  }

  /**
   * Record document view
   */
  async recordView(requestId: string, ipAddress: string, userAgent: string): Promise<SignatureRequest | null> {
    const request = this.requests.get(requestId);
    if (!request) return null;

    if (!request.viewedAt) {
      request.status = 'viewed';
      request.viewedAt = new Date();
      request.ipAddress = ipAddress;
      request.userAgent = userAgent;
      request.updatedAt = new Date();
    }

    return request;
  }

  /**
   * Complete signature
   */
  async completeSignature(input: SignatureCompletionInput): Promise<SignatureRequest | null> {
    const request = this.requests.get(input.requestId);
    if (!request) return null;

    if (request.status === 'signed' || request.status === 'declined') {
      throw new Error('Signature request already completed');
    }

    if (request.expiresAt && new Date() > request.expiresAt) {
      request.status = 'expired';
      request.updatedAt = new Date();
      throw new Error('Signature request has expired');
    }

    // Record signature
    request.status = 'signed';
    request.signedAt = new Date();
    request.signatureData = input.signatureData;
    request.signatureImageUrl = input.signatureImageUrl;
    request.ipAddress = input.ipAddress;
    request.userAgent = input.userAgent;
    request.updatedAt = new Date();

    // Send confirmation
    await this.emailQueue.enqueue({
      type: 'signature_complete',
      to: request.signerEmail,
      subject: `Signature Confirmed: ${request.documentName}`,
      templateId: 'signature_complete',
      templateData: {
        signerName: request.signerName,
        documentName: request.documentName,
        signedAt: request.signedAt.toLocaleString(),
      },
      maxAttempts: 3,
      scheduledAt: new Date(),
    });

    // Check if all signatures are complete
    await this.checkAllSignaturesComplete(request.documentId);

    return request;
  }

  /**
   * Decline signature
   */
  async declineSignature(requestId: string, reason: string): Promise<SignatureRequest | null> {
    const request = this.requests.get(requestId);
    if (!request) return null;

    request.status = 'declined';
    request.declinedAt = new Date();
    request.declineReason = reason;
    request.updatedAt = new Date();

    return request;
  }

  /**
   * Send reminder
   */
  async sendReminder(requestId: string): Promise<void> {
    const request = this.requests.get(requestId);
    if (!request) return;

    if (request.status !== 'pending' && request.status !== 'sent' && request.status !== 'viewed') {
      return;
    }

    const signUrl = `${process.env.APP_URL || 'https://app.realriches.com'}/sign/${request.accessToken}`;

    await this.emailQueue.enqueue({
      type: 'signature_reminder',
      to: request.signerEmail,
      subject: `Reminder: Signature Required for ${request.documentName}`,
      templateId: 'signature_reminder',
      templateData: {
        signerName: request.signerName,
        documentName: request.documentName,
        signUrl,
        dueDate: request.dueDate?.toLocaleDateString(),
        reminderNumber: request.remindersSent + 1,
      },
      maxAttempts: 3,
      scheduledAt: new Date(),
    });

    await this.notificationQueue.enqueue({
      type: 'signature_reminder',
      userId: request.signerId,
      title: 'Signature Reminder',
      body: `Reminder to sign "${request.documentName}"`,
      data: {
        documentId: request.documentId,
        requestId: request.id,
        signUrl,
      },
      channel: 'both',
    });

    request.remindersSent++;
    request.lastReminderAt = new Date();
    request.updatedAt = new Date();
  }

  /**
   * Check if all signatures are complete for a document
   */
  private async checkAllSignaturesComplete(documentId: string): Promise<void> {
    const documentRequests = Array.from(this.requests.values())
      .filter((r) => r.documentId === documentId);

    const allSigned = documentRequests.every((r) => r.status === 'signed');

    if (allSigned && documentRequests.length > 0) {
      // Notify all signers
      for (const request of documentRequests) {
        await this.emailQueue.enqueue({
          type: 'document_signed',
          to: request.signerEmail,
          subject: `Document Fully Signed: ${request.documentName}`,
          templateId: 'document_signed',
          templateData: {
            signerName: request.signerName,
            documentName: request.documentName,
            signers: documentRequests.map((r) => ({
              name: r.signerName,
              signedAt: r.signedAt?.toLocaleString(),
            })),
          },
          maxAttempts: 3,
          scheduledAt: new Date(),
        });
      }

      console.log(`[SignatureService] Document ${documentId} is fully signed`);
    }
  }

  /**
   * Get request by ID
   */
  getRequest(requestId: string): SignatureRequest | undefined {
    return this.requests.get(requestId);
  }

  /**
   * Get request by access token
   */
  getRequestByToken(accessToken: string): SignatureRequest | undefined {
    return Array.from(this.requests.values())
      .find((r) => r.accessToken === accessToken);
  }

  /**
   * Get all requests for a document
   */
  getRequestsForDocument(documentId: string): SignatureRequest[] {
    return Array.from(this.requests.values())
      .filter((r) => r.documentId === documentId)
      .sort((a, b) => a.order - b.order);
  }

  /**
   * Get queue statuses
   */
  getQueueStatus() {
    return {
      email: this.emailQueue.getStatus(),
      notification: this.notificationQueue.getStatus(),
    };
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let signatureServiceInstance: SignatureService | null = null;

export function getSignatureService(): SignatureService {
  if (!signatureServiceInstance) {
    signatureServiceInstance = new SignatureService();
  }
  return signatureServiceInstance;
}
