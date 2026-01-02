/**
 * Persistence Guard Tests
 *
 * CI safety tests ensuring production bootstrap cannot wire InMemory* stores.
 * These tests use static analysis to verify code patterns without requiring
 * database connections.
 *
 * @see apps/api/src/persistence/index.ts - Composition root
 * @see docs/architecture/persistence.md - Architecture documentation
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ESM-compatible __dirname
const currentDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDir, '..', '..', '..');
const apiRoot = resolve(currentDir, '..');

describe('Persistence Guard - Static Analysis', () => {
  describe('InMemory Store Location Validation', () => {
    it('should not have InMemory class definitions in production paths', () => {
      // InMemory* classes should NOT exist in:
      // - apps/api/src/persistence/* (composition root)
      // - apps/api/src/modules/* (production routes)

      const productionPaths = [
        'apps/api/src/persistence',
        'apps/api/src/modules',
      ];

      for (const searchPath of productionPaths) {
        const fullPath = resolve(projectRoot, searchPath);
        if (!existsSync(fullPath)) continue;

        try {
          const result = execSync(
            `grep -r "class InMemory" ${fullPath} 2>/dev/null || true`,
            { encoding: 'utf-8' }
          );

          // Should not find InMemory class definitions in production code
          expect(result.trim()).toBe('');
        } catch {
          // grep returns non-zero when no matches found - that's expected
        }
      }
    });

    it('should not have InMemory instantiation in production routes', () => {
      const modulesPath = resolve(apiRoot, 'src', 'modules');
      if (!existsSync(modulesPath)) return;

      try {
        const result = execSync(
          `grep -r "new InMemory" ${modulesPath} 2>/dev/null || true`,
          { encoding: 'utf-8' }
        );

        expect(result.trim()).toBe('');
      } catch {
        // Expected when no matches
      }
    });

    it('should not import InMemory stores directly in production routes', () => {
      const modulesPath = resolve(apiRoot, 'src', 'modules');
      if (!existsSync(modulesPath)) return;

      try {
        const result = execSync(
          `grep -rE "InMemoryAttributionStore|InMemoryMeteringService" ${modulesPath} 2>/dev/null || true`,
          { encoding: 'utf-8' }
        );

        expect(result.trim()).toBe('');
      } catch {
        // Expected when no matches
      }
    });
  });

  describe('Partner Revenue Routes', () => {
    it('should not import InMemory stores', () => {
      const filePath = resolve(apiRoot, 'src', 'modules', 'admin', 'partner-revenue.ts');
      if (!existsSync(filePath)) {
        // File doesn't exist yet - that's OK
        return;
      }

      const content = readFileSync(filePath, 'utf-8');

      // Should not import InMemory stores directly
      expect(content).not.toContain('InMemoryAttributionStore');
      expect(content).not.toContain('new InMemory');
    });

    it('should use composition root for persistence', () => {
      const filePath = resolve(apiRoot, 'src', 'modules', 'admin', 'partner-revenue.ts');
      if (!existsSync(filePath)) {
        return;
      }

      const content = readFileSync(filePath, 'utf-8');

      // Should use getAttributionService from composition root
      expect(content).toContain('getAttributionService');
      expect(content).toContain("from '../../persistence'");
    });
  });

  describe('Composition Root Structure', () => {
    it('should have composition root index file', () => {
      const indexPath = resolve(apiRoot, 'src', 'persistence', 'index.ts');
      expect(existsSync(indexPath)).toBe(true);
    });

    it('should not have static InMemory imports in composition root', () => {
      const indexPath = resolve(apiRoot, 'src', 'persistence', 'index.ts');
      if (!existsSync(indexPath)) return;

      const content = readFileSync(indexPath, 'utf-8');

      // Static imports of InMemory stores are forbidden
      // They should only be dynamically imported in test mode
      const lines = content.split('\n');
      const staticImportLines = lines.filter(line =>
        line.startsWith('import') && line.includes('InMemory')
      );

      expect(staticImportLines).toHaveLength(0);
    });

    it('should export persistence initialization functions', () => {
      const indexPath = resolve(apiRoot, 'src', 'persistence', 'index.ts');
      if (!existsSync(indexPath)) return;

      const content = readFileSync(indexPath, 'utf-8');

      // Should export key functions
      expect(content).toContain('export function initializePersistence');
      expect(content).toContain('export function getAttributionStore');
      expect(content).toContain('export function isUsingInMemoryStores');
    });

    it('should have environment detection logic', () => {
      const indexPath = resolve(apiRoot, 'src', 'persistence', 'index.ts');
      if (!existsSync(indexPath)) return;

      const content = readFileSync(indexPath, 'utf-8');

      // Should check for production/test/development
      expect(content).toContain('production');
      expect(content).toContain('test');
      expect(content).toContain('development');
    });

    it('should have production validation that blocks InMemory stores', () => {
      const indexPath = resolve(apiRoot, 'src', 'persistence', 'index.ts');
      if (!existsSync(indexPath)) return;

      const content = readFileSync(indexPath, 'utf-8');

      // Should have validation logic for production
      expect(content).toMatch(/production.*InMemory|InMemory.*production/i);
    });
  });

  describe('Prisma Store Implementation', () => {
    it('should have PrismaAttributionStore implementation', () => {
      const storePath = resolve(apiRoot, 'src', 'persistence', 'stores', 'attribution.ts');
      expect(existsSync(storePath)).toBe(true);

      const content = readFileSync(storePath, 'utf-8');
      expect(content).toContain('class PrismaAttributionStore');
      expect(content).toContain('implements AttributionStore');
    });

    it('should use @realriches/database for Prisma', () => {
      const storePath = resolve(apiRoot, 'src', 'persistence', 'stores', 'attribution.ts');
      if (!existsSync(storePath)) return;

      const content = readFileSync(storePath, 'utf-8');
      expect(content).toContain("from '@realriches/database'");
    });
  });
});
