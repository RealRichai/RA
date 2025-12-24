/**
 * Twilio Integration
 * SMS and voice services
 */

import { logger, createModuleLogger } from '../lib/logger.js';
import { Result, ok, err } from '../lib/result.js';
import { AppError, ErrorCode } from '../lib/errors.js';
import { env } from '../config/env.js';

const log = createModuleLogger('twilio');

// =============================================================================
// TYPES
// =============================================================================

export interface SMSOptions {
  to: string;
  body: string;
  from?: string;
  statusCallback?: string;
  mediaUrl?: string[];
}

export interface SMSResult {
  sid: string;
  status: string;
  to: string;
  from: string;
  dateCreated: Date;
}

export interface VoiceCallOptions {
  to: string;
  from?: string;
  url: string; // TwiML URL
  statusCallback?: string;
  record?: boolean;
}

export interface VoiceCallResult {
  sid: string;
  status: string;
  to: string;
  from: string;
  direction: string;
}

export interface PhoneVerificationResult {
  sid: string;
  to: string;
  channel: 'sms' | 'call';
  status: string;
}

// =============================================================================
// TWILIO CLIENT
// =============================================================================

class TwilioClient {
  private accountSid: string;
  private authToken: string;
  private defaultFrom: string;
  private verifySid: string;
  private baseUrl: string;

  constructor() {
    this.accountSid = env.TWILIO_ACCOUNT_SID || '';
    this.authToken = env.TWILIO_AUTH_TOKEN || '';
    this.defaultFrom = env.TWILIO_PHONE_NUMBER || '';
    this.verifySid = env.TWILIO_VERIFY_SID || '';
    this.baseUrl = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}`;
  }

  private isConfigured(): boolean {
    return Boolean(this.accountSid && this.authToken);
  }

  private getAuthHeader(): string {
    return 'Basic ' + Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
  }

  private formatPhone(phone: string): string {
    // Ensure E.164 format
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `+1${cleaned}`;
    }
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `+${cleaned}`;
    }
    if (!phone.startsWith('+')) {
      return `+${cleaned}`;
    }
    return phone;
  }

  async sendSMS(options: SMSOptions): Promise<Result<SMSResult, AppError>> {
    const to = this.formatPhone(options.to);

    if (!this.isConfigured()) {
      log.warn({ to }, 'Twilio not configured, skipping SMS send');
      return ok({
        sid: `mock-${Date.now()}`,
        status: 'sent',
        to,
        from: this.defaultFrom || '+10000000000',
        dateCreated: new Date(),
      });
    }

    try {
      const body = new URLSearchParams({
        To: to,
        From: options.from || this.defaultFrom,
        Body: options.body,
      });

      if (options.statusCallback) {
        body.append('StatusCallback', options.statusCallback);
      }

      if (options.mediaUrl?.length) {
        options.mediaUrl.forEach(url => body.append('MediaUrl', url));
      }

      const response = await fetch(`${this.baseUrl}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      const data = await response.json() as Record<string, unknown>;

      if (!response.ok) {
        log.error({ status: response.status, data }, 'Twilio SMS API error');
        return err(new AppError({
          code: ErrorCode.EXTERNAL_SERVICE_ERROR,
          message: `Twilio API error: ${data.message || response.status}`,
        }));
      }

      log.info({ sid: data.sid, to, status: data.status }, 'SMS sent successfully');

      return ok({
        sid: data.sid as string,
        status: data.status as string,
        to: data.to as string,
        from: data.from as string,
        dateCreated: new Date(data.date_created as string),
      });
    } catch (error) {
      log.error({ error }, 'Failed to send SMS');
      return err(new AppError({
        code: ErrorCode.EXTERNAL_SERVICE_ERROR,
        message: 'Failed to send SMS',
      }));
    }
  }

  async makeCall(options: VoiceCallOptions): Promise<Result<VoiceCallResult, AppError>> {
    const to = this.formatPhone(options.to);

    if (!this.isConfigured()) {
      log.warn({ to }, 'Twilio not configured, skipping call');
      return ok({
        sid: `mock-${Date.now()}`,
        status: 'initiated',
        to,
        from: this.defaultFrom || '+10000000000',
        direction: 'outbound-api',
      });
    }

    try {
      const body = new URLSearchParams({
        To: to,
        From: options.from || this.defaultFrom,
        Url: options.url,
      });

      if (options.statusCallback) {
        body.append('StatusCallback', options.statusCallback);
      }

      if (options.record) {
        body.append('Record', 'true');
      }

      const response = await fetch(`${this.baseUrl}/Calls.json`, {
        method: 'POST',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      const data = await response.json() as Record<string, unknown>;

      if (!response.ok) {
        log.error({ status: response.status, data }, 'Twilio Call API error');
        return err(new AppError({
          code: ErrorCode.EXTERNAL_SERVICE_ERROR,
          message: `Twilio API error: ${data.message || response.status}`,
        }));
      }

      log.info({ sid: data.sid, to, status: data.status }, 'Call initiated successfully');

      return ok({
        sid: data.sid as string,
        status: data.status as string,
        to: data.to as string,
        from: data.from as string,
        direction: data.direction as string,
      });
    } catch (error) {
      log.error({ error }, 'Failed to make call');
      return err(new AppError({
        code: ErrorCode.EXTERNAL_SERVICE_ERROR,
        message: 'Failed to make call',
      }));
    }
  }

  async sendVerificationCode(
    phone: string,
    channel: 'sms' | 'call' = 'sms'
  ): Promise<Result<PhoneVerificationResult, AppError>> {
    const to = this.formatPhone(phone);

    if (!this.isConfigured() || !this.verifySid) {
      log.warn({ to }, 'Twilio Verify not configured, skipping verification');
      return ok({
        sid: `mock-${Date.now()}`,
        to,
        channel,
        status: 'pending',
      });
    }

    try {
      const body = new URLSearchParams({
        To: to,
        Channel: channel,
      });

      const response = await fetch(
        `https://verify.twilio.com/v2/Services/${this.verifySid}/Verifications`,
        {
          method: 'POST',
          headers: {
            'Authorization': this.getAuthHeader(),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: body.toString(),
        }
      );

      const data = await response.json() as Record<string, unknown>;

      if (!response.ok) {
        log.error({ status: response.status, data }, 'Twilio Verify API error');
        return err(new AppError({
          code: ErrorCode.EXTERNAL_SERVICE_ERROR,
          message: `Twilio Verify error: ${data.message || response.status}`,
        }));
      }

      log.info({ sid: data.sid, to, channel }, 'Verification code sent');

      return ok({
        sid: data.sid as string,
        to: data.to as string,
        channel: data.channel as 'sms' | 'call',
        status: data.status as string,
      });
    } catch (error) {
      log.error({ error }, 'Failed to send verification code');
      return err(new AppError({
        code: ErrorCode.EXTERNAL_SERVICE_ERROR,
        message: 'Failed to send verification code',
      }));
    }
  }

  async checkVerificationCode(
    phone: string,
    code: string
  ): Promise<Result<{ valid: boolean; status: string }, AppError>> {
    const to = this.formatPhone(phone);

    if (!this.isConfigured() || !this.verifySid) {
      log.warn({ to }, 'Twilio Verify not configured, auto-approving');
      return ok({ valid: true, status: 'approved' });
    }

    try {
      const body = new URLSearchParams({
        To: to,
        Code: code,
      });

      const response = await fetch(
        `https://verify.twilio.com/v2/Services/${this.verifySid}/VerificationCheck`,
        {
          method: 'POST',
          headers: {
            'Authorization': this.getAuthHeader(),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: body.toString(),
        }
      );

      const data = await response.json() as Record<string, unknown>;

      if (!response.ok) {
        log.error({ status: response.status, data }, 'Twilio Verify check error');
        return err(new AppError({
          code: ErrorCode.EXTERNAL_SERVICE_ERROR,
          message: `Twilio Verify error: ${data.message || response.status}`,
        }));
      }

      const valid = data.status === 'approved';
      log.info({ to, valid, status: data.status }, 'Verification code checked');

      return ok({
        valid,
        status: data.status as string,
      });
    } catch (error) {
      log.error({ error }, 'Failed to check verification code');
      return err(new AppError({
        code: ErrorCode.EXTERNAL_SERVICE_ERROR,
        message: 'Failed to check verification code',
      }));
    }
  }
}

// =============================================================================
// EXPORTED INSTANCE & HELPERS
// =============================================================================

export const twilio = new TwilioClient();

// Helper functions for common SMS messages
export async function sendPaymentReminderSMS(
  phone: string,
  amount: number,
  dueDate: string
): Promise<Result<SMSResult, AppError>> {
  return twilio.sendSMS({
    to: phone,
    body: `RealRiches Reminder: Payment of $${amount.toLocaleString()} is due on ${dueDate}. Pay now at realriches.com/payments`,
  });
}

export async function sendTourReminderSMS(
  phone: string,
  address: string,
  scheduledTime: string
): Promise<Result<SMSResult, AppError>> {
  return twilio.sendSMS({
    to: phone,
    body: `RealRiches Reminder: Your tour at ${address} is scheduled for ${scheduledTime}. Reply CANCEL to cancel.`,
  });
}

export async function sendLeaseExpirationSMS(
  phone: string,
  daysLeft: number,
  address: string
): Promise<Result<SMSResult, AppError>> {
  return twilio.sendSMS({
    to: phone,
    body: `RealRiches: Your lease at ${address} expires in ${daysLeft} days. Log in to review renewal options.`,
  });
}

export async function sendApplicationStatusSMS(
  phone: string,
  status: string,
  address: string
): Promise<Result<SMSResult, AppError>> {
  return twilio.sendSMS({
    to: phone,
    body: `RealRiches: Your application for ${address} has been ${status}. Log in for details.`,
  });
}
