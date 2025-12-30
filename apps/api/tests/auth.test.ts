/**
 * Auth Service Tests
 *
 * Tests for:
 * - Refresh token rotation
 * - Token revocation via Redis
 * - Account lockout policy
 * - Security event logging
 */

import { verify } from 'argon2';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../src/modules/auth/service';
import {
  createMockApp,
  mockPrisma,
  mockRedis,
  mockEmailService,
  resetMocks,
} from './setup';

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    resetMocks();
    const mockApp = createMockApp();
    authService = new AuthService(mockApp as any);
  });

  // ===========================================================================
  // Refresh Token Rotation Tests
  // ===========================================================================
  describe('refreshTokens', () => {
    const mockUser = {
      id: 'usr_123',
      email: 'test@example.com',
      role: 'tenant',
    };

    const mockStoredToken = {
      id: 'rtk_123',
      token: 'old-refresh-token',
      tokenHash: 'sha256_old-refresh-token',
      userId: 'usr_123',
      sessionId: 'session_123',
      revoked: false,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      user: mockUser,
    };

    it('should rotate token and return new pair', async () => {
      mockRedis.exists.mockResolvedValue(0); // Token not in revocation store
      mockPrisma.refreshToken.findUnique.mockResolvedValue(mockStoredToken);
      mockPrisma.refreshToken.update.mockResolvedValue({ ...mockStoredToken, revoked: true });
      mockPrisma.refreshToken.create.mockResolvedValue({ id: 'rtk_new' });

      const result = await authService.refreshTokens('old-refresh-token');

      // Should revoke old token in database
      expect(mockPrisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rtk_123' },
        data: { revoked: true, revokedAt: expect.any(Date) },
      });

      // Should add to Redis revocation store
      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.stringContaining('revoked_token:'),
        expect.any(Number),
        '1'
      );

      // Should create new token
      expect(mockPrisma.refreshToken.create).toHaveBeenCalled();

      // Should return new tokens
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('expiresIn');
    });

    it('should detect token reuse and revoke all user tokens', async () => {
      mockRedis.exists.mockResolvedValue(0);
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        ...mockStoredToken,
        revoked: true, // Already revoked = reuse attempt
      });
      mockPrisma.refreshToken.findMany.mockResolvedValue([
        { id: 'rtk_1', tokenHash: 'hash1' },
        { id: 'rtk_2', tokenHash: 'hash2' },
      ]);

      await expect(authService.refreshTokens('old-refresh-token')).rejects.toThrow(
        'Token reuse detected'
      );

      // Should revoke all tokens for this user
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'usr_123' },
        data: { revoked: true, revokedAt: expect.any(Date) },
      });
    });

    it('should reject token from Redis revocation store (fast path)', async () => {
      mockRedis.exists.mockResolvedValue(1); // Token IS in revocation store

      await expect(authService.refreshTokens('revoked-token')).rejects.toThrow(
        'Token has been revoked'
      );

      // Should NOT query database
      expect(mockPrisma.refreshToken.findUnique).not.toHaveBeenCalled();
    });

    it('should reject expired token', async () => {
      mockRedis.exists.mockResolvedValue(0);
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        ...mockStoredToken,
        expiresAt: new Date(Date.now() - 1000), // Expired
      });

      await expect(authService.refreshTokens('expired-token')).rejects.toThrow(
        'Refresh token expired'
      );
    });
  });

  // ===========================================================================
  // Account Lockout Tests
  // ===========================================================================
  describe('login lockout', () => {
    const mockUser = {
      id: 'usr_123',
      email: 'test@example.com',
      passwordHash: 'hashed-password',
      status: 'active',
      role: 'tenant',
      firstName: 'Test',
      lastName: 'User',
      phone: null,
    };

    it('should lock account after 5 failed attempts', async () => {
      mockRedis.exists.mockResolvedValue(0); // Not locked yet
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      vi.mocked(verify).mockResolvedValue(false); // Wrong password

      // Simulate failed attempts counter
      let attempts = 0;
      mockRedis.incr.mockImplementation(async () => {
        attempts++;
        return attempts;
      });

      // First 4 attempts - should increment counter but not lock
      for (let i = 0; i < 4; i++) {
        await expect(
          authService.login({ email: 'test@example.com', password: 'wrong' })
        ).rejects.toThrow('Invalid email or password');
      }

      // 5th attempt - should lock the account
      await expect(
        authService.login({ email: 'test@example.com', password: 'wrong' })
      ).rejects.toThrow('Invalid email or password');

      // Verify lockout was set
      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.stringContaining('lockout:'),
        expect.any(Number),
        '1'
      );
    });

    it('should reject login when account is locked', async () => {
      mockRedis.exists.mockResolvedValue(1); // Account IS locked

      await expect(
        authService.login({ email: 'locked@example.com', password: 'any' })
      ).rejects.toThrow('Account is temporarily locked');

      // Should NOT attempt to verify password
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('should clear failed attempts on successful login', async () => {
      mockRedis.exists.mockResolvedValue(0);
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      vi.mocked(verify).mockResolvedValue(true); // Correct password
      mockPrisma.user.update.mockResolvedValue(mockUser);
      mockPrisma.session.create.mockResolvedValue({ id: 'session_123' });
      mockPrisma.refreshToken.create.mockResolvedValue({ id: 'rtk_123' });

      await authService.login({ email: 'test@example.com', password: 'correct' });

      // Should clear failed login counter
      expect(mockRedis.del).toHaveBeenCalledWith(
        expect.stringContaining('failed_login:')
      );
    });

    it('should return lockout remaining time', async () => {
      mockRedis.ttl.mockResolvedValue(1500); // 25 minutes remaining

      const remaining = await authService.getLockoutRemaining('locked@example.com');

      expect(remaining).toBe(1500);
    });

    it('should clear lockout on password reset', async () => {
      const mockUser2 = { ...mockUser, id: 'usr_456' };
      mockRedis.get.mockResolvedValue('usr_456'); // Token maps to user
      mockPrisma.user.findUnique.mockResolvedValue(mockUser2);
      mockPrisma.user.update.mockResolvedValue(mockUser2);
      mockPrisma.refreshToken.findMany.mockResolvedValue([]);
      mockPrisma.session.updateMany.mockResolvedValue({ count: 0 });
      mockRedis.del.mockResolvedValue(1);

      await authService.resetPassword('valid-token', 'newpassword123');

      // Should clear lockout
      expect(mockRedis.del).toHaveBeenCalledWith(
        expect.stringContaining('lockout:')
      );
      expect(mockRedis.del).toHaveBeenCalledWith(
        expect.stringContaining('failed_login:')
      );
    });
  });

  // ===========================================================================
  // Token Revocation Tests
  // ===========================================================================
  describe('logout and revocation', () => {
    it('should revoke tokens and add to Redis on logout', async () => {
      mockPrisma.refreshToken.findMany.mockResolvedValue([
        { tokenHash: 'hash1' },
        { tokenHash: 'hash2' },
      ]);
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.session.update.mockResolvedValue({ id: 'session_123' });

      await authService.logout('session_123', 'usr_123');

      // Should revoke in database
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { sessionId: 'session_123' },
        data: { revoked: true, revokedAt: expect.any(Date) },
      });

      // Should add all tokens to Redis revocation store
      expect(mockRedis.setex).toHaveBeenCalledTimes(2);

      // Should deactivate session
      expect(mockPrisma.session.update).toHaveBeenCalledWith({
        where: { id: 'session_123' },
        data: { isActive: false },
      });
    });

    it('should revoke all user tokens on logoutAllSessions', async () => {
      mockPrisma.refreshToken.findMany.mockResolvedValue([
        { id: 'rtk_1', tokenHash: 'hash1' },
        { id: 'rtk_2', tokenHash: 'hash2' },
        { id: 'rtk_3', tokenHash: 'hash3' },
      ]);
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 3 });
      mockPrisma.session.updateMany.mockResolvedValue({ count: 2 });

      await authService.logoutAllSessions('usr_123');

      // Should revoke all tokens in database
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'usr_123' },
        data: { revoked: true, revokedAt: expect.any(Date) },
      });

      // Should deactivate all sessions
      expect(mockPrisma.session.updateMany).toHaveBeenCalledWith({
        where: { userId: 'usr_123' },
        data: { isActive: false },
      });
    });
  });

  // ===========================================================================
  // Security Event Logging Tests
  // ===========================================================================
  describe('security event logging', () => {
    it('should log security event on successful login', async () => {
      mockRedis.exists.mockResolvedValue(0);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'usr_123',
        email: 'test@example.com',
        passwordHash: 'hashed-password',
        status: 'active',
        role: 'tenant',
        firstName: 'Test',
        lastName: 'User',
        phone: null,
      });
      vi.mocked(verify).mockResolvedValue(true);
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.session.create.mockResolvedValue({ id: 'session_123' });
      mockPrisma.refreshToken.create.mockResolvedValue({ id: 'rtk_123' });

      await authService.login({
        email: 'test@example.com',
        password: 'correct',
        ipAddress: '127.0.0.1',
        userAgent: 'Test Agent',
      });

      // Wait for async audit log to be written
      await new Promise((resolve) => setImmediate(resolve));

      // Should create audit log entry
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'auth.login_success',
          entityType: 'auth',
          actorId: 'usr_123',
          ipAddress: '127.0.0.1',
          userAgent: 'Test Agent',
        }),
      });
    });

    it('should log security event on failed login', async () => {
      mockRedis.exists.mockResolvedValue(0);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'usr_123',
        email: 'test@example.com',
        passwordHash: 'hashed-password',
        status: 'active',
      });
      vi.mocked(verify).mockResolvedValue(false);
      mockRedis.incr.mockResolvedValue(1);

      await expect(
        authService.login({
          email: 'test@example.com',
          password: 'wrong',
          ipAddress: '192.168.1.1',
        })
      ).rejects.toThrow();

      // Wait for async audit log
      await new Promise((resolve) => setImmediate(resolve));

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'auth.login_failed',
          entityType: 'auth',
          ipAddress: '192.168.1.1',
        }),
      });
    });

    it('should log token reuse as suspicious activity', async () => {
      mockRedis.exists.mockResolvedValue(0);
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rtk_123',
        tokenHash: 'hash',
        userId: 'usr_123',
        sessionId: 'session_123',
        revoked: true, // Already revoked
        expiresAt: new Date(Date.now() + 1000000),
        user: { id: 'usr_123', email: 'test@example.com', role: 'tenant' },
      });
      mockPrisma.refreshToken.findMany.mockResolvedValue([]);
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(authService.refreshTokens('reused-token')).rejects.toThrow();

      // Wait for async audit log
      await new Promise((resolve) => setImmediate(resolve));

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'auth.token_reuse_detected',
          entityType: 'auth',
        }),
      });
    });

    it('should log account lockout event', async () => {
      mockRedis.exists.mockResolvedValue(0);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'usr_123',
        email: 'test@example.com',
        passwordHash: 'hashed-password',
        status: 'active',
      });
      vi.mocked(verify).mockResolvedValue(false);
      mockRedis.incr.mockResolvedValue(5); // 5th failed attempt

      await expect(
        authService.login({ email: 'test@example.com', password: 'wrong' })
      ).rejects.toThrow();

      // Wait for async audit logs
      await new Promise((resolve) => setImmediate(resolve));

      // Should log both login_failed and account_locked
      const auditCalls = mockPrisma.auditLog.create.mock.calls;
      const actions = auditCalls.map((call: any) => call[0].data.action);

      expect(actions).toContain('auth.login_failed');
      expect(actions).toContain('auth.account_locked');
    });
  });

  // ===========================================================================
  // Registration Tests
  // ===========================================================================
  describe('register', () => {
    it('should create user and return tokens', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null); // No existing user
      mockPrisma.user.create.mockResolvedValue({
        id: 'usr_new',
        email: 'new@example.com',
        firstName: 'New',
        lastName: 'User',
        role: 'tenant',
        phone: null,
        createdAt: new Date(),
      });
      mockPrisma.session.create.mockResolvedValue({ id: 'session_new' });
      mockPrisma.refreshToken.create.mockResolvedValue({ id: 'rtk_new' });

      const result = await authService.register({
        email: 'new@example.com',
        password: 'password123',
        firstName: 'New',
        lastName: 'User',
        role: 'tenant' as any,
      });

      expect(result.user.email).toBe('new@example.com');
      expect(result.tokens).toHaveProperty('accessToken');
      expect(result.tokens).toHaveProperty('refreshToken');
    });

    it('should reject duplicate email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        authService.register({
          email: 'existing@example.com',
          password: 'password123',
          firstName: 'Test',
          lastName: 'User',
          role: 'tenant' as any,
        })
      ).rejects.toThrow('User with this email already exists');
    });
  });
});
