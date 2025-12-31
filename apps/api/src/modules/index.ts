import { getConfig } from '@realriches/config';
import type { FastifyInstance } from 'fastify';

import { metricsRoutes } from '../plugins/metrics';

import { auditLogRoutes } from './admin/audit-logs';
import { aiRoutes } from './ai/routes';
import { analyticsRoutes } from './analytics/routes';
import { authRoutes } from './auth/routes';
import { commerceRoutes } from './commerce/routes';
import { commercialRoutes } from './commercial/routes';
import { complianceRoutes } from './compliance/routes';
import { documentRoutes } from './documents/routes';
import { healthRoutes } from './health/routes';
import { leaseRoutes } from './leases/routes';
import { listingRoutes } from './listings/routes';
import { maintenanceRoutes } from './maintenance/routes';
import { marketingRoutes } from './marketing/routes';
import { notificationRoutes } from './notifications/routes';
import { partnerRoutes } from './partners/routes';
import { paymentRoutes } from './payments/routes';
import { propertyRoutes } from './properties/routes';
import { userRoutes } from './users/routes';
import { webhookRoutes } from './webhooks/routes';

export async function registerModules(app: FastifyInstance): Promise<void> {
  const config = getConfig();
  const prefix = config.api.prefix;

  // Health check (no prefix)
  await app.register(healthRoutes);

  // Metrics (no prefix, Prometheus format)
  await app.register(metricsRoutes);

  // Webhooks (no auth, signature verification)
  await app.register(webhookRoutes, { prefix: '/webhooks' });

  // API routes with prefix
  await app.register(
    async (api) => {
      await api.register(authRoutes, { prefix: '/auth' });
      await api.register(userRoutes, { prefix: '/users' });
      await api.register(propertyRoutes, { prefix: '/properties' });
      await api.register(listingRoutes, { prefix: '/listings' });
      await api.register(leaseRoutes, { prefix: '/leases' });
      await api.register(complianceRoutes, { prefix: '/compliance' });
      await api.register(aiRoutes, { prefix: '/ai' });
      await api.register(paymentRoutes, { prefix: '/payments' });
      await api.register(documentRoutes, { prefix: '/documents' });
      await api.register(maintenanceRoutes, { prefix: '/maintenance' });
      await api.register(marketingRoutes, { prefix: '/marketing' });
      await api.register(commerceRoutes, { prefix: '/commerce' });
      await api.register(analyticsRoutes, { prefix: '/analytics' });
      await api.register(commercialRoutes, { prefix: '/commercial' });
      await api.register(notificationRoutes, { prefix: '/notifications' });
      await api.register(partnerRoutes, { prefix: '/partners' });

      // Admin routes
      await api.register(auditLogRoutes, { prefix: '/admin/audit-logs' });
    },
    { prefix }
  );
}
