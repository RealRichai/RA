/**
 * Internationalization Middleware
 *
 * Handles locale detection and routing for next-intl.
 * - Detects locale from URL, cookies, or Accept-Language header
 * - Uses 'as-needed' prefix (show /es but not /en for default)
 */

import createMiddleware from 'next-intl/middleware';

import { locales, defaultLocale } from './i18n/config';

export default createMiddleware({
  locales,
  defaultLocale,
  // Only show locale prefix for non-default locales
  localePrefix: 'as-needed',
});

export const config = {
  // Match all paths except:
  // - API routes
  // - Next.js internals (_next)
  // - Static files (images, favicon, etc.)
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};
