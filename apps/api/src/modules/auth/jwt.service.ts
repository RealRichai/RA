/**
 * JWT Service
 * RS256 token generation and verification
 */

import * as jose from 'jose';
import { env } from '../../config/env.js';
import { AppError, ErrorCode } from '../../lib/errors.js';
import { type AsyncAppResult, okAsync, errAsync, tryCatchAsync } from '../../lib/result.js';
import type { UserRole } from '@prisma/client';

export interface TokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  sessionId: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
}

let privateKey: jose.KeyLike;
let publicKey: jose.KeyLike;

async function getPrivateKey(): Promise<jose.KeyLike> {
  if (!privateKey) {
    privateKey = await jose.importPKCS8(env.JWT_PRIVATE_KEY, 'RS256');
  }
  return privateKey;
}

async function getPublicKey(): Promise<jose.KeyLike> {
  if (!publicKey) {
    publicKey = await jose.importSPKI(env.JWT_PUBLIC_KEY, 'RS256');
  }
  return publicKey;
}

function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) return 900;
  const value = parseInt(match[1]!, 10);
  const unit = match[2];
  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 3600;
    case 'd': return value * 86400;
    default: return 900;
  }
}

export async function generateTokenPair(payload: TokenPayload): AsyncAppResult<TokenPair> {
  return tryCatchAsync(async () => {
    const key = await getPrivateKey();
    const now = Math.floor(Date.now() / 1000);
    const accessExpiry = parseDuration(env.JWT_ACCESS_TOKEN_EXPIRES_IN);
    const refreshExpiry = parseDuration(env.JWT_REFRESH_TOKEN_EXPIRES_IN);

    const accessToken = await new jose.SignJWT({ ...payload, type: 'access' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt(now)
      .setExpirationTime(now + accessExpiry)
      .setIssuer(env.JWT_ISSUER)
      .setAudience(env.JWT_AUDIENCE)
      .setSubject(payload.userId)
      .sign(key);

    const refreshToken = await new jose.SignJWT({ ...payload, type: 'refresh' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt(now)
      .setExpirationTime(now + refreshExpiry)
      .setIssuer(env.JWT_ISSUER)
      .setAudience(env.JWT_AUDIENCE)
      .setSubject(payload.userId)
      .sign(key);

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresAt: new Date((now + accessExpiry) * 1000),
      refreshTokenExpiresAt: new Date((now + refreshExpiry) * 1000),
    };
  }, ErrorCode.AUTH_TOKEN_INVALID);
}

export async function verifyAccessToken(token: string): AsyncAppResult<TokenPayload> {
  return tryCatchAsync(async () => {
    const key = await getPublicKey();
    const { payload } = await jose.jwtVerify(token, key, {
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    });
    if (payload.type !== 'access') {
      throw new Error('Invalid token type');
    }
    return payload as unknown as TokenPayload;
  }, ErrorCode.AUTH_TOKEN_INVALID);
}

export async function verifyRefreshToken(token: string): AsyncAppResult<TokenPayload> {
  return tryCatchAsync(async () => {
    const key = await getPublicKey();
    const { payload } = await jose.jwtVerify(token, key, {
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    });
    if (payload.type !== 'refresh') {
      throw new Error('Invalid token type');
    }
    return payload as unknown as TokenPayload;
  }, ErrorCode.AUTH_REFRESH_TOKEN_INVALID);
}
