/**
 * Persistence Guard Tests
 *
 * CI safety tests ensuring production bootstrap cannot wire InMemory* stores.
 * These tests use static file analysis to verify code patterns.
 *
 * @see apps/api/src/persistence/index.ts - Composition root
 * @see docs/architecture/persistence.md - Architecture documentation
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

// ESM-compatible __dirname
const currentDir = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(currentDir, '..');

/**
 * Recursively read all TypeScript files in a directory
 */
function readTsFilesRecursively(dir: string): { path: string; content: string }[] {
  const results: { path: string; content: string }[] = [];

  if (!existsSync(dir)) return results;

  const items = readdirSync(dir);
  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);

    if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
      results.push(...readTsFilesRecursively(fullPath));
    } else if (stat.isFile() && item.endsWith('.ts')) {
      results.push({
        path: fullPath,
        content: readFileSync(fullPath, 'utf-8'),
      });
    }
  }

  return results;
}

describe('Persistence Guard - Static Analysis', () => {
  describe('InMemory Store Location Validation', () => {
    it('should not have InMemory class definitions in persistence folder', () => {
      const persistencePath = resolve(apiRoot, 'src', 'persistence');
      const files = readTsFilesRecursively(persistencePath);

      for (const file of files) {
        expect(
          file.content.includes('class InMemory'),
          `Found InMemory class definition in ${file.path}`
        ).toBe(false);
      }
    });

    it('should not have InMemory class definitions in modules folder', () => {
      const modulesPath = resolve(apiRoot, 'src', 'modules');
      const files = readTsFilesRecursively(modulesPath);

      for (const file of files) {
        expect(
          file.content.includes('class InMemory'),
          `Found InMemory class definition in ${file.path}`
        ).toBe(false);
      }
    });

    it('should not have InMemory instantiation in modules folder', () => {
      const modulesPath = resolve(apiRoot, 'src', 'modules');
      const files = readTsFilesRecursively(modulesPath);

      for (const file of files) {
        expect(
          file.content.includes('new InMemory'),
          `Found InMemory instantiation in ${file.path}`
        ).toBe(false);
      }
    });

    it('should not import InMemory stores directly in modules', () => {
      const modulesPath = resolve(apiRoot, 'src', 'modules');
      const files = readTsFilesRecursively(modulesPath);

      for (const file of files) {
        expect(
          file.content.includes('InMemoryAttributionStore'),
          `Found InMemoryAttributionStore import in ${file.path}`
        ).toBe(false);

        expect(
          file.content.includes('InMemoryMeteringService'),
          `Found InMemoryMeteringService import in ${file.path}`
        ).toBe(false);
      }
    });
  });

  describe('Partner Revenue Routes', () => {
    it('should not import InMemory stores', () => {
      const filePath = resolve(apiRoot, 'src', 'modules', 'admin', 'partner-revenue.ts');
      if (!existsSync(filePath)) return;

      const content = readFileSync(filePath, 'utf-8');

      expect(content).not.toContain('InMemoryAttributionStore');
      expect(content).not.toContain('new InMemory');
    });

    it('should use composition root for persistence', () => {
      const filePath = resolve(apiRoot, 'src', 'modules', 'admin', 'partner-revenue.ts');
      if (!existsSync(filePath)) return;

      const content = readFileSync(filePath, 'utf-8');

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

      // Check each import line for InMemory
      const lines = content.split('\n');
      for (const line of lines) {
        if (line.trim().startsWith('import') && line.includes('InMemory')) {
          expect.fail(`Found static InMemory import: ${line.trim()}`);
        }
      }
    });

    it('should export persistence initialization functions', () => {
      const indexPath = resolve(apiRoot, 'src', 'persistence', 'index.ts');
      if (!existsSync(indexPath)) return;

      const content = readFileSync(indexPath, 'utf-8');

      expect(content).toContain('export function initializePersistence');
      expect(content).toContain('export function getAttributionStore');
      expect(content).toContain('export function isUsingInMemoryStores');
    });

    it('should have environment detection logic', () => {
      const indexPath = resolve(apiRoot, 'src', 'persistence', 'index.ts');
      if (!existsSync(indexPath)) return;

      const content = readFileSync(indexPath, 'utf-8');

      expect(content).toContain('production');
      expect(content).toContain('test');
      expect(content).toContain('development');
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
