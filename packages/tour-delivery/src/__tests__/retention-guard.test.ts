/**
 * PLY Retention Guard Tests
 *
 * Tests the retention policy enforcement for PLY source files.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  PlyRetentionGuard,
  PlyRetentionError,
  createPlyRetentionGuard,
  getPlyRetentionGuard,
  resetPlyRetentionGuard,
  isPlyKey,
  type RetentionEvidenceEvent,
} from '../retention-guard';

describe('PlyRetentionGuard', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    resetPlyRetentionGuard();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetPlyRetentionGuard();
  });

  describe('isPlyKey', () => {
    it('should return true for .ply files', () => {
      expect(isPlyKey('tours/property-123/scan.ply')).toBe(true);
      expect(isPlyKey('SCAN.PLY')).toBe(true);
      expect(isPlyKey('file.PLy')).toBe(true);
    });

    it('should return false for non-PLY files', () => {
      expect(isPlyKey('tours/property-123/scan.sog')).toBe(false);
      expect(isPlyKey('tours/property-123/scan.ply.bak')).toBe(false);
      expect(isPlyKey('file.txt')).toBe(false);
      expect(isPlyKey('plynot')).toBe(false);
    });
  });

  describe('checkDelete', () => {
    it('should block delete by default (no role, no override)', () => {
      const guard = new PlyRetentionGuard({ emitEvidence: false });
      const result = guard.checkDelete('test.ply', {});

      expect(result.allowed).toBe(false);
      expect(result.code).toBe('BLOCKED_RETENTION_POLICY');
      expect(result.reason).toContain('retained permanently');
    });

    it('should block delete for non-SUPERADMIN users', () => {
      const guard = new PlyRetentionGuard({ emitEvidence: false });
      const result = guard.checkDelete('test.ply', { role: 'ADMIN' });

      expect(result.allowed).toBe(false);
      expect(result.code).toBe('BLOCKED_RETENTION_POLICY');
    });

    it('should block SUPERADMIN without override env', () => {
      delete process.env['PLY_DELETE_OVERRIDE'];
      const guard = new PlyRetentionGuard({ emitEvidence: false });
      const result = guard.checkDelete('test.ply', { role: 'SUPERADMIN' });

      expect(result.allowed).toBe(false);
      expect(result.code).toBe('BLOCKED_NO_OVERRIDE_ENV');
      expect(result.reason).toContain('PLY_DELETE_OVERRIDE=true');
    });

    it('should block non-SUPERADMIN even with override env', () => {
      process.env['PLY_DELETE_OVERRIDE'] = 'true';
      const guard = new PlyRetentionGuard({ emitEvidence: false });
      const result = guard.checkDelete('test.ply', { role: 'ADMIN' });

      expect(result.allowed).toBe(false);
      expect(result.code).toBe('BLOCKED_INSUFFICIENT_ROLE');
      expect(result.reason).toContain('only SUPERADMIN');
    });

    it('should allow SUPERADMIN with override env', () => {
      process.env['PLY_DELETE_OVERRIDE'] = 'true';
      const guard = new PlyRetentionGuard({ emitEvidence: false });
      const result = guard.checkDelete('test.ply', { role: 'SUPERADMIN' });

      expect(result.allowed).toBe(true);
      expect(result.code).toBe('ALLOWED_SUPERADMIN_OVERRIDE');
    });

    it('should use custom override env var', () => {
      process.env['CUSTOM_DELETE_FLAG'] = 'true';
      const guard = new PlyRetentionGuard({
        overrideEnvVar: 'CUSTOM_DELETE_FLAG',
        emitEvidence: false,
      });
      const result = guard.checkDelete('test.ply', { role: 'SUPERADMIN' });

      expect(result.allowed).toBe(true);
    });
  });

  describe('guardDelete', () => {
    it('should throw PlyRetentionError when blocked', () => {
      const guard = new PlyRetentionGuard({ emitEvidence: false });

      expect(() => guard.guardDelete('test.ply', {})).toThrow(PlyRetentionError);
    });

    it('should include key and code in error', () => {
      const guard = new PlyRetentionGuard({ emitEvidence: false });

      try {
        guard.guardDelete('scans/property.ply', {});
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(PlyRetentionError);
        const error = err as PlyRetentionError;
        expect(error.key).toBe('scans/property.ply');
        expect(error.code).toBe('BLOCKED_RETENTION_POLICY');
        expect(error.name).toBe('PlyRetentionError');
      }
    });

    it('should not throw when allowed', () => {
      process.env['PLY_DELETE_OVERRIDE'] = 'true';
      const guard = new PlyRetentionGuard({ emitEvidence: false });

      expect(() => guard.guardDelete('test.ply', { role: 'SUPERADMIN' })).not.toThrow();
    });
  });

  describe('evidence recording', () => {
    it('should call evidence emitter on blocked delete', () => {
      const mockEmitter = vi.fn();
      const guard = new PlyRetentionGuard({
        evidenceEmitter: mockEmitter,
        emitEvidence: true,
      });

      guard.checkDelete('tours/scan.ply', {
        actorId: 'user-123',
        actorEmail: 'user@example.com',
        role: 'ADMIN',
        organizationId: 'org-456',
        requestId: 'req-789',
        ipAddress: '192.168.1.1',
      });

      expect(mockEmitter).toHaveBeenCalledTimes(1);
      const event: RetentionEvidenceEvent = mockEmitter.mock.calls[0][0];

      expect(event.controlId).toBe('CC6.1');
      expect(event.category).toBe('Security');
      expect(event.eventType).toBe('ply_delete_attempt');
      expect(event.eventOutcome).toBe('blocked');
      expect(event.actorId).toBe('user-123');
      expect(event.actorEmail).toBe('user@example.com');
      expect(event.organizationId).toBe('org-456');
      expect(event.requestId).toBe('req-789');
      expect(event.ipAddress).toBe('192.168.1.1');
      expect(event.details.key).toBe('tours/scan.ply');
      expect(event.details.role).toBe('ADMIN');
    });

    it('should call evidence emitter on allowed delete', () => {
      process.env['PLY_DELETE_OVERRIDE'] = 'true';
      const mockEmitter = vi.fn();
      const guard = new PlyRetentionGuard({
        evidenceEmitter: mockEmitter,
        emitEvidence: true,
      });

      guard.checkDelete('tours/scan.ply', { role: 'SUPERADMIN' });

      expect(mockEmitter).toHaveBeenCalledTimes(1);
      const event: RetentionEvidenceEvent = mockEmitter.mock.calls[0][0];

      expect(event.eventOutcome).toBe('allowed');
      expect(event.details.overrideEnabled).toBe(true);
    });

    it('should not call evidence emitter when disabled', () => {
      const mockEmitter = vi.fn();
      const guard = new PlyRetentionGuard({
        evidenceEmitter: mockEmitter,
        emitEvidence: false,
      });

      guard.checkDelete('tours/scan.ply', {});

      expect(mockEmitter).not.toHaveBeenCalled();
    });

    it('should handle evidence emitter errors gracefully', () => {
      const mockEmitter = vi.fn().mockImplementation(() => {
        throw new Error('Emitter failed');
      });
      const guard = new PlyRetentionGuard({
        evidenceEmitter: mockEmitter,
        emitEvidence: true,
      });

      // Should not throw even if emitter fails
      expect(() => guard.checkDelete('test.ply', {})).not.toThrow();
    });
  });

  describe('singleton', () => {
    it('should return same instance from getPlyRetentionGuard', () => {
      const guard1 = getPlyRetentionGuard();
      const guard2 = getPlyRetentionGuard();

      expect(guard1).toBe(guard2);
    });

    it('should create new instance after reset', () => {
      const guard1 = getPlyRetentionGuard();
      resetPlyRetentionGuard();
      const guard2 = getPlyRetentionGuard();

      expect(guard1).not.toBe(guard2);
    });

    it('should create independent instance with createPlyRetentionGuard', () => {
      const guard1 = createPlyRetentionGuard({ emitEvidence: false });
      const guard2 = createPlyRetentionGuard({ emitEvidence: false });

      expect(guard1).not.toBe(guard2);
    });
  });
});
