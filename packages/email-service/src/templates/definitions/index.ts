/**
 * Email Template Definitions
 */

export * from './auth';
export * from './lease';
export * from './documents';
export * from './alerts';

import { alertTemplates } from './alerts';
import { authTemplates } from './auth';
import { documentTemplates } from './documents';
import { leaseTemplates } from './lease';

export const allTemplates = [
  ...authTemplates,
  ...leaseTemplates,
  ...documentTemplates,
  ...alertTemplates,
];
