/**
 * Users Repository
 * Database operations for user management with role-specific queries
 */

import { Prisma, User, UserRole, UserStatus, SubscriptionTier } from '@prisma/client';
import { prisma } from '../../lib/database.js';
import { Result, ok, err } from '../../lib/result.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

// ============================================================================
// TYPES
// ============================================================================

export interface UserFilters {
  role?: UserRole;
  status?: UserStatus;
  subscriptionTier?: SubscriptionTier;
  emailVerified?: boolean;
  search?: string;
  licenseState?: string;
  accreditedInvestor?: boolean;
}

export interface PaginationOptions {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export type UserWithoutPassword = Omit<User, 'passwordHash'>;

export interface UpdateUserData {
  firstName?: string;
  lastName?: string;
  phone?: string;
  dateOfBirth?: Date;
  avatarUrl?: string;
  timezone?: string;
  licenseNumber?: string;
  licenseState?: string;
  licenseExpiry?: Date;
  brokerageName?: string;
  brokerageAddress?: string;
  investmentPreferences?: Prisma.JsonValue;
  accreditedInvestor?: boolean;
  subscriptionTier?: SubscriptionTier;
  subscriptionExpiresAt?: Date;
}

// ============================================================================
// REPOSITORY
// ============================================================================

export class UsersRepository {
  /**
   * Find user by ID
   */
  async findById(id: string): Promise<Result<UserWithoutPassword | null, AppError>> {
    try {
      const user = await prisma.user.findUnique({
        where: { id, deletedAt: null },
      });

      if (!user) {
        return ok(null);
      }

      const { passwordHash, ...userWithoutPassword } = user;
      return ok(userWithoutPassword);
    } catch (error) {
      logger.error({ error, userId: id }, 'Failed to find user by ID');
      return err(new AppError(ErrorCodes.DATABASE_ERROR, 'Failed to find user'));
    }
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<Result<User | null, AppError>> {
    try {
      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase(), deletedAt: null },
      });
      return ok(user);
    } catch (error) {
      logger.error({ error, email }, 'Failed to find user by email');
      return err(new AppError(ErrorCodes.DATABASE_ERROR, 'Failed to find user'));
    }
  }

  /**
   * Find user by phone
   */
  async findByPhone(phone: string): Promise<Result<UserWithoutPassword | null, AppError>> {
    try {
      const user = await prisma.user.findUnique({
        where: { phone, deletedAt: null },
      });

      if (!user) {
        return ok(null);
      }

      const { passwordHash, ...userWithoutPassword } = user;
      return ok(userWithoutPassword);
    } catch (error) {
      logger.error({ error, phone }, 'Failed to find user by phone');
      return err(new AppError(ErrorCodes.DATABASE_ERROR, 'Failed to find user'));
    }
  }

  /**
   * List users with filters and pagination
   */
  async findMany(
    filters: UserFilters,
    pagination: PaginationOptions
  ): Promise<Result<PaginatedResult<UserWithoutPassword>, AppError>> {
    try {
      const where: Prisma.UserWhereInput = {
        deletedAt: null,
        ...(filters.role && { role: filters.role }),
        ...(filters.status && { status: filters.status }),
        ...(filters.subscriptionTier && { subscriptionTier: filters.subscriptionTier }),
        ...(filters.emailVerified !== undefined && { emailVerified: filters.emailVerified }),
        ...(filters.licenseState && { licenseState: filters.licenseState }),
        ...(filters.accreditedInvestor !== undefined && { accreditedInvestor: filters.accreditedInvestor }),
        ...(filters.search && {
          OR: [
            { firstName: { contains: filters.search, mode: 'insensitive' } },
            { lastName: { contains: filters.search, mode: 'insensitive' } },
            { email: { contains: filters.search, mode: 'insensitive' } },
          ],
        }),
      };

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip: (pagination.page - 1) * pagination.limit,
          take: pagination.limit,
          orderBy: pagination.sortBy
            ? { [pagination.sortBy]: pagination.sortOrder || 'desc' }
            : { createdAt: 'desc' },
        }),
        prisma.user.count({ where }),
      ]);

      const usersWithoutPassword = users.map(({ passwordHash, ...user }) => user);

      return ok({
        data: usersWithoutPassword,
        pagination: {
          page: pagination.page,
          limit: pagination.limit,
          total,
          totalPages: Math.ceil(total / pagination.limit),
          hasMore: pagination.page * pagination.limit < total,
        },
      });
    } catch (error) {
      logger.error({ error, filters }, 'Failed to list users');
      return err(new AppError(ErrorCodes.DATABASE_ERROR, 'Failed to list users'));
    }
  }

  /**
   * Update user
   */
  async update(
    id: string,
    data: UpdateUserData
  ): Promise<Result<UserWithoutPassword, AppError>> {
    try {
      const user = await prisma.user.update({
        where: { id, deletedAt: null },
        data,
      });

      const { passwordHash, ...userWithoutPassword } = user;
      return ok(userWithoutPassword);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          return err(new AppError(ErrorCodes.USER_NOT_FOUND, 'User not found'));
        }
        if (error.code === 'P2002') {
          return err(new AppError(ErrorCodes.USER_ALREADY_EXISTS, 'Phone number already in use'));
        }
      }
      logger.error({ error, userId: id }, 'Failed to update user');
      return err(new AppError(ErrorCodes.DATABASE_ERROR, 'Failed to update user'));
    }
  }

  /**
   * Update user status
   */
  async updateStatus(
    id: string,
    status: UserStatus
  ): Promise<Result<UserWithoutPassword, AppError>> {
    try {
      const user = await prisma.user.update({
        where: { id, deletedAt: null },
        data: { status },
      });

      const { passwordHash, ...userWithoutPassword } = user;
      return ok(userWithoutPassword);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return err(new AppError(ErrorCodes.USER_NOT_FOUND, 'User not found'));
      }
      logger.error({ error, userId: id, status }, 'Failed to update user status');
      return err(new AppError(ErrorCodes.DATABASE_ERROR, 'Failed to update user status'));
    }
  }

  /**
   * Update subscription
   */
  async updateSubscription(
    id: string,
    tier: SubscriptionTier,
    expiresAt: Date | null
  ): Promise<Result<UserWithoutPassword, AppError>> {
    try {
      const user = await prisma.user.update({
        where: { id, deletedAt: null },
        data: {
          subscriptionTier: tier,
          subscriptionExpiresAt: expiresAt,
        },
      });

      const { passwordHash, ...userWithoutPassword } = user;
      return ok(userWithoutPassword);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return err(new AppError(ErrorCodes.USER_NOT_FOUND, 'User not found'));
      }
      logger.error({ error, userId: id, tier }, 'Failed to update subscription');
      return err(new AppError(ErrorCodes.DATABASE_ERROR, 'Failed to update subscription'));
    }
  }

  /**
   * Soft delete user
   */
  async delete(id: string): Promise<Result<void, AppError>> {
    try {
      await prisma.user.update({
        where: { id, deletedAt: null },
        data: { 
          deletedAt: new Date(),
          status: UserStatus.DEACTIVATED,
        },
      });
      return ok(undefined);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return err(new AppError(ErrorCodes.USER_NOT_FOUND, 'User not found'));
      }
      logger.error({ error, userId: id }, 'Failed to delete user');
      return err(new AppError(ErrorCodes.DATABASE_ERROR, 'Failed to delete user'));
    }
  }

  /**
   * Verify email
   */
  async verifyEmail(id: string): Promise<Result<UserWithoutPassword, AppError>> {
    try {
      const user = await prisma.user.update({
        where: { id, deletedAt: null },
        data: {
          emailVerified: true,
          emailVerifiedAt: new Date(),
          status: UserStatus.ACTIVE,
        },
      });

      const { passwordHash, ...userWithoutPassword } = user;
      return ok(userWithoutPassword);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return err(new AppError(ErrorCodes.USER_NOT_FOUND, 'User not found'));
      }
      logger.error({ error, userId: id }, 'Failed to verify email');
      return err(new AppError(ErrorCodes.DATABASE_ERROR, 'Failed to verify email'));
    }
  }

  /**
   * Verify phone
   */
  async verifyPhone(id: string): Promise<Result<UserWithoutPassword, AppError>> {
    try {
      const user = await prisma.user.update({
        where: { id, deletedAt: null },
        data: {
          phoneVerified: true,
          phoneVerifiedAt: new Date(),
        },
      });

      const { passwordHash, ...userWithoutPassword } = user;
      return ok(userWithoutPassword);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return err(new AppError(ErrorCodes.USER_NOT_FOUND, 'User not found'));
      }
      logger.error({ error, userId: id }, 'Failed to verify phone');
      return err(new AppError(ErrorCodes.DATABASE_ERROR, 'Failed to verify phone'));
    }
  }

  /**
   * Get agents by state (for agent marketplace)
   */
  async findAgentsByState(
    state: string,
    pagination: PaginationOptions
  ): Promise<Result<PaginatedResult<UserWithoutPassword>, AppError>> {
    return this.findMany(
      {
        role: UserRole.AGENT,
        status: UserStatus.ACTIVE,
        licenseState: state,
      },
      pagination
    );
  }

  /**
   * Get accredited investors (for hidden gem alerts)
   */
  async findAccreditedInvestors(
    pagination: PaginationOptions
  ): Promise<Result<PaginatedResult<UserWithoutPassword>, AppError>> {
    return this.findMany(
      {
        role: UserRole.INVESTOR,
        status: UserStatus.ACTIVE,
        accreditedInvestor: true,
      },
      pagination
    );
  }

  /**
   * Count users by role
   */
  async countByRole(): Promise<Result<Record<UserRole, number>, AppError>> {
    try {
      const counts = await prisma.user.groupBy({
        by: ['role'],
        where: { deletedAt: null },
        _count: { role: true },
      });

      const result = Object.values(UserRole).reduce((acc, role) => {
        acc[role] = 0;
        return acc;
      }, {} as Record<UserRole, number>);

      counts.forEach((item) => {
        result[item.role] = item._count.role;
      });

      return ok(result);
    } catch (error) {
      logger.error({ error }, 'Failed to count users by role');
      return err(new AppError(ErrorCodes.DATABASE_ERROR, 'Failed to count users'));
    }
  }

  /**
   * Get user statistics
   */
  async getStatistics(): Promise<Result<{
    total: number;
    byRole: Record<UserRole, number>;
    byStatus: Record<UserStatus, number>;
    newThisMonth: number;
    activeToday: number;
  }, AppError>> {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const [total, byRole, byStatus, newThisMonth, activeToday] = await Promise.all([
        prisma.user.count({ where: { deletedAt: null } }),
        prisma.user.groupBy({
          by: ['role'],
          where: { deletedAt: null },
          _count: { role: true },
        }),
        prisma.user.groupBy({
          by: ['status'],
          where: { deletedAt: null },
          _count: { status: true },
        }),
        prisma.user.count({
          where: { deletedAt: null, createdAt: { gte: startOfMonth } },
        }),
        prisma.user.count({
          where: { deletedAt: null, lastLoginAt: { gte: startOfDay } },
        }),
      ]);

      const roleResult = Object.values(UserRole).reduce((acc, role) => {
        acc[role] = 0;
        return acc;
      }, {} as Record<UserRole, number>);
      byRole.forEach((item) => {
        roleResult[item.role] = item._count.role;
      });

      const statusResult = Object.values(UserStatus).reduce((acc, status) => {
        acc[status] = 0;
        return acc;
      }, {} as Record<UserStatus, number>);
      byStatus.forEach((item) => {
        statusResult[item.status] = item._count.status;
      });

      return ok({
        total,
        byRole: roleResult,
        byStatus: statusResult,
        newThisMonth,
        activeToday,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get user statistics');
      return err(new AppError(ErrorCodes.DATABASE_ERROR, 'Failed to get statistics'));
    }
  }
}

export const usersRepository = new UsersRepository();
