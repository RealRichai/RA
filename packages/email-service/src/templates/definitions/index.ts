/**
 * Email Template Definitions
 */

export * from './auth';
export * from './lease';
export * from './documents';
export * from './alerts';
export * from './system';

import { alertTemplates } from './alerts';
import { authTemplates } from './auth';
import { documentTemplates } from './documents';
import { leaseTemplates } from './lease';
import { systemTemplates } from './system';

export const allTemplates = [
  ...authTemplates,
  ...leaseTemplates,
  ...documentTemplates,
  ...alertTemplates,
  ...systemTemplates,
];
