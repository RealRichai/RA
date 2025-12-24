/**
 * Seam Integration
 * Smart lock and access control management
 */

import { logger, createModuleLogger } from '../lib/logger.js';
import { Result, ok, err } from '../lib/result.js';
import { AppError, ErrorCode } from '../lib/errors.js';
import { env } from '../config/env.js';

const log = createModuleLogger('seam');

// =============================================================================
// TYPES
// =============================================================================

export interface SeamDevice {
  deviceId: string;
  deviceType: string;
  displayName: string;
  capabilities: string[];
  properties: {
    locked: boolean;
    online: boolean;
    batteryLevel?: number;
    manufacturer: string;
    model: string;
  };
  location?: {
    name: string;
    timezone: string;
  };
}

export interface AccessCode {
  accessCodeId: string;
  deviceId: string;
  name: string;
  code: string;
  type: 'time_bound' | 'ongoing';
  startsAt?: Date;
  endsAt?: Date;
  status: 'setting' | 'set' | 'removing' | 'unset' | 'unknown';
  createdAt: Date;
}

export interface CreateAccessCodeOptions {
  deviceId: string;
  name: string;
  code?: string; // Auto-generate if not provided
  startsAt?: Date;
  endsAt?: Date;
  maxTimeRounding?: 'hour' | 'day';
}

export interface LockActionResult {
  actionId: string;
  status: 'pending' | 'success' | 'error';
  deviceId: string;
  action: 'lock' | 'unlock';
}

// =============================================================================
// SEAM CLIENT
// =============================================================================

class SeamClient {
  private apiKey: string;
  private baseUrl = 'https://connect.getseam.com';

  constructor() {
    this.apiKey = env.SEAM_API_KEY || '';
  }

  private isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: Record<string, unknown>
  ): Promise<Result<T, AppError>> {
    if (!this.isConfigured()) {
      log.warn({ endpoint }, 'Seam not configured');
      return err(new AppError({
        code: ErrorCode.EXTERNAL_SERVICE_ERROR,
        message: 'Seam integration not configured',
      }));
    }

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      const data = await response.json() as Record<string, unknown>;

      if (!response.ok) {
        log.error({ status: response.status, data }, 'Seam API error');
        return err(new AppError({
          code: ErrorCode.EXTERNAL_SERVICE_ERROR,
          message: `Seam API error: ${(data as { error?: { message?: string } }).error?.message || response.status}`,
        }));
      }

      return ok(data as T);
    } catch (error) {
      log.error({ error, endpoint }, 'Seam request failed');
      return err(new AppError({
        code: ErrorCode.EXTERNAL_SERVICE_ERROR,
        message: 'Seam request failed',
      }));
    }
  }

  // ===========================================================================
  // DEVICES
  // ===========================================================================

  async listDevices(): Promise<Result<SeamDevice[], AppError>> {
    const result = await this.request<{ devices: SeamDevice[] }>('GET', '/devices/list');
    if (result.isErr()) return err(result.error);
    return ok(result.value.devices);
  }

  async getDevice(deviceId: string): Promise<Result<SeamDevice, AppError>> {
    const result = await this.request<{ device: SeamDevice }>('GET', `/devices/get?device_id=${deviceId}`);
    if (result.isErr()) return err(result.error);
    return ok(result.value.device);
  }

  async getDevicesByProperty(propertyId: string): Promise<Result<SeamDevice[], AppError>> {
    // In a real implementation, devices would be linked to properties via metadata
    const result = await this.request<{ devices: SeamDevice[] }>('GET', '/devices/list', {
      custom_metadata_has: { property_id: propertyId },
    });
    if (result.isErr()) return err(result.error);
    return ok(result.value.devices);
  }

  // ===========================================================================
  // LOCK ACTIONS
  // ===========================================================================

  async lockDoor(deviceId: string): Promise<Result<LockActionResult, AppError>> {
    log.info({ deviceId }, 'Locking door');

    const result = await this.request<{ action_attempt: { action_attempt_id: string; status: string } }>(
      'POST',
      '/locks/lock_door',
      { device_id: deviceId }
    );

    if (result.isErr()) return err(result.error);

    return ok({
      actionId: result.value.action_attempt.action_attempt_id,
      status: result.value.action_attempt.status as 'pending' | 'success' | 'error',
      deviceId,
      action: 'lock',
    });
  }

  async unlockDoor(deviceId: string): Promise<Result<LockActionResult, AppError>> {
    log.info({ deviceId }, 'Unlocking door');

    const result = await this.request<{ action_attempt: { action_attempt_id: string; status: string } }>(
      'POST',
      '/locks/unlock_door',
      { device_id: deviceId }
    );

    if (result.isErr()) return err(result.error);

    return ok({
      actionId: result.value.action_attempt.action_attempt_id,
      status: result.value.action_attempt.status as 'pending' | 'success' | 'error',
      deviceId,
      action: 'unlock',
    });
  }

  // ===========================================================================
  // ACCESS CODES
  // ===========================================================================

  async createAccessCode(options: CreateAccessCodeOptions): Promise<Result<AccessCode, AppError>> {
    log.info({ deviceId: options.deviceId, name: options.name }, 'Creating access code');

    const body: Record<string, unknown> = {
      device_id: options.deviceId,
      name: options.name,
    };

    if (options.code) {
      body.code = options.code;
    }

    if (options.startsAt && options.endsAt) {
      body.starts_at = options.startsAt.toISOString();
      body.ends_at = options.endsAt.toISOString();
      if (options.maxTimeRounding) {
        body.max_time_rounding = options.maxTimeRounding;
      }
    }

    const result = await this.request<{ access_code: Record<string, unknown> }>('POST', '/access_codes/create', body);
    if (result.isErr()) return err(result.error);

    const ac = result.value.access_code;
    return ok({
      accessCodeId: ac.access_code_id as string,
      deviceId: ac.device_id as string,
      name: ac.name as string,
      code: ac.code as string,
      type: ac.type as 'time_bound' | 'ongoing',
      startsAt: ac.starts_at ? new Date(ac.starts_at as string) : undefined,
      endsAt: ac.ends_at ? new Date(ac.ends_at as string) : undefined,
      status: ac.status as AccessCode['status'],
      createdAt: new Date(ac.created_at as string),
    });
  }

  async listAccessCodes(deviceId: string): Promise<Result<AccessCode[], AppError>> {
    const result = await this.request<{ access_codes: Array<Record<string, unknown>> }>(
      'GET',
      `/access_codes/list?device_id=${deviceId}`
    );
    if (result.isErr()) return err(result.error);

    return ok(result.value.access_codes.map(ac => ({
      accessCodeId: ac.access_code_id as string,
      deviceId: ac.device_id as string,
      name: ac.name as string,
      code: ac.code as string,
      type: ac.type as 'time_bound' | 'ongoing',
      startsAt: ac.starts_at ? new Date(ac.starts_at as string) : undefined,
      endsAt: ac.ends_at ? new Date(ac.ends_at as string) : undefined,
      status: ac.status as AccessCode['status'],
      createdAt: new Date(ac.created_at as string),
    })));
  }

  async deleteAccessCode(accessCodeId: string): Promise<Result<void, AppError>> {
    log.info({ accessCodeId }, 'Deleting access code');

    const result = await this.request<{ action_attempt: unknown }>('POST', '/access_codes/delete', {
      access_code_id: accessCodeId,
    });

    if (result.isErr()) return err(result.error);
    return ok(undefined);
  }

  async updateAccessCode(
    accessCodeId: string,
    updates: { name?: string; startsAt?: Date; endsAt?: Date }
  ): Promise<Result<AccessCode, AppError>> {
    log.info({ accessCodeId, updates }, 'Updating access code');

    const body: Record<string, unknown> = {
      access_code_id: accessCodeId,
    };

    if (updates.name) body.name = updates.name;
    if (updates.startsAt) body.starts_at = updates.startsAt.toISOString();
    if (updates.endsAt) body.ends_at = updates.endsAt.toISOString();

    const result = await this.request<{ access_code: Record<string, unknown> }>('POST', '/access_codes/update', body);
    if (result.isErr()) return err(result.error);

    const ac = result.value.access_code;
    return ok({
      accessCodeId: ac.access_code_id as string,
      deviceId: ac.device_id as string,
      name: ac.name as string,
      code: ac.code as string,
      type: ac.type as 'time_bound' | 'ongoing',
      startsAt: ac.starts_at ? new Date(ac.starts_at as string) : undefined,
      endsAt: ac.ends_at ? new Date(ac.ends_at as string) : undefined,
      status: ac.status as AccessCode['status'],
      createdAt: new Date(ac.created_at as string),
    });
  }
}

// =============================================================================
// EXPORTED INSTANCE & HELPERS
// =============================================================================

export const seam = new SeamClient();

// Helper functions for common operations
export async function createTourAccessCode(
  deviceId: string,
  tourId: string,
  visitorName: string,
  scheduledStart: Date,
  scheduledEnd: Date
): Promise<Result<AccessCode, AppError>> {
  // Add 15 min buffer before and after
  const startsAt = new Date(scheduledStart.getTime() - 15 * 60 * 1000);
  const endsAt = new Date(scheduledEnd.getTime() + 15 * 60 * 1000);

  return seam.createAccessCode({
    deviceId,
    name: `Tour: ${visitorName} - ${tourId.slice(0, 8)}`,
    startsAt,
    endsAt,
    maxTimeRounding: 'hour',
  });
}

export async function createMoveInAccessCode(
  deviceId: string,
  leaseId: string,
  tenantName: string,
  moveInDate: Date
): Promise<Result<AccessCode, AppError>> {
  // Access starts at 6 AM on move-in day
  const startsAt = new Date(moveInDate);
  startsAt.setHours(6, 0, 0, 0);

  return seam.createAccessCode({
    deviceId,
    name: `Tenant: ${tenantName}`,
    startsAt,
    // No end date - ongoing access
  });
}

export async function createMaintenanceAccessCode(
  deviceId: string,
  workOrderId: string,
  technicianName: string,
  scheduledDate: Date,
  duration: number = 4 // hours
): Promise<Result<AccessCode, AppError>> {
  const startsAt = new Date(scheduledDate);
  const endsAt = new Date(scheduledDate.getTime() + duration * 60 * 60 * 1000);

  return seam.createAccessCode({
    deviceId,
    name: `Maintenance: ${technicianName} - WO#${workOrderId.slice(0, 8)}`,
    startsAt,
    endsAt,
  });
}
