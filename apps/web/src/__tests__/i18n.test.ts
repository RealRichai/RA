/**
 * i18n Configuration Tests
 *
 * Tests for locale configuration and message files.
 */

import { describe, it, expect } from 'vitest';

import {
  locales,
  defaultLocale,
  isValidLocale,
  localeNames,
  localeFlags,
} from '../i18n/config';
import enMessages from '../messages/en.json';
import esMessages from '../messages/es.json';
import frMessages from '../messages/fr.json';

describe('i18n Configuration', () => {
  describe('Locale Config', () => {
    it('should have en, es, and fr as supported locales', () => {
      expect(locales).toContain('en');
      expect(locales).toContain('es');
      expect(locales).toContain('fr');
      expect(locales).toHaveLength(3);
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

    it('should have locale flags for all locales', () => {
      for (const locale of locales) {
        expect(localeFlags[locale]).toBeDefined();
        expect(typeof localeFlags[locale]).toBe('string');
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

    it('should validate fr as valid locale', () => {
      expect(isValidLocale('fr')).toBe(true);
    });

    it('should reject invalid locales', () => {
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

  describe('French Messages', () => {
    it('should have common namespace', () => {
      expect(frMessages.common).toBeDefined();
    });

    it('should have auth namespace', () => {
      expect(frMessages.auth).toBeDefined();
    });

    it('should have navigation namespace', () => {
      expect(frMessages.navigation).toBeDefined();
    });

    it('should have dashboard namespace', () => {
      expect(frMessages.dashboard).toBeDefined();
    });

    it('should have listings namespace', () => {
      expect(frMessages.listings).toBeDefined();
    });

    it('should have compliance namespace', () => {
      expect(frMessages.compliance).toBeDefined();
    });

    it('should have disclosures namespace', () => {
      expect(frMessages.disclosures).toBeDefined();
      expect(frMessages.disclosures.fareAct).toBeDefined();
      expect(frMessages.disclosures.leadPaint).toBeDefined();
      expect(frMessages.disclosures.bedbug).toBeDefined();
      expect(frMessages.disclosures.fairHousing).toBeDefined();
    });

    it('should have GDPR-related messages', () => {
      expect(frMessages.compliance.gdpr).toBeDefined();
      expect(frMessages.compliance.gdpr.consent).toBeDefined();
      expect(frMessages.compliance.gdpr.rightToErasure).toBeDefined();
    });
  });

  describe('Message Parity', () => {
    it('should have same top-level keys in all languages', () => {
      const enKeys = Object.keys(enMessages).sort();
      const esKeys = Object.keys(esMessages).sort();
      const frKeys = Object.keys(frMessages).sort();
      expect(enKeys).toEqual(esKeys);
      expect(esKeys).toEqual(frKeys);
    });

    it('should have same common keys in all languages', () => {
      const enKeys = Object.keys(enMessages.common).sort();
      const esKeys = Object.keys(esMessages.common).sort();
      const frKeys = Object.keys(frMessages.common).sort();
      expect(enKeys).toEqual(esKeys);
      expect(esKeys).toEqual(frKeys);
    });

    it('should have same auth keys in all languages', () => {
      const enKeys = Object.keys(enMessages.auth).sort();
      const esKeys = Object.keys(esMessages.auth).sort();
      const frKeys = Object.keys(frMessages.auth).sort();
      expect(enKeys).toEqual(esKeys);
      expect(esKeys).toEqual(frKeys);
    });

    it('should have same navigation keys in all languages', () => {
      const enKeys = Object.keys(enMessages.navigation).sort();
      const esKeys = Object.keys(esMessages.navigation).sort();
      const frKeys = Object.keys(frMessages.navigation).sort();
      expect(enKeys).toEqual(esKeys);
      expect(esKeys).toEqual(frKeys);
    });

    it('should have same compliance keys in all languages', () => {
      const enKeys = Object.keys(enMessages.compliance).sort();
      const esKeys = Object.keys(esMessages.compliance).sort();
      const frKeys = Object.keys(frMessages.compliance).sort();
      expect(enKeys).toEqual(esKeys);
      expect(esKeys).toEqual(frKeys);
    });

    it('should have same disclosures keys in all languages', () => {
      const enKeys = Object.keys(enMessages.disclosures).sort();
      const esKeys = Object.keys(esMessages.disclosures).sort();
      const frKeys = Object.keys(frMessages.disclosures).sort();
      expect(enKeys).toEqual(esKeys);
      expect(esKeys).toEqual(frKeys);
    });
  });
});

describe('Locale Switching', () => {
  it('should have different translations for common.loading', () => {
    expect(enMessages.common.loading).toBe('Loading...');
    expect(esMessages.common.loading).toBe('Cargando...');
    expect(frMessages.common.loading).toBe('Chargement...');
    expect(enMessages.common.loading).not.toBe(esMessages.common.loading);
    expect(esMessages.common.loading).not.toBe(frMessages.common.loading);
  });

  it('should have different translations for auth.login', () => {
    expect(enMessages.auth.login).toBe('Log in');
    expect(esMessages.auth.login).toBe('Iniciar sesion');
    expect(frMessages.auth.login).toBe('Se connecter');
    expect(enMessages.auth.login).not.toBe(esMessages.auth.login);
    expect(esMessages.auth.login).not.toBe(frMessages.auth.login);
  });

  it('should have different translations for dashboard.title', () => {
    expect(enMessages.dashboard.title).toBe('Dashboard');
    expect(esMessages.dashboard.title).toBe('Panel de Control');
    expect(frMessages.dashboard.title).toBe('Tableau de bord');
    expect(enMessages.dashboard.title).not.toBe(esMessages.dashboard.title);
    expect(esMessages.dashboard.title).not.toBe(frMessages.dashboard.title);
  });

  it('should have proper French compliance disclosures', () => {
    expect(frMessages.disclosures.fareAct.title).toBe('Avis FARE Act');
    expect(frMessages.disclosures.leadPaint.title).toBe(
      'Divulgation sur la peinture au plomb'
    );
    expect(frMessages.disclosures.fairHousing.title).toBe(
      'Egalite des chances en matiere de logement'
    );
  });
});
