/**
 * Email Template Definitions
 */

export * from './auth';
export * from './lease';
export * from './documents';
export * from './alerts';
export * from './payments';
export * from './policies';
export * from './system';

import { alertTemplates } from './alerts';
import { authTemplates } from './auth';
import { documentTemplates } from './documents';
import { leaseTemplates } from './lease';
import { paymentTemplates } from './payments';
import { policyTemplates } from './policies';
import { systemTemplates } from './system';

export const allTemplates = [
  ...authTemplates,
  ...leaseTemplates,
  ...documentTemplates,
  ...alertTemplates,
  ...paymentTemplates,
  ...policyTemplates,
  ...systemTemplates,
];
