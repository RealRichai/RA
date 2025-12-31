import { getConfig } from '@realriches/config';
import type { FastifyInstance } from 'fastify';

import { metricsRoutes } from '../plugins/metrics';

import { activityRoutes } from './activity/routes';
import { apiKeyAdminRoutes } from './admin/api-keys';
import { auditLogRoutes } from './admin/audit-logs';
import { bulkOperationsRoutes } from './admin/bulk-operations';
import { dataExportRoutes } from './admin/data-export';
import { emailTemplateAdminRoutes } from './admin/email-templates';
import { featureFlagAdminRoutes } from './admin/feature-flags';
import { impersonationAdminRoutes } from './admin/impersonation';
import { jobRoutes } from './admin/jobs';
import { rateLimitAdminRoutes } from './admin/rate-limits';
import { roleManagementRoutes } from './admin/roles';
import { systemSettingsAdminRoutes } from './admin/system-settings';
import { webhookAdminRoutes } from './admin/webhooks';
import { mfaRoutes } from './auth/mfa';
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
import { websocketPlugin } from './realtime/websocket';
import { searchRoutes } from './search/routes';
import { userRoutes } from './users/routes';
import { webhookRoutes } from './webhooks/routes';

export async function registerModules(app: FastifyInstance): Promise<void> {
  const config = getConfig();
  const prefix = config.api.prefix;

  // Health check (no prefix)
  await app.register(healthRoutes);

  // Metrics (no prefix, Prometheus format)
  await app.register(metricsRoutes);

  // WebSocket server for real-time notifications
  await app.register(websocketPlugin);

  // Webhooks (no auth, signature verification)
  await app.register(webhookRoutes, { prefix: '/webhooks' });

  // API routes with prefix
  await app.register(
    async (api) => {
      await api.register(authRoutes, { prefix: '/auth' });
      await api.register(mfaRoutes, { prefix: '/auth/mfa' });
      await api.register(userRoutes, { prefix: '/users' });
      await api.register(activityRoutes, { prefix: '/activity' });
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
      await api.register(searchRoutes, { prefix: '/search' });

      // Admin routes
      await api.register(auditLogRoutes, { prefix: '/admin/audit-logs' });
      await api.register(jobRoutes, { prefix: '/admin/jobs' });
      await api.register(webhookAdminRoutes, { prefix: '/admin/webhooks' });
      await api.register(rateLimitAdminRoutes, { prefix: '/admin/rate-limits' });
      await api.register(apiKeyAdminRoutes, { prefix: '/admin/api-keys' });
      await api.register(emailTemplateAdminRoutes, { prefix: '/admin/email-templates' });
      await api.register(featureFlagAdminRoutes, { prefix: '/admin/feature-flags' });
      await api.register(systemSettingsAdminRoutes, { prefix: '/admin/settings' });
      await api.register(impersonationAdminRoutes, { prefix: '/admin/impersonate' });
      await api.register(dataExportRoutes, { prefix: '/admin/exports' });
      await api.register(roleManagementRoutes, { prefix: '/admin/roles' });
      await api.register(bulkOperationsRoutes, { prefix: '/admin/bulk' });
    },
    { prefix }
  );
}
