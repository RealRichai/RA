/**
 * Email Templates
 *
 * Template system for rendering email content.
 */

export * from './engine';
export * from './layouts/base';
export * from './definitions';

import { registerTemplate } from './engine';
import { allTemplates } from './definitions';

/**
 * Register all built-in templates.
 * Call this during application startup.
 */
export function registerAllTemplates(): void {
  for (const template of allTemplates) {
    // Cast to generic type since registerTemplate accepts any template
    registerTemplate(template as unknown as Parameters<typeof registerTemplate>[0]);
  }
}
