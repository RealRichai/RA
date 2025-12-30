/**
 * Lease Email Templates
 */

export * from './lease-created';
export * from './lease-expiring';

import { leaseCreatedTemplate } from './lease-created';
import { leaseExpiringTemplate } from './lease-expiring';

export const leaseTemplates = [
  leaseCreatedTemplate,
  leaseExpiringTemplate,
];
