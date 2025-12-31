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
import { aiRoutes } from './ai/routes';
import { amenityRoutes } from './amenities/routes';
import { analyticsRoutes } from './analytics/routes';
import { mfaRoutes } from './auth/mfa';
import { authRoutes } from './auth/routes';
import { budgetRoutes } from './budgets/routes';
import { buildingSystemRoutes } from './building-systems/routes';
import { commerceRoutes } from './commerce/routes';
import { commercialRoutes } from './commercial/routes';
import { commonAreaRoutes } from './common-areas/routes';
import { communicationRoutes } from './communications/routes';
import { complianceRoutes } from './compliance/routes';
import { esignatureRoutes } from './documents/esignature';
import { documentRoutes } from './documents/routes';
import { guestRoutes } from './guests/routes';
import { healthRoutes } from './health/routes';
import { hoaRoutes } from './hoa/routes';
import { inspectionRoutes } from './inspections/routes';
import { insuranceRoutes } from './insurance/routes';
import { keyRoutes } from './keys/routes';
import { renewalRoutes } from './leases/renewals';
import { leaseRoutes } from './leases/routes';
import { leaseTemplateRoutes } from './leases/templates';
import { listingRoutes } from './listings/routes';
import { maintenanceRoutes } from './maintenance/routes';
import { workflowRoutes } from './maintenance/workflows';
import { marketingRoutes } from './marketing/routes';
import { moveWorkflowRoutes } from './move-workflows/routes';
import { pushNotificationRoutes } from './notifications/push';
import { notificationRoutes } from './notifications/routes';
import { ownerPortalRoutes } from './owner-portal/routes';
import { packageRoutes } from './packages/routes';
import { parkingRoutes } from './parking/routes';
import { partnerRoutes } from './partners/routes';
import { reconciliationRoutes } from './payments/reconciliation';
import { rentCollectionRoutes } from './payments/rent-collection';
import { paymentRoutes } from './payments/routes';
import { petRoutes } from './pets/routes';
import { portfolioRoutes } from './portfolio/routes';
import { comparableRoutes } from './properties/comparables';
import { propertyRoutes } from './properties/routes';
import { propertyComparisonRoutes } from './property-comparison/routes';
import { websocketPlugin } from './realtime/websocket';
import { rentRollRoutes } from './rent-roll/routes';
import { rentalAssistanceRoutes } from './rental-assistance/routes';
import { reportRoutes } from './reports/routes';
import { screeningRoutes } from './screening/routes';
import { searchRoutes } from './search/routes';
import { showingRoutes } from './showings/routes';
import { storageRoutes } from './storage/routes';
import { taxDocumentRoutes } from './tax-documents/routes';
import { tenantPortalRoutes } from './tenant-portal/routes';
import { userRoutes } from './users/routes';
import { utilitiesRoutes } from './utilities/routes';
import { vendorRoutes } from './vendors/routes';
import { violationRoutes } from './violations/routes';
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
      await api.register(reportRoutes, { prefix: '/reports' });
      await api.register(renewalRoutes, { prefix: '/renewals' });
      await api.register(workflowRoutes, { prefix: '/maintenance/workflows' });
      await api.register(reconciliationRoutes, { prefix: '/reconciliation' });
      await api.register(esignatureRoutes, { prefix: '/esignature' });
      await api.register(pushNotificationRoutes, { prefix: '/push' });
      await api.register(tenantPortalRoutes, { prefix: '/tenant' });
      await api.register(comparableRoutes, { prefix: '/comparables' });
      await api.register(rentCollectionRoutes, { prefix: '/rent-collection' });
      await api.register(inspectionRoutes, { prefix: '/inspections' });
      await api.register(vendorRoutes, { prefix: '/vendors' });
      await api.register(leaseTemplateRoutes, { prefix: '/lease-templates' });
      await api.register(portfolioRoutes, { prefix: '/portfolio' });
      await api.register(screeningRoutes, { prefix: '/screening' });
      await api.register(communicationRoutes, { prefix: '/communications' });
      await api.register(insuranceRoutes, { prefix: '/insurance' });
      await api.register(utilitiesRoutes, { prefix: '/utilities' });
      await api.register(ownerPortalRoutes, { prefix: '/owner-portal' });
      await api.register(budgetRoutes, { prefix: '/budgets' });
      await api.register(showingRoutes, { prefix: '/showings' });
      await api.register(moveWorkflowRoutes, { prefix: '/move-workflows' });
      await api.register(hoaRoutes, { prefix: '/hoa' });
      await api.register(taxDocumentRoutes, { prefix: '/tax-documents' });
      await api.register(rentalAssistanceRoutes, { prefix: '/rental-assistance' });
      await api.register(amenityRoutes, { prefix: '/amenities' });
      await api.register(packageRoutes, { prefix: '/packages' });
      await api.register(petRoutes, { prefix: '/pets' });
      await api.register(parkingRoutes, { prefix: '/parking' });
      await api.register(storageRoutes, { prefix: '/storage' });
      await api.register(keyRoutes, { prefix: '/keys' });
      await api.register(buildingSystemRoutes, { prefix: '/building-systems' });
      await api.register(commonAreaRoutes, { prefix: '/common-areas' });
      await api.register(guestRoutes, { prefix: '/guests' });
      await api.register(violationRoutes, { prefix: '/violations' });
      await api.register(rentRollRoutes, { prefix: '/rent-roll' });
      await api.register(propertyComparisonRoutes, { prefix: '/property-comparison' });

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
