/**
 * i18n Configuration
 *
 * Defines supported locales and default locale for the application.
 */

export const locales = ['en', 'es', 'fr'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

/**
 * Locale display names for UI
 */
export const localeNames: Record<Locale, string> = {
  en: 'English',
  es: 'Espanol',
  fr: 'Francais',
};

/**
 * Flag emojis for each locale
 */
export const localeFlags: Record<Locale, string> = {
  en: '\ud83c\uddfa\ud83c\uddf8',
  es: '\ud83c\uddea\ud83c\uddf8',
  fr: '\ud83c\uddeb\ud83c\uddf7',
};

/**
 * Check if a locale is valid
 */
export function isValidLocale(locale: string): locale is Locale {
  return locales.includes(locale as Locale);
}
