/**
 * Users Service
 * Business logic for user management
 */

import { UserRole, UserStatus, SubscriptionTier } from '@prisma/client';
import { usersRepository, type UserFilters, type PaginationOptions, type UpdateUserData, type UserWithoutPassword } from './users.repository.js';
import { hashPassword } from '../auth/password.service.js';
import { type AsyncAppResult, okAsync, errAsync } from '../../lib/result.js';
import { AppError, ErrorCode } from '../../lib/errors.js';
import { logger, createModuleLogger } from '../../lib/logger.js';

const log = createModuleLogger('users-service');

// =============================================================================
// USER MANAGEMENT
// =============================================================================

export async function getUser(id: string): AsyncAppResult<UserWithoutPassword> {
  const result = await usersRepository.findById(id);
  if (result.isErr()) return errAsync(result.error);
  if (!result.value) {
    return errAsync(new AppError({ code: ErrorCode.USER_NOT_FOUND, message: 'User not found' }));
  }
  return okAsync(result.value);
}

export async function getUserByEmail(email: string): AsyncAppResult<UserWithoutPassword | null> {
  const result = await usersRepository.findByEmail(email);
  if (result.isErr()) return errAsync(result.error);
  if (!result.value) return okAsync(null);
  const { passwordHash, ...user } = result.value;
  return okAsync(user);
}

export async function listUsers(
  filters: UserFilters,
  pagination: PaginationOptions
) {
  return usersRepository.findMany(filters, pagination);
}

export async function updateUser(
  id: string,
  data: UpdateUserData,
  requesterId: string,
  requesterRole: UserRole
): AsyncAppResult<UserWithoutPassword> {
  // Check if user exists
  const existing = await usersRepository.findById(id);
  if (existing.isErr()) return errAsync(existing.error);
  if (!existing.value) {
    return errAsync(new AppError({ code: ErrorCode.USER_NOT_FOUND, message: 'User not found' }));
  }

  // Only allow self-update or admin update
  if (id !== requesterId && requesterRole !== 'ADMIN' && requesterRole !== 'SUPER_ADMIN') {
    return errAsync(new AppError({ code: ErrorCode.AUTHZ_FORBIDDEN, message: 'Not authorized to update this user' }));
  }

  // Prevent non-admins from changing subscription
  if (data.subscriptionTier && requesterRole !== 'ADMIN' && requesterRole !== 'SUPER_ADMIN') {
    delete data.subscriptionTier;
    delete data.subscriptionExpiresAt;
  }

  const result = await usersRepository.update(id, data);
  if (result.isOk()) {
    log.info({ userId: id, updatedBy: requesterId }, 'User updated');
  }
  return result;
}

export async function updateUserStatus(
  id: string,
  status: UserStatus,
  adminId: string
): AsyncAppResult<UserWithoutPassword> {
  const result = await usersRepository.updateStatus(id, status);
  if (result.isOk()) {
    log.info({ userId: id, status, adminId }, 'User status updated');
  }
  return result;
}

export async function deleteUser(
  id: string,
  requesterId: string,
  requesterRole: UserRole
): AsyncAppResult<void> {
  // Only allow self-delete or admin delete
  if (id !== requesterId && requesterRole !== 'ADMIN' && requesterRole !== 'SUPER_ADMIN') {
    return errAsync(new AppError({ code: ErrorCode.AUTHZ_FORBIDDEN, message: 'Not authorized to delete this user' }));
  }

  const result = await usersRepository.delete(id);
  if (result.isOk()) {
    log.info({ userId: id, deletedBy: requesterId }, 'User deleted');
  }
  return result;
}

// =============================================================================
// VERIFICATION
// =============================================================================

export async function verifyUserEmail(userId: string): AsyncAppResult<UserWithoutPassword> {
  const result = await usersRepository.verifyEmail(userId);
  if (result.isOk()) {
    log.info({ userId }, 'Email verified');
  }
  return result;
}

export async function verifyUserPhone(userId: string): AsyncAppResult<UserWithoutPassword> {
  const result = await usersRepository.verifyPhone(userId);
  if (result.isOk()) {
    log.info({ userId }, 'Phone verified');
  }
  return result;
}

// =============================================================================
// SUBSCRIPTION
// =============================================================================

export async function updateSubscription(
  userId: string,
  tier: SubscriptionTier,
  expiresAt: Date | null,
  adminId: string
): AsyncAppResult<UserWithoutPassword> {
  const result = await usersRepository.updateSubscription(userId, tier, expiresAt);
  if (result.isOk()) {
    log.info({ userId, tier, expiresAt, adminId }, 'Subscription updated');
  }
  return result;
}

// =============================================================================
// ROLE-SPECIFIC QUERIES
// =============================================================================

export async function getAgentsByState(state: string, pagination: PaginationOptions) {
  return usersRepository.findAgentsByState(state, pagination);
}

export async function getAccreditedInvestors(pagination: PaginationOptions) {
  return usersRepository.findAccreditedInvestors(pagination);
}

// =============================================================================
// STATISTICS
// =============================================================================

export async function getUserStatistics() {
  return usersRepository.getStatistics();
}

export async function countUsersByRole() {
  return usersRepository.countByRole();
}
