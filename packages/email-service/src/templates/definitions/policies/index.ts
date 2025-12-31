/**
 * Policy Email Templates
 */

export * from './policy-expiring';
export * from './policy-renewed';

import { policyExpiringTemplate } from './policy-expiring';
import { policyRenewedTemplate } from './policy-renewed';

export const policyTemplates = [
  policyExpiringTemplate,
  policyRenewedTemplate,
];
