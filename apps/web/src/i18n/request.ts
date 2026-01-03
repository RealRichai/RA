/**
 * next-intl Request Configuration
 *
 * Server-side configuration for loading locale messages.
 */

import { getRequestConfig } from 'next-intl/server';

import { type Locale, defaultLocale, isValidLocale } from './config';

type Messages = Record<string, Record<string, unknown>>;

async function loadMessages(locale: Locale): Promise<Messages> {
  switch (locale) {
    case 'es':
      return (await import('../messages/es.json')) as Messages;
    case 'en':
    default:
      return (await import('../messages/en.json')) as Messages;
  }
}

export default getRequestConfig(async ({ requestLocale }) => {
  // Get the locale from the request
  let locale = await requestLocale;

  // Validate and fallback to default
  if (!locale || !isValidLocale(locale)) {
    locale = defaultLocale;
  }

  return {
    locale,
    messages: await loadMessages(locale as Locale),
    timeZone: 'America/New_York',
    now: new Date(),
  };
});

/**
 * Get messages for a specific locale (for server components)
 */
export async function getMessages(locale: Locale): Promise<Messages> {
  return loadMessages(locale);
}
