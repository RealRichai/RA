/**
 * Email Template Definitions
 */

export * from './auth';
export * from './lease';
export * from './documents';
export * from './alerts';

import { authTemplates } from './auth';
import { leaseTemplates } from './lease';
import { documentTemplates } from './documents';
import { alertTemplates } from './alerts';

export const allTemplates = [
  ...authTemplates,
  ...leaseTemplates,
  ...documentTemplates,
  ...alertTemplates,
];
