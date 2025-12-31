/**
 * Analytics Aggregation Job
 *
 * Computes and stores daily/weekly/monthly metrics for dashboards.
 * Runs daily at 2 AM to aggregate the previous day's data.
 */

import { prisma } from '@realriches/database';
import { logger } from '@realriches/utils';
import type { Job } from 'bullmq';
import type { Redis } from 'ioredis';

import type { JobDefinition } from './scheduler';

// =============================================================================
// Types
// =============================================================================

interface DailyMetrics {
  date: string;
  portfolio: {
    totalProperties: number;
    totalUnits: number;
    occupiedUnits: number;
    vacantUnits: number;
    occupancyRate: number;
  };
  revenue: {
    collected: number;
    potential: number;
    collectionRate: number;
    byType: Record<string, number>;
  };
  listings: {
    active: number;
    newListings: number;
    totalViews: number;
    totalInquiries: number;
    totalApplications: number;
    conversionRate: number;
  };
  leases: {
    active: number;
    expiringSoon: number;
    renewed: number;
    terminated: number;
    newLeases: number;
  };
  maintenance: {
    open: number;
    newSubmitted: number;
    completed: number;
    avgResolutionHours: number;
    totalCost: number;
    byCategory: Record<string, number>;
    byPriority: Record<string, number>;
  };
  payments: {
    total: number;
    successful: number;
    failed: number;
    onTimeRate: number;
    latePayments: number;
    lateFeeCollected: number;
  };
  users: {
    totalActive: number;
    newSignups: number;
    byRole: Record<string, number>;
  };
}

interface AggregationResult {
  date: string;
  metrics: DailyMetrics;
  duration: number;
}

// =============================================================================
// Constants
// =============================================================================

const METRICS_KEY_PREFIX = 'analytics:daily:';
const METRICS_LATEST_KEY = 'analytics:latest';
const METRICS_WEEKLY_KEY = 'analytics:weekly:';
const METRICS_MONTHLY_KEY = 'analytics:monthly:';
const RETENTION_DAYS = 90;

// Store Redis connection
let redisClient: Redis | null = null;

// =============================================================================
// Analytics Aggregation Job
// =============================================================================

export class AnalyticsAggregationJob {
  /**
   * Get job definition for the scheduler.
   * Runs daily at 2 AM.
   */
  static getDefinition(): JobDefinition {
    return {
      name: 'analytics-aggregation',
      handler: (job: Job) => AnalyticsAggregationJob.execute(job),
      cron: '0 2 * * *', // Daily at 2 AM
      options: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 60000 },
        removeOnComplete: 30,
        removeOnFail: 60,
      },
    };
  }

  /**
   * Initialize with Redis connection.
   */
  static initializeRedis(redis: Redis): void {
    redisClient = redis;
  }

  /**
   * Execute the analytics aggregation.
   */
  static async execute(job: Job): Promise<AggregationResult> {
    const startTime = Date.now();

    // Aggregate for yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const dateStr = yesterday.toISOString().split('T')[0];

    logger.info({ jobId: job.id, date: dateStr }, 'Starting analytics aggregation');

    try {
      const metrics = await AnalyticsAggregationJob.aggregateForDate(yesterday);

      // Store in Redis
      if (redisClient) {
        await AnalyticsAggregationJob.storeMetrics(dateStr, metrics);
      }

      const result: AggregationResult = {
        date: dateStr,
        metrics,
        duration: Date.now() - startTime,
      };

      logger.info(
        {
          jobId: job.id,
          date: dateStr,
          duration: result.duration,
          occupancyRate: metrics.portfolio.occupancyRate,
          revenueCollected: metrics.revenue.collected,
        },
        'Analytics aggregation completed'
      );

      return result;
    } catch (error) {
      logger.error({ jobId: job.id, date: dateStr, error }, 'Analytics aggregation failed');
      throw error;
    }
  }

  /**
   * Aggregate metrics for a specific date.
   */
  static async aggregateForDate(date: Date): Promise<DailyMetrics> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const [
      portfolio,
      revenue,
      listings,
      leases,
      maintenance,
      payments,
      users,
    ] = await Promise.all([
      AnalyticsAggregationJob.aggregatePortfolio(),
      AnalyticsAggregationJob.aggregateRevenue(startOfDay, endOfDay),
      AnalyticsAggregationJob.aggregateListings(startOfDay, endOfDay),
      AnalyticsAggregationJob.aggregateLeases(startOfDay, endOfDay),
      AnalyticsAggregationJob.aggregateMaintenance(startOfDay, endOfDay),
      AnalyticsAggregationJob.aggregatePayments(startOfDay, endOfDay),
      AnalyticsAggregationJob.aggregateUsers(startOfDay, endOfDay),
    ]);

    return {
      date: startOfDay.toISOString().split('T')[0],
      portfolio,
      revenue,
      listings,
      leases,
      maintenance,
      payments,
      users,
    };
  }

  // ===========================================================================
  // Aggregation Functions
  // ===========================================================================

  private static async aggregatePortfolio(): Promise<DailyMetrics['portfolio']> {
    const [properties, units] = await Promise.all([
      prisma.property.count({ where: { status: 'active' } }),
      prisma.unit.groupBy({
        by: ['status'],
        _count: true,
      }),
    ]);

    const statusCounts = units.reduce(
      (acc, u) => {
        acc[u.status] = u._count;
        return acc;
      },
      {} as Record<string, number>
    );

    const totalUnits = Object.values(statusCounts).reduce((a, b) => a + b, 0);
    const occupiedUnits = statusCounts['occupied'] || 0;
    const vacantUnits = statusCounts['vacant'] || 0;

    return {
      totalProperties: properties,
      totalUnits,
      occupiedUnits,
      vacantUnits,
      occupancyRate: totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 1000) / 10 : 0,
    };
  }

  private static async aggregateRevenue(
    startOfDay: Date,
    endOfDay: Date
  ): Promise<DailyMetrics['revenue']> {
    const [collected, byType, potential] = await Promise.all([
      // Total collected
      prisma.payment.aggregate({
        where: {
          status: 'completed',
          paidAt: { gte: startOfDay, lte: endOfDay },
        },
        _sum: { amount: true },
      }),
      // By payment type
      prisma.payment.groupBy({
        by: ['type'],
        where: {
          status: 'completed',
          paidAt: { gte: startOfDay, lte: endOfDay },
        },
        _sum: { amount: true },
      }),
      // Potential (from active leases)
      prisma.lease.aggregate({
        where: { status: 'active' },
        _sum: { monthlyRentAmount: true },
      }),
    ]);

    const collectedAmount = Number(collected._sum.amount) || 0;
    const potentialAmount = Number(potential._sum.monthlyRentAmount) || 0;

    const byTypeRecord = byType.reduce(
      (acc, t) => {
        acc[t.type] = Number(t._sum.amount) || 0;
        return acc;
      },
      {} as Record<string, number>
    );

    return {
      collected: collectedAmount,
      potential: potentialAmount,
      collectionRate: potentialAmount > 0 ? Math.round((collectedAmount / potentialAmount) * 1000) / 10 : 0,
      byType: byTypeRecord,
    };
  }

  private static async aggregateListings(
    startOfDay: Date,
    endOfDay: Date
  ): Promise<DailyMetrics['listings']> {
    const [active, newListings, totals, applications] = await Promise.all([
      prisma.listing.count({ where: { status: 'active' } }),
      prisma.listing.count({
        where: { createdAt: { gte: startOfDay, lte: endOfDay } },
      }),
      prisma.listing.aggregate({
        where: { status: 'active' },
        _sum: { viewCount: true, inquiryCount: true },
      }),
      prisma.tenantApplication.count({
        where: { createdAt: { gte: startOfDay, lte: endOfDay } },
      }),
    ]);

    const totalViews = Number(totals._sum.viewCount) || 0;
    const totalInquiries = Number(totals._sum.inquiryCount) || 0;

    return {
      active,
      newListings,
      totalViews,
      totalInquiries,
      totalApplications: applications,
      conversionRate: totalViews > 0 ? Math.round((totalInquiries / totalViews) * 1000) / 10 : 0,
    };
  }

  private static async aggregateLeases(
    startOfDay: Date,
    endOfDay: Date
  ): Promise<DailyMetrics['leases']> {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const [active, expiringSoon, renewed, terminated, newLeases] = await Promise.all([
      prisma.lease.count({ where: { status: 'active' } }),
      prisma.lease.count({
        where: {
          status: 'active',
          endDate: { lte: thirtyDaysFromNow },
        },
      }),
      prisma.lease.count({
        where: {
          status: 'renewed',
          updatedAt: { gte: startOfDay, lte: endOfDay },
        },
      }),
      prisma.lease.count({
        where: {
          status: 'terminated',
          terminationDate: { gte: startOfDay, lte: endOfDay },
        },
      }),
      prisma.lease.count({
        where: { createdAt: { gte: startOfDay, lte: endOfDay } },
      }),
    ]);

    return {
      active,
      expiringSoon,
      renewed,
      terminated,
      newLeases,
    };
  }

  private static async aggregateMaintenance(
    startOfDay: Date,
    endOfDay: Date
  ): Promise<DailyMetrics['maintenance']> {
    const [open, newSubmitted, completed, byCategory, byPriority, costs, resolutionTimes] =
      await Promise.all([
        // Open work orders
        prisma.workOrder.count({
          where: { status: { in: ['submitted', 'acknowledged', 'in_progress', 'pending_parts'] } },
        }),
        // New submitted
        prisma.workOrder.count({
          where: { createdAt: { gte: startOfDay, lte: endOfDay } },
        }),
        // Completed
        prisma.workOrder.count({
          where: { completedAt: { gte: startOfDay, lte: endOfDay } },
        }),
        // By category
        prisma.workOrder.groupBy({
          by: ['category'],
          where: { status: { in: ['submitted', 'acknowledged', 'in_progress'] } },
          _count: true,
        }),
        // By priority
        prisma.workOrder.groupBy({
          by: ['priority'],
          where: { status: { in: ['submitted', 'acknowledged', 'in_progress'] } },
          _count: true,
        }),
        // Costs for completed
        prisma.workOrder.aggregate({
          where: { completedAt: { gte: startOfDay, lte: endOfDay } },
          _sum: { actualCost: true },
        }),
        // Resolution times
        prisma.workOrder.findMany({
          where: { completedAt: { gte: startOfDay, lte: endOfDay } },
          select: { createdAt: true, completedAt: true },
        }),
      ]);

    const byCategoryRecord = byCategory.reduce(
      (acc, c) => {
        acc[c.category] = c._count;
        return acc;
      },
      {} as Record<string, number>
    );

    const byPriorityRecord = byPriority.reduce(
      (acc, p) => {
        acc[p.priority] = p._count;
        return acc;
      },
      {} as Record<string, number>
    );

    // Calculate average resolution time in hours
    let avgResolutionHours = 0;
    if (resolutionTimes.length > 0) {
      const totalHours = resolutionTimes.reduce((sum, wo) => {
        const hours = (wo.completedAt!.getTime() - wo.createdAt.getTime()) / (1000 * 60 * 60);
        return sum + hours;
      }, 0);
      avgResolutionHours = Math.round((totalHours / resolutionTimes.length) * 10) / 10;
    }

    return {
      open,
      newSubmitted,
      completed,
      avgResolutionHours,
      totalCost: Number(costs._sum.actualCost) || 0,
      byCategory: byCategoryRecord,
      byPriority: byPriorityRecord,
    };
  }

  private static async aggregatePayments(
    startOfDay: Date,
    endOfDay: Date
  ): Promise<DailyMetrics['payments']> {
    const [total, byStatus, lateFees, latePayments] = await Promise.all([
      prisma.payment.count({
        where: { createdAt: { gte: startOfDay, lte: endOfDay } },
      }),
      prisma.payment.groupBy({
        by: ['status'],
        where: { createdAt: { gte: startOfDay, lte: endOfDay } },
        _count: true,
      }),
      // Late fees collected
      prisma.payment.aggregate({
        where: {
          type: 'late_fee',
          status: 'completed',
          paidAt: { gte: startOfDay, lte: endOfDay },
        },
        _sum: { amount: true },
      }),
      // Late payments (rent payments made after due date)
      prisma.payment.count({
        where: {
          type: 'rent',
          status: 'completed',
          paidAt: { gte: startOfDay, lte: endOfDay },
          billingPeriodStart: { lt: startOfDay },
        },
      }),
    ]);

    const statusCounts = byStatus.reduce(
      (acc, s) => {
        acc[s.status] = s._count;
        return acc;
      },
      {} as Record<string, number>
    );

    const successful = statusCounts['completed'] || 0;
    const failed = statusCounts['failed'] || 0;

    return {
      total,
      successful,
      failed,
      onTimeRate: total > 0 ? Math.round(((total - latePayments) / total) * 1000) / 10 : 100,
      latePayments,
      lateFeeCollected: Number(lateFees._sum.amount) || 0,
    };
  }

  private static async aggregateUsers(
    startOfDay: Date,
    endOfDay: Date
  ): Promise<DailyMetrics['users']> {
    const [totalActive, newSignups, byRole] = await Promise.all([
      prisma.user.count({ where: { status: 'active' } }),
      prisma.user.count({
        where: { createdAt: { gte: startOfDay, lte: endOfDay } },
      }),
      prisma.user.groupBy({
        by: ['role'],
        where: { status: 'active' },
        _count: true,
      }),
    ]);

    const byRoleRecord = byRole.reduce(
      (acc, r) => {
        acc[r.role] = r._count;
        return acc;
      },
      {} as Record<string, number>
    );

    return {
      totalActive,
      newSignups,
      byRole: byRoleRecord,
    };
  }

  // ===========================================================================
  // Storage Functions
  // ===========================================================================

  private static async storeMetrics(dateStr: string, metrics: DailyMetrics): Promise<void> {
    if (!redisClient) return;

    const key = `${METRICS_KEY_PREFIX}${dateStr}`;
    const metricsJson = JSON.stringify(metrics);

    // Store daily metrics with 90-day retention
    await redisClient.setex(key, RETENTION_DAYS * 24 * 60 * 60, metricsJson);

    // Update latest metrics pointer
    await redisClient.set(METRICS_LATEST_KEY, metricsJson);

    // Check if we need to aggregate weekly/monthly
    const date = new Date(dateStr);
    const dayOfWeek = date.getDay();
    const dayOfMonth = date.getDate();

    // Sunday = aggregate weekly
    if (dayOfWeek === 0) {
      await AnalyticsAggregationJob.aggregateWeekly(date);
    }

    // First of month = aggregate monthly
    if (dayOfMonth === 1) {
      await AnalyticsAggregationJob.aggregateMonthly(date);
    }
  }

  private static async aggregateWeekly(endDate: Date): Promise<void> {
    if (!redisClient) return;

    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 6);

    const weekKey = `${METRICS_WEEKLY_KEY}${startDate.toISOString().split('T')[0]}`;

    // Collect daily metrics for the week
    const dailyMetrics: DailyMetrics[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const dayKey = `${METRICS_KEY_PREFIX}${d.toISOString().split('T')[0]}`;
      const data = await redisClient.get(dayKey);
      if (data) {
        dailyMetrics.push(JSON.parse(data));
      }
    }

    if (dailyMetrics.length === 0) return;

    // Average/sum the metrics
    const weeklyMetrics = AnalyticsAggregationJob.aggregateMultipleDays(dailyMetrics);

    await redisClient.setex(weekKey, RETENTION_DAYS * 24 * 60 * 60, JSON.stringify(weeklyMetrics));

    logger.info({ weekStart: startDate.toISOString().split('T')[0] }, 'Weekly metrics aggregated');
  }

  private static async aggregateMonthly(firstOfMonth: Date): Promise<void> {
    if (!redisClient) return;

    // Aggregate previous month
    const prevMonth = new Date(firstOfMonth);
    prevMonth.setMonth(prevMonth.getMonth() - 1);

    const monthKey = `${METRICS_MONTHLY_KEY}${prevMonth.toISOString().slice(0, 7)}`;

    // Get all daily metrics for previous month
    const daysInMonth = new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0).getDate();
    const dailyMetrics: DailyMetrics[] = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(prevMonth.getFullYear(), prevMonth.getMonth(), day);
      const dayKey = `${METRICS_KEY_PREFIX}${d.toISOString().split('T')[0]}`;
      const data = await redisClient.get(dayKey);
      if (data) {
        dailyMetrics.push(JSON.parse(data));
      }
    }

    if (dailyMetrics.length === 0) return;

    const monthlyMetrics = AnalyticsAggregationJob.aggregateMultipleDays(dailyMetrics);

    // Keep monthly data for 2 years
    await redisClient.setex(monthKey, 730 * 24 * 60 * 60, JSON.stringify(monthlyMetrics));

    logger.info({ month: prevMonth.toISOString().slice(0, 7) }, 'Monthly metrics aggregated');
  }

  private static aggregateMultipleDays(metrics: DailyMetrics[]): DailyMetrics {
    const count = metrics.length;
    if (count === 0) {
      throw new Error('No metrics to aggregate');
    }

    // Use last day's snapshot values, sum cumulative values
    const last = metrics[metrics.length - 1];

    return {
      date: `${metrics[0].date}_to_${last.date}`,
      portfolio: last.portfolio, // Snapshot
      revenue: {
        collected: metrics.reduce((sum, m) => sum + m.revenue.collected, 0),
        potential: last.revenue.potential,
        collectionRate: Math.round(
          (metrics.reduce((sum, m) => sum + m.revenue.collectionRate, 0) / count) * 10
        ) / 10,
        byType: metrics.reduce(
          (acc, m) => {
            Object.entries(m.revenue.byType).forEach(([type, amount]) => {
              acc[type] = (acc[type] || 0) + amount;
            });
            return acc;
          },
          {} as Record<string, number>
        ),
      },
      listings: {
        active: last.listings.active,
        newListings: metrics.reduce((sum, m) => sum + m.listings.newListings, 0),
        totalViews: metrics.reduce((sum, m) => sum + m.listings.totalViews, 0),
        totalInquiries: metrics.reduce((sum, m) => sum + m.listings.totalInquiries, 0),
        totalApplications: metrics.reduce((sum, m) => sum + m.listings.totalApplications, 0),
        conversionRate: Math.round(
          (metrics.reduce((sum, m) => sum + m.listings.conversionRate, 0) / count) * 10
        ) / 10,
      },
      leases: {
        active: last.leases.active,
        expiringSoon: last.leases.expiringSoon,
        renewed: metrics.reduce((sum, m) => sum + m.leases.renewed, 0),
        terminated: metrics.reduce((sum, m) => sum + m.leases.terminated, 0),
        newLeases: metrics.reduce((sum, m) => sum + m.leases.newLeases, 0),
      },
      maintenance: {
        open: last.maintenance.open,
        newSubmitted: metrics.reduce((sum, m) => sum + m.maintenance.newSubmitted, 0),
        completed: metrics.reduce((sum, m) => sum + m.maintenance.completed, 0),
        avgResolutionHours: Math.round(
          (metrics.reduce((sum, m) => sum + m.maintenance.avgResolutionHours, 0) / count) * 10
        ) / 10,
        totalCost: metrics.reduce((sum, m) => sum + m.maintenance.totalCost, 0),
        byCategory: last.maintenance.byCategory,
        byPriority: last.maintenance.byPriority,
      },
      payments: {
        total: metrics.reduce((sum, m) => sum + m.payments.total, 0),
        successful: metrics.reduce((sum, m) => sum + m.payments.successful, 0),
        failed: metrics.reduce((sum, m) => sum + m.payments.failed, 0),
        onTimeRate: Math.round(
          (metrics.reduce((sum, m) => sum + m.payments.onTimeRate, 0) / count) * 10
        ) / 10,
        latePayments: metrics.reduce((sum, m) => sum + m.payments.latePayments, 0),
        lateFeeCollected: metrics.reduce((sum, m) => sum + m.payments.lateFeeCollected, 0),
      },
      users: last.users, // Snapshot
    };
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Get latest aggregated metrics.
   */
  static async getLatestMetrics(): Promise<DailyMetrics | null> {
    if (!redisClient) return null;

    const data = await redisClient.get(METRICS_LATEST_KEY);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Get metrics for a specific date.
   */
  static async getMetricsForDate(dateStr: string): Promise<DailyMetrics | null> {
    if (!redisClient) return null;

    const key = `${METRICS_KEY_PREFIX}${dateStr}`;
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Get metrics for a date range.
   */
  static async getMetricsRange(
    startDate: string,
    endDate: string
  ): Promise<DailyMetrics[]> {
    if (!redisClient) return [];

    const metrics: DailyMetrics[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const data = await AnalyticsAggregationJob.getMetricsForDate(dateStr);
      if (data) {
        metrics.push(data);
      }
    }

    return metrics;
  }

  /**
   * Get weekly aggregated metrics.
   */
  static async getWeeklyMetrics(weekStartDate: string): Promise<DailyMetrics | null> {
    if (!redisClient) return null;

    const key = `${METRICS_WEEKLY_KEY}${weekStartDate}`;
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Get monthly aggregated metrics.
   */
  static async getMonthlyMetrics(yearMonth: string): Promise<DailyMetrics | null> {
    if (!redisClient) return null;

    const key = `${METRICS_MONTHLY_KEY}${yearMonth}`;
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Manually trigger aggregation for a specific date.
   */
  static async aggregateDate(dateStr: string): Promise<DailyMetrics> {
    const date = new Date(dateStr);
    const metrics = await AnalyticsAggregationJob.aggregateForDate(date);

    if (redisClient) {
      await AnalyticsAggregationJob.storeMetrics(dateStr, metrics);
    }

    return metrics;
  }
}
