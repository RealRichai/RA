/**
 * i18n Configuration
 *
 * Defines supported locales and default locale for the application.
 */

export const locales = ['en', 'es'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

/**
 * Locale display names for UI
 */
export const localeNames: Record<Locale, string> = {
  en: 'English',
  es: 'Espanol',
};

/**
 * Check if a locale is valid
 */
export function isValidLocale(locale: string): locale is Locale {
  return locales.includes(locale as Locale);
}
