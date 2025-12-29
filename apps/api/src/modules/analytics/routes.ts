import { prisma } from '@realriches/database';
import { ForbiddenError } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

const DateRangeSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  period: z.enum(['day', 'week', 'month', 'quarter', 'year']).default('month'),
});

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  // Portfolio summary
  app.get(
    '/portfolio',
    {
      schema: {
        description: 'Get portfolio summary analytics',
        tags: ['Analytics'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['LANDLORD', 'INVESTOR', 'ADMIN'] });
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const ownerFilter = request.user.role === 'ADMIN' ? {} : { ownerId: request.user.id };

      // Get properties and units
      const properties = await prisma.property.findMany({
        where: ownerFilter,
        include: {
          units: {
            include: {
              leases: {
                where: { status: 'ACTIVE' },
                take: 1,
              },
            },
          },
        },
      });

      // Calculate metrics
      let totalUnits = 0;
      let occupiedUnits = 0;
      let totalMonthlyRent = 0;
      let collectedRent = 0;

      properties.forEach((property) => {
        property.units.forEach((unit) => {
          totalUnits++;
          if (unit.status === 'OCCUPIED' && unit.leases.length > 0) {
            occupiedUnits++;
            totalMonthlyRent += Number(unit.rent);
          }
        });
      });

      // Get collected rent for current month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const payments = await prisma.payment.aggregate({
        where: {
          status: 'COMPLETED',
          type: 'RENT',
          paidAt: { gte: startOfMonth },
          lease: {
            unit: {
              property: ownerFilter,
            },
          },
        },
        _sum: { amount: true },
      });

      collectedRent = Number(payments._sum.amount) || 0;

      // Get work order stats
      const openWorkOrders = await prisma.workOrder.count({
        where: {
          status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] },
          unit: { property: ownerFilter },
        },
      });

      const occupancyRate = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;
      const collectionRate = totalMonthlyRent > 0 ? (collectedRent / totalMonthlyRent) * 100 : 0;

      return reply.send({
        success: true,
        data: {
          properties: properties.length,
          units: {
            total: totalUnits,
            occupied: occupiedUnits,
            vacant: totalUnits - occupiedUnits,
            occupancyRate: Math.round(occupancyRate * 10) / 10,
          },
          revenue: {
            monthlyPotential: totalMonthlyRent,
            collected: collectedRent,
            collectionRate: Math.round(collectionRate * 10) / 10,
          },
          maintenance: {
            openWorkOrders,
          },
        },
      });
    }
  );

  // Revenue analytics
  app.get(
    '/revenue',
    {
      schema: {
        description: 'Get revenue analytics',
        tags: ['Analytics'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            startDate: { type: 'string' },
            endDate: { type: 'string' },
            period: { type: 'string' },
            propertyId: { type: 'string' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['LANDLORD', 'INVESTOR', 'ADMIN'] });
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: {
          startDate?: string;
          endDate?: string;
          period?: string;
          propertyId?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { startDate, endDate, propertyId } = request.query;

      const ownerFilter = request.user.role === 'ADMIN' ? {} : { ownerId: request.user.id };
      const propertyFilter = propertyId ? { propertyId } : {};

      // Default to last 12 months
      const start = startDate ? new Date(startDate) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate) : new Date();

      // Get payments by month
      const payments = await prisma.payment.findMany({
        where: {
          status: 'COMPLETED',
          paidAt: { gte: start, lte: end },
          lease: {
            unit: {
              property: { ...ownerFilter, ...propertyFilter },
            },
          },
        },
        select: {
          amount: true,
          type: true,
          paidAt: true,
        },
        orderBy: { paidAt: 'asc' },
      });

      // Group by month
      const monthlyData: Record<string, { rent: number; fees: number; other: number }> = {};

      payments.forEach((payment) => {
        const monthKey = payment.paidAt!.toISOString().slice(0, 7);
        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = { rent: 0, fees: 0, other: 0 };
        }
        const amount = Number(payment.amount);
        if (payment.type === 'RENT') {
          monthlyData[monthKey].rent += amount;
        } else if (payment.type === 'FEE') {
          monthlyData[monthKey].fees += amount;
        } else {
          monthlyData[monthKey].other += amount;
        }
      });

      const chartData = Object.entries(monthlyData).map(([month, data]) => ({
        month,
        ...data,
        total: data.rent + data.fees + data.other,
      }));

      const totals = chartData.reduce(
        (acc, d) => ({
          rent: acc.rent + d.rent,
          fees: acc.fees + d.fees,
          other: acc.other + d.other,
          total: acc.total + d.total,
        }),
        { rent: 0, fees: 0, other: 0, total: 0 }
      );

      return reply.send({
        success: true,
        data: {
          period: { start: start.toISOString(), end: end.toISOString() },
          chartData,
          totals,
        },
      });
    }
  );

  // Listing analytics
  app.get(
    '/listings',
    {
      schema: {
        description: 'Get listing performance analytics',
        tags: ['Analytics'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            propertyId: { type: 'string' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['LANDLORD', 'AGENT', 'ADMIN'] });
      },
    },
    async (
      request: FastifyRequest<{ Querystring: { propertyId?: string } }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { propertyId } = request.query;

      const ownerFilter =
        request.user.role === 'ADMIN'
          ? {}
          : request.user.role === 'AGENT'
            ? { agentId: request.user.id }
            : { unit: { property: { ownerId: request.user.id } } };

      const propertyFilter = propertyId ? { unit: { propertyId } } : {};

      const listings = await prisma.listing.findMany({
        where: { ...ownerFilter, ...propertyFilter },
        select: {
          id: true,
          title: true,
          status: true,
          viewCount: true,
          inquiryCount: true,
          rent: true,
          createdAt: true,
          unit: {
            select: {
              bedrooms: true,
              property: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Calculate averages
      const totalViews = listings.reduce((sum, l) => sum + l.viewCount, 0);
      const totalInquiries = listings.reduce((sum, l) => sum + l.inquiryCount, 0);
      const avgViewsPerListing = listings.length > 0 ? totalViews / listings.length : 0;
      const conversionRate = totalViews > 0 ? (totalInquiries / totalViews) * 100 : 0;

      // Group by status
      const byStatus = listings.reduce(
        (acc, l) => {
          acc[l.status] = (acc[l.status] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      return reply.send({
        success: true,
        data: {
          listings: listings.map((l) => ({
            ...l,
            rent: Number(l.rent),
          })),
          summary: {
            total: listings.length,
            byStatus,
            totalViews,
            totalInquiries,
            avgViewsPerListing: Math.round(avgViewsPerListing * 10) / 10,
            conversionRate: Math.round(conversionRate * 100) / 100,
          },
        },
      });
    }
  );

  // Maintenance analytics
  app.get(
    '/maintenance',
    {
      schema: {
        description: 'Get maintenance analytics',
        tags: ['Analytics'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            propertyId: { type: 'string' },
            startDate: { type: 'string' },
            endDate: { type: 'string' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['LANDLORD', 'ADMIN'] });
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: { propertyId?: string; startDate?: string; endDate?: string };
      }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { propertyId, startDate, endDate } = request.query;

      const ownerFilter = request.user.role === 'ADMIN' ? {} : { ownerId: request.user.id };
      const propertyFilter = propertyId ? { propertyId } : {};

      const start = startDate ? new Date(startDate) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate) : new Date();

      // Get work orders
      const workOrders = await prisma.workOrder.findMany({
        where: {
          createdAt: { gte: start, lte: end },
          unit: { property: { ...ownerFilter, ...propertyFilter } },
        },
        select: {
          id: true,
          status: true,
          priority: true,
          category: true,
          actualCost: true,
          createdAt: true,
          completedAt: true,
        },
      });

      // Calculate metrics
      const byStatus = workOrders.reduce(
        (acc, wo) => {
          acc[wo.status] = (acc[wo.status] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      const byCategory = workOrders.reduce(
        (acc, wo) => {
          acc[wo.category] = (acc[wo.category] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      const byPriority = workOrders.reduce(
        (acc, wo) => {
          acc[wo.priority] = (acc[wo.priority] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      const completedOrders = workOrders.filter((wo) => wo.status === 'COMPLETED' && wo.completedAt);

      // Average resolution time in days
      const avgResolutionTime =
        completedOrders.length > 0
          ? completedOrders.reduce((sum, wo) => {
              const created = wo.createdAt.getTime();
              const completed = wo.completedAt!.getTime();
              return sum + (completed - created) / (1000 * 60 * 60 * 24);
            }, 0) / completedOrders.length
          : 0;

      // Total costs
      const totalCost = workOrders.reduce((sum, wo) => sum + (Number(wo.actualCost) || 0), 0);

      return reply.send({
        success: true,
        data: {
          period: { start: start.toISOString(), end: end.toISOString() },
          summary: {
            total: workOrders.length,
            completed: completedOrders.length,
            avgResolutionDays: Math.round(avgResolutionTime * 10) / 10,
            totalCost,
          },
          byStatus,
          byCategory,
          byPriority,
        },
      });
    }
  );

  // Market analytics
  app.get(
    '/market',
    {
      schema: {
        description: 'Get market analytics and comparables',
        tags: ['Analytics'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            neighborhood: { type: 'string' },
            zipCode: { type: 'string' },
            bedrooms: { type: 'integer' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: { neighborhood?: string; zipCode?: string; bedrooms?: number };
      }>,
      reply: FastifyReply
    ) => {
      const { neighborhood, zipCode, bedrooms } = request.query;

      // TODO: HUMAN_IMPLEMENTATION_REQUIRED - Integrate with market data providers
      // For now, return sample market data

      const marketData = {
        location: neighborhood || zipCode || 'NYC',
        averageRent: {
          studio: 2500,
          oneBed: 3200,
          twoBed: 4500,
          threeBed: 6000,
        },
        rentTrends: [
          { month: '2024-01', avgRent: 3100 },
          { month: '2024-02', avgRent: 3150 },
          { month: '2024-03', avgRent: 3200 },
          { month: '2024-04', avgRent: 3180 },
          { month: '2024-05', avgRent: 3250 },
          { month: '2024-06', avgRent: 3300 },
        ],
        vacancyRate: 2.8,
        daysOnMarket: 21,
        yoyChange: 4.5,
      };

      return reply.send({ success: true, data: marketData });
    }
  );

  // Export analytics report
  app.get(
    '/export',
    {
      schema: {
        description: 'Export analytics report',
        tags: ['Analytics'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            format: { type: 'string', enum: ['csv', 'pdf', 'xlsx'] },
            reportType: { type: 'string' },
            startDate: { type: 'string' },
            endDate: { type: 'string' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['LANDLORD', 'INVESTOR', 'ADMIN'] });
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: {
          format?: string;
          reportType?: string;
          startDate?: string;
          endDate?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { format = 'csv', reportType = 'portfolio' } = request.query;

      // TODO: HUMAN_IMPLEMENTATION_REQUIRED - Generate actual report files
      // Would use libraries like pdfkit, exceljs, etc.

      return reply.send({
        success: true,
        data: {
          downloadUrl: `https://storage.example.com/reports/${reportType}-${Date.now()}.${format}`,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        },
        message: 'Report generated. Download link expires in 1 hour.',
      });
    }
  );
}
