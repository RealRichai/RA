/**
 * i18n Configuration Tests
 *
 * Tests for locale configuration and message files.
 */

import { describe, it, expect } from 'vitest';

import { locales, defaultLocale, isValidLocale, localeNames } from '../i18n/config';
import enMessages from '../messages/en.json';
import esMessages from '../messages/es.json';

describe('i18n Configuration', () => {
  describe('Locale Config', () => {
    it('should have en and es as supported locales', () => {
      expect(locales).toContain('en');
      expect(locales).toContain('es');
    });

    it('should have en as default locale', () => {
      expect(defaultLocale).toBe('en');
    });

    it('should have locale names for all locales', () => {
      for (const locale of locales) {
        expect(localeNames[locale]).toBeDefined();
        expect(typeof localeNames[locale]).toBe('string');
      }
    });
  });

  describe('Locale Validation', () => {
    it('should validate en as valid locale', () => {
      expect(isValidLocale('en')).toBe(true);
    });

    it('should validate es as valid locale', () => {
      expect(isValidLocale('es')).toBe(true);
    });

    it('should reject invalid locales', () => {
      expect(isValidLocale('fr')).toBe(false);
      expect(isValidLocale('de')).toBe(false);
      expect(isValidLocale('invalid')).toBe(false);
    });
  });
});

describe('Message Files', () => {
  describe('English Messages', () => {
    it('should have common namespace', () => {
      expect(enMessages.common).toBeDefined();
    });

    it('should have auth namespace', () => {
      expect(enMessages.auth).toBeDefined();
    });

    it('should have navigation namespace', () => {
      expect(enMessages.navigation).toBeDefined();
    });

    it('should have dashboard namespace', () => {
      expect(enMessages.dashboard).toBeDefined();
    });

    it('should have listings namespace', () => {
      expect(enMessages.listings).toBeDefined();
    });

    it('should have compliance namespace', () => {
      expect(enMessages.compliance).toBeDefined();
    });

    it('should have GDPR-related messages', () => {
      expect(enMessages.compliance.gdpr).toBeDefined();
      expect(enMessages.compliance.gdpr.consent).toBeDefined();
      expect(enMessages.compliance.gdpr.rightToErasure).toBeDefined();
    });
  });

  describe('Spanish Messages', () => {
    it('should have common namespace', () => {
      expect(esMessages.common).toBeDefined();
    });

    it('should have auth namespace', () => {
      expect(esMessages.auth).toBeDefined();
    });

    it('should have navigation namespace', () => {
      expect(esMessages.navigation).toBeDefined();
    });

    it('should have dashboard namespace', () => {
      expect(esMessages.dashboard).toBeDefined();
    });

    it('should have listings namespace', () => {
      expect(esMessages.listings).toBeDefined();
    });

    it('should have compliance namespace', () => {
      expect(esMessages.compliance).toBeDefined();
    });

    it('should have GDPR-related messages', () => {
      expect(esMessages.compliance.gdpr).toBeDefined();
      expect(esMessages.compliance.gdpr.consent).toBeDefined();
      expect(esMessages.compliance.gdpr.rightToErasure).toBeDefined();
    });
  });

  describe('Message Parity', () => {
    it('should have same top-level keys in both languages', () => {
      const enKeys = Object.keys(enMessages).sort();
      const esKeys = Object.keys(esMessages).sort();
      expect(enKeys).toEqual(esKeys);
    });

    it('should have same common keys in both languages', () => {
      const enKeys = Object.keys(enMessages.common).sort();
      const esKeys = Object.keys(esMessages.common).sort();
      expect(enKeys).toEqual(esKeys);
    });

    it('should have same auth keys in both languages', () => {
      const enKeys = Object.keys(enMessages.auth).sort();
      const esKeys = Object.keys(esMessages.auth).sort();
      expect(enKeys).toEqual(esKeys);
    });

    it('should have same navigation keys in both languages', () => {
      const enKeys = Object.keys(enMessages.navigation).sort();
      const esKeys = Object.keys(esMessages.navigation).sort();
      expect(enKeys).toEqual(esKeys);
    });

    it('should have same compliance keys in both languages', () => {
      const enKeys = Object.keys(enMessages.compliance).sort();
      const esKeys = Object.keys(esMessages.compliance).sort();
      expect(enKeys).toEqual(esKeys);
    });
  });
});

describe('Locale Switching', () => {
  it('should have different translations for common.loading', () => {
    expect(enMessages.common.loading).toBe('Loading...');
    expect(esMessages.common.loading).toBe('Cargando...');
    expect(enMessages.common.loading).not.toBe(esMessages.common.loading);
  });

  it('should have different translations for auth.login', () => {
    expect(enMessages.auth.login).toBe('Log in');
    expect(esMessages.auth.login).toBe('Iniciar sesion');
    expect(enMessages.auth.login).not.toBe(esMessages.auth.login);
  });

  it('should have different translations for dashboard.title', () => {
    expect(enMessages.dashboard.title).toBe('Dashboard');
    expect(esMessages.dashboard.title).toBe('Panel de Control');
    expect(enMessages.dashboard.title).not.toBe(esMessages.dashboard.title);
  });
});
